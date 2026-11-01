'use client';

import React from 'react';
import { OptimizationResult, CutItem, CutSettings } from '@/types/cutting';

interface PrintDossierProps {
  result: OptimizationResult;
  cutItems: CutItem[];
  settings: CutSettings;
}

export const PrintDossier: React.FC<PrintDossierProps> = ({
  result,
  cutItems,
  settings,
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
            Généré par CalepinagePro Menuiserie — {new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="text-right text-xs">
          <p>
            <strong>Trait de scie (Kerf) :</strong> {settings.kerf.toFixed(1)} mm
          </p>
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
          const isLandscape = panel.panelLength > panel.panelWidth;
          const panelW = isLandscape ? panel.panelWidth : panel.panelLength; // petite dimension (horizontale)
          const panelH = isLandscape ? panel.panelLength : panel.panelWidth; // grande dimension (verticale)

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
                    {panel.panelLength} × {panel.panelWidth} mm (Vertical {panelH} × Horizontal {panelW} mm)
                  </span>
                </div>
                <div className="font-mono">
                  Rendement : <strong>{panel.efficiencyPercentage}%</strong> | Pièces :{' '}
                  <strong>{panel.placedPieces.length}</strong>
                </div>
              </div>

              {/* Rendu SVG noir & blanc / contours nets pour imprimante (orienté verticalement) */}
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
                      const ox = isLandscape ? offcut.y : offcut.x;
                      const oy = isLandscape ? offcut.x : offcut.y;
                      const ow = isLandscape ? offcut.width : offcut.length;
                      const oh = isLandscape ? offcut.length : offcut.width;

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
                      const x1 = isLandscape ? line.y1 : line.x1;
                      const y1 = isLandscape ? line.x1 : line.y1;
                      const x2 = isLandscape ? line.y2 : line.x2;
                      const y2 = isLandscape ? line.x2 : line.y2;

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
                      const px = isLandscape ? piece.y : piece.x;
                      const py = isLandscape ? piece.x : piece.y;
                      const pw = isLandscape ? piece.width : piece.length;
                      const ph = isLandscape ? piece.length : piece.width;

                      const fSize = Math.min(
                        36,
                        Math.max(16, pw / 12, ph / 15)
                      );
                      return (
                        <g key={piece.id}>
                          <rect
                            x={px}
                            y={py}
                            width={pw}
                            height={ph}
                            fill="#ffffff"
                            stroke="#000000"
                            strokeWidth="2"
                          />
                          {pw >= 40 && ph >= 40 && (
                            <>
                              <text
                                x={px + pw / 2}
                                y={py + ph / 2 - 8}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#000000"
                                fontSize={fSize}
                                fontWeight="bold"
                              >
                                {piece.name}
                              </text>
                              <text
                                x={px + pw / 2}
                                y={py + ph / 2 + 14}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#000000"
                                fontSize={fSize * 0.75}
                                fontFamily="monospace"
                              >
                                {piece.length} × {piece.width} mm
                              </text>
                            </>
                          )}
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

