'use client';

import React, { useState, useEffect } from 'react';
import { CutSettings, SavedProject } from '@/types/cutting';
import {
  FolderPlus,
  FolderOpen,
  Scissors,
  Trash2,
  Calendar,
  ArrowRight,
  Plus,
  Smartphone,
  Sparkles,
  Wrench,
  Disc,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const PRESET_KERFS = [2.4, 3.0, 3.2, 4.0];
const BASE_EDGE_BANDINGS = ['Sans', '1mm', '2mm', '3mm'];
const EDGE_STORAGE_KEY = 'calepinage_custom_edge_bandings';

interface ProjectHubProps {
  savedProjects: SavedProject[];
  onOpenProject: (project: SavedProject) => void;
  onCreateNewProject: (
    projectName: string,
    mode?: 'manual' | 'ai',
    initialSettings?: Partial<CutSettings>
  ) => void;
  onDeleteProject: (projectId: string) => void;
  isCloudConnected?: boolean;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
  savedProjects,
  onOpenProject,
  onCreateNewProject,
  onDeleteProject,
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'existing'>('hub');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProjectMode, setNewProjectMode] = useState<'manual' | 'ai'>('manual');

  // Paramètres obligatoires à la création avec l'IA : Trait de scie (épaisseur lame) & Bande de champs
  const [kerfInput, setKerfInput] = useState<string>('');
  const [edgeBandingInput, setEdgeBandingInput] = useState<string>('');
  const [customEdgeBandings, setCustomEdgeBandings] = useState<string[]>([]);
  const [isManualEdgeInput, setIsManualEdgeInput] = useState<boolean>(false);
  const [manualEdgeValue, setManualEdgeValue] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EDGE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomEdgeBandings(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const allEdgeBandingOptions = Array.from(
    new Set([...BASE_EDGE_BANDINGS, ...customEdgeBandings])
  );

  const handleOpenNewModal = (mode: 'manual' | 'ai') => {
    setNewProjectMode(mode);
    setNewProjectName('');
    // Forcer la saisie à vide pour que l'utilisateur choisisse explicitement l'épaisseur de lame et la bande de champs
    setKerfInput('');
    setEdgeBandingInput('');
    setIsManualEdgeInput(false);
    setManualEdgeValue('');
    setModalError(null);
    setShowNewModal(true);
  };

  const updateModalKerf = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    if (rounded >= 0.1 && rounded <= 15) {
      setKerfInput(String(rounded));
      setModalError(null);
    }
  };

  const handleSelectModalEdgeBanding = (val: string) => {
    if (val === '__manual__') {
      setIsManualEdgeInput(true);
      setManualEdgeValue('');
      setEdgeBandingInput('');
    } else {
      setIsManualEdgeInput(false);
      setEdgeBandingInput(val);
      setModalError(null);
    }
  };

  const handleManualEdgeValueChange = (raw: string) => {
    setManualEdgeValue(raw);
    const clean = raw.replace(',', '.').trim();
    const num = parseFloat(clean);
    if (!isNaN(num) && num >= 0) {
      const formatted = num === 0 ? 'Sans' : `${clean}mm`;
      setEdgeBandingInput(formatted);
      setModalError(null);
    } else if (raw.trim() === '') {
      setEdgeBandingInput('');
    }
  };

  const handleSaveManualEdgeChoice = () => {
    const clean = manualEdgeValue.replace(',', '.').trim();
    const num = parseFloat(clean);
    if (isNaN(num) || num <= 0) return;
    const formatted = `${clean}mm`;

    if (
      window.confirm(
        `Voulez-vous enregistrer « ${formatted} » dans la liste des bandes de champs pour vos prochains projets ?`
      )
    ) {
      if (!allEdgeBandingOptions.includes(formatted)) {
        const updated = [...customEdgeBandings, formatted];
        setCustomEdgeBandings(updated);
        try {
          localStorage.setItem(EDGE_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
      setIsManualEdgeInput(false);
      setEdgeBandingInput(formatted);
      setModalError(null);
    }
  };

  const handleStartNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim() || 'Nouveau Projet';

    if (newProjectMode === 'ai') {
      const parsedKerf = parseFloat(kerfInput.replace(',', '.'));
      if (!kerfInput.trim() || isNaN(parsedKerf) || parsedKerf <= 0) {
        setModalError(
          'Veuillez saisir ou sélectionner l’épaisseur de la lame (Trait de scie en mm).'
        );
        return;
      }
      if (!edgeBandingInput || !edgeBandingInput.trim()) {
        setModalError(
          'Veuillez sélectionner s’il y a de la bande de champs ou pas (Sans, 1mm, 2mm, 3mm...).'
        );
        return;
      }
      setShowNewModal(false);
      onCreateNewProject(name, 'ai', {
        kerf: Math.round(parsedKerf * 10) / 10,
        edgeBanding: edgeBandingInput.trim(),
      });
      return;
    }

    setShowNewModal(false);
    onCreateNewProject(name, newProjectMode);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative">
      {/* Bouton de bascule de Thème Clair / Sombre en haut à droite */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle showLabel />
      </div>
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
            Calepinage
          </h1>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('trigger-pwa-install'));
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-colors shadow-sm"
              title="Installer l'application sur votre écran d'accueil"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span>Installer l&apos;application</span>
            </button>
          </div>
        </div>

        {/* Vue Principale : Choix Nouveau ou Existant */}
        {activeTab === 'hub' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* 1. Carte NOUVEAU PROJET */}
            <div className="bg-slate-900/90 border-2 border-slate-800 hover:border-amber-500/60 rounded-3xl p-6 sm:p-8 transition-all duration-200 shadow-xl hover:shadow-amber-500/10 flex flex-col justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center transition-all">
                  <FolderPlus className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-white">
                  Nouveau Projet
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenNewModal('manual')}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 hover:border-amber-500/50 font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-95"
                >
                  <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Créer manuellement</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewModal('ai')}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-amber-900/30 active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-slate-950 shrink-0" />
                  <span>Créer avec l&apos;IA</span>
                </button>
              </div>
            </div>

            {/* 2. Carte PROJET EXISTANT */}
            <div
              onClick={() => setActiveTab('existing')}
              className="group cursor-pointer bg-slate-900/90 hover:bg-slate-850 border-2 border-slate-800 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 transition-all duration-200 shadow-xl hover:shadow-blue-500/10 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 shrink-0 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-105 group-hover:bg-blue-500 group-hover:text-slate-950 transition-all">
                      <FolderOpen className="w-7 h-7" />
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      Projets Existants
                    </h2>
                  </div>
                  <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    {savedProjects.length} disponible(s)
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Reprendre un débit sauvegardé précédemment ou choisir parmi
                  les modèles d&apos;atelier (caissons cuisine, dressing...).
                </p>
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
                onClick={() => handleOpenNewModal('manual')}
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
                  onClick={() => handleOpenNewModal('manual')}
                  className="mt-3 text-amber-400 hover:underline font-semibold"
                >
                  Créer un premier projet vierge
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {savedProjects.map((project) => (
                  <div
                    key={project.id}
                    className="bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-2xl px-4 py-3 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <h3 className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors truncate">
                        {project.name}
                      </h3>
                      {project.description && (
                        <span className="text-[10px] text-amber-400/90 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 shrink-0">
                          Modèle
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 text-xs">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {new Date(project.updatedAt).toLocaleDateString(
                          'fr-FR'
                        )}
                      </span>

                      {/* Bouton supprimer */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `Supprimer définitivement le projet "${project.name}" et effacer tous ses enregistrements sur Supabase Cloud ?`
                            )
                          ) {
                            onDeleteProject(project.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                        title="Supprimer ce projet"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenProject(project)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
                      >
                        <span>Ouvrir</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Création Nouveau Projet */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div role="dialog" aria-modal="true" className="modal-box bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-lg w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  {newProjectMode === 'ai' ? (
                    <Sparkles className="w-5 h-5" />
                  ) : (
                    <FolderPlus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {newProjectMode === 'ai'
                      ? 'Nouveau Projet avec l’IA'
                      : 'Nouveau Projet Manuel'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {newProjectMode === 'ai'
                      ? 'Renseignez les paramètres de coupe puis ouvrez l’Assistant IA'
                      : 'Nommez votre projet pour démarrer la saisie manuelle'}
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

                {newProjectMode === 'ai' && (
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3.5">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <Disc className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-bold text-white">
                        Paramètres de Coupe &amp; Lame de Scie (Obligatoires)
                      </span>
                    </div>

                    {/* 1. Épaisseur de la lame (Trait de scie) */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Épaisseur de la lame (Trait de scie) <span className="text-amber-400 font-bold">*</span> :
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-700">
                          <button
                            type="button"
                            onClick={() =>
                              updateModalKerf((parseFloat(kerfInput) || 3.0) - 0.1)
                            }
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                            title="-0.1 mm"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="15"
                            placeholder="Ex: 3.0"
                            value={kerfInput}
                            onChange={(e) => {
                              setKerfInput(e.target.value);
                              setModalError(null);
                            }}
                            className="w-16 text-center bg-slate-950 text-amber-400 font-mono font-bold text-xs px-1.5 py-1 rounded-lg border border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <span className="text-xs font-mono text-slate-400">mm</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateModalKerf((parseFloat(kerfInput) || 3.0) + 0.1)
                            }
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                            title="+0.1 mm"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {PRESET_KERFS.map((k) => {
                            const isSelected = parseFloat(kerfInput) === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => updateModalKerf(k)}
                                className={`text-[11px] px-2.5 py-1 rounded-lg font-mono transition-colors ${
                                  isSelected
                                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {k.toFixed(1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 2. Bande de champs */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                      <label className="block text-xs font-medium text-slate-300 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Bande de champs</span>
                        <span className="text-amber-400 font-bold">*</span>
                        <span>:</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={
                            isManualEdgeInput
                              ? '__manual__'
                              : allEdgeBandingOptions.includes(edgeBandingInput)
                                ? edgeBandingInput
                                : edgeBandingInput
                                  ? '__manual__'
                                  : ''
                          }
                          onChange={(e) => handleSelectModalEdgeBanding(e.target.value)}
                          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border focus:outline-none transition-colors ${
                            !edgeBandingInput
                              ? 'bg-slate-900 text-amber-300 border-amber-500/80'
                              : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                          }`}
                        >
                          <option value="" disabled>
                            -- Choisir l&apos;épaisseur * --
                          </option>
                          {allEdgeBandingOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                          <option value="__manual__">
                            Autre épaisseur (saisie manuelle)...
                          </option>
                        </select>

                        {isManualEdgeInput && (
                          <div className="flex items-center gap-1 bg-slate-900 border border-amber-500/70 rounded-lg px-2 py-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Ex: 0.8"
                              value={manualEdgeValue}
                              onChange={(e) => handleManualEdgeValueChange(e.target.value)}
                              className="w-14 bg-transparent text-xs font-mono font-bold text-amber-300 focus:outline-none placeholder:text-slate-600"
                              autoFocus
                            />
                            <span className="text-[11px] font-mono text-slate-400">mm</span>
                            {manualEdgeValue.trim() !== '' && (
                              <button
                                type="button"
                                onClick={handleSaveManualEdgeChoice}
                                className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition-colors flex items-center gap-0.5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Mémoriser</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          {BASE_EDGE_BANDINGS.map((preset) => (
                            <button
                              key={`modal-band-${preset}`}
                              type="button"
                              onClick={() => {
                                setIsManualEdgeInput(false);
                                setEdgeBandingInput(preset);
                                setModalError(null);
                              }}
                              className={`text-[11px] px-2.5 py-1 rounded-lg font-mono transition-colors ${
                                edgeBandingInput === preset
                                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {modalError && (
                  <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

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
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md flex items-center gap-1.5"
                  >
                    {newProjectMode === 'ai' ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Continuer vers l&apos;IA</span>
                      </>
                    ) : (
                      <span>Créer le projet</span>
                    )}
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

