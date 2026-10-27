import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Maximize2,
  Minimize2,
  FileCode,
  Check,
  AlertCircle,
  Copy,
  RefreshCw,
} from 'lucide-react';

interface SiteCodeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string;
  filePath: string;
  onSaved?: () => void;
}

export const SiteCodeEditorModal: React.FC<SiteCodeEditorModalProps> = ({
  isOpen,
  onClose,
  serviceId,
  filePath,
  onSaved,
}) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Carrega conteúdo do arquivo
  useEffect(() => {
    if (isOpen && filePath) {
      setIsLoading(true);
      setError(null);
      setHasUnsavedChanges(false);

      fetch(`/api/sites/${serviceId}/files/content?path=${encodeURIComponent(filePath)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      })
        .then(async (res) => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Erro ao carregar conteúdo do arquivo.');
          }
          return res.json();
        })
        .then((data) => {
          setContent(data.content || '');
          setIsLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setIsLoading(false);
        });
    }
  }, [isOpen, serviceId, filePath]);

  // Salvar arquivo
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${serviceId}/files/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({ path: filePath, content }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao salvar arquivo.');
      }

      setSavedSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSavedSuccess(false), 2500);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Atalho de teclado Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isOpen && !isSaving && !isLoading) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, isLoading, content]);

  if (!isOpen) return null;

  const fileName = filePath.split('/').pop() || 'arquivo';
  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'w-full h-full rounded-none border-none' : 'w-full max-w-5xl h-[85vh]'
        }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-sm">{fileName}</span>
                {hasUnsavedChanges && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                    Não salvo
                  </span>
                )}
                <span className="text-xs text-slate-400 font-mono">{filePath}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:inline mr-2">
              Atalho: <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-[11px]">Ctrl+S</kbd>
            </span>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
                savedSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : savedSuccess ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {savedSuccess ? 'Salvo!' : 'Salvar Alterações'}
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title={isFullscreen ? 'Janela Padrão' : 'Tela Cheia'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="px-5 py-2.5 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Code Editor Body */}
        <div className="flex-1 relative overflow-hidden bg-slate-950 font-mono text-xs flex">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span>Carregando arquivo...</span>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setHasUnsavedChanges(true);
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              className="w-full h-full p-4 bg-transparent text-slate-200 resize-none outline-none leading-relaxed font-mono selection:bg-blue-600/30 border-none"
              placeholder="Conteúdo do arquivo..."
            />
          )}
        </div>

        {/* Status Bar */}
        <div className="px-5 py-2 border-t border-slate-800/80 bg-slate-900/90 text-[11px] text-slate-400 flex items-center justify-between select-none">
          <div className="flex items-center gap-4">
            <span>Tipo: <strong className="text-slate-200 uppercase">{fileExt || 'TEXTO'}</strong></span>
            <span>Tamanho: <strong className="text-slate-200">{new Blob([content]).size} bytes</strong></span>
            <span>Linhas: <strong className="text-slate-200">{content.split('\n').length}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Codificação: UTF-8</span>
            <span>•</span>
            <span className="text-emerald-400">StackOrbit Web Editor</span>
          </div>
        </div>
      </div>
    </div>
  );
};
