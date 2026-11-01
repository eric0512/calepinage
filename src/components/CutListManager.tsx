'use client';

import React, { useState, useRef } from 'react';
import { CutItem, StockPanel, WorkshopItem } from '@/types/cutting';
import {
  ListPlus,
  Plus,
  Trash2,
  Copy,
  RotateCw,
  Upload,
  Download,
  Tag,
  Sparkles,
} from 'lucide-react';
import { CabinetAssistantModal } from '@/components/CabinetAssistantModal';

interface CutListManagerProps {
  items: CutItem[];
  onChange: (items: CutItem[]) => void;
  availableMaterials: string[];
  allAvailableMaterials?: string[];
  stockPanels?: StockPanel[];
  workshopStock?: WorkshopItem[];
  onRequestOptimize?: (newItems?: CutItem[]) => void;
}

const COLOR_OPTIONS = [
  '#3b82f6', // Bleu
  '#10b981', // Vert
  '#f59e0b', // Ambre
  '#8b5cf6', // Violet
  '#ec4899', // Rose
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#14b8a6', // Turquoise
  '#6366f1', // Indigo
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

  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart) return getPieceCategory(lastPart);
  }

  return name.trim();
}

export const CutListManager: React.FC<CutListManagerProps> = ({
  items,
  onChange,
  availableMaterials,
  allAvailableMaterials,
  stockPanels,
  workshopStock,
  onRequestOptimize,
}) => {
  // Matières disponibles en stock triées par ordre alphabétique
  const sortedMaterials = React.useMemo(() => {
    return [...availableMaterials].sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [availableMaterials]);

  // Regroupement articulé des pièces par catégorie (Côtés, Haut et bas, Étagères, Fond, etc.)
  const groupedItems = React.useMemo(() => {
    const map = new Map<string, CutItem[]>();

    items.forEach((item) => {
      const cat = getPieceCategory(item.name);
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    });

    const groups: GroupedCutItems[] = [];
    map.forEach((catItems, category) => {
      const totalQty = catItems.reduce((acc, it) => acc + it.quantity, 0);
      const color =
        CATEGORY_COLORS[category] ||
        catItems[0]?.color ||
        '#64748b';
      const materials = Array.from(
        new Set(
          catItems
            .map((it) => it.material?.trim())
            .filter((m): m is string => Boolean(m))
        )
      );
      groups.push({ category, materials, color, items: catItems, totalQty });
    });

    return groups.sort((a, b) => {
      const idxA = CATEGORY_PRIORITY.indexOf(a.category);
      const idxB = CATEGORY_PRIORITY.indexOf(b.category);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.category.localeCompare(b.category, 'fr');
    });
  }, [items]);

  // État local d'ajout rapide (tous les champs vides par défaut pour un nouveau projet)
  const [name, setName] = useState('');
  const [material, setMaterial] = useState('');
  const [length, setLength] = useState<number | ''>('');
  const [width, setWidth] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [canRotate, setCanRotate] = useState<boolean>(true);
  const [showCabinetModal, setShowCabinetModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Export CSV
  const handleExportCSV = () => {
    if (items.length === 0) return;
    const header = 'Nom,Matiere,Longueur_mm,Largeur_mm,Quantite,RotationAutorisee\n';
    const rows = items
      .map(
        (it) =>
          `"${it.name.replace(/"/g, '""')}","${it.material}",${it.length},${
            it.width
          },${it.quantity},${it.canRotate ? 'OUI' : 'NON'}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'liste_debit_menuiserie.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const imported: CutItem[] = [];

      // Détecter si première ligne est header
      const startIdx = lines[0].toLowerCase().includes('nom') || lines[0].toLowerCase().includes('longueur') ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 4) {
          const itName = cols[0] || `Pièce ${i}`;
          const itMat = cols[1] || availableMaterials[0] || 'MDF 19mm';
          const itLen = parseFloat(cols[2]) || 500;
          const itWid = parseFloat(cols[3]) || 300;
          const itQty = parseInt(cols[4]) || 1;
          const itRot = cols[5] ? cols[5].toLowerCase() === 'oui' || cols[5] === '1' || cols[5].toLowerCase() === 'true' : true;

          imported.push({
            id: `item-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            name: itName,
            material: itMat,
            length: Math.max(itLen, itWid),
            width: Math.min(itLen, itWid),
            quantity: Math.max(1, itQty),
            canRotate: itRot,
            color: COLOR_OPTIONS[imported.length % COLOR_OPTIONS.length],
          });
        }
      }

      if (imported.length > 0) {
        onChange([...items, ...imported]);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-5 shadow-sm">
      {/* En-tête avec compteur et actions CSV */}
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

        {/* Actions : Assistant Caisson IA & Boutons CSV */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Bouton Assistant Caisson IA */}
          <button
            type="button"
            onClick={() => setShowCabinetModal(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded-xl transition-all shadow-sm active:scale-95"
            title="Assistant Caisson IA : calculer automatiquement les cotes selon les dimensions extérieures et l'assemblage"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Assistant Caisson IA</span>
          </button>

          {/* Boutons CSV */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors shadow-sm"
            title="Importer une liste CSV"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Importer CSV</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportCSV}
            accept=".csv"
            className="hidden"
          />

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors shadow-sm"
            title="Exporter la liste en CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Exporter CSV</span>
          </button>
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
        <div className="space-y-4">
          {groupedItems.map((group) => (
            <div key={group.category} className="space-y-1.5">
              {/* Titre de la catégorie avec la matière à droite (ex: Côtés ; Mélaminé Blanc 18mm) */}
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: group.color }}
                  />
                  <h3 className="text-xs font-bold text-slate-100 tracking-wide flex items-center gap-1.5 flex-wrap">
                    <span>{group.category}</span>
                    {group.materials.length > 0 && (
                      <span className="text-slate-300 font-medium">
                        ; <span className="text-emerald-400 font-semibold">{group.materials.join(', ')}</span>
                      </span>
                    )}
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/90 text-slate-400 border border-slate-700/60 font-mono">
                    {group.totalQty} pièce{group.totalQty > 1 ? 's' : ''} ({group.items.length} réf.)
                  </span>
                </div>
              </div>

              {/* Tableau des découpes de cette catégorie */}
              <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700/80">
                    <tr>
                      <th className="py-2.5 px-3">Matière</th>
                      <th className="py-2.5 px-3">Dimensions (L × l mm)</th>
                      <th className="py-2.5 px-3 text-center">Qté</th>
                      <th className="py-2.5 px-3 text-center">Fil du bois</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-slate-200">
                    {group.items.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-750/50 transition-colors group"
                      >
                        <td className="py-2 px-3">
                          <select
                            value={item.material}
                            onChange={(e) =>
                              handleUpdate(item.id, 'material', e.target.value)
                            }
                            className="bg-slate-900 text-slate-200 border border-slate-700/80 focus:border-emerald-500 rounded px-1.5 py-0.5 text-xs w-full max-w-[170px] font-medium"
                          >
                            {item.material &&
                              !sortedMaterials.includes(item.material) && (
                                <option value={item.material}>
                                  {item.material} (hors stock)
                                </option>
                              )}
                            {sortedMaterials.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={item.length}
                              onChange={(e) =>
                                handleUpdate(
                                  item.id,
                                  'length',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-emerald-500 rounded px-1 py-0.5 w-16 text-slate-200 font-semibold"
                            />
                            <span className="text-slate-500">×</span>
                            <input
                              type="number"
                              value={item.width}
                              onChange={(e) =>
                                handleUpdate(
                                  item.id,
                                  'width',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-emerald-500 rounded px-1 py-0.5 w-16 text-slate-200 font-semibold"
                            />
                            <span className="text-[10px] text-slate-500">mm</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
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
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 font-mono text-center font-bold text-emerald-400 w-14"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdate(item.id, 'canRotate', !item.canRotate)
                            }
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
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
                            <RotateCw className="w-3 h-3" />
                            <span>{item.canRotate ? 'Libre' : 'Fil fixe'}</span>
                          </button>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
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
            </div>
          ))}
        </div>
      )}

      {/* Modal Assistant Caisson & Mobilier IA */}
      <CabinetAssistantModal
        isOpen={showCabinetModal}
        onClose={() => setShowCabinetModal(false)}
        onAddPieces={(newPieces) => {
          onChange([...items, ...newPieces]);
        }}
        onAddAndOptimize={(newPieces) => {
          onChange([...items, ...newPieces]);
          if (onRequestOptimize) {
            onRequestOptimize(newPieces);
          }
        }}
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
