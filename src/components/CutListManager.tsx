'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CutItem, StockPanel, WorkshopItem, CabinetConfig } from '@/types/cutting';
import {
  ListPlus,
  Plus,
  Trash2,
  Copy,
  RotateCw,
  Tag,
  Pencil,
  Check,
  X,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { CabinetAssistantModal } from '@/components/CabinetAssistantModal';
import {
  inferCabinetConfigFromItems,
  recalculateCabinetItems,
} from '@/lib/cabinet-calculator';

interface CutListManagerProps {
  items: CutItem[];
  onChange: (items: CutItem[]) => void;
  availableMaterials: string[];
  allAvailableMaterials?: string[];
  stockPanels?: StockPanel[];
  workshopStock?: WorkshopItem[];
  onRequestOptimize?: (newItems?: CutItem[]) => void;
  isCabinetModalOpen?: boolean;
  onCloseCabinetModal?: () => void;
}

const COLOR_OPTIONS = [
  '#dbeafe', // Bleu très clair
  '#dcfce7', // Vert très clair
  '#fef3c7', // Ambre très clair
  '#f3e8ff', // Violet très clair
  '#fce7f3', // Rose très clair
  '#cffafe', // Cyan très clair
  '#ecfccb', // Lime très clair
  '#ffedd5', // Orange très clair
  '#ccfbf1', // Sarcelle très clair
  '#f1f5f9', // Gris ardoise très clair
];

interface GroupedCutItems {
  category: string;
  materials: string[];
  color: string;
  items: CutItem[];
  totalQty: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Côtés': '#3b82f6',
  'Haut et bas': '#10b981',
  'Étagères': '#f59e0b',
  'Fond': '#ec4899',
  'Portes': '#06b6d4',
  'Séparations & Cloisons': '#8b5cf6',
  'Tiroirs': '#f97316',
  'Traverses & Renforts': '#14b8a6',
  'Autres pièces': '#94a3b8',
};

const CATEGORY_PRIORITY = [
  'Côtés',
  'Haut et bas',
  'Étagères',
  'Fond',
  'Portes',
  'Séparations & Cloisons',
  'Tiroirs',
  'Traverses & Renforts',
  'Autres pièces',
];

export function getPieceCategory(name: string): string {
  if (!name || !name.trim()) return 'Autres pièces';

  // Si la pièce est rattachée à un meuble ("Meuble bas 500 - Côtés"),
  // on catégorise uniquement sur la partie après le meuble (évite que "Meuble bas" soit classé en "Haut et bas")
  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart) return getPieceCategory(lastPart);
  }

  const clean = name.toLowerCase().trim();

  if (/^pi[èe]ce(\s*\d+)?$/i.test(clean) || clean === 'sans nom' || clean === 'divers') {
    return 'Autres pièces';
  }

  if (
    clean.includes('côté') ||
    clean.includes('cote') ||
    clean.includes('montant') ||
    clean.includes('flanc')
  ) {
    return 'Côtés';
  }

  if (
    clean.includes('dessus') ||
    clean.includes('dessous') ||
    clean.includes('haut') ||
    clean.includes('bas') ||
    clean.includes('chapeau') ||
    clean.includes('plancher') ||
    clean.includes('plafond')
  ) {
    return 'Haut et bas';
  }

  if (
    clean.includes('étagère') ||
    clean.includes('etagere') ||
    clean.includes('tablette') ||
    clean.includes('rayonnage')
  ) {
    return 'Étagères';
  }

  if (
    clean.includes('fond') ||
    clean.includes('arriere') ||
    clean.includes('arrière') ||
    clean.includes('dos')
  ) {
    return 'Fond';
  }

  if (
    clean.includes('porte') ||
    clean.includes('battant') ||
    clean.includes('facade') ||
    clean.includes('façade') ||
    clean.includes('ouvrant')
  ) {
    return 'Portes';
  }

  if (
    clean.includes('séparation') ||
    clean.includes('separation') ||
    clean.includes('cloison') ||
    clean.includes('diviseur')
  ) {
    return 'Séparations & Cloisons';
  }

  if (clean.includes('tiroir')) {
    return 'Tiroirs';
  }

  if (
    clean.includes('traverse') ||
    clean.includes('renfort') ||
    clean.includes('plinthe') ||
    clean.includes('bandeau')
  ) {
    return 'Traverses & Renforts';
  }

  return name.trim();
}

/** Libellé utilisé pour les pièces non rattachées à un meuble */
export const UNASSIGNED_CABINET_LABEL = 'Pièces diverses';

/**
 * Extrait le nom du meuble de destination d'une pièce.
 * Ex : "Meuble bas de 500 - Côtés" -> "Meuble bas de 500"
 */
export function getCabinetName(name: string): string {
  if (!name || !name.includes(' - ')) return UNASSIGNED_CABINET_LABEL;
  const parts = name.split(' - ');
  parts.pop();
  const cabinet = parts.join(' - ').trim();
  return cabinet || UNASSIGNED_CABINET_LABEL;
}

interface CabinetGroup {
  cabinet: string;
  totalQty: number;
  config: CabinetConfig;
  cabItems: CutItem[];
  groups: GroupedCutItems[];
}

export const CutListManager: React.FC<CutListManagerProps> = ({
  items,
  onChange,
  availableMaterials,
  allAvailableMaterials,
  stockPanels,
  workshopStock,
  onRequestOptimize,
  isCabinetModalOpen = false,
  onCloseCabinetModal,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // État d'édition des dimensions d'un caisson (verrouillé par défaut tant qu'on n'appuie pas sur le logo)
  const [editingCabinet, setEditingCabinet] = useState<string | null>(null);
  const [draftCabDims, setDraftCabDims] = useState<{
    height: string;
    width: string;
    depth: string;
  }>({ height: '', width: '', depth: '' });
  const [initialEditState, setInitialEditState] = useState<{
    cabinet: string;
    height: number;
    width: number;
    depth: number;
    itemsSnapshot: CutItem[];
  } | null>(null);

  // Modale proposant de mettre à jour le calcul de l'optimisation après modification des dimensions
  const [pendingOptimizePrompt, setPendingOptimizePrompt] = useState<{
    cabinetName: string;
    dimensionsLabel: string;
    updatedItems: CutItem[];
  } | null>(null);

  // Matières disponibles en stock triées par ordre alphabétique
  const sortedMaterials = React.useMemo(() => {
    return [...availableMaterials].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [availableMaterials]);

  // Regroupement : 1) par meuble (ordre de saisie), 2) par catégorie (Côtés, Haut et bas, Étagères, Fond...) et matière
  const cabinetGroups = React.useMemo(() => {
    const cabinetMap = new Map<string, CutItem[]>();
    items.forEach((item) => {
      const cab = getCabinetName(item.name);
      if (!cabinetMap.has(cab)) cabinetMap.set(cab, []);
      cabinetMap.get(cab)!.push(item);
    });

    const result: CabinetGroup[] = [];
    cabinetMap.forEach((cabItems, cabinet) => {
      // Clé = catégorie + matière, pour afficher "Côtés ; MDF 19mm" et "Fond ; MDF 8mm" séparément
      const map = new Map<string, { category: string; material: string; items: CutItem[] }>();
      cabItems.forEach((item) => {
        const cat = getPieceCategory(item.name);
        const mat = item.material?.trim() || '';
        const key = `${cat}__${mat}`;
        if (!map.has(key)) map.set(key, { category: cat, material: mat, items: [] });
        map.get(key)!.items.push(item);
      });

      const groups: GroupedCutItems[] = [];
      map.forEach(({ category, material: mat, items: catItems }) => {
        const totalQty = catItems.reduce((acc, it) => acc + it.quantity, 0);
        const color = CATEGORY_COLORS[category] || catItems[0]?.color || '#64748b';
        groups.push({
          category,
          materials: mat ? [mat] : [],
          color,
          items: catItems,
          totalQty,
        });
      });

      groups.sort((a, b) => {
        const idxA = CATEGORY_PRIORITY.indexOf(a.category);
        const idxB = CATEGORY_PRIORITY.indexOf(b.category);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.category.localeCompare(b.category, 'fr');
      });

      const config = inferCabinetConfigFromItems(cabinet, cabItems);

      result.push({
        cabinet,
        totalQty: cabItems.reduce((acc, it) => acc + it.quantity, 0),
        config,
        cabItems,
        groups,
      });
    });

    // Les pièces diverses (non rattachées à un meuble) en dernier
    return result.sort((a, b) => {
      if (a.cabinet === UNASSIGNED_CABINET_LABEL) return 1;
      if (b.cabinet === UNASSIGNED_CABINET_LABEL) return -1;
      return 0;
    });
  }, [items]);

  // Activer l'édition des dimensions d'un caisson via le logo dédié
  const handleStartCabinetEdit = (cab: CabinetGroup) => {
    setEditingCabinet(cab.cabinet);
    setDraftCabDims({
      height: String(cab.config.height),
      width: String(cab.config.width),
      depth: String(cab.config.depth),
    });
    setInitialEditState({
      cabinet: cab.cabinet,
      height: cab.config.height,
      width: cab.config.width,
      depth: cab.config.depth,
      itemsSnapshot: items.map((it) => ({ ...it })),
    });
  };

  // Annuler l'édition en cours et restaurer les dimensions initiales
  const handleCancelCabinetEdit = () => {
    if (initialEditState) {
      onChange(initialEditState.itemsSnapshot);
    }
    setEditingCabinet(null);
    setInitialEditState(null);
  };

  // Valider les dimensions du caisson et demander la mise à jour de l'optimisation si modifiées
  const handleCommitCabinetEdit = (cab: CabinetGroup) => {
    if (editingCabinet !== cab.cabinet) return;

    const rawH = parseInt(draftCabDims.height, 10);
    const rawW = parseInt(draftCabDims.width, 10);
    const rawD = parseInt(draftCabDims.depth, 10);

    const newH = !isNaN(rawH) && rawH >= 50 ? rawH : cab.config.height;
    const newW = !isNaN(rawW) && rawW >= 50 ? rawW : cab.config.width;
    const newD = !isNaN(rawD) && rawD >= 50 ? rawD : cab.config.depth;

    const cabDimsChanged = Boolean(
      initialEditState &&
        (newH !== initialEditState.height ||
          newW !== initialEditState.width ||
          newD !== initialEditState.depth)
    );

    const pieceDimsChanged = Boolean(
      initialEditState &&
        initialEditState.itemsSnapshot.some((orig) => {
          const curr = items.find((i) => i.id === orig.id);
          return curr && (curr.length !== orig.length || curr.width !== orig.width);
        })
    );

    let updatedAllItems = items;

    if (cabDimsChanged) {
      const updatedConfig: CabinetConfig = {
        ...cab.config,
        name: cab.cabinet,
        height: newH,
        width: newW,
        depth: newD,
      };
      const recalculatedCabItems = recalculateCabinetItems(cab.cabItems, updatedConfig);

      // Remplacer les pièces de ce caisson à leur emplacement exact dans la liste
      const resultItems: CutItem[] = [];
      let inserted = false;
      for (const it of items) {
        if (getCabinetName(it.name) === cab.cabinet) {
          if (!inserted) {
            resultItems.push(...recalculatedCabItems);
            inserted = true;
          }
        } else {
          resultItems.push(it);
        }
      }
      if (!inserted) {
        resultItems.push(...recalculatedCabItems);
      }

      updatedAllItems = resultItems;
      onChange(updatedAllItems);
    }

    setEditingCabinet(null);
    setInitialEditState(null);

    if (cabDimsChanged || pieceDimsChanged) {
      setPendingOptimizePrompt({
        cabinetName: cab.cabinet,
        dimensionsLabel: `H ${newH} × L ${newW} × P ${newD} mm`,
        updatedItems: updatedAllItems,
      });
    }
  };

  // Ajout des coupes d'un caisson : garantit un nom de meuble unique dans le projet
  const handleAddCabinetPieces = (newPieces: CutItem[]) => {
    if (newPieces.length === 0) return;
    const existing = new Set(items.map((it) => getCabinetName(it.name)));
    const baseName = getCabinetName(newPieces[0].name);
    let finalName = baseName;
    if (baseName !== UNASSIGNED_CABINET_LABEL && existing.has(baseName)) {
      let n = 2;
      while (existing.has(`${baseName} (${n})`)) n++;
      finalName = `${baseName} (${n})`;
    }
    const renamed =
      finalName === baseName
        ? newPieces
        : newPieces.map((p) => ({
            ...p,
            name: p.name.startsWith(`${baseName} - `)
              ? `${finalName} - ${p.name.slice(baseName.length + 3)}`
              : p.name,
            cabinetConfig: p.cabinetConfig
              ? { ...p.cabinetConfig, name: finalName }
              : undefined,
          }));
    onChange([...items, ...renamed]);
  };

  // État local d'ajout rapide (tous les champs vides par défaut pour un nouveau projet)
  const [name, setName] = useState('');
  const [material, setMaterial] = useState('');
  const [length, setLength] = useState<number | ''>('');
  const [width, setWidth] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [canRotate, setCanRotate] = useState<boolean>(true);

  // Synchroniser la matière sélectionnée avec les matières disponibles dans le stock
  React.useEffect(() => {
    if (sortedMaterials.length > 0) {
      if (!material || !sortedMaterials.includes(material)) {
        setMaterial(sortedMaterials[0]);
      }
    } else {
      setMaterial('');
    }
  }, [sortedMaterials, material]);

  // Réinitialiser les champs de saisie si la liste de débit devient vide (ex: nouveau projet / reset)
  React.useEffect(() => {
    if (items.length === 0) {
      setName('');
      setLength('');
      setWidth('');
      setQuantity('');
    }
  }, [items.length]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const l = typeof length === 'number' ? length : parseFloat(length);
    const w = typeof width === 'number' ? width : parseFloat(width);
    const q = typeof quantity === 'number' ? quantity : parseInt(quantity);

    if (!l || !w || !q || l <= 0 || w <= 0 || q <= 0) return;
    if (!material.trim()) {
      alert(
        'Veuillez ajouter au moins un panneau en stock puis sélectionner sa matière.'
      );
      return;
    }

    const nextColor =
      COLOR_OPTIONS[items.length % COLOR_OPTIONS.length] || COLOR_OPTIONS[0];

    const newItem: CutItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim() || `Pièce ${items.length + 1}`,
      material: material.trim(),
      length: Math.max(l, w),
      width: Math.min(l, w),
      quantity: q,
      canRotate,
      color: nextColor,
    };

    onChange([...items, newItem]);
    setName('');
    setLength('');
    setWidth('');
    setQuantity('');
  };

  const handleUpdate = (
    id: string,
    field: keyof CutItem,
    val: string | number | boolean
  ) => {
    onChange(
      items.map((it) => {
        if (it.id === id) {
          return { ...it, [field]: val };
        }
        return it;
      })
    );
  };

  const handleDelete = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
  };

  const handleDuplicate = (item: CutItem) => {
    const copy: CutItem = {
      ...item,
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${item.name} (copie)`,
    };
    onChange([...items, copy]);
  };

  const totalPiecesCount = items.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-3 sm:p-5 shadow-sm">
      {/* En-tête avec compteur et action Assistant Caisson */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ListPlus className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Liste de Débit (Pièces à découper)
            </h2>
            <p className="text-xs text-slate-400">
              {totalPiecesCount} pièce(s) demandée(s) ({items.length} référence(s))
            </p>
          </div>
        </div>


      </div>

      {/* Formulaire d'ajout rapide de pièce */}
      <form
        onSubmit={handleAdd}
        className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 mb-4 text-xs"
      >
        <div className="text-[11px] font-semibold text-slate-400 mb-2.5">
          Ajouter une nouvelle pièce à couper
        </div>

        {/* LIGNE 1 : Catégorie / Titre et Matière sur la même ligne */}
        <div className="flex gap-2 mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-300 truncate">
                Catégorie / Titre
              </label>
              <div className="hidden sm:flex items-center gap-1">
                {['Côtés', 'Haut et bas', 'Étagères', 'Fond', 'Portes'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setName(cat)}
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                      name === cat
                        ? 'bg-emerald-600 text-white font-medium'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              placeholder="Ex: Côtés, Haut et bas, Étagère, Fond..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
            />
          </div>

          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
              Matière
            </label>
            <select
              required
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-medium"
            >
              {sortedMaterials.length === 0 ? (
                <option value="">-- Aucun panneau en stock --</option>
              ) : (
                <>
                  {!material && <option value="">Choisir une matière...</option>}
                  {sortedMaterials.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* LIGNE 2 : Longueur, Largeur, Quantité, Fil et Bouton Ajout TOUS sur la même ligne */}
        <div className="flex gap-1.5 sm:gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
              Longueur (mm)
            </label>
            <input
              type="number"
              required
              min="1"
              max="6000"
              placeholder=""
              value={length}
              onChange={(e) =>
                setLength(e.target.value === '' ? '' : parseInt(e.target.value) || '')
              }
              className="w-full bg-slate-950 text-slate-100 font-mono px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-center"
            />
          </div>

          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
              Largeur (mm)
            </label>
            <input
              type="number"
              required
              min="1"
              max="4000"
              placeholder=""
              value={width}
              onChange={(e) =>
                setWidth(e.target.value === '' ? '' : parseInt(e.target.value) || '')
              }
              className="w-full bg-slate-950 text-slate-100 font-mono px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-center"
            />
          </div>

          <div className="w-14 sm:w-16 shrink-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 text-center">
              Qté
            </label>
            <input
              type="number"
              required
              min="1"
              max="500"
              placeholder=""
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  e.target.value === '' ? '' : parseInt(e.target.value) || ''
                )
              }
              className="w-full bg-slate-950 text-emerald-400 font-mono font-bold px-1 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-center"
            />
          </div>

          <button
            type="button"
            onClick={() => setCanRotate(!canRotate)}
            className={`h-[31px] w-[31px] sm:w-9 rounded-lg border transition-colors shrink-0 flex items-center justify-center mb-px ${
              canRotate
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
            title={
              canRotate
                ? 'Rotation autorisée (Pas de contrainte de fil)'
                : 'Rotation interdite (Sens du fil du bois obligatoire)'
            }
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="submit"
            className="h-[31px] w-[34px] sm:w-10 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center shrink-0 shadow-sm mb-px"
            title="Ajouter la pièce"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Table des pièces à découper articulée par catégorie (Côtés, Haut et bas, etc.) */}
      {items.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-700 rounded-xl text-slate-400 text-xs">
          <Tag className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          Aucune pièce à découper. Ajoutez vos pièces requises ci-dessus.
        </div>
      ) : (
        <div className="space-y-5">
          {cabinetGroups.map((cab) => {
            const isEditingCab = editingCabinet === cab.cabinet;
            const displayH = isEditingCab ? draftCabDims.height : String(cab.config.height);
            const displayW = isEditingCab ? draftCabDims.width : String(cab.config.width);
            const displayD = isEditingCab ? draftCabDims.depth : String(cab.config.depth);

            return (
              <div
                key={cab.cabinet}
                onBlur={(e) => {
                  if (
                    isEditingCab &&
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    handleCommitCabinetEdit(cab);
                  }
                }}
                className={`rounded-2xl border p-2 sm:p-3 space-y-3 transition-colors ${
                  isEditingCab
                    ? 'border-amber-500/70 bg-slate-900/50 shadow-sm'
                    : 'border-slate-700/70 bg-slate-900/30'
                }`}
              >
                {/* En-tête du meuble : Nom du caisson + Dimensions en dessous avec logo de modification à droite */}
                <div className="px-1 pb-2 border-b border-slate-700/60 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-amber-400 tracking-wide flex items-center gap-1.5 min-w-0">
                      <Tag className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{cab.cabinet}</span>
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                      {cab.totalQty} pce{cab.totalQty > 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Dimensions du caisson sous le nom + logo à droite permettant de les modifier */}
                  <div className="flex items-center justify-between gap-2 pl-5">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 text-xs font-mono">
                      <span className="text-[11px] font-sans font-medium text-slate-400 mr-0.5">
                        Dimensions :
                      </span>

                      <span className="text-[10px] text-slate-400 font-sans font-semibold">H</span>
                      <input
                        type="number"
                        min="50"
                        max="6000"
                        disabled={!isEditingCab}
                        readOnly={!isEditingCab}
                        value={displayH}
                        onChange={(e) =>
                          setDraftCabDims((prev) => ({ ...prev, height: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCommitCabinetEdit(cab);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelCabinetEdit();
                          }
                        }}
                        title={
                          isEditingCab
                            ? 'Hauteur extérieure du caisson (mm)'
                            : 'Appuyez sur le logo à droite pour modifier les dimensions'
                        }
                        className={`w-12 sm:w-14 px-1 py-0.5 rounded text-center text-xs font-bold transition-colors ${
                          isEditingCab
                            ? 'bg-slate-950 text-amber-300 border border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400'
                            : 'bg-slate-800/60 text-slate-300 border border-slate-700/60 cursor-not-allowed select-none'
                        }`}
                      />

                      <span className="text-slate-500 text-[11px]">×</span>

                      <span className="text-[10px] text-slate-400 font-sans font-semibold">L</span>
                      <input
                        type="number"
                        min="50"
                        max="6000"
                        disabled={!isEditingCab}
                        readOnly={!isEditingCab}
                        value={displayW}
                        onChange={(e) =>
                          setDraftCabDims((prev) => ({ ...prev, width: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCommitCabinetEdit(cab);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelCabinetEdit();
                          }
                        }}
                        title={
                          isEditingCab
                            ? 'Largeur extérieure du caisson (mm)'
                            : 'Appuyez sur le logo à droite pour modifier les dimensions'
                        }
                        className={`w-12 sm:w-14 px-1 py-0.5 rounded text-center text-xs font-bold transition-colors ${
                          isEditingCab
                            ? 'bg-slate-950 text-amber-300 border border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400'
                            : 'bg-slate-800/60 text-slate-300 border border-slate-700/60 cursor-not-allowed select-none'
                        }`}
                      />

                      <span className="text-slate-500 text-[11px]">×</span>

                      <span className="text-[10px] text-slate-400 font-sans font-semibold">P</span>
                      <input
                        type="number"
                        min="50"
                        max="4000"
                        disabled={!isEditingCab}
                        readOnly={!isEditingCab}
                        value={displayD}
                        onChange={(e) =>
                          setDraftCabDims((prev) => ({ ...prev, depth: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCommitCabinetEdit(cab);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelCabinetEdit();
                          }
                        }}
                        title={
                          isEditingCab
                            ? 'Profondeur extérieure du caisson (mm)'
                            : 'Appuyez sur le logo à droite pour modifier les dimensions'
                        }
                        className={`w-12 sm:w-14 px-1 py-0.5 rounded text-center text-xs font-bold transition-colors ${
                          isEditingCab
                            ? 'bg-slate-950 text-amber-300 border border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-400'
                            : 'bg-slate-800/60 text-slate-300 border border-slate-700/60 cursor-not-allowed select-none'
                        }`}
                      />

                      <span className="text-[10px] text-slate-400 font-sans">mm</span>

                      {/* Logo placé directement à droite des dimensions pour déverrouiller / valider leur modification */}
                      {!isEditingCab ? (
                        <button
                          type="button"
                          onClick={() => handleStartCabinetEdit(cab)}
                          className="ml-1 inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-slate-700 hover:border-amber-500/50 transition-all shadow-sm active:scale-95"
                          title="Modifier les dimensions de ce caisson"
                          aria-label="Modifier les dimensions de ce caisson"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="ml-1 inline-flex items-center gap-1">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleCommitCabinetEdit(cab)}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 transition-all shadow-sm active:scale-95"
                            title="Valider les nouvelles dimensions"
                            aria-label="Valider les nouvelles dimensions"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleCancelCabinetEdit}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-700 transition-all active:scale-95"
                            title="Annuler la modification"
                            aria-label="Annuler la modification"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {!isEditingCab && (
                      <span
                        className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-500 shrink-0"
                        title="Dimensions verrouillées : cliquez sur le crayon pour modifier"
                      >
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>

                {cab.groups.map((group) => (
                  <div
                    key={`${cab.cabinet}-${group.category}-${group.materials.join(',')}`}
                    className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/40"
                  >
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700/80">
                        <tr>
                          {/* Titre de la catégorie + matière à la place de "Dimensions" (ex : Côtés ; MDF 19mm) */}
                          <th className="py-2 px-1.5 sm:px-3 text-left">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                style={{ backgroundColor: group.color }}
                              />
                              <span className="font-bold text-slate-100 truncate">
                                {group.category}
                                {group.materials.length > 0 && (
                                  <span className="text-slate-300 font-medium">
                                    {' '}; <span className="text-emerald-400 font-semibold">{group.materials.join(', ')}</span>
                                  </span>
                                )}
                              </span>
                            </span>
                          </th>
                          <th className="py-2 px-1 text-center w-12 sm:w-16">Qté</th>
                          <th className="py-2 px-1 text-center w-10 sm:w-20" title="Sens du fil du bois">
                            Fil<span className="hidden sm:inline"> du bois</span>
                          </th>
                          <th className="py-2 px-1.5 sm:px-3 text-right w-16 sm:w-20">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/60 text-slate-200">
                        {group.items.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-750/50 transition-colors group"
                        >
                          <td className="py-1.5 sm:py-2 px-1.5 sm:px-3 font-mono">
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <input
                                type="number"
                                disabled={!isEditingCab}
                                readOnly={!isEditingCab}
                                value={item.length}
                                onChange={(e) =>
                                  handleUpdate(
                                    item.id,
                                    'length',
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleCommitCabinetEdit(cab);
                                  }
                                }}
                                title={
                                  isEditingCab
                                    ? 'Longueur de la pièce (mm)'
                                    : 'Appuyez sur le logo de modification du caisson pour modifier les dimensions'
                                }
                                className={`rounded px-1 py-0.5 w-12 sm:w-16 font-semibold text-center sm:text-left text-xs ${
                                  isEditingCab
                                    ? 'bg-slate-950 border border-amber-500/60 focus:border-emerald-500 text-slate-100'
                                    : 'bg-transparent border border-transparent text-slate-200 cursor-not-allowed select-none'
                                }`}
                              />
                              <span className="text-slate-500 text-[11px]">×</span>
                              <input
                                type="number"
                                disabled={!isEditingCab}
                                readOnly={!isEditingCab}
                                value={item.width}
                                onChange={(e) =>
                                  handleUpdate(
                                    item.id,
                                    'width',
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleCommitCabinetEdit(cab);
                                  }
                                }}
                                title={
                                  isEditingCab
                                    ? 'Largeur de la pièce (mm)'
                                    : 'Appuyez sur le logo de modification du caisson pour modifier les dimensions'
                                }
                                className={`rounded px-1 py-0.5 w-12 sm:w-16 font-semibold text-center sm:text-left text-xs ${
                                  isEditingCab
                                    ? 'bg-slate-950 border border-amber-500/60 focus:border-emerald-500 text-slate-100'
                                    : 'bg-transparent border border-transparent text-slate-200 cursor-not-allowed select-none'
                                }`}
                              />
                              <span className="text-[10px] text-slate-500 hidden sm:inline">mm</span>
                            </div>
                          </td>
                          <td className="py-1.5 sm:py-2 px-1 text-center">
                            <input
                              type="number"
                              min="1"
                              max="999"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdate(
                                  item.id,
                                  'quantity',
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-center font-bold text-emerald-400 w-10 sm:w-12 text-xs"
                            />
                          </td>
                          <td className="py-1.5 sm:py-2 px-1 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdate(item.id, 'canRotate', !item.canRotate)
                              }
                              className={`inline-flex items-center justify-center gap-1 h-7 w-7 sm:h-auto sm:w-auto p-1 sm:px-2 sm:py-0.5 rounded text-[11px] font-medium transition-colors ${
                                item.canRotate
                                  ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-950/70 text-amber-400 border border-amber-500/30'
                              }`}
                              title={
                                item.canRotate
                                  ? 'Rotation 90° autorisée (Pas de contrainte de fil)'
                                  : 'Sens strict (Respect du fil du bois obligatoire)'
                              }
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{item.canRotate ? 'Libre' : 'Fil fixe'}</span>
                            </button>
                          </td>
                          <td className="py-1.5 sm:py-2 px-1.5 sm:px-3 text-right">
                            <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicate(item)}
                                className="p-1 rounded hover:bg-slate-750 text-slate-400 hover:text-slate-200 transition-colors"
                                title="Dupliquer la pièce"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="p-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition-colors"
                                title="Supprimer la découpe"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Modale demandant de mettre à jour le calcul de l'optimisation suite à la modification d'une ou plusieurs dimensions */}
      {mounted &&
        pendingOptimizePrompt &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div
              role="dialog"
              aria-modal="true"
              className="modal-box bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <h3 className="text-base font-bold text-white">
                    Mettre à jour le calcul de l&apos;optimisation ?
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Les dimensions de{' '}
                    <strong className="text-amber-400 font-semibold">
                      {pendingOptimizePrompt.cabinetName}
                    </strong>{' '}
                    ont été modifiées (
                    <span className="font-mono font-bold text-white">
                      {pendingOptimizePrompt.dimensionsLabel}
                    </span>
                    ). Voulez-vous mettre à jour le calcul de l&apos;optimisation des coupes maintenant ?
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPendingOptimizePrompt(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                >
                  Plus tard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = pendingOptimizePrompt.updatedItems;
                    setPendingOptimizePrompt(null);
                    onRequestOptimize?.(updated);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Mettre à jour l&apos;optimisation</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal Assistant Caisson & Mobilier IA : ajoute uniquement les coupes (pas d'optimisation automatique) */}
      <CabinetAssistantModal
        isOpen={isCabinetModalOpen}
        onClose={() => onCloseCabinetModal?.()}
        onAddPieces={handleAddCabinetPieces}
        availableMaterials={
          allAvailableMaterials && allAvailableMaterials.length > 0
            ? allAvailableMaterials
            : sortedMaterials
        }
        stockPanels={stockPanels}
        workshopStock={workshopStock}
      />
    </div>
  );
};
