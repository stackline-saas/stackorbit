import React, { useState, useEffect } from 'react';
import {
  Database,
  Layers,
  Zap,
  Send,
  HardDrive,
  Monitor,
  Workflow,
  Sparkles,
  Check,
  Copy,
  ArrowRight,
  RefreshCw,
  Globe,
  Lock,
} from 'lucide-react';
import type { ServiceTemplate } from '../types/index.ts';

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Database,
  Layers,
  Zap,
  Send,
  HardDrive,
  Monitor,
  Workflow,
  Globe,
};

interface TemplateDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (deployData: {
    templateId: string;
    serviceName: string;
    containerName: string;
    values: Record<string, string>;
    domainName?: string;
  }) => Promise<boolean>;
  mainDomain: string;
}

export const TemplateDeployModal: React.FC<TemplateDeployModalProps> = ({
  isOpen,
  onClose,
  onDeploy,
  mainDomain,
}) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'database' | 'cache_queue' | 'tools_web'>('all');
  const [serviceName, setServiceName] = useState('');
  const [containerName, setContainerName] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [domainName, setDomainName] = useState('');
  const [enableDomain, setEnableDomain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load templates list
  useEffect(() => {
    if (isOpen) {
      fetch('/api/templates', {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setTemplates(data);
          if (data.length > 0 && !selectedTemplate) {
            selectTemplate(data[0]);
          }
        })
        .catch((err) => console.error('Erro ao carregar templates:', err));
    }
  }, [isOpen]);

  const selectTemplate = (template: any) => {
    setSelectedTemplate(template);
    setServiceName(template.name);
    setContainerName(template.defaultContainerName);
    
    // Preenche com os valores padrão dos campos
    const initialValues: Record<string, string> = {};
    for (const f of template.fields) {
      initialValues[f.key] = f.defaultValue;
    }
    setFieldValues(initialValues);

    // Se tiver UI web, sugere subdomínio
    if (template.isWebUI && template.suggestedDomainPrefix) {
      setDomainName(`${template.suggestedDomainPrefix}.${mainDomain || 'bla.com.br'}`);
      setEnableDomain(true);
    } else {
      setDomainName('');
      setEnableDomain(false);
    }
    setError(null);
  };

  if (!isOpen) return null;

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const generateRandomPassword = (key: string) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 16; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleFieldChange(key, pass);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setError(null);

    if (!containerName.trim()) {
      setError('O nome do container é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    const success = await onDeploy({
      templateId: selectedTemplate.id,
      serviceName: serviceName.trim(),
      containerName: containerName.trim(),
      values: fieldValues,
      domainName: enableDomain && domainName.trim() ? domainName.trim() : undefined,
    });
    setIsSubmitting(false);

    if (success) {
      onClose();
    }
  };

  const filteredTemplates = templates.filter((t) =>
    categoryFilter === 'all' ? true : t.category === categoryFilter
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Catálogo de Serviços Prontos (1-Clique)</h3>
              <p className="text-[11px] text-slate-400">
                Instancie bancos de dados, filas e utilitários sem complicação de configuração
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
          {/* Left Column: Template Selection Cards */}
          <div className="w-full md:w-5/12 border-r border-slate-200 p-4 bg-slate-50 overflow-y-auto flex flex-col">
            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg mb-3 shrink-0">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  categoryFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('database')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  categoryFilter === 'database' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bancos
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('cache_queue')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  categoryFilter === 'cache_queue' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Filas/Cache
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('tools_web')}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  categoryFilter === 'tools_web' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Web
              </button>
            </div>

            {/* Template Card List */}
            <div className="space-y-2 flex-1">
              {filteredTemplates.map((t) => {
                const IconComponent = iconMap[t.iconName] || Database;
                const isSelected = selectedTemplate?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-white border-blue-600 shadow-xs ring-1 ring-blue-600'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 truncate">{t.name}</span>
                        {t.isWebUI && (
                          <span className="text-[10px] text-blue-700 bg-blue-50 px-1 rounded font-semibold shrink-0">
                            Web UI
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{t.description}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span>porta :{t.defaultPort}</span>
                        <span>·</span>
                        <span className="truncate">{t.defaultImage}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Template Configuration Form */}
          <div className="w-full md:w-7/12 p-6 flex flex-col justify-between">
            {selectedTemplate ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                      {selectedTemplate.categoryLabel}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-mono text-slate-500">{selectedTemplate.defaultImage}</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">{selectedTemplate.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedTemplate.description}</p>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {error}
                  </div>
                )}

                {/* Base Identifiers */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome do Serviço
                    </label>
                    <input
                      type="text"
                      required
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome do Container
                    </label>
                    <input
                      type="text"
                      required
                      value={containerName}
                      onChange={(e) => setContainerName(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400">Host interno: {containerName}:{selectedTemplate.defaultPort}</span>
                  </div>
                </div>

                {/* Template Specific Fields (User, Password, DB, etc.) */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-800 block">
                    Parâmetros de Autenticação e Configuração
                  </span>

                  {selectedTemplate.fields.map((f: any) => (
                    <div key={f.key}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          {f.label} {f.required && <span className="text-rose-500">*</span>}
                        </label>
                        {f.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => generateRandomPassword(f.key)}
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Gerar Senha Forte</span>
                          </button>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type={f.type === 'password' ? 'text' : f.type}
                          required={f.required}
                          value={fieldValues[f.key] || ''}
                          onChange={(e) => handleFieldChange(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                        />
                        {f.type === 'password' && (
                          <span className="absolute right-3 top-2.5 text-slate-400 text-[10px] font-sans">
                            visível para conferência
                          </span>
                        )}
                      </div>
                      {f.description && <p className="text-[10px] text-slate-400 mt-0.5">{f.description}</p>}
                    </div>
                  ))}
                </div>

                {/* Optional Domain Mapping for Web UI */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableDomain}
                      onChange={(e) => setEnableDomain(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Vincular Domínio no Traefik Agora
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {selectedTemplate.isWebUI
                          ? 'Recomendado para acessar o painel visual pelo navegador via HTTPS Cloudflare'
                          : 'Opcional (bancos de dados geralmente ficam acessíveis apenas internamente pela rede Docker)'}
                      </span>
                    </div>
                  </label>

                  {enableDomain && (
                    <div className="pl-6 pt-1">
                      <div className="relative">
                        <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required={enableDomain}
                          value={domainName}
                          onChange={(e) => setDomainName(e.target.value)}
                          placeholder={`ex: ${selectedTemplate.suggestedDomainPrefix || 'app'}.${mainDomain || 'bla.com.br'}`}
                          className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Roteado para container <code className="font-mono">{containerName}:{selectedTemplate.defaultPort}</code>
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-md border border-slate-200 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Provisionando...' : `Instanciar ${selectedTemplate.name}`}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                Selecione um template ao lado
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
