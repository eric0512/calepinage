'use client';

import React from 'react';
import { CutSettings } from '@/types/cutting';
import { Disc, Ruler } from 'lucide-react';

interface SettingsBarProps {
  settings: CutSettings;
  onChange: (settings: CutSettings) => void;
}

export const SettingsBar: React.FC<SettingsBarProps> = ({
  settings,
  onChange,
}) => {
  const updateKerf = (val: number) => {
    // 1 chiffre après la virgule
    const rounded = Math.round(val * 10) / 10;
    if (rounded >= 0 && rounded <= 15) {
      onChange({ ...settings, kerf: rounded });
    }
  };

  const presetKerfs = [2.4, 3.0, 3.2, 4.0];

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-4 shadow-sm text-slate-200 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Titre */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Disc className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Paramètres de Coupe &amp; Lame de Scie
            </h2>
          </div>
        </div>

        {/* Inputs */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {/* Épaisseur Trait de scie */}
          <div className="flex items-center gap-3 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-700/80">
            <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <span>Trait de scie :</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateKerf(settings.kerf - 0.1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-colors"
                title="-0.1 mm"
              >
                -
              </button>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="15"
                  value={settings.kerf}
                  onChange={(e) => updateKerf(parseFloat(e.target.value) || 0)}
                  className="w-16 text-center bg-slate-950 text-amber-400 font-mono font-bold text-sm px-2 py-1 rounded-lg border border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <span className="text-xs font-mono text-slate-400">mm</span>
              <button
                type="button"
                onClick={() => updateKerf(settings.kerf + 0.1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-colors"
                title="+0.1 mm"
              >
                +
              </button>
            </div>

            {/* Boutons rapides pour standards courants */}
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-slate-700/60">
              {presetKerfs.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => updateKerf(k)}
                  className={`text-[11px] px-2 py-0.5 rounded font-mono transition-colors ${
                    settings.kerf === k
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {k.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Seuil Chute Réutilisable */}
          <div className="flex items-center gap-2 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-700/80">
            <Ruler className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-slate-300">Seuil chute min :</span>
            <input
              type="number"
              step="50"
              min="50"
              max="1000"
              value={settings.minOffcutLength}
              onChange={(e) =>
                onChange({
                  ...settings,
                  minOffcutLength: parseInt(e.target.value) || 100,
                  minOffcutWidth: parseInt(e.target.value) || 100,
                })
              }
              className="w-16 text-center bg-slate-950 text-emerald-400 font-mono font-semibold text-xs px-2 py-1 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-xs font-mono text-slate-400">mm²</span>
          </div>
        </div>
      </div>
    </div>
  );
};
