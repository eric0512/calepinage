'use client';

import React, { useState, useId, useCallback } from 'react';
import { PanelResult, PlacedPiece, OffcutArea } from '@/types/cutting';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Info,
  FileDown,
  Tag,
} from 'lucide-react';
import { exportCuttingPlansToPdf, exportLabelsToPdf } from '@/lib/pdf-export';
import { getDistinctCabinets, getPieceCabinet, getPiecePart } from '@/lib/piece-labels';

interface CuttingVisualizerProps {
  panels: PanelResult[];
  kerf: number;
  projectName?: string;
  panelOrientations?: Record<string, 'vertical' | 'horizontal'>;
  onPanelOrientationsChange?: (orientations: Record<string, 'vertical' | 'horizontal'>) => void;
  edgeBanding?: string;
}

export const CuttingVisualizer: React.FC<CuttingVisualizerProps> = ({
  panels,
  kerf,
  projectName = 'Projet Menuiserie',
  panelOrientations,
  onPanelOrientationsChange,
  edgeBanding,
}) => {
  const [selectedPanelIdx, setSelectedPanelIdx] = useState(0);
  const [hoveredPiece, setHoveredPiece] = useState<PlacedPiece | null>(null);
  const [hoveredOffcut, setHoveredOffcut] = useState<OffcutArea | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingLabelsPdf, setIsExportingLabelsPdf] = useState<boolean>(false);
  const [internalOrientations, setInternalOrientations] = useState<
    Record<string, 'vertical' | 'horizontal'>
  >({});

  const effectiveOrientations = panelOrientations ?? internalOrientations;

  const handleToggleOrientation = useCallback(
    (panelIndex: number) => {
      const key = String(panelIndex);
      const current = effectiveOrientations[key] || 'vertical';
      const updated: Record<string, 'vertical' | 'horizontal'> = {
        ...effectiveOrientations,
        [key]: current === 'vertical' ? 'horizontal' : 'vertical',
      };
      if (onPanelOrientationsChange) {
        onPanelOrientationsChange(updated);
      } else {
        setInternalOrientations(updated);
      }
    },
    [effectiveOrientations, onPanelOrientationsChange]
  );

  const handleToggleAllOrientations = useCallback(() => {
    const allAreHorizontal = panels.every(
      (p) => (effectiveOrientations[String(p.panelIndex)] || 'vertical') === 'horizontal'
    );
    const target: 'vertical' | 'horizontal' = allAreHorizontal ? 'vertical' : 'horizontal';
    const updated: Record<string, 'vertical' | 'horizontal'> = { ...effectiveOrientations };
    panels.forEach((p) => {
      updated[String(p.panelIndex)] = target;
    });
    if (onPanelOrientationsChange) {
      onPanelOrientationsChange(updated);
    } else {
      setInternalOrientations(updated);
    }
  }, [panels, effectiveOrientations, onPanelOrientationsChange]);

  const patternId = useId();

  const handleExportPDF = () => {
    setIsExportingPdf(true);
    try {
      exportCuttingPlansToPdf(panels, kerf, projectName, effectiveOrientations, edgeBanding);
    } catch (err) {
      console.error('Erreur export PDF:', err);
      alert('Une erreur est survenue lors de l\'exportation PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportLabelsPDF = () => {
    setIsExportingLabelsPdf(true);
    try {
      exportLabelsToPdf(panels, projectName);
    } catch (err) {
      console.error('Erreur export étiquettes PDF:', err);
      alert('Une erreur est survenue lors de la génération des étiquettes PDF.');
    } finally {
      setIsExportingLabelsPdf(false);
    }
  };

  if (panels.length === 0) {
    return (
      <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-8 text-center text-slate-400">
        <Layers className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-white">
          Aucun plan de coupe généré
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Ajoutez des panneaux en stock et des pièces à débiter, puis cliquez
          sur « Optimiser les coupes ».
        </p>
      </div>
    );
  }

  const currentPanel = panels[selectedPanelIdx] || panels[0];

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Barre d'outils du visualiseur */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/80">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white tracking-wide">
              Plans de Coupe Graphiques Interactifs
            </h3>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {panels.length} panneau(x) optimisé(s)
            </span>
          </div>

          {/* Boutons Export PDF (Plans de coupe & Étiquettes 70x36mm) sous le texte X panneau(x) optimisé */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-rose-900/30 transition-all active:scale-95 disabled:opacity-50"
              title="Exporter tous les plans de coupe dans un fichier PDF (1 panneau par feuille A4)"
            >
              <FileDown className="w-4 h-4 text-white" />
              <span>{isExportingPdf ? 'Génération du PDF...' : 'Exporter PDF (1 panneau / feuille A4)'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportLabelsPDF}
              disabled={isExportingLabelsPdf}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-900/30 transition-all active:scale-95 disabled:opacity-50"
              title="Créer un PDF d'étiquettes au format A4 (3 × 7 étiquettes de 70 × 36 mm)"
            >
              <Tag className="w-4 h-4 text-slate-950" />
              <span>{isExportingLabelsPdf ? 'Création du PDF...' : 'Étiquettes PDF (A4 - 70×36 mm)'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-1.5">
            Trait de scie appliqué :{' '}
            <span className="font-mono text-amber-400 font-semibold">
              {kerf.toFixed(1)} mm
            </span>
          </p>
        </div>

        {/* Contrôles d'affichage & Navigation */}
        <div className="flex items-center gap-2">
          {/* Bascule Mode Unitaire / Tous */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${viewMode === 'single'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              Vue Panneau
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${viewMode === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              Tous les panneaux
            </button>
          </div>

          {/* Bouton pour basculer tous les panneaux à la fois */}
          <button
            type="button"
            onClick={handleToggleAllOrientations}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            title="Basculer l'orientation de tous les panneaux à la fois"
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Pivoter tous</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Zoom arrière"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-slate-300">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(2.0, z + 0.2))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Zoom avant"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="p-1 text-slate-400 hover:text-white transition-colors border-l border-slate-800 ml-0.5"
              title="Réinitialiser zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation par onglets de panneaux si vue unitaire */}
      {viewMode === 'single' && panels.length > 1 && (
        <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-700/60">
          <button
            type="button"
            disabled={selectedPanelIdx === 0}
            onClick={() => setSelectedPanelIdx((i) => Math.max(0, i - 1))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 transition-colors"
            title="Panneau précédent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Liste déroulante / Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[70vw] px-2 py-1">
            {panels.map((p, idx) => (
              <button
                key={p.panelId + idx}
                type="button"
                onClick={() => setSelectedPanelIdx(idx)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${selectedPanelIdx === idx
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
              >
                <span>Panneau {p.panelIndex}</span>
                <span className="text-[10px] opacity-75">
                  ({p.material} - {p.efficiencyPercentage}%)
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={selectedPanelIdx === panels.length - 1}
            onClick={() =>
              setSelectedPanelIdx((i) => Math.min(panels.length - 1, i + 1))
            }
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 transition-colors"
            title="Panneau suivant"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Affichage des panneaux (soit le panneau actif, soit tous) */}
      <div className="space-y-6">
        {(viewMode === 'single' ? [currentPanel] : panels).map(
          (panel, panelIdx) => (
            <SinglePanelSVG
              key={panel.panelId + panelIdx}
              panel={panel}
              kerf={kerf}
              zoomLevel={zoomLevel}
              hoveredPiece={hoveredPiece}
              setHoveredPiece={setHoveredPiece}
              hoveredOffcut={hoveredOffcut}
              setHoveredOffcut={setHoveredOffcut}
              patternId={`${patternId}-${panelIdx}`}
              orientation={effectiveOrientations[String(panel.panelIndex)] || 'vertical'}
              onToggleOrientation={() => handleToggleOrientation(panel.panelIndex)}
            />
          )
        )}
      </div>

      {/* Légende du plan */}
      <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-blue-500/40 border border-blue-400" />
            <span>Pièce découpée cotée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-emerald-950 border border-emerald-500 border-dashed" />
            <span className="text-emerald-400 font-medium">
              Stock Atelier (≥ 500 mm)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-800 border border-slate-600" />
            <span className="text-slate-400">Reste / Perte</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-amber-400" />
            <span className="text-amber-300">
              Trait de coupe guillotine ({kerf.toFixed(1)} mm)
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-1">
          <Info className="w-3 h-3 text-slate-500" />
          <span>Survolez une pièce pour afficher ses cotes détaillées</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Convertit n'importe quelle couleur hexadécimale en teinte très claire (pastel)
 * afin qu'elle apparaisse en nuance de gris clair à l'impression avec un contraste optimal.
 */
function toLightColorCss(hexColor?: string): string {
  const clean = (hexColor || '#3b82f6').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 80;
  const g = parseInt(clean.substring(2, 4), 16) || 140;
  const b = parseInt(clean.substring(4, 6), 16) || 240;

  const lr = Math.round(r * 0.18 + 255 * 0.82);
  const lg = Math.round(g * 0.18 + 255 * 0.82);
  const lb = Math.round(b * 0.18 + 255 * 0.82);

  return `rgb(${lr}, ${lg}, ${lb})`;
}

interface SinglePanelSVGProps {
  panel: PanelResult;
  kerf: number;
  zoomLevel: number;
  hoveredPiece: PlacedPiece | null;
  setHoveredPiece: (p: PlacedPiece | null) => void;
  hoveredOffcut: OffcutArea | null;
  setHoveredOffcut: (o: OffcutArea | null) => void;
  patternId: string;
  orientation?: 'vertical' | 'horizontal';
  onToggleOrientation?: () => void;
}

const SinglePanelSVG: React.FC<SinglePanelSVGProps> = ({
  panel,
  kerf,
  zoomLevel,
  hoveredPiece,
  setHoveredPiece,
  hoveredOffcut,
  setHoveredOffcut,
  patternId,
  orientation = 'vertical',
  onToggleOrientation,
}) => {
  // Orientation individuelle du panneau : Verticale (défaut) ou Horizontale
  const isPanelVertical = orientation === 'vertical';
  const panelWidthDisplay = isPanelVertical
    ? Math.min(panel.panelLength, panel.panelWidth)
    : Math.max(panel.panelLength, panel.panelWidth);
  const panelHeightDisplay = isPanelVertical
    ? Math.max(panel.panelLength, panel.panelWidth)
    : Math.min(panel.panelLength, panel.panelWidth);

  // isSwapped indique si les coordonnées X et Y de l'optimiseur doivent être inversées pour le rendu
  const isSwapped =
    panelWidthDisplay === panel.panelWidth &&
    panel.panelLength !== panel.panelWidth;

  // Marges pour afficher les cotes extérieures du panneau
  const margin = 70;
  const svgWidth = panelWidthDisplay + margin * 2;
  const svgHeight = panelHeightDisplay + margin * 2;

  // Meubles de destination présents sur ce panneau
  const panelCabinets = getDistinctCabinets(panel.placedPieces.map((p) => p.name));
  const isMixedPanel = panelCabinets.length > 1;

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 shadow-inner">
      {/* En-tête obligatoire du panneau : dimensions d'origine, matière, efficacité */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-amber-400 text-sm">
            Panneau N° {panel.panelIndex}
          </span>
          {panel.workshopSourceId ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
              <span>🏭 Chute Stock Atelier</span>
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-medium flex items-center gap-1">
              <span>📦 Stock Saisi</span>
            </span>
          )}
          <span className="text-slate-400">•</span>
          <span className="font-semibold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            {panel.material}
          </span>
          <span className="text-slate-400">•</span>
          <span className="font-mono text-slate-300 font-semibold">
            {panel.panelLength} × {panel.panelWidth} mm ({isPanelVertical ? 'Vertical' : 'Horizontal'} {panelHeightDisplay} × {panelWidthDisplay} mm)
          </span>
          {isMixedPanel ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
              <span>🎯 Meubles partagés : {panelCabinets.join(' + ')}</span>
            </span>
          ) : panelCabinets.length === 1 ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1">
              <span>Meuble : {panelCabinets[0]}</span>
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bouton pour changer l'orientation individuelle de ce panneau */}
          <button
            type="button"
            onClick={onToggleOrientation}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-95 border ${
              isPanelVertical
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-amber-500/60'
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50'
            }`}
            title={`Basculer l'orientation du panneau N° ${panel.panelIndex} en ${
              isPanelVertical ? 'Horizontal (Paysage)' : 'Vertical (Portrait)'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span>{isPanelVertical ? 'Orientation : Verticale' : 'Orientation : Horizontale'}</span>
          </button>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-slate-400">
              Pièces :{' '}
              <strong className="text-white">{panel.placedPieces.length}</strong>
            </span>
            <span className="text-slate-400">
              Rendement :{' '}
              <strong
                className={
                  panel.efficiencyPercentage >= 80
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {panel.efficiencyPercentage}%
              </strong>
            </span>
            <span className="text-slate-400">
              Chutes exploitables :{' '}
              <strong className="text-teal-300">
                {panel.offcuts.filter((o) => o.reusable).length}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Conteneur défilant pour le SVG */}
      <div className="w-full overflow-auto bg-slate-950 rounded-lg p-2 border border-slate-800/80 flex justify-center">
        <div
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
            width: '100%',
            maxWidth: '1200px',
          }}
        >
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto select-none"
            style={{ minHeight: '380px' }}
          >
            <defs>
              {/* Motif hachuré pour chutes réutilisables */}
              <pattern
                id={`hatch-reusable-${patternId}`}
                width="20"
                height="20"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="20"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeOpacity="0.3"
                />
              </pattern>

              {/* Motif pour chutes perdues */}
              <pattern
                id={`hatch-waste-${patternId}`}
                width="15"
                height="15"
                patternTransform="rotate(-45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="15"
                  stroke="#475569"
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                />
              </pattern>
            </defs>

            {/* Groupe décalé par la marge pour les cotes extérieures */}
            <g transform={`translate(${margin}, ${margin})`}>
              {/* 1. Rectangle brut du panneau */}
              <rect
                x="0"
                y="0"
                width={panelWidthDisplay}
                height={panelHeightDisplay}
                fill="#1e293b"
                stroke="#334155"
                strokeWidth="2"
              />

              {/* 2. Dessiner les chutes (offcuts) */}
              {panel.offcuts.map((offcut) => {
                const ox = isSwapped ? offcut.y : offcut.x;
                const oy = isSwapped ? offcut.x : offcut.y;
                const ow = isSwapped ? offcut.width : offcut.length;
                const oh = isSwapped ? offcut.length : offcut.width;

                return (
                  <g
                    key={offcut.id}
                    onMouseEnter={() => setHoveredOffcut(offcut)}
                    onMouseLeave={() => setHoveredOffcut(null)}
                    className="cursor-pointer transition-opacity"
                  >
                    <rect
                      x={ox}
                      y={oy}
                      width={ow}
                      height={oh}
                      fill={
                        offcut.reusable
                          ? `url(#hatch-reusable-${patternId})`
                          : `url(#hatch-waste-${patternId})`
                      }
                      stroke={offcut.reusable ? '#10b981' : '#334155'}
                      strokeWidth={offcut.reusable ? '2' : '1'}
                      strokeDasharray={offcut.reusable ? '6,3' : 'none'}
                      opacity={
                        hoveredOffcut?.id === offcut.id
                          ? 0.9
                          : offcut.reusable
                            ? 0.7
                            : 0.4
                      }
                    />

                    {/* Étiquette sur la chute si dimensions suffisantes */}
                    {ow >= 100 && oh >= 80 && (
                      <text
                        x={ox + ow / 2}
                        y={oy + oh / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={offcut.reusable ? '#34d399' : '#94a3b8'}
                        fontSize={Math.min(
                          32,
                          Math.max(16, ow / 10, oh / 15)
                        )}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {offcut.reusable ? 'STOCK ATELIER' : 'PERTE'}
                        <tspan
                          x={ox + ow / 2}
                          dy="24"
                          fontSize="0.85em"
                          fontWeight="normal"
                        >
                          {Math.round(offcut.length)} × {Math.round(offcut.width)}{' '}
                          mm
                        </tspan>
                      </text>
                    )}
                  </g>
                );
              })}

              {/* 3. Lignes de coupe guillotine avec indication de trait de scie */}
              {panel.cutLines.map((line, idx) => {
                const x1 = isSwapped ? line.y1 : line.x1;
                const y1 = isSwapped ? line.x1 : line.y1;
                const x2 = isSwapped ? line.y2 : line.x2;
                const y2 = isSwapped ? line.x2 : line.y2;

                return (
                  <line
                    key={`cut-${idx}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#fbbf24"
                    strokeWidth={Math.max(1.5, kerf)}
                    strokeDasharray="4,2"
                    opacity="0.8"
                  />
                );
              })}

              {/* 4. Dessiner les pièces placées */}
              {panel.placedPieces.map((piece) => {
                const px = isSwapped ? piece.y : piece.x;
                const py = isSwapped ? piece.x : piece.y;
                const pw = isSwapped ? piece.width : piece.length;
                const ph = isSwapped ? piece.length : piece.width;

                const isHovered = hoveredPiece?.id === piece.id;
                const pieceCabinet = getPieceCabinet(piece.name);
                const piecePart = getPiecePart(piece.name);
                // Dimensions de la pièce sur le plan orienté
                const topDim = Math.round(isSwapped ? piece.width : piece.length);
                const leftDim = Math.round(isSwapped ? piece.length : piece.width);

                // Taille de police pour les cotations
                const fontSizeDim = Math.min(
                  24,
                  Math.max(12, pw / 16, ph / 20)
                );

                return (
                  <g
                    key={piece.id}
                    onMouseEnter={() => setHoveredPiece(piece)}
                    onMouseLeave={() => setHoveredPiece(null)}
                    className="cursor-pointer group"
                  >
                    <title>
                      {pieceCabinet ? `Destination : ${pieceCabinet}\nPièce : ${piecePart}\nDimensions : ${Math.round(piece.length)} × ${Math.round(piece.width)} mm` : `${piece.name} (${Math.round(piece.length)} × ${Math.round(piece.width)} mm)`}
                    </title>
                    {/* Rectangle de la pièce avec teinte très claire (nuance de gris clair à l'impression) */}
                    <rect
                      x={px}
                      y={py}
                      width={pw}
                      height={ph}
                      fill={toLightColorCss(piece.color)}
                      fillOpacity={isHovered ? 1 : 0.9}
                      stroke={isHovered ? '#2563eb' : '#334155'}
                      strokeWidth={isHovered ? '3' : '1.5'}
                      rx="3"
                    />

                    {/* Cotations sur les arêtes haute et gauche, et nom au centre en noir pur pour contraste optimal */}
                    <g className="pointer-events-none select-none">
                      {/* 1. Cote sur l'arête haute (largeur) */}
                      {pw >= 28 && (
                        <text
                          x={px + pw / 2}
                          y={py + fontSizeDim * 1.15}
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize={fontSizeDim}
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {pw >= 55 ? `${topDim} mm` : `${topDim}`}
                        </text>
                      )}

                      {/* 2. Cote sur l'arête gauche (hauteur, verticale) */}
                      {ph >= 28 && (
                        <text
                          x={px + fontSizeDim * 1.15}
                          y={py + ph / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          transform={`rotate(-90, ${px + fontSizeDim * 1.15}, ${py + ph / 2})`}
                          fill="#0f172a"
                          fontSize={fontSizeDim}
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {ph >= 55 ? `${leftDim} mm` : `${leftDim}`}
                        </text>
                      )}

                      {/* 3. Nom de la pièce et destination au centre */}
                      {pw >= 28 && ph >= 28 && (() => {
                        const textToMeasure = isMixedPanel && pieceCabinet
                          ? (piecePart.length > pieceCabinet.length ? piecePart : pieceCabinet)
                          : piece.name;

                        // Estimation de la largeur nécessaire du texte à l'horizontale
                        const tentativeFSize = Math.min(36, Math.max(15, Math.max(pw, ph) / 12));
                        const estimatedHorizWidth = textToMeasure.length * tentativeFSize * 0.58;

                        // Le texte est orienté verticalement lorsque la pièce est plus haute que large
                        // et qu'il ne tient pas confortablement à l'horizontale
                        const isVertical = ph > pw && (
                          estimatedHorizWidth > (pw - 20) ||
                          ph >= pw * 1.3
                        );

                        const effTitleFSize = isVertical
                          ? Math.min(32, Math.max(13, Math.min(ph / 14, pw / 7)))
                          : Math.min(36, Math.max(14, pw / 10, ph / 14));

                        const cx = px + pw / 2;
                        const cy = py + ph / 2;
                        // Marge pour ne pas chevaucher les cotes affichées sur les bords
                            const availLength = Math.max(20, isVertical ? ph - 56 : pw - 56);
                        // Réduction automatique de la police pour afficher le nom complet
                            const fitLen = isMixedPanel && pieceCabinet
                              ? Math.max(pieceCabinet.length + 2, piecePart.length)
                              : piece.name.length;
                            const fitFSize = Math.max(6, Math.min(effTitleFSize, availLength / (Math.max(1, fitLen) * 0.6)));
                            const maxChars = Math.max(5, Math.floor(availLength / (fitFSize * 0.6)));

                        const displayPieceName =
                          piece.name.length > maxChars
                            ? piece.name.substring(0, maxChars) + '…'
                            : piece.name;
                        const displayPieceCabinet = pieceCabinet
                          ? pieceCabinet.length > maxChars
                            ? pieceCabinet.substring(0, maxChars - 1) + '…'
                            : pieceCabinet
                          : '';
                        const displayPiecePart = piecePart
                          ? piecePart.length > maxChars
                            ? piecePart.substring(0, maxChars) + '…'
                            : piecePart
                          : '';

                        const showTwoLines = isMixedPanel && pieceCabinet && (isVertical ? pw >= 45 : ph >= 55);

                        return (
                          <text
                            x={cx}
                            y={cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            transform={isVertical ? `rotate(-90, ${cx}, ${cy})` : undefined}
                            fill="#0f172a"
                            fontSize={fitFSize}
                            fontWeight="bold"
                          >
                            {showTwoLines ? (
                              <>
                                <tspan
                                  x={cx}
                                  dy="-0.6em"
                                  fontSize={Math.max(6, fitFSize * 0.72)}
                                  fill="#312e81"
                                  fontWeight="800"
                                >
                                  [{displayPieceCabinet}]
                                </tspan>
                                <tspan
                                  x={cx}
                                  dy="1.25em"
                                  fontSize={fitFSize}
                                  fill="#0f172a"
                                >
                                  {displayPiecePart}
                                </tspan>
                              </>
                            ) : (
                              displayPieceName
                            )}
                          </text>
                        );
                      })()}
                    </g>
                  </g>
                );
              })}

              {/* Cotations extérieures du panneau (Largeur en haut, Hauteur à gauche) */}
              {/* Flèche Largeur Horizontale (Haut) */}
              <line
                x1="0"
                y1="-22"
                x2={panelWidthDisplay}
                y2="-22"
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <line x1="0" y1="-30" x2="0" y2="-14" stroke="#94a3b8" strokeWidth="2" />
              <line
                x1={panelWidthDisplay}
                y1="-30"
                x2={panelWidthDisplay}
                y2="-14"
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <text
                x={panelWidthDisplay / 2}
                y="-28"
                textAnchor="middle"
                fill="#f1f5f9"
                fontSize="22"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {panelWidthDisplay} mm
              </text>

              {/* Flèche Longueur Verticale (Gauche) */}
              <line
                x1="-22"
                y1="0"
                x2="-22"
                y2={panelHeightDisplay}
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <line x1="-30" y1="0" x2="-14" y2="0" stroke="#94a3b8" strokeWidth="2" />
              <line
                x1="-30"
                y1={panelHeightDisplay}
                x2="-14"
                y2={panelHeightDisplay}
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <text
                x="-28"
                y={panelHeightDisplay / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#f1f5f9"
                fontSize="22"
                fontWeight="bold"
                fontFamily="monospace"
                transform={`rotate(-90, -28, ${panelHeightDisplay / 2})`}
              >
                {panelHeightDisplay} mm
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

