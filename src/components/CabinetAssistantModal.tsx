'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Layers,
  Box,
  Plus,
  X,
  Sliders,
  Send,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Star,
  BookmarkPlus,
  Trash2,
  FileText,
} from 'lucide-react';
import { CutItem, StockPanel, WorkshopItem } from '@/types/cutting';
import {
  CabinetConfig,
  BackType,
  AssemblyType,
  calculateCabinetPieces,
  parseCabinetPromptWithNLP,
  extractThicknessFromMaterialName,
} from '@/lib/cabinet-calculator';

interface CabinetAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPieces: (newItems: CutItem[]) => void;
  onAddAndOptimize?: (newItems: CutItem[]) => void;
  availableMaterials: string[];
  stockPanels?: StockPanel[];
  workshopStock?: WorkshopItem[];
}

export interface CustomCabinetPreset {
  id: string;
  name: string;
  prompt: string;
  config: CabinetConfig;
  createdAt: number;
}

/**
 * Génère automatiquement un texte de prompt complet et clair à partir des paramètres du meuble
 */
export function generatePromptFromConfig(c: CabinetConfig): string {
  const parts: string[] = [];
  parts.push(`Je veux un caisson de ${c.height} de haut, ${c.width} de large et ${c.depth} de profondeur`);
  parts.push(`en ${c.material || 'Mélaminé'} (épaisseur ${c.thickness} mm)`);

  if (c.partitionsCount > 0) {
    if (c.partitionsCount === 1) {
      parts.push(`avec 1 séparation centrale au milieu (2 compartiments)`);
    } else {
      parts.push(`avec ${c.partitionsCount} séparations verticales (${c.partitionsCount + 1} compartiments)`);
    }
  }

  if (c.shelvesCount > 0) {
    if (c.partitionsCount > 0) {
      parts.push(`${c.shelvesCount} étagères de chaque côté (retrait ${c.shelfRecess || 20} mm)`);
    } else {
      parts.push(`${c.shelvesCount} étagère(s) intérieure(s)`);
    }
  }

  if (c.assemblyType === 'bottom_inside_top_over') {
    const debords: string[] = [];
    if (c.topOverhangSides) debords.push(`${c.topOverhangSides} mm sur les côtés`);
    if (c.topOverhangFront) debords.push(`${c.topOverhangFront} mm sur l'avant`);
    parts.push(
      `le plateau du bas sera encastré entre les côtés, le plateau du haut sera posé sur les côtés${
        debords.length > 0 ? ` avec un débord de ${debords.join(' et ')}` : ''
      }`
    );
  } else if (c.assemblyType === 'sides_full') {
    parts.push(`haut et bas à l'intérieur entre les côtés`);
  } else if (c.assemblyType === 'top_bottom_full') {
    parts.push(`dessus et dessous filants (côtés à l'intérieur)`);
  }

  if (c.backType === 'groove') {
    parts.push(`fond en ${c.backMaterial || 'MDF'} de ${c.backThickness} mm encastré`);
  } else if (c.backType === 'applique') {
    parts.push(`fond en applique arrière (${c.backMaterial || `MDF ${c.backThickness} mm`})`);
  } else {
    parts.push(`sans fond`);
  }

  if (c.doors === 'one_door') {
    parts.push(`1 porte battante en applique`);
  } else if (c.doors === 'two_doors') {
    parts.push(`2 portes battantes en applique`);
  }

  if (c.cabinetCount && c.cabinetCount > 1) {
    parts.push(`quantité : ${c.cabinetCount} caissons`);
  }

  return parts.join(', ') + '.';
}

const DEFAULT_CONFIG: CabinetConfig = {
  name: 'Caisson Meuble',
  height: 720,
  width: 600,
  depth: 560,
  thickness: 18,
  assemblyType: 'sides_full', // Montants continus (Haut et Bas intérieurs)
  backType: 'applique',
  backThickness: 8,
  backMaterial: 'MDF 8mm',
  shelvesCount: 1,
  shelfRecess: 20,
  partitionsCount: 0,
  doors: 'none',
  material: 'MDF 18mm',
  cabinetCount: 1,
};

const PROMPT_PRESETS = [
  {
    label: 'Caisson 700×1000 avec séparation & débord',
    prompt:
      'Caisson de 700 de haut, 1000 de large et 450 de profondeur avec séparation au milieu et 2 étagères de chaque côté, bas encastré, haut posé avec débord de 2 cm sur les côtés et l\'avant, fond mdf 9mm encastré',
  },
  {
    label: 'Caisson bas cuisine 720×600',
    prompt:
      'Caisson bas de cuisine 720x600x560 en mélaminé 18mm avec haut et bas à l\'intérieur, 1 étagère retrait 20mm et un fond de 8mm',
  },
  {
    label: 'Meuble haut 700×500',
    prompt:
      'Caisson haut 700x500x320 en 18mm avec haut et bas à l\'intérieur, 2 étagères et fond applique de 8mm',
  },
  {
    label: 'Placard dressing 2000×800',
    prompt:
      'Grand meuble dressing 2000x800x550 en 19mm avec 4 étagères, fond de 8mm et montants filants',
  },
  {
    label: 'Caisson 900 avec séparation centrale',
    prompt:
      'Meuble bas 800x900x500 en 18mm avec séparation centrale et 2 étagères',
  },
];

export const CabinetAssistantModal: React.FC<CabinetAssistantModalProps> = ({
  isOpen,
  onClose,
  onAddPieces,
  availableMaterials,
  stockPanels = [],
  workshopStock = [],
}) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'ai'>('visual');
  const [config, setConfig] = useState<CabinetConfig>(() => {
    // 1. Priorité au stock saisi ou stock atelier pour la matière principale
    const preferredStockMat =
      stockPanels[0]?.material ||
      workshopStock[0]?.material ||
      availableMaterials[0] ||
      DEFAULT_CONFIG.material;
    const detectedThickness = extractThicknessFromMaterialName(preferredStockMat);

    // 2. Recherche d'une chute ou d'un panneau fin pour le fond
    const thinStock =
      workshopStock.find((w) => {
        const th = extractThicknessFromMaterialName(w.material);
        return th && th <= 10;
      }) ||
      stockPanels.find((p) => {
        const th = extractThicknessFromMaterialName(p.material);
        return th && th <= 10;
      });

    return {
      ...DEFAULT_CONFIG,
      material: preferredStockMat,
      ...(detectedThickness ? { thickness: detectedThickness } : {}),
      ...(thinStock
        ? {
            backMaterial: thinStock.material,
            backThickness: extractThicknessFromMaterialName(thinStock.material) || 8,
          }
        : {}),
    };
  });

  // Prompt IA & Presets Personnalisés
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  // Modèles préprogrammés par l'utilisateur (Persistés en LocalStorage)
  const [customPresets, setCustomPresets] = useState<CustomCabinetPreset[]>([]);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showGuidedTemplate, setShowGuidedTemplate] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('calepinage_user_cabinet_presets');
      if (saved) {
        setCustomPresets(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  // Sauvegarder la configuration actuelle comme modèle préprogrammé
  const handleSaveCurrentAsPreset = (nameToSave: string) => {
    const trimmed = nameToSave.trim() || config.name || 'Mon Modèle Caisson';
    const newPreset: CustomCabinetPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: trimmed,
      prompt: generatePromptFromConfig(config),
      config: { ...config, name: trimmed },
      createdAt: Date.now(),
    };
    const updated = [newPreset, ...customPresets.filter((p) => p.name !== trimmed)];
    setCustomPresets(updated);
    try {
      localStorage.setItem('calepinage_user_cabinet_presets', JSON.stringify(updated));
    } catch {
      // ignore
    }
    setIsSavingPreset(false);
    setNewPresetName('');
    setAiSuccessMessage(`⭐ Modèle préprogrammé "${trimmed}" enregistré pour tous vos projets !`);
  };

  // Supprimer un modèle personnalisé
  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    try {
      localStorage.setItem('calepinage_user_cabinet_presets', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Charger un modèle personnalisé préprogrammé
  const handleApplyCustomPreset = (preset: CustomCabinetPreset) => {
    setConfig({ ...preset.config });
    if (preset.prompt) {
      setAiPrompt(preset.prompt);
    }
    setAiSuccessMessage(`Modèle "${preset.name}" chargé avec succès !`);
  };

  // Synchroniser la matière et l'épaisseur par défaut si disponible
  useEffect(() => {
    if (stockPanels.length > 0 || workshopStock.length > 0 || availableMaterials.length > 0) {
      setConfig((prev) => {
        const allKnown = [
          ...stockPanels.map((p) => p.material),
          ...workshopStock.map((w) => w.material),
          ...availableMaterials,
        ];
        const currentValid = allKnown.includes(prev.material);
        const targetMat = currentValid
          ? prev.material
          : stockPanels[0]?.material || workshopStock[0]?.material || availableMaterials[0] || prev.material;
        const detected = extractThicknessFromMaterialName(targetMat);
        return {
          ...prev,
          material: targetMat,
          ...(detected ? { thickness: detected } : {}),
        };
      });
    }
  }, [stockPanels, workshopStock, availableMaterials]);

  // Gestion du changement de matière avec détection automatique de l'épaisseur
  const handleMaterialChange = (newMat: string) => {
    const detectedThickness = extractThicknessFromMaterialName(newMat);
    setConfig((prev) => {
      const base = newMat.replace(/\s*\d{1,2}\s*mm/i, '').trim();
      let updatedBack = prev.backMaterial;
      if (!updatedBack || updatedBack === prev.material) {
        updatedBack = `${base || 'MDF'} ${prev.backThickness || 8}mm`;
      }
      return {
        ...prev,
        material: newMat,
        ...(detectedThickness ? { thickness: detectedThickness } : {}),
        backMaterial: updatedBack,
      };
    });
  };

  // Liste dynamique des boutons d'épaisseur
  const thicknessOptions = useMemo(() => {
    const defaultList = [15, 16, 18, 19, 22];
    if (config.thickness && !defaultList.includes(config.thickness)) {
      return [...defaultList, config.thickness].sort((a, b) => a - b);
    }
    return defaultList;
  }, [config.thickness]);

  // Calcul mathématique rigoureux des pièces
  const calculated = useMemo(() => {
    return calculateCabinetPieces(config);
  }, [config]);

  // Traiter la demande IA (via API ou NLP local)
  const handleAnalyzePrompt = async (promptToRun?: string) => {
    const text = promptToRun || aiPrompt;
    if (!text.trim()) return;

    setIsAnalyzing(true);
    setAiSuccessMessage(null);

    try {
      // 1. Tenter l'appel API (support Gemini si configuré)
      const res = await fetch('/api/ai/cabinet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          availableMaterials,
          stockPanels,
          workshopStock,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig((prev) => {
            const rawMat = data.config.material || prev.material;
            const detThick = extractThicknessFromMaterialName(rawMat);
            const bThick = data.config.backThickness || prev.backThickness || 8;
            let bMat = data.config.backMaterial;
            if (!bMat && bThick) {
              const base = rawMat.replace(/\s*\d{1,2}\s*mm/i, '').trim();
              bMat = `${base || 'MDF'} ${bThick}mm`;
            }
            return {
              ...prev,
              ...data.config,
              material: rawMat,
              ...(detThick ? { thickness: detThick } : {}),
              backThickness: bThick,
              backMaterial: bMat || prev.backMaterial,
            };
          });
          setAiSuccessMessage(
            data.source === 'gemini-ai'
              ? 'Paramètres déduits avec succès par l\'IA Gemini !'
              : 'Paramètres déduits avec succès par l\'analyseur intelligent !'
          );
          setTimeout(() => setActiveTab('visual'), 600);
          return;
        }
      }
    } catch {
      // Fallback local direct
    } finally {
      setIsAnalyzing(false);
    }

    // 2. Fallback NLP local garanti
    const local = parseCabinetPromptWithNLP(
      text,
      availableMaterials,
      stockPanels,
      workshopStock
    );
    setConfig((prev) => {
      const rawMat = local.material || prev.material;
      const detThick = extractThicknessFromMaterialName(rawMat);
      const bThick = local.backThickness || prev.backThickness || 8;
      let bMat = local.backMaterial;
      if (!bMat && bThick) {
        const base = rawMat.replace(/\s*\d{1,2}\s*mm/i, '').trim();
        bMat = `${base || 'MDF'} ${bThick}mm`;
      }
      return {
        ...prev,
        ...local,
        material: rawMat,
        ...(detThick ? { thickness: detThick } : {}),
        backThickness: bThick,
        backMaterial: bMat || prev.backMaterial,
      };
    });
    setAiSuccessMessage('Paramètres calculés avec succès !');
    setIsAnalyzing(false);
    setTimeout(() => setActiveTab('visual'), 600);
  };

  // Détection des matières utilisées par l'IA qui ne sont présentes ni en stock saisi ni en atelier
  const missingMaterialsInAssistant = useMemo(() => {
    const stockMatSet = new Set([
      ...stockPanels.map((p) => p.material.trim().toLowerCase()),
      ...workshopStock.map((w) => w.material.trim().toLowerCase()),
    ]);
    const missing = new Set<string>();
    calculated.cutItems.forEach((it) => {
      if (it.material && !stockMatSet.has(it.material.trim().toLowerCase())) {
        missing.add(it.material.trim());
      }
    });
    return Array.from(missing);
  }, [calculated.cutItems, stockPanels, workshopStock]);

  // Injection des pièces calculées dans la liste de débit (sans optimisation :
  // le calepinage se lance depuis le projet une fois tous les caissons saisis)
  const handleInjectPieces = () => {
    onAddPieces(calculated.cutItems);
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" className="modal-box bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white">
        {/* En-tête de la modale */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/95 gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Assistant Caisson &amp; Mobilier IA
                </h2>
                <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                  Calculateur de débit
                </span>
              </div>

              {/* Bouton d'enregistrement de modèle préprogrammé placé directement sous le titre */}
              <div>
                {!isSavingPreset ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNewPresetName(config.name || 'Mon Caisson Modèle');
                      setIsSavingPreset(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold transition-all shadow-sm"
                    title="Enregistrer la configuration actuelle pour la réutiliser dans tous vos projets futurs"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Enregistrer comme modèle préprogrammé</span>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5 bg-slate-900 border border-amber-500/60 p-1 rounded-lg">
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="Nom du modèle..."
                      className="bg-slate-800 text-white px-2 py-0.5 rounded text-xs focus:outline-none w-36 sm:w-48"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCurrentAsPreset(newPresetName);
                        if (e.key === 'Escape') setIsSavingPreset(false);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveCurrentAsPreset(newPresetName)}
                      className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs"
                    >
                      Sauvegarder
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSavingPreset(false)}
                      className="px-1.5 py-0.5 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'onglets : Visuel Paramétrique vs Commande IA */}
        <div className="border-b border-slate-800 bg-slate-950/60 px-4 sm:px-5 py-2.5">
          <div className="ai-tab-pill-container flex w-full bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              className={`flex-1 py-2 px-2.5 sm:px-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'visual'
                  ? 'ai-tab-pill-active bg-amber-600 text-white'
                  : 'ai-tab-pill-inactive text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4 shrink-0" />
              <span>1. Configuration Visuelle (Champs directs)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={`flex-1 py-2 px-2.5 sm:px-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'ai'
                  ? 'ai-tab-pill-active bg-amber-600 text-white'
                  : 'ai-tab-pill-inactive text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>2. Assistant Prompt IA &amp; Gabarits</span>
            </button>
          </div>
        </div>

        {/* Corps de la modale scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* VUE 1 : ASSISTANT PROMPT IA & GABARITS */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {/* Zone IA avec 2 onglets : 1) Description libre, 2) Remplir les cases */}
              <div className="bg-slate-850 p-4 rounded-2xl border border-slate-700/80 space-y-3">
                <label className="text-xs font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Décrivez votre meuble ou utilisez un gabarit préprogrammé :</span>
                </label>

                {/* Sélecteur à 2 onglets : Description vs Remplir les cases */}
                <div className="ai-tab-pill-container flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowGuidedTemplate(false)}
                    className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      !showGuidedTemplate
                        ? 'ai-tab-pill-active bg-amber-600 text-white'
                        : 'ai-tab-pill-inactive text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Description du meuble</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGuidedTemplate(true)}
                    className={`flex-1 py-2 px-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                      showGuidedTemplate
                        ? 'ai-tab-pill-active bg-amber-600 text-white'
                        : 'ai-tab-pill-inactive text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Remplir les cases</span>
                  </button>
                </div>

                {/* ONGLET 2 : Remplir les cases (Gabarit guidé) */}
                {showGuidedTemplate ? (
                  <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-3.5 space-y-3 animate-in fade-in duration-150 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Gabarit de prompt préprogrammé</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Remplissez simplement les cases ci-dessous
                      </span>
                    </div>

                    {/* LIGNE 1 : Hauteur, Largeur et Profondeur toujours sur la même ligne */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1 truncate">Hauteur (mm) :</label>
                        <input
                          type="number"
                          value={config.height}
                          onChange={(e) => setConfig({ ...config, height: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1 truncate">Largeur (mm) :</label>
                        <input
                          type="number"
                          value={config.width}
                          onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1 truncate">Profondeur (mm) :</label>
                        <input
                          type="number"
                          value={config.depth}
                          onChange={(e) => setConfig({ ...config, depth: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-center"
                        />
                      </div>
                    </div>

                    {/* Autres paramètres du gabarit */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">
                          Séparations (jusqu&apos;à 4) :
                        </label>
                        <select
                          value={config.partitionsCount}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              partitionsCount: Math.min(4, Math.max(0, parseInt(e.target.value) || 0)),
                            })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                        >
                          <option value={0}>0 - Aucune (1 compartiment)</option>
                          <option value={1}>1 séparation (2 compartiments)</option>
                          <option value={2}>2 séparations (3 compartiments)</option>
                          <option value={3}>3 séparations (4 compartiments)</option>
                          <option value={4}>4 séparations (5 compartiments)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">Étagères par côté :</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={config.shelvesCount}
                          onChange={(e) => setConfig({ ...config, shelvesCount: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">Mode d&apos;assemblage :</label>
                        <select
                          value={config.assemblyType}
                          onChange={(e) => setConfig({ ...config, assemblyType: e.target.value as AssemblyType })}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                        >
                          <option value="bottom_inside_top_over">Bas encastré / Dessus posé</option>
                          <option value="sides_full">Haut &amp; Bas intérieurs</option>
                          <option value="top_bottom_full">Dessus/Dessous filants</option>
                        </select>
                      </div>

                      {config.assemblyType === 'bottom_inside_top_over' && (
                        <>
                          <div>
                            <label className="text-[11px] text-purple-300 block mb-1">Débord côtés (mm) :</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={config.topOverhangSides || 0}
                              onChange={(e) => setConfig({ ...config, topOverhangSides: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-800 border border-purple-500/50 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-purple-300 block mb-1">Débord avant (mm) :</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={config.topOverhangFront || 0}
                              onChange={(e) => setConfig({ ...config, topOverhangFront: parseInt(e.target.value) || 0 })}
                              className="w-full bg-slate-800 border border-purple-500/50 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">Fond du caisson :</label>
                        <select
                          value={config.backType}
                          onChange={(e) => setConfig({ ...config, backType: e.target.value as BackType })}
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                        >
                          <option value="groove">Encastré (rainure)</option>
                          <option value="applique">En applique arrière</option>
                          <option value="none">Sans fond</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          const generated = generatePromptFromConfig(config);
                          setAiPrompt(generated);
                          setShowGuidedTemplate(false);
                          handleAnalyzePrompt(generated);
                        }}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Générer le prompt &amp; Appliquer</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ONGLET 1 : Description libre du meuble */
                  <div className="relative animate-in fade-in duration-150">
                    <textarea
                      rows={3}
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Ex: Je veux un caisson de 700 de haut, 1000 de large et 450 de profondeur avec séparation au milieu et 2 étagères de chaque côté, bas encastré, haut posé avec débord de 2 cm..."
                      className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAnalyzePrompt()}
                      disabled={isAnalyzing || !aiPrompt.trim()}
                      className="mt-2 w-full sm:w-auto sm:absolute sm:bottom-3 sm:right-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Analyse en cours...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5 text-slate-950" />
                          <span>Analyser et configurer</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {aiSuccessMessage && (
                  <div className="mt-3 p-2.5 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{aiSuccessMessage}</span>
                  </div>
                )}
              </div>

              {/* Mes modèles préprogrammés personnalisés (Sauvegardés par l'utilisateur) */}
              {customPresets.length > 0 && (
                <div className="bg-slate-850 p-4 rounded-2xl border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span>Mes Modèles Préprogrammés ({customPresets.length})</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Disponibles dans tous vos projets
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customPresets.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handleApplyCustomPreset(preset)}
                        className="text-left p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-400 transition-all text-xs cursor-pointer group flex items-start justify-between gap-2"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="font-bold text-white group-hover:text-amber-300 transition-colors truncate flex items-center gap-1.5">
                            <Star className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />
                            <span>{preset.name}</span>
                          </div>
                          <p className="text-[11px] font-mono text-amber-400/90">
                            {preset.config.height} × {preset.config.width} × {preset.config.depth} mm
                            {preset.config.partitionsCount > 0 && ' • Séparation'}
                            {preset.config.topOverhangSides ? ` • Débord ${preset.config.topOverhangSides}mm` : ''}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {preset.config.material} ({preset.config.thickness}mm)
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleDeletePreset(preset.id, e)}
                          title="Supprimer ce modèle"
                          className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exemples rapides en 1 clic */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">
                  Ou chargez un modèle standard d&apos;exemple :
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PROMPT_PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAiPrompt(p.prompt);
                        handleAnalyzePrompt(p.prompt);
                      }}
                      className="text-left p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition-colors text-xs space-y-1 group"
                    >
                      <div className="font-bold text-white group-hover:text-amber-400 transition-colors flex items-center justify-between">
                        <span>{p.label}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-1 transition-transform" />
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1">{p.prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VUE 2 : CONFIGURATION VISUELLE & SCHÉMA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Colonne Gauche : Formulaire de paramétrage (7 colonnes) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Raccourcis modèles préprogrammés (si enregistrés) */}
              {customPresets.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>Modèles rapides :</span>
                  </span>
                  {customPresets.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => handleApplyCustomPreset(pr)}
                      className="px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 border border-amber-500/30 hover:border-amber-400 text-slate-200 hover:text-white shrink-0 text-[11px] font-medium flex items-center gap-1 transition-all shadow-sm"
                    >
                      <span>{pr.name}</span>
                      <span className="text-amber-400 font-mono text-[10px]">
                        ({pr.config.height}×{pr.config.width})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Nom du meuble, Matière et Nbre de caissons (alignés sur la même ligne) */}
              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800">
                <div className="grid grid-cols-12 gap-2 sm:gap-2.5 items-end">
                  {/* 1. Nom du meuble (réduit) */}
                  <div className="col-span-5 sm:col-span-4 min-w-0">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 truncate">
                      <span className="sm:hidden">Nom</span>
                      <span className="hidden sm:inline">Nom du meuble</span>
                    </label>
                    <input
                      type="text"
                      value={config.name}
                      onChange={(e) => setConfig({ ...config, name: e.target.value })}
                      placeholder="Ex: Caisson Meuble"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 truncate"
                    />
                  </div>

                  {/* 2. Matière du caisson (réduit) */}
                  <div className="col-span-4 sm:col-span-5 min-w-0">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 truncate">
                      <span className="sm:hidden">Matière</span>
                      <span className="hidden sm:inline">Matière du caisson</span>
                    </label>
                    <select
                      value={config.material}
                      onChange={(e) => handleMaterialChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white truncate focus:outline-none focus:border-amber-500 font-medium"
                    >
                      {stockPanels.length > 0 && (
                        <optgroup label="📦 En Stock Saisi (Panneaux projet)">
                          {stockPanels.map((p, idx) => (
                            <option key={`sp-${p.id || idx}`} value={p.material}>
                              {p.material} ({p.length}×{p.width} mm - {p.quantity} dispo)
                            </option>
                          ))}
                        </optgroup>
                      )}

                      {workshopStock.length > 0 && (
                        <optgroup label="🏭 En Stock Atelier (Chutes réutilisables)">
                          {workshopStock.map((w, idx) => (
                            <option key={`ws-${w.id || idx}`} value={w.material}>
                              {w.material} ({w.length}×{w.width} mm - {w.quantity} chute(s))
                            </option>
                          ))}
                        </optgroup>
                      )}

                      <optgroup label="📋 Autres matières">
                        {availableMaterials
                          .filter(
                            (m) =>
                              !stockPanels.some((p) => p.material === m) &&
                              !workshopStock.some((w) => w.material === m)
                          )
                          .map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                      </optgroup>

                      {!availableMaterials.includes(config.material) &&
                        !stockPanels.some((p) => p.material === config.material) &&
                        !workshopStock.some((w) => w.material === config.material) && (
                          <option value={config.material}>{config.material}</option>
                        )}
                    </select>
                  </div>

                  {/* 3. Nbre de caissons */}
                  <div className="col-span-3 min-w-0">
                    <label className="block text-[11px] font-bold text-amber-300 mb-1 truncate text-center sm:text-left">
                      <span className="sm:hidden">Nbre caisson</span>
                      <span className="hidden sm:inline">Nbre de caissons</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={config.cabinetCount || 1}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setConfig({
                          ...config,
                          cabinetCount: isNaN(val) || val < 1 ? 1 : val,
                        });
                      }}
                      className="w-full bg-slate-900 border border-amber-500/50 focus:border-amber-400 rounded-lg px-2 py-1.5 text-xs text-amber-400 font-mono font-bold text-center shadow-inner"
                      title="Nombre de caissons identiques à débiter"
                    />
                  </div>
                </div>
              </div>

              {/* Dimensions extérieures & Épaisseur */}
              <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Box className="w-4 h-4" />
                  <span>Dimensions Extérieures Totales (mm)</span>
                </h4>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Hauteur (H)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="3000"
                      value={config.height}
                      onChange={(e) =>
                        setConfig({ ...config, height: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Largeur (L)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="3000"
                      value={config.width}
                      onChange={(e) =>
                        setConfig({ ...config, width: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Profondeur (P)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="3000"
                      value={config.depth}
                      onChange={(e) =>
                        setConfig({ ...config, depth: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-300 font-semibold">
                    Épaisseur du bois :
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {thicknessOptions.map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => setConfig({ ...config, thickness: th })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                          config.thickness === th
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-900 text-slate-300 hover:bg-slate-750 border border-slate-700'
                        }`}
                      >
                        {th} mm
                      </button>
                    ))}
                    <div className="inline-flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                      <input
                        type="number"
                        min="3"
                        max="50"
                        value={config.thickness}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            thickness: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-8 bg-transparent text-center text-xs font-mono font-bold text-amber-400 focus:outline-none"
                      />
                      <span className="text-[10px] text-slate-400">mm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Type d'assemblage (Le point clé en menuiserie !) */}
              <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Mode d&apos;Assemblage des Panneaux</span>
                  </h4>
                  <span className="text-[11px] text-amber-300 font-medium">
                    Calcul automatique des déductions
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1 : Montants continus (Haut/Bas à l'intérieur) */}
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, assemblyType: 'sides_full' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      config.assemblyType === 'sides_full'
                        ? 'bg-blue-950/50 border-blue-500 ring-1 ring-blue-500 shadow-md'
                        : 'bg-slate-900 border-slate-700/80 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">
                        Haut &amp; Bas intérieurs
                      </span>
                      {config.assemblyType === 'sides_full' && (
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Montants continus toute hauteur. Dessus et dessous encastrés entre les côtés.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-blue-300 bg-blue-900/40 px-2 py-1 rounded">
                      Larg. = L - (2 × {config.thickness}) = {config.width - 2 * config.thickness} mm
                    </div>
                  </button>

                  {/* Option 2 : Dessus/Dessous filants (Côtés à l'intérieur) */}
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, assemblyType: 'top_bottom_full' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      config.assemblyType === 'top_bottom_full'
                        ? 'bg-emerald-950/50 border-emerald-500 ring-1 ring-emerald-500 shadow-md'
                        : 'bg-slate-900 border-slate-700/80 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">
                        Dessus/Dessous filants
                      </span>
                      {config.assemblyType === 'top_bottom_full' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Le dessus et le dessous font toute la largeur. Côtés pris en sandwich.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-1 rounded">
                      Haut. côtés = H - (2 × {config.thickness}) = {config.height - 2 * config.thickness} mm
                    </div>
                  </button>

                  {/* Option 3 : Bas encastré & Dessus posé avec débord */}
                  <button
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        assemblyType: 'bottom_inside_top_over',
                        topOverhangSides: config.topOverhangSides ?? 20,
                        topOverhangFront: config.topOverhangFront ?? 20,
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all ${
                      config.assemblyType === 'bottom_inside_top_over'
                        ? 'bg-purple-950/50 border-purple-500 ring-1 ring-purple-500 shadow-md'
                        : 'bg-slate-900 border-slate-700/80 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">
                        Bas encastré &amp; Dessus posé
                      </span>
                      {config.assemblyType === 'bottom_inside_top_over' && (
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Bas intérieur entre montants. Plateau haut posé sur les côtés avec débords.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-purple-300 bg-purple-900/40 px-2 py-1 rounded">
                      Haut posé = {config.width + 2 * (config.topOverhangSides || 0)} × {config.depth + (config.topOverhangFront || 0)} mm
                    </div>
                  </button>
                </div>

                {/* Réglage précis des débords si plateau haut posé */}
                {config.assemblyType === 'bottom_inside_top_over' && (
                  <div className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-slate-300 font-medium block mb-1">
                        Débord côtés (gauche &amp; droite) :
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="200"
                          step="1"
                          value={config.topOverhangSides || 0}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              topOverhangSides: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-24 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:border-purple-500 focus:outline-none"
                        />
                        <span className="text-slate-400 text-[11px]">
                          mm (+{2 * (config.topOverhangSides || 0)} mm sur la largeur)
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-300 font-medium block mb-1">
                        Débord avant (façade) :
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="200"
                          step="1"
                          value={config.topOverhangFront || 0}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              topOverhangFront: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-24 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:border-purple-500 focus:outline-none"
                        />
                        <span className="text-slate-400 text-[11px]">
                          mm (+{config.topOverhangFront || 0} mm sur la profondeur)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Séparations, Étagères & Fond */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-850 p-4 rounded-2xl border border-slate-800">
                {/* 1. Séparations verticales (0 à 4) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white">
                      Séparations (0 à 4) :
                    </label>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            partitionsCount: Math.max(0, config.partitionsCount - 1),
                          })
                        }
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-purple-400 text-xs px-1">
                        {config.partitionsCount}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            partitionsCount: Math.min(4, config.partitionsCount + 1),
                          })
                        }
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                    {config.partitionsCount === 0 ? (
                      <span>1 seul grand compartiment</span>
                    ) : (
                      <span className="text-purple-300 font-medium">
                        {config.partitionsCount} montant{config.partitionsCount > 1 ? 's' : ''} = {config.partitionsCount + 1} compartiments
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Étagères */}
                <div className="space-y-2 sm:border-l sm:border-slate-800 sm:pl-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white">
                      {config.partitionsCount > 0
                        ? `Étagères / côté (${config.shelvesCount * (config.partitionsCount + 1)} total) :`
                        : 'Étagère(s) intérieure(s) :'}
                    </label>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            shelvesCount: Math.max(0, config.shelvesCount - 1),
                          })
                        }
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-amber-400 text-xs px-1">
                        {config.shelvesCount}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig({
                            ...config,
                            shelvesCount: config.shelvesCount + 1,
                          })
                        }
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {config.shelvesCount > 0 && (
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                      <span>Retrait façade :</span>
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          value={config.shelfRecess}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              shelfRecess: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
                        />
                        <span>mm</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Fond de caisson */}
                <div className="space-y-2 sm:border-l sm:border-slate-800 sm:pl-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-white">
                      Fond de caisson :
                    </label>
                    {config.backType !== 'none' && (
                      <span className="text-[10px] text-amber-400 font-medium">
                        Panneau séparé
                      </span>
                    )}
                  </div>
                  <select
                    value={config.backType}
                    onChange={(e) =>
                      setConfig({ ...config, backType: e.target.value as BackType })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  >
                    <option value="none">Sans fond</option>
                    <option value="applique">Fond en applique arrière</option>
                    <option value="groove">Fond en rainure encastrée</option>
                  </select>

                  {config.backType !== 'none' && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Épaisseur fond :</span>
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="2"
                            max="30"
                            value={config.backThickness}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 8;
                              setConfig((prev) => {
                                const base = (prev.backMaterial || 'MDF')
                                  .replace(/\s*\d{1,2}\s*mm/i, '')
                                  .trim();
                                return {
                                  ...prev,
                                  backThickness: val,
                                  backMaterial: `${base || 'MDF'} ${val}mm`,
                                };
                              });
                            }}
                            className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono font-bold"
                          />
                          <span>mm</span>
                        </div>
                      </div>

                      {/* Choix / Nom de la matière du fond */}
                      <div className="text-[10px] text-slate-400 space-y-1">
                        <div className="flex items-center justify-between">
                          <span>Matière fond :</span>
                          <span className="text-[9px] text-emerald-400 font-semibold">
                            (Panneau / chute séparé)
                          </span>
                        </div>
                        {(workshopStock.length > 0 || stockPanels.length > 0) && (
                          <select
                            value={config.backMaterial || ''}
                            onChange={(e) => {
                              const chosen = e.target.value;
                              if (!chosen) return;
                              const th = extractThicknessFromMaterialName(chosen);
                              setConfig((prev) => ({
                                ...prev,
                                backMaterial: chosen,
                                ...(th ? { backThickness: th } : {}),
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-mono"
                          >
                            <option value="">Sélectionner parmi vos stocks...</option>
                            {workshopStock.length > 0 && (
                              <optgroup label="🏭 Chutes d'atelier disponibles">
                                {workshopStock.map((w, idx) => (
                                  <option key={`ws-b-${idx}`} value={w.material}>
                                    {w.material} ({w.length}×{w.width} mm - {w.quantity} chute(s))
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {stockPanels.length > 0 && (
                              <optgroup label="📦 Panneaux saisis">
                                {stockPanels.map((p, idx) => (
                                  <option key={`sp-b-${idx}`} value={p.material}>
                                    {p.material} ({p.length}×{p.width} mm)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="📋 Matières courantes pour fond">
                              <option value="MDF 8mm">MDF 8mm (Standard)</option>
                              <option value="Isorel 3mm">Isorel 3mm (Fond classique)</option>
                              <option value="Contreplaqué 5mm">Contreplaqué 5mm</option>
                              <option value="Mélaminé Blanc 8mm">Mélaminé Blanc 8mm</option>
                            </optgroup>
                          </select>
                        )}
                        <input
                          type="text"
                          value={config.backMaterial || `MDF ${config.backThickness || 8}mm`}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              backMaterial: e.target.value,
                            }))
                          }
                          placeholder="Ex: MDF 8mm, Isorel 3mm"
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Colonne Droite : Visualisation 2D & Tableau des débits calculés (5 colonnes) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Schéma de principe 2D interactif */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-col items-center">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="font-bold text-white">Schéma d&apos;assemblage</span>
                  <span className="font-mono text-[11px] text-amber-400">
                    {config.height} × {config.width} × {config.depth} mm
                  </span>
                </div>

                {/* SVG WIREFRAME DU CAISSON */}
                <svg
                  viewBox="0 0 240 200"
                  className="w-full max-w-[240px] h-44 border border-slate-800/80 rounded-xl bg-slate-900/60 p-2 shadow-inner"
                >
                  {/* Légende couleurs & Wireframe */}
                  <g className="text-[8px] font-mono select-none">
                    {config.assemblyType === 'sides_full' ? (
                      /* Côtés continus pleine hauteur */
                      <>
                        {/* Côté Gauche */}
                        <rect x="25" y="15" width="12" height="170" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" rx="2" />
                        {/* Côté Droit */}
                        <rect x="203" y="15" width="12" height="170" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" rx="2" />
                        {/* Dessus intérieur */}
                        <rect x="37" y="15" width="166" height="12" fill="#dcfce7" stroke="#10b981" strokeWidth="1" rx="2" />
                        {/* Dessous intérieur */}
                        <rect x="37" y="173" width="166" height="12" fill="#dcfce7" stroke="#10b981" strokeWidth="1" rx="2" />
                      </>
                    ) : config.assemblyType === 'bottom_inside_top_over' ? (
                      /* Mixte : Bas encastré & Dessus posé avec éventuel débord */
                      <>
                        {/* Plateau du haut posé sur les côtés (avec débord visualisé) */}
                        <rect
                          x={(config.topOverhangSides || 0) > 0 ? 15 : 25}
                          y="15"
                          width={(config.topOverhangSides || 0) > 0 ? 210 : 190}
                          height="12"
                          fill="#dcfce7"
                          stroke="#10b981"
                          strokeWidth="1.2"
                          rx="2"
                        />
                        {/* Côté Gauche (sous le dessus) */}
                        <rect x="25" y="27" width="12" height="158" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" rx="2" />
                        {/* Côté Droit (sous le dessus) */}
                        <rect x="203" y="27" width="12" height="158" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" rx="2" />
                        {/* Dessous encastré entre côtés */}
                        <rect x="37" y="173" width="166" height="12" fill="#dcfce7" stroke="#10b981" strokeWidth="1" rx="2" />
                      </>
                    ) : (
                      /* Dessus/Dessous continus */
                      <>
                        {/* Dessus continu */}
                        <rect x="25" y="15" width="190" height="12" fill="#dcfce7" stroke="#10b981" strokeWidth="1" rx="2" />
                        {/* Dessous continu */}
                        <rect x="25" y="173" width="190" height="12" fill="#dcfce7" stroke="#10b981" strokeWidth="1" rx="2" />
                        {/* Côté Gauche intérieur */}
                        <rect x="25" y="27" width="12" height="146" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" rx="2" />
                        {/* Côté Droit intérieur */}
                        <rect x="203" y="27" width="12" height="146" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" rx="2" />
                      </>
                    )}

                    {/* Séparations verticales intermédiaires (de 1 à 4) */}
                    {config.partitionsCount > 0 &&
                      Array.from({ length: config.partitionsCount }).map((_, pIdx) => {
                        const P = config.partitionsCount;
                        const partThickness = P >= 3 ? 6 : 8;
                        const totalInteriorW = 166;
                        const compW = (totalInteriorW - P * partThickness) / (P + 1);
                        const partX = 37 + (pIdx + 1) * compW + pIdx * partThickness;

                        return (
                          <rect
                            key={`part-${pIdx}`}
                            x={partX}
                            y="27"
                            width={partThickness}
                            height="146"
                            fill="#f3e8ff"
                            stroke="#8b5cf6"
                            strokeWidth="1"
                            rx="1.5"
                          />
                        );
                      })}

                    {/* Étagères intérieures réparties dans chaque compartiment */}
                    {Array.from({ length: Math.min(3, config.shelvesCount) }).map((_, i) => {
                      const step = 146 / (Math.min(3, config.shelvesCount) + 1);
                      const y = 27 + step * (i + 1);
                      const P = config.partitionsCount;

                      if (P > 0) {
                        const numComp = P + 1;
                        const partThickness = P >= 3 ? 6 : 8;
                        const totalInteriorW = 166;
                        const compW = (totalInteriorW - P * partThickness) / numComp;

                        return (
                          <g key={`shelves-row-${i}`}>
                            {Array.from({ length: numComp }).map((__, cIdx) => {
                              const compX = 37 + cIdx * (compW + partThickness);
                              return (
                                <rect
                                  key={`shelf-${i}-${cIdx}`}
                                  x={compX}
                                  y={y}
                                  width={compW}
                                  height="6"
                                  fill="#fef3c7"
                                  stroke="#f59e0b"
                                  strokeWidth="0.8"
                                  rx="1"
                                />
                              );
                            })}
                          </g>
                        );
                      }

                      return (
                        <rect
                          key={`shelf-full-${i}`}
                          x="37"
                          y={y}
                          width="166"
                          height="7"
                          fill="#fef3c7"
                          stroke="#f59e0b"
                          strokeWidth="0.8"
                          rx="1.5"
                        />
                      );
                    })}

                    {/* Fond arrière représenté par trame */}
                    {config.backType !== 'none' && (
                      <rect
                        x="37"
                        y="27"
                        width="166"
                        height="146"
                        fill="none"
                        stroke="#fce7f3"
                        strokeWidth="1.2"
                        strokeDasharray="4 3"
                        opacity="0.8"
                      />
                    )}

                    {/* Cotes de repère */}
                    <text x="120" y="9" fill="#94a3b8" textAnchor="middle">
                      {config.assemblyType === 'bottom_inside_top_over' && (config.topOverhangSides || 0) > 0
                        ? `L corps = ${config.width} (Haut = ${config.width + 2 * (config.topOverhangSides || 0)} mm)`
                        : `L = ${config.width} mm`}
                    </text>
                    <text
                      x="10"
                      y="105"
                      fill="#94a3b8"
                      textAnchor="middle"
                      transform="rotate(-90 10 105)"
                    >
                      H = {config.height} mm
                    </text>
                  </g>
                </svg>

                {/* Légende rapide */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-2 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-blue-500" />
                    <span>Côtés</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                    <span>Haut/Bas</span>
                  </span>
                  {config.shelvesCount > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-amber-500" />
                      <span>Étagères</span>
                    </span>
                  )}
                  {config.backType !== 'none' && (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-pink-500" />
                      <span>Fond</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Tableau Récapitulatif des Débits Calculés */}
              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">
                    Liste des débits générés ({calculated.pieces.reduce((s, p) => s + p.quantity, 0)} pièces)
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    Cotes débit exactes
                  </span>
                </div>

                <div className="divide-y divide-slate-800 text-xs max-h-48 overflow-y-auto pr-1">
                  {calculated.pieces.map((p, idx) => (
                    <div key={idx} className="py-2 space-y-0.5">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-white flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span>{p.role}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-amber-300 font-mono font-medium">
                            {p.material}
                          </span>
                          <span className="font-mono text-amber-400">
                            {p.quantity} × ({p.length} × {p.width} mm)
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 pl-3.5 italic">
                        {p.formula}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alerte si matière hors stock */}
        {missingMaterialsInAssistant.length > 0 && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Matière(s) non en stock :{' '}
                <strong className="text-white font-mono">
                  {missingMaterialsInAssistant.join(', ')}
                </strong>
                .
              </span>
            </span>
            <span className="text-[11px] text-amber-400/90 hidden sm:inline">
              La mise en stock vous sera proposée avant le calcul.
            </span>
          </div>
        )}

        {/* Pied de la modale avec bouton principal d'injection */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 text-center sm:text-left">
            Total :{' '}
            <strong className="text-white font-mono">
              {calculated.cutItems.reduce((acc, it) => acc + it.quantity, 0)} pièce(s)
            </strong>{' '}
            {(config.cabinetCount || 1) > 1 && (
              <span className="text-amber-300 font-semibold">
                ({config.cabinetCount} caissons ×{' '}
                {Math.round(
                  calculated.cutItems.reduce((acc, it) => acc + it.quantity, 0) /
                    (config.cabinetCount || 1)
                )}{' '}
                pcs){' '}
              </span>
            )}
            calculée(s) selon l&apos;épaisseur de {config.thickness} mm.
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={handleInjectPieces}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg active:scale-95"
              title="Ajoute les coupes de ce caisson à la liste de débit. L'optimisation se lance ensuite depuis le projet, une fois tous les caissons saisis."
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter ce caisson au projet</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

