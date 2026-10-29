'use client';

import React from 'react';
import { OffcutArea } from '@/types/cutting';
import { CheckCircle2, Plus, Sparkles } from 'lucide-react';

interface OffcutsListProps {
  offcuts: (OffcutArea & { material: string; panelIndex: number })[];
  onAddOffcutToStock: (offcut: OffcutArea & { material: string }) => void;
}

export const OffcutsList: React.FC<OffcutsListProps> = ({
  offcuts,
  onAddOffcutToStock,
}) => {
  if (offcuts.length === 0) {
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-5 shadow-sm text-center text-slate-400 text-xs">
        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60 mb-2" />
        <span className="text-slate-300 font-medium">
          Aucune chute supérieure au seuil réutilisable.
        </span>
        <p className="text-[11px] text-slate-500 mt-1">
          La quasi-totalité de la matière a été convertie en pièces ou sciures.
        </p>
      </div>
    );
  }

  const totalAreaM2 = offcuts
    .reduce((sum, o) => sum + o.areaM2, 0)
    .toFixed(2);

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Chutes Réutilisables Détectées
            </h3>
            <p className="text-xs text-slate-400">
              {offcuts.length} morceau(x) valorisable(s) — Total :{' '}
              <strong className="text-teal-300 font-mono">
                {totalAreaM2} m²
              </strong>
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/80">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700/80">
            <tr>
              <th className="py-2 px-3">Panneau Source</th>
              <th className="py-2 px-3">Matière</th>
              <th className="py-2 px-3">Dimensions (L × l mm)</th>
              <th className="py-2 px-3 text-center">Surface</th>
              <th className="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 text-slate-200">
            {offcuts.map((offcut, idx) => (
              <tr
                key={offcut.id + idx}
                className="hover:bg-slate-750/50 transition-colors"
              >
                <td className="py-2 px-3 font-semibold text-slate-300">
                  Panneau {offcut.panelIndex}
                </td>
                <td className="py-2 px-3 font-medium text-emerald-400">
                  {offcut.material}
                </td>
                <td className="py-2 px-3 font-mono font-semibold text-white">
                  {Math.round(offcut.length)} × {Math.round(offcut.width)} mm
                </td>
                <td className="py-2 px-3 text-center font-mono text-slate-400">
                  {offcut.areaM2} m²
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => onAddOffcutToStock(offcut)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-teal-950/80 hover:bg-teal-900 text-teal-300 border border-teal-500/30 transition-colors shadow-sm"
                    title="Ajouter ce morceau dans votre stock pour vos futurs débits"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Réintégrer au stock</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

