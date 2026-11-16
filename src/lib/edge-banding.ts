import { EdgeBandingEdges, PanelResult } from '@/types/cutting';

/**
 * Extrait l'épaisseur numérique (en mm) d'une chaîne de bande de chant (ex: "2mm", "0,8mm", "Sans").
 */
export function parseEdgeBandingThickness(edgeBanding?: string): number {
  if (!edgeBanding) return 0;
  const clean = edgeBanding.trim().toLowerCase();
  if (!clean || clean === 'sans' || clean === '0' || clean === 'aucune') {
    return 0;
  }
  const match = clean.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  return !isNaN(val) && val > 0 ? val : 0;
}

/**
 * Calcule les cotes de coupe brutes (avant placage) à partir des cotes finies,
 * des chants sélectionnés et de l'épaisseur de bande de chant.
 * - `top` / `bottom` (les 2 longueurs) se déduisent de `width`
 * - `left` / `right` (les 2 largeurs) se déduisent de `length`
 */
export function computeCutDimensions(
  length: number,
  width: number,
  edges?: EdgeBandingEdges,
  edgeThickness: number = 0
): {
  finishedLength: number;
  finishedWidth: number;
  cutLength: number;
  cutWidth: number;
  hasDeduction: boolean;
} {
  const finishedLength = Math.max(length, width);
  const finishedWidth = Math.min(length, width);
  const t = edgeThickness > 0 ? edgeThickness : 0;

  const lengthDeduction = ((edges?.left ? 1 : 0) + (edges?.right ? 1 : 0)) * t;
  const widthDeduction = ((edges?.top ? 1 : 0) + (edges?.bottom ? 1 : 0)) * t;

  const cutLength = Math.max(1, Math.round((finishedLength - lengthDeduction) * 10) / 10);
  const cutWidth = Math.max(1, Math.round((finishedWidth - widthDeduction) * 10) / 10);

  return {
    finishedLength,
    finishedWidth,
    cutLength,
    cutWidth,
    hasDeduction: lengthDeduction > 0 || widthDeduction > 0,
  };
}

/**
 * Retourne vrai si au moins un chant est sélectionné.
 */
export function hasAnyEdgeBanding(edges?: EdgeBandingEdges): boolean {
  return Boolean(edges && (edges.top || edges.bottom || edges.left || edges.right));
}

/**
 * Formate de façon concise les chants sélectionnés (ex: "H, B", "4 chants", "H, B, G").
 */
export function formatEdgesLabel(edges?: EdgeBandingEdges): string {
  if (!edges) return '';
  const list: string[] = [];
  if (edges.top) list.push('H');
  if (edges.bottom) list.push('B');
  if (edges.left) list.push('G');
  if (edges.right) list.push('D');
  if (list.length === 0) return '';
  if (list.length === 4) return '4 chants';
  return list.join(', ');
}

/**
 * Transforme les chants de la pièce vers les coordonnées d'affichage SVG du panneau
 * en tenant compte de la rotation éventuelle de la pièce (90°) et de l'inversion X/Y d'affichage du panneau.
 */
export function getDisplayEdges(
  edges?: EdgeBandingEdges,
  pieceRotated?: boolean,
  isSwapped?: boolean
): EdgeBandingEdges {
  if (!edges) return {};

  // 1. Espace pièce locale -> Espace optimiseur (x, y)
  let optTop = !!edges.top;
  let optBottom = !!edges.bottom;
  let optLeft = !!edges.left;
  let optRight = !!edges.right;

  if (pieceRotated) {
    // Rotation 90° horaire : Haut -> Droite, Droite -> Bas, Bas -> Gauche, Gauche -> Haut
    const prevTop = optTop;
    const prevBottom = optBottom;
    const prevLeft = optLeft;
    const prevRight = optRight;
    optTop = prevLeft;
    optRight = prevTop;
    optBottom = prevRight;
    optLeft = prevBottom;
  }

  // 2. Espace optimiseur (x, y) -> Espace SVG (px, py) si le panneau est pivoté (isSwapped)
  if (isSwapped) {
    return {
      top: optLeft,
      bottom: optRight,
      left: optTop,
      right: optBottom,
    };
  }

  return {
    top: optTop,
    bottom: optBottom,
    left: optLeft,
    right: optRight,
  };
}

export interface MaterialEdgeBandingSummary {
  material: string;
  totalMm: number;
  totalMeters: number;
  edgesCount: number;
}

export interface ProjectEdgeBandingSummary {
  totalMm: number;
  totalMeters: number;
  totalEdgesCount: number;
  byMaterial: MaterialEdgeBandingSummary[];
}

/**
 * Calcule la longueur totale de bande de champs nécessaire pour l'ensemble du projet
 * (à partir des pièces placées sur les panneaux du plan de coupe), avec ventilation par matière.
 */
export function computeProjectEdgeBandingLength(
  panels: PanelResult[]
): ProjectEdgeBandingSummary {
  let totalMm = 0;
  let totalEdgesCount = 0;
  const matMap = new Map<string, { totalMm: number; edgesCount: number }>();

  panels.forEach((panel) => {
    panel.placedPieces.forEach((piece) => {
      const edges = piece.edgeBandingEdges;
      if (!edges) return;

      const fLen =
        piece.finishedLength && piece.finishedLength > 0
          ? piece.finishedLength
          : Math.max(piece.originalLength, piece.originalWidth);
      const fWid =
        piece.finishedWidth && piece.finishedWidth > 0
          ? piece.finishedWidth
          : Math.min(piece.originalLength, piece.originalWidth);

      const lenEdges = (edges.top ? 1 : 0) + (edges.bottom ? 1 : 0);
      const widEdges = (edges.left ? 1 : 0) + (edges.right ? 1 : 0);
      const count = lenEdges + widEdges;
      if (count === 0) return;

      const pieceMm = lenEdges * fLen + widEdges * fWid;
      totalMm += pieceMm;
      totalEdgesCount += count;

      const matKey = (piece.material || panel.material || 'Autre').trim();
      const prev = matMap.get(matKey) || { totalMm: 0, edgesCount: 0 };
      matMap.set(matKey, {
        totalMm: prev.totalMm + pieceMm,
        edgesCount: prev.edgesCount + count,
      });
    });
  });

  const byMaterial: MaterialEdgeBandingSummary[] = Array.from(matMap.entries())
    .map(([material, data]) => ({
      material,
      totalMm: Math.round(data.totalMm),
      totalMeters: Math.round((data.totalMm / 1000) * 100) / 100,
      edgesCount: data.edgesCount,
    }))
    .sort((a, b) => b.totalMm - a.totalMm);

  return {
    totalMm: Math.round(totalMm),
    totalMeters: Math.round((totalMm / 1000) * 100) / 100,
    totalEdgesCount,
    byMaterial,
  };
}
