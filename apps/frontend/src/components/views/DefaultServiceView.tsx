import React, { useState } from 'react';
import {
  Compass,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Search,
} from 'lucide-react';
import type { Service, Domain } from '../../types/index.ts';

interface DefaultServiceViewProps {
  services: Service[];
  domains: Domain[];
  onSetDefault: (serviceId: string | null) => Promise<boolean>;
  isLoading: boolean;
}

export const DefaultServiceView: React.FC<DefaultServiceViewProps> = ({
  services,
  domains,
  onSetDefault,
  isLoading,
}) => {
  const defaultService = services.find((s) => s.isDefault);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(defaultService?.id || '');
  const [isSaving, setIsSaving] = useState(false);

  // Simulation test state
  const [simulatedDomain, setSimulatedDomain] = useState('qualquer-coisa.meudominio.com.br');

  const handleSave = async () => {
    setIsSaving(true);
    await onSetDefault(selectedServiceId || null);
    setIsSaving(false);
  };

  const handleRemove = async () => {
    setIsSaving(true);
    await onSetDefault(null);
    setSelectedServiceId('');
    setIsSaving(false);
  };

  // Simulate routing resolution
  const cleanSim = simulatedDomain.trim().toLowerCase();
  const directMatch = domains.find((d) => d.isActive && d.domainName.toLowerCase() === cleanSim);
  const simulatedDestination = directMatch
    ? {
        type: 'DIRECT_MATCH',
        rule: `Host(\`${directMatch.domainName}\`)`,
        priority: 100,
        service: directMatch.service || services.find((s) => s.id === directMatch.serviceId),
      }
    : defaultService
    ? {
        type: 'DEFAULT_FALLBACK',
        rule: 'HostRegexp(`{host:.+}`)',
        priority: 1,
        service: defaultService,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Warning banner if none configured */}
      {!defaultService ? (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">Nenhum Serviço Padrão Configurado</h4>
            <p className="text-xs text-amber-800 mt-0.5">
              Qualquer requisição com cabeçalho Host que não coincida com os domínios específicos cadastrados
              retornará erro <code className="font-mono font-bold">404 Not Found</code> do Traefik.
              Recomenda-se selecionar um container para responder pelo tráfego geral.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">Serviço Padrão Ativo: {defaultService.name}</h4>
            <p className="text-xs text-emerald-800 mt-0.5">
              O Traefik encaminha requisições de domínios desconhecidos para o container{' '}
              <code className="font-mono font-bold">{defaultService.containerName}:{defaultService.internalPort}</code>{' '}
              usando a regra com menor prioridade <code className="font-mono font-bold">HostRegexp(`{'{host:.+}'}`)</code> (Prioridade 1).
            </p>
          </div>
        </div>
      )}

      {/* Main Configuration Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <div className="flex items-center gap-2 mb-4">
          <Compass className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Configurar Container Padrão de Fallback</h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-6">
          Selecione qual container Docker deve receber o tráfego quando o domínio acessado não possuir
          nenhuma regra específica cadastrada no painel. O Traefik aplicará automaticamente a regra
          de captura global com prioridade mínima.
        </p>

        <div className="max-w-xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Selecione o Serviço Padrão
            </label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Nenhum serviço padrão (desativar fallback) --</option>
              {services.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name} (Container: {svc.containerName}:{svc.internalPort})
                  {svc.isDefault ? ' [Atual]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : 'Salvar Serviço Padrão'}
            </button>

            {defaultService && (
              <button
                onClick={handleRemove}
                disabled={isSaving}
                className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-md text-xs font-semibold transition-colors"
              >
                Remover Serviço Padrão
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Traefik Rule Mechanism Explanation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5">
          <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-slate-500" />
            Como Funciona o Roteamento no Traefik?
          </h4>
          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <p>
              1. <strong>Domínios Cadastrados</strong>: Possuem regras como{' '}
              <code className="font-mono text-slate-800">Host(`api.bla.com.br`)</code> com{' '}
              <strong>prioridade 100</strong>.
            </p>
            <p>
              2. <strong>Serviço Padrão</strong>: Possui a regra catch-all regex{' '}
              <code className="font-mono text-slate-800">HostRegexp(`{'{host:.+}'}`)</code> com{' '}
              <strong>prioridade 1</strong>.
            </p>
            <p>
              3. O Traefik sempre testa primeiro as regras de maior prioridade. Portanto, requisições
              para domínios específicos nunca são interceptadas pelo serviço padrão.
            </p>
          </div>
        </div>

        {/* Interactive Domain Simulator */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-blue-600" />
              Simulador Interativo de Roteamento
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              Digite qualquer domínio para testar qual container receberá o tráfego:
            </p>

            <input
              type="text"
              value={simulatedDomain}
              onChange={(e) => setSimulatedDomain(e.target.value)}
              placeholder="ex: painel.bla.com.br ou qualquer-coisa.com"
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 text-slate-900 mb-3"
            />

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-slate-500">Resultado do Traefik:</span>
                {simulatedDestination?.type === 'DIRECT_MATCH' ? (
                  <span className="text-xs font-semibold text-emerald-700">Correspondência Direta</span>
                ) : simulatedDestination?.type === 'DEFAULT_FALLBACK' ? (
                  <span className="text-xs font-semibold text-indigo-700">Serviço Padrão (Catch-All)</span>
                ) : (
                  <span className="text-xs font-semibold text-rose-700">404 Não Encontrado</span>
                )}
              </div>

              {simulatedDestination ? (
                <div className="space-y-1 font-mono text-[11px] text-slate-700">
                  <div>Regra ativa: <span className="font-bold">{simulatedDestination.rule}</span></div>
                  <div>Prioridade: <span className="font-bold">{simulatedDestination.priority}</span></div>
                  <div>
                    Container Destino:{' '}
                    <span className="text-blue-600 font-bold">
                      {simulatedDestination.service?.containerName}:{simulatedDestination.service?.internalPort}
                    </span>{' '}
                    ({simulatedDestination.service?.name})
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-rose-600">
                  Nenhum serviço receberá este domínio. Configure um serviço padrão acima para capturar.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
