'use client';

import React, { useState } from 'react';
import { StockPanel } from '@/types/cutting';
import { Layers, Plus, Trash2, Copy, Box } from 'lucide-react';

interface StockManagerProps {
  panels: StockPanel[];
  onChange: (panels: StockPanel[]) => void;
  availableMaterials: string[];
}

const COMMON_PANEL_SIZES = [
  { label: '2800 x 2070 (Standard Dérivés)', l: 2800, w: 2070 },
  { label: '2500 x 1220 (Standard Contreplaqué)', l: 2500, w: 1220 },
  { label: '2440 x 1220 (Standard OSB/Panneau 8x4)', l: 2440, w: 1220 },
  { label: '3050 x 1300 (Format Grande Hauteur)', l: 3050, w: 1300 },
];

export const StockManager: React.FC<StockManagerProps> = ({
  panels,
  onChange,
  availableMaterials,
}) => {
  // États locaux avec Matière et Épaisseur séparées
  const [material, setMaterial] = useState('MDF');
  const [thickness, setThickness] = useState<number>(19);
  const [length, setLength] = useState<number>(2800);
  const [width, setWidth] = useState<number>(2070);
  const [quantity, setQuantity] = useState<number>(2);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material.trim() || length <= 0 || width <= 0 || quantity <= 0) return;

    const cleanMat = material.trim();
    const formattedMaterial =
      thickness > 0 && !cleanMat.toLowerCase().includes('mm')
        ? `${cleanMat} ${thickness}mm`
        : cleanMat;

    const newPanel: StockPanel = {
      id: `stock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      material: formattedMaterial,
      thickness: thickness > 0 ? thickness : undefined,
      length: Math.max(length, width),
      width: Math.min(length, width),
      quantity,
    };

    onChange([...panels, newPanel]);
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
      {/* En-tête */}
      <div className="flex items-center justify-between mb-3.5">
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
      </div>

      {/* Formulaire d'ajout rapide */}
      <form
        onSubmit={handleAdd}
        className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 sm:p-3.5 mb-4 text-xs"
      >
        <div className="text-[11px] font-semibold text-slate-400 mb-2.5 flex items-center justify-between">
          <span>Ajouter un panneau au stock</span>
          {/* Raccourcis dimensions standards */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500">Formats courants :</span>
            {COMMON_PANEL_SIZES.map((sz, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyPresetSize(sz.l, sz.w)}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-blue-300 px-2 py-0.5 rounded transition-colors"
                title={sz.label}
              >
                {sz.l}×{sz.w}
              </button>
            ))}
          </div>
        </div>

        {/* LIGNE 1 : Matière et Épaisseur séparées en 2 champs sur la MÊME ligne */}
        <div className="flex gap-2 mb-2.5">
          {/* Champ 1 : Matière */}
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
              Matière
            </label>
            <input
              type="text"
              required
              placeholder="Ex: MDF, Contreplaqué, Mélaminé..."
              list="stock-materials-list"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
            />
            <datalist id="stock-materials-list">
              {availableMaterials.map((m) => (
                <option key={m} value={m} />
              ))}
              <option value="MDF" />
              <option value="Contreplaqué Bouleau" />
              <option value="Contreplaqué Okoumé" />
              <option value="Mélaminé Blanc" />
              <option value="Chêne Massif" />
              <option value="OSB 3" />
            </datalist>
          </div>

          {/* Champ 2 : Épaisseur */}
          <div className="w-28 sm:w-32 shrink-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate text-center">
              Épaisseur (mm)
            </label>
            <input
              type="number"
              min="1"
              max="150"
              placeholder="19"
              value={thickness || ''}
              onChange={(e) => setThickness(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 text-amber-400 font-mono font-bold px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-center"
            />
          </div>
        </div>

        {/* LIGNE 2 : Longueur, Largeur et Quantité sur la MÊME ligne avec le bouton Ajouter */}
        <div className="flex gap-1.5 sm:gap-2 items-end">
          {/* Longueur */}
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
              Longueur (mm)
            </label>
            <input
              type="number"
              required
              min="100"
              max="6000"
              placeholder="2800"
              value={length || ''}
              onChange={(e) => setLength(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 text-slate-100 font-mono px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-center"
            />
          </div>

          {/* Largeur */}
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 truncate">
              Largeur (mm)
            </label>
            <input
              type="number"
              required
              min="100"
              max="4000"
              placeholder="2070"
              value={width || ''}
              onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-950 text-slate-100 font-mono px-2 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-center"
            />
          </div>

          {/* Quantité */}
          <div className="w-16 sm:w-20 shrink-0">
            <label className="block text-[11px] font-medium text-slate-300 mb-1 text-center">
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
              className="w-full bg-slate-950 text-blue-400 font-mono font-bold px-1 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-center"
            />
          </div>

          {/* Bouton d'ajout */}
          <button
            type="submit"
            className="h-[31px] w-[34px] sm:w-10 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center shrink-0 shadow-sm mb-px"
            title="Ajouter au stock"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Tableau du stock */}
      {panels.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-700 rounded-xl text-slate-400 text-xs">
          <Box className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          Aucun panneau en stock. Ajoutez vos dimensions de panneaux bruts
          ci-dessus.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700/80">
              <tr>
                <th className="py-2.5 px-3">Matière</th>
                <th className="py-2.5 px-3 text-center">Épaisseur</th>
                <th className="py-2.5 px-3">Dimensions (L × l mm)</th>
                <th className="py-2.5 px-3 text-center">Surface Unitaire</th>
                <th className="py-2.5 px-3 text-center w-24">Quantité</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {panels.map((p) => {
                const area = ((p.length * p.width) / 1_000_000).toFixed(2);
                const matchEp = p.material.match(/(\d+(?:\.\d+)?)\s*mm/i);
                const displayThickness = p.thickness || (matchEp ? matchEp[1] : '-');

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-750/50 transition-colors group"
                  >
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={p.material}
                        onChange={(e) =>
                          handleUpdate(p.id, 'material', e.target.value)
                        }
                        className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1.5 py-0.5 text-xs font-semibold text-white w-full max-w-[180px]"
                      />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="font-mono text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-[11px]">
                        {displayThickness} {displayThickness !== '-' && 'mm'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono">
                      <div className="flex items-center gap-1.5">
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
                          className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1 py-0.5 w-16 text-slate-200"
                        />
                        <span className="text-slate-500">×</span>
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
                          className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1 py-0.5 w-16 text-slate-200"
                        />
                        <span className="text-[10px] text-slate-500">mm</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-slate-400">
                      {area} m²
                    </td>
                    <td className="py-2 px-3 text-center">
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
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 font-mono text-center font-bold text-blue-400 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
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
    </div>
  );
};
