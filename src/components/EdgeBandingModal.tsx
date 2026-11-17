'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { EdgeBandingEdges } from '@/types/cutting';
import { computeCutDimensions, hasAnyEdgeBanding } from '@/lib/edge-banding';

interface EdgeBandingButtonProps {
  edges?: EdgeBandingEdges;
  onClick: () => void;
  title?: string;
}

/**
 * Bouton visuel compact affichant un mini-rectangle avec les chants actifs en orange
 * et le nombre de chants sélectionnés (ex: "4 chants", "2 ch.", "Chants").
 */
export const EdgeBandingButton: React.FC<EdgeBandingButtonProps> = ({
  edges = {},
  onClick,
  title = 'Ouvrir la vue graphique pour sélectionner les chants à plaquer',
}) => {
  const activeEdgesCount =
    (edges.top ? 1 : 0) +
    (edges.bottom ? 1 : 0) +
    (edges.left ? 1 : 0) +
    (edges.right ? 1 : 0);

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-medium transition-colors ${
        activeEdgesCount > 0
          ? 'bg-orange-500/15 border-orange-500/60 text-orange-300 hover:bg-orange-500/25'
          : 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:border-amber-500/50 hover:text-white'
      }`}
    >
      <span className="relative inline-block w-4 h-3 bg-slate-800 rounded-[2px] border border-slate-600 shrink-0">
        {edges.top && (
          <span className="absolute -top-[1px] left-0 right-0 h-[2px] bg-orange-500 rounded-full" />
        )}
        {edges.bottom && (
          <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-orange-500 rounded-full" />
        )}
        {edges.left && (
          <span className="absolute top-0 bottom-0 -left-[1px] w-[2px] bg-orange-500 rounded-full" />
        )}
        {edges.right && (
          <span className="absolute top-0 bottom-0 -right-[1px] w-[2px] bg-orange-500 rounded-full" />
        )}
      </span>
      <span className="font-mono font-bold">
        {activeEdgesCount === 0
          ? 'Chants'
          : activeEdgesCount === 4
          ? '4 chants'
          : `${activeEdgesCount} ch.`}
      </span>
    </button>
  );
};

interface EdgeBandingModalProps {
  isOpen: boolean;
  title: string;
  material?: string;
  length: number;
  width: number;
  edgeThickness: number;
  edges?: EdgeBandingEdges;
  onChange: (nextEdges: EdgeBandingEdges) => void;
  onClose: () => void;
}

export const EdgeBandingModal: React.FC<EdgeBandingModalProps> = ({
  isOpen,
  title,
  material,
  length,
  width,
  edgeThickness,
  edges = {},
  onChange,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const { finishedLength, finishedWidth, cutLength, cutWidth, hasDeduction } =
    computeCutDimensions(length, width, edges, edgeThickness);
  const ratio = Math.min(1, Math.max(0.25, finishedWidth / Math.max(1, finishedLength)));
  const pieceBoxWidth = 280;
  const pieceBoxHeight = Math.max(84, Math.round(pieceBoxWidth * ratio));
  const totalPieceEdgeMm =
    ((edges.top ? 1 : 0) + (edges.bottom ? 1 : 0)) * finishedLength +
    ((edges.left ? 1 : 0) + (edges.right ? 1 : 0)) * finishedWidth;

  const toggleModalEdge = (edgeKey: keyof EdgeBandingEdges) => {
    onChange({
      ...edges,
      [edgeKey]: !edges[edgeKey],
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="modal-box bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-slate-100"
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              Bande de champs — {title}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {material ? `${material} • ` : ''}Cote finie :{' '}
              <span className="font-mono font-bold text-white">
                {finishedLength} × {finishedWidth} mm
              </span>
              {edgeThickness > 0 ? (
                <span className="ml-2 text-orange-300 font-semibold">
                  (Ép. chant : {edgeThickness} mm)
                </span>
              ) : (
                <span className="ml-2 text-slate-500">(Sans épaisseur déduite)</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Représentation graphique proportionnelle avec 4 chants cliquables */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
          <p className="text-[11px] text-slate-400 text-center">
            Cliquez directement sur un des 4 côtés pour activer / désactiver la bande de champ :
          </p>

          <div className="flex flex-col items-center gap-2 my-1">
            {/* Chant HAUT (Longueur 1) */}
            <button
              type="button"
              onClick={() => toggleModalEdge('top')}
              className={`px-3 py-1 rounded-lg font-mono text-xs font-bold border transition-all flex items-center gap-1.5 ${
                edges.top
                  ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20'
                  : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:border-orange-500/60 hover:text-white'
              }`}
              style={{ width: `${pieceBoxWidth}px`, justifyContent: 'center' }}
            >
              <span>Longueur {finishedLength} mm</span>
              <span className="text-[10px] opacity-85">
                {edges.top ? '✓ Plaqué' : '(Cliquer)'}
              </span>
            </button>

            {/* Ligne centrale : Chant GAUCHE + Pièce + Chant DROIT */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleModalEdge('left')}
                title={`Largeur ${finishedWidth} mm`}
                className={`w-16 sm:w-20 rounded-lg font-mono text-[11px] font-bold border transition-all flex flex-col items-center justify-center px-1 text-center ${
                  edges.left
                    ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20'
                    : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:border-orange-500/60 hover:text-white'
                }`}
                style={{ height: `${pieceBoxHeight}px` }}
              >
                <span>{finishedWidth} mm</span>
                <span className="text-[9px] mt-0.5 opacity-85">
                  {edges.left ? '✓ Plaqué' : 'Cliquer'}
                </span>
              </button>

              {/* Corps de la pièce proportionnel */}
              <div
                className="relative bg-slate-800/70 border border-slate-600 rounded-md flex flex-col items-center justify-center p-2 text-center select-none transition-all"
                style={{
                  width: `${pieceBoxWidth}px`,
                  height: `${pieceBoxHeight}px`,
                }}
              >
                {edges.top && (
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-orange-500 rounded-t" />
                )}
                {edges.bottom && (
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-orange-500 rounded-b" />
                )}
                {edges.left && (
                  <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-orange-500 rounded-l" />
                )}
                {edges.right && (
                  <div className="absolute top-0 bottom-0 right-0 w-1.5 bg-orange-500 rounded-r" />
                )}

                <span className="text-xs font-bold text-white truncate max-w-full px-2">
                  {title}
                </span>
                <span className="text-[11px] font-mono text-slate-300 mt-0.5">
                  {finishedLength} × {finishedWidth} mm
                </span>
                {hasDeduction && (
                  <span className="text-[10px] font-mono font-bold text-orange-300 mt-1 px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/30">
                    Coupe : {cutLength} × {cutWidth} mm
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => toggleModalEdge('right')}
                title={`Largeur ${finishedWidth} mm`}
                className={`w-16 sm:w-20 rounded-lg font-mono text-[11px] font-bold border transition-all flex flex-col items-center justify-center px-1 text-center ${
                  edges.right
                    ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20'
                    : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:border-orange-500/60 hover:text-white'
                }`}
                style={{ height: `${pieceBoxHeight}px` }}
              >
                <span>{finishedWidth} mm</span>
                <span className="text-[9px] mt-0.5 opacity-85">
                  {edges.right ? '✓ Plaqué' : 'Cliquer'}
                </span>
              </button>
            </div>

            {/* Chant BAS (Longueur 2) */}
            <button
              type="button"
              onClick={() => toggleModalEdge('bottom')}
              className={`px-3 py-1 rounded-lg font-mono text-xs font-bold border transition-all flex items-center gap-1.5 ${
                edges.bottom
                  ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20'
                  : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:border-orange-500/60 hover:text-white'
              }`}
              style={{ width: `${pieceBoxWidth}px`, justifyContent: 'center' }}
            >
              <span>Longueur {finishedLength} mm</span>
              <span className="text-[10px] opacity-85">
                {edges.bottom ? '✓ Plaqué' : '(Cliquer)'}
              </span>
            </button>
          </div>

          {/* Raccourcis rapides */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 border-t border-slate-800 w-full">
            <button
              type="button"
              onClick={() => onChange({ top: false, bottom: false, left: false, right: false })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700"
            >
              Aucun
            </button>
            <button
              type="button"
              onClick={() => onChange({ top: true, bottom: false, left: false, right: false })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
            >
              1 Longueur
            </button>
            <button
              type="button"
              onClick={() => onChange({ top: true, bottom: true, left: false, right: false })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
            >
              2 Longueurs
            </button>
            <button
              type="button"
              onClick={() => onChange({ top: true, bottom: false, left: true, right: false })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
            >
              1 Long. + 1 Larg.
            </button>
            <button
              type="button"
              onClick={() => onChange({ top: true, bottom: true, left: true, right: true })}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold border border-amber-500/40"
            >
              4 chants
            </button>
          </div>
        </div>

        {/* Résumé & Validation */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-300">
            {hasAnyEdgeBanding(edges) ? (
              <span>
                Longueur par pièce :{' '}
                <strong className="font-mono text-orange-300">
                  {(totalPieceEdgeMm / 1000).toFixed(2).replace('.', ',')} m
                </strong>{' '}
                <span className="text-[11px] text-slate-400 font-mono">
                  ({totalPieceEdgeMm} mm)
                </span>
              </span>
            ) : (
              <span className="text-slate-500">Aucun chant sélectionné</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Valider</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
