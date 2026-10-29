'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { StockPanel, OffcutArea } from '@/types/cutting';
import {
  Layers,
  Plus,
  Trash2,
  Copy,
  Box,
  X,
  Warehouse,
  Check,
} from 'lucide-react';

interface ManualWorkshopStockItem {
  id: string;
  material: string;
  length: number;
  width: number;
  quantity: number;
}

interface StockManagerProps {
  panels: StockPanel[];
  onChange: (panels: StockPanel[]) => void;
  availableMaterials: string[];
  workshopOffcuts?: (OffcutArea & { material: string; panelIndex: number })[];
}

const COMMON_PANEL_SIZES = [
  { label: '2800 x 2070', l: 2800, w: 2070 },
  { label: '2500 x 1220', l: 2500, w: 1220 },
  { label: '2440 x 1220', l: 2440, w: 1220 },
  { label: '3050 x 1300', l: 3050, w: 1300 },
];

export const StockManager: React.FC<StockManagerProps> = ({
  panels,
  onChange,
  availableMaterials,
  workshopOffcuts = [],
}) => {
  // État de montage pour createPortal
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // État des fenêtres modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWorkshopModal, setShowWorkshopModal] = useState(false);

  // Notification toast après ajout au projet
  const [workshopToast, setWorkshopToast] = useState<string | null>(null);

  // Champs du formulaire modal : Matière, Longueur, Largeur, Qté
  const [material, setMaterial] = useState('MDF 19mm');
  const [length, setLength] = useState<number>(2800);
  const [width, setWidth] = useState<number>(2070);
  const [quantity, setQuantity] = useState<number>(2);

  // Formulaire d'ajout manuel au Stock Atelier
  const [showManualWorkshopForm, setShowManualWorkshopForm] = useState(false);
  const [manualMat, setManualMat] = useState('MDF 19mm');
  const [manualLen, setManualLen] = useState<number>(800);
  const [manualWid, setManualWid] = useState<number>(600);
  const [manualQty, setManualQty] = useState<number>(1);

  // Stock atelier manuel stocké en localStorage
  const [manualWorkshopStock, setManualWorkshopStock] = useState<
    ManualWorkshopStockItem[]
  >(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('calepinage_workshop_stock');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Sauvegarder le stock atelier manuel
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(
          'calepinage_workshop_stock',
          JSON.stringify(manualWorkshopStock)
        );
      } catch (e) {
        console.error(e);
      }
    }
  }, [manualWorkshopStock, mounted]);

  // Filtrer les chutes de la découpe >= 500x500 mm
  const qualifyingOffcuts = useMemo(() => {
    return workshopOffcuts.filter((o) => {
      const dim1 = Math.max(o.length, o.width);
      const dim2 = Math.min(o.length, o.width);
      return dim1 >= 500 && dim2 >= 500;
    });
  }, [workshopOffcuts]);

  // Regrouper les chutes par matière et dimensions
  const groupedOffcuts = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        material: string;
        length: number;
        width: number;
        quantity: number;
        areaM2: number;
        sampleOffcut: OffcutArea & { material: string; panelIndex: number };
      }
    >();

    qualifyingOffcuts.forEach((o) => {
      const len = Math.round(Math.max(o.length, o.width));
      const wid = Math.round(Math.min(o.length, o.width));
      const key = `${o.material.toLowerCase().trim()}_${len}x${wid}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.areaM2 += o.areaM2;
      } else {
        map.set(key, {
          key,
          material: o.material,
          length: len,
          width: wid,
          quantity: 1,
          areaM2: o.areaM2,
          sampleOffcut: o,
        });
      }
    });

    return Array.from(map.values());
  }, [qualifyingOffcuts]);

  // Ajouter un panneau du stock atelier au projet
  const handleAddWorkshopItemToProject = (
    mat: string,
    len: number,
    wid: number,
    manualId?: string
  ) => {
    const newPanel: StockPanel = {
      id: `stock-workshop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      material: mat.trim(),
      length: Math.max(len, wid),
      width: Math.min(len, wid),
      quantity: 1,
    };
    onChange([...panels, newPanel]);

    // Si c'est un item manuel, décrémenter sa quantité ou le supprimer
    if (manualId) {
      setManualWorkshopStock((prev) =>
        prev
          .map((item) =>
            item.id === manualId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          )
          .filter((item) => item.quantity > 0)
      );
    }

    // Afficher confirmation
    setWorkshopToast(
      `Panneau ${len} × ${wid} mm (${mat}) ajouté au stock du projet !`
    );
    setTimeout(() => {
      setWorkshopToast(null);
    }, 3000);
  };

  // Ajouter manuellement une chute au stock atelier
  const handleAddManualWorkshopItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !manualMat.trim() ||
      manualLen < 500 ||
      manualWid < 500 ||
      manualQty <= 0
    ) {
      alert(
        'La chute doit avoir des dimensions supérieures ou égales à 500 × 500 mm.'
      );
      return;
    }

    const newItem: ManualWorkshopStockItem = {
      id: `manual-workshop-${Date.now()}`,
      material: manualMat.trim(),
      length: Math.max(manualLen, manualWid),
      width: Math.min(manualLen, manualWid),
      quantity: manualQty,
    };

    setManualWorkshopStock((prev) => [...prev, newItem]);
    setShowManualWorkshopForm(false);
    setWorkshopToast(`Chute ajoutée au stock atelier !`);
    setTimeout(() => {
      setWorkshopToast(null);
    }, 2500);
  };

  // Supprimer un élément du stock atelier manuel
  const handleDeleteManualWorkshopItem = (id: string) => {
    setManualWorkshopStock((prev) => prev.filter((it) => it.id !== id));
  };

  const totalWorkshopPanels =
    groupedOffcuts.reduce((acc, it) => acc + it.quantity, 0) +
    manualWorkshopStock.reduce((acc, it) => acc + it.quantity, 0);

  const totalWorkshopArea = (
    groupedOffcuts.reduce((acc, it) => acc + it.areaM2, 0) +
    manualWorkshopStock.reduce(
      (acc, it) => acc + (it.length * it.width * it.quantity) / 1_000_000,
      0
    )
  ).toFixed(2);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material.trim() || length <= 0 || width <= 0 || quantity <= 0) return;

    const newPanel: StockPanel = {
      id: `stock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      material: material.trim(),
      length: Math.max(length, width),
      width: Math.min(length, width),
      quantity,
    };

    onChange([...panels, newPanel]);
    setShowAddModal(false);
  };

  const handleUpdate = (
    id: string,
    field: keyof StockPanel,
    val: string | number
  ) => {
    onChange(
      panels.map((p) => {
        if (p.id === id) {
          return { ...p, [field]: val };
        }
        return p;
      })
    );
  };

  const handleDelete = (id: string) => {
    onChange(panels.filter((p) => p.id !== id));
  };

  const handleDuplicate = (panel: StockPanel) => {
    const copy: StockPanel = {
      ...panel,
      id: `stock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    };
    onChange([...panels, copy]);
  };

  const applyPresetSize = (l: number, w: number) => {
    setLength(l);
    setWidth(w);
  };

  const totalPanelsCount = panels.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-sm">
      {/* En-tête avec Titre et Boutons à droite */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5 pt-0.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Stock de Panneaux Bruts
            </h2>
            <p className="text-xs text-slate-400">
              {totalPanelsCount} panneau(x) en stock ({panels.length} référence(s))
            </p>
          </div>
        </div>

        {/* Boutons à droite : Ajout panneau et sous celui-ci Stock atelier */}
        <div className="flex flex-col gap-1.5 items-stretch shrink-0">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Ajout panneau</span>
          </button>
          <button
            type="button"
            onClick={() => setShowWorkshopModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600/90 hover:bg-teal-500 text-white font-semibold text-xs transition-colors shadow-sm border border-teal-500/30"
          >
            <Warehouse className="w-3.5 h-3.5 text-teal-200" />
            <span>Stock atelier</span>
            {totalWorkshopPanels > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-teal-950/80 text-teal-300 border border-teal-400/40 rounded-full text-[10px] font-mono font-bold">
                {totalWorkshopPanels}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tableau Récapitulatif du Stock (sans la colonne Épaisseur, champs dimensions réduits) */}
      {panels.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl text-slate-400 text-xs">
          <Box className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          <p>Aucun panneau en stock.</p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-2 text-blue-400 hover:underline font-semibold"
          >
            + Cliquer sur « Ajout panneau » pour commencer
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700/80">
              <tr>
                <th className="py-2.5 px-3">Matière</th>
                <th className="py-2.5 px-2 text-center">Dimensions (L × l)</th>
                <th className="py-2.5 px-2 text-center">Surface</th>
                <th className="py-2.5 px-2 text-center w-20">Qté</th>
                <th className="py-2.5 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {panels.map((p) => {
                const area = ((p.length * p.width) / 1_000_000).toFixed(2);

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-750/50 transition-colors group"
                  >
                    {/* Matière */}
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={p.material}
                        onChange={(e) =>
                          handleUpdate(p.id, 'material', e.target.value)
                        }
                        className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1.5 py-0.5 text-xs font-semibold text-white w-full max-w-[170px]"
                      />
                    </td>

                    {/* Dimensions (champs réduits) */}
                    <td className="py-2 px-2 text-center font-mono">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          value={p.length}
                          onChange={(e) =>
                            handleUpdate(
                              p.id,
                              'length',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="bg-slate-900/90 border border-slate-700/80 focus:border-blue-500 rounded px-1 py-0.5 w-12 sm:w-14 text-center text-xs text-slate-100"
                        />
                        <span className="text-slate-500 text-[11px]">×</span>
                        <input
                          type="number"
                          value={p.width}
                          onChange={(e) =>
                            handleUpdate(
                              p.id,
                              'width',
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="bg-slate-900/90 border border-slate-700/80 focus:border-blue-500 rounded px-1 py-0.5 w-12 sm:w-14 text-center text-xs text-slate-100"
                        />
                      </div>
                    </td>

                    {/* Surface */}
                    <td className="py-2 px-2 text-center font-mono text-slate-400 text-[11px]">
                      {area} m²
                    </td>

                    {/* Quantité */}
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={p.quantity}
                        onChange={(e) =>
                          handleUpdate(
                            p.id,
                            'quantity',
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-0.5 font-mono text-center font-bold text-blue-400 text-xs w-14 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicate(p)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                          title="Dupliquer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* FENÊTRE MODALE D'AJOUT DE PANNEAU (Téléportée sur document.body avec z-[9999] pour toujours être au premier plan) */}
      {showAddModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-xl w-full shadow-2xl text-slate-200">
              {/* Header du modal */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Ajout d&apos;un Panneau en Stock
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Raccourcis formats courants */}
              <div className="mb-4">
                <span className="text-[11px] text-slate-400 block mb-1.5">
                  Formats standards :
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {COMMON_PANEL_SIZES.map((sz, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyPresetSize(sz.l, sz.w)}
                      className="text-[11px] bg-slate-800 hover:bg-slate-700 text-blue-300 py-1 px-2 rounded-lg transition-colors text-center font-mono"
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulaire Modal : Tous les 4 champs (Matière à Qté) alignés sur la même ligne */}
              <form onSubmit={handleAdd} className="space-y-4 text-xs">
                <div className="flex gap-2 items-end">
                  {/* 1. Matière */}
                  <div className="flex-[2] min-w-0">
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
                      Matière
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: MDF 19mm..."
                      list="modal-stock-materials-list"
                      value={material}
                      onChange={(e) => setMaterial(e.target.value)}
                      className="w-full bg-slate-950 text-slate-100 px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                    />
                    <datalist id="modal-stock-materials-list">
                      {availableMaterials.map((m) => (
                        <option key={m} value={m} />
                      ))}
                      <option value="MDF 19mm" />
                      <option value="Contreplaqué Bouleau 15mm" />
                      <option value="Contreplaqué 5mm" />
                      <option value="Mélaminé Blanc 18mm" />
                      <option value="Chêne Massif 20mm" />
                      <option value="OSB 3 18mm" />
                    </datalist>
                  </div>

                  {/* 2. Longueur */}
                  <div className="flex-1 min-w-[65px]">
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate text-center">
                      Longueur
                    </label>
                    <input
                      type="number"
                      required
                      min="100"
                      max="6000"
                      placeholder="2800"
                      value={length || ''}
                      onChange={(e) => setLength(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 text-slate-100 font-mono px-1.5 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-xs"
                    />
                  </div>

                  {/* 3. Largeur */}
                  <div className="flex-1 min-w-[65px]">
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate text-center">
                      Largeur
                    </label>
                    <input
                      type="number"
                      required
                      min="100"
                      max="4000"
                      placeholder="2070"
                      value={width || ''}
                      onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 text-slate-100 font-mono px-1.5 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-xs"
                    />
                  </div>

                  {/* 4. Quantité */}
                  <div className="w-16 shrink-0">
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate text-center">
                      Qté
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="999"
                      placeholder="2"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 text-blue-400 font-mono font-bold px-1.5 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center text-xs"
                    />
                  </div>
                </div>

                {/* Bouton Ajouter */}
                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Fenêtre Modale : Stock Atelier (Chutes >= 500x500mm) */}
      {mounted &&
        showWorkshopModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-slate-800 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] flex flex-col">
              {/* En-tête de la modale Stock Atelier */}
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                    <Warehouse className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-wide">
                        Stock Atelier
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        Chutes ≥ 500 × 500 mm
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {totalWorkshopPanels} chute(s) disponible(s) — Total :{' '}
                      <strong className="text-teal-300 font-mono">
                        {totalWorkshopArea} m²
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualWorkshopForm((prev) => !prev)}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-700/80 hover:bg-slate-700 text-teal-300 border border-teal-500/30 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Enregistrer une chute</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWorkshopModal(false)}
                    className="w-8 h-8 rounded-lg bg-slate-700/60 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notification Toast de confirmation */}
              {workshopToast && (
                <div className="p-2.5 bg-emerald-950/90 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{workshopToast}</span>
                </div>
              )}

              {/* Formulaire repliable : Ajouter manuellement une chute */}
              {showManualWorkshopForm && (
                <form
                  onSubmit={handleAddManualWorkshopItem}
                  className="p-3 bg-slate-900/90 rounded-xl border border-teal-500/30 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-teal-300 text-xs">
                      Enregistrer une chute physique dans le stock atelier (≥ 500 × 500 mm)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowManualWorkshopForm(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Fermer
                    </button>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-[2] min-w-0">
                      <label className="block text-[11px] font-medium text-slate-300 mb-1">
                        Matière
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Contreplaqué 15mm..."
                        value={manualMat}
                        onChange={(e) => setManualMat(e.target.value)}
                        className="w-full bg-slate-950 text-slate-100 px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 text-xs"
                      />
                    </div>
                    <div className="flex-1 min-w-[65px]">
                      <label className="block text-[11px] font-medium text-slate-300 mb-1 text-center">
                        Longueur
                      </label>
                      <input
                        type="number"
                        required
                        min="500"
                        placeholder="800"
                        value={manualLen || ''}
                        onChange={(e) =>
                          setManualLen(parseInt(e.target.value) || 0)
                        }
                        className="w-full bg-slate-950 text-slate-100 font-mono px-1.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 text-center text-xs"
                      />
                    </div>
                    <div className="flex-1 min-w-[65px]">
                      <label className="block text-[11px] font-medium text-slate-300 mb-1 text-center">
                        Largeur
                      </label>
                      <input
                        type="number"
                        required
                        min="500"
                        placeholder="600"
                        value={manualWid || ''}
                        onChange={(e) =>
                          setManualWid(parseInt(e.target.value) || 0)
                        }
                        className="w-full bg-slate-950 text-slate-100 font-mono px-1.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 text-center text-xs"
                      />
                    </div>
                    <div className="w-16 shrink-0">
                      <label className="block text-[11px] font-medium text-slate-300 mb-1 text-center">
                        Qté
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="1"
                        value={manualQty || ''}
                        onChange={(e) =>
                          setManualQty(parseInt(e.target.value) || 1)
                        }
                        className="w-full bg-slate-950 text-teal-400 font-mono font-bold px-1.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 text-center text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Enregistrer</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Bouton mobile pour afficher le formulaire d'ajout */}
              <div className="sm:hidden">
                <button
                  type="button"
                  onClick={() => setShowManualWorkshopForm((prev) => !prev)}
                  className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Enregistrer une chute manuellement</span>
                </button>
              </div>

              {/* Table du stock atelier */}
              <div className="overflow-y-auto flex-1 border border-slate-700/80 rounded-xl min-h-[160px]">
                {totalWorkshopPanels === 0 ? (
                  <div className="text-center py-10 px-4 text-slate-400 text-xs">
                    <Box className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                    <p className="text-slate-200 font-semibold text-sm">
                      Aucune chute supérieure ou égale à 500 × 500 mm
                    </p>
                    <p className="text-slate-400 mt-1 max-w-md mx-auto text-xs">
                      Les chutes ≥ 500 × 500 mm issues de vos calepinages
                      apparaîtront automatiquement ici. Vous pouvez également en
                      ajouter une manuellement via le bouton ci-dessus.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 sticky top-0 text-slate-400 font-medium border-b border-slate-700/80">
                      <tr>
                        <th className="py-2.5 px-3">Matière</th>
                        <th className="py-2.5 px-3 text-center">
                          Dimensions (L × l mm)
                        </th>
                        <th className="py-2.5 px-3 text-center w-20">Qté</th>
                        <th className="py-2.5 px-3 text-center">Surface Totale</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60 text-slate-200">
                      {/* Chutes issues des calculs de coupe */}
                      {groupedOffcuts.map((item) => (
                        <tr
                          key={item.key}
                          className="hover:bg-slate-750/50 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-semibold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{item.material}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded">
                                Calepinage
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-teal-300">
                            {item.length} × {item.width} mm
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-block bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-0.5 font-mono font-bold text-teal-400 text-xs">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                            {item.areaM2.toFixed(2)} m²
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleAddWorkshopItemToProject(
                                  item.material,
                                  item.length,
                                  item.width
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors shadow-sm"
                              title="Ajouter cette chute dans votre stock de panneaux du projet"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Ajouter au projet</span>
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Chutes manuelles stockées */}
                      {manualWorkshopStock.map((item) => {
                        const area = (
                          (item.length * item.width * item.quantity) /
                          1_000_000
                        ).toFixed(2);

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-750/50 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-semibold text-white">
                              <div className="flex items-center gap-1.5">
                                <span>{item.material}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded">
                                  Atelier
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-teal-300">
                              {item.length} × {item.width} mm
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-block bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-0.5 font-mono font-bold text-teal-400 text-xs">
                                {item.quantity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                              {area} m²
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAddWorkshopItemToProject(
                                      item.material,
                                      item.length,
                                      item.width,
                                      item.id
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-colors shadow-sm"
                                  title="Utiliser cette chute dans le projet actuel"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Ajouter au projet</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteManualWorkshopItem(item.id)
                                  }
                                  className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/60 transition-colors"
                                  title="Supprimer du stock atelier"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pied de la modale */}
              <div className="pt-2 flex items-center justify-end border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setShowWorkshopModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium text-xs transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
