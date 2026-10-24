import type { Request, Response, NextFunction } from 'express';
import { db, verifyPassword } from './db.ts';
import type { User } from '../types/index.ts';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });
  }

  const user = db.validateSession(token);
  if (!user) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida.' });
  }

  req.user = user;
  next();
}

export function authenticateUser(email: string, password: string): { user: User; token: string } | null {
  const userRecord = db.getUserByEmail(email);
  if (!userRecord) {
    return null;
  }

  const valid = verifyPassword(password, userRecord.passwordHash);
  if (!valid) {
    return null;
  }

  const token = db.createSession(userRecord.id);
  const { passwordHash, ...userClean } = userRecord;
  return { user: userClean, token };
}
