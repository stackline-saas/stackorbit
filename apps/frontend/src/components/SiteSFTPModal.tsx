import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Server,
  Folder,
  ShieldCheck,
  Download,
} from 'lucide-react';
import type { SiteSFTPCredentials } from '../types/index.ts';

interface SiteSFTPModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string;
  serviceName: string;
}

export const SiteSFTPModal: React.FC<SiteSFTPModalProps> = ({
  isOpen,
  onClose,
  serviceId,
  serviceName,
}) => {
  const [credentials, setCredentials] = useState<SiteSFTPCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (isOpen && serviceId) {
      setIsLoading(true);
      fetch(`/api/sites/${serviceId}/sftp`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setCredentials(data);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    }
  }, [isOpen, serviceId]);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleResetPassword = async () => {
    if (!window.confirm('Deseja realmente gerar uma nova senha de SFTP para este site?')) return;
    setIsResetting(true);

    try {
      const res = await fetch(`/api/sites/${serviceId}/sftp/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCredentials((prev: SiteSFTPCredentials | null) => (prev ? { ...prev, password: data.password, connectionString: data.connectionString } : null));
      }
    } finally {
      setIsResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Acesso SFTP / FTP</h2>
              <p className="text-xs text-slate-500 font-mono truncate max-w-xs">{serviceName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
              <span className="text-xs">Carregando credenciais SFTP...</span>
            </div>
          ) : credentials ? (
            <>
              {/* Host & Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Host / Servidor</label>
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
                    <span className="truncate">{credentials.host}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(credentials.host, 'host')}
                      className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {copiedField === 'host' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Porta</label>
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-purple-700">
                    <span>{credentials.port}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(String(credentials.port), 'port')}
                      className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {copiedField === 'port' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Usuário (Username)</label>
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
                  <span className="font-semibold text-slate-900">{credentials.username}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(credentials.username, 'user')}
                    className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {copiedField === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Senha (Password)</label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isResetting}
                    className="text-[11px] text-purple-600 hover:text-purple-800 font-bold transition-colors"
                  >
                    {isResetting ? 'Gerando...' : 'Redefinir Senha'}
                  </button>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
                  <span>{showPassword ? credentials.password : '••••••••••••••••••••'}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(credentials.password || '', 'pass')}
                      className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {copiedField === 'pass' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* URL FileZilla / WinSCP */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  Link de Conexão Rápida (FileZilla / WinSCP)
                </label>
                <div className="flex items-center justify-between px-3 py-2 bg-purple-50/50 border border-purple-200/60 rounded-xl text-xs font-mono text-purple-900">
                  <span className="truncate pr-2">{credentials.connectionString}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(credentials.connectionString, 'full')}
                    className="p-1 text-purple-600 hover:text-purple-900 transition-colors shrink-0"
                    title="Copiar link SFTP"
                  >
                    {copiedField === 'full' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Dica */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  No FileZilla ou Cyberduck, utilize o protocolo <b>SFTP - SSH File Transfer Protocol</b> com as credenciais acima. Os arquivos enviados ficarão disponíveis instantaneamente no site.
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-red-500">Credenciais não encontradas para este site.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
