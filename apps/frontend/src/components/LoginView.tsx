import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, ArrowRight, Server, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { StackOrbitLogo } from './common/StackOrbitLogo';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@bla.com.br');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await login(email, password);
    if (!res.success) {
      setError(res.error || 'Credenciais inválidas.');
    } else {
      navigate('/dashboard');
    }
    setIsSubmitting(false);
  };

  const handleUseDemoCredentials = () => {
    setEmail('admin@bla.com.br');
    setPassword('admin123');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top brand banner */}
        <div className="bg-slate-950 p-6 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <StackOrbitLogo size={40} />
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Stack<span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">Orbit</span>
              </h1>
              <p className="text-xs text-slate-400">Roteamento Traefik + Cloudflare Origin</p>
            </div>
          </div>
        </div>

        {/* Login Form */}
        <div className="p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900">Acesso Administrativo</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Informe suas credenciais para gerenciar containers e domínios.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <span className="font-bold">✕</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail do Administrador</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@bla.com.br"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2 shadow-sm"
            >
              <span>{isSubmitting ? 'Autenticando...' : 'Entrar no Painel'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Seed Card */}
          <div className="mt-6 pt-5 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 p-6">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                Credenciais Padrão (Seed)
              </span>
              <button
                type="button"
                onClick={handleUseDemoCredentials}
                className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
              >
                Preencher
              </button>
            </div>
            <div className="text-[11px] font-mono text-slate-600 bg-white p-2.5 rounded border border-slate-200 space-y-1">
              <div>E-mail: <span className="font-semibold text-slate-900">admin@bla.com.br</span></div>
              <div>Senha: <span className="font-semibold text-slate-900">admin123</span></div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Sessão segura com hash PBKDF2 e tokens de auditoria</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
