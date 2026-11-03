'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Plus, Play, X } from 'lucide-react';
import { StockPanel } from '@/types/cutting';

export interface MissingMaterialInfo {
  material: string;
  requiredPiecesCount: number;
  maxPieceLength: number;
  maxPieceWidth: number;
}

interface MissingStockModalProps {
  isOpen: boolean;
  missingMaterials: MissingMaterialInfo[];
  onClose: () => void;
  onConfirmAndOptimize: (panelsToAdd: StockPanel[]) => void;
  onConfirmOnly: (panelsToAdd: StockPanel[]) => void;
}

interface ProposedPanelState {
  material: string;
  length: number;
  width: number;
  quantity: number;
}

const STANDARD_FORMATS = [
  { label: 'Standard 2800×2070', length: 2800, width: 2070 },
  { label: 'Menuiserie 2440×1220', length: 2440, width: 1220 },
  { label: 'Moyen 2500×1250', length: 2500, width: 1250 },
  { label: 'Compact 2000×1000', length: 2000, width: 1000 },
];

export const MissingStockModal: React.FC<MissingStockModalProps> = ({
  isOpen,
  missingMaterials,
  onClose,
  onConfirmAndOptimize,
  onConfirmOnly,
}) => {
  const [mounted, setMounted] = useState(false);
  const [panels, setPanels] = useState<ProposedPanelState[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialiser les propositions de panneaux selon les matières manquantes
  useEffect(() => {
    if (missingMaterials.length > 0) {
      setPanels(
        missingMaterials.map((m) => {
          // Si une pièce dépasse 2440 ou 1220, proposer 2800x2070 par défaut
          const isLarge = m.maxPieceLength > 2440 || m.maxPieceWidth > 1220;
          return {
            material: m.material,
            length: isLarge ? 2800 : 2800,
            width: isLarge ? 2070 : 2070,
            quantity: 1,
          };
        })
      );
    }
  }, [missingMaterials]);

  if (!isOpen || !mounted || missingMaterials.length === 0) return null;

  const updatePanel = (index: number, updates: Partial<ProposedPanelState>) => {
    setPanels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const createStockPanels = (): StockPanel[] => {
    return panels.map((p, idx) => ({
      id: `sp-missing-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: p.material,
      material: p.material,
      length: Math.max(100, Math.round(p.length)),
      width: Math.max(100, Math.round(p.width)),
      quantity: Math.max(1, Math.round(p.quantity)),
    }));
  };

  const handleAddAndOptimize = () => {
    const newPanels = createStockPanels();
    onConfirmAndOptimize(newPanels);
  };

  const handleAddOnly = () => {
    const newPanels = createStockPanels();
    onConfirmOnly(newPanels);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" className="modal-box bg-slate-900 border border-amber-500/30 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white">
        {/* En-tête */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                <span>Matière non présente en stock</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  Optimisation suspendue
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                L&apos;IA ou le débit nécessite une matière absente de vos stocks.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 text-xs text-amber-200/90 leading-relaxed">
            Pour calculer un plan de coupe rigoureux et réaliste, veuillez définir le ou les panneaux bruts à ajouter à votre stock. Le calepinage sera calculé immédiatement avec ce stock mis à jour.
          </div>

          <div className="space-y-4">
            {panels.map((p, idx) => {
              const info = missingMaterials[idx];
              return (
                <div
                  key={idx}
                  className="bg-slate-850 border border-slate-700 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-400 text-sm font-mono">
                        {p.material}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-medium">
                        Hors stock
                      </span>
                    </div>
                    {info && (
                      <span className="text-[11px] text-slate-400">
                        Demande : <strong>{info.requiredPiecesCount}</strong> pièce(s) (max{' '}
                        <strong className="text-slate-200">
                          {info.maxPieceLength} × {info.maxPieceWidth} mm
                        </strong>
                        )
                      </span>
                    )}
                  </div>

                  {/* Formats rapides */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Formats standards rapides :
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {STANDARD_FORMATS.map((fmt, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() =>
                            updatePanel(idx, { length: fmt.length, width: fmt.width })
                          }
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                            p.length === fmt.length && p.width === fmt.width
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dimensions du panneau à mettre en stock */}
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Longueur brute (mm)
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="5000"
                        value={p.length}
                        onChange={(e) =>
                          updatePanel(idx, { length: parseInt(e.target.value) || 0 })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Largeur brute (mm)
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="5000"
                        value={p.width}
                        onChange={(e) =>
                          updatePanel(idx, { width: parseInt(e.target.value) || 0 })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Quantité en stock
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={p.quantity}
                        onChange={(e) =>
                          updatePanel(idx, { quantity: parseInt(e.target.value) || 1 })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-400 text-center"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pied de page avec actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/95 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
          >
            Annuler
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleAddOnly}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Mettre en stock seulement</span>
            </button>

            <button
              type="button"
              onClick={handleAddAndOptimize}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow-lg active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Mettre en stock et lancer l&apos;optimisation</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

