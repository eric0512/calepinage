'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StockPanel } from '@/types/cutting';
import { Layers, Plus, Trash2, Copy, Box, X } from 'lucide-react';

interface StockManagerProps {
  panels: StockPanel[];
  onChange: (panels: StockPanel[]) => void;
  availableMaterials: string[];
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
}) => {
  // État de montage pour createPortal
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // État de la fenêtre modale
  const [showAddModal, setShowAddModal] = useState(false);

  // Champs du formulaire modal : Matière, Longueur, Largeur, Qté
  const [material, setMaterial] = useState('MDF 19mm');
  const [length, setLength] = useState<number>(2800);
  const [width, setWidth] = useState<number>(2070);
  const [quantity, setQuantity] = useState<number>(2);

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
      {/* En-tête avec Titre et Bouton "Ajout panneau" à droite */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
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

        {/* Bouton Ajout panneau à droite */}
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Ajout panneau</span>
        </button>
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
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl text-slate-200">
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
                <div className="grid grid-cols-2 gap-1.5">
                  {COMMON_PANEL_SIZES.map((sz, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyPresetSize(sz.l, sz.w)}
                      className="text-[11px] bg-slate-800 hover:bg-slate-700 text-blue-300 py-1 px-2 rounded-lg transition-colors text-left"
                    >
                      {sz.label} mm
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulaire Modal avec Matière, Longueur, Largeur, Qté et bouton Ajouter */}
              <form onSubmit={handleAdd} className="space-y-3.5 text-xs">
                {/* Champ Matière */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Matière
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: MDF 19mm, Contreplaqué 15mm..."
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

                {/* Champs Longueur, Largeur et Quantité */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Longueur */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
                      Longueur (mm)
                    </label>
                    <input
                      type="number"
                      required
                      min="100"
                      max="6000"
                      value={length || ''}
                      onChange={(e) => setLength(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 text-slate-100 font-mono px-2 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                    />
                  </div>

                  {/* Largeur */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
                      Largeur (mm)
                    </label>
                    <input
                      type="number"
                      required
                      min="100"
                      max="4000"
                      value={width || ''}
                      onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 text-slate-100 font-mono px-2 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                    />
                  </div>

                  {/* Quantité */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate text-center">
                      Qté
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="999"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 text-blue-400 font-mono font-bold px-2 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                    />
                  </div>
                </div>

                {/* Bouton Ajouter */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
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
    </div>
  );
};
