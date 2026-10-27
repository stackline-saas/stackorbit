import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Code,
  Layout,
  ShoppingBag,
  Sparkles,
  Check,
  RefreshCw,
  Database,
  Lock,
  ArrowRight,
  AlertCircle,
  Key,
} from 'lucide-react';
import type { ServiceTemplate } from '../types/index.ts';

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (site: any) => void;
  mainDomain?: string;
  projectId?: string | null;
}

export const CreateSiteModal: React.FC<CreateSiteModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  mainDomain = 'bla.com.br',
  projectId,
}) => {
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('static-site');
  const [siteName, setSiteName] = useState('');
  const [domainName, setDomainName] = useState('');
  const [enableDomain, setEnableDomain] = useState(true);
  const [sftpPassword, setSftpPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega templates de sites da API
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch('/api/templates', {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      })
        .then((res) => res.json())
        .then((data: ServiceTemplate[]) => {
          const siteTemplates = data.filter(
            (t) =>
              t.category === 'sites_cms' ||
              t.id === 'static-site' ||
              t.id === 'php-site' ||
              t.id === 'wordpress' ||
              t.id === 'ecommerce-prestashop'
          );
          setTemplates(siteTemplates);
          if (siteTemplates.length > 0) {
            setSelectedTemplateId(siteTemplates[0].id);
          }
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));

      // Gera senha forte inicial para o SFTP
      setSftpPassword(`Sftp@${Math.random().toString(36).slice(2, 8).toUpperCase()}!2026`);
    }
  }, [isOpen]);

  // Atualiza sugestão de domínio ao selecionar template ou digitar nome
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleNameChange = (val: string) => {
    setSiteName(val);
    const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (slug) {
      setDomainName(`${slug}.${mainDomain}`);
    } else if (selectedTemplate?.suggestedDomainPrefix) {
      setDomainName(`${selectedTemplate.suggestedDomainPrefix}.${mainDomain}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim()) {
      setError('Por favor, informe o nome do site.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          name: siteName.trim(),
          domainName: enableDomain ? domainName.trim() : undefined,
          projectId,
          sftpPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar site.');
      }

      onCreated(data.service || data);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Criar Novo Site Web</h2>
              <p className="text-xs text-slate-500">
                Selecione o tipo de site, configure o domínio e gerencie arquivos via Web e SFTP.
              </p>
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

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Escolha do Template */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2.5">
              1. Selecione o Tipo de Site
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map((tpl) => {
                const isSelected = tpl.id === selectedTemplateId;
                const isWpOrStore = tpl.id === 'wordpress' || tpl.id === 'ecommerce-prestashop';

                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplateId(tpl.id);
                      if (siteName) handleNameChange(siteName);
                    }}
                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/30 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-900 text-xs">{tpl.name}</span>
                        {isWpOrStore && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1">
                            <Database className="w-2.5 h-2.5" /> +MariaDB
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Porta :{tpl.defaultPort}</span>
                      {isSelected ? (
                        <span className="text-blue-600 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Selecionado
                        </span>
                      ) : (
                        <span className="hover:text-slate-600">Escolher</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Informações do Site */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                2. Nome do Site <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={siteName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex: Meu Blog Pessoal, Loja Virtual, Landing Page"
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            {/* Domínio & Traefik */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  3. Domínio / Subdomínio Público
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableDomain}
                    onChange={(e) => setEnableDomain(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Habilitar Domínio com SSL</span>
                </label>
              </div>

              {enableDomain && (
                <div className="relative">
                  <input
                    type="text"
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                    placeholder={`meusite.${mainDomain}`}
                    className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <div className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>O Traefik v3 configurará o certificado SSL Cloudflare Full (strict) automaticamente.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Credenciais SFTP */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                4. Senha do Acesso SFTP / FTP
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={sftpPassword}
                    onChange={(e) => setSftpPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSftpPassword(`Sftp@${Math.random().toString(36).slice(2, 8).toUpperCase()}!2026`)
                  }
                  className="px-3 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Gerar Nova
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Permite enviar e baixar arquivos remotamente pelo FileZilla, Cyberduck ou WinSCP na porta :2222.
              </p>
            </div>
          </div>

          {/* Dica do Banco de Dados Automático */}
          {(selectedTemplateId === 'wordpress' || selectedTemplateId === 'ecommerce-prestashop') && (
            <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
              <Database className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-900 mb-0.5">Banco MariaDB Automatizado</p>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Uma instância dedicada de MariaDB 11 será criada e vinculada na mesma rede interna Docker. As credenciais de conexão são injetadas automaticamente, deixando a aplicação pronta para uso imediato.
                </p>
              </div>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !siteName.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Provisionando Site...</span>
                </>
              ) : (
                <>
                  <span>Criar Site Web</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
