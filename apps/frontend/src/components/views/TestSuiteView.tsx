import React, { useState } from 'react';
import {
  CheckSquare,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { TestResult } from '../../types/index.ts';

export const TestSuiteView: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<{ passed: number; failed: number } | null>(null);

  const runTests = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/test-suite/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setSummary({ passed: data.passedCount, failed: data.failedCount });
        setLastRunTime(new Date().toLocaleTimeString('pt-BR'));
      }
    } catch (err) {
      console.error('Falha ao executar bateria de testes:', err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Runner Banner */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Bateria de Testes Automatizados e Validações do Sistema
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Executa verificações de integridade em tempo real: sintaxe YAML do Traefik, regras de
            prioridade, bloqueio de injeção em FQDN, e resolução do serviço padrão.
          </p>
        </div>

        <button
          onClick={runTests}
          disabled={isRunning}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors self-start sm:self-auto shrink-0 disabled:opacity-50"
        >
          {isRunning ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          <span>{isRunning ? 'Executando Testes...' : 'Executar Bateria de Testes'}</span>
        </button>
      </div>

      {/* Summary Scorecard if tests ran */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500">Testes Executados</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {results.length}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Última execução: {lastRunTime}</span>
          </div>

          <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 shadow-xs">
            <span className="text-xs text-emerald-800 font-semibold">Testes Aprovados</span>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
              {summary.passed} / {results.length}
            </div>
            <span className="text-[11px] text-emerald-600 mt-1 block">100% de conformidade esperada</span>
          </div>

          <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-500">Falhas Detectadas</span>
            <div className={`text-xl font-bold font-mono mt-1 ${summary.failed > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {summary.failed}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {summary.failed === 0 ? 'Nenhum erro de integridade' : 'Atenção aos itens com falha'}
            </span>
          </div>
        </div>
      )}

      {/* Test Results Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">Resultados dos Casos de Teste</h3>
          <span className="text-xs text-slate-400 font-mono">
            {results.length > 0 ? `${results.length} verificações` : 'Pronto para execução'}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {results.length > 0 ? (
            results.map((test) => (
              <div key={test.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {test.passed ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900">{test.name}</h4>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.2 rounded ${
                          test.passed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {test.passed ? 'PASSOU' : 'FALHOU'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{test.description}</p>
                    <p className="text-xs font-mono text-slate-700 mt-1 bg-slate-50 p-1.5 rounded border border-slate-200 inline-block">
                      {test.detail}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 whitespace-nowrap tabular-nums">
                  <Clock className="w-3 h-3" />
                  <span>{test.durationMs}ms</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Nenhum teste executado nesta sessão.</p>
              <p className="text-slate-400 mt-1">
                Clique no botão "Executar Bateria de Testes" acima para iniciar a validação de regras.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
