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
} from 'lucide-react';
import { CutItem } from '@/types/cutting';
import {
  CabinetConfig,
  BackType,
  calculateCabinetPieces,
  parseCabinetPromptWithNLP,
  extractThicknessFromMaterialName,
} from '@/lib/cabinet-calculator';

interface CabinetAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPieces: (newItems: CutItem[]) => void;
  availableMaterials: string[];
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
};

const PROMPT_PRESETS = [
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
}) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'ai'>('visual');
  const [config, setConfig] = useState<CabinetConfig>(() => ({
    ...DEFAULT_CONFIG,
    material: availableMaterials[0] || DEFAULT_CONFIG.material,
  }));

  // Prompt IA
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchroniser la matière et l'épaisseur par défaut si disponible
  useEffect(() => {
    if (availableMaterials.length > 0) {
      setConfig((prev) => {
        const currentValid = availableMaterials.includes(prev.material);
        const targetMat = currentValid ? prev.material : availableMaterials[0];
        const detected = extractThicknessFromMaterialName(targetMat);
        return {
          ...prev,
          material: targetMat,
          ...(detected ? { thickness: detected } : {}),
        };
      });
    }
  }, [availableMaterials]);

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
    const local = parseCabinetPromptWithNLP(text, availableMaterials);
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

  // Injection des pièces calculées dans la liste de débit
  const handleInjectPieces = () => {
    onAddPieces(calculated.cutItems);
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white">
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Assistant Caisson &amp; Mobilier IA
                </h2>
                <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                  Calculateur de débit
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Calcul automatique des cotes de coupe selon vos dimensions extérieures et l&apos;assemblage.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'onglets : Visuel Paramétrique vs Commande IA */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'visual'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Configuration Visuelle &amp; Assemblage</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'ai'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>2. Assistant Prompt IA (Texte libre)</span>
          </button>
        </div>

        {/* Corps de la modale scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* VUE 1 : ASSISTANT PROMPT IA */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="bg-slate-850 p-4 rounded-2xl border border-slate-700/80">
                <label className="block text-xs font-bold text-white mb-1.5 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Décrivez le meuble ou caisson que vous souhaitez réaliser :</span>
                </label>
                <p className="text-[11px] text-slate-400 mb-3">
                  Indiquez vos dimensions extérieures (H × L × P), l&apos;épaisseur du bois, le positionnement des planches (haut/bas à l&apos;intérieur ou chapeaux filants), le nombre d&apos;étagères, etc.
                </p>

                <div className="relative">
                  <textarea
                    rows={3}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ex: Je veux un caisson de cuisine de 720 de haut, 600 de large et 560 de profondeur en 18mm, haut et bas à l'intérieur, avec 1 étagère en retrait et un fond de 8mm..."
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

                {aiSuccessMessage && (
                  <div className="mt-3 p-2.5 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{aiSuccessMessage}</span>
                  </div>
                )}
              </div>

              {/* Exemples rapides en 1 clic */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">
                  Ou essayez l&apos;un de ces modèles types en 1 clic :
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
              {/* Nom & Matière */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-850 p-3.5 rounded-2xl border border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Nom du meuble
                  </label>
                  <input
                    type="text"
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Matière du caisson
                  </label>
                  <select
                    value={config.material}
                    onChange={(e) => handleMaterialChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {availableMaterials.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    {!availableMaterials.includes(config.material) && (
                      <option value={config.material}>{config.material}</option>
                    )}
                  </select>
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

              {/* Type d'assemblage (Le point clé demandé par l'utilisateur !) */}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        Haut &amp; Bas à l&apos;intérieur
                      </span>
                      {config.assemblyType === 'sides_full' && (
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Les côtés (montants) font toute la hauteur. Le dessus et le dessous sont pris en sandwich entre les deux côtés.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-blue-300 bg-blue-900/40 px-2 py-1 rounded">
                      Largeur haut/bas = L - (2 × {config.thickness}) = {config.width - 2 * config.thickness} mm
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
                        Dessus &amp; Dessous filants
                      </span>
                      {config.assemblyType === 'top_bottom_full' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Le dessus et le dessous font toute la largeur. Les côtés viennent s&apos;insérer entre le haut et le bas.
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-1 rounded">
                      Hauteur côtés = H - (2 × {config.thickness}) = {config.height - 2 * config.thickness} mm
                    </div>
                  </button>
                </div>
              </div>

              {/* Étagères & Fond */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-850 p-4 rounded-2xl border border-slate-800">
                {/* Étagères */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white">
                      Étagère(s) intérieure(s) :
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

                {/* Fond de caisson */}
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
                          <span className="text-[9px] text-slate-500">
                            (différente du {config.thickness}mm)
                          </span>
                        </div>
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
                  {/* Légende couleurs */}
                  <g className="text-[8px] font-mono select-none">
                    {config.assemblyType === 'sides_full' ? (
                      /* Côtés continus pleine hauteur */
                      <>
                        {/* Côté Gauche */}
                        <rect x="25" y="15" width="12" height="170" fill="#3b82f6" rx="2" />
                        {/* Côté Droit */}
                        <rect x="203" y="15" width="12" height="170" fill="#3b82f6" rx="2" />
                        {/* Dessus intérieur */}
                        <rect x="37" y="15" width="166" height="12" fill="#10b981" rx="2" />
                        {/* Dessous intérieur */}
                        <rect x="37" y="173" width="166" height="12" fill="#10b981" rx="2" />
                      </>
                    ) : (
                      /* Dessus/Dessous continus */
                      <>
                        {/* Dessus continu */}
                        <rect x="25" y="15" width="190" height="12" fill="#10b981" rx="2" />
                        {/* Dessous continu */}
                        <rect x="25" y="173" width="190" height="12" fill="#10b981" rx="2" />
                        {/* Côté Gauche intérieur */}
                        <rect x="25" y="27" width="12" height="146" fill="#3b82f6" rx="2" />
                        {/* Côté Droit intérieur */}
                        <rect x="203" y="27" width="12" height="146" fill="#3b82f6" rx="2" />
                      </>
                    )}

                    {/* Étagères intérieures */}
                    {Array.from({ length: Math.min(3, config.shelvesCount) }).map(
                      (_, i) => {
                        const step = 146 / (Math.min(3, config.shelvesCount) + 1);
                        const y = 27 + step * (i + 1);
                        return (
                          <rect
                            key={i}
                            x="37"
                            y={y}
                            width="166"
                            height="8"
                            fill="#f59e0b"
                            rx="1.5"
                          />
                        );
                      }
                    )}

                    {/* Fond arrière représenté par trame */}
                    {config.backType !== 'none' && (
                      <rect
                        x="37"
                        y="27"
                        width="166"
                        height="146"
                        fill="none"
                        stroke="#ec4899"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        opacity="0.6"
                      />
                    )}

                    {/* Cotes de repère */}
                    <text x="120" y="10" fill="#94a3b8" textAnchor="middle">
                      L = {config.width} mm
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

        {/* Pied de la modale avec bouton principal d'injection */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 text-center sm:text-left">
            Total :{' '}
            <strong className="text-white font-mono">
              {calculated.cutItems.reduce((acc, it) => acc + it.quantity, 0)} panneau(x)
            </strong>{' '}
            calculé(s) selon l&apos;épaisseur de {config.thickness} mm.
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
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
            >
              <Plus className="w-4 h-4 text-slate-950" />
              <span>
                Ajouter ces {calculated.cutItems.reduce((acc, it) => acc + it.quantity, 0)} pièces au débit
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

