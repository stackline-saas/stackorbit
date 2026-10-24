import React, { useState, useRef, useEffect } from 'react';
import { FolderGit2, ChevronDown, Check, Plus, Layers, Network } from 'lucide-react';
import type { Project } from '../../types';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProjectClick?: () => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProjectClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentProject = projects.find((p) => p.id === selectedProjectId) || null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white shadow-2xs hover:bg-slate-50 transition-all text-xs text-slate-800"
        title="Filtrar por Projeto"
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-50 text-blue-600">
          {currentProject?.type === 'SWARM' ? (
            <Network className="w-3.5 h-3.5" />
          ) : (
            <FolderGit2 className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="text-left flex flex-col leading-tight">
          <span className="text-[10px] text-slate-400 font-medium">Projeto</span>
          <span className="font-semibold truncate max-w-[130px]">
            {currentProject ? currentProject.name : 'Todos os Projetos'}
          </span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Selecione o Contexto
          </div>

          {/* Opção: Todos os Projetos */}
          <button
            type="button"
            onClick={() => {
              onSelectProject(null);
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 transition-colors ${
              selectedProjectId === null ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Visão Geral (Todos os Projetos)</span>
            </div>
            {selectedProjectId === null && <Check className="w-3.5 h-3.5 text-blue-600" />}
          </button>

          <div className="h-px bg-slate-100 my-1" />

          {/* Lista de Projetos */}
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {projects.map((proj) => {
              const isSelected = proj.id === selectedProjectId;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(proj.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-slate-50 transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderGit2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <div className="truncate">
                      <div className="truncate">{proj.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        {proj.hostsCount ?? 0} nó(s) • {proj.servicesCount ?? 0} serviço(s)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {proj.type === 'SWARM' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        Swarm
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                </button>
              );
            })}
          </div>

          {onCreateProjectClick && (
            <>
              <div className="h-px bg-slate-100 my-1" />
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onCreateProjectClick();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Novo Projeto</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
