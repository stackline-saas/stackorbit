import React, { useState } from 'react';
import {
  Plus,
  Search,
  Globe,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Shield,
  ArrowRight,
  HelpCircle,
  Copy,
  Check,
  Server,
  Network,
  Share2,
  Lock,
  ChevronRight,
  X,
  FileText,
} from 'lucide-react';
import type { Domain, Service } from '../../types/index.ts';

interface DomainsViewProps {
  domains: Domain[];
  services: Service[];
  mainDomain?: string;
  onOpenCreate: () => void;
  onOpenEdit: (domain: Domain) => void;
  onDelete: (domain: Domain) => void;
  onToggleActive: (domain: Domain) => void;
  isLoading: boolean;
}

export const DomainsView: React.FC<DomainsViewProps> = ({
  domains,
  services,
  mainDomain = 'bla.com.br',
  onOpenCreate,
  onOpenEdit,
  onDelete,
  onToggleActive,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState<string>('all');
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [selectedDomainForInstructions, setSelectedDomainForInstructions] = useState<Domain | null>(null);

  // Custom client instructions state
  const [clientSubdomainInput, setClientSubdomainInput] = useState('app.cliente.com.br');
  const [clientVpsIp, setClientVpsIp] = useState('203.0.113.10');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(id);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const filtered = domains.filter((d) => {
    const matchesSearch =
      d.domainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.service?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.service?.containerName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesService = filterService === 'all' ? true : d.serviceId === filterService;
    return matchesSearch && matchesService;
  });

  const generateClientMessage = (domainName: string, serviceTarget: string) => {
    const isSubdomain = domainName.split('.').length > 2 && !domainName.startsWith('www.');
    const hostPart = isSubdomain ? domainName.split('.')[0] : '@';

    return `Olá! Seguem as instruções para conectar o seu domínio (${domainName}) ao nosso servidor:

1️⃣ Acesse o painel onde você gerencia o seu domínio (ex: Registro.br, Cloudflare, GoDaddy, Hostinger).
2️⃣ Vá até a seção "Zona DNS" ou "Gerenciar DNS".
3️⃣ Adicione o seguinte registro:
   - Tipo: ${isSubdomain ? 'CNAME' : 'A'}
   - Nome / Host: ${hostPart}
   - Destino / Valor: ${isSubdomain ? mainDomain : clientVpsIp}
   - TTL: Automático (ou 14400)

Assim que você salvar, o apontamento costuma propagar em alguns minutos (até 2 horas dependendo do provedor). Nosso servidor Traefik já está com o roteamento pronto para atender seu domínio!`;
  };

  return (
    <div className="space-y-5">
      {/* Top Bar with Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por domínio ou serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <select
            value={filterService}
            onChange={(e) => setFilterService(e.target.value)}
            className="px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-700 shrink-0"
          >
            <option value="all">Todos os serviços</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setGuideModalOpen(true)}
            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-indigo-600" />
            <span>Como Outras Pessoas Apontam o Domínio?</span>
          </button>

          <button
            onClick={onOpenCreate}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Domínio</span>
          </button>
        </div>
      </div>

      {/* Info Banner: Traefik & Custom Domains */}
      <div className="p-3.5 rounded-lg bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 text-xs text-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start md:items-center gap-2.5">
          <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 md:mt-0" />
          <span>
            <strong>Roteamento Dinâmico Traefik:</strong> Cada domínio cadastrado gera imediatamente a regra{' '}
            <code className="font-mono font-semibold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-800">
              Host(`[dominio]`)
            </code>{' '}
            sem reiniciar containers. Domínios externos de clientes também são cadastrados aqui!
          </span>
        </div>
        <button
          onClick={() => setGuideModalOpen(true)}
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs flex items-center gap-1 shrink-0 self-end md:self-auto"
        >
          <span>Ver guia de apontamento DNS</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Domains Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-3">Domínio (FQDN)</th>
                <th className="px-4 py-3">Serviço Associado</th>
                <th className="px-4 py-3">Container de Destino</th>
                <th className="px-4 py-3">Regra Traefik</th>
                <th className="px-4 py-3">Status do Roteamento</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((d) => {
                  const targetSvc = d.service || services.find((s) => s.id === d.serviceId);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Domain Name */}
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900 font-mono text-xs flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{d.domainName}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-sans">
                          Criado em: {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </td>

                      {/* Associated Service */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {targetSvc ? targetSvc.name : <span className="text-rose-600 font-bold">Serviço inexistente</span>}
                        </div>
                        {targetSvc?.isDefault && (
                          <span className="text-[10px] text-indigo-600 font-semibold">
                            (Também é o Serviço Padrão)
                          </span>
                        )}
                      </td>

                      {/* Destination Container & Port */}
                      <td className="px-4 py-3">
                        {targetSvc ? (
                          <div className="font-mono text-slate-800">
                            <span className="font-bold text-emerald-700">{d.targetContainer || targetSvc.containerName}</span>
                            <span className="text-slate-500">:{d.targetPort || targetSvc.internalPort}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Traefik Rule */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                        Host(`{d.domainName}`)
                      </td>

                      {/* Active Status */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onToggleActive(d)}
                          className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors ${
                            d.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {d.isActive ? 'Ativo' : 'Desativado'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedDomainForInstructions(d)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                            title="Ver instruções de apontamento DNS deste domínio para enviar ao cliente"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenEdit(d)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Editar Domínio"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(d)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                            title="Remover Domínio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    Nenhum domínio cadastrado ou encontrado com os filtros informados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: GUIA COMPLETO DE APONTAMENTO PARA CLIENTES / OUTRAS PESSOAS */}
      {/* ===================================================================== */}
      {guideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold">Como outras pessoas apontam o domínio delas para o seu servidor?</h3>
                  <p className="text-[11px] text-slate-300">
                    Guia prático para domínios de clientes, parceiros ou multi-tenant (White-label)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGuideModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
              {/* Onde você configura no painel */}
              <div className="p-4 rounded-lg bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs">
                    1
                  </span>
                  <span>Onde você configura no nosso painel?</span>
                </div>
                <p className="text-blue-950 leading-relaxed pl-7">
                  Aqui mesmo nesta tela! Basta clicar no botão azul <strong>"Cadastrar Domínio"</strong> no topo:
                </p>
                <ol className="list-disc list-inside space-y-1 text-slate-800 pl-7">
                  <li>
                    <strong>Nome do Domínio:</strong> Digite o domínio exato da outra pessoa (ex:{' '}
                    <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200 font-semibold text-blue-800">
                      app.cliente.com.br
                    </code>{' '}
                    ou{' '}
                    <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-blue-200 font-semibold text-blue-800">
                      cliente.com.br
                    </code>
                    ).
                  </li>
                  <li>
                    <strong>Serviço de Destino:</strong> Selecione qual container Docker vai responder às requisições dela.
                  </li>
                  <li>
                    <strong>Salvar:</strong> O Traefik cria a regra{' '}
                    <code className="font-mono text-indigo-700 font-semibold">Host(`app.cliente.com.br`)</code>{' '}
                    imediatamente, sem derrubar nenhum container!
                  </li>
                </ol>
                <div className="mt-2 pl-7 text-[11px] text-blue-800 bg-white p-2.5 rounded border border-blue-100">
                  ⚡ <strong>Dica Multi-Tenant (SaaS):</strong> Se o seu sistema identifica o cliente automaticamente pelo
                  domínio (ex: um único container que serve vários clientes), você pode usar a aba{' '}
                  <strong>"Serviço Padrão"</strong>! Qualquer domínio que apontar pro seu servidor e não estiver cadastrado
                  cairá automaticamente nele.
                </div>
              </div>

              {/* O que a outra pessoa precisa configurar no DNS dela */}
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-xs">
                    2
                  </span>
                  <span>O que a outra pessoa configura no provedor de DNS dela?</span>
                </div>
                <p className="leading-relaxed pl-7 text-slate-600">
                  O cliente acessa o painel de registro dele (Registro.br, GoDaddy, Hostinger, Cloudflare, etc.) e cria{' '}
                  <strong>um</strong> dos registros abaixo:
                </p>

                {/* Opção A: CNAME (Recomendada para subdomínios) */}
                <div className="pl-7 space-y-2">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                          RECOMENDADO
                        </span>
                        Opção A: Se o cliente quiser usar um subdomínio (ex: app.cliente.com.br)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] mt-2">
                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-sans">Tipo</span>
                        <strong className="text-blue-700">CNAME</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-sans">Nome / Host</span>
                        <strong className="text-slate-800">app</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">Destino / Valor</span>
                          <strong className="text-emerald-700">{mainDomain}</strong>
                        </div>
                        <button
                          onClick={() => handleCopy(mainDomain, 'cname-main')}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          title="Copiar destino"
                        >
                          {copiedType === 'cname-main' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Opção B: Tipo A (Para domínio raiz) */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 text-xs">
                      Opção B: Se o cliente quiser usar o domínio raiz (ex: cliente.com.br)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] mt-2">
                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-sans">Tipo</span>
                        <strong className="text-blue-700">A</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-sans">Nome / Host</span>
                        <strong className="text-slate-800">@ (ou em branco)</strong>
                      </div>
                      <div className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">Destino / IP da VPS</span>
                          <input
                            type="text"
                            value={clientVpsIp}
                            onChange={(e) => setClientVpsIp(e.target.value)}
                            className="text-emerald-700 font-bold bg-transparent outline-none w-28"
                          />
                        </div>
                        <button
                          onClick={() => handleCopy(clientVpsIp, 'ip-main')}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded"
                          title="Copiar IP"
                        >
                          {copiedType === 'ip-main' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Como fica o SSL / HTTPS para o cliente? */}
              <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>Como fica o Certificado SSL (Cadeado HTTPS) para o domínio do cliente?</span>
                </div>
                <p className="text-amber-950 leading-relaxed text-[11px]">
                  O seu certificado da Cloudflare (Origin CA) protege exclusivamente os seus domínios (
                  <code className="font-mono font-semibold">*.{mainDomain}</code>). Para domínios de outras pessoas:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="p-2.5 bg-white rounded border border-amber-200 text-slate-800">
                    <strong className="text-slate-900 block mb-1">Cenário 1: O cliente também usa Cloudflare</strong>
                    <p className="text-slate-600">
                      O cliente aponta o CNAME ou Tipo A para você e ativa a <strong>nuvenzinha laranja (Proxy)</strong> no
                      Cloudflare dele. O SSL é emitido gratuitamente e automaticamente pela própria Cloudflare dele.
                    </p>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-amber-200 text-slate-800">
                    <strong className="text-slate-900 block mb-1">Cenário 2: O cliente usa DNS comum (Registro.br, etc.)</strong>
                    <p className="text-slate-600">
                      O Traefik pode responder via <strong>Let's Encrypt / ACME automático</strong> pela porta 80/443, emitindo o
                      certificado SSL gratuito em tempo real assim que o cliente abre o site!
                    </p>
                  </div>
                </div>
              </div>

              {/* Gerador de Mensagem Pronta para Enviar para o Cliente */}
              <div className="p-4 rounded-lg bg-indigo-50/60 border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-indigo-950 text-sm">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Mensagem pronta para enviar ao seu cliente (WhatsApp ou E-mail)</span>
                  </div>
                  <button
                    onClick={() => handleCopy(generateClientMessage(clientSubdomainInput, 'nosso servidor'), 'whatsapp-msg')}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    {copiedType === 'whatsapp-msg' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'whatsapp-msg' ? 'Copiado!' : 'Copiar Mensagem Pronta'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-indigo-900 shrink-0">Domínio do Cliente:</label>
                  <input
                    type="text"
                    value={clientSubdomainInput}
                    onChange={(e) => setClientSubdomainInput(e.target.value)}
                    placeholder="ex: app.cliente.com.br"
                    className="px-2 py-1 text-xs rounded border border-indigo-200 bg-white font-mono flex-1 text-slate-800"
                  />
                </div>

                <pre className="p-3 bg-white rounded border border-indigo-200 text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {generateClientMessage(clientSubdomainInput, 'nosso servidor')}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                onClick={() => setGuideModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-semibold transition-colors"
              >
                Entendi, Fechar Guia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: INSTRUÇÕES ESPECÍFICAS DE UM DOMÍNIO JÁ CADASTRADO */}
      {/* ===================================================================== */}
      {selectedDomainForInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">Apontamento DNS: {selectedDomainForInstructions.domainName}</h3>
              </div>
              <button
                onClick={() => setSelectedDomainForInstructions(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Para que o domínio <strong className="text-slate-900">{selectedDomainForInstructions.domainName}</strong> chegue
                ao container associado, adicione o registro DNS abaixo no gerenciador do domínio:
              </p>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Registro DNS Necessário:</span>
                  <button
                    onClick={() =>
                      handleCopy(
                        generateClientMessage(
                          selectedDomainForInstructions.domainName,
                          selectedDomainForInstructions.service?.name || 'Serviço'
                        ),
                        'copy-single'
                      )
                    }
                    className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1"
                  >
                    {copiedType === 'copy-single' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'copy-single' ? 'Copiado!' : 'Copiar Instrução Completa'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                  <div className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-sans">Tipo</span>
                    <strong className="text-blue-700">
                      {selectedDomainForInstructions.domainName.split('.').length > 2 ? 'CNAME' : 'A'}
                    </strong>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-sans">Nome</span>
                    <strong className="text-slate-800">
                      {selectedDomainForInstructions.domainName.split('.').length > 2
                        ? selectedDomainForInstructions.domainName.split('.')[0]
                        : '@'}
                    </strong>
                  </div>
                  <div className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-sans">Valor</span>
                    <strong className="text-emerald-700">
                      {selectedDomainForInstructions.domainName.split('.').length > 2 ? mainDomain : clientVpsIp}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-blue-900 space-y-1">
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Configuração no Traefik Concluída</span>
                </div>
                <p className="text-[11px] text-blue-800">
                  O Traefik já está escutando por requisições de{' '}
                  <code className="font-mono font-semibold">Host(`{selectedDomainForInstructions.domainName}`)</code>. Assim que
                  o DNS propagar, o acesso será imediato.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedDomainForInstructions(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
