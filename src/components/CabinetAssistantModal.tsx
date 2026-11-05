'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  CabinetPartKey,
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

const EMPTY_CONFIG: CabinetConfig = {
  name: '',
  height: 0,
  width: 0,
  depth: 0,
  thickness: 0,
  assemblyType: '' as AssemblyType,
  topOverhangSides: undefined,
  topOverhangFront: undefined,
  backType: '' as BackType,
  backThickness: 0,
  backMaterial: '',
  shelvesCount: -1,
  shelfRecess: 0,
  partitionsCount: -1,
  doors: 'none',
  material: '',
  sidesMaterial: '',
  topMaterial: '',
  bottomMaterial: '',
  partitionsMaterial: '',
  shelvesMaterial: '',
  doorMaterial: '',
  cabinetCount: 0,
};

interface GuidedTemplateFields {
  height: string;
  width: string;
  depth: string;
  partitionsCount: string;
  shelvesCount: string;
  assemblyType: string;
  topOverhangSides: string;
  topOverhangFront: string;
  backType: string;
}

const EMPTY_GUIDED_FIELDS: GuidedTemplateFields = {
  height: '',
  width: '',
  depth: '',
  partitionsCount: '',
  shelvesCount: '',
  assemblyType: '',
  topOverhangSides: '',
  topOverhangFront: '',
  backType: '',
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
  // À la création d'un nouveau projet, tous les champs de l'assistant IA sont vides
  const [config, setConfig] = useState<CabinetConfig>(() => ({ ...EMPTY_CONFIG }));
  const [guidedFields, setGuidedFields] = useState<GuidedTemplateFields>(() => ({
    ...EMPTY_GUIDED_FIELDS,
  }));
  const [guidedValidationError, setGuidedValidationError] = useState<string | null>(null);
  const [nameValidationError, setNameValidationError] = useState<string | null>(null);
  const [showPartsSummaryModal, setShowPartsSummaryModal] = useState(false);
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const hasCabinetName = Boolean(config.name && config.name.trim().length > 0);

  const requireCabinetName = useCallback((): boolean => {
    if (config.name && config.name.trim().length > 0) {
      setNameValidationError(null);
      return true;
    }
    setActiveTab('visual');
    setNameValidationError('Veuillez obligatoirement saisir un nom de caisson pour commencer.');
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
    return false;
  }, [config.name]);

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
    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current);
    };
  }, []);

  // À chaque ouverture de l'Assistant IA, ouvrir systématiquement sur "1. Configuration Visuelle" et cibler le champ Nom du caisson
  useEffect(() => {
    if (isOpen) {
      setActiveTab('visual');
      setNameValidationError(null);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

  // Vérifie si tous les champs obligatoires de "Remplir les cases" sont complétés
  const isGuidedFormComplete = useCallback((gf: GuidedTemplateFields): boolean => {
    const h = parseInt(gf.height, 10);
    const w = parseInt(gf.width, 10);
    const d = parseInt(gf.depth, 10);
    const sh = parseInt(gf.shelvesCount, 10);
    if (!gf.height.trim() || isNaN(h) || h < 50) return false;
    if (!gf.width.trim() || isNaN(w) || w < 50) return false;
    if (!gf.depth.trim() || isNaN(d) || d < 50) return false;
    if (gf.partitionsCount === '') return false;
    if (gf.shelvesCount.trim() === '' || isNaN(sh) || sh < 0) return false;
    if (!gf.assemblyType) return false;
    if (gf.assemblyType === 'bottom_inside_top_over') {
      const ovS = parseInt(gf.topOverhangSides, 10);
      const ovF = parseInt(gf.topOverhangFront, 10);
      if (gf.topOverhangSides.trim() === '' || isNaN(ovS) || ovS < 0) return false;
      if (gf.topOverhangFront.trim() === '' || isNaN(ovF) || ovF < 0) return false;
    }
    if (!gf.backType) return false;
    return true;
  }, []);

  // Mise à jour d'un champ du gabarit guidé ("Remplir les cases") avec ouverture automatique de la fenêtre récapitulative dès que tous les champs sont complets
  const handleGuidedFieldChange = (
    field: keyof GuidedTemplateFields,
    value: string,
    isSelectField = false
  ) => {
    if (autoOpenTimerRef.current) {
      clearTimeout(autoOpenTimerRef.current);
      autoOpenTimerRef.current = null;
    }

    const nextGf: GuidedTemplateFields = {
      ...guidedFields,
      [field]: value,
    };
    setGuidedFields(nextGf);
    setGuidedValidationError(null);

    // Synchroniser avec config
    setConfig((prev) => {
      const next = { ...prev };
      const h = parseInt(nextGf.height, 10);
      const w = parseInt(nextGf.width, 10);
      const d = parseInt(nextGf.depth, 10);
      const p = parseInt(nextGf.partitionsCount, 10);
      const sh = parseInt(nextGf.shelvesCount, 10);
      const ovS = parseInt(nextGf.topOverhangSides, 10);
      const ovF = parseInt(nextGf.topOverhangFront, 10);

      next.height = !isNaN(h) && h > 0 ? h : 0;
      next.width = !isNaN(w) && w > 0 ? w : 0;
      next.depth = !isNaN(d) && d > 0 ? d : 0;
      next.partitionsCount = nextGf.partitionsCount !== '' && !isNaN(p) ? p : -1;
      next.shelvesCount = nextGf.shelvesCount !== '' && !isNaN(sh) ? sh : -1;
      next.assemblyType = (nextGf.assemblyType || '') as AssemblyType;
      next.topOverhangSides =
        nextGf.topOverhangSides !== '' && !isNaN(ovS) ? ovS : undefined;
      next.topOverhangFront =
        nextGf.topOverhangFront !== '' && !isNaN(ovF) ? ovF : undefined;
      next.backType = (nextGf.backType || '') as BackType;
      return next;
    });

    if (isGuidedFormComplete(nextGf)) {
      if (isSelectField) {
        setShowPartsSummaryModal(true);
      } else {
        autoOpenTimerRef.current = setTimeout(() => {
          setShowPartsSummaryModal(true);
        }, 650);
      }
    }
  };

  // Vérification forcée de tous les champs de "Remplir les cases" avant d'ouvrir la fenêtre récapitulative
  const handleValidateGuidedTemplate = () => {
    const missing: string[] = [];
    const h = parseInt(guidedFields.height, 10);
    const w = parseInt(guidedFields.width, 10);
    const d = parseInt(guidedFields.depth, 10);
    const sh = parseInt(guidedFields.shelvesCount, 10);

    if (!guidedFields.height.trim() || isNaN(h) || h < 50) missing.push('Hauteur (mm)');
    if (!guidedFields.width.trim() || isNaN(w) || w < 50) missing.push('Largeur (mm)');
    if (!guidedFields.depth.trim() || isNaN(d) || d < 50) missing.push('Profondeur (mm)');
    if (guidedFields.partitionsCount === '') missing.push('Séparations');
    if (guidedFields.shelvesCount.trim() === '' || isNaN(sh) || sh < 0)
      missing.push('Étagères par côté');
    if (!guidedFields.assemblyType) missing.push("Mode d'assemblage");
    if (guidedFields.assemblyType === 'bottom_inside_top_over') {
      const ovS = parseInt(guidedFields.topOverhangSides, 10);
      const ovF = parseInt(guidedFields.topOverhangFront, 10);
      if (guidedFields.topOverhangSides.trim() === '' || isNaN(ovS) || ovS < 0)
        missing.push('Débord côtés (mm)');
      if (guidedFields.topOverhangFront.trim() === '' || isNaN(ovF) || ovF < 0)
        missing.push('Débord avant (mm)');
    }
    if (!guidedFields.backType) missing.push('Fond du caisson');

    if (missing.length > 0) {
      setGuidedValidationError(
        `Veuillez renseigner tous les champs obligatoires : ${missing.join(', ')}.`
      );
      return;
    }

    setGuidedValidationError(null);
    setShowPartsSummaryModal(true);
  };

  // Sélection de la matière pour une partie spécifique du caisson dans la fenêtre récapitulative
  const handlePartMaterialChange = (partKey: CabinetPartKey | undefined, newMat: string) => {
    const detectedThickness = extractThicknessFromMaterialName(newMat);
    setConfig((prev) => {
      const next = { ...prev };
      if (partKey === 'sides') {
        next.sidesMaterial = newMat;
        if (!next.material) next.material = newMat;
        if (detectedThickness) next.thickness = detectedThickness;
      } else if (partKey === 'top') {
        next.topMaterial = newMat;
        if (detectedThickness && !next.thickness) next.thickness = detectedThickness;
      } else if (partKey === 'bottom') {
        next.bottomMaterial = newMat;
        if (detectedThickness && !next.thickness) next.thickness = detectedThickness;
      } else if (partKey === 'partitions') {
        next.partitionsMaterial = newMat;
      } else if (partKey === 'shelves') {
        next.shelvesMaterial = newMat;
      } else if (partKey === 'back') {
        next.backMaterial = newMat;
        if (detectedThickness) next.backThickness = detectedThickness;
      } else if (partKey === 'doors') {
        next.doorMaterial = newMat;
      }
      return next;
    });
  };

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
    setGuidedFields({
      height: preset.config.height ? String(preset.config.height) : '',
      width: preset.config.width ? String(preset.config.width) : '',
      depth: preset.config.depth ? String(preset.config.depth) : '',
      partitionsCount:
        preset.config.partitionsCount !== undefined && preset.config.partitionsCount >= 0
          ? String(preset.config.partitionsCount)
          : '',
      shelvesCount:
        preset.config.shelvesCount !== undefined && preset.config.shelvesCount >= 0
          ? String(preset.config.shelvesCount)
          : '',
      assemblyType: preset.config.assemblyType || '',
      topOverhangSides:
        preset.config.topOverhangSides !== undefined
          ? String(preset.config.topOverhangSides)
          : '',
      topOverhangFront:
        preset.config.topOverhangFront !== undefined
          ? String(preset.config.topOverhangFront)
          : '',
      backType: preset.config.backType || '',
    });
    if (preset.prompt) {
      setAiPrompt(preset.prompt);
    }
    setAiSuccessMessage(`Modèle "${preset.name}" chargé avec succès !`);
  };

  // Gestion du changement de matière globale avec détection automatique de l'épaisseur
  const handleMaterialChange = (newMat: string) => {
    const detectedThickness = extractThicknessFromMaterialName(newMat);
    setConfig((prev) => {
      const base = newMat.replace(/\s*\d{1,2}\s*mm/i, '').trim();
      let updatedBack = prev.backMaterial;
      if (!updatedBack && newMat) {
        updatedBack = `${base || 'MDF'} ${prev.backThickness || 8}mm`;
      }
      return {
        ...prev,
        material: newMat,
        sidesMaterial: newMat,
        topMaterial: newMat,
        bottomMaterial: newMat,
        partitionsMaterial: newMat,
        shelvesMaterial: newMat,
        ...(detectedThickness ? { thickness: detectedThickness } : {}),
        backMaterial: updatedBack,
      };
    });
  };

  // Liste dynamique des boutons d'épaisseur
  const thicknessOptions = useMemo(() => {
    const defaultList = [15, 16, 18, 19, 22];
    if (config.thickness > 0 && !defaultList.includes(config.thickness)) {
      return [...defaultList, config.thickness].sort((a, b) => a - b);
    }
    return defaultList;
  }, [config.thickness]);

  const hasValidDimensions =
    config.height >= 50 && config.width >= 50 && config.depth >= 50;

  // Calcul mathématique rigoureux des pièces (uniquement lorsque les dimensions extérieures sont renseignées)
  const calculated = useMemo(() => {
    const effectiveName =
      config.name.trim() ||
      (hasValidDimensions
        ? `Caisson ${config.height}×${config.width}×${config.depth}`
        : 'Caisson');
    const safeConfig: CabinetConfig = {
      ...config,
      name: effectiveName,
      height: Math.max(0, config.height || 0),
      width: Math.max(0, config.width || 0),
      depth: Math.max(0, config.depth || 0),
      thickness: config.thickness > 0 ? config.thickness : 18,
      assemblyType: (config.assemblyType || 'sides_full') as AssemblyType,
      backType: (config.backType || 'none') as BackType,
      backThickness: config.backThickness > 0 ? config.backThickness : 8,
      shelvesCount: config.shelvesCount >= 0 ? config.shelvesCount : 0,
      shelfRecess: config.shelfRecess > 0 ? config.shelfRecess : 20,
      partitionsCount: config.partitionsCount >= 0 ? config.partitionsCount : 0,
      cabinetCount: config.cabinetCount && config.cabinetCount > 0 ? config.cabinetCount : 1,
    };

    if (!hasValidDimensions) {
      return {
        config: safeConfig,
        pieces: [],
        cutItems: [],
        interiorDimensions: { height: 0, width: 0, depth: 0 },
      };
    }

    return calculateCabinetPieces(safeConfig);
  }, [config, hasValidDimensions]);

  // Toutes les matières sélectionnables pour chaque partie
  const selectableMaterials = useMemo(() => {
    const set = new Set<string>();
    stockPanels.forEach((p) => p.material && set.add(p.material.trim()));
    workshopStock.forEach((w) => w.material && set.add(w.material.trim()));
    availableMaterials.forEach((m) => m && set.add(m.trim()));
    [
      'MDF 19mm',
      'MDF 18mm',
      'MDF 8mm',
      'Mélaminé Blanc 18mm',
      'Mélaminé Blanc 19mm',
      'Contreplaqué Bouleau 15mm',
      'Contreplaqué 5mm',
      'OSB 3 18mm',
      'Chêne Massif 20mm',
      'Isorel 3mm',
    ].forEach((m) => set.add(m));
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [stockPanels, workshopStock, availableMaterials]);

  const allPartsHaveMaterial = useMemo(() => {
    if (calculated.pieces.length === 0) return false;
    return calculated.pieces.every((p) => Boolean(p.material && p.material.trim()));
  }, [calculated.pieces]);

  // Réinitialiser tous les champs à vide (utilisé après l'ajout d'un caisson)
  const resetAllAssistantFields = () => {
    setConfig({ ...EMPTY_CONFIG });
    setGuidedFields({ ...EMPTY_GUIDED_FIELDS });
    setAiPrompt('');
    setAiSuccessMessage(null);
    setGuidedValidationError(null);
    setNameValidationError(null);
    setShowPartsSummaryModal(false);
    setActiveTab('visual');
  };

  // Injection des pièces calculées dans la liste de débit
  const handleInjectPieces = () => {
    if (!requireCabinetName()) {
      setShowPartsSummaryModal(false);
      return;
    }
    if (!hasValidDimensions || calculated.cutItems.length === 0) {
      alert(
        'Veuillez renseigner les dimensions du caisson (Hauteur, Largeur, Profondeur) avant de l’ajouter au projet.'
      );
      return;
    }
    if (!allPartsHaveMaterial) {
      setShowPartsSummaryModal(true);
      return;
    }
    onAddPieces(calculated.cutItems);
    resetAllAssistantFields();
    onClose();
  };

  // Traiter la demande IA (via API ou NLP local)
  const handleAnalyzePrompt = async (promptToRun?: string) => {
    if (!requireCabinetName()) return;
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
              name: prev.name.trim() || data.config.name || '',
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
        name: prev.name.trim() || local.name || '',
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
              onClick={() => {
                if (!requireCabinetName()) return;
                setActiveTab('ai');
              }}
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
                      <span className="text-[11px] text-amber-400/90 font-medium">
                        * Tous les champs sont obligatoires
                      </span>
                    </div>

                    {guidedValidationError && (
                      <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-500/50 text-red-200 text-[11px] font-medium flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>{guidedValidationError}</span>
                      </div>
                    )}

                    {/* LIGNE 1 : Hauteur, Largeur et Profondeur toujours sur la même ligne */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1 truncate">
                          Hauteur (mm) <span className="text-amber-400">*</span> :
                        </label>
                        <input
                          type="number"
                          required
                          min="50"
                          max="3000"
                          placeholder="Ex: 700"
                          value={guidedFields.height}
                          onChange={(e) => handleGuidedFieldChange('height', e.target.value)}
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white font-mono text-center placeholder-slate-500 focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && !guidedFields.height.trim()
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1 truncate">
                          Largeur (mm) <span className="text-amber-400">*</span> :
                        </label>
                        <input
                          type="number"
                          required
                          min="50"
                          max="3000"
                          placeholder="Ex: 1000"
                          value={guidedFields.width}
                          onChange={(e) => handleGuidedFieldChange('width', e.target.value)}
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white font-mono text-center placeholder-slate-500 focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && !guidedFields.width.trim()
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1 truncate">
                          Profondeur (mm) <span className="text-amber-400">*</span> :
                        </label>
                        <input
                          type="number"
                          required
                          min="50"
                          max="3000"
                          placeholder="Ex: 450"
                          value={guidedFields.depth}
                          onChange={(e) => handleGuidedFieldChange('depth', e.target.value)}
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white font-mono text-center placeholder-slate-500 focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && !guidedFields.depth.trim()
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Autres paramètres du gabarit */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">
                          Séparations (jusqu&apos;à 4) <span className="text-amber-400">*</span> :
                        </label>
                        <select
                          required
                          value={guidedFields.partitionsCount}
                          onChange={(e) =>
                            handleGuidedFieldChange('partitionsCount', e.target.value, true)
                          }
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && guidedFields.partitionsCount === ''
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        >
                          <option value="">-- Sélectionner --</option>
                          <option value="0">0 - Aucune (1 compartiment)</option>
                          <option value="1">1 séparation (2 compartiments)</option>
                          <option value="2">2 séparations (3 compartiments)</option>
                          <option value="3">3 séparations (4 compartiments)</option>
                          <option value="4">4 séparations (5 compartiments)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">
                          Étagères par côté <span className="text-amber-400">*</span> :
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          max="10"
                          placeholder="Ex: 2"
                          value={guidedFields.shelvesCount}
                          onChange={(e) =>
                            handleGuidedFieldChange('shelvesCount', e.target.value)
                          }
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && guidedFields.shelvesCount.trim() === ''
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">
                          Mode d&apos;assemblage <span className="text-amber-400">*</span> :
                        </label>
                        <select
                          required
                          value={guidedFields.assemblyType}
                          onChange={(e) =>
                            handleGuidedFieldChange('assemblyType', e.target.value, true)
                          }
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && !guidedFields.assemblyType
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        >
                          <option value="">-- Sélectionner --</option>
                          <option value="bottom_inside_top_over">Bas encastré / Dessus posé</option>
                          <option value="sides_full">Haut &amp; Bas intérieurs</option>
                          <option value="top_bottom_full">Dessus/Dessous filants</option>
                        </select>
                      </div>

                      {guidedFields.assemblyType === 'bottom_inside_top_over' && (
                        <>
                          <div>
                            <label className="text-[11px] text-purple-300 block mb-1">
                              Débord côtés (mm) <span className="text-amber-400">*</span> :
                            </label>
                            <input
                              type="number"
                              required
                              min="0"
                              max="100"
                              placeholder="Ex: 20"
                              value={guidedFields.topOverhangSides}
                              onChange={(e) =>
                                handleGuidedFieldChange('topOverhangSides', e.target.value)
                              }
                              className={`w-full bg-slate-800 border rounded px-2 py-1 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-400 ${
                                guidedValidationError &&
                                guidedFields.topOverhangSides.trim() === ''
                                  ? 'border-red-500'
                                  : 'border-purple-500/50'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-purple-300 block mb-1">
                              Débord avant (mm) <span className="text-amber-400">*</span> :
                            </label>
                            <input
                              type="number"
                              required
                              min="0"
                              max="100"
                              placeholder="Ex: 20"
                              value={guidedFields.topOverhangFront}
                              onChange={(e) =>
                                handleGuidedFieldChange('topOverhangFront', e.target.value)
                              }
                              className={`w-full bg-slate-800 border rounded px-2 py-1 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-purple-400 ${
                                guidedValidationError &&
                                guidedFields.topOverhangFront.trim() === ''
                                  ? 'border-red-500'
                                  : 'border-purple-500/50'
                              }`}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="text-[11px] text-slate-300 block mb-1">
                          Fond du caisson <span className="text-amber-400">*</span> :
                        </label>
                        <select
                          required
                          value={guidedFields.backType}
                          onChange={(e) =>
                            handleGuidedFieldChange('backType', e.target.value, true)
                          }
                          className={`w-full bg-slate-800 border rounded px-2 py-1 text-white focus:outline-none focus:border-amber-500 ${
                            guidedValidationError && !guidedFields.backType
                              ? 'border-red-500'
                              : 'border-slate-700'
                          }`}
                        >
                          <option value="">-- Sélectionner --</option>
                          <option value="groove">Encastré (rainure)</option>
                          <option value="applique">En applique arrière</option>
                          <option value="none">Sans fond</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <span className="text-[11px] text-slate-400">
                        {isGuidedFormComplete(guidedFields)
                          ? '✅ Tous les champs sont complets — cliquez pour choisir les matières de chaque partie.'
                          : 'Remplissez toutes les cases pour ouvrir le récapitulatif des parties et choisir leurs matières.'}
                      </span>
                      <button
                        type="button"
                        onClick={handleValidateGuidedTemplate}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Récapitulatif des parties &amp; Matières</span>
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
              <div
                className={`bg-slate-850 p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                  !hasCabinetName
                    ? 'border-amber-500 ring-1 ring-amber-500/50 shadow-lg'
                    : 'border-slate-800'
                }`}
              >
                {!hasCabinetName && (
                  <div
                    className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                      nameValidationError
                        ? 'bg-red-950/80 border-red-500/60 text-red-200'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 ${
                        nameValidationError ? 'text-red-400' : 'text-amber-400'
                      }`}
                    />
                    <span>
                      {nameValidationError ||
                        'Étape 1 obligatoire : Veuillez saisir le nom du caisson pour débloquer la configuration.'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-12 gap-2 sm:gap-2.5 items-end">
                  {/* 1. Nom du caisson (obligatoire) */}
                  <div className="col-span-5 sm:col-span-4 min-w-0">
                    <label className="block text-[11px] font-bold text-amber-300 mb-1 truncate">
                      <span className="sm:hidden">Nom caisson *</span>
                      <span className="hidden sm:inline">Nom du caisson *</span>
                    </label>
                    <input
                      ref={nameInputRef}
                      type="text"
                      required
                      value={config.name}
                      onChange={(e) => {
                        setConfig({ ...config, name: e.target.value });
                        if (e.target.value.trim()) {
                          setNameValidationError(null);
                        }
                      }}
                      placeholder="Saisissez le nom..."
                      className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none truncate font-semibold ${
                        !hasCabinetName
                          ? nameValidationError
                            ? 'border-red-500 ring-1 ring-red-500 placeholder-red-300/60'
                            : 'border-amber-500 ring-1 ring-amber-500/60 placeholder-amber-300/60'
                          : 'border-emerald-500/60 focus:border-amber-500'
                      }`}
                    />
                  </div>

                  {/* 2. Matière du caisson (réduit) */}
                  <div
                    className="col-span-4 sm:col-span-5 min-w-0"
                    onMouseDownCapture={(e) => {
                      if (!hasCabinetName) {
                        e.preventDefault();
                        requireCabinetName();
                      }
                    }}
                  >
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 truncate">
                      <span className="sm:hidden">Matière</span>
                      <span className="hidden sm:inline">Matière du caisson</span>
                    </label>
                    <select
                      disabled={!hasCabinetName}
                      value={config.material}
                      onChange={(e) => handleMaterialChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white truncate focus:outline-none focus:border-amber-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">-- Sélectionner --</option>
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

                      {config.material &&
                        !availableMaterials.includes(config.material) &&
                        !stockPanels.some((p) => p.material === config.material) &&
                        !workshopStock.some((w) => w.material === config.material) && (
                          <option value={config.material}>{config.material}</option>
                        )}
                    </select>
                  </div>

                  {/* 3. Nbre de caissons */}
                  <div
                    className="col-span-3 min-w-0"
                    onMouseDownCapture={(e) => {
                      if (!hasCabinetName) {
                        e.preventDefault();
                        requireCabinetName();
                      }
                    }}
                  >
                    <label className="block text-[11px] font-bold text-amber-300 mb-1 truncate text-center sm:text-left">
                      <span className="sm:hidden">Nbre caisson</span>
                      <span className="hidden sm:inline">Nbre de caissons</span>
                    </label>
                    <input
                      type="number"
                      disabled={!hasCabinetName}
                      min="1"
                      max="100"
                      placeholder="Ex: 1"
                      value={config.cabinetCount && config.cabinetCount > 0 ? config.cabinetCount : ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setConfig({
                          ...config,
                          cabinetCount: isNaN(val) || val < 1 ? 0 : val,
                        });
                      }}
                      className="w-full bg-slate-900 border border-amber-500/50 focus:border-amber-400 rounded-lg px-2 py-1.5 text-xs text-amber-400 font-mono font-bold text-center shadow-inner placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Nombre de caissons identiques à débiter"
                    />
                  </div>
                </div>
              </div>

              {/* Bloc verrouillé tant que le nom du caisson n'est pas saisi */}
              <div
                onClickCapture={(e) => {
                  if (!hasCabinetName) {
                    e.preventDefault();
                    e.stopPropagation();
                    requireCabinetName();
                  }
                }}
                className={`space-y-5 transition-opacity ${
                  !hasCabinetName ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
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
                      min="50"
                      max="3000"
                      placeholder="Ex: 700"
                      value={config.height > 0 ? config.height : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setConfig({ ...config, height: parseInt(raw, 10) || 0 });
                        setGuidedFields((prev) => ({ ...prev, height: raw }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Largeur (L)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="3000"
                      placeholder="Ex: 1000"
                      value={config.width > 0 ? config.width : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setConfig({ ...config, width: parseInt(raw, 10) || 0 });
                        setGuidedFields((prev) => ({ ...prev, width: raw }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white placeholder-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Profondeur (P)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="3000"
                      placeholder="Ex: 450"
                      value={config.depth > 0 ? config.depth : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setConfig({ ...config, depth: parseInt(raw, 10) || 0 });
                        setGuidedFields((prev) => ({ ...prev, depth: raw }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white placeholder-slate-500"
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
                        placeholder="--"
                        value={config.thickness > 0 ? config.thickness : ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            thickness: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-8 bg-transparent text-center text-xs font-mono font-bold text-amber-400 focus:outline-none placeholder-slate-500"
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
                    onClick={() => {
                      setConfig({ ...config, assemblyType: 'sides_full' });
                      setGuidedFields((prev) => ({ ...prev, assemblyType: 'sides_full' }));
                    }}
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
                    {config.width > 0 && config.thickness > 0 && (
                      <div className="mt-2 text-[10px] font-mono text-blue-300 bg-blue-900/40 px-2 py-1 rounded">
                        Larg. = L - (2 × {config.thickness}) = {config.width - 2 * config.thickness} mm
                      </div>
                    )}
                  </button>

                  {/* Option 2 : Dessus/Dessous filants (Côtés à l'intérieur) */}
                  <button
                    type="button"
                    onClick={() => {
                      setConfig({ ...config, assemblyType: 'top_bottom_full' });
                      setGuidedFields((prev) => ({ ...prev, assemblyType: 'top_bottom_full' }));
                    }}
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
                    {config.height > 0 && config.thickness > 0 && (
                      <div className="mt-2 text-[10px] font-mono text-emerald-300 bg-emerald-900/40 px-2 py-1 rounded">
                        Haut. côtés = H - (2 × {config.thickness}) = {config.height - 2 * config.thickness} mm
                      </div>
                    )}
                  </button>

                  {/* Option 3 : Bas encastré & Dessus posé avec débord */}
                  <button
                    type="button"
                    onClick={() => {
                      setConfig({
                        ...config,
                        assemblyType: 'bottom_inside_top_over',
                      });
                      setGuidedFields((prev) => ({
                        ...prev,
                        assemblyType: 'bottom_inside_top_over',
                      }));
                    }}
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
                    {config.width > 0 && config.depth > 0 && (
                      <div className="mt-2 text-[10px] font-mono text-purple-300 bg-purple-900/40 px-2 py-1 rounded">
                        Haut posé = {config.width + 2 * (config.topOverhangSides || 0)} × {config.depth + (config.topOverhangFront || 0)} mm
                      </div>
                    )}
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
                          placeholder="Ex: 20"
                          value={
                            config.topOverhangSides !== undefined
                              ? config.topOverhangSides
                              : ''
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            const val = parseInt(raw, 10);
                            setConfig({
                              ...config,
                              topOverhangSides: raw === '' || isNaN(val) ? undefined : val,
                            });
                            setGuidedFields((prev) => ({ ...prev, topOverhangSides: raw }));
                          }}
                          className="w-24 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:border-purple-500 focus:outline-none placeholder-slate-500"
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
                          placeholder="Ex: 20"
                          value={
                            config.topOverhangFront !== undefined
                              ? config.topOverhangFront
                              : ''
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            const val = parseInt(raw, 10);
                            setConfig({
                              ...config,
                              topOverhangFront: raw === '' || isNaN(val) ? undefined : val,
                            });
                            setGuidedFields((prev) => ({ ...prev, topOverhangFront: raw }));
                          }}
                          className="w-24 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-white font-mono text-xs focus:border-purple-500 focus:outline-none placeholder-slate-500"
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
                        onClick={() => {
                          const next = Math.max(0, (config.partitionsCount >= 0 ? config.partitionsCount : 0) - 1);
                          setConfig({
                            ...config,
                            partitionsCount: next,
                          });
                          setGuidedFields((prev) => ({ ...prev, partitionsCount: String(next) }));
                        }}
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-purple-400 text-xs px-1 min-w-[14px] text-center">
                        {config.partitionsCount >= 0 ? config.partitionsCount : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(4, (config.partitionsCount >= 0 ? config.partitionsCount : -1) + 1);
                          setConfig({
                            ...config,
                            partitionsCount: next,
                          });
                          setGuidedFields((prev) => ({ ...prev, partitionsCount: String(next) }));
                        }}
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                    {config.partitionsCount < 0 ? (
                      <span>Non défini</span>
                    ) : config.partitionsCount === 0 ? (
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
                      {config.partitionsCount > 0 && config.shelvesCount >= 0
                        ? `Étagères / côté (${config.shelvesCount * (config.partitionsCount + 1)} total) :`
                        : 'Étagère(s) intérieure(s) :'}
                    </label>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, (config.shelvesCount >= 0 ? config.shelvesCount : 0) - 1);
                          setConfig({
                            ...config,
                            shelvesCount: next,
                          });
                          setGuidedFields((prev) => ({ ...prev, shelvesCount: String(next) }));
                        }}
                        className="text-slate-400 hover:text-white font-bold px-1"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-amber-400 text-xs px-1 min-w-[14px] text-center">
                        {config.shelvesCount >= 0 ? config.shelvesCount : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = (config.shelvesCount >= 0 ? config.shelvesCount : -1) + 1;
                          setConfig({
                            ...config,
                            shelvesCount: next,
                          });
                          setGuidedFields((prev) => ({ ...prev, shelvesCount: String(next) }));
                        }}
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
                          placeholder="20"
                          value={config.shelfRecess > 0 ? config.shelfRecess : ''}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              shelfRecess: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono placeholder-slate-500"
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
                    {(config.backType === 'applique' || config.backType === 'groove') && (
                      <span className="text-[10px] text-amber-400 font-medium">
                        Panneau séparé
                      </span>
                    )}
                  </div>
                  <select
                    value={config.backType}
                    onChange={(e) => {
                      const val = e.target.value as BackType;
                      setConfig({ ...config, backType: val });
                      setGuidedFields((prev) => ({ ...prev, backType: val }));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="none">Sans fond</option>
                    <option value="applique">Fond en applique arrière</option>
                    <option value="groove">Fond en rainure encastrée</option>
                  </select>

                  {(config.backType === 'applique' || config.backType === 'groove') && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Épaisseur fond :</span>
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="2"
                            max="30"
                            placeholder="8"
                            value={config.backThickness > 0 ? config.backThickness : ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setConfig((prev) => {
                                const base = (prev.backMaterial || '')
                                  .replace(/\s*\d{1,2}\s*mm/i, '')
                                  .trim();
                                return {
                                  ...prev,
                                  backThickness: val,
                                  backMaterial:
                                    base && val > 0 ? `${base} ${val}mm` : prev.backMaterial,
                                };
                              });
                            }}
                            className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono font-bold placeholder-slate-500"
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
                        <select
                          value={config.backMaterial || ''}
                          onChange={(e) => {
                            const chosen = e.target.value;
                            const th = extractThicknessFromMaterialName(chosen);
                            setConfig((prev) => ({
                              ...prev,
                              backMaterial: chosen,
                              ...(th ? { backThickness: th } : {}),
                            }));
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-mono"
                        >
                          <option value="">-- Sélectionner une matière --</option>
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
                        <input
                          type="text"
                          value={config.backMaterial || ''}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              backMaterial: e.target.value,
                            }))
                          }
                          placeholder="Ex: MDF 8mm, Isorel 3mm"
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-amber-300 font-mono placeholder-slate-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
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
                    {hasValidDimensions
                      ? `${config.height} × ${config.width} × ${config.depth} mm`
                      : 'Dimensions à renseigner'}
                  </span>
                </div>

                {/* SVG WIREFRAME DU CAISSON */}
                <svg
                  viewBox="0 0 240 200"
                  className="w-full max-w-[240px] h-44 border border-slate-800/80 rounded-xl bg-slate-900/60 p-2 shadow-inner"
                >
                  {/* Légende couleurs & Wireframe */}
                  <g className="text-[8px] font-mono select-none">
                    {config.assemblyType === 'top_bottom_full' ? (
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
                      /* Côtés continus pleine hauteur (par défaut pour le schéma) */
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
                    )}

                    {/* Séparations verticales intermédiaires (de 1 à 4) */}
                    {config.partitionsCount > 0 &&
                      Array.from({ length: Math.max(0, config.partitionsCount) }).map((_, pIdx) => {
                        const P = Math.max(0, config.partitionsCount);
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
                    {config.shelvesCount > 0 &&
                      Array.from({ length: Math.min(3, Math.max(0, config.shelvesCount)) }).map((_, i) => {
                        const sCount = Math.min(3, Math.max(0, config.shelvesCount));
                        const step = 146 / (sCount + 1);
                        const y = 27 + step * (i + 1);
                        const P = Math.max(0, config.partitionsCount);

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
                    {(config.backType === 'applique' || config.backType === 'groove') && (
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
                      {config.width > 0
                        ? config.assemblyType === 'bottom_inside_top_over' && (config.topOverhangSides || 0) > 0
                          ? `L corps = ${config.width} (Haut = ${config.width + 2 * (config.topOverhangSides || 0)} mm)`
                          : `L = ${config.width} mm`
                        : 'L = -- mm'}
                    </text>
                    <text
                      x="10"
                      y="105"
                      fill="#94a3b8"
                      textAnchor="middle"
                      transform="rotate(-90 10 105)"
                    >
                      {config.height > 0 ? `H = ${config.height} mm` : 'H = -- mm'}
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
                  {(config.backType === 'applique' || config.backType === 'groove') && (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded bg-pink-500" />
                      <span>Fond</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Tableau Récapitulatif des Débits Calculés */}
              <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="font-bold text-white">
                    Liste des débits générés ({calculated.pieces.reduce((s, p) => s + p.quantity, 0)} pièces)
                  </span>
                  {calculated.pieces.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPartsSummaryModal(true)}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold transition-colors"
                    >
                      Choisir matière par partie
                    </button>
                  )}
                </div>

                {calculated.pieces.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    Renseignez les dimensions du caisson (Hauteur, Largeur, Profondeur) pour calculer toutes les parties.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 text-xs max-h-48 overflow-y-auto pr-1">
                    {calculated.pieces.map((p, idx) => (
                      <div key={idx} className="py-2 space-y-0.5">
                        <div className="flex items-center justify-between font-semibold gap-2">
                          <span className="text-white flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="truncate">{p.role}</span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium ${
                                p.material
                                  ? 'bg-slate-900 border-slate-700 text-amber-300'
                                  : 'bg-red-950/60 border-red-500/40 text-red-300'
                              }`}
                            >
                              {p.material || 'Matière à choisir'}
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
                )}
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
            {config.thickness > 0
              ? `calculée(s) selon l'épaisseur de ${config.thickness} mm.`
              : 'calculée(s).'}
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

      {/* FENÊTRE FLOTTANTE : Récapitulatif de toutes les parties composant ce caisson + Sélection de la matière par partie */}
      {showPartsSummaryModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            className="modal-box bg-slate-900 border-2 border-amber-500/60 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden text-white"
          >
            {/* En-tête de la fenêtre flottante */}
            <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/90 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Récapitulatif des parties du caisson &amp; Choix des matières
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5 font-mono">
                    Dimensions : {config.height} × {config.width} × {config.depth} mm •{' '}
                    {calculated.pieces.length} type(s) de parties ({calculated.pieces.reduce((s, p) => s + p.quantity, 0)} pièces)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPartsSummaryModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Barre d'outils rapide : Nom du caisson + Appliquer une matière à tout */}
            <div className="px-4 sm:px-5 py-3 bg-slate-900/90 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Nom du caisson :
                </label>
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder={`Caisson ${config.height}×${config.width}×${config.depth}`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                  Appliquer une matière à toutes les parties (optionnel) :
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleMaterialChange(e.target.value);
                    }
                  }}
                  className="w-full bg-slate-800 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Choisir pour pré-remplir toutes les parties --</option>
                  {selectableMaterials.map((m) => (
                    <option key={`all-${m}`} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Liste détaillée de chaque partie avec sélection individuelle de la matière */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {calculated.pieces.map((part, idx) => (
                <div
                  key={`${part.partKey || idx}-${idx}`}
                  className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: part.color }}
                      />
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {part.role}
                      </span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Qté : {part.quantity}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-emerald-400 pl-5">
                      Dimensions débit : <strong>{part.length} × {part.width} mm</strong>
                    </div>
                    <div className="text-[11px] text-slate-400 pl-5 italic">
                      {part.formula}
                    </div>
                  </div>

                  {/* Sélecteur de matière spécifique pour cette partie */}
                  <div className="sm:w-64 shrink-0">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Matière de cette partie <span className="text-amber-400">*</span> :
                    </label>
                    <select
                      value={part.material || ''}
                      onChange={(e) => handlePartMaterialChange(part.partKey, e.target.value)}
                      className={`w-full bg-slate-900 border rounded-xl px-2.5 py-2 text-xs text-white font-medium focus:outline-none focus:border-amber-500 ${
                        part.material ? 'border-emerald-500/60' : 'border-amber-500/70'
                      }`}
                    >
                      <option value="">-- Sélectionner la matière --</option>
                      {stockPanels.length > 0 && (
                        <optgroup label="📦 En Stock Saisi (Panneaux projet)">
                          {stockPanels.map((p, sIdx) => (
                            <option key={`part-sp-${sIdx}`} value={p.material}>
                              {p.material} ({p.length}×{p.width} mm)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {workshopStock.length > 0 && (
                        <optgroup label="🏭 En Stock Atelier (Chutes)">
                          {workshopStock.map((w, wIdx) => (
                            <option key={`part-ws-${wIdx}`} value={w.material}>
                              {w.material} ({w.length}×{w.width} mm)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="📋 Matières standards">
                        {selectableMaterials
                          .filter(
                            (m) =>
                              !stockPanels.some((p) => p.material === m) &&
                              !workshopStock.some((w) => w.material === m)
                          )
                          .map((m) => (
                            <option key={`part-std-${m}`} value={m}>
                              {m}
                            </option>
                          ))}
                      </optgroup>
                      {part.material &&
                        !selectableMaterials.includes(part.material) && (
                          <option value={part.material}>{part.material}</option>
                        )}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Pied de la fenêtre flottante */}
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs">
                {allPartsHaveMaterial ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Toutes les parties ont une matière sélectionnée.</span>
                  </span>
                ) : (
                  <span className="text-amber-300 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Veuillez sélectionner une matière pour chaque partie du caisson.</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowPartsSummaryModal(false)}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Modifier les cases
                </button>

                <button
                  type="button"
                  disabled={!allPartsHaveMaterial}
                  onClick={() => {
                    const generated = generatePromptFromConfig(calculated.config);
                    setAiPrompt(generated);
                    setShowPartsSummaryModal(false);
                    setActiveTab('visual');
                    setAiSuccessMessage('Récapitulatif et matières par partie validés !');
                  }}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors disabled:opacity-40"
                >
                  Valider &amp; Voir le schéma
                </button>

                <button
                  type="button"
                  disabled={!allPartsHaveMaterial}
                  onClick={handleInjectPieces}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs transition-all shadow-md disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter ce caisson au projet</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};


