import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import {
  verifyPassword,
  generateToken,
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await logAudit({
        userName: email,
        action: 'LOGIN_FALHOU',
        entityType: 'AUTH',
        details: 'Tentativa de login com usuário inexistente',
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique o e-mail e a senha.' });
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      await logAudit({
        userId: user.id,
        userName: user.email,
        action: 'LOGIN_FALHOU',
        entityType: 'AUTH',
        details: 'Tentativa de login com senha incorreta',
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique o e-mail e a senha.' });
    }

    const token = generateToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'LOGIN_SUCESSO',
      entityType: 'AUTH',
      details: 'Sessão administrativa iniciada com sucesso via JWT',
      ipAddress: req.ip,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro no login: ${err.message}` });
  }
});

router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      userName: req.user.name,
      action: 'LOGOUT',
      entityType: 'AUTH',
      details: 'Sessão encerrada pelo usuário',
      ipAddress: req.ip,
    });
  }
  return res.json({ message: 'Sessão encerrada com sucesso.' });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  return res.json({ user: req.user });
});

export default router;
