import {
  CutItem,
  CutSettings,
  OptimizationResult,
  PanelResult,
  PlacedPiece,
  StockPanel,
  OffcutArea,
  CutLine,
} from '@/types/cutting';

interface FreeRectangle {
  x: number;
  y: number;
  length: number; // Axe X
  width: number;  // Axe Y
}

interface PieceToPlace {
  pieceId: string;
  itemId: string;
  name: string;
  material: string;
  length: number;
  width: number;
  canRotate: boolean;
  color: string;
}

const PALETTE = [
  '#3b82f6', // Bleu
  '#10b981', // Vert émeraude
  '#f59e0b', // Ambre / Orange
  '#8b5cf6', // Violet
  '#ec4899', // Rose
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange vif
  '#14b8a6', // Sarcelle
  '#6366f1', // Indigo
];

export function optimizeCutting(
  stockPanels: StockPanel[],
  cutItems: CutItem[],
  settings: CutSettings
): OptimizationResult {
  const { kerf, minOffcutLength, minOffcutWidth } = settings;

  // 1. Regrouper les stocks et les pièces par matière
  const materials = Array.from(
    new Set([
      ...stockPanels.map((p) => p.material.trim()),
      ...cutItems.map((i) => i.material.trim()),
    ])
  ).filter(Boolean);

  const allResultPanels: PanelResult[] = [];
  const unplacedItems: OptimizationResult['unplacedItems'] = [];
  const reusableOffcuts: OptimizationResult['reusableOffcuts'] = [];

  let globalPanelIndex = 1;

  for (const material of materials) {
    // Matériau en cours
    const materialPanels = stockPanels.filter(
      (p) => p.material.trim().toLowerCase() === material.toLowerCase()
    );
    const materialItems = cutItems.filter(
      (i) => i.material.trim().toLowerCase() === material.toLowerCase()
    );

    if (materialItems.length === 0) continue;

    // Développer les pièces unitaires selon leur quantité
    const piecesToPlace: PieceToPlace[] = [];

    materialItems.forEach((item, itemIdx) => {
      const color = item.color || PALETTE[itemIdx % PALETTE.length];
      for (let q = 0; q < item.quantity; q++) {
        piecesToPlace.push({
          pieceId: `${item.id}-${q + 1}`,
          itemId: item.id,
          name: item.name || `Pièce ${itemIdx + 1}`,
          material: item.material,
          length: Math.max(item.length, item.width), // convention : length >= width
          width: Math.min(item.length, item.width),
          canRotate: item.canRotate,
          color,
        });
      }
    });

    // Développer les panneaux disponibles en stock
    const availablePanels: {
      stockId: string;
      length: number;
      width: number;
      material: string;
    }[] = [];

    materialPanels.forEach((sp) => {
      for (let q = 0; q < sp.quantity; q++) {
        availablePanels.push({
          stockId: sp.id,
          length: sp.length,
          width: sp.width,
          material: sp.material,
        });
      }
    });

    // Si pas de stock spécifié pour ce matériau mais des pièces demandées,
    // créer un panneau virtuel aux dimensions standards de menuiserie (ex: 2800x2070 mm)
    const hasOriginalStock = availablePanels.length > 0;
    const defaultLength = 2800;
    const defaultWidth = 2070;

    // Tester plusieurs heuristiques de tri pour trouver la plus compacte
    const sortHeuristics = [
      // 1. Par surface décroissante
      (a: PieceToPlace, b: PieceToPlace) =>
        b.length * b.width - a.length * a.width || b.length - a.length,
      // 2. Par plus grande dimension décroissante
      (a: PieceToPlace, b: PieceToPlace) =>
        b.length - a.length || b.width - a.width,
      // 3. Par périmètre décroissant
      (a: PieceToPlace, b: PieceToPlace) =>
        b.length + b.width - (a.length + a.width),
    ];

    let bestSolution: {
      panels: PanelResult[];
      unplaced: PieceToPlace[];
    } | null = null;

    for (const sortFn of sortHeuristics) {
      const sortedPieces = [...piecesToPlace].sort(sortFn);
      const remainingPieces = [...sortedPieces];
      const panelsResult: PanelResult[] = [];
      const stockQueue = [...availablePanels];

      let currentPanelNum = globalPanelIndex;

      while (remainingPieces.length > 0) {
        let currentStock = stockQueue.shift();

        if (!currentStock) {
          // Si le stock réel est épuisé ou inexistant
          if (hasOriginalStock) {
            // Le stock était spécifié mais insuffisant
            break;
          } else {
            // Créer un panneau standard par défaut
            currentStock = {
              stockId: `default-${currentPanelNum}`,
              length: defaultLength,
              width: defaultWidth,
              material,
            };
          }
        }

        // Tenter de remplir ce panneau avec l'algorithme guillotine
        const packResult = packSinglePanel(
          currentStock,
          remainingPieces,
          kerf,
          minOffcutLength,
          minOffcutWidth,
          currentPanelNum
        );

        if (packResult.placedPieces.length === 0) {
          // Aucune pièce n'a pu rentrer sur ce panneau (trop grand par rapport au panneau)
          break;
        }

        panelsResult.push(packResult);
        currentPanelNum++;

        // Retirer les pièces placées de la liste restante
        const placedIds = new Set(packResult.placedPieces.map((p) => p.id));
        const nextRemaining = remainingPieces.filter(
          (p) => !placedIds.has(p.pieceId)
        );

        // Sécurité anti-boucle infinie
        if (nextRemaining.length === remainingPieces.length) {
          break;
        }

        remainingPieces.length = 0;
        remainingPieces.push(...nextRemaining);
      }

      // Évaluer la solution : moins de pièces non placées, puis moins de panneaux, puis meilleur rendement
      if (
        !bestSolution ||
        remainingPieces.length < bestSolution.unplaced.length ||
        (remainingPieces.length === bestSolution.unplaced.length &&
          panelsResult.length < bestSolution.panels.length) ||
        (remainingPieces.length === bestSolution.unplaced.length &&
          panelsResult.length === bestSolution.panels.length &&
          computeAvgEfficiency(panelsResult) > computeAvgEfficiency(bestSolution.panels))
      ) {
        bestSolution = {
          panels: panelsResult,
          unplaced: remainingPieces,
        };
      }
    }

    if (bestSolution) {
      allResultPanels.push(...bestSolution.panels);
      globalPanelIndex += bestSolution.panels.length;

      // Rassembler les chutes réutilisables
      bestSolution.panels.forEach((p) => {
        p.offcuts
          .filter((o) => o.reusable)
          .forEach((o) => {
            reusableOffcuts.push({
              ...o,
              material: p.material,
              panelIndex: p.panelIndex,
            });
          });
      });

      // Pièces non placées
      if (bestSolution.unplaced.length > 0) {
        // Regrouper par item d'origine
        const unplacedCountMap = new Map<string, number>();
        bestSolution.unplaced.forEach((p) => {
          unplacedCountMap.set(p.itemId, (unplacedCountMap.get(p.itemId) || 0) + 1);
        });

        materialItems.forEach((item) => {
          const count = unplacedCountMap.get(item.id) || 0;
          if (count > 0) {
            const fitsAnyPanel = stockPanels.some(
              (p) =>
                p.material.trim().toLowerCase() === material.toLowerCase() &&
                ((item.length <= p.length && item.width <= p.width) ||
                  (item.canRotate && item.length <= p.width && item.width <= p.length))
            );

            unplacedItems.push({
              item,
              remainingQuantity: count,
              reason: !fitsAnyPanel
                ? `Dimensions (${item.length}x${item.width} mm) supérieures à tous les panneaux en stock`
                : 'Stock de panneaux épuisé',
            });
          }
        });
      }
    }
  }

  // Calcul des statistiques globales
  const totalPanelsUsed = allResultPanels.length;
  const totalStockAvailable = stockPanels.reduce((acc, p) => acc + p.quantity, 0);

  const totalUsedAreaM2 = allResultPanels.reduce(
    (acc, p) => acc + p.usedAreaM2,
    0
  );
  const totalPanelsAreaM2 = allResultPanels.reduce(
    (acc, p) => acc + p.totalAreaM2,
    0
  );
  const totalWasteAreaM2 = totalPanelsAreaM2 - totalUsedAreaM2;

  const overallEfficiencyPercentage =
    totalPanelsAreaM2 > 0
      ? Number(((totalUsedAreaM2 / totalPanelsAreaM2) * 100).toFixed(1))
      : 0;

  // Calcul de la longueur totale de coupe linéaire estimée (en mètres)
  let totalCutMm = 0;
  allResultPanels.forEach((p) => {
    p.cutLines.forEach((cl) => {
      const len = Math.hypot(cl.x2 - cl.x1, cl.y2 - cl.y1);
      totalCutMm += len;
    });
  });
  const totalLinearCutM = Number((totalCutMm / 1000).toFixed(2));

  return {
    panels: allResultPanels,
    unplacedItems,
    totalPanelsUsed,
    totalStockAvailable,
    totalUsedAreaM2: Number(totalUsedAreaM2.toFixed(3)),
    totalPanelsAreaM2: Number(totalPanelsAreaM2.toFixed(3)),
    totalWasteAreaM2: Number(totalWasteAreaM2.toFixed(3)),
    overallEfficiencyPercentage,
    reusableOffcuts,
    totalLinearCutM,
  };
}

function computeAvgEfficiency(panels: PanelResult[]): number {
  if (panels.length === 0) return 0;
  return (
    panels.reduce((sum, p) => sum + p.efficiencyPercentage, 0) / panels.length
  );
}

/**
 * Calepinage d'un seul panneau avec découpes guillotines récursives
 */
function packSinglePanel(
  panel: { stockId: string; length: number; width: number; material: string },
  pieces: PieceToPlace[],
  kerf: number,
  minOffcutLength: number,
  minOffcutWidth: number,
  panelIndex: number
): PanelResult {
  const panelLength = panel.length;
  const panelWidth = panel.width;

  const placedPieces: PlacedPiece[] = [];
  const freeRectangles: FreeRectangle[] = [
    { x: 0, y: 0, length: panelLength, width: panelWidth },
  ];
  const cutLines: CutLine[] = [];

  const piecesAvailable = [...pieces];

  while (piecesAvailable.length > 0 && freeRectangles.length > 0) {
    let bestPieceIdx = -1;
    let bestRectIdx = -1;
    let bestRotated = false;
    let bestScore = Number.MAX_VALUE;

    // Heuristique Best Short Side Fit (BSSF) : choisir le rectangle libre
    // qui laisse le plus petit reste sur le petit côté
    for (let pIdx = 0; pIdx < piecesAvailable.length; pIdx++) {
      const piece = piecesAvailable[pIdx];

      for (let rIdx = 0; rIdx < freeRectangles.length; rIdx++) {
        const rect = freeRectangles[rIdx];

        // 1. Orientation normale (L le long de X, W le long de Y)
        if (piece.length <= rect.length && piece.width <= rect.width) {
          const remX = rect.length - piece.length;
          const remY = rect.width - piece.width;
          const score = Math.min(remX, remY);

          if (score < bestScore) {
            bestScore = score;
            bestPieceIdx = pIdx;
            bestRectIdx = rIdx;
            bestRotated = false;
          }
        }

        // 2. Orientation inversée (si autorisée)
        if (
          piece.canRotate &&
          piece.width <= rect.length &&
          piece.length <= rect.width
        ) {
          const remX = rect.length - piece.width;
          const remY = rect.width - piece.length;
          const score = Math.min(remX, remY);

          if (score < bestScore) {
            bestScore = score;
            bestPieceIdx = pIdx;
            bestRectIdx = rIdx;
            bestRotated = true;
          }
        }
      }
    }

    if (bestPieceIdx === -1 || bestRectIdx === -1) {
      // Plus aucune pièce ne rentre dans les rectangles libres restants
      break;
    }

    const targetPiece = piecesAvailable[bestPieceIdx];
    const targetRect = freeRectangles[bestRectIdx];

    // Enlever la pièce et le rectangle
    piecesAvailable.splice(bestPieceIdx, 1);
    freeRectangles.splice(bestRectIdx, 1);

    const placedLen = bestRotated ? targetPiece.width : targetPiece.length;
    const placedWid = bestRotated ? targetPiece.length : targetPiece.width;

    // Enregistrer la pièce placée
    placedPieces.push({
      id: targetPiece.pieceId,
      itemId: targetPiece.itemId,
      name: targetPiece.name,
      material: targetPiece.material,
      x: targetRect.x,
      y: targetRect.y,
      length: placedLen,
      width: placedWid,
      originalLength: targetPiece.length,
      originalWidth: targetPiece.width,
      rotated: bestRotated,
      color: targetPiece.color,
    });

    // Découpe guillotine du rectangle libre restant avec déduction du trait de scie (kerf)
    const remainingX = targetRect.length - placedLen;
    const remainingY = targetRect.width - placedWid;

    // Tracé des lignes de coupe guillotine
    // Ligne verticale à la fin de la pièce
    cutLines.push({
      x1: targetRect.x + placedLen,
      y1: targetRect.y,
      x2: targetRect.x + placedLen,
      y2: targetRect.y + targetRect.width,
    });
    // Ligne horizontale
    cutLines.push({
      x1: targetRect.x,
      y1: targetRect.y + placedWid,
      x2: targetRect.x + placedLen,
      y2: targetRect.y + placedWid,
    });

    // Décision de découpe guillotine (Maximiser la plus grande aire résiduelle)
    // Option 1: Horizontal split first
    // - Sous-rect 1 (droite de la pièce) : [x + placedLen + kerf, y, remainingX - kerf, placedWid]
    // - Sous-rect 2 (en bas tout le long) : [x, y + placedWid + kerf, targetRect.length, remainingY - kerf]
    // Option 2: Vertical split first
    // - Sous-rect 1 (droite tout le haut) : [x + placedLen + kerf, y, remainingX - kerf, targetRect.width]
    // - Sous-rect 2 (en bas sous la pièce) : [x, y + placedWid + kerf, placedLen, remainingY - kerf]

    const availRightX = remainingX > kerf ? remainingX - kerf : 0;
    const availBottomY = remainingY > kerf ? remainingY - kerf : 0;

    // Heuristique : SLAS (Shorter Axis Split) pour la rigidité et la coupe de menuiserie
    const splitHorizontal = targetRect.length <= targetRect.width;

    if (splitHorizontal) {
      // Split horizontal
      if (availBottomY > 0 && targetRect.length > 0) {
        freeRectangles.push({
          x: targetRect.x,
          y: targetRect.y + placedWid + kerf,
          length: targetRect.length,
          width: availBottomY,
        });
      }
      if (availRightX > 0 && placedWid > 0) {
        freeRectangles.push({
          x: targetRect.x + placedLen + kerf,
          y: targetRect.y,
          length: availRightX,
          width: placedWid,
        });
      }
    } else {
      // Split vertical
      if (availRightX > 0 && targetRect.width > 0) {
        freeRectangles.push({
          x: targetRect.x + placedLen + kerf,
          y: targetRect.y,
          length: availRightX,
          width: targetRect.width,
        });
      }
      if (availBottomY > 0 && placedLen > 0) {
        freeRectangles.push({
          x: targetRect.x,
          y: targetRect.y + placedWid + kerf,
          length: placedLen,
          width: availBottomY,
        });
      }
    }
  }

  // Classifier les chutes résiduelles (offcuts)
  const offcuts: OffcutArea[] = [];
  freeRectangles.forEach((rect, idx) => {
    if (rect.length > 5 && rect.width > 5) { // filtrer poussières < 5mm
      const areaM2 = (rect.length * rect.width) / 1_000_000;
      const reusable =
        (rect.length >= minOffcutLength && rect.width >= minOffcutWidth) ||
        (rect.length >= minOffcutWidth && rect.width >= minOffcutLength);

      offcuts.push({
        id: `offcut-${panelIndex}-${idx}`,
        x: rect.x,
        y: rect.y,
        length: rect.length,
        width: rect.width,
        reusable,
        areaM2: Number(areaM2.toFixed(3)),
      });
    }
  });

  const totalAreaM2 = (panelLength * panelWidth) / 1_000_000;
  const usedAreaM2 = placedPieces.reduce(
    (sum, p) => sum + (p.length * p.width) / 1_000_000,
    0
  );
  const wasteAreaM2 = Math.max(0, totalAreaM2 - usedAreaM2);
  const efficiencyPercentage =
    totalAreaM2 > 0 ? Number(((usedAreaM2 / totalAreaM2) * 100).toFixed(1)) : 0;

  return {
    panelId: panel.stockId,
    panelIndex,
    material: panel.material,
    panelLength,
    panelWidth,
    placedPieces,
    offcuts,
    cutLines,
    usedAreaM2: Number(usedAreaM2.toFixed(3)),
    totalAreaM2: Number(totalAreaM2.toFixed(3)),
    wasteAreaM2: Number(wasteAreaM2.toFixed(3)),
    efficiencyPercentage,
  };
}

