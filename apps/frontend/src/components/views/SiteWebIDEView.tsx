import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  ArrowLeft,
  Upload,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Save,
  Key,
  Globe,
  ExternalLink,
  ChevronRight,
  Archive,
  FolderPlus,
  FilePlus,
  X,
  Check,
  Sun,
  Moon,
  AlertCircle,
  FileArchive,
  Terminal,
  Code2,
  HardDrive,
  Zap,
  Rocket,
  CheckCircle2,
} from 'lucide-react';
import type { Service, SiteFile } from '../../types/index.ts';
import { SiteSFTPModal } from '../SiteSFTPModal.tsx';

interface OpenFileTab {
  path: string;
  name: string;
  content: string;
  initialContent: string;
  isDirty: boolean;
  language: string;
}

export const SiteWebIDEView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingService, setIsLoadingService] = useState(true);

  // Editor Tabs State (VS Code style)
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // Monaco theme ('light' by default to match StackOrbit light aesthetic)
  const [editorTheme, setEditorTheme] = useState<'light' | 'vs-dark'>('light');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Status de Publicação ('idle' = No ar, 'pending' = Aguardando publicação, 'publishing' = Publicando)
  const [publishStatus, setPublishStatus] = useState<'idle' | 'pending' | 'publishing'>(() => {
    return (localStorage.getItem(`site_pub_status_${id}`) as any) || 'idle';
  });
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(() => {
    return localStorage.getItem(`site_last_pub_${id}`);
  });

  // Persiste status de publicação no localStorage para sobreviver a F5
  useEffect(() => {
    if (id) {
      localStorage.setItem(`site_pub_status_${id}`, publishStatus);
    }
  }, [id, publishStatus]);

  useEffect(() => {
    if (id && lastPublishedAt) {
      localStorage.setItem(`site_last_pub_${id}`, lastPublishedAt);
    }
  }, [id, lastPublishedAt]);

  // Auto-save com debounce (0 = manual, 1000 = 1s, 2000 = 2s, 5000 = 5s)
  const [autoSaveDelay, setAutoSaveDelay] = useState<number>(() => {
    const saved = localStorage.getItem('ide_autosave_delay');
    return saved !== null ? parseInt(saved, 10) : 2000;
  });
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cursor position
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  // Modals & inputs
  const [isSFTPModalOpen, setIsSFTPModalOpen] = useState(false);
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{ oldPath: string; oldName: string } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [extractingZipPath, setExtractingZipPath] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = localStorage.getItem('dm_auth_token') || '';

  // 1. Carrega dados do Serviço / Site
  const loadServiceDetails = useCallback(async () => {
    if (!id) return;
    setIsLoadingService(true);
    try {
      const res = await fetch(`/api/services/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setService(data);
        if (data.meta) {
          if (data.meta.hasPendingChanges) {
            setPublishStatus('pending');
          } else {
            setPublishStatus((prev) => (prev === 'publishing' ? 'publishing' : 'idle'));
          }

          if (data.meta.lastPublishedAt) {
            const pubDate = new Date(data.meta.lastPublishedAt);
            const timeStr = pubDate.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            setLastPublishedAt(timeStr);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes do serviço:', err);
    } finally {
      setIsLoadingService(false);
    }
  }, [id, token]);

  // 2. Carrega lista de arquivos da pasta atual
  const loadFiles = useCallback(async (subPath: string = currentPath) => {
    if (!id) return;
    setIsLoadingFiles(true);
    try {
      const query = subPath && subPath !== '/' ? `?path=${encodeURIComponent(subPath)}` : '';
      const res = await fetch(`/api/sites/${id}/files${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentPath(data.currentPath || subPath || '/');
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Erro ao carregar arquivos:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  }, [id, token, currentPath]);

  useEffect(() => {
    loadServiceDetails();
    loadFiles('/');
  }, [loadServiceDetails, loadFiles]);

  // Detecta linguagem do arquivo para o Monaco Editor
  const detectLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'html':
      case 'htm':
        return 'html';
      case 'css':
        return 'css';
      case 'scss':
        return 'scss';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'json':
        return 'json';
      case 'php':
        return 'php';
      case 'sql':
        return 'sql';
      case 'md':
        return 'markdown';
      case 'xml':
      case 'svg':
        return 'xml';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'dockerfile':
        return 'dockerfile';
      default:
        return 'plaintext';
    }
  };

  // Abrir arquivo em uma aba
  const handleOpenFile = async (file: SiteFile) => {
    if (file.isDirectory) {
      navigateToFolder(file.path);
      return;
    }

    // Se já estiver aberto, apenas foca na aba existente
    const existing = openTabs.find((t) => t.path === file.path);
    if (existing) {
      setActiveTabPath(file.path);
      return;
    }

    // Carrega conteúdo do arquivo
    try {
      const res = await fetch(
        `/api/sites/${id}/files/content?path=${encodeURIComponent(file.path)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const newTab: OpenFileTab = {
          path: file.path,
          name: file.name,
          content: data.content ?? '',
          initialContent: data.content ?? '',
          isDirty: false,
          language: detectLanguage(file.name),
        };

        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(file.path);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Não foi possível abrir este arquivo para edição.');
      }
    } catch {
      alert('Erro de conexão ao carregar o conteúdo do arquivo.');
    }
  };

  // Fechar aba
  const handleCloseTab = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const tabToClose = openTabs.find((t) => t.path === path);
    if (tabToClose?.isDirty) {
      const confirmClose = window.confirm(
        `O arquivo "${tabToClose.name}" possui alterações não salvas. Deseja fechar sem salvar?`
      );
      if (!confirmClose) return;
    }

    const remaining = openTabs.filter((t) => t.path !== path);
    setOpenTabs(remaining);

    if (activeTabPath === path) {
      if (remaining.length > 0) {
        setActiveTabPath(remaining[remaining.length - 1].path);
      } else {
        setActiveTabPath(null);
      }
    }
  };

  // Função unificada para salvar conteúdo de um arquivo
  const saveFileContent = async (filePath: string, content: string): Promise<boolean> => {
    if (!id) return false;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/sites/${id}/files/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: filePath,
          content,
        }),
      });

      if (res.ok) {
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.path === filePath ? { ...t, isDirty: false, initialContent: content } : t
          )
        );
        setPublishStatus('pending');
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Salvar arquivo ativo manualmente
  const handleSaveActiveFile = async () => {
    const tab = openTabs.find((t) => t.path === activeTabPath);
    if (!tab) return;
    const ok = await saveFileContent(tab.path, tab.content);
    if (ok) {
      setSaveSuccessMessage(`"${tab.name}" salvo! Aguardando publicação.`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } else {
      alert('Erro ao salvar o arquivo.');
    }
  };

  // Alteração de conteúdo no editor com Auto-save e Debounce
  const handleContentChange = (newVal: string) => {
    if (!activeTabPath) return;

    setOpenTabs((prev) =>
      prev.map((t) =>
        t.path === activeTabPath
          ? { ...t, content: newVal, isDirty: newVal !== t.initialContent }
          : t
      )
    );

    // Marca como alterado e aguardando publicação
    setPublishStatus('pending');

    // Se auto-save estiver ativo (> 0 ms), dispara o timer com debounce
    if (autoSaveDelay > 0) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      const targetPath = activeTabPath;
      autoSaveTimerRef.current = setTimeout(async () => {
        const ok = await saveFileContent(targetPath, newVal);
        if (ok) {
          setSaveSuccessMessage('Auto-salvo (pronto para publicar)');
          setTimeout(() => setSaveSuccessMessage(null), 2500);
        }
      }, autoSaveDelay);
    }
  };

  // Publicar alterações no container
  const handlePublish = async () => {
    if (!id) return;
    setPublishStatus('publishing');

    // 1. Salva abas pendentes com alterações
    const dirtyTabs = openTabs.filter((t) => t.isDirty);
    for (const tab of dirtyTabs) {
      await saveFileContent(tab.path, tab.content);
    }

    // 2. Chama endpoint de publicação
    try {
      const res = await fetch(`/api/sites/${id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        const pubDate = resData.publishedAt ? new Date(resData.publishedAt) : new Date();
        const timeStr = pubDate.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setLastPublishedAt(timeStr);
        setPublishStatus('idle');
        if (id) {
          localStorage.setItem(`site_pub_status_${id}`, 'idle');
          localStorage.setItem(`site_last_pub_${id}`, timeStr);
        }
        setSaveSuccessMessage('Site publicado e no ar com sucesso!');
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erro ao publicar site no container.');
        setPublishStatus('pending');
      }
    } catch {
      alert('Erro de conexão ao publicar o site.');
      setPublishStatus('pending');
    }
  };

  // Atalho de teclado Ctrl+S para salvar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveActiveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabPath, openTabs]);

  // Criar novo arquivo
  const handleCreateFile = async () => {
    if (!newItemName.trim() || !id) return;
    const targetPath =
      currentPath === '/' ? `/${newItemName.trim()}` : `${currentPath}/${newItemName.trim()}`;

    try {
      const res = await fetch(`/api/sites/${id}/files/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: targetPath,
          content: '',
        }),
      });

      if (res.ok) {
        setNewFileDialog(false);
        setNewItemName('');
        await loadFiles(currentPath);
        // Abre imediatamente no editor
        handleOpenFile({
          name: targetPath.split('/').pop() || '',
          path: targetPath,
          isDirectory: false,
          size: 0,
          extension: '.' + (targetPath.split('.').pop() || ''),
          mtime: new Date().toISOString(),
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao criar arquivo.');
      }
    } catch {
      alert('Erro de conexão ao criar arquivo.');
    }
  };

  // Criar nova pasta
  const handleCreateFolder = async () => {
    if (!newItemName.trim() || !id) return;
    const targetPath =
      currentPath === '/' ? `/${newItemName.trim()}` : `${currentPath}/${newItemName.trim()}`;

    try {
      const res = await fetch(`/api/sites/${id}/files/mkdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ path: targetPath }),
      });

      if (res.ok) {
        setNewFolderDialog(false);
        setNewItemName('');
        loadFiles(currentPath);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao criar diretório.');
      }
    } catch {
      alert('Erro de conexão ao criar pasta.');
    }
  };

  // Excluir arquivo ou pasta
  const handleDeleteItem = async (file: SiteFile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!id) return;
    const isDir = file.isDirectory;
    const confirmDelete = window.confirm(
      `Tem certeza que deseja excluir ${isDir ? 'a pasta' : 'o arquivo'} "${file.name}" permanentemente do container?`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `/api/sites/${id}/files?path=${encodeURIComponent(file.path)}&isDir=${isDir}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        if (!isDir) {
          handleCloseTab(file.path);
        }
        loadFiles(currentPath);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir item.');
      }
    } catch {
      alert('Erro de conexão ao excluir.');
    }
  };

  // Renomear arquivo ou pasta
  const handleRename = async () => {
    if (!renameDialog || !newItemName.trim() || !id) return;
    const parent = renameDialog.oldPath.substring(0, renameDialog.oldPath.lastIndexOf('/')) || '/';
    const newPath = parent === '/' ? `/${newItemName.trim()}` : `${parent}/${newItemName.trim()}`;

    try {
      const res = await fetch(`/api/sites/${id}/files/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldPath: renameDialog.oldPath,
          newPath,
        }),
      });

      if (res.ok) {
        setRenameDialog(null);
        setNewItemName('');
        // Atualiza aba aberta se renomeou
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.path === renameDialog.oldPath
              ? { ...t, path: newPath, name: newItemName.trim(), language: detectLanguage(newPath) }
              : t
          )
        );
        if (activeTabPath === renameDialog.oldPath) {
          setActiveTabPath(newPath);
        }
        loadFiles(currentPath);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao renomear item.');
      }
    } catch {
      alert('Erro de conexão ao renomear.');
    }
  };

  // Upload de arquivos
  const handleFileUpload = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0 || !id) return;

    setUploadStatus(`Enviando ${filesList.length} arquivo(s)...`);
    const formData = new FormData();
    formData.append('targetPath', currentPath);

    for (let i = 0; i < filesList.length; i++) {
      formData.append('files', filesList[i]);
    }

    try {
      const res = await fetch(`/api/sites/${id}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setUploadStatus('Upload concluído com sucesso!');
        setTimeout(() => setUploadStatus(null), 3000);
        loadFiles(currentPath);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro no envio dos arquivos.');
        setUploadStatus(null);
      }
    } catch {
      alert('Erro de conexão durante o upload.');
      setUploadStatus(null);
    }
  };

  // Baixar arquivo ou pasta em ZIP
  const handleDownload = (file: SiteFile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!id) return;
    const downloadUrl = `/api/sites/${id}/files/download?path=${encodeURIComponent(file.path)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name + (file.isDirectory ? '.zip' : '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Navegar na árvore de pastas
  const navigateToFolder = (targetPath: string) => {
    setCurrentPath(targetPath);
    loadFiles(targetPath);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.length === 0 ? '/' : `/${parts.join('/')}`;
    navigateToFolder(parentPath);
  };

  // Separa pastas e arquivos da pasta atual
  const currentFolders = files.filter((f) => f.isDirectory);
  const currentNonFolders = files.filter((f) => !f.isDirectory);

  // Aba ativa do editor
  const activeTab = openTabs.find((t) => t.path === activeTabPath);

  // Formatação de bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Ícone por tipo de arquivo
  const renderFileIcon = (file: SiteFile) => {
    if (file.isDirectory) {
      return <Folder className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    const ext = (file.extension || '').toLowerCase();
    if (ext === '.zip' || ext === '.tar' || ext === '.gz') {
      return <Archive className="w-4 h-4 text-purple-600 shrink-0" />;
    }
    if (ext === '.html' || ext === '.htm') {
      return <FileCode className="w-4 h-4 text-orange-500 shrink-0" />;
    }
    if (ext === '.css' || ext === '.scss') {
      return <FileCode className="w-4 h-4 text-blue-500 shrink-0" />;
    }
    if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
      return <FileCode className="w-4 h-4 text-amber-600 shrink-0" />;
    }
    if (ext === '.php') {
      return <FileCode className="w-4 h-4 text-indigo-600 shrink-0" />;
    }
    if (ext === '.json') {
      return <FileJson className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-800 font-sans overflow-hidden select-none">
      {/* 1. BARRA SUPERIOR (HEADER LIMPO E CLARO) */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4 shrink-0 z-20 shadow-2xs">
        {/* Esquerda: Voltar + Identificação do Site */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/sites')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold border border-slate-200 transition-colors shadow-2xs"
            title="Voltar para a lista de Sites Web"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Sites</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Code2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 truncate">
                  {service?.name || 'Carregando Site...'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                  {service?.image || 'web'}
                </span>
              </div>
              {service?.domains && service.domains.length > 0 && (
                <a
                  href={`https://${service.domains[0].domainName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    window.open(`https://${service.domains[0].domainName}?_nocache=${Date.now()}`, '_blank');
                  }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 truncate font-mono"
                  title="Abrir site ao vivo (sem cache) em nova aba"
                >
                  <span>{service.domains[0].domainName}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Centro: Status de Salvamento / Notificações */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          {saveSuccessMessage && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>{saveSuccessMessage}</span>
            </span>
          )}
          {uploadStatus && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{uploadStatus}</span>
            </span>
          )}
          {activeTab?.isDirty && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-mono text-[11px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Alterações não salvas (Ctrl+S)</span>
            </span>
          )}
        </div>

        {/* Direita: Ações Rápidas (Auto-Save, Salvar, Publicar, SFTP, Tema) */}
        <div className="flex items-center gap-2">
          {/* Seletor de Auto-save com Debounce */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-xl text-xs transition-colors">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Auto-save:</span>
            <select
              value={autoSaveDelay}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setAutoSaveDelay(val);
                localStorage.setItem('ide_autosave_delay', String(val));
              }}
              className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer text-xs"
              title="Tempo de espera após parar de digitar para salvar automaticamente"
            >
              <option value={0}>Manual (Ctrl+S)</option>
              <option value={1000}>1s (Rápido)</option>
              <option value={2000}>2s (Recomendado)</option>
              <option value={5000}>5s</option>
            </select>
          </div>

          {/* Botão de Salvar Manual */}
          {activeTab && (
            <button
              type="button"
              onClick={handleSaveActiveFile}
              disabled={isSaving || !activeTab?.isDirty}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                activeTab?.isDirty
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-default'
              }`}
              title="Salvar alterações no arquivo (Ctrl+S)"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar</span>
            </button>
          )}

          {/* Botão de Publicação (Aguardando Publicação vs Publicado no Ar) */}
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishStatus === 'publishing'}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
              publishStatus === 'publishing'
                ? 'bg-blue-600 text-white opacity-80 cursor-wait'
                : publishStatus === 'pending'
                ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-400/50 shadow-md animate-pulse'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
            title={
              publishStatus === 'pending'
                ? 'Existem alterações salvas aguardando publicação no container. Clique para publicar no ar.'
                : 'O site está atualizado e publicado no container Docker.'
            }
          >
            {publishStatus === 'publishing' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Publicando...</span>
              </>
            ) : publishStatus === 'pending' ? (
              <>
                <Rocket className="w-3.5 h-3.5 text-white" />
                <span>Publicar Alterações</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>No Ar {lastPublishedAt ? `(${lastPublishedAt})` : ''}</span>
              </>
            )}
          </button>

          {/* Atalho direto para abrir site sem cache */}
          {service?.domains && service.domains.length > 0 && (
            <button
              type="button"
              onClick={() => {
                window.open(`https://${service.domains[0].domainName}?_nocache=${Date.now()}`, '_blank');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-colors shadow-2xs"
              title="Abrir o site publicado em uma nova aba ignorando cache do navegador"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Ver no Ar</span>
            </button>
          )}

          {/* Modal SFTP */}
          <button
            type="button"
            onClick={() => setIsSFTPModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors shadow-2xs"
            title="Acessar credenciais e instruções SFTP / FTP"
          >
            <Key className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden sm:inline">SFTP / FTP</span>
          </button>

          {/* Baixar ZIP Completo do Site */}
          <button
            type="button"
            onClick={() =>
              handleDownload({
                name: service?.name || 'site',
                path: '/',
                isDirectory: true,
                size: 0,
                extension: '',
                mtime: new Date().toISOString(),
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors shadow-2xs"
            title="Baixar todo o site compactado em ZIP"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Baixar ZIP</span>
          </button>

          {/* Alternar Tema do Editor */}
          <button
            type="button"
            onClick={() => setEditorTheme((prev) => (prev === 'light' ? 'vs-dark' : 'light'))}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 transition-colors shadow-2xs"
            title={`Tema do Editor: ${editorTheme === 'light' ? 'Claro' : 'Escuro'}`}
          >
            {editorTheme === 'light' ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-blue-500" />}
          </button>
        </div>
      </header>

      {/* 2. ÁREA DE TRABALHO (SIDEBAR DE ARQUIVOS NA ESQUERDA + EDITOR NA DIREITA) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ========================================================
            PAINEL ESQUERDO: EXPLORADOR DE PASTAS E ARQUIVOS INTEGRADO
           ======================================================== */}
        <aside className="w-72 md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none">
          {/* Topo da Sidebar: Ações de Novo Arquivo, Nova Pasta, Upload */}
          <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-blue-600" />
              <span>Arquivos & Pastas</span>
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setNewItemName('');
                  setNewFileDialog(true);
                }}
                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-200/70 rounded-lg transition-colors"
                title="Criar novo arquivo neste diretório"
              >
                <FilePlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewItemName('');
                  setNewFolderDialog(true);
                }}
                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-200/70 rounded-lg transition-colors"
                title="Criar nova pasta neste diretório"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-200/70 rounded-lg transition-colors"
                title="Fazer upload de arquivos para esta pasta"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => loadFiles(currentPath)}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
                title="Atualizar lista de arquivos"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileUpload(e.target.files)}
            multiple
            className="hidden"
          />

          {/* Navegação Rápida de Caminho / Raiz */}
          <div className="p-2 border-b border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => navigateToFolder('/')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentPath === '/'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-blue-600" />
                <span>Raiz do Site (/)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">public_html</span>
            </button>

            {/* Subir nível se estiver dentro de uma subpasta */}
            {currentPath !== '/' && (
              <button
                type="button"
                onClick={navigateUp}
                className="w-full mt-1.5 flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-dashed border-slate-300 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                <span>.. (Subir nível)</span>
                <span className="ml-auto text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                  {currentPath}
                </span>
              </button>
            )}
          </div>

          {/* ÁRVORE UNIFICADA: PASTAS E ARQUIVOS JUNTOS */}
          <div
            className="flex-1 overflow-y-auto p-2 space-y-1"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileUpload(e.dataTransfer.files);
            }}
          >
            {isDragging && (
              <div className="p-4 border-2 border-dashed border-blue-500 rounded-xl bg-blue-50 text-center text-xs text-blue-700 font-bold">
                Solte os arquivos aqui para upload
              </div>
            )}

            {/* Pastas */}
            {currentFolders.length > 0 && (
              <div className="space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Pastas ({currentFolders.length})
                </div>
                {currentFolders.map((folder) => (
                  <div
                    key={folder.path}
                    className="group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    onClick={() => navigateToFolder(folder.path)}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="truncate font-semibold">{folder.name}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleDownload(folder, e)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded"
                        title="Baixar pasta em ZIP"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(folder, e)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                        title="Excluir pasta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Arquivos */}
            <div className="space-y-0.5 pt-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Arquivos ({currentNonFolders.length})</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {formatBytes(currentNonFolders.reduce((acc, f) => acc + (f.size || 0), 0))}
                </span>
              </div>

              {currentNonFolders.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 italic">
                  Nenhum arquivo nesta pasta.
                </div>
              ) : (
                currentNonFolders.map((file) => {
                  const isOpen = openTabs.some((t) => t.path === file.path);
                  const isActive = activeTabPath === file.path;

                  return (
                    <div
                      key={file.path}
                      onClick={() => handleOpenFile(file)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                          : isOpen
                          ? 'bg-slate-100 text-slate-900 font-medium'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        {renderFileIcon(file)}
                        <span className="truncate font-mono">{file.name}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-mono group-hover:hidden">
                          {formatBytes(file.size || 0)}
                        </span>

                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => handleDownload(file, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Baixar arquivo"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameDialog({ oldPath: file.path, oldName: file.name });
                              setNewItemName(file.name);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                            title="Renomear"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteItem(file, e)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Excluir arquivo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Rodapé da Sidebar */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="font-mono">{currentPath}</span>
            <span>{files.length} itens</span>
          </div>
        </aside>

        {/* ========================================================
            PAINEL PRINCIPAL: ABAS E EDITOR MONACO (ESTILO VS CODE)
           ======================================================== */}
        <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {/* BARRA DE ABAS ESTILO VS CODE (FLAT, SEM ROUNDED) */}
          <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-stretch px-0 overflow-x-auto no-scrollbar shrink-0">
            {openTabs.length === 0 ? (
              <span className="text-xs text-slate-400 px-3 py-2 font-mono flex items-center">Nenhum arquivo aberto</span>
            ) : (
              openTabs.map((tab) => {
                const isActive = activeTabPath === tab.path;
                return (
                  <div
                    key={tab.path}
                    onClick={() => setActiveTabPath(tab.path)}
                    className={`group flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold transition-all border-r border-slate-200 border-t-2 shrink-0 cursor-pointer max-w-[220px] select-none ${
                      isActive
                        ? 'bg-white text-slate-900 border-t-blue-600 font-bold border-b border-b-white -mb-px'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 border-t-transparent'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate font-mono">{tab.name}</span>
                    {tab.isDirty ? (
                      <span
                        className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                        title="Alterações não salvas"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(tab.path, e)}
                      className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}

            {/* Botão rápido para criar novo arquivo */}
            <button
              type="button"
              onClick={() => {
                setNewItemName('');
                setNewFileDialog(true);
              }}
              className="flex items-center px-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors border-r border-slate-200"
              title="Criar novo arquivo"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* CONTEÚDO PRINCIPAL: EDITOR OU TELA DE BOAS-VINDAS */}
          {activeTab ? (
            <div className="flex-1 flex flex-col min-h-0 relative bg-white">
              {/* Barra de Status do Arquivo Aberto */}
              <div className="h-8 bg-slate-50 border-b border-slate-200 px-4 flex items-center justify-between text-xs text-slate-600 shrink-0">
                <div className="flex items-center gap-2 truncate font-mono text-[11px]">
                  <span className="text-slate-400">Caminho:</span>
                  <span className="text-slate-800 font-bold">{activeTab.path}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-blue-600 uppercase font-semibold">{activeTab.language}</span>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-[11px] font-mono text-slate-400">
                    Ln {cursorPos.line}, Col {cursorPos.col}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveActiveFile}
                    disabled={isSaving}
                    className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <Save className="w-3 h-3" />
                    <span>Salvar (Ctrl+S)</span>
                  </button>
                </div>
              </div>

              {/* Instância Real do Editor Monaco */}
              <div className="flex-1 relative">
                <Editor
                  height="100%"
                  language={activeTab.language}
                  theme={editorTheme}
                  value={activeTab.content}
                  onChange={(val) => handleContentChange(val ?? '')}
                  onMount={(editor) => {
                    editor.onDidChangeCursorPosition((e) => {
                      setCursorPos({
                        line: e.position.lineNumber,
                        col: e.position.column,
                      });
                    });
                  }}
                  options={{
                    minimap: { enabled: true },
                    fontSize: 13,
                    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                    fontLigatures: true,
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollBeyondLastLine: false,
                    readOnly: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                  }}
                />
              </div>

              {/* Rodapé Estilo VS Code com Status de Publicação e Última Publicação */}
              <div className="h-6 bg-slate-100 border-t border-slate-200 px-3 flex items-center justify-between text-[11px] text-slate-500 font-mono select-none shrink-0">
                <div className="flex items-center gap-3">
                  {publishStatus === 'pending' ? (
                    <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Alterações pendentes de publicação
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Publicado no Container
                    </span>
                  )}
                  {lastPublishedAt && (
                    <span className="text-slate-400 hidden sm:inline">
                      • Última publicação: {lastPublishedAt}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                  <span className="hidden md:inline">UTF-8</span>
                  <span className="uppercase text-blue-600 font-semibold">{activeTab.language}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Tela Vazia quando nenhum arquivo está aberto */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
                <Code2 className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-slate-800 mb-1">Web IDE StackOrbit</h2>
              <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                Nenhum arquivo aberto no momento. Clique em qualquer arquivo na árvore da esquerda para editá-lo ou use os botões abaixo.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setNewItemName('');
                    setNewFileDialog(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Arquivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs"
                >
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Fazer Upload</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: NOVO ARQUIVO */}
      {newFileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Criar Novo Arquivo</h3>
            <p className="text-xs text-slate-500 mb-4">
              O arquivo será criado dentro de <code className="text-blue-600 font-mono">{currentPath}</code>
            </p>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="ex: index.php, style.css, script.js"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFile();
                if (e.key === 'Escape') setNewFileDialog(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFileDialog(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateFile}
                disabled={!newItemName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
              >
                Criar Arquivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVA PASTA */}
      {newFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Criar Nova Pasta</h3>
            <p className="text-xs text-slate-500 mb-4">
              A subpasta será criada em <code className="text-blue-600 font-mono">{currentPath}</code>
            </p>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="ex: assets, uploads, src"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setNewFolderDialog(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderDialog(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newItemName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
              >
                Criar Pasta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RENOMEAR */}
      {renameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Renomear</h3>
            <p className="text-xs text-slate-500 mb-4">
              Novo nome para: <code className="text-blue-600 font-mono">{renameDialog.oldName}</code>
            </p>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenameDialog(null);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameDialog(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRename}
                disabled={!newItemName.trim() || newItemName === renameDialog.oldName}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SFTP */}
      {service && (
        <SiteSFTPModal
          isOpen={isSFTPModalOpen}
          onClose={() => setIsSFTPModalOpen(false)}
          serviceId={service.id}
          serviceName={service.name}
        />
      )}
    </div>
  );
};