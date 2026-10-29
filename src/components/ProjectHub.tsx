'use client';

import React, { useState } from 'react';
import { SavedProject } from '@/types/cutting';
import {
  FolderPlus,
  FolderOpen,
  Scissors,
  Layers,
  ListPlus,
  Trash2,
  Calendar,
  ArrowRight,
  Plus,
} from 'lucide-react';

interface ProjectHubProps {
  savedProjects: SavedProject[];
  onOpenProject: (project: SavedProject) => void;
  onCreateNewProject: (projectName: string) => void;
  onDeleteProject: (projectId: string) => void;
  isCloudConnected?: boolean;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
  savedProjects,
  onOpenProject,
  onCreateNewProject,
  onDeleteProject,
  isCloudConnected = false,
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'existing'>('hub');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const handleStartNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || 'Nouveau Projet';
    onCreateNewProject(name);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      {/* Arrière-plan décoratif subtil */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl w-full mx-auto">
        {/* En-tête de bienvenue */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-600 text-amber-100 shadow-xl mb-4 border border-amber-400/30">
            <Scissors className="w-8 h-8 rotate-90" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Calepinage<span className="text-amber-500">Pro</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-3">
            {isCloudConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Connecté à Supabase Cloud (roadtrip-vercel)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                Mode Local (Supabase prêt à lier)
              </span>
            )}
          </div>
        </div>

        {/* Vue Principale : Choix Nouveau ou Existant */}
        {activeTab === 'hub' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* 1. Carte NOUVEAU PROJET */}
            <div
              onClick={() => setShowNewModal(true)}
              className="group cursor-pointer bg-slate-900/90 hover:bg-slate-850 border-2 border-slate-800 hover:border-amber-500/60 rounded-3xl p-6 sm:p-8 transition-all duration-200 shadow-xl hover:shadow-amber-500/10 flex flex-col justify-between"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all">
                  <FolderPlus className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  Nouveau Projet
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Démarrer un nouveau calepinage vierge. Tous les champs de
                  stock et de débit seront vides, prêts pour votre saisie.
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between text-amber-400 font-semibold text-xs sm:text-sm pt-4 border-t border-slate-800">
                <span>Créer un projet vierge</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 2. Carte PROJET EXISTANT */}
            <div
              onClick={() => setActiveTab('existing')}
              className="group cursor-pointer bg-slate-900/90 hover:bg-slate-850 border-2 border-slate-800 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 transition-all duration-200 shadow-xl hover:shadow-blue-500/10 flex flex-col justify-between"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-6 group-hover:scale-105 group-hover:bg-blue-500 group-hover:text-slate-950 transition-all">
                  <FolderOpen className="w-7 h-7" />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-white">
                    Projets Existants
                  </h2>
                  <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {savedProjects.length} disponible(s)
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Reprendre un débit sauvegardé précédemment ou choisir parmi
                  les modèles d&apos;atelier (caissons cuisine, dressing...).
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between text-blue-400 font-semibold text-xs sm:text-sm pt-4 border-t border-slate-800">
                <span>Parcourir mes projets</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        ) : (
          /* Vue Liste des Projets Existants */
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('hub')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors"
                >
                  ← Retour
                </button>
                <h2 className="text-lg font-bold text-white">
                  Sélectionner un Projet Existant
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau</span>
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                <FolderOpen className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <p>Aucun projet enregistré pour le moment.</p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-3 text-amber-400 hover:underline font-semibold"
                >
                  Créer un premier projet vierge
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
                {savedProjects.map((project) => {
                  const panelsCount = project.stockPanels.reduce(
                    (acc, p) => acc + p.quantity,
                    0
                  );
                  const itemsCount = project.cutItems.reduce(
                    (acc, i) => acc + i.quantity,
                    0
                  );

                  return (
                    <div
                      key={project.id}
                      className="bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-all flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">
                            {project.name}
                          </h3>
                          {project.description && (
                            <span className="text-[10px] text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 shrink-0">
                              Modèle
                            </span>
                          )}
                        </div>

                        {project.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                            {project.description}
                          </p>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mb-4">
                          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                            <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>
                              {panelsCount} panneau(x)
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                            <ListPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{itemsCount} pièce(s)</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(project.updatedAt).toLocaleDateString(
                            'fr-FR'
                          )}
                        </span>

                        <div className="flex items-center gap-2">
                          {/* Bouton supprimer (non disponible sur les modèles système) */}
                          {!project.id.startsWith('cuisine-') &&
                            !project.id.startsWith('dressing-') && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    window.confirm(
                                      `Supprimer le projet "${project.name}" ?`
                                    )
                                  ) {
                                    onDeleteProject(project.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                                title="Supprimer ce projet"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                          <button
                            type="button"
                            onClick={() => onOpenProject(project)}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-sm"
                          >
                            <span>Ouvrir</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal Création Nouveau Projet */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Nouveau Projet Vierge
                  </h3>
                  <p className="text-xs text-slate-400">
                    Démarrez avec aucun panneau ni pièce pré-remplis
                  </p>
                </div>
              </div>

              <form onSubmit={handleStartNew} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nom du projet
                  </label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: Bibliothèque Chêne, Meuble Salle de Bain..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-slate-950 text-white text-sm px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md"
                  >
                    Démarrer le projet vierge
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

