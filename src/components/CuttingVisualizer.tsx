'use client';

import React, { useState, useId } from 'react';
import { PanelResult, PlacedPiece, OffcutArea } from '@/types/cutting';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Info,
} from 'lucide-react';

interface CuttingVisualizerProps {
  panels: PanelResult[];
  kerf: number;
}

export const CuttingVisualizer: React.FC<CuttingVisualizerProps> = ({
  panels,
  kerf,
}) => {
  const [selectedPanelIdx, setSelectedPanelIdx] = useState(0);
  const [hoveredPiece, setHoveredPiece] = useState<PlacedPiece | null>(null);
  const [hoveredOffcut, setHoveredOffcut] = useState<OffcutArea | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const patternId = useId();

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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-wide">
              Plans de Coupe Graphiques Interactifs
            </h3>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {panels.length} panneau(x) optimisé(s)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
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
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'single'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Vue Panneau
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tous les panneaux
            </button>
          </div>

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
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  selectedPanelIdx === idx
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

interface SinglePanelSVGProps {
  panel: PanelResult;
  kerf: number;
  zoomLevel: number;
  hoveredPiece: PlacedPiece | null;
  setHoveredPiece: (p: PlacedPiece | null) => void;
  hoveredOffcut: OffcutArea | null;
  setHoveredOffcut: (o: OffcutArea | null) => void;
  patternId: string;
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
}) => {
  // Marges pour afficher les cotes extérieures du panneau
  const margin = 80;
  const svgWidth = panel.panelLength + margin * 2;
  const svgHeight = panel.panelWidth + margin * 2;

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 shadow-inner">
      {/* En-tête obligatoire du panneau : dimensions d'origine, matière, efficacité */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-amber-400 text-sm">
            Panneau N° {panel.panelIndex}
          </span>
          <span className="text-slate-400">•</span>
          <span className="font-semibold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            {panel.material}
          </span>
          <span className="text-slate-400">•</span>
          <span className="font-mono text-slate-300 font-semibold">
            {panel.panelLength} × {panel.panelWidth} mm
          </span>
        </div>

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
                width={panel.panelLength}
                height={panel.panelWidth}
                fill="#1e293b"
                stroke="#334155"
                strokeWidth="2"
              />

              {/* 2. Dessiner les chutes (offcuts) */}
              {panel.offcuts.map((offcut) => (
                <g
                  key={offcut.id}
                  onMouseEnter={() => setHoveredOffcut(offcut)}
                  onMouseLeave={() => setHoveredOffcut(null)}
                  className="cursor-pointer transition-opacity"
                >
                  <rect
                    x={offcut.x}
                    y={offcut.y}
                    width={offcut.length}
                    height={offcut.width}
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
                  {offcut.length >= 180 && offcut.width >= 100 && (
                    <text
                      x={offcut.x + offcut.length / 2}
                      y={offcut.y + offcut.width / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={offcut.reusable ? '#34d399' : '#94a3b8'}
                      fontSize={Math.min(
                        36,
                        Math.max(16, offcut.length / 15, offcut.width / 10)
                      )}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {offcut.reusable ? 'STOCK ATELIER' : 'PERTE'}
                      <tspan
                        x={offcut.x + offcut.length / 2}
                        dy="28"
                        fontSize="0.85em"
                        fontWeight="normal"
                      >
                        {Math.round(offcut.length)} × {Math.round(offcut.width)}{' '}
                        mm
                      </tspan>
                    </text>
                  )}
                </g>
              ))}

              {/* 3. Lignes de coupe guillotine avec indication de trait de scie */}
              {panel.cutLines.map((line, idx) => (
                <line
                  key={`cut-${idx}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#fbbf24"
                  strokeWidth={Math.max(1.5, kerf)}
                  strokeDasharray="4,2"
                  opacity="0.8"
                />
              ))}

              {/* 4. Dessiner les pièces placées */}
              {panel.placedPieces.map((piece) => {
                const isHovered = hoveredPiece?.id === piece.id;
                // Calcul taille police proportionnelle
                const fontSizeTitle = Math.min(
                  42,
                  Math.max(16, piece.length / 14, piece.width / 10)
                );
                const fontSizeDims = fontSizeTitle * 0.75;

                return (
                  <g
                    key={piece.id}
                    onMouseEnter={() => setHoveredPiece(piece)}
                    onMouseLeave={() => setHoveredPiece(null)}
                    className="cursor-pointer group"
                  >
                    {/* Rectangle de la pièce */}
                    <rect
                      x={piece.x}
                      y={piece.y}
                      width={piece.length}
                      height={piece.width}
                      fill={piece.color}
                      fillOpacity={isHovered ? 0.95 : 0.75}
                      stroke={isHovered ? '#ffffff' : '#0f172a'}
                      strokeWidth={isHovered ? '4' : '2'}
                      rx="3"
                    />

                    {/* Étiquette & Dimensions centrées */}
                    {piece.length >= 80 && piece.width >= 50 && (
                      <g className="pointer-events-none select-none">
                        {/* Ombre de texte pour lisibilité parfaite */}
                        <text
                          x={piece.x + piece.length / 2}
                          y={piece.y + piece.width / 2 - fontSizeDims * 0.4}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#ffffff"
                          fontSize={fontSizeTitle}
                          fontWeight="bold"
                          filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))"
                        >
                          {piece.name}
                        </text>
                        <text
                          x={piece.x + piece.length / 2}
                          y={piece.y + piece.width / 2 + fontSizeDims * 0.9}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#f8fafc"
                          fontSize={fontSizeDims}
                          fontWeight="600"
                          fontFamily="monospace"
                          filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))"
                        >
                          {piece.length} × {piece.width} mm
                          {piece.rotated && ' (rot)'}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Cotations extérieures du panneau (Largeur et Hauteur totales) */}
              {/* Flèche Longueur (Haut) */}
              <line
                x1="0"
                y1="-25"
                x2={panel.panelLength}
                y2="-25"
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <line x1="0" y1="-35" x2="0" y2="-15" stroke="#94a3b8" strokeWidth="2" />
              <line
                x1={panel.panelLength}
                y1="-35"
                x2={panel.panelLength}
                y2="-15"
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <text
                x={panel.panelLength / 2}
                y="-32"
                textAnchor="middle"
                fill="#f1f5f9"
                fontSize="24"
                fontWeight="bold"
                fontFamily="monospace"
              >
                Longueur Panneau : {panel.panelLength} mm
              </text>

              {/* Flèche Largeur (Gauche) */}
              <line
                x1="-25"
                y1="0"
                x2="-25"
                y2={panel.panelWidth}
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <line x1="-35" y1="0" x2="-15" y2="0" stroke="#94a3b8" strokeWidth="2" />
              <line
                x1="-35"
                y1={panel.panelWidth}
                x2="-15"
                y2={panel.panelWidth}
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <text
                x="-32"
                y={panel.panelWidth / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#f1f5f9"
                fontSize="24"
                fontWeight="bold"
                fontFamily="monospace"
                transform={`rotate(-90, -32, ${panel.panelWidth / 2})`}
              >
                Largeur Panneau : {panel.panelWidth} mm
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

