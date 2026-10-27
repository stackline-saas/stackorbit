import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  File,
  FileCode,
  FileText,
  Image as ImageIcon,
  Archive,
  Upload,
  Plus,
  Trash2,
  Edit2,
  Download,
  FolderPlus,
  RefreshCw,
  ChevronRight,
  Home,
  Check,
  AlertCircle,
  FileUp,
} from 'lucide-react';
import type { SiteFile } from '../types/index.ts';
import { SiteCodeEditorModal } from './SiteCodeEditorModal.tsx';

interface SiteFileManagerProps {
  serviceId: string;
  serviceName: string;
}

export const SiteFileManager: React.FC<SiteFileManagerProps> = ({ serviceId, serviceName }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modais
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedFileForEdit, setSelectedFileForEdit] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'folder'>('file');
  const [newItemName, setNewItemName] = useState('');

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<SiteFile | null>(null);
  const [renameNewName, setRenameNewName] = useState('');

  const [isExtracting, setIsExtracting] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega arquivos do caminho atual
  const loadFiles = async (subPath: string = currentPath) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sites/${serviceId}/files?path=${encodeURIComponent(subPath)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao carregar arquivos.');
      }

      const data = await res.json();
      setFiles(data.files || []);
      setCurrentPath(data.currentPath || '/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (serviceId) {
      loadFiles('/');
    }
  }, [serviceId]);

  // Navega para uma subpasta
  const handleNavigate = (path: string) => {
    loadFiles(path);
  };

  // Navega pelos breadcrumbs
  const breadcrumbParts = currentPath.split('/').filter(Boolean);

  // Abertura de arquivo para edição
  const handleOpenFile = (file: SiteFile) => {
    if (file.isDirectory) {
      handleNavigate(file.path);
    } else {
      setSelectedFileForEdit(file.path);
      setIsEditorOpen(true);
    }
  };

  // Criar novo arquivo ou pasta
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const fullItemPath = `${currentPath === '/' ? '' : currentPath}/${newItemName.trim()}`;
    try {
      const res = await fetch(`/api/sites/${serviceId}/files/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          path: fullItemPath,
          isDirectory: createType === 'folder',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao criar item.');
      }

      setIsCreateModalOpen(false);
      setNewItemName('');
      loadFiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Renomear item
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToRename || !renameNewName.trim()) return;

    const parentDir = currentPath === '/' ? '' : currentPath;
    const newPath = `${parentDir}/${renameNewName.trim()}`;

    try {
      const res = await fetch(`/api/sites/${serviceId}/files/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          oldPath: itemToRename.path,
          newPath,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao renomear item.');
      }

      setIsRenameModalOpen(false);
      setItemToRename(null);
      setRenameNewName('');
      loadFiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Excluir item
  const handleDelete = async (file: SiteFile) => {
    const confirmMsg = file.isDirectory
      ? `Tem certeza que deseja excluir a pasta "${file.name}" e todo o seu conteúdo?`
      : `Tem certeza que deseja excluir o arquivo "${file.name}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/sites/${serviceId}/files?path=${encodeURIComponent(file.path)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao excluir item.');
      }

      loadFiles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Extrair arquivo .zip
  const handleExtractZip = async (file: SiteFile) => {
    setIsExtracting(file.path);
    try {
      const res = await fetch(`/api/sites/${serviceId}/files/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          zipPath: file.path,
          targetPath: currentPath,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao extrair ZIP.');
      }

      loadFiles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(null);
    }
  };

  // Upload de arquivos
  const handleFileUpload = async (filesToUpload: FileList | null) => {
    if (!filesToUpload || filesToUpload.length === 0) return;

    const formData = new FormData();
    formData.append('targetPath', currentPath);
    for (let i = 0; i < filesToUpload.length; i++) {
      formData.append('files', filesToUpload[i]);
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/sites/${serviceId}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro no upload.');
      }

      loadFiles();
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  // Ícone por extensão
  const getFileIcon = (file: SiteFile) => {
    if (file.isDirectory) {
      return <Folder className="w-5 h-5 text-amber-500 shrink-0 fill-amber-500/20" />;
    }
    const ext = file.extension;
    if (['.html', '.php', '.js', '.ts', '.css', '.json', '.sql'].includes(ext)) {
      return <FileCode className="w-5 h-5 text-blue-500 shrink-0" />;
    }
    if (['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-emerald-500 shrink-0" />;
    }
    if (['.zip', '.tar', '.gz', '.rar'].includes(ext)) {
      return <Archive className="w-5 h-5 text-purple-500 shrink-0" />;
    }
    return <FileText className="w-5 h-5 text-slate-400 shrink-0" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col transition-all ${
        isDragging ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''
      }`}
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
      {/* Hidden File Input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Top Toolbar */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => handleNavigate('/')}
            className="flex items-center gap-1 hover:text-blue-600 transition-colors shrink-0"
          >
            <Home className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
            <span>raiz</span>
          </button>

          {breadcrumbParts.map((part, index) => {
            const pathUpToHere = '/' + breadcrumbParts.slice(0, index + 1).join('/');
            const isLast = index === breadcrumbParts.length - 1;
            return (
              <React.Fragment key={pathUpToHere}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <button
                  type="button"
                  onClick={() => handleNavigate(pathUpToHere)}
                  className={`hover:text-blue-600 transition-colors shrink-0 ${
                    isLast ? 'font-bold text-slate-900' : ''
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCreateType('file');
              setNewItemName('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Novo Arquivo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateType('folder');
              setNewItemName('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
            <span>Nova Pasta</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir Arquivos</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const url = `/api/sites/${serviceId}/files/download?path=${encodeURIComponent(currentPath)}`;
              window.open(url, '_blank');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
            title="Baixar pasta atual como ZIP"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Baixar ZIP</span>
          </button>

          <button
            type="button"
            onClick={() => loadFiles()}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all"
            title="Recarregar arquivos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mx-4 my-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Drag & Drop Overlay Notice */}
      {isDragging && (
        <div className="p-8 text-center text-blue-600 font-semibold text-xs border-2 border-dashed border-blue-400 m-4 rounded-xl bg-blue-50/50">
          Solte os arquivos aqui para fazer upload nesta pasta
        </div>
      )}

      {/* File List Table */}
      <div className="overflow-x-auto min-h-[300px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-400 font-semibold select-none">
              <th className="py-2.5 px-4">Nome</th>
              <th className="py-2.5 px-4 w-32">Tamanho</th>
              <th className="py-2.5 px-4 w-44">Modificado</th>
              <th className="py-2.5 px-4 w-40 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && files.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                  <span>Carregando arquivos do site...</span>
                </td>
              </tr>
            ) : files.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-400">
                  <FileUp className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-600">Esta pasta está vazia</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Arraste arquivos ou clique em "Subir Arquivos" para começar.
                  </p>
                </td>
              </tr>
            ) : (
              files.map((file) => {
                const isZip = file.extension === '.zip';
                return (
                  <tr
                    key={file.path}
                    className="hover:bg-slate-50/80 group transition-colors cursor-pointer"
                    onDoubleClick={() => handleOpenFile(file)}
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      <div className="flex items-center gap-2.5">
                        {getFileIcon(file)}
                        <span
                          onClick={() => handleOpenFile(file)}
                          className="hover:text-blue-600 hover:underline truncate max-w-md font-mono text-[11px]"
                        >
                          {file.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">
                      {file.isDirectory ? '—' : formatSize(file.size)}
                    </td>

                    <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                      {new Date(file.mtime).toLocaleString()}
                    </td>

                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                        {/* Se for ZIP, botão extrair */}
                        {isZip && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExtractZip(file);
                            }}
                            disabled={isExtracting === file.path}
                            className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors"
                            title="Descompactar no servidor"
                          >
                            <Archive className="w-3 h-3" />
                            <span>{isExtracting === file.path ? 'Extraindo...' : 'Descompactar'}</span>
                          </button>
                        )}

                        {/* Editar código se não for pasta */}
                        {!file.isDirectory && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFile(file);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar código"
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Baixar */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = `/api/sites/${serviceId}/files/download?path=${encodeURIComponent(file.path)}`;
                            window.open(url, '_blank');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Baixar"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Renomear */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToRename(file);
                            setRenameNewName(file.name);
                            setIsRenameModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Renomear"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Excluir */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Criar Arquivo / Pasta */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleCreateItem}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5 max-w-md w-full"
          >
            <h3 className="font-bold text-slate-900 text-sm mb-1">
              {createType === 'file' ? 'Novo Arquivo' : 'Nova Pasta'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Criando em: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">{currentPath}</code>
            </p>

            <input
              type="text"
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={createType === 'file' ? 'ex: index.html ou script.js' : 'ex: assets ou images'}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 font-mono"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!newItemName.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
              >
                Criar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Renomear */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleRename}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5 max-w-md w-full"
          >
            <h3 className="font-bold text-slate-900 text-sm mb-1">Renomear</h3>
            <p className="text-xs text-slate-500 mb-4 font-mono truncate">{itemToRename?.name}</p>

            <input
              type="text"
              autoFocus
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 font-mono"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!renameNewName.trim() || renameNewName === itemToRename?.name}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Editor de Código Monaco */}
      {isEditorOpen && selectedFileForEdit && (
        <SiteCodeEditorModal
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setSelectedFileForEdit(null);
          }}
          serviceId={serviceId}
          filePath={selectedFileForEdit}
          onSaved={() => loadFiles()}
        />
      )}
    </div>
  );
};
