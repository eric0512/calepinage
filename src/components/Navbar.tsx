'use client';

import React from 'react';
import {
  Scissors,
  Printer,
  RotateCcw,
  Sparkles,
  FolderOpen,
  Save,
  Check,
} from 'lucide-react';
import { PRESETS, ProjectPreset } from '@/lib/presets';

interface NavbarProps {
  projectName?: string;
  onOpenHub: () => void;
  onSaveProject: () => void;
  onLoadPreset: (preset: ProjectPreset) => void;
  onReset: () => void;
  onPrint: () => void;
  isSaved?: boolean;
  isCloudConnected?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  projectName = 'Mon Projet',
  onOpenHub,
  onSaveProject,
  onLoadPreset,
  onReset,
  onPrint,
  isSaved = false,
  isCloudConnected = false,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Titre avec retour Hub */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onOpenHub}
              className="flex items-center gap-3 text-left group hover:opacity-95 transition-opacity"
              title="Retourner à l'accueil / Changer de projet"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                <Scissors className="w-5 h-5 text-amber-100 rotate-90" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-bold tracking-tight text-white">
                    Calepinage<span className="text-amber-500">Pro</span>
                  </span>
                  <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Menuiserie 2D
                  </span>
                  {isCloudConnected ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Supabase Cloud
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      Stockage Local
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                  <span className="truncate max-w-[130px] sm:max-w-[200px] text-amber-400">
                    {projectName}
                  </span>
                  <span className="text-[10px] text-slate-500">•</span>
                  <span className="text-[11px] text-slate-400 underline decoration-slate-600 hover:text-white">
                    Changer
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Actions & Presets */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Bouton Projets (Accueil) */}
            <button
              type="button"
              onClick={onOpenHub}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
              title="Ouvrir la liste de vos projets"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Mes Projets</span>
            </button>

            {/* Bouton Sauvegarder Projet */}
            <button
              type="button"
              onClick={onSaveProject}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                isSaved
                  ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-600 hover:bg-amber-500 text-slate-950'
              }`}
              title="Enregistrer ce projet"
            >
              {isSaved ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Enregistré</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sauvegarder</span>
                </>
              )}
            </button>

            {/* Presets Démo */}
            <div className="relative group hidden sm:block">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Modèles</span>
              </button>
              <div className="absolute right-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Charger un modèle d&apos;atelier
                </div>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onLoadPreset(p)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700/80 hover:text-white transition-colors"
                  >
                    <div className="font-semibold text-amber-400">{p.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {p.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Imprimer / Export dossier */}
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
              title="Imprimer le dossier de fabrication atelier"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">Dossier</span>
            </button>

            {/* Réinitialiser */}
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-950/30 border border-transparent transition-colors"
              title="Vider et réinitialiser"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
