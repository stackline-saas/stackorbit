import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Globe,
  Server,
  Lock,
  ExternalLink,
  CheckCircle,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useNotification } from '../../context/NotificationContext.tsx';

interface CloudflareViewProps {
  projectId?: string | null;
  projectName?: string;
}

export const CloudflareView: React.FC<CloudflareViewProps> = ({ projectId, projectName }) => {
  const { showNotification } = useNotification();
  const [data, setData] = useState<any>(null);
  const [mainDomain, setMainDomain] = useState('bla.com.br');
  const [originServerIp, setOriginServerIp] = useState('198.51.100.25');
  const [originHttpsPort, setOriginHttpsPort] = useState(443);
  const [sslMode, setSslMode] = useState('Full (strict)');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadCloudflareData = async () => {
    try {
      const url = projectId
        ? `/api/cloudflare?projectId=${encodeURIComponent(projectId)}`
        : '/api/cloudflare';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setMainDomain(json.mainDomain);
        setOriginServerIp(json.originServerIp);
        setOriginHttpsPort(json.originHttpsPort);
        setSslMode(json.cloudflareSslMode || json.connectionMode || 'Full (strict)');
      }
    } catch (err) {
      console.error('Falha ao carregar configurações do Cloudflare:', err);
    }
  };

  useEffect(() => {
    loadCloudflareData();
  }, [projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/cloudflare', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          projectId: projectId || undefined,
          mainDomain,
          originServerIp,
          originHttpsPort,
          cloudflareSslMode: sslMode,
        }),
      });
      if (res.ok) {
        showNotification(
          'success',
          'Configurações Salvas',
          projectName
            ? `Parâmetros do Cloudflare salvos para o projeto "${projectName}".`
            : 'Parâmetros do Cloudflare e servidor de origem atualizados.'
        );
      } else {
        showNotification('error', 'Erro', 'Falha ao salvar configurações.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro de Conexão', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Informative Header Banner */}
      <div className="p-5 rounded-lg bg-gradient-to-r from-amber-500/10 via-blue-500/10 to-indigo-500/10 border border-blue-200/80 bg-white shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Arquitetura HTTPS: Cloudflare Proxy + Origin CA
              </h3>
              {projectName && (
                <span className="text-[11px] font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  Projeto: {projectName}
                </span>
              )}
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Modo: Full (strict)
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              O certificado público é gerenciado 100% pelo Cloudflare na borda.
              Não há necessidade de Let’s Encrypt ou desafios ACME na máquina de origem.
              A comunicação entre o Cloudflare e este servidor Traefik ocorre através de uma conexão HTTPS
              criptografada com o <strong>Cloudflare Origin Certificate</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Visual Flow Representation */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <h4 className="text-xs font-bold text-slate-900 mb-4">Fluxo de Conexão Criptografada Ponta a Ponta</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          {/* Step 1: Client */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center">
            <Globe className="w-6 h-6 text-slate-600 mb-2" />
            <span className="text-xs font-bold text-slate-800">1. Navegador do Usuário</span>
            <span className="text-[11px] text-slate-500 mt-1">Acessa https://api.bla.com.br</span>
            <div className="mt-2 text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>TLS 1.3 Público (Cloudflare)</span>
            </div>
          </div>

          {/* Step 2: Cloudflare Edge */}
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex flex-col items-center">
            <ShieldCheck className="w-6 h-6 text-amber-600 mb-2" />
            <span className="text-xs font-bold text-slate-900">2. Borda Cloudflare (Proxy Laranja)</span>
            <span className="text-[11px] text-slate-600 mt-1">Encapsula e valida requisição</span>
            <div className="mt-2 text-[10px] text-amber-800 font-semibold">
              Valida Origin CA em Full (strict)
            </div>
          </div>

          {/* Step 3: Origin Traefik */}
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 flex flex-col items-center">
            <Server className="w-6 h-6 text-blue-600 mb-2" />
            <span className="text-xs font-bold text-slate-900">3. Traefik + Containers Docker</span>
            <span className="text-[11px] text-slate-600 mt-1">Escuta na porta 443 com Origin Cert</span>
            <div className="mt-2 text-[10px] text-blue-700 font-semibold">
              Encaminha para container interno
            </div>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <h4 className="text-xs font-bold text-slate-900 mb-4">Parâmetros de Origem</h4>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Domínio Raiz Principal</label>
            <input
              type="text"
              required
              value={mainDomain}
              onChange={(e) => setMainDomain(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <span className="text-[10px] text-slate-400">Exemplo: bla.com.br</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Endereço IP do Servidor de Origem
            </label>
            <input
              type="text"
              required
              value={originServerIp}
              onChange={(e) => setOriginServerIp(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <span className="text-[10px] text-slate-400">IP público onde o Traefik está exposto</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Porta HTTPS de Origem</label>
            <input
              type="number"
              required
              value={originHttpsPort}
              onChange={(e) => setOriginHttpsPort(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <span className="text-[10px] text-slate-400">Padrão: 443</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Modo de Conexão SSL Cloudflare</label>
            <select
              value={sslMode}
              onChange={(e) => setSslMode(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Full (strict)">Full (strict) [Recomendado e Obrigatório]</option>
              <option value="Full">Full</option>
              <option value="Flexible">Flexible (Não recomendado)</option>
            </select>
            <span className="text-[10px] text-slate-400">Exige certificado Origin CA assinado pelo Cloudflare</span>
          </div>

          <div className="md:col-span-2 pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : 'Salvar Configurações de Origem'}
            </button>
          </div>
        </form>
      </div>

      {/* Origin Certificate Instructions Guide */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          Passo a Passo: Como Configurar o Certificado de Origem no Cloudflare
        </h4>

        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-900 block mb-1">Passo 1: Gerar o Certificado no Cloudflare</span>
            <p>
              Acesse o painel do Cloudflare no seu domínio &gt; <strong>SSL/TLS</strong> &gt;{' '}
              <strong>Origin Server</strong> &gt; Clique em <strong>Create Certificate</strong>.
              Inclua o domínio raiz <code className="font-mono">{mainDomain}</code> e o wildcard{' '}
              <code className="font-mono">*.{mainDomain}</code>. Validade recomendada: 15 anos.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-900 block mb-1">Passo 2: Salvar os arquivos no Traefik</span>
            <p>
              Copie o Certificado e a Chave Privada gerados pelo Cloudflare para os arquivos:
            </p>
            <div className="mt-2 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                <span>/etc/traefik/certs/origin.pem</span>
                <button
                  onClick={() => copyToClipboard('/etc/traefik/certs/origin.pem', 'cert')}
                  className="text-blue-600 hover:text-blue-800 text-[10px] font-sans font-semibold"
                >
                  {copiedKey === 'cert' ? 'Copiado' : 'Copiar Caminho'}
                </button>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                <span>/etc/traefik/certs/origin.key</span>
                <button
                  onClick={() => copyToClipboard('/etc/traefik/certs/origin.key', 'key')}
                  className="text-blue-600 hover:text-blue-800 text-[10px] font-sans font-semibold"
                >
                  {copiedKey === 'key' ? 'Copiado' : 'Copiar Caminho'}
                </button>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="font-bold text-slate-900 block mb-1">Passo 3: Ativar o Modo Full (strict)</span>
            <p>
              No painel Cloudflare &gt; <strong>SSL/TLS</strong> &gt; selecione o modo{' '}
              <strong>Full (strict)</strong>. Agora o Cloudflare verificará a assinatura do Origin CA em todas as conexões
              ao servidor de origem!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
