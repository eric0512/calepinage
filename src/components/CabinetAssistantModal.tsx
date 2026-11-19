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
  Check,
  Pencil,
  Ruler,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { CutItem, EdgeBandingEdges, StockPanel, WorkshopItem } from '@/types/cutting';
import { EdgeBandingButton, EdgeBandingModal } from '@/components/EdgeBandingModal';
import {
  CabinetConfig,
  CabinetPartKey,
  CabinetPieceCalculation,
  BackType,
  AssemblyType,
  calculateCabinetPieces,
  parseCabinetPromptWithNLP,
  extractThicknessFromMaterialName,
  computeFacadeLayout,
  computeHorizontalFacadeLayout,
  getFacadeAvailableHeight,
  getFacadeAvailableWidth,
  DEFAULT_BASE_MATERIALS,
  inferCabinetConfigFromItems,
} from '@/lib/cabinet-calculator';
import { getPieceCabinet, getPiecePart, UNASSIGNED_CABINET_LABEL } from '@/lib/piece-labels';
import { parseEdgeBandingThickness, computeCutDimensions } from '@/lib/edge-banding';
import type { FacadeItemType, FacadeDirection, DrawerBottomType } from '@/types/cutting';

/** Composant de façade en cours de saisie (hauteur vide = calcul automatique) */
interface FacadeDraftItem {
  type: FacadeItemType;
  height: string;
  heightValidated?: boolean;
  drawerHeight?: string;
  material?: string;
  shelvesCount?: string;
  stackInColumn?: boolean;
}

/** Ajuste la liste des composants de façade au nombre demandé en conservant la saisie existante */
function resizeFacadeDraft(
  items: FacadeDraftItem[],
  count: number,
  defaultMaterial?: string
): FacadeDraftItem[] {
  const n = Math.max(0, Math.min(10, count));
  if (n === 0) return [];
  if (items.length === n) return items;
  if (items.length > n) return items.slice(0, n);
  const added: FacadeDraftItem[] = Array.from({ length: n - items.length }, () => ({
    type: 'porte' as FacadeItemType,
    height: '',
    drawerHeight: '',
    material: defaultMaterial || '',
  }));
  return [...items, ...added];
}

interface CabinetAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPieces: (newItems: CutItem[]) => void;
  onUpdateCabinetPieces?: (oldCabinetName: string, newItems: CutItem[]) => void;
  existingItems?: CutItem[];
  initialEditingCabinetName?: string | null;
  onAddAndOptimize?: (newItems: CutItem[]) => void;
  availableMaterials: string[];
  stockPanels?: StockPanel[];
  workshopStock?: WorkshopItem[];
  edgeBanding?: string;
  onEdgeBandingChange?: (val: string) => void;
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
      parts.push(`${c.shelvesCount} étagères de chaque côté (marge -5 mm)`);
    } else {
      parts.push(`${c.shelvesCount} étagère(s) intérieure(s) (marge -5 mm)`);
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
  thickness: 19,
  assemblyType: '' as AssemblyType,
  topOverhangSides: undefined,
  topOverhangFront: undefined,
  backType: '' as BackType,
  backThickness: 0,
  backMaterial: '',
  shelvesCount: -1,
  shelfRecess: 5,
  partitionsCount: -1,
  doors: 'none',
  material: 'Mela 19mm',
  sidesMaterial: '',
  topMaterial: '',
  bottomMaterial: '',
  partitionsMaterial: '',
  shelvesMaterial: '',
  doorMaterial: '',
  drawerMaterial: '',
  cabinetCount: 1,
  partMaterials: {},
  facadesCount: 0,
  facadePlacement: 'applique',
  facadeGap: 2,
  drawersCount: 0,
  drawerSlideThickness: 13,
  drawerSlideLength: 0,
  drawerBottomType: 'groove',
  drawerGrooveDepth: 6,
};

interface GuidedTemplateFields {
  elementName: string; // Toujours 'Caisson'
  cabinetCount: string; // Nombre de caissons identiques (ex: '1')
  customName: string; // Nom de chaque élément dans la liste de débit (ex: "Caisson Cuisine")
  material: string; // Matière qui va constituer le corps du caisson (ex: "Mela 19mm")
  hasFeet: boolean; // Présence de pieds sur le caisson
  feetHeight: string; // Hauteur du pied en mm (ex: "100")
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
  elementName: 'Caisson',
  cabinetCount: '1',
  customName: '',
  material: 'Mela 19mm',
  hasFeet: false,
  feetHeight: '',
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
  onUpdateCabinetPieces,
  existingItems = [],
  initialEditingCabinetName = null,
  availableMaterials,
  stockPanels = [],
  workshopStock = [],
  edgeBanding = '',
  onEdgeBandingChange,
}) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'ai'>('ai');
  // Caisson existant sélectionné pour modification dans le projet en cours (null = création d'un nouveau caisson)
  const [editingCabinetName, setEditingCabinetName] = useState<string | null>(null);
  // À la création d'un nouveau projet, tous les champs de l'assistant IA sont vides
  const [config, setConfig] = useState<CabinetConfig>(() => ({ ...EMPTY_CONFIG }));
  const [guidedFields, setGuidedFields] = useState<GuidedTemplateFields>(() => ({
    ...EMPTY_GUIDED_FIELDS,
  }));
  const [guidedValidationError, setGuidedValidationError] = useState<string | null>(null);
  const [showPartsSummaryModal, setShowPartsSummaryModal] = useState(false);
  const [showCompositionModal, setShowCompositionModal] = useState(false);
  const [isManualEdgeInput, setIsManualEdgeInput] = useState(false);
  const [manualEdgeInput, setManualEdgeInput] = useState('');
  const [editingPartEdges, setEditingPartEdges] = useState<CabinetPieceCalculation | null>(null);

  const edgeThickness = parseEdgeBandingThickness(edgeBanding);
  const isEdgeBandingMissing = !edgeBanding || edgeBanding.trim() === '';

  const handleOpenPartsSummaryModal = () => {
    if (isEdgeBandingMissing) {
      setGuidedValidationError(
        'Le champ « Bande de champ » est obligatoire. Veuillez choisir 0, 1, 2, 3 mm ou saisir une épaisseur manuelle.'
      );
      return;
    }
    setGuidedValidationError(null);
    setShowPartsSummaryModal(true);
  };
  const [compositionState, setCompositionState] = useState({
    hasFacades: false,
    facadesCount: 1,
    facadePlacement: 'applique' as 'applique' | 'interieur',
    facadeDirection: undefined as FacadeDirection | undefined,
    facadeGap: 2,
    facadeItems: [{ type: 'porte', height: '' }] as FacadeDraftItem[],
    hasDrawers: false,
    drawersCount: 1,
    drawerSlideThickness: 13,
    drawerSlideLength: 0,
    drawerBottomType: 'groove' as DrawerBottomType,
    drawerGrooveDepth: 6,
  });
  const [bulkMaterial, setBulkMaterial] = useState('');
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Liste des caissons distincts déjà présents dans la liste de débit du projet en cours
  const existingCabinets = useMemo(() => {
    if (!existingItems || existingItems.length === 0) return [];
    const map = new Map<string, CutItem[]>();
    existingItems.forEach((it) => {
      const cab =
        getPieceCabinet(it.name) ||
        (it.cabinetConfig?.name?.trim() ? it.cabinetConfig.name.trim() : null);
      if (cab && cab !== UNASSIGNED_CABINET_LABEL) {
        if (!map.has(cab)) map.set(cab, []);
        map.get(cab)!.push(it);
      }
    });
    return Array.from(map.entries()).map(([name, cabItems]) => {
      const cfg = inferCabinetConfigFromItems(name, cabItems);
      return {
        name,
        config: cfg,
        totalQty: cabItems.reduce((acc, it) => acc + it.quantity, 0),
        cabItems,
      };
    });
  }, [existingItems]);

  // Prompt IA & Presets Personnalisés
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  // Modèles préprogrammés par l'utilisateur (Persistés en LocalStorage)
  const [customPresets, setCustomPresets] = useState<CustomCabinetPreset[]>([]);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showGuidedTemplate, setShowGuidedTemplate] = useState(true);

  // Matières personnalisées enregistrées par l'utilisateur (Persistées en LocalStorage)
  const [customMaterials, setCustomMaterials] = useState<string[]>([]);
  const [materialToConfirmSave, setMaterialToConfirmSave] = useState<string | null>(null);
  const [showAddMaterialInput, setShowAddMaterialInput] = useState(false);
  const [newMaterialNameToAdd, setNewMaterialNameToAdd] = useState('');

  // Épaisseurs de coulisses personnalisées enregistrées par l'utilisateur
  const [customSlideThicknesses, setCustomSlideThicknesses] = useState<number[]>([]);

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
    try {
      const savedMats = localStorage.getItem('calepinage_user_materials');
      if (savedMats) {
        setCustomMaterials(JSON.parse(savedMats));
      }
    } catch {
      // ignore
    }
    try {
      const savedSlides = localStorage.getItem('calepinage_user_slide_thicknesses');
      if (savedSlides) {
        setCustomSlideThicknesses(JSON.parse(savedSlides));
      }
    } catch {
      // ignore
    }
    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current);
    };
  }, []);

  // Réinitialiser tous les champs à vide (nouveau caisson)
  const resetAllAssistantFields = useCallback(() => {
    setEditingCabinetName(null);
    setConfig({ ...EMPTY_CONFIG });
    setGuidedFields({ ...EMPTY_GUIDED_FIELDS });
    setAiPrompt('');
    setAiSuccessMessage(null);
    setGuidedValidationError(null);
    setShowPartsSummaryModal(false);
    setShowCompositionModal(false);
    setActiveTab('ai');
    setShowGuidedTemplate(true);
  }, []);

  // Charger un caisson existant du projet pour le modifier dans l'assistant IA
  const handleSelectCabinetToEdit = useCallback(
    (cabName: string | null) => {
      if (!cabName) {
        resetAllAssistantFields();
        return;
      }
      const found = existingCabinets.find((c) => c.name === cabName);
      if (!found) return;

      const c = found.config;
      setEditingCabinetName(cabName);

      // Récupérer et préserver toutes les matières personnalisées par partie
      const partMaterials: Record<string, string> = { ...(c.partMaterials || {}) };
      found.cabItems.forEach((it) => {
        const part = getPiecePart(it.name).toLowerCase();
        const mat = it.material?.trim();
        if (!mat) return;
        if (part.includes('façade tiroir') || part.includes('facade tiroir')) {
          if (!partMaterials['facade_tiroir']) partMaterials['facade_tiroir'] = mat;
        } else if (part.includes('tiroir')) {
          if (part.includes('côté') || part.includes('cote')) {
            if (!partMaterials['drawer_sides']) partMaterials['drawer_sides'] = mat;
          } else if (part.includes('avant') || part.includes('arrière') || part.includes('arriere')) {
            if (!partMaterials['drawer_front_back']) partMaterials['drawer_front_back'] = mat;
          } else if (part.includes('fond')) {
            if (!partMaterials['drawer_bottom']) partMaterials['drawer_bottom'] = mat;
          }
          if (!partMaterials['drawers']) partMaterials['drawers'] = mat;
        } else if (part.includes('côté') || part.includes('cote') || part.includes('montant')) {
          if (!partMaterials['sides']) partMaterials['sides'] = mat;
        } else if (part.includes('dessus') || part.includes('haut')) {
          if (!partMaterials['top']) partMaterials['top'] = mat;
        } else if (part.includes('dessous') || part.includes('bas')) {
          if (!partMaterials['bottom']) partMaterials['bottom'] = mat;
        } else if (part.includes('fond') || part.includes('dos') || part.includes('arrière')) {
          if (!partMaterials['back']) partMaterials['back'] = mat;
        } else if (part.includes('étagère') || part.includes('etagere')) {
          if (!partMaterials['shelves']) partMaterials['shelves'] = mat;
        } else if (part.includes('séparat') || part.includes('separat')) {
          if (!partMaterials['partitions']) partMaterials['partitions'] = mat;
        } else if (part.includes('porte')) {
          if (!partMaterials['doors']) partMaterials['doors'] = mat;
        }
      });

      const editBackTh =
        c.backType === 'applique' || c.backType === 'none' ? 0 : c.backThickness || 8;
      const editMaxSlideLen = c.depth ? Math.max(100, c.depth - editBackTh - 10) : 500;
      const editDefaultSlideLen = c.depth
        ? Math.min(
            editMaxSlideLen,
            Math.min(600, Math.max(150, Math.floor((c.depth - 50) / 50) * 50))
          )
        : 500;
      const resolvedEditSlideLen =
        c.drawerSlideLength &&
        c.drawerSlideLength > 0 &&
        c.drawerSlideLength <= editMaxSlideLen
          ? c.drawerSlideLength
          : editDefaultSlideLen;

      // Mettre à jour la configuration
      setConfig({
        ...c,
        name: c.name || cabName,
        drawerSlideLength: resolvedEditSlideLen,
        partMaterials,
      });

      // Mettre à jour les champs du gabarit guidé ("Remplir les cases")
      setGuidedFields({
        elementName: 'Caisson',
        cabinetCount:
          c.cabinetCount && c.cabinetCount > 0 ? String(c.cabinetCount) : '1',
        customName: c.name || cabName,
        material: c.material || 'Mela 19mm',
        hasFeet: Boolean(c.hasFeet),
        feetHeight: c.feetHeight ? String(c.feetHeight) : '',
        height: c.height ? String(c.height) : '',
        width: c.width ? String(c.width) : '',
        depth: c.depth ? String(c.depth) : '',
        partitionsCount:
          c.partitionsCount !== undefined && c.partitionsCount >= 0
            ? String(c.partitionsCount)
            : '0',
        shelvesCount:
          c.shelvesCount !== undefined && c.shelvesCount >= 0
            ? String(c.shelvesCount)
            : '0',
        assemblyType: c.assemblyType || 'sides_full',
        topOverhangSides:
          c.topOverhangSides !== undefined ? String(c.topOverhangSides) : '',
        topOverhangFront:
          c.topOverhangFront !== undefined ? String(c.topOverhangFront) : '',
        backType: c.backType || 'groove',
      });

      // Mettre à jour la composition du meuble (façades & tiroirs)
      const compCount =
        c.facadesCount && c.facadesCount > 0
          ? c.facadesCount
          : c.facadeItems && c.facadeItems.length > 0
          ? c.facadeItems.length
          : c.doors === 'two_doors'
          ? 2
          : 1;

      setCompositionState({
        hasFacades: !!c.hasFacades,
        facadesCount: compCount,
        facadePlacement: c.facadePlacement || 'applique',
        facadeDirection: c.facadeDirection,
        facadeGap: c.facadeGap ?? 2,
        facadeItems:
          c.facadeItems && c.facadeItems.length > 0
            ? c.facadeItems.map((it) => ({
                type: it.type,
                height:
                  it.height !== null && it.height !== undefined
                    ? String(it.height)
                    : '',
                drawerHeight:
                  it.drawerHeight !== null && it.drawerHeight !== undefined && it.drawerHeight > 0
                    ? String(it.drawerHeight)
                    : '',
                material: it.material,
                shelvesCount:
                  it.shelvesCount !== undefined ? String(it.shelvesCount) : undefined,
                stackInColumn: it.stackInColumn,
              }))
            : resizeFacadeDraft([], compCount),
        hasDrawers: !!c.hasDrawers,
        drawersCount: c.drawersCount || 1,
        drawerSlideThickness: c.drawerSlideThickness ?? 13,
        drawerSlideLength: resolvedEditSlideLen,
        drawerBottomType: c.drawerBottomType || 'groove',
        drawerGrooveDepth:
          c.drawerGrooveDepth && c.drawerGrooveDepth > 0
            ? c.drawerGrooveDepth
            : Math.round(((c.thickness || 18) / 3) * 10) / 10,
      });

      if (c.material) {
        setBulkMaterial(c.material);
      }

      setAiPrompt(generatePromptFromConfig(c));
      setAiSuccessMessage(`Caisson "${cabName}" chargé dans l'Assistant IA pour modification.`);
      setGuidedValidationError(null);
    },
    [existingCabinets, resetAllAssistantFields]
  );

  // À chaque ouverture de l'Assistant IA, ouvrir sur l'onglet IA et sur "Remplir les cases"
  useEffect(() => {
    if (isOpen) {
      setActiveTab('ai');
      setShowGuidedTemplate(true);
      setGuidedValidationError(null);
      setShowCompositionModal(false);

      if (initialEditingCabinetName) {
        handleSelectCabinetToEdit(initialEditingCabinetName);
      } else {
        setEditingCabinetName(null);
      }
    }
  }, [isOpen, initialEditingCabinetName, handleSelectCabinetToEdit]);

  // Vérifie si tous les champs obligatoires de "Remplir les cases" sont complétés
  const isGuidedFormComplete = useCallback((gf: GuidedTemplateFields): boolean => {
    if (!gf.elementName || !gf.elementName.trim()) return false;
    if (!gf.customName || !gf.customName.trim()) return false;
    if (!gf.material || !gf.material.trim()) return false;
    const cc = parseInt(gf.cabinetCount, 10);
    if (!gf.cabinetCount || !gf.cabinetCount.trim() || isNaN(cc) || cc < 1) return false;
    const h = parseInt(gf.height, 10);
    const w = parseInt(gf.width, 10);
    const d = parseInt(gf.depth, 10);
    const sh = parseInt(gf.shelvesCount, 10);
    if (!gf.height.trim() || isNaN(h) || h < 50) return false;
    if (!gf.width.trim() || isNaN(w) || w < 50) return false;
    if (!gf.depth.trim() || isNaN(d) || d < 50) return false;
    if (gf.hasFeet) {
      const fh = parseInt(gf.feetHeight, 10);
      if (!gf.feetHeight.trim() || isNaN(fh) || fh <= 0) return false;
      if (!isNaN(h) && fh >= h) return false;
    }
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

  // Mise à jour d'un champ du gabarit guidé ("Remplir les cases")
  const handleGuidedFieldChange = (
    field: keyof GuidedTemplateFields,
    value: string | boolean,
    ..._rest: unknown[]
  ) => {
    void _rest;
    if (autoOpenTimerRef.current) {
      clearTimeout(autoOpenTimerRef.current);
      autoOpenTimerRef.current = null;
    }

    const nextGf: GuidedTemplateFields = {
      ...guidedFields,
    };

    if (field === 'hasFeet') {
      const boolVal = Boolean(value === true || value === 'true');
      nextGf.hasFeet = boolVal;
      if (!boolVal) {
        nextGf.feetHeight = '';
      }
    } else {
      (nextGf[field] as unknown as string) = String(value);
    }

    // Si on change "Nom de l'élément" :
    if (field === 'elementName') {
      const prevElement = guidedFields.elementName;
      const prevCustom = guidedFields.customName;
      if (!prevCustom || (prevElement && prevCustom.startsWith(prevElement))) {
        const suffix = prevElement && prevCustom.startsWith(prevElement)
          ? prevCustom.slice(prevElement.length)
          : '';
        nextGf.customName = value ? `${value}${suffix}` : '';
      } else if (!prevCustom && value) {
        nextGf.customName = String(value);
      }
    }

    if (field === 'material') {
      const matStr = String(value);
      nextGf.material = matStr;
      const detThickness = extractThicknessFromMaterialName(matStr);
      setConfig((prev) => {
        const next = { ...prev };
        next.material = matStr;
        next.sidesMaterial = matStr;
        next.topMaterial = matStr;
        next.bottomMaterial = matStr;
        next.partitionsMaterial = matStr;
        next.shelvesMaterial = matStr;
        if (detThickness) {
          next.thickness = detThickness;
          next.drawerGrooveDepth = Math.round((detThickness / 3) * 10) / 10;
        }
        if (!next.backMaterial) {
          const base = matStr.replace(/\s*\d{1,2}\s*mm/i, '').trim();
          next.backMaterial = `${base || 'MDF'} ${next.backThickness || 8}mm`;
        }
        return next;
      });
    }

    setGuidedFields(nextGf);
    setGuidedValidationError(null);

    // Synchroniser avec config
    setConfig((prev) => {
      const next = { ...prev };
      const effectiveName = (nextGf.customName || nextGf.elementName || '').trim();
      if (effectiveName) {
        next.name = effectiveName;
      }
      const h = parseInt(nextGf.height, 10);
      const w = parseInt(nextGf.width, 10);
      const d = parseInt(nextGf.depth, 10);
      const p = parseInt(nextGf.partitionsCount, 10);
      const sh = parseInt(nextGf.shelvesCount, 10);
      const ovS = parseInt(nextGf.topOverhangSides, 10);
      const ovF = parseInt(nextGf.topOverhangFront, 10);
      const cc = parseInt(nextGf.cabinetCount, 10);

      next.height = !isNaN(h) && h > 0 ? h : 0;
      next.width = !isNaN(w) && w > 0 ? w : 0;
      next.depth = !isNaN(d) && d > 0 ? d : 0;
      if (field === 'depth') {
        next.drawerSlideLength = 0;
      }
      next.partitionsCount = nextGf.partitionsCount !== '' && !isNaN(p) ? p : -1;
      next.shelvesCount = nextGf.shelvesCount !== '' && !isNaN(sh) ? sh : -1;
      next.assemblyType = (nextGf.assemblyType || '') as AssemblyType;
      next.topOverhangSides =
        nextGf.topOverhangSides !== '' && !isNaN(ovS) ? ovS : undefined;
      next.topOverhangFront =
        nextGf.topOverhangFront !== '' && !isNaN(ovF) ? ovF : undefined;
      next.backType = (nextGf.backType || '') as BackType;
      next.cabinetCount = !isNaN(cc) && cc > 0 ? cc : 1;
      if (nextGf.hasFeet) {
        next.hasFeet = true;
        const fh = parseInt(nextGf.feetHeight, 10);
        next.feetHeight = !isNaN(fh) && fh > 0 ? fh : undefined;
      } else {
        next.hasFeet = false;
        next.feetHeight = undefined;
      }
      return next;
    });
  };

  // Initialisation dynamique de la modale de composition selon les dimensions réelles du caisson
  useEffect(() => {
    if (showCompositionModal) {
      const depthVal = config.depth || parseInt(guidedFields.depth, 10) || 560;
      const effectiveBackType = config.backType || guidedFields.backType || 'groove';
      const backThVal =
        effectiveBackType === 'applique' || effectiveBackType === 'none'
          ? 0
          : config.backThickness || 8;
      const maxAllowedSlideLen = Math.max(100, depthVal - backThVal - 10);
      const defaultSlideLen = Math.min(
        maxAllowedSlideLen,
        Math.min(600, Math.max(150, Math.floor((depthVal - 50) / 50) * 50))
      );
      setCompositionState((prev) => {
        const nextCount =
          config.facadesCount && config.facadesCount > 0
            ? config.facadesCount
            : config.width >= 600
            ? 2
            : 1;
        const fromConfig: FacadeDraftItem[] | null =
          config.facadeItems && config.facadeItems.length > 0
            ? config.facadeItems.map((it) => ({
                type: it.type,
                height: it.height && it.height > 0 ? String(it.height) : '',
                drawerHeight:
                  it.drawerHeight && it.drawerHeight > 0 ? String(it.drawerHeight) : '',
              }))
            : null;
        const candidateSlideLen = config.drawerSlideLength || prev.drawerSlideLength || 0;
        const resolvedSlideLen =
          candidateSlideLen > 0 && candidateSlideLen <= maxAllowedSlideLen
            ? candidateSlideLen
            : defaultSlideLen;
        const drawerWallMat =
          config.partMaterials?.['drawer_sides'] ||
          config.partMaterials?.['drawers'] ||
          config.drawerMaterial ||
          config.sidesMaterial ||
          config.material ||
          '';
        const drawerWallTh =
          extractThicknessFromMaterialName(drawerWallMat) || config.thickness || 18;
        const autoGrv = Math.round((drawerWallTh / 3) * 10) / 10;
        return {
          ...prev,
          hasFacades: config.facadesCount !== undefined ? config.facadesCount > 0 : prev.hasFacades,
          facadesCount: nextCount,
          facadeItems: resizeFacadeDraft(fromConfig || prev.facadeItems, nextCount),
          facadePlacement: config.facadePlacement || prev.facadePlacement || 'applique',
          facadeGap: config.facadeGap !== undefined ? config.facadeGap : prev.facadeGap || 2,
          hasDrawers: config.drawersCount !== undefined ? config.drawersCount > 0 : prev.hasDrawers,
          drawersCount: config.drawersCount && config.drawersCount > 0 ? config.drawersCount : 1,
          drawerSlideThickness: config.drawerSlideThickness || prev.drawerSlideThickness || 13,
          drawerSlideLength: resolvedSlideLen,
          drawerBottomType: config.drawerBottomType || prev.drawerBottomType || 'groove',
          drawerGrooveDepth:
            config.drawerGrooveDepth && config.drawerGrooveDepth > 0
              ? config.drawerGrooveDepth
              : prev.drawerGrooveDepth || autoGrv,
        };
      });
    }
  }, [
    showCompositionModal,
    config.depth,
    config.width,
    config.thickness,
    config.backType,
    config.backThickness,
    config.facadesCount,
    config.facadeItems,
    config.facadePlacement,
    config.facadeGap,
    config.drawersCount,
    config.drawerSlideThickness,
    config.drawerSlideLength,
    config.drawerBottomType,
    config.drawerGrooveDepth,
    config.drawerMaterial,
    config.sidesMaterial,
    config.material,
    config.partMaterials,
    guidedFields.depth,
    guidedFields.backType,
  ]);

  // Calcul en direct de la répartition des hauteurs de la façade (jeux et espacements déduits)
  const rawCompoHeight = config.height || parseInt(guidedFields.height, 10) || 0;
  const compoFeetHeight =
    (config.hasFeet ?? guidedFields.hasFeet)
      ? config.feetHeight || parseInt(guidedFields.feetHeight, 10) || 0
      : 0;
  const compoHeight =
    compoFeetHeight > 0 && rawCompoHeight > compoFeetHeight
      ? Math.max(50, rawCompoHeight - compoFeetHeight)
      : rawCompoHeight;
  const compoWidth = config.width || parseInt(guidedFields.width, 10) || 0;
  const compoThickness =
    config.thickness ||
    extractThicknessFromMaterialName(guidedFields.material || config.material || '') ||
    19;
  const facadeAvailableHeight = getFacadeAvailableHeight(
    compoHeight,
    compoThickness,
    compositionState.facadePlacement,
    compositionState.facadeGap
  );
  const facadeAvailableWidth = getFacadeAvailableWidth(
    compoWidth,
    compoThickness,
    compositionState.facadePlacement,
    compositionState.facadeGap
  );
  const effectiveFacadeDirection: FacadeDirection =
    compositionState.facadeDirection ||
    (compoWidth > compoHeight && compoHeight > 0 ? 'horizontal' : 'vertical');

  const mappedFacadeDrafts = useMemo(
    () =>
      compositionState.facadeItems.map((it) => {
        const h = parseFloat(it.height);
        const dh = parseFloat(it.drawerHeight || '');
        // Si la hauteur a été calculée automatiquement (même après validation par l'utilisateur),
        // elle reste dynamique afin que la somme des hauteurs ne dépasse jamais la hauteur disponible
        const effectiveH = !it.heightValidated && !isNaN(h) && h > 0 ? h : null;
        return {
          type: it.type,
          height: effectiveH,
          drawerHeight: !isNaN(dh) && dh > 0 ? dh : null,
          stackInColumn: !!it.stackInColumn,
        };
      }),
    [compositionState.facadeItems]
  );

  const verticalFacadeLayout = useMemo(
    () =>
      computeFacadeLayout(
        mappedFacadeDrafts,
        facadeAvailableHeight,
        compositionState.facadeGap
      ),
    [mappedFacadeDrafts, facadeAvailableHeight, compositionState.facadeGap]
  );

  const horizontalFacadeLayout = useMemo(
    () =>
      computeHorizontalFacadeLayout(
        mappedFacadeDrafts,
        facadeAvailableWidth,
        facadeAvailableHeight,
        compositionState.facadeGap
      ),
    [
      mappedFacadeDrafts,
      facadeAvailableWidth,
      facadeAvailableHeight,
      compositionState.facadeGap,
    ]
  );

  const activeAutoIndices = useMemo(
    () =>
      effectiveFacadeDirection === 'horizontal'
        ? horizontalFacadeLayout.autoIndices
        : verticalFacadeLayout.autoIndex >= 0
        ? [verticalFacadeLayout.autoIndex]
        : [],
    [
      effectiveFacadeDirection,
      horizontalFacadeLayout.autoIndices,
      verticalFacadeLayout.autoIndex,
    ]
  );

  const facadeLayout = useMemo(
    () =>
      effectiveFacadeDirection === 'horizontal'
        ? {
            ...verticalFacadeLayout,
            heights: horizontalFacadeLayout.heights,
            autoIndex: horizontalFacadeLayout.autoIndices[0] ?? -1,
            error: horizontalFacadeLayout.error,
            warning: horizontalFacadeLayout.warning,
          }
        : verticalFacadeLayout,
    [effectiveFacadeDirection, horizontalFacadeLayout, verticalFacadeLayout]
  );

  const facadeDrawerCount = compositionState.facadeItems.filter((it) => it.type === 'tiroir').length;

  // Épaisseurs de coulisses de fermeture par ordre croissant (12,5mm, 12,7mm, 13mm, 19mm + personnalisées)
  const allSlideThicknesses = useMemo(() => {
    const set = new Set<number>([12.5, 12.7, 13, 19]);
    customSlideThicknesses.forEach((th) => th > 0 && set.add(th));
    if (compositionState.drawerSlideThickness > 0) {
      set.add(compositionState.drawerSlideThickness);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [customSlideThicknesses, compositionState.drawerSlideThickness]);

  const handleSelectSlideThickness = (th: number) => {
    setCompositionState((prev) => ({
      ...prev,
      drawerSlideThickness: th,
      hasDrawers: true,
    }));
  };

  const handleAddManualSlideThickness = (val: number) => {
    if (isNaN(val) || val <= 0) return;
    const rounded = Math.round(val * 10) / 10;
    setCompositionState((prev) => ({
      ...prev,
      drawerSlideThickness: rounded,
      hasDrawers: true,
    }));
    if (![12.5, 12.7, 13, 19].includes(rounded) && !customSlideThicknesses.includes(rounded)) {
      const updated = [...customSlideThicknesses, rounded].sort((a, b) => a - b);
      setCustomSlideThicknesses(updated);
      try {
        localStorage.setItem('calepinage_user_slide_thicknesses', JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  };

  const formatSlideThickness = (val: number): string => {
    return `${String(val).replace('.', ',')} mm`;
  };

  // Mise à jour d'un composant de la façade (type ou hauteur) avec synchronisation des tiroirs
  const updateFacadeItem = (index: number, patch: Partial<FacadeDraftItem>) => {
    setCompositionState((prev) => {
      const isManualHeightEdit =
        patch.height !== undefined && patch.heightValidated === undefined;
      const items = prev.facadeItems.map((it, i) => {
        if (i === index) {
          return {
            ...it,
            ...patch,
            ...(isManualHeightEdit ? { heightValidated: false } : {}),
          };
        }
        // Si l'utilisateur modifie manuellement une hauteur et qu'un autre élément avait été auto-validé,
        // on remet cet élément en mode auto pour qu'il se recalcule automatiquement et propose à nouveau la validation
        if (isManualHeightEdit && it.heightValidated) {
          return {
            ...it,
            height: '',
            heightValidated: false,
          };
        }
        return it;
      });
      const drawers = items.filter((it) => it.type === 'tiroir').length;
      return {
        ...prev,
        facadeItems: items,
        hasDrawers: drawers > 0 ? true : prev.hasDrawers,
        drawersCount: drawers > 0 ? drawers : prev.drawersCount,
      };
    });
  };

  // Déplacer un composant de façade vers le haut (changer l'ordre : Porte <-> Tiroir)
  const moveFacadeItemUp = (index: number) => {
    if (index <= 0) return;
    setCompositionState((prev) => {
      const items = [...prev.facadeItems];
      const temp = items[index - 1];
      items[index - 1] = items[index];
      items[index] = temp;
      return {
        ...prev,
        facadeItems: items,
      };
    });
  };

  // Déplacer un composant de façade vers le bas (changer l'ordre : Porte <-> Tiroir)
  const moveFacadeItemDown = (index: number) => {
    setCompositionState((prev) => {
      if (index >= prev.facadeItems.length - 1) return prev;
      const items = [...prev.facadeItems];
      const temp = items[index + 1];
      items[index + 1] = items[index];
      items[index] = temp;
      return {
        ...prev,
        facadeItems: items,
      };
    });
  };

  // Synchronisation en direct de compositionState vers config pour le calcul immédiat des débits et schéma 2D
  useEffect(() => {
    const useDetailed = compositionState.hasFacades && compositionState.facadesCount > 0;
    const facadeItems = useDetailed
      ? compositionState.facadeItems.map((it, i) => {
          const dh = parseFloat(it.drawerHeight || '');
          const resolvedH = facadeLayout.heights[i] || null;
          return {
            type: it.type,
            height: activeAutoIndices.includes(i) ? null : resolvedH,
            drawerHeight:
              it.type === 'tiroir' && !isNaN(dh) && dh > 0
                ? resolvedH && resolvedH > 0
                  ? Math.min(dh, resolvedH)
                  : dh
                : null,
            material: it.material?.trim() || undefined,
            shelvesCount: it.shelvesCount ? parseInt(it.shelvesCount, 10) : undefined,
            stackInColumn: !!it.stackInColumn,
          };
        })
      : undefined;
    const drawersFromFacade = useDetailed ? facadeDrawerCount : 0;
    const hasDrawers = compositionState.hasDrawers || drawersFromFacade > 0;
    const drawersCount = drawersFromFacade > 0
      ? drawersFromFacade
      : compositionState.hasDrawers
      ? Math.max(1, compositionState.drawersCount)
      : 0;

    const nextDoors =
      compositionState.hasFacades && compositionState.facadesCount > 0
        ? compositionState.facadesCount >= 2
          ? 'two_doors'
          : 'one_door'
        : 'none';

    setConfig((prev) => {
      const isSameFacades = prev.hasFacades === compositionState.hasFacades;
      const isSameCount =
        prev.facadesCount === (compositionState.hasFacades ? compositionState.facadesCount : 0);
      const isSamePlacement = prev.facadePlacement === compositionState.facadePlacement;
      const isSameDirection = prev.facadeDirection === effectiveFacadeDirection;
      const isSameGap = prev.facadeGap === compositionState.facadeGap;
      const isSameHasDrawers = prev.hasDrawers === hasDrawers;
      const isSameDrawersCount = prev.drawersCount === drawersCount;
      const isSameSlideThick = prev.drawerSlideThickness === compositionState.drawerSlideThickness;
      const isSameSlideLen = prev.drawerSlideLength === compositionState.drawerSlideLength;
      const isSameBottomType = prev.drawerBottomType === compositionState.drawerBottomType;
      const isSameGroove = prev.drawerGrooveDepth === compositionState.drawerGrooveDepth;
      const isSameDoors = prev.doors === nextDoors;
      const isSameItems = JSON.stringify(prev.facadeItems) === JSON.stringify(facadeItems);

      if (
        isSameFacades &&
        isSameCount &&
        isSamePlacement &&
        isSameDirection &&
        isSameGap &&
        isSameHasDrawers &&
        isSameDrawersCount &&
        isSameSlideThick &&
        isSameSlideLen &&
        isSameBottomType &&
        isSameGroove &&
        isSameDoors &&
        isSameItems
      ) {
        return prev;
      }

      return {
        ...prev,
        hasFacades: compositionState.hasFacades,
        facadesCount: compositionState.hasFacades ? Math.max(0, compositionState.facadesCount) : 0,
        facadeItems,
        facadePlacement: compositionState.facadePlacement,
        facadeDirection: effectiveFacadeDirection,
        facadeGap: compositionState.facadeGap,
        hasDrawers,
        drawersCount,
        drawerSlideThickness: compositionState.drawerSlideThickness,
        drawerSlideLength: compositionState.drawerSlideLength,
        drawerBottomType: compositionState.drawerBottomType,
        drawerGrooveDepth: compositionState.drawerGrooveDepth,
        doors: nextDoors,
      };
    });
  }, [
    compositionState,
    effectiveFacadeDirection,
    facadeLayout.heights,
    activeAutoIndices,
    facadeDrawerCount,
  ]);

  const handleValidateComposition = () => {
    if (compositionState.hasFacades && facadeLayout.error) return;
    const useDetailed = compositionState.hasFacades;
    const facadeItems = useDetailed
      ? compositionState.facadeItems.map((it, i) => {
          const dh = parseFloat(it.drawerHeight || '');
          const resolvedH = facadeLayout.heights[i] || null;
          return {
            type: it.type,
            height: i === facadeLayout.autoIndex ? null : resolvedH,
            drawerHeight:
              it.type === 'tiroir' && !isNaN(dh) && dh > 0
                ? resolvedH && resolvedH > 0
                  ? Math.min(dh, resolvedH)
                  : dh
                : null,
          };
        })
      : undefined;
    const drawersFromFacade = useDetailed ? facadeDrawerCount : 0;
    const hasDrawers = compositionState.hasDrawers || drawersFromFacade > 0;
    const drawersCount = drawersFromFacade > 0
      ? drawersFromFacade
      : compositionState.hasDrawers
      ? Math.max(1, compositionState.drawersCount)
      : 0;
    setConfig((prev) => ({
      ...prev,
      hasFacades: compositionState.hasFacades,
      facadesCount: compositionState.hasFacades ? Math.max(1, compositionState.facadesCount) : 0,
      facadeItems,
      facadePlacement: compositionState.facadePlacement,
      facadeGap: compositionState.facadeGap,
      hasDrawers,
      drawersCount,
      drawerSlideThickness: compositionState.drawerSlideThickness,
      drawerSlideLength: compositionState.drawerSlideLength,
      drawerBottomType: compositionState.drawerBottomType,
      drawerGrooveDepth: compositionState.drawerGrooveDepth,
      doors: compositionState.hasFacades
        ? compositionState.facadesCount >= 2
          ? 'two_doors'
          : 'one_door'
        : 'none',
    }));
    setShowCompositionModal(false);
    setShowPartsSummaryModal(true);
  };

  const handleSkipComposition = () => {
    setConfig((prev) => ({
      ...prev,
      hasFacades: false,
      facadesCount: 0,
      facadeItems: undefined,
      hasDrawers: false,
      drawersCount: 0,
      doors: 'none',
    }));
    setShowCompositionModal(false);
    setShowPartsSummaryModal(true);
  };

  // Sélection ou saisie libre de la matière pour une partie spécifique du caisson dans la fenêtre récapitulative
  const handlePartMaterialChange = (
    part: CabinetPieceCalculation | CabinetPartKey | undefined,
    newMat: string
  ) => {
    const partKey = typeof part === 'string' ? part : part?.partKey;
    const partId =
      typeof part === 'object' && part
        ? part.partId || part.partKey
        : typeof part === 'string'
        ? part
        : undefined;
    const detectedThickness = extractThicknessFromMaterialName(newMat);

    setConfig((prev) => {
      const next = { ...prev };
      const nextPartMaterials = { ...(prev.partMaterials || {}) };
      if (partId) {
        nextPartMaterials[partId] = newMat;
      }
      if (partKey && (!partId || partId === partKey)) {
        nextPartMaterials[partKey] = newMat;
      }
      next.partMaterials = nextPartMaterials;

      if (!next.material && newMat) {
        next.material = newMat;
      }

      if (partKey === 'sides') {
        next.sidesMaterial = newMat;
        if (detectedThickness) next.thickness = detectedThickness;
      } else if (partKey === 'topBottom') {
        next.topMaterial = newMat;
        next.bottomMaterial = newMat;
        if (detectedThickness && !next.thickness) next.thickness = detectedThickness;
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
        if (!partId || partId === 'doors') {
          next.doorMaterial = newMat;
        }
      } else if (partKey === 'drawers') {
        if (!partId || partId === 'drawers') {
          next.drawerMaterial = newMat;
          if (detectedThickness) {
            next.drawerGrooveDepth = Math.round((detectedThickness / 3) * 10) / 10;
          }
        } else if (partId.startsWith('drawer_sides')) {
          nextPartMaterials['drawer_sides'] = newMat;
          if (detectedThickness) {
            next.drawerGrooveDepth = Math.round((detectedThickness / 3) * 10) / 10;
          }
        } else if (partId.startsWith('drawer_front_back')) {
          nextPartMaterials['drawer_front_back'] = newMat;
          if (detectedThickness && !nextPartMaterials['drawer_sides']) {
            next.drawerGrooveDepth = Math.round((detectedThickness / 3) * 10) / 10;
          }
        }
      }
      return next;
    });
  };

  // Appliquer une matière à toutes les parties du caisson en un clic
  const handleApplyMaterialToAll = (newMat: string) => {
    if (!newMat.trim()) return;
    const detectedThickness = extractThicknessFromMaterialName(newMat);
    setConfig((prev) => {
      const next = { ...prev };
      next.material = newMat;
      next.sidesMaterial = newMat;
      next.topMaterial = newMat;
      next.bottomMaterial = newMat;
      next.partitionsMaterial = newMat;
      next.shelvesMaterial = newMat;
      next.backMaterial = newMat;
      next.doorMaterial = newMat;
      next.drawerMaterial = newMat;
      if (detectedThickness) {
        next.thickness = detectedThickness;
        next.drawerGrooveDepth = Math.round((detectedThickness / 3) * 10) / 10;
      }
      const updatedPartMaterials: Record<string, string> = {};
      if (calculated.pieces.length > 0) {
        calculated.pieces.forEach((p) => {
          if (p.partId) updatedPartMaterials[p.partId] = newMat;
          if (p.partKey) updatedPartMaterials[p.partKey] = newMat;
        });
      }
      next.partMaterials = updatedPartMaterials;
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
      elementName: 'Caisson',
      cabinetCount:
        preset.config.cabinetCount && preset.config.cabinetCount > 0
          ? String(preset.config.cabinetCount)
          : '1',
      customName: preset.config.name || 'Caisson',
      material: preset.config.material || 'Mela 19mm',
      hasFeet: Boolean(preset.config.hasFeet),
      feetHeight: preset.config.feetHeight ? String(preset.config.feetHeight) : '',
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
      shelfRecess: 5,
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

  // Enregistrer définitivement une matière dans le LocalStorage après accord de l'utilisateur
  const handleConfirmSaveMaterial = (mat: string) => {
    const trimmed = mat.trim();
    if (!trimmed) return;
    if (DEFAULT_BASE_MATERIALS.includes(trimmed) || customMaterials.includes(trimmed)) {
      setMaterialToConfirmSave(null);
      return;
    }
    const updated = [...customMaterials, trimmed];
    setCustomMaterials(updated);
    try {
      localStorage.setItem('calepinage_user_materials', JSON.stringify(updated));
    } catch {
      // ignore
    }
    setMaterialToConfirmSave(null);
    setNewMaterialNameToAdd('');
    setShowAddMaterialInput(false);
  };

  // Supprimer une matière personnalisée enregistrée
  const handleDeleteCustomMaterial = (mat: string) => {
    const updated = customMaterials.filter((m) => m !== mat);
    setCustomMaterials(updated);
    try {
      localStorage.setItem('calepinage_user_materials', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Toutes les matières sélectionnables pour chaque partie, triées par ordre alphabétique
  const selectableMaterials = useMemo(() => {
    const set = new Set<string>();

    // 1. Matières de base par ordre alphabétique (MDF, Mela, OSB)
    DEFAULT_BASE_MATERIALS.forEach((m) => set.add(m));

    // 2. Matières personnalisées enregistrées par l'utilisateur
    customMaterials.forEach((m) => m && set.add(m.trim()));

    // 3. Panneaux en stock et chutes atelier
    stockPanels.forEach((p) => p.material && set.add(p.material.trim()));
    workshopStock.forEach((w) => w.material && set.add(w.material.trim()));
    availableMaterials.forEach((m) => m && set.add(m.trim()));

    // Tri alphabétique avec ordre numérique naturel pour les épaisseurs (MDF 3mm < MDF 10mm, MDF < Mela < OSB)
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
    );
  }, [stockPanels, workshopStock, availableMaterials, customMaterials]);

  const allPartsHaveMaterial = useMemo(() => {
    if (calculated.pieces.length === 0) return false;
    return calculated.pieces.every((p) => Boolean(p.material && p.material.trim()));
  }, [calculated.pieces]);

  // Injection des pièces calculées dans la liste de débit (ajout ou mise à jour du caisson)
  const handleInjectPieces = () => {
    if (isEdgeBandingMissing) {
      alert(
        'Le champ « Bande de champ » est obligatoire. Veuillez choisir 0, 1, 2, 3 mm ou saisir une épaisseur manuelle.'
      );
      setShowPartsSummaryModal(false);
      return;
    }
    if (!hasValidDimensions || calculated.cutItems.length === 0) {
      alert(
        'Veuillez renseigner les dimensions du caisson (Hauteur, Largeur, Profondeur) avant de l’enregistrer dans le projet.'
      );
      return;
    }
    if (!allPartsHaveMaterial) {
      setShowPartsSummaryModal(true);
      return;
    }
    if (editingCabinetName && onUpdateCabinetPieces) {
      onUpdateCabinetPieces(editingCabinetName, calculated.cutItems);
    } else {
      onAddPieces(calculated.cutItems);
    }
    resetAllAssistantFields();
    onClose();
  };

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
          {/* Sélecteur Mode : Créer un nouveau caisson OU Modifier un caisson existant du projet */}
          {existingCabinets.length > 0 && (
            <div className="bg-slate-850 border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Action :</span>
                  <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => handleSelectCabinetToEdit(null)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                        editingCabinetName === null
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nouveau caisson</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (existingCabinets.length > 0) {
                          handleSelectCabinetToEdit(
                            editingCabinetName || existingCabinets[0].name
                          );
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                        editingCabinetName !== null
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Modifier un caisson existant</span>
                    </button>
                  </div>
                </div>

                {editingCabinetName !== null && (
                  <div className="flex items-center gap-2 min-w-0">
                    <label className="text-xs text-amber-300 font-bold shrink-0">
                      Caisson à modifier :
                    </label>
                    <select
                      value={editingCabinetName}
                      onChange={(e) => handleSelectCabinetToEdit(e.target.value)}
                      className="bg-slate-900 border border-amber-500/80 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[280px] truncate"
                    >
                      {existingCabinets.map((cab) => (
                        <option key={cab.name} value={cab.name}>
                          {cab.name} ({cab.config.height} × {cab.config.width} × {cab.config.depth} mm)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {editingCabinetName !== null && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs">
                  <div className="flex items-center gap-2 font-medium min-w-0">
                    <Pencil className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">
                      Modification en cours du caisson :{' '}
                      <strong className="text-amber-300 font-bold">{editingCabinetName}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectCabinetToEdit(null)}
                    className="text-[11px] underline text-amber-400 hover:text-amber-200 font-medium shrink-0"
                  >
                    Repasser en création de nouveau caisson
                  </button>
                </div>
              )}
            </div>
          )}

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
                    {/* Ligne d'en-tête : Élément Caisson + Nombre de caissons identiques à côté + Champs obligatoires */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 pb-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-300 shrink-0">
                            Élément :
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-bold tracking-wide">
                            Caisson
                          </span>
                          {editingCabinetName && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                              Modification en cours
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-bold text-slate-300 shrink-0">
                            Nombre de caissons identiques <span className="text-amber-400">*</span> :
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            required
                            value={guidedFields.cabinetCount}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleGuidedFieldChange('cabinetCount', val);
                            }}
                            title="Nombre de caissons identiques pour le calcul du calepinage"
                            className="w-16 bg-slate-800 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-lg px-2 py-1 text-amber-300 text-xs font-bold text-center font-mono"
                          />
                        </div>
                      </div>

                      <span className="text-[11px] text-amber-400 font-medium shrink-0">
                        * Champs obligatoires
                      </span>
                    </div>

                    {guidedValidationError && (
                      <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-500/50 text-red-200 text-[11px] font-medium flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>{guidedValidationError}</span>
                      </div>
                    )}

                    {/* Tous les champs suivants sont masqués à l'ouverture tant qu'aucun élément n'est sélectionné */}
                    {guidedFields.elementName ? (
                      <div className="space-y-3 animate-in fade-in duration-200">
                        {/* Ligne : Nom dans la liste de débit, Bande de champ, Pieds caisson & Hauteur du pied */}
                        <div className="flex flex-wrap sm:flex-nowrap items-end gap-2 sm:gap-2.5">
                          <div className="w-36 sm:w-44 shrink-0">
                            <label className="text-[11px] text-slate-300 block mb-1 truncate">
                              Nom dans la liste de débit <span className="text-amber-400">*</span> :
                            </label>
                            <input
                              type="text"
                              required
                              placeholder={`Ex: ${guidedFields.elementName} Cuisine`}
                              value={guidedFields.customName}
                              onChange={(e) =>
                                handleGuidedFieldChange('customName', e.target.value)
                              }
                              className={`w-full bg-slate-800 border rounded px-2.5 py-1.5 text-white text-xs font-semibold focus:outline-none focus:border-amber-500 placeholder-slate-500 ${
                                guidedValidationError && !guidedFields.customName.trim()
                                  ? 'border-red-500 ring-1 ring-red-500'
                                  : 'border-slate-700'
                              }`}
                            />
                          </div>

                          <div className="w-36 sm:w-44 shrink-0">
                            <label
                              className="text-[11px] text-slate-300 block mb-1 truncate"
                              title="Épaisseur de la bande de champ (obligatoire : 0, 1, 2, 3 mm ou saisie manuelle)"
                            >
                              Bande de champ <span className="text-amber-400">*</span> :
                            </label>
                            {(() => {
                              const cleanEdge = edgeBanding.trim().toLowerCase();
                              const presetKey =
                                cleanEdge === ''
                                  ? ''
                                  : cleanEdge === 'sans' || cleanEdge === '0' || cleanEdge === '0mm'
                                  ? '0'
                                  : cleanEdge === '1mm' || cleanEdge === '1'
                                  ? '1'
                                  : cleanEdge === '2mm' || cleanEdge === '2'
                                  ? '2'
                                  : cleanEdge === '3mm' || cleanEdge === '3'
                                  ? '3'
                                  : '__manual__';
                              const selectVal = isManualEdgeInput ? '__manual__' : presetKey;

                              return (
                                <div className="flex items-center gap-1">
                                  <select
                                    required
                                    value={selectVal}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setGuidedValidationError(null);
                                      if (val === '__manual__') {
                                        setIsManualEdgeInput(true);
                                        setManualEdgeInput(
                                          edgeThickness > 0 ? String(edgeThickness) : ''
                                        );
                                      } else {
                                        setIsManualEdgeInput(false);
                                        setManualEdgeInput('');
                                        if (onEdgeBandingChange) {
                                          onEdgeBandingChange(val === '0' ? 'Sans' : `${val}mm`);
                                        }
                                      }
                                    }}
                                    className={`w-full bg-slate-800 border rounded px-2 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500 ${
                                      isEdgeBandingMissing && !isManualEdgeInput
                                        ? 'border-amber-500/80 text-amber-300'
                                        : 'border-slate-700 text-amber-300'
                                    }`}
                                  >
                                    <option value="" disabled>
                                      -- Choisir * --
                                    </option>
                                    <option value="0">0 mm (Sans)</option>
                                    <option value="1">1 mm</option>
                                    <option value="2">2 mm</option>
                                    <option value="3">3 mm</option>
                                    <option value="__manual__">Saisie manuelle...</option>
                                  </select>

                                  {selectVal === '__manual__' && (
                                    <div className="flex items-center gap-0.5 bg-slate-900 border border-amber-500/70 rounded px-1.5 py-1 shrink-0">
                                      <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="10"
                                        placeholder="0.8"
                                        value={manualEdgeInput}
                                        autoFocus
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          setManualEdgeInput(raw);
                                          setGuidedValidationError(null);
                                          if (!onEdgeBandingChange) return;
                                          const clean = raw.replace(',', '.').trim();
                                          if (clean === '') {
                                            onEdgeBandingChange('');
                                            return;
                                          }
                                          const num = parseFloat(clean);
                                          if (!isNaN(num) && num >= 0) {
                                            onEdgeBandingChange(num === 0 ? 'Sans' : `${clean}mm`);
                                          }
                                        }}
                                        className="w-11 bg-transparent text-xs font-mono font-bold text-amber-300 text-center focus:outline-none"
                                      />
                                      <span className="text-[10px] text-slate-400 font-mono">mm</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          <div className="w-24 sm:w-28 shrink-0">
                            <label
                              className="text-[11px] text-slate-300 block mb-1 truncate"
                              title="Pieds sur ce caisson ?"
                            >
                              Pieds caisson <span className="text-amber-400">*</span> :
                            </label>
                            <select
                              value={guidedFields.hasFeet ? 'true' : 'false'}
                              onChange={(e) => {
                                const hasFeet = e.target.value === 'true';
                                handleGuidedFieldChange('hasFeet', hasFeet, true);
                              }}
                              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
                            >
                              <option value="false">Non</option>
                              <option value="true">Oui</option>
                            </select>
                          </div>

                          {guidedFields.hasFeet && (
                            <div className="w-32 sm:w-36 shrink-0 animate-in fade-in duration-150">
                              <label className="text-[11px] font-semibold text-amber-300 block mb-1 truncate">
                                Hauteur du pied (mm) <span className="text-amber-400">*</span> :
                              </label>
                              <input
                                type="number"
                                required
                                min="10"
                                max="500"
                                placeholder="Ex: 100"
                                value={guidedFields.feetHeight}
                                onChange={(e) =>
                                  handleGuidedFieldChange('feetHeight', e.target.value)
                                }
                                className={`w-full bg-slate-800 border rounded px-2 py-1.5 text-white text-xs font-mono font-bold text-center placeholder-slate-500 focus:outline-none focus:border-amber-500 ${
                                  guidedValidationError &&
                                  (!guidedFields.feetHeight.trim() ||
                                    parseInt(guidedFields.feetHeight, 10) <= 0)
                                    ? 'border-red-500'
                                    : 'border-amber-500/50'
                                }`}
                              />
                            </div>
                          )}
                        </div>

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

                        {/* Choix de la matière qui constitue le corps du caisson */}
                        <div className="p-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl space-y-1.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <label className="text-[11px] font-bold text-amber-300 block">
                              Matière qui va constituer le caisson <span className="text-amber-400">*</span> :
                            </label>
                            {config.thickness > 0 && (
                              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                                Épaisseur détectée : {config.thickness} mm
                              </span>
                            )}
                          </div>
                          <select
                            required
                            value={guidedFields.material}
                            onChange={(e) =>
                              handleGuidedFieldChange('material', e.target.value, true)
                            }
                            className={`w-full bg-slate-800 border rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-amber-500 cursor-pointer ${
                              guidedValidationError && !guidedFields.material
                                ? 'border-red-500'
                                : 'border-slate-700'
                            }`}
                          >
                            <option value="">-- Sélectionner la matière du caisson --</option>
                            {stockPanels.length > 0 && (
                              <optgroup label="📦 En Stock Saisi (Panneaux projet)">
                                {stockPanels.map((p, sIdx) => (
                                  <option key={`g-sp-${sIdx}`} value={p.material}>
                                    {p.material} ({p.length}×{p.width} mm)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {workshopStock.length > 0 && (
                              <optgroup label="🏭 En Stock Atelier (Chutes)">
                                {workshopStock.map((w, wIdx) => (
                                  <option key={`g-ws-${wIdx}`} value={w.material}>
                                    {w.material} ({w.length}×{w.width} mm)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {customMaterials.length > 0 && (
                              <optgroup label="⭐ Mes matières enregistrées">
                                {customMaterials.map((m) => (
                                  <option key={`g-custom-${m}`} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="📋 Matières courantes (Mélaminé, MDF, OSB)">
                              {DEFAULT_BASE_MATERIALS.map((m) => (
                                <option key={`g-base-${m}`} value={m}>
                                  {m}
                                </option>
                              ))}
                            </optgroup>
                          </select>
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

                    {/* SECTION FAÇADES DU MEUBLE (PORTES & TIROIRS) */}
                    <div className="pt-3 border-t border-slate-700/80 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/90 p-3 rounded-xl border border-slate-700/70">
                        <div>
                          <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-amber-400" />
                            <span>Façades du meuble (Portes &amp; Tiroirs)</span>
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Choisissez le nombre de façades, leur type (porte ou tiroir) et leur matière.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-semibold text-slate-300 shrink-0">
                            Nombre de façades :
                          </label>
                          <select
                            value={compositionState.hasFacades ? compositionState.facadesCount : 0}
                            onChange={(e) => {
                              const count = parseInt(e.target.value, 10) || 0;
                              if (count === 0) {
                                setCompositionState((prev) => ({
                                  ...prev,
                                  hasFacades: false,
                                  facadesCount: 0,
                                  hasDrawers: false,
                                  drawersCount: 0,
                                  facadeItems: [],
                                }));
                              } else {
                                const defaultMat =
                                  guidedFields.material || config.material || 'Mela 19mm';
                                setCompositionState((prev) => {
                                  const items = resizeFacadeDraft(
                                    prev.facadeItems,
                                    count,
                                    defaultMat
                                  );
                                  const drawers = items.filter((it) => it.type === 'tiroir').length;
                                  return {
                                    ...prev,
                                    hasFacades: true,
                                    facadesCount: count,
                                    facadeItems: items,
                                    hasDrawers: drawers > 0 ? true : prev.hasDrawers,
                                    drawersCount: drawers > 0 ? drawers : prev.drawersCount,
                                  };
                                });
                              }
                            }}
                            className="bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-bold font-mono cursor-pointer"
                          >
                            <option value="0">0 (Meuble ouvert sans façade)</option>
                            <option value="1">1 façade</option>
                            <option value="2">2 façades</option>
                            <option value="3">3 façades</option>
                            <option value="4">4 façades</option>
                            <option value="5">5 façades</option>
                            <option value="6">6 façades</option>
                          </select>
                        </div>
                      </div>

                      {(!compositionState.hasFacades || compositionState.facadesCount === 0) && (
                        <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                          <span>ℹ️ Meuble ouvert : sans façade ni tiroir. Les étagères et compartiments intérieurs restent directement accessibles.</span>
                        </div>
                      )}

                      {compositionState.hasFacades && compositionState.facadesCount > 0 && (
                        <div className="space-y-3 animate-in fade-in duration-150">
                          {/* Positionnement et Espacement */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                Positionnement des façades :
                              </label>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCompositionState((prev) => ({
                                      ...prev,
                                      facadePlacement: 'applique',
                                    }))
                                  }
                                  className={`p-2 rounded-lg border text-left transition-all ${
                                    compositionState.facadePlacement === 'applique'
                                      ? 'bg-amber-500/20 border-amber-500 text-white font-bold'
                                      : 'bg-slate-850 border-slate-700 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <div className="text-[11px]">En applique</div>
                                  <div className="text-[9px] text-slate-400">Recouvrement chants</div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCompositionState((prev) => ({
                                      ...prev,
                                      facadePlacement: 'interieur',
                                    }))
                                  }
                                  className={`p-2 rounded-lg border text-left transition-all ${
                                    compositionState.facadePlacement === 'interieur'
                                      ? 'bg-amber-500/20 border-amber-500 text-white font-bold'
                                      : 'bg-slate-850 border-slate-700 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <div className="text-[11px]">À l&apos;intérieur</div>
                                  <div className="text-[9px] text-slate-400">Encastrée (rentrante)</div>
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                Jeu / espace entre façades (mm) :
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="20"
                                step="0.5"
                                value={compositionState.facadeGap}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setCompositionState((prev) => ({
                                    ...prev,
                                    facadeGap: isNaN(val) || val < 0 ? 0 : val,
                                  }));
                                }}
                                className="w-full bg-slate-850 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                Jeu périphérique et entre chaque façade (ex: 2 mm)
                              </span>
                            </div>
                          </div>

                          {/* Sens de placement des façades (auto : Gauche -> Droite si plus large que haut) */}
                          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-[11px]">
                              <span className="font-semibold text-slate-300">
                                Sens de placement :
                              </span>
                              <span className="ml-1.5 text-[10px] text-amber-300/90 font-mono">
                                {compoWidth > compoHeight && compoHeight > 0
                                  ? '(Caisson plus large que haut : Gauche → Droite)'
                                  : '(Haut → Bas)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setCompositionState((prev) => ({
                                    ...prev,
                                    facadeDirection: 'horizontal',
                                  }))
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                  effectiveFacadeDirection === 'horizontal'
                                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                                    : 'bg-slate-850 text-slate-300 border-slate-700 hover:bg-slate-800'
                                }`}
                              >
                                ↔️ Gauche → Droite
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCompositionState((prev) => ({
                                    ...prev,
                                    facadeDirection: 'vertical',
                                  }))
                                }
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                  effectiveFacadeDirection === 'vertical'
                                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                                    : 'bg-slate-850 text-slate-300 border-slate-700 hover:bg-slate-800'
                                }`}
                              >
                                ↕️ Haut → Bas
                              </button>
                            </div>
                          </div>

                          {/* Aperçu de l'empilement réel */}
                          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                              <span className="flex items-center gap-1.5 text-amber-300">
                                <Layers className="w-3.5 h-3.5 text-amber-400" />
                                <span>
                                  {effectiveFacadeDirection === 'horizontal'
                                    ? 'Aperçu de la répartition (Gauche → Droite)'
                                    : 'Aperçu de l’empilement réel (Haut → Bas)'}
                                </span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {effectiveFacadeDirection === 'horizontal'
                                  ? `${horizontalFacadeLayout.columnsCount} colonne(s) • L ${horizontalFacadeLayout.columnWidth} mm chacune`
                                  : `${compositionState.facadeItems.length} élément(s) empilé(s)`}
                              </span>
                            </div>

                            {effectiveFacadeDirection === 'horizontal' ? (
                              <div className="space-y-1.5">
                                <div
                                  className="grid gap-1.5"
                                  style={{
                                    gridTemplateColumns: `repeat(${Math.max(
                                      1,
                                      horizontalFacadeLayout.columnsCount
                                    )}, minmax(0, 1fr))`,
                                  }}
                                >
                                  {horizontalFacadeLayout.columns.map((col) => (
                                    <div
                                      key={`h-col-${col.columnIndex}`}
                                      className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-1"
                                    >
                                      <div className="text-[9px] font-mono text-center text-slate-400 border-b border-slate-800 pb-0.5">
                                        Col. {col.columnIndex + 1} • L{' '}
                                        <span className="text-amber-300 font-bold">
                                          {horizontalFacadeLayout.columnWidth}
                                        </span>{' '}
                                        mm
                                      </div>
                                      {col.itemIndices.map((origIdx) => {
                                        const item = compositionState.facadeItems[origIdx];
                                        if (!item) return null;
                                        const h =
                                          facadeLayout.heights[origIdx] ||
                                          parseFloat(item.height) ||
                                          0;
                                        const matName =
                                          item.material ||
                                          guidedFields.material ||
                                          config.material ||
                                          'Mélaminé';
                                        return (
                                          <div
                                            key={`h-item-${origIdx}`}
                                            className="px-2 py-1.5 rounded bg-slate-950/90 border border-slate-700/70 text-center space-y-0.5"
                                          >
                                            <div className="text-[10px] font-bold text-white truncate">
                                              {item.type === 'tiroir' ? 'Tiroir' : 'Porte'}
                                            </div>
                                            <div className="text-[10px] font-mono text-amber-400 font-bold">
                                              {h > 0 ? `H ${h} mm` : 'Auto'}
                                            </div>
                                            <div className="text-[9px] text-amber-300/75 truncate">
                                              {matName}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                                {guidedFields.hasFeet &&
                                  parseInt(guidedFields.feetHeight, 10) > 0 && (
                                    <div className="flex items-center justify-between px-3 py-1 rounded-lg bg-slate-900/60 border border-amber-500/20 text-xs font-mono text-amber-300">
                                      <span className="text-[10px] flex items-center gap-1">
                                        <span>🦶 Pieds sous caisson</span>
                                      </span>
                                      <span>{guidedFields.feetHeight} mm</span>
                                    </div>
                                  )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {compositionState.facadeItems.map((item, idx) => {
                                  const h =
                                    facadeLayout.heights[idx] || parseFloat(item.height) || 0;
                                  const posLabel =
                                    idx === 0
                                      ? 'Haut'
                                      : idx === compositionState.facadeItems.length - 1
                                      ? 'Bas'
                                      : 'Milieu';
                                  const matName =
                                    item.material ||
                                    guidedFields.material ||
                                    config.material ||
                                    'Mélaminé';
                                  return (
                                    <div
                                      key={`prev-${idx}`}
                                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold uppercase">
                                          {posLabel}
                                        </span>
                                        <span className="font-bold text-white">
                                          {item.type === 'tiroir' ? 'Façade tiroir' : 'Porte'}
                                        </span>
                                        {item.type === 'tiroir' && item.drawerHeight && (
                                          <span className="text-[10px] text-slate-400">
                                            (bac {item.drawerHeight} mm)
                                          </span>
                                        )}
                                        <span className="text-[10px] text-amber-300/80">
                                          [{matName}]
                                        </span>
                                      </div>
                                      <span className="text-amber-400 font-bold">
                                        {h > 0 ? `${h} mm` : 'Auto'}
                                      </span>
                                    </div>
                                  );
                                })}
                                {guidedFields.hasFeet &&
                                  parseInt(guidedFields.feetHeight, 10) > 0 && (
                                    <div className="flex items-center justify-between px-3 py-1 rounded-lg bg-slate-900/60 border border-amber-500/20 text-xs font-mono text-amber-300">
                                      <span className="text-[10px] flex items-center gap-1">
                                        <span>🦶 Pieds sous caisson</span>
                                      </span>
                                      <span>{guidedFields.feetHeight} mm</span>
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>

                          {/* Configuration détaillée de chaque façade avec changement d'ordre et sélection matière */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-300">
                                Détail et ordre des composants :
                              </span>
                              <span className="text-[10px] text-amber-300 font-mono font-semibold">
                                {effectiveFacadeDirection === 'horizontal'
                                  ? `${horizontalFacadeLayout.columnsCount} × L ${horizontalFacadeLayout.columnWidth} mm (jeu ${compositionState.facadeGap} mm)`
                                  : `L ${facadeAvailableWidth} mm`}
                              </span>
                            </div>

                            {compositionState.facadeItems.map((item, idx) => {
                              const isAuto = activeAutoIndices.includes(idx);
                              const resolved = facadeLayout.heights[idx];
                              const facadeH = parseFloat(item.height) || resolved || 0;
                              const drawerHVal = parseFloat(item.drawerHeight || '') || 0;
                              const missingDrawerH =
                                item.type === 'tiroir' && !(facadeH > 0);
                              const exceedsFacadeH =
                                item.type === 'tiroir' && facadeH > 0 && drawerHVal > facadeH;
                              const standardDrawerHeights = [
                                60, 80, 100, 120, 140, 150, 160, 180, 200, 220, 250,
                              ];
                              const itemMat =
                                item.material ||
                                guidedFields.material ||
                                config.material ||
                                'Mela 19mm';

                              const posBadge =
                                effectiveFacadeDirection === 'horizontal'
                                  ? idx === 0
                                    ? 'GAUCHE'
                                    : idx === compositionState.facadeItems.length - 1
                                    ? 'DROITE'
                                    : 'MILIEU'
                                  : idx === 0
                                  ? 'HAUT'
                                  : idx === compositionState.facadeItems.length - 1
                                  ? 'BAS'
                                  : 'MILIEU';

                              return (
                                <div
                                  key={`facade-card-${idx}`}
                                  className="p-3 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-2.5 shadow-sm"
                                >
                                  {/* Barre supérieure : Badge position + Boutons d'ordre */}
                                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                        #{idx + 1} {posBadge}
                                      </span>
                                      <span className="text-xs font-bold text-white">
                                        {item.type === 'tiroir' ? 'Façade Tiroir' : 'Porte'}
                                      </span>
                                      {effectiveFacadeDirection === 'horizontal' && (
                                        <span className="text-[10px] font-mono text-slate-400">
                                          (L {horizontalFacadeLayout.columnWidth} mm)
                                        </span>
                                      )}
                                    </div>

                                    {/* Boutons pour modifier l'ordre des façades */}
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => moveFacadeItemUp(idx)}
                                        title={
                                          effectiveFacadeDirection === 'horizontal'
                                            ? 'Déplacer vers la gauche'
                                            : 'Monter cette façade vers le haut'
                                        }
                                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 transition-colors"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                        <span>
                                          {effectiveFacadeDirection === 'horizontal'
                                            ? 'Gauche'
                                            : 'Monter'}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          idx === compositionState.facadeItems.length - 1
                                        }
                                        onClick={() => moveFacadeItemDown(idx)}
                                        title={
                                          effectiveFacadeDirection === 'horizontal'
                                            ? 'Déplacer vers la droite'
                                            : 'Descendre cette façade vers le bas'
                                        }
                                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold flex items-center gap-1 transition-colors"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                        <span>
                                          {effectiveFacadeDirection === 'horizontal'
                                            ? 'Droite'
                                            : 'Descendre'}
                                        </span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Disposition des tiroirs en mode Gauche -> Droite : répartis ou l'un sous l'autre */}
                                  {effectiveFacadeDirection === 'horizontal' &&
                                    item.type === 'tiroir' &&
                                    idx > 0 && (
                                      <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                        <span className="text-slate-300 font-medium">
                                          Placement de ce tiroir :
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateFacadeItem(idx, { stackInColumn: false })
                                            }
                                            className={`px-2 py-0.5 rounded-md font-semibold border transition-colors ${
                                              !item.stackInColumn
                                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                                            }`}
                                          >
                                            Réparti (compartiment à droite)
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateFacadeItem(idx, { stackInColumn: true })
                                            }
                                            className={`px-2 py-0.5 rounded-md font-semibold border transition-colors ${
                                              item.stackInColumn
                                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                                            }`}
                                          >
                                            Sous le précédent (même colonne)
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                  {/* Contrôles principaux : Type, Matière de la façade, Hauteur */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {/* Type */}
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                                        Type d&apos;élément :
                                      </label>
                                      <select
                                        value={item.type}
                                        onChange={(e) =>
                                          updateFacadeItem(idx, {
                                            type: e.target.value as FacadeItemType,
                                          })
                                        }
                                        className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-white font-semibold cursor-pointer"
                                      >
                                        <option value="porte">Porte</option>
                                        <option value="tiroir">Façade tiroir</option>
                                      </select>
                                    </div>

                                    {/* Matière de cette façade */}
                                    <div>
                                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                                        Matière de cette façade :
                                      </label>
                                      <select
                                        value={itemMat}
                                        onChange={(e) =>
                                          updateFacadeItem(idx, { material: e.target.value })
                                        }
                                        className="w-full bg-slate-800 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-amber-300 font-bold cursor-pointer"
                                      >
                                        {selectableMaterials.map((m) => (
                                          <option key={`m-facade-${idx}-${m}`} value={m}>
                                            {m}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    {/* Hauteur de la façade (auto-remplie si N-1 façades saisies, avec bouton Valider) */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1 gap-1">
                                        <label className="block text-[10px] font-semibold text-slate-400 truncate">
                                          Hauteur façade (mm) :
                                        </label>
                                        {item.heightValidated && resolved > 0 ? (
                                          <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-0.5 shrink-0">
                                            <Check className="w-3 h-3" /> Validée ({resolved} mm)
                                          </span>
                                        ) : isAuto && resolved > 0 ? (
                                          <span className="text-[10px] font-mono font-bold text-amber-300 shrink-0">
                                            Calculé : {resolved} mm (espaces déduits)
                                          </span>
                                        ) : resolved > 0 ? (
                                          <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                                            {resolved} mm
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.5"
                                          value={
                                            !item.heightValidated && item.height !== ''
                                              ? item.height
                                              : isAuto && resolved > 0
                                              ? String(resolved)
                                              : ''
                                          }
                                          onChange={(e) =>
                                            updateFacadeItem(idx, { height: e.target.value })
                                          }
                                          placeholder={
                                            item.type === 'tiroir' ? 'Hauteur façade *' : 'Auto'
                                          }
                                          className={`flex-1 min-w-0 bg-slate-800 border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold ${
                                            item.heightValidated && resolved > 0
                                              ? 'border-emerald-500/70 text-emerald-300'
                                              : isAuto && resolved > 0
                                              ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                                              : missingDrawerH && !isAuto
                                              ? 'border-red-500 text-white'
                                              : 'border-slate-700 focus:border-amber-500 text-white'
                                          }`}
                                        />
                                        {isAuto && resolved > 0 && !item.heightValidated && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateFacadeItem(idx, {
                                                height: '',
                                                heightValidated: true,
                                              })
                                            }
                                            title={`Valider la hauteur calculée automatiquement (${resolved} mm, espaces déduits)`}
                                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center gap-1 shrink-0 shadow-sm transition-all"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Valider</span>
                                          </button>
                                        )}
                                        {item.heightValidated && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateFacadeItem(idx, {
                                                height: '',
                                                heightValidated: false,
                                              })
                                            }
                                            title="Remettre en attente de validation"
                                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-semibold shrink-0 transition-colors"
                                          >
                                            Auto
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Options spécifiques si Façade tiroir */}
                                  {item.type === 'tiroir' && (
                                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 animate-in fade-in duration-150">
                                      {/* Hauteur du bac de tiroir */}
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                                          <span className="font-semibold text-amber-300 flex items-center gap-1">
                                            <Ruler className="w-3 h-3 text-amber-400" />
                                            <span>Hauteur du bac (tiroir) * :</span>
                                          </span>
                                          <span className="text-slate-400 font-mono">
                                            {facadeH > 0
                                              ? `Max autorisé : ${facadeH} mm`
                                              : 'Saisissez d’abord la hauteur façade'}
                                          </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1">
                                          {standardDrawerHeights.map((dh) => {
                                            const isTooHigh = facadeH > 0 && dh > facadeH;
                                            const isSelected = drawerHVal === dh;
                                            return (
                                              <button
                                                key={`it-${idx}-dh-${dh}`}
                                                type="button"
                                                disabled={isTooHigh}
                                                onClick={() => {
                                                  if (!isTooHigh) {
                                                    updateFacadeItem(idx, {
                                                      drawerHeight: String(dh),
                                                    });
                                                  }
                                                }}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                                                  isTooHigh
                                                    ? 'opacity-30 line-through cursor-not-allowed bg-slate-900 text-slate-600'
                                                    : isSelected
                                                    ? 'bg-amber-500 text-slate-950 font-black'
                                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                                }`}
                                              >
                                                {dh} mm
                                              </button>
                                            );
                                          })}
                                          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                                            <input
                                              type="number"
                                              min="1"
                                              max={facadeH > 0 ? facadeH : undefined}
                                              placeholder="Autre"
                                              value={item.drawerHeight || ''}
                                              onChange={(e) =>
                                                updateFacadeItem(idx, {
                                                  drawerHeight: e.target.value,
                                                })
                                              }
                                              className="w-12 bg-transparent text-[10px] font-mono font-bold text-white focus:outline-none"
                                            />
                                            <span className="text-[9px] text-slate-400">mm</span>
                                          </div>
                                        </div>
                                        {exceedsFacadeH && (
                                          <p className="text-[10px] text-red-400 font-semibold">
                                            La hauteur du tiroir ({drawerHVal} mm) ne peut pas dépasser celle de la façade ({facadeH} mm).
                                          </p>
                                        )}
                                      </div>

                                      {/* Épaisseur des coulisses */}
                                      <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-slate-800/80 text-[10px]">
                                        <span className="font-semibold text-slate-300">
                                          Épaisseur coulisses :
                                        </span>
                                        <div className="flex flex-wrap items-center gap-1">
                                          {allSlideThicknesses.map((th) => (
                                            <button
                                              key={`th-${idx}-${th}`}
                                              type="button"
                                              onClick={() => handleSelectSlideThickness(th)}
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                                compositionState.drawerSlideThickness === th
                                                  ? 'bg-amber-500 text-slate-950'
                                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                              }`}
                                            >
                                              {formatSlideThickness(th)}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Options si Porte */}
                                  {item.type === 'porte' && (
                                    <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                                      <span className="text-slate-300">
                                        Étagères intérieures associées à cette porte :
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max="10"
                                          placeholder="0"
                                          value={item.shelvesCount || ''}
                                          onChange={(e) =>
                                            updateFacadeItem(idx, {
                                              shelvesCount: e.target.value,
                                            })
                                          }
                                          className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-center text-xs font-mono font-bold text-white"
                                        />
                                        <span className="text-[10px] text-slate-400">étagère(s)</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {facadeLayout.error && (
                            <div className="flex items-start gap-1.5 text-[11px] text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg px-2.5 py-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{facadeLayout.error}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
                      <span className="text-[11px] text-slate-400">
                        {isGuidedFormComplete(guidedFields)
                          ? '✅ Meuble complet configuré — prêt à être ajouté au projet.'
                          : 'Remplissez les dimensions et la matière du caisson.'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleOpenPartsSummaryModal}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Matière par partie...</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center text-xs text-slate-400">
                    👆 Veuillez sélectionner un <strong>Élément</strong> ci-dessus pour afficher et remplir ses dimensions.
                  </div>
                )}
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
                  {/* 1. Nom du caisson / élément */}
                  <div className="col-span-5 sm:col-span-4 min-w-0">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1 truncate">
                      <span className="sm:hidden">Nom</span>
                      <span className="hidden sm:inline">Nom du meuble / élément</span>
                    </label>
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={config.name}
                      onChange={(e) => {
                        setConfig({ ...config, name: e.target.value });
                        setGuidedFields((prev) => ({ ...prev, elementName: e.target.value }));
                      }}
                      placeholder="Ex: Caisson, Façades..."
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
                  <div className="col-span-3 min-w-0">
                    <label className="block text-[11px] font-bold text-amber-300 mb-1 truncate text-center sm:text-left">
                      <span className="sm:hidden">Nbre caisson</span>
                      <span className="hidden sm:inline">Nbre de caissons</span>
                    </label>
                    <input
                      type="number"
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
                      className="w-full bg-slate-900 border border-amber-500/50 focus:border-amber-400 rounded-lg px-2 py-1.5 text-xs text-amber-400 font-mono font-bold text-center shadow-inner placeholder-slate-500"
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
                      <span>Profondeur étagère :</span>
                      <span className="font-mono font-bold text-amber-300">
                        {config.backType === 'groove'
                          ? `P - ép. fond - 5 mm`
                          : `P - 5 mm`}
                      </span>
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

                    {/* Pieds sous le caisson */}
                    {config.hasFeet && (
                      <g>
                        <rect x="35" y="185" width="16" height="11" fill="#f59e0b" stroke="#d97706" strokeWidth="1" rx="1.5" />
                        <rect x="189" y="185" width="16" height="11" fill="#f59e0b" stroke="#d97706" strokeWidth="1" rx="1.5" />
                        <text x="120" y="194" fill="#f59e0b" textAnchor="middle" fontSize="7" fontWeight="bold">
                          Pieds: {config.feetHeight || '--'} mm
                        </text>
                      </g>
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
                      {config.height > 0
                        ? config.hasFeet && config.feetHeight
                          ? `H = ${config.height} mm (Corps : ${config.height - config.feetHeight} mm)`
                          : `H = ${config.height} mm`
                        : 'H = -- mm'}
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

        {/* Pied de la modale */}
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
            {calculated.pieces.length > 0 && (
              <button
                type="button"
                onClick={handleOpenPartsSummaryModal}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Détail matières par partie</span>
              </button>
            )}
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

            {/* Barre d'outils rapide : Nom du caisson + Appliquer une matière à tout + Ajouter une nouvelle matière */}
            <div className="px-4 sm:px-5 py-3 bg-slate-900/90 border-b border-slate-800 space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="block text-[11px] font-semibold text-amber-300">
                      Appliquer une matière à tout :
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddMaterialInput((prev) => !prev)}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Ajouter une matière</span>
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        list="all-materials-datalist"
                        value={bulkMaterial}
                        onChange={(e) => setBulkMaterial(e.target.value)}
                        placeholder="Saisir ou choisir la matière..."
                        className="w-full bg-slate-800 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
                      />
                      <datalist id="all-materials-datalist">
                        {selectableMaterials.map((m) => (
                          <option key={`all-dl-${m}`} value={m} />
                        ))}
                      </datalist>
                    </div>
                    <button
                      type="button"
                      disabled={!bulkMaterial.trim()}
                      onClick={() => {
                        if (bulkMaterial.trim()) {
                          handleApplyMaterialToAll(bulkMaterial.trim());
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold disabled:opacity-40 transition-colors shrink-0"
                    >
                      Appliquer à tout
                    </button>
                  </div>
                </div>
              </div>

              {/* Formulaire d'ajout rapide d'une nouvelle matière à la boîte */}
              {showAddMaterialInput && (
                <div className="p-3 bg-slate-850 rounded-xl border border-amber-500/40 space-y-2 animate-in fade-in duration-150">
                  <label className="block text-[11px] font-semibold text-amber-300">
                    Ajouter une nouvelle matière à la boîte de sélection :
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMaterialNameToAdd}
                      onChange={(e) => setNewMaterialNameToAdd(e.target.value)}
                      placeholder="Ex: MDF 22mm, Mela 18mm, OSB 30mm, Chêne 20mm..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      disabled={!newMaterialNameToAdd.trim()}
                      onClick={() => {
                        if (newMaterialNameToAdd.trim()) {
                          setMaterialToConfirmSave(newMaterialNameToAdd.trim());
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-40 shrink-0"
                    >
                      Enregistrer...
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMaterialInput(false);
                        setNewMaterialNameToAdd('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors shrink-0"
                    >
                      Annuler
                    </button>
                  </div>

                  {customMaterials.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-400 block mb-1">
                        Matières personnalisées enregistrées :
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {customMaterials.map((m) => (
                          <span
                            key={`custom-tag-${m}`}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-amber-300 border border-slate-700 font-medium"
                          >
                            <span>{m}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomMaterial(m)}
                              title={`Supprimer « ${m} » de la boîte de sélection`}
                              className="text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Liste détaillée de chaque partie avec saisie libre individuelle de la matière */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {calculated.pieces.map((part, idx) => {
                const isPartMatUnsaved =
                  part.material &&
                  !DEFAULT_BASE_MATERIALS.includes(part.material.trim()) &&
                  !customMaterials.includes(part.material.trim());
                const partEdgeKey = part.partId || part.partKey;
                const partEdges: EdgeBandingEdges =
                  (partEdgeKey && config.partEdgeBanding?.[partEdgeKey]) || {};
                const { cutLength, cutWidth, hasDeduction } = computeCutDimensions(
                  part.length,
                  part.width,
                  partEdges,
                  edgeThickness
                );

                return (
                  <div
                    key={`${part.partId || part.partKey || idx}-${idx}`}
                    className="p-3.5 rounded-2xl bg-slate-850 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {edgeThickness > 0 && (
                          <EdgeBandingButton
                            edges={partEdges}
                            onClick={() => setEditingPartEdges(part)}
                          />
                        )}
                      </div>
                      <div className="text-xs font-mono text-emerald-400 pl-5">
                        Dimensions débit : <strong>{part.length} × {part.width} mm</strong>
                        {edgeThickness > 0 && hasDeduction && (
                          <span className="ml-2 text-orange-300">
                            → Coupe : <strong>{cutLength} × {cutWidth} mm</strong>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 pl-5 italic">
                        {part.formula}
                      </div>

                      {part.drawerIndex !== undefined &&
                        (() => {
                          const dIdx = part.drawerIndex;
                          const dVal = config.depth || parseInt(guidedFields.depth, 10) || 0;
                          const bType =
                            config.backType || (guidedFields.backType as BackType) || 'none';
                          const chosenBackMat =
                            config.partMaterials?.['back'] || config.backMaterial || '';
                          const bTh =
                            bType === 'groove'
                              ? extractThicknessFromMaterialName(chosenBackMat) ||
                                config.backThickness ||
                                8
                              : 0;
                          const maxSide =
                            part.maxDrawerSideLength ||
                            (dVal > 0 ? Math.max(100, Math.floor(dVal - bTh - 10)) : 1000);
                          const currentSideLen =
                            config.drawerSlideLengths?.[dIdx] ??
                            part.drawerSideLength ??
                            0;
                          const deducedSlide =
                            currentSideLen >= 50 ? Math.floor(currentSideLen / 50) * 50 : 0;

                          const updateDrawerSideLength = (val: number) => {
                            const clamped = Math.max(50, Math.min(maxSide, val));
                            setConfig((prev) => {
                              const nextArr = [...(prev.drawerSlideLengths || [])];
                              nextArr[dIdx] = clamped;
                              return { ...prev, drawerSlideLengths: nextArr };
                            });
                          };

                          return (
                            <div className="mt-2 ml-5 p-2.5 rounded-xl bg-slate-950/70 border border-amber-500/30 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                                <span className="text-emerald-400 font-semibold">
                                  Longueur max disponible : <strong>{maxSide} mm</strong>
                                  {dVal > 0 && (
                                    <span className="text-slate-400 font-normal ml-1">
                                      (Prof. {dVal} -{' '}
                                      {bType === 'groove'
                                        ? `Fond encastré ${bTh}`
                                        : 'Fond non encastré'}{' '}
                                      - 10 mm jeu)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <label className="text-[11px] font-semibold text-amber-300">
                                  Longueur du côté :
                                </label>
                                <div className="relative w-28">
                                  <input
                                    type="number"
                                    min={50}
                                    max={maxSide}
                                    step={1}
                                    value={currentSideLen || ''}
                                    onChange={(e) => {
                                      const raw = parseInt(e.target.value, 10);
                                      if (!isNaN(raw) && raw > 0) {
                                        updateDrawerSideLength(raw);
                                      } else {
                                        setConfig((prev) => {
                                          const nextArr = [...(prev.drawerSlideLengths || [])];
                                          delete nextArr[dIdx];
                                          return { ...prev, drawerSlideLengths: nextArr };
                                        });
                                      }
                                    }}
                                    placeholder={`Max ${maxSide}`}
                                    className="w-full px-2.5 py-1 pr-8 rounded-lg bg-slate-900 border border-amber-500/50 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                                    mm
                                  </span>
                                </div>
                                <span className="px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono font-bold text-amber-300">
                                  Coulisse : {deducedSlide > 0 ? `${deducedSlide} mm` : '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                    </div>

                    {/* Saisie libre et sélecteur de matière spécifique pour cette partie */}
                    <div className="sm:w-72 md:w-80 shrink-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          Matière de cette partie <span className="text-amber-400">*</span> :
                        </label>
                        {part.material ? (
                          <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Saisie
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-mono">À renseigner</span>
                        )}
                      </div>

                      {/* Champ de saisie au clavier avec suggestions datalist */}
                      <div className="relative">
                        <input
                          type="text"
                          list={`part-mat-dl-${idx}`}
                          value={part.material || ''}
                          onChange={(e) => handlePartMaterialChange(part, e.target.value)}
                          placeholder="Saisir la matière (ex: MDF 19mm, Mela 19mm, OSB 18mm)..."
                          className={`w-full bg-slate-900 border rounded-xl px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-amber-500 transition-all ${
                            part.material ? 'border-emerald-500/60' : 'border-amber-500/80 shadow-sm'
                          }`}
                        />
                        <datalist id={`part-mat-dl-${idx}`}>
                          {selectableMaterials.map((m) => (
                            <option key={`p-dl-${idx}-${m}`} value={m} />
                          ))}
                        </datalist>
                      </div>

                      {/* Si la matière saisie n'est pas encore enregistrée, proposer l'accord pour l'enregistrer */}
                      {isPartMatUnsaved && (
                        <button
                          type="button"
                          onClick={() => setMaterialToConfirmSave(part.material.trim())}
                          className="text-[10px] text-amber-300 hover:text-amber-200 underline font-semibold flex items-center gap-1 transition-colors"
                        >
                          <BookmarkPlus className="w-3 h-3" />
                          <span>Enregistrer « {part.material} » dans la boîte de sélection ?</span>
                        </button>
                      )}

                      {/* Menu déroulant de sélection rapide par ordre alphabétique */}
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value === '__ADD_NEW__') {
                            setShowAddMaterialInput(true);
                          } else if (e.target.value) {
                            handlePartMaterialChange(part, e.target.value);
                          }
                        }}
                        className="w-full bg-slate-900/80 border border-slate-700/80 hover:border-slate-600 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value="">-- ou choisir dans le stock / liste --</option>
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
                        {customMaterials.length > 0 && (
                          <optgroup label="⭐ Mes matières enregistrées">
                            {customMaterials.map((m) => (
                              <option key={`part-custom-${m}`} value={m}>
                                {m}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="📋 Matières de base (MDF, Mela, OSB)">
                          {DEFAULT_BASE_MATERIALS.map((m) => (
                            <option key={`part-base-${m}`} value={m}>
                              {m}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="✨ Personnalisation">
                          <option value="__ADD_NEW__">➕ Enregistrer une nouvelle matière...</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                );
              })}
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
                  onClick={() => {
                    setShowPartsSummaryModal(false);
                    setShowCompositionModal(true);
                  }}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Façades &amp; Tiroirs</span>
                </button>

                <button
                  type="button"
                  disabled={!allPartsHaveMaterial}
                  onClick={() => {
                    const generated = generatePromptFromConfig(calculated.config);
                    setAiPrompt(generated);
                    setShowPartsSummaryModal(false);
    setShowCompositionModal(false);
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
                  {editingCabinetName ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {editingCabinetName
                      ? 'Mettre à jour ce caisson dans le projet'
                      : 'Ajouter ce caisson au projet'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FENÊTRE FLOTTANTE : Composition du caisson (Façades, Positionnement, Tiroirs, Coulisses) */}
      {showCompositionModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            className="modal-box bg-slate-900 border-2 border-amber-500/60 w-full max-w-xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white"
          >
            {/* En-tête */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/95">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white flex items-center gap-2 truncate">
                    Composition du caisson
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">
                    {config.name || guidedFields.customName || 'Caisson'} • H {config.height || guidedFields.height} × L {config.width || guidedFields.width} × P {config.depth || guidedFields.depth} mm
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCompositionModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corps défilable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* SECTION FAÇADES */}
              <div className="p-4 rounded-2xl bg-slate-850 border border-slate-700/80 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={compositionState.hasFacades}
                      onChange={(e) =>
                        setCompositionState((prev) => ({
                          ...prev,
                          hasFacades: e.target.checked,
                          facadesCount:
                            prev.facadesCount > 0
                              ? prev.facadesCount
                              : (config.width || parseInt(guidedFields.width, 10) || 0) >= 600
                              ? 2
                              : 1,
                        }))
                      }
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs sm:text-sm font-bold text-amber-300">
                      Ajouter une ou des façades
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400">Portes / Battants</span>
                </div>

                {compositionState.hasFacades && (
                  <div className="space-y-3 pt-2.5 border-t border-slate-800 animate-in fade-in duration-150">
                    {/* Nombre de façades et Espace entre composants */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Nombre de façades <span className="text-amber-400">*</span> :
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={compositionState.facadesCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            const count = isNaN(val) || val < 1 ? 1 : Math.min(10, val);
                            setCompositionState((prev) => {
                              const items = resizeFacadeDraft(prev.facadeItems, count);
                              const drawers = items.filter((it) => it.type === 'tiroir').length;
                              return {
                                ...prev,
                                facadesCount: count,
                                facadeItems: items,
                                drawersCount: drawers > 0 ? drawers : prev.drawersCount,
                              };
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Espace souhaité entre composants (mm) :
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.5"
                          value={compositionState.facadeGap}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCompositionState((prev) => ({
                              ...prev,
                              facadeGap: isNaN(val) || val < 0 ? 0 : val,
                            }));
                          }}
                          placeholder="Ex: 2"
                          title="Espace souhaité entre chaque composant de la façade si j'en ai plusieurs"
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Jeu intermédiaire si plusieurs façades (ex: 2 mm)
                        </span>
                      </div>
                    </div>

                    {/* Positionnement : En applique ou À l'intérieur du caisson */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                        Positionnement de la façade <span className="text-amber-400">*</span> :
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCompositionState((prev) => ({
                              ...prev,
                              facadePlacement: 'applique',
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            compositionState.facadePlacement === 'applique'
                              ? 'bg-amber-500/20 border-amber-500 text-white shadow-sm'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-xs flex items-center justify-between">
                            <span>En applique</span>
                            {compositionState.facadePlacement === 'applique' && (
                              <span className="text-amber-400 text-[10px] font-mono">● Choisi</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                            Recouvrement des chants du caisson (jeu 2 mm tout autour)
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setCompositionState((prev) => ({
                              ...prev,
                              facadePlacement: 'interieur',
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            compositionState.facadePlacement === 'interieur'
                              ? 'bg-amber-500/20 border-amber-500 text-white shadow-sm'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-xs flex items-center justify-between">
                            <span>À l&apos;intérieur du caisson</span>
                            {compositionState.facadePlacement === 'interieur' && (
                              <span className="text-amber-400 text-[10px] font-mono">● Choisi</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                            Façade rentrante encastrée entre les parois (jeu 2 mm)
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Composition de la façade : composants empilés du haut vers le bas */}
                    <div className="pt-2.5 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-[11px] font-semibold text-slate-300">
                          Composition de la façade <span className="text-amber-400">*</span> :
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Haut → Bas • L {facadeAvailableWidth} mm
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug">
                        Saisissez la hauteur de chaque élément ; laissez <b>une seule porte</b> vide pour que sa
                        hauteur soit calculée automatiquement. La hauteur des tiroirs est toujours obligatoire.
                      </p>

                      <div className="space-y-1.5">
                        {compositionState.facadeItems.map((item, idx) => {
                          const isAuto = idx === facadeLayout.autoIndex;
                          const resolved = facadeLayout.heights[idx];
                          const facadeH = parseFloat(item.height) || resolved || 0;
                          const drawerHVal = parseFloat(item.drawerHeight || '') || 0;
                          const missingDrawerH = item.type === 'tiroir' && !(parseFloat(item.height) > 0);
                          const missingDrawerBoxH = item.type === 'tiroir' && !(drawerHVal > 0);
                          const exceedsFacadeH =
                            item.type === 'tiroir' && facadeH > 0 && drawerHVal > facadeH;
                          const standardDrawerHeights = [60, 80, 100, 120, 140, 160, 180, 200, 220, 250];

                          return (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2"
                            >
                              <div className="grid grid-cols-[1.5rem_1fr_1fr_5.5rem] items-center gap-2">
                                <span className="text-[11px] font-mono font-bold text-slate-500 text-center">
                                  {idx + 1}
                                </span>
                                <select
                                  value={item.type}
                                  onChange={(e) =>
                                    updateFacadeItem(idx, { type: e.target.value as FacadeItemType })
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-white font-semibold"
                                >
                                  <option value="porte">Porte</option>
                                  <option value="tiroir">Façade tiroir</option>
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={
                                    !item.heightValidated && item.height !== ''
                                      ? item.height
                                      : isAuto && resolved > 0
                                      ? String(resolved)
                                      : ''
                                  }
                                  onChange={(e) => updateFacadeItem(idx, { height: e.target.value })}
                                  placeholder={item.type === 'tiroir' ? 'Hauteur façade *' : 'Auto'}
                                  title={
                                    item.type === 'tiroir'
                                      ? 'Hauteur de la façade du tiroir'
                                      : 'Hauteur de la porte (calcul automatique si dernier élément)'
                                  }
                                  className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold ${
                                    item.heightValidated && resolved > 0
                                      ? 'border-emerald-500/70 text-emerald-300'
                                      : isAuto && resolved > 0
                                      ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                                      : missingDrawerH && !isAuto
                                      ? 'border-red-500/70 focus:border-red-400 text-white'
                                      : 'border-slate-700 focus:border-amber-500 text-white'
                                  }`}
                                />
                                {isAuto && resolved > 0 && !item.heightValidated ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateFacadeItem(idx, {
                                        height: '',
                                        heightValidated: true,
                                      })
                                    }
                                    className="px-2 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center justify-center gap-1 shadow-sm"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Valider</span>
                                  </button>
                                ) : (
                                  <span
                                    className={`text-[11px] font-mono font-bold text-right ${
                                      item.heightValidated ? 'text-emerald-400' : 'text-slate-400'
                                    }`}
                                  >
                                    {resolved > 0 ? `${resolved} mm` : '—'}
                                  </span>
                                )}
                              </div>

                              {/* Options spécifiques dès que Façade tiroir est sélectionné : Hauteur du tiroir & Épaisseur des coulisses */}
                              {item.type === 'tiroir' && (
                                <div className="pt-2 border-t border-slate-800 space-y-2 bg-slate-950/60 p-2.5 rounded-lg animate-in fade-in duration-150">
                                  {/* 1. Choix de la hauteur du tiroir (bac) <= hauteur de la façade */}
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Ruler className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span className="text-[11px] font-semibold text-amber-300">
                                          Hauteur du tiroir <span className="text-red-400">*</span> :
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-mono text-slate-400">
                                        {facadeH > 0
                                          ? `Max autorisé : ${facadeH} mm (hauteur façade)`
                                          : 'Saisissez d’abord la hauteur de la façade'}
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {standardDrawerHeights.map((dh) => {
                                        const isTooHigh = facadeH > 0 && dh > facadeH;
                                        const isSelected = drawerHVal === dh;
                                        return (
                                          <button
                                            key={`item-${idx}-dh-${dh}`}
                                            type="button"
                                            disabled={isTooHigh}
                                            onClick={() => {
                                              if (isTooHigh) return;
                                              updateFacadeItem(idx, { drawerHeight: String(dh) });
                                            }}
                                            title={
                                              isTooHigh
                                                ? `Interdit : ${dh} mm est supérieur à la hauteur de la façade (${facadeH} mm)`
                                                : `Choisir une hauteur de tiroir de ${dh} mm`
                                            }
                                            className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition-all ${
                                              isTooHigh
                                                ? 'bg-slate-900/40 text-slate-600 border border-slate-800/60 cursor-not-allowed line-through opacity-40'
                                                : isSelected
                                                ? 'bg-amber-500 text-slate-950 shadow-sm'
                                                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
                                            }`}
                                          >
                                            {dh} mm
                                          </button>
                                        );
                                      })}

                                      {/* Saisie manuelle de la hauteur du tiroir (strictement <= hauteur façade) */}
                                      <div
                                        className={`flex items-center gap-1 bg-slate-900 border rounded-md px-2 py-0.5 ${
                                          exceedsFacadeH || missingDrawerBoxH
                                            ? 'border-red-500/70 focus-within:border-red-400'
                                            : 'border-slate-700 focus-within:border-amber-500'
                                        }`}
                                      >
                                        <input
                                          type="number"
                                          step="1"
                                          min="1"
                                          max={facadeH > 0 ? facadeH : undefined}
                                          placeholder="Hauteur *"
                                          value={item.drawerHeight || ''}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            if (raw === '') {
                                              updateFacadeItem(idx, { drawerHeight: '' });
                                              return;
                                            }
                                            const val = parseFloat(raw);
                                            if (!isNaN(val) && facadeH > 0 && val > facadeH) {
                                              // Interdire toute valeur supérieure à la hauteur de la façade
                                              updateFacadeItem(idx, {
                                                drawerHeight: String(facadeH),
                                              });
                                              return;
                                            }
                                            updateFacadeItem(idx, { drawerHeight: raw });
                                          }}
                                          title={
                                            facadeH > 0
                                              ? `Hauteur du tiroir en mm (maximum ${facadeH} mm)`
                                              : 'Hauteur du tiroir en mm'
                                          }
                                          className="w-16 bg-transparent text-[11px] font-mono font-bold text-white focus:outline-none placeholder:text-slate-500"
                                        />
                                        <span className="text-[10px] text-slate-400 font-mono">mm</span>
                                      </div>
                                    </div>

                                    {exceedsFacadeH && (
                                      <p className="text-[10px] text-red-400 font-semibold">
                                        Valeur interdite : la hauteur du tiroir ({drawerHVal} mm) ne peut pas dépasser la hauteur de la façade ({facadeH} mm).
                                      </p>
                                    )}
                                  </div>

                                  {/* 2. Proposition de sélection de l'épaisseur des coulisses */}
                                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span className="text-[11px] font-semibold text-amber-300">
                                        Épaisseur coulisses :
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {allSlideThicknesses.map((th) => {
                                        const isSelected = compositionState.drawerSlideThickness === th;
                                        return (
                                          <button
                                            key={`item-${idx}-th-${th}`}
                                            type="button"
                                            onClick={() => handleSelectSlideThickness(th)}
                                            className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold transition-all ${
                                              isSelected
                                                ? 'bg-amber-500 text-slate-950 shadow-sm'
                                                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
                                            }`}
                                          >
                                            {formatSlideThickness(th)}
                                          </button>
                                        );
                                      })}
                                      {/* Saisie manuelle d'une épaisseur */}
                                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 focus-within:border-amber-500 rounded-md px-1.5 py-0.5">
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="1"
                                          max="50"
                                          placeholder="Autre"
                                          value={
                                            ![12.5, 12.7, 13, 19].includes(
                                              compositionState.drawerSlideThickness
                                            )
                                              ? compositionState.drawerSlideThickness
                                              : ''
                                          }
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value.replace(',', '.'));
                                            if (!isNaN(val) && val > 0) {
                                              handleAddManualSlideThickness(val);
                                            }
                                          }}
                                          className="w-12 bg-transparent text-[11px] font-mono font-bold text-white focus:outline-none placeholder:text-slate-500"
                                        />
                                        <span className="text-[10px] text-slate-400 font-mono">mm</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 3. Pose du fond du tiroir (en applique ou encastré) + profondeur de la rainure (= 1/3 de l'épaisseur de la matière) */}
                                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                        <span className="text-[11px] font-semibold text-amber-300">
                                          Fond du tiroir <span className="text-red-400">*</span> :
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setCompositionState((prev) => ({
                                              ...prev,
                                              drawerBottomType: 'applique',
                                              hasDrawers: true,
                                            }))
                                          }
                                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                                            compositionState.drawerBottomType === 'applique'
                                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
                                          }`}
                                        >
                                          En applique
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setCompositionState((prev) => ({
                                              ...prev,
                                              drawerBottomType: 'groove',
                                              hasDrawers: true,
                                            }))
                                          }
                                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                                            compositionState.drawerBottomType === 'groove'
                                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
                                          }`}
                                        >
                                          Encastré (rainure)
                                        </button>
                                      </div>
                                    </div>

                                    {compositionState.drawerBottomType === 'groove' && (
                                      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2 space-y-1.5 animate-in fade-in duration-150">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="text-[10px] font-semibold text-amber-200">
                                            Profondeur de la rainure (= 1/3 de l’épaisseur de la matière) :
                                          </span>
                                          <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                            Jeu : -1 mm de chaque côté (G/D et Av/Ar)
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {[
                                            { th: 12, groove: 4 },
                                            { th: 15, groove: 5 },
                                            { th: 16, groove: 5.3 },
                                            { th: 18, groove: 6 },
                                            { th: 19, groove: 6.3 },
                                            { th: 22, groove: 7.3 },
                                          ].map(({ th, groove }) => {
                                            const isSelected =
                                              Math.abs(compositionState.drawerGrooveDepth - groove) <
                                              0.05;
                                            return (
                                              <button
                                                key={`item-${idx}-grv-${th}`}
                                                type="button"
                                                onClick={() =>
                                                  setCompositionState((prev) => ({
                                                    ...prev,
                                                    drawerGrooveDepth: groove,
                                                    hasDrawers: true,
                                                  }))
                                                }
                                                title={`Rainure de ${String(groove).replace('.', ',')} mm (= 1/3 d'une paroi de ${th} mm)`}
                                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all ${
                                                  isSelected
                                                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                                                    : 'bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
                                                }`}
                                              >
                                                {String(groove).replace('.', ',')} mm{' '}
                                                <span className="opacity-75 font-normal">
                                                  (1/3 de {th}mm)
                                                </span>
                                              </button>
                                            );
                                          })}
                                          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 focus-within:border-amber-500 rounded-md px-1.5 py-0.5">
                                            <input
                                              type="number"
                                              step="0.1"
                                              min="1"
                                              max="20"
                                              placeholder="1/3 ép."
                                              value={compositionState.drawerGrooveDepth || ''}
                                              onChange={(e) => {
                                                const val = parseFloat(
                                                  e.target.value.replace(',', '.')
                                                );
                                                if (!isNaN(val) && val > 0) {
                                                  setCompositionState((prev) => ({
                                                    ...prev,
                                                    drawerGrooveDepth: Math.round(val * 10) / 10,
                                                    hasDrawers: true,
                                                  }));
                                                }
                                              }}
                                              className="w-12 bg-transparent text-[11px] font-mono font-bold text-white focus:outline-none placeholder:text-slate-500"
                                            />
                                            <span className="text-[10px] text-slate-400 font-mono">
                                              mm
                                            </span>
                                          </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400">
                                          La profondeur de rainure s’ajuste aussi automatiquement à 1/3 de l’épaisseur lorsque vous choisissez la matière des côtés du tiroir.
                                        </p>
                                      </div>
                                    )}

                                    {compositionState.drawerBottomType === 'applique' && (
                                      <p className="text-[10px] font-mono text-emerald-400">
                                        Pose en applique : dimensions extérieures du tiroir diminuées de 1 mm de chaque côté (droit/gauche et avant/arrière).
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[10px] font-mono text-slate-400 leading-relaxed bg-slate-950/50 rounded-lg px-2.5 py-1.5 border border-slate-800">
                        Hauteur dispo : {facadeAvailableHeight} mm (
                        {compositionState.facadePlacement === 'interieur'
                          ? `${compoHeight} - 2×${compoThickness} - 2×2 jeu`
                          : `${compoHeight} - 2×2 jeu`}
                        )
                        {facadeLayout.gapsTotal > 0 &&
                          ` • Espaces : ${compositionState.facadeItems.length - 1} × ${compositionState.facadeGap} = ${facadeLayout.gapsTotal} mm`}
                      </div>

                      {facadeLayout.error && (
                        <div className="flex items-start gap-1.5 text-[11px] text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg px-2.5 py-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{facadeLayout.error}</span>
                        </div>
                      )}
                      {!facadeLayout.error && facadeLayout.warning && (
                        <div className="flex items-start gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-lg px-2.5 py-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{facadeLayout.warning}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION TIROIRS */}
              <div className="p-4 rounded-2xl bg-slate-850 border border-slate-700/80 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={compositionState.hasDrawers}
                      onChange={(e) =>
                        setCompositionState((prev) => ({
                          ...prev,
                          hasDrawers: e.target.checked,
                          drawersCount: prev.drawersCount > 0 ? prev.drawersCount : 1,
                        }))
                      }
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs sm:text-sm font-bold text-amber-300">
                      Ajouter un ou des tiroirs
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400">Bacs et coulisses</span>
                </div>

                {compositionState.hasDrawers && (
                  <div className="space-y-3 pt-2.5 border-t border-slate-800 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Nombre de tiroirs <span className="text-amber-400">*</span> :
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={
                            compositionState.hasFacades && facadeDrawerCount > 0
                              ? facadeDrawerCount
                              : compositionState.drawersCount
                          }
                          disabled={compositionState.hasFacades && facadeDrawerCount > 0}
                          title={
                            compositionState.hasFacades && facadeDrawerCount > 0
                              ? 'Défini par la composition de la façade'
                              : undefined
                          }
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setCompositionState((prev) => ({
                              ...prev,
                              drawersCount: isNaN(val) || val < 1 ? 1 : val,
                            }));
                          }}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold disabled:opacity-60"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Longueur coulisses (mm) <span className="text-amber-400">*</span> :
                        </label>
                        {(() => {
                          const dVal = config.depth || parseInt(guidedFields.depth, 10) || 0;
                          const bType = config.backType || guidedFields.backType || 'groove';
                          const bTh = bType === 'applique' || bType === 'none' ? 0 : config.backThickness || 8;
                          const maxSlide = dVal > 0 ? Math.max(100, dVal - bTh - 10) : 1000;
                          return (
                            <>
                              <input
                                type="number"
                                min="100"
                                max={maxSlide}
                                step="50"
                                value={compositionState.drawerSlideLength}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setCompositionState((prev) => ({
                                    ...prev,
                                    drawerSlideLength:
                                      isNaN(val) || val <= 0
                                        ? Math.min(maxSlide, 400)
                                        : Math.min(maxSlide, val),
                                  }));
                                }}
                                placeholder="Ex: 400"
                                title={`Longueur des coulisses (maximum ${maxSlide} mm pour une profondeur de ${dVal} mm)`}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                Profondeur caisson : {dVal || '—'} mm{dVal > 0 ? ` (max ${maxSlide} mm)` : ''}
                              </span>
                            </>
                          );
                        })()}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                          Épaisseur coulisses de fermeture (mm) <span className="text-amber-400">*</span> :
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {allSlideThicknesses.map((th) => {
                            const isSelected = compositionState.drawerSlideThickness === th;
                            return (
                              <button
                                key={`sec-th-${th}`}
                                type="button"
                                onClick={() => handleSelectSlideThickness(th)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                                  isSelected
                                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700'
                                }`}
                              >
                                {formatSlideThickness(th)}
                              </button>
                            );
                          })}
                          {/* Saisie manuelle d'une épaisseur */}
                          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 focus-within:border-amber-500 rounded-lg px-2 py-1">
                            <input
                              type="number"
                              step="0.1"
                              min="1"
                              max="50"
                              placeholder="Autre"
                              value={
                                ![12.5, 12.7, 13, 19].includes(
                                  compositionState.drawerSlideThickness
                                )
                                  ? compositionState.drawerSlideThickness
                                  : ''
                              }
                              onChange={(e) => {
                                const val = parseFloat(e.target.value.replace(',', '.'));
                                if (!isNaN(val) && val > 0) {
                                  handleAddManualSlideThickness(val);
                                }
                              }}
                              className="w-14 bg-transparent text-xs font-mono font-bold text-white focus:outline-none placeholder:text-slate-500"
                            />
                            <span className="text-[10px] text-slate-400 font-mono">mm</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-1">
                          Par côté (ordre croissant : 12,5 mm, 12,7 mm, 13 mm, 19 mm ou saisie manuelle)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pied de page */}
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleSkipComposition}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Passer sans façade ni tiroir
              </button>
              <button
                type="button"
                onClick={handleValidateComposition}
                disabled={compositionState.hasFacades && !!facadeLayout.error}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                <span>Valider la composition &amp; Voir les pièces</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODALE D'ACCORD UTILISATEUR : Enregistrement définitif d'une matière personnalisée */}
      {materialToConfirmSave && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border-2 border-amber-500/70 p-5 rounded-3xl max-w-md w-full shadow-2xl space-y-4 text-white"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/40">
                <BookmarkPlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-white truncate">
                  Accord d&apos;enregistrement
                </h4>
                <p className="text-xs text-slate-400 truncate">
                  Boîte de sélection des matières
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-amber-300 text-center">
              {materialToConfirmSave}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Donnez-vous votre accord pour enregistrer définitivement la matière{' '}
              <strong className="text-white">« {materialToConfirmSave} »</strong> dans votre boîte de sélection ? Elle sera automatiquement conservée pour tous vos projets futurs.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMaterialToConfirmSave(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Non, refuser
              </button>
              <button
                type="button"
                onClick={() => handleConfirmSaveMaterial(materialToConfirmSave)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Oui, j&apos;accepte et j&apos;enregistre</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modale graphique interactive pour désigner les chants à plaquer sur une partie du caisson */}
      <EdgeBandingModal
        isOpen={Boolean(editingPartEdges)}
        title={editingPartEdges?.role || ''}
        material={editingPartEdges?.material}
        length={editingPartEdges?.length || 0}
        width={editingPartEdges?.width || 0}
        edgeThickness={edgeThickness}
        edges={
          editingPartEdges
            ? config.partEdgeBanding?.[
                editingPartEdges.partId || editingPartEdges.partKey || ''
              ]
            : undefined
        }
        onChange={(nextEdges) => {
          if (!editingPartEdges) return;
          const key = editingPartEdges.partId || editingPartEdges.partKey;
          if (!key) return;
          setConfig((prev) => ({
            ...prev,
            partEdgeBanding: {
              ...(prev.partEdgeBanding || {}),
              [key]: nextEdges,
            },
          }));
        }}
        onClose={() => setEditingPartEdges(null)}
      />
    </div>,
    document.body
  );
};


