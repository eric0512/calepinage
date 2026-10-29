'use client';

import React, { useMemo } from 'react';
import { OffcutArea } from '@/types/cutting';
import { Warehouse, Plus, Box } from 'lucide-react';

interface OffcutsListProps {
  offcuts: (OffcutArea & { material: string; panelIndex: number })[];
  onAddOffcutToStock: (offcut: OffcutArea & { material: string }) => void;
}

interface WorkshopStockGroup {
  key: string;
  material: string;
  length: number;
  width: number;
  quantity: number;
  areaM2: number;
  sampleOffcut: OffcutArea & { material: string; panelIndex: number };
}

export const OffcutsList: React.FC<OffcutsListProps> = ({
  offcuts,
  onAddOffcutToStock,
}) => {
  // Filtrer les chutes ayant des dimensions supérieures ou égales à 500 x 500 mm
  const workshopStock = useMemo(() => {
    // Une chute est retenue si sa longueur et sa largeur sont >= 500 mm
    const qualifying = offcuts.filter((o) => {
      const dim1 = Math.max(o.length, o.width);
      const dim2 = Math.min(o.length, o.width);
      return dim1 >= 500 && dim2 >= 500;
    });

    // Regrouper par matière et dimensions identiques
    const groupMap = new Map<string, WorkshopStockGroup>();

    qualifying.forEach((o) => {
      const len = Math.round(Math.max(o.length, o.width));
      const wid = Math.round(Math.min(o.length, o.width));
      const key = `${o.material.toLowerCase().trim()}_${len}x${wid}`;

      const existing = groupMap.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.areaM2 += o.areaM2;
      } else {
        groupMap.set(key, {
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

    return Array.from(groupMap.values());
  }, [offcuts]);

  const totalQuantity = workshopStock.reduce((acc, it) => acc + it.quantity, 0);
  const totalAreaM2 = workshopStock
    .reduce((acc, it) => acc + it.areaM2, 0)
    .toFixed(2);

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-5 shadow-sm">
      {/* En-tête de la table Stock Atelier */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <Warehouse className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Stock Atelier
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Chutes ≥ 500 × 500 mm
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {totalQuantity} panneau(x) récupérable(s) — Total :{' '}
              <strong className="text-teal-300 font-mono">
                {totalAreaM2} m²
              </strong>
            </p>
          </div>
        </div>
      </div>

      {/* Contenu de la table */}
      {workshopStock.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-slate-700 rounded-xl text-slate-400 text-xs">
          <Box className="w-8 h-8 mx-auto text-slate-600 mb-2" />
          <p className="text-slate-300 font-medium">
            Aucune chute supérieure ou égale à 500 × 500 mm
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Les chutes générées par ce plan de coupe sont inférieures au gabarit
            d&apos;atelier de 500 mm.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700/80">
              <tr>
                <th className="py-2.5 px-3">Matière</th>
                <th className="py-2.5 px-3 text-center">Dimensions (L × l mm)</th>
                <th className="py-2.5 px-3 text-center w-24">Quantité</th>
                <th className="py-2.5 px-3 text-center">Surface Totale</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {workshopStock.map((item) => (
                <tr
                  key={item.key}
                  className="hover:bg-slate-750/50 transition-colors"
                >
                  {/* Matière */}
                  <td className="py-2.5 px-3 font-semibold text-white">
                    {item.material}
                  </td>

                  {/* Dimensions */}
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-teal-300">
                    {item.length} × {item.width} mm
                  </td>

                  {/* Quantité */}
                  <td className="py-2.5 px-3 text-center">
                    <span className="inline-block bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-0.5 font-mono font-bold text-teal-400 text-xs">
                      {item.quantity}
                    </span>
                  </td>

                  {/* Surface */}
                  <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                    {item.areaM2.toFixed(2)} m²
                  </td>

                  {/* Action : Réintégrer au stock */}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onAddOffcutToStock(item.sampleOffcut)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-950/80 hover:bg-teal-900 text-teal-300 border border-teal-500/30 transition-colors shadow-sm"
                      title="Ajouter cette chute dans votre stock de panneaux"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Réintégrer au stock</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
