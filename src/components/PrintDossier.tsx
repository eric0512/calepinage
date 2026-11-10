'use client';

import React from 'react';
import { getDistinctCabinets, getPieceCabinet, getPiecePart } from '@/lib/piece-labels';
import { OptimizationResult, CutItem, CutSettings } from '@/types/cutting';

interface PrintDossierProps {
  result: OptimizationResult;
  cutItems: CutItem[];
  settings: CutSettings;
  projectName?: string;
  panelOrientations?: Record<string, 'vertical' | 'horizontal'>;
}

/**
 * Convertit n'importe quelle couleur hexadécimale en teinte très claire (pastel)
 * afin qu'elle apparaisse en nuance de gris clair à l'impression.
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

export const PrintDossier: React.FC<PrintDossierProps> = ({
  result,
  cutItems,
  settings,
  projectName = 'Projet Menuiserie',
  panelOrientations,
}) => {
  return (
    <div className="hidden print:block text-black bg-white p-6 font-sans">
      {/* En-tête Dossier Atelier */}
      <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">
            Fiche de Débit & Plan de Calepinage
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Projet : <strong className="text-black">{projectName}</strong> — Généré par CalepinagePro Menuiserie — {new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="text-right text-xs space-y-0.5">
          <p>
            <strong>Trait de scie (Kerf) :</strong> {settings.kerf.toFixed(1)} mm
          </p>
          {settings.edgeBanding && (
            <p>
              <strong>Bande de champs :</strong> {settings.edgeBanding}
            </p>
          )}
          <p>
            <strong>Panneaux consommés :</strong> {result.totalPanelsUsed}
          </p>
          <p>
            <strong>Rendement global :</strong> {result.overallEfficiencyPercentage} %
          </p>
        </div>
      </div>

      {/* 1. Tableau de débit récapitulatif avec cases à cocher pour l'opérateur */}
      <div className="mb-8">
        <h2 className="text-base font-bold uppercase border-b border-gray-400 pb-1 mb-2">
          1. Liste des Débits (Pointage Atelier)
        </h2>
        <table className="w-full text-left text-xs border border-gray-300">
          <thead className="bg-gray-100 font-bold border-b border-gray-300">
            <tr>
              <th className="p-1.5 w-10 text-center">Fait</th>
              <th className="p-1.5">Désignation</th>
              <th className="p-1.5">Matière</th>
              <th className="p-1.5">Dimensions (L × l mm)</th>
              <th className="p-1.5 text-center">Quantité</th>
              <th className="p-1.5 text-center">Fil du Bois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {cutItems.map((item) => (
              <tr key={item.id}>
                <td className="p-1.5 text-center">
                  <div className="w-4 h-4 border border-black mx-auto" />
                </td>
                <td className="p-1.5 font-semibold">{item.name}</td>
                <td className="p-1.5">{item.material}</td>
                <td className="p-1.5 font-mono">
                  {item.length} × {item.width} mm
                </td>
                <td className="p-1.5 text-center font-bold font-mono">
                  {item.quantity}
                </td>
                <td className="p-1.5 text-center">
                  {item.canRotate ? 'Libre' : 'Sens du fil obligatoire'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2. Plans de coupe pour chaque panneau */}
      <div>
        <h2 className="text-base font-bold uppercase border-b border-gray-400 pb-1 mb-4">
          2. Schémas de Découpe Guillotine par Panneau
        </h2>

        {result.panels.map((panel, idx) => {
          const isPanelVertical =
            (panelOrientations?.[String(panel.panelIndex)] || 'vertical') === 'vertical';
          const panelCabinets = getDistinctCabinets(panel.placedPieces.map((p) => p.name));
          const isMixedPanel = panelCabinets.length > 1;
          const panelW = isPanelVertical
            ? Math.min(panel.panelLength, panel.panelWidth)
            : Math.max(panel.panelLength, panel.panelWidth);
          const panelH = isPanelVertical
            ? Math.max(panel.panelLength, panel.panelWidth)
            : Math.min(panel.panelLength, panel.panelWidth);
          const isSwapped =
            panelW === panel.panelWidth && panel.panelLength !== panel.panelWidth;

          const margin = 40;
          const svgW = panelW + margin * 2;
          const svgH = panelH + margin * 2;

          return (
            <div
              key={panel.panelId + idx}
              className="mb-8 page-break-after border border-gray-300 rounded p-4"
            >
              <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200 text-xs">
                <div>
                  <strong className="text-sm">
                    Panneau {panel.panelIndex} / {result.totalPanelsUsed} :
                  </strong>{' '}
                  <span className="font-semibold">{panel.material}</span> — Format brut :{' '}
                  <span className="font-mono">
                    {panel.panelLength} × {panel.panelWidth} mm ({isPanelVertical ? 'Vertical' : 'Horizontal'} {panelH} × {panelW} mm)
                  </span>
                </div>
                <div className="font-mono">
                  {isMixedPanel && (
                    <span className="mr-3 font-sans font-bold text-indigo-700">
                      🎯 Destinations : {panelCabinets.join(' + ')}
                    </span>
                  )}
                  Rendement : <strong>{panel.efficiencyPercentage}%</strong> | Pièces :{' '}
                  <strong>{panel.placedPieces.length}</strong>
                </div>
              </div>

              {/* Rendu SVG noir & blanc / contours nets pour imprimante */}
              <div className="w-full border border-gray-400 bg-white p-2 flex justify-center">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full h-auto max-h-[220mm]"
                >
                  <g transform={`translate(${margin}, ${margin})`}>
                    {/* Cadre du panneau */}
                    <rect
                      x="0"
                      y="0"
                      width={panelW}
                      height={panelH}
                      fill="#f8fafc"
                      stroke="#000000"
                      strokeWidth="2"
                    />

                    {/* Chutes */}
                    {panel.offcuts.map((offcut) => {
                      const ox = isSwapped ? offcut.y : offcut.x;
                      const oy = isSwapped ? offcut.x : offcut.y;
                      const ow = isSwapped ? offcut.width : offcut.length;
                      const oh = isSwapped ? offcut.length : offcut.width;

                      return (
                        <g key={offcut.id}>
                          <rect
                            x={ox}
                            y={oy}
                            width={ow}
                            height={oh}
                            fill={offcut.reusable ? '#e2e8f0' : '#f1f5f9'}
                            stroke="#64748b"
                            strokeWidth="1"
                            strokeDasharray="4,2"
                          />
                          {ow >= 100 && oh >= 60 && (
                            <text
                              x={ox + ow / 2}
                              y={oy + oh / 2}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#475569"
                              fontSize="20"
                              fontFamily="monospace"
                            >
                              {offcut.reusable ? 'CHUTE' : 'PERTE'} (
                              {Math.round(offcut.length)}×{Math.round(offcut.width)})
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Traits de coupe */}
                    {panel.cutLines.map((line, i) => {
                      const x1 = isSwapped ? line.y1 : line.x1;
                      const y1 = isSwapped ? line.x1 : line.y1;
                      const x2 = isSwapped ? line.y2 : line.x2;
                      const y2 = isSwapped ? line.x2 : line.y2;

                      return (
                        <line
                          key={i}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#000000"
                          strokeWidth="1.5"
                          strokeDasharray="3,3"
                        />
                      );
                    })}

                    {/* Pièces */}
                    {panel.placedPieces.map((piece) => {
                      const px = isSwapped ? piece.y : piece.x;
                      const pieceCabinet = getPieceCabinet(piece.name);
                      const piecePart = getPiecePart(piece.name);
                      const py = isSwapped ? piece.x : piece.y;
                      const pw = isSwapped ? piece.width : piece.length;
                      const ph = isSwapped ? piece.length : piece.width;

                      const topDim = Math.round(isSwapped ? piece.width : piece.length);
                      const leftDim = Math.round(isSwapped ? piece.length : piece.width);

                      // Taille de police pour les cotations
                      const fSizeDim = Math.min(
                        24,
                        Math.max(12, pw / 16, ph / 20)
                      );

                      return (
                        <g key={piece.id}>
                          <rect
                            x={px}
                            y={py}
                            width={pw}
                            height={ph}
                            fill={toLightColorCss(piece.color)}
                            stroke="#000000"
                            strokeWidth="1.5"
                          />

                          {/* 1. Cote sur l'arête haute (largeur) */}
                          {pw >= 28 && (
                            <text
                              x={px + pw / 2}
                              y={py + fSizeDim * 1.15}
                              textAnchor="middle"
                              fill="#000000"
                              fontSize={fSizeDim}
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {pw >= 55 ? `${topDim} mm` : `${topDim}`}
                            </text>
                          )}

                          {/* 2. Cote sur l'arête gauche (hauteur, verticale) */}
                          {ph >= 28 && (
                            <text
                              x={px + fSizeDim * 1.15}
                              y={py + ph / 2}
                              textAnchor="middle"
                              dominantBaseline="central"
                              transform={`rotate(-90, ${px + fSizeDim * 1.15}, ${py + ph / 2})`}
                              fill="#000000"
                              fontSize={fSizeDim}
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
                                fill="#000000"
                                fontSize={fitFSize}
                                fontWeight="bold"
                              >
                                {showTwoLines ? (
                                  <>
                                    <tspan
                                      x={cx}
                                      dy="-0.6em"
                                      fontSize={Math.max(6, fitFSize * 0.75)}
                                      fill="#1e1b4b"
                                      fontWeight="800"
                                    >
                                      [{displayPieceCabinet}]
                                    </tspan>
                                    <tspan
                                      x={cx}
                                      dy="1.25em"
                                      fontSize={fitFSize}
                                      fill="#000000"
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
                      );
                    })}
                  </g>
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

