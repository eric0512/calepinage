'use client';

import React from 'react';
import { OptimizationResult } from '@/types/cutting';
import {
  Layers,
  Percent,
  Trash2,
  Scissors,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface StatsSummaryProps {
  result: OptimizationResult;
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ result }) => {
  const wastePercentage = Number(
    (100 - result.overallEfficiencyPercentage).toFixed(1)
  );

  return (
    <div className="space-y-4">
      {/* Alertes d'items non placés si le stock était insuffisant */}
      {result.unplacedItems.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-300">
                Attention : Stock insuffisant ou dimensions hors gabarit
              </h4>
              <p className="text-xs text-amber-300/80 mt-1">
                Les pièces suivantes n&apos;ont pas pu être placées sur les panneaux
                disponibles :
              </p>
              <ul className="mt-2 space-y-1 text-xs font-mono">
                {result.unplacedItems.map((u, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      • {u.remainingQuantity}× {u.item.name} ({u.item.length}×
                      {u.item.width} mm) [{u.item.material}]
                    </span>
                    <span className="text-[11px] text-amber-400 italic">
                      — {u.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Cartes KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Panneaux utilisés */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Panneaux Utilisés</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-white">
              {result.totalPanelsUsed}
            </span>
            <span className="text-xs text-slate-400">
              / {result.totalStockAvailable} dispo
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Surface brute : {result.totalPanelsAreaM2} m²
          </div>
        </div>

        {/* Rendement matière */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Rendement Matière</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold font-mono ${
                result.overallEfficiencyPercentage >= 80
                  ? 'text-emerald-400'
                  : result.overallEfficiencyPercentage >= 65
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {result.overallEfficiencyPercentage} %
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Surface utile : {result.totalUsedAreaM2} m²
          </div>
        </div>

        {/* Taux de chute */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Taux de Chute</span>
            <Trash2 className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-rose-400">
              {wastePercentage} %
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Perte totale : {result.totalWasteAreaM2} m²
          </div>
        </div>

        {/* Stock Atelier (chutes >= 500mm) & Coupe */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Stock Atelier (≥ 500mm)</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-teal-300">
              {result.reusableOffcuts.length}
            </span>
            <span className="text-xs text-slate-400">chute(s)</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <Scissors className="w-3 h-3 text-slate-500" />
            <span>Longueur coupe : {result.totalLinearCutM} m</span>
          </div>
        </div>
      </div>
    </div>
  );
};

