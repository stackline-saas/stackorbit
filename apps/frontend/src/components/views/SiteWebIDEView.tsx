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
  const [activeTabPath, setActiveTabPath] = useState<string>('__explorer__'); // '__explorer__' or file path

  // Monaco theme ('vs-dark' or 'light')
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

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
  }, [id, currentPath, token]);

  useEffect(() => {
    loadServiceDetails();
    loadFiles('/');
  }, [loadServiceDetails]);

  // Linguagem Monaco por extensão
  const detectLanguage = (ext: string): string => {
    switch (ext.toLowerCase()) {
      case '.html':
      case '.htm':
        return 'html';
      case '.css':
        return 'css';
      case '.scss':
      case '.sass':
      case '.less':
        return 'scss';
      case '.js':
      case '.jsx':
      case '.mjs':
        return 'javascript';
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.php':
        return 'php';
      case '.json':
        return 'json';
      case '.xml':
      case '.svg':
        return 'xml';
      case '.md':
      case '.markdown':
        return 'markdown';
      case '.sql':
        return 'sql';
      case '.sh':
      case '.bash':
        return 'shell';
      case '.yml':
      case '.yaml':
        return 'yaml';
      case '.env':
      case '.ini':
      case '.conf':
      case '.htaccess':
        return 'ini';
      case '.py':
        return 'python';
      default:
        return 'plaintext';
    }
  };

  // 3. Abrir arquivo no Editor VS Code
  const handleOpenFile = async (file: SiteFile) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
      loadFiles(file.path);
      setActiveTabPath('__explorer__');
      return;
    }

    // Se já estiver aberto em uma aba, foca nela
    const existingIndex = openTabs.findIndex((t) => t.path === file.path);
    if (existingIndex >= 0) {
      setActiveTabPath(file.path);
      return;
    }

    // Busca conteúdo do arquivo no backend
    try {
      const res = await fetch(
        `/api/sites/${id}/files/content?path=${encodeURIComponent(file.path)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        alert('Não foi possível abrir este arquivo para edição.');
        return;
      }
      const data = await res.json();
      const content = data.content || '';
      const newTab: OpenFileTab = {
        path: file.path,
        name: file.name,
        content,
        initialContent: content,
        isDirty: false,
        language: detectLanguage(file.extension || ''),
      };

      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabPath(file.path);
    } catch (err) {
      console.error('Erro ao abrir arquivo:', err);
      alert('Erro ao carregar conteúdo do arquivo.');
    }
  };

  // 4. Salvar arquivo ativo (Ctrl+S)
  const handleSaveActiveFile = async () => {
    const activeTab = openTabs.find((t) => t.path === activeTabPath);
    if (!activeTab || !id) return;

    setIsSaving(true);
    setSaveSuccessMessage(null);
    try {
      const res = await fetch(`/api/sites/${id}/files/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: activeTab.path,
          content: activeTab.content,
        }),
      });

      if (res.ok) {
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.path === activeTab.path
              ? { ...t, initialContent: t.content, isDirty: false }
              : t
          )
        );
        setSaveSuccessMessage('Arquivo salvo com sucesso!');
        setTimeout(() => setSaveSuccessMessage(null), 3000);
        loadFiles(currentPath);
      } else {
        const errData = await res.json();
        alert(`Erro ao salvar arquivo: ${errData.error || 'Falha no servidor'}`);
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro de conexão ao salvar arquivo.');
    } finally {
      setIsSaving(false);
    }
  };

  // Atalho de teclado Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTabPath !== '__explorer__') {
          handleSaveActiveFile();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabPath, openTabs]);

  // Fechar aba
  const handleCloseTab = (tabPath: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const tabToClose = openTabs.find((t) => t.path === tabPath);
    if (tabToClose?.isDirty) {
      if (!window.confirm(`O arquivo "${tabToClose.name}" possui alterações não salvas. Deseja fechar mesmo assim?`)) {
        return;
      }
    }

    const remaining = openTabs.filter((t) => t.path !== tabPath);
    setOpenTabs(remaining);

    if (activeTabPath === tabPath) {
      if (remaining.length > 0) {
        setActiveTabPath(remaining[remaining.length - 1].path);
      } else {
        setActiveTabPath('__explorer__');
      }
    }
  };

  // Criar novo arquivo
  const handleCreateNewFile = async () => {
    if (!newItemName.trim() || !id) return;
    try {
      const res = await fetch(`/api/sites/${id}/files/new-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: currentPath,
          fileName: newItemName.trim(),
          content: '',
        }),
      });

      if (res.ok) {
        setNewFileDialog(false);
        setNewItemName('');
        await loadFiles(currentPath);
        // Abre imediatamente no editor
        const fullNewPath = currentPath === '/' ? `/${newItemName.trim()}` : `${currentPath}/${newItemName.trim()}`;
        handleOpenFile({
          name: newItemName.trim(),
          path: fullNewPath,
          isDirectory: false,
          size: 0,
          mtime: new Date().toISOString(),
          extension: `.${newItemName.trim().split('.').pop()}`,
        });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Erro ao criar arquivo.');
      }
    } catch {
      alert('Erro de rede ao criar arquivo.');
    }
  };

  // Criar nova pasta
  const handleCreateNewFolder = async () => {
    if (!newItemName.trim() || !id) return;
    try {
      const res = await fetch(`/api/sites/${id}/files/new-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          path: currentPath,
          folderName: newItemName.trim(),
        }),
      });

      if (res.ok) {
        setNewFolderDialog(false);
        setNewItemName('');
        loadFiles(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Erro ao criar pasta.');
      }
    } catch {
      alert('Erro ao criar pasta.');
    }
  };

  // Excluir arquivo ou pasta
  const handleDeleteItem = async (file: SiteFile) => {
    const isDir = file.isDirectory;
    if (!window.confirm(`Tem certeza que deseja excluir ${isDir ? 'a pasta e todo seu conteúdo' : 'o arquivo'} "${file.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/sites/${id}/files?path=${encodeURIComponent(file.path)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        // Se estava aberto no editor, fecha a aba
        handleCloseTab(file.path);
        loadFiles(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Erro ao excluir item.');
      }
    } catch {
      alert('Erro ao excluir item.');
    }
  };

  // Renomear
  const handleRename = async () => {
    if (!renameDialog || !newItemName.trim() || !id) return;
    try {
      const res = await fetch(`/api/sites/${id}/files/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          oldPath: renameDialog.oldPath,
          newName: newItemName.trim(),
        }),
      });

      if (res.ok) {
        setRenameDialog(null);
        setNewItemName('');
        loadFiles(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Erro ao renomear.');
      }
    } catch {
      alert('Erro ao renomear.');
    }
  };

  // Upload de arquivos
  const handleUploadFiles = async (filesToUpload: FileList | File[]) => {
    if (!filesToUpload || filesToUpload.length === 0 || !id) return;

    setUploadStatus(`Enviando ${filesToUpload.length} arquivo(s)...`);
    const formData = new FormData();
    formData.append('path', currentPath);

    for (let i = 0; i < filesToUpload.length; i++) {
      formData.append('files', filesToUpload[i]);
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
        alert(data.error || 'Erro ao realizar upload.');
        setUploadStatus(null);
      }
    } catch {
      alert('Falha de conexão no upload.');
      setUploadStatus(null);
    }
  };

  // Extrair ZIP
  const handleExtractZip = async (zipFile: SiteFile) => {
    if (!id) return;
    setExtractingZipPath(zipFile.path);
    try {
      const res = await fetch(`/api/sites/${id}/files/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          zipPath: zipFile.path,
          targetDir: currentPath,
        }),
      });

      if (res.ok) {
        alert('Arquivo ZIP extraído com sucesso no diretório atual!');
        loadFiles(currentPath);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao extrair ZIP.');
      }
    } catch {
      alert('Erro de conexão ao extrair ZIP.');
    } finally {
      setExtractingZipPath(null);
    }
  };

  // Baixar arquivo ou pasta em ZIP
  const handleDownload = (file: SiteFile) => {
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
    setActiveTabPath('__explorer__');
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
      return <Archive className="w-4 h-4 text-purple-500 shrink-0" />;
    }
    if (ext === '.html' || ext === '.htm') {
      return <FileCode className="w-4 h-4 text-orange-500 shrink-0" />;
    }
    if (ext === '.css' || ext === '.scss') {
      return <FileCode className="w-4 h-4 text-blue-500 shrink-0" />;
    }
    if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
      return <FileCode className="w-4 h-4 text-yellow-500 shrink-0" />;
    }
    if (ext === '.php') {
      return <FileCode className="w-4 h-4 text-indigo-500 shrink-0" />;
    }
    if (ext === '.json') {
      return <FileJson className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. BARRA SUPERIOR (HEADER GLOBAL DA WEB IDE) */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between gap-4 shrink-0 z-20">
        {/* Esquerda: Voltar + Identificação do Site */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/sites')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-800 transition-colors shadow-2xs"
            title="Voltar para a lista de Sites Web"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Sites</span>
          </button>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <Code2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white truncate">
                  {service?.name || 'Carregando Site...'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {service?.image || 'web'}
                </span>
              </div>
              {service?.domains && service.domains.length > 0 && (
                <a
                  href={`https://${service.domains[0].domainName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 truncate"
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
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full font-bold animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>{saveSuccessMessage}</span>
            </span>
          )}
          {uploadStatus && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full font-bold animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{uploadStatus}</span>
            </span>
          )}
          {activeTab?.isDirty && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Alterações não salvas (Ctrl+S)</span>
            </span>
          )}
        </div>

        {/* Direita: Ações Rápidas (Salvar, SFTP, Tema, Novo Arquivo) */}
        <div className="flex items-center gap-2">
          {activeTabPath !== '__explorer__' && (
            <button
              type="button"
              onClick={handleSaveActiveFile}
              disabled={isSaving || !activeTab?.isDirty}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                activeTab?.isDirty
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-default'
              }`}
              title="Salvar alterações no container (Ctrl+S)"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Salvar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSFTPModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-purple-950/40 text-purple-300 hover:text-purple-200 border border-purple-800/40 rounded-xl text-xs font-bold transition-colors shadow-2xs"
            title="Credenciais SFTP para FileZilla"
          >
            <Key className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">SFTP / FTP</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownload({ name: service?.name || 'site', path: '/', isDirectory: true, size: 0, mtime: '', extension: '' })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition-colors shadow-2xs"
            title="Baixar todo o site compactado em ZIP"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden lg:inline">Baixar ZIP</span>
          </button>

          {/* Alternar Tema Monaco */}
          <button
            type="button"
            onClick={() => setEditorTheme((prev) => (prev === 'vs-dark' ? 'light' : 'vs-dark'))}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-xl transition-colors"
            title={`Alternar tema do editor (Atual: ${editorTheme})`}
          >
            {editorTheme === 'vs-dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* 2. ÁREA PRINCIPAL SPLIT: ESQUERDA (PASTAS) & DIREITA (ARQUIVOS / VS CODE) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ========================================================
            COLUNA DA ESQUERDA: EXPLORADOR DE PASTAS (SIDEBAR)
           ======================================================== */}
        <aside className="w-72 sm:w-80 bg-slate-950/90 border-r border-slate-800/80 flex flex-col shrink-0">
          {/* Header da Sidebar de Pastas */}
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Pastas do Site
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setNewItemName('');
                  setNewFolderDialog(true);
                }}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Criar nova pasta neste diretório"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewItemName('');
                  setNewFileDialog(true);
                }}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Criar novo arquivo neste diretório"
              >
                <FilePlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => loadFiles(currentPath)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                title="Atualizar lista de arquivos"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Navegação Rápida de Caminho / Raiz */}
          <div className="p-2.5 border-b border-slate-800/60 bg-slate-950">
            <button
              type="button"
              onClick={() => navigateToFolder('/')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                currentPath === '/'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-blue-500" />
                <span>Raiz do Site (/)</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">public_html</span>
            </button>

            {/* Subir nível se estiver dentro de uma subpasta */}
            {currentPath !== '/' && (
              <button
                type="button"
                onClick={navigateUp}
                className="w-full mt-1 flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-colors border border-dashed border-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>.. (Subir um nível)</span>
              </button>
            )}
          </div>

          {/* Lista de Subpastas do Diretório Atual */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Diretório Atual: <code className="text-slate-300 font-mono lowercase">{currentPath}</code>
            </div>

            {currentFolders.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">
                Nenhuma subpasta neste nível
              </div>
            ) : (
              currentFolders.map((folder) => {
                const isSelected = currentPath === folder.path;
                return (
                  <div
                    key={folder.path}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 font-bold'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                    onClick={() => navigateToFolder(folder.path)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(folder);
                        }}
                        className="p-1 hover:text-blue-400 rounded-md"
                        title="Baixar pasta em ZIP"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(folder);
                        }}
                        className="p-1 hover:text-rose-400 rounded-md"
                        title="Excluir pasta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Seção com atalho para todos os arquivos abertos */}
            {openTabs.length > 0 && (
              <div className="pt-4 mt-4 border-t border-slate-800/80">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Arquivos Abertos</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                    {openTabs.length}
                  </span>
                </div>
                <div className="space-y-0.5 mt-1">
                  {openTabs.map((tab) => (
                    <div
                      key={tab.path}
                      onClick={() => setActiveTabPath(tab.path)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        activeTabPath === tab.path
                          ? 'bg-blue-600/20 text-blue-400 font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{tab.name}</span>
                        {tab.isDirty && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleCloseTab(tab.path, e)}
                        className="text-slate-500 hover:text-white p-0.5 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé da Sidebar: Atributos / Estatísticas */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-950 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{files.length} itens no diretório</span>
            <span className="font-mono">{formatBytes(files.reduce((acc, f) => acc + (f.size || 0), 0))}</span>
          </div>
        </aside>

        {/* ========================================================
            PAINEL PRINCIPAL: ABAS VS CODE & (EDITOR OU LISTA ARQUIVOS)
           ======================================================== */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-900 overflow-hidden">
          {/* BARRA DE ABAS ESTILO VS CODE */}
          <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center px-2 gap-1 overflow-x-auto no-scrollbar shrink-0">
            {/* Aba Fixa: Explorador de Arquivos */}
            <button
              type="button"
              onClick={() => setActiveTabPath('__explorer__')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-t-2 shrink-0 ${
                activeTabPath === '__explorer__'
                  ? 'bg-slate-900 text-white border-blue-500 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border-transparent'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Explorador de Arquivos</span>
            </button>

            {/* Abas Dinâmicas de Arquivos em Edição */}
            {openTabs.map((tab) => {
              const isActive = activeTabPath === tab.path;
              return (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-t-2 shrink-0 cursor-pointer max-w-[200px] ${
                    isActive
                      ? 'bg-slate-900 text-white border-blue-500 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border-transparent'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{tab.name}</span>
                  {tab.isDirty ? (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                      title="Alterações não salvas"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    className="p-0.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* CONTEÚDO: MODO EDITOR VS CODE */}
          {activeTabPath !== '__explorer__' && activeTab ? (
            <div className="flex-1 flex flex-col min-h-0 relative">
              {/* Toolbar do Editor */}
              <div className="h-9 bg-slate-900/90 border-b border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-400 shrink-0">
                <div className="flex items-center gap-2 truncate font-mono text-[11px]">
                  <span className="text-slate-500">Editando:</span>
                  <span className="text-slate-200 font-bold">{activeTab.path}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-blue-400 uppercase">{activeTab.language}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-500">
                    Ln {cursorPos.line}, Col {cursorPos.col}
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveActiveFile}
                    disabled={isSaving}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
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
                  onChange={(value) => {
                    const newContent = value ?? '';
                    setOpenTabs((prev) =>
                      prev.map((t) =>
                        t.path === activeTab.path
                          ? { ...t, content: newContent, isDirty: newContent !== t.initialContent }
                          : t
                      )
                    );
                  }}
                  onMount={(editor) => {
                    editor.onDidChangeCursorPosition((e) => {
                      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
                    });
                  }}
                  options={{
                    minimap: { enabled: true },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                    fontLigatures: true,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                    tabSize: 2,
                    scrollBeyondLastLine: false,
                    padding: { top: 12, bottom: 12 },
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                  }}
                />
              </div>

              {/* Barra de Rodapé Estilo VS Code */}
              <div className="h-6 bg-blue-600 text-white px-3 flex items-center justify-between text-[11px] font-mono shrink-0 select-none">
                <div className="flex items-center gap-4">
                  <span>StackOrbit Web IDE</span>
                  <span>UTF-8</span>
                  <span>Espaços: 2</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                  <span className="uppercase font-bold">{activeTab.language}</span>
                </div>
              </div>
            </div>
          ) : (
            /* CONTEÚDO: MODO EXPLORADOR DE ARQUIVOS (TABELA E GERENCIAMENTO) */
            <div
              className={`flex-1 flex flex-col min-h-0 p-4 sm:p-6 overflow-y-auto ${
                isDragging ? 'bg-blue-950/20 border-2 border-dashed border-blue-500' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) {
                  handleUploadFiles(e.dataTransfer.files);
                }
              }}
            >
              {/* Barra de Ações do Diretório */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
                {/* Breadcrumb Navegável */}
                <div className="flex items-center gap-1.5 text-xs font-semibold overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => navigateToFolder('/')}
                    className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>raiz</span>
                  </button>

                  {currentPath
                    .split('/')
                    .filter(Boolean)
                    .map((segment, idx, arr) => {
                      const segmentPath = '/' + arr.slice(0, idx + 1).join('/');
                      const isLast = idx === arr.length - 1;
                      return (
                        <React.Fragment key={segmentPath}>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          {isLast ? (
                            <span className="text-slate-200 font-bold">{segment}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigateToFolder(segmentPath)}
                              className="text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              {segment}
                            </button>
                          )}
                        </React.Fragment>
                      );
                    })}
                </div>

                {/* Botões de Ação na Pasta */}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleUploadFiles(e.target.files);
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                    title="Fazer upload de arquivos ou ZIPs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Arquivos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewItemName('');
                      setNewFileDialog(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-blue-400" />
                    <span>Novo Arquivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewItemName('');
                      setNewFolderDialog(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Nova Pasta</span>
                  </button>
                </div>
              </div>

              {/* Tabela de Arquivos & Pastas */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Nome do Arquivo / Pasta</th>
                      <th className="py-3 px-4 hidden sm:table-cell">Tamanho</th>
                      <th className="py-3 px-4 hidden md:table-cell">Modificado em</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {files.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-500">
                          <Folder className="w-12 h-12 text-slate-700 mx-auto mb-2 opacity-50" />
                          <p className="font-semibold text-slate-400">Esta pasta está vazia</p>
                          <p className="text-xs text-slate-600 mt-1">
                            Arraste arquivos aqui ou clique em "Upload Arquivos" para começar.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      files.map((file) => (
                        <tr
                          key={file.path}
                          className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                          onClick={() => handleOpenFile(file)}
                        >
                          <td className="py-3 px-4 font-medium text-slate-200">
                            <div className="flex items-center gap-3">
                              {renderFileIcon(file)}
                              <span className="truncate group-hover:text-blue-400 transition-colors font-mono">
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px] hidden sm:table-cell">
                            {file.isDirectory ? 'Pasta' : formatBytes(file.size || 0)}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px] hidden md:table-cell">
                            {file.mtime ? new Date(file.mtime).toLocaleString('pt-BR') : '-'}
                          </td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {!file.isDirectory && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenFile(file)}
                                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white rounded-lg text-[11px] font-bold transition-all"
                                  title="Editar no Editor VS Code"
                                >
                                  Editar
                                </button>
                              )}

                              {!file.isDirectory && file.extension === '.zip' && (
                                <button
                                  type="button"
                                  onClick={() => handleExtractZip(file)}
                                  disabled={extractingZipPath === file.path}
                                  className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-950/40 rounded-lg transition-colors"
                                  title="Extrair ZIP nesta pasta"
                                >
                                  {extractingZipPath === file.path ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <FileArchive className="w-4 h-4" />
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDownload(file)}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                title={file.isDirectory ? 'Baixar pasta em ZIP' : 'Baixar arquivo'}
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setRenameDialog({ oldPath: file.path, oldName: file.name });
                                  setNewItemName(file.name);
                                }}
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                                title="Renomear"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteItem(file)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: NOVO ARQUIVO */}
      {newFileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <FilePlus className="w-5 h-5 text-blue-400" />
              <span>Criar Novo Arquivo</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Informe o nome e extensão (ex: <code>index.html</code>, <code>style.css</code>, <code>api.php</code>):
            </p>
            <input
              type="text"
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNewFile();
              }}
              placeholder="ex: app.js"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFileDialog(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateNewFile}
                disabled={!newItemName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold"
              >
                Criar e Abrir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVA PASTA */}
      {newFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-amber-400" />
              <span>Criar Nova Pasta</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Informe o nome da nova pasta dentro de <code>{currentPath}</code>:
            </p>
            <input
              type="text"
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNewFolder();
              }}
              placeholder="ex: assets, uploads, scripts"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderDialog(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateNewFolder}
                disabled={!newItemName.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold"
              >
                Criar Pasta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RENOMEAR */}
      {renameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-400" />
              <span>Renomear Item</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Novo nome para <code>{renameDialog.oldName}</code>:
            </p>
            <input
              type="text"
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameDialog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRename}
                disabled={!newItemName.trim() || newItemName === renameDialog.oldName}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold"
              >
                Salvar Novo Nome
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SFTP CREDENCIAIS */}
      {isSFTPModalOpen && service && (
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
