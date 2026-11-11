import { getDistinctCabinets, getPieceCabinet, getPiecePart } from '@/lib/piece-labels';
import jsPDF from 'jspdf';
import { PanelResult } from '@/types/cutting';

/**
 * Convertit n'importe quelle couleur hexadécimale en teinte très claire (mélange à 82% de blanc)
 * pour qu'à l'impression elle apparaisse en nuance de gris clair avec contraste texte optimal.
 */
function toLightColorRgb(hexColor?: string): { r: number; g: number; b: number } {
  const clean = (hexColor || '#3b82f6').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 80;
  const g = parseInt(clean.substring(2, 4), 16) || 140;
  const b = parseInt(clean.substring(4, 6), 16) || 240;

  const lr = Math.round(r * 0.18 + 255 * 0.82);
  const lg = Math.round(g * 0.18 + 255 * 0.82);
  const lb = Math.round(b * 0.18 + 255 * 0.82);

  return { r: lr, g: lg, b: lb };
}

/**
 * Génère et télécharge un fichier PDF haute résolution (1 panneau par page A4),
 * en respectant l'orientation choisie pour chaque panneau individuellement (Portrait ou Paysage).
 */
export function exportCuttingPlansToPdf(
  panels: PanelResult[],
  kerf: number,
  projectName: string = 'Projet Menuiserie',
  panelOrientations?: Record<string, 'vertical' | 'horizontal'>,
  edgeBanding?: string
) {
  if (!panels || panels.length === 0) return;

  const firstPanelKey = String(panels[0]?.panelIndex ?? 1);
  const firstIsVertical =
    (panelOrientations?.[firstPanelKey] || 'vertical') === 'vertical';

  const doc = new jsPDF({
    orientation: firstIsVertical ? 'portrait' : 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  panels.forEach((panel, idx) => {
    const isPanelVertical =
      (panelOrientations?.[String(panel.panelIndex)] || 'vertical') === 'vertical';
    const pageOrientation = isPanelVertical ? 'portrait' : 'landscape';

    if (idx > 0) {
      doc.addPage('a4', pageOrientation);
    }

    const pageWidth = isPanelVertical ? 210 : 297;
    const pageHeight = isPanelVertical ? 297 : 210;
    const marginX = 12;
    const marginTop = 12;
    const marginBottom = 12;
    const contentWidth = pageWidth - marginX * 2;

    // 1. En-tête de la page A4 (Fond blanc avec texte noir pour impression et lisibilité optimale)
    const headerHeight = 22;
    doc.setFillColor(255, 255, 255); // Fond blanc
    doc.setDrawColor(203, 213, 225); // Bordure discrète slate-300
    doc.setLineWidth(0.4);
    doc.roundedRect(marginX, marginTop, contentWidth, headerHeight, 2, 2, 'FD');

    // Titre principal
    doc.setTextColor(0, 0, 0); // Noir
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(
      `PLAN DE COUPE — PANNEAU ${panel.panelIndex} / ${panels.length}`,
      marginX + 5,
      marginTop + 6.5
    );

    // Projet et matière
    doc.setTextColor(30, 41, 59); // Noir / slate-800
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const sourceLabel = panel.workshopSourceId ? 'Chute Atelier' : 'Panneau Stock';
    doc.text(
      `Matière : ${panel.material} (${sourceLabel}) — Format brut : ${panel.panelLength} × ${panel.panelWidth} mm (${isPanelVertical ? 'Vertical' : 'Horizontal'})`,
      marginX + 5,
      marginTop + 12.5
    );

    // Meubles de destination
    const panelCabinets = getDistinctCabinets(panel.placedPieces.map((p) => p.name));
    const isMixedPanel = panelCabinets.length > 1;
    const destInfo = isMixedPanel
      ? `  |  Destinations : ${panelCabinets.join(' + ')}`
      : panelCabinets.length === 1
        ? `  |  Meuble : ${panelCabinets[0]}`
        : '';

    // Métriques (Rendement, trait de scie, bande de champs, nb pièces, destinations)
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105); // slate-600
    const edgeBandStr = edgeBanding ? `  |  Bande de champs : ${edgeBanding}` : '';
    doc.text(
      `Rendement : ${panel.efficiencyPercentage}%  |  Trait de scie : ${kerf.toFixed(
        1
      )} mm${edgeBandStr}  |  Pièces : ${panel.placedPieces.length}${destInfo}`,
      marginX + 5,
      marginTop + 18
    );

    // 2. Dimensions du plan de coupe selon l'orientation individuelle choisie
    const panelW = isPanelVertical
      ? Math.min(panel.panelLength, panel.panelWidth)
      : Math.max(panel.panelLength, panel.panelWidth);
    const panelH = isPanelVertical
      ? Math.max(panel.panelLength, panel.panelWidth)
      : Math.min(panel.panelLength, panel.panelWidth);
    const isSwapped =
      panelW === panel.panelWidth && panel.panelLength !== panel.panelWidth;

    // Dégagement garanti : réserve 14 mm au-dessus du panneau pour la cote supérieure
    const topDimensionMargin = 14;
    const availableAreaY = marginTop + headerHeight + topDimensionMargin;
    const availableAreaHeight = pageHeight - availableAreaY - marginBottom - 12; // hauteur disponible
    const availableAreaWidth = contentWidth - 14; // largeur disponible avec marge pour cote gauche

    // Échelle proportionnelle
    const scale = Math.min(
      availableAreaWidth / panelW,
      availableAreaHeight / panelH
    );
    const drawW = panelW * scale;
    const drawH = panelH * scale;

    // Centrage du panneau
    const drawX = marginX + 10 + (availableAreaWidth - drawW) / 2;
    const drawY = availableAreaY + (availableAreaHeight - drawH) / 2;

    // Fond du panneau brut
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(30, 41, 59); // slate-800
    doc.setLineWidth(0.6);
    doc.rect(drawX, drawY, drawW, drawH, 'FD');

    // 3. Chutes (Offcuts)
    panel.offcuts.forEach((offcut) => {
      const ox = isSwapped ? offcut.y : offcut.x;
      const oy = isSwapped ? offcut.x : offcut.y;
      const ow = isSwapped ? offcut.width : offcut.length;
      const oh = isSwapped ? offcut.length : offcut.width;

      const bx = drawX + ox * scale;
      const by = drawY + oy * scale;
      const bw = ow * scale;
      const bh = oh * scale;

      if (offcut.reusable) {
        doc.setFillColor(209, 250, 229); // emerald-100
        doc.setDrawColor(16, 185, 129); // emerald-500
        doc.setLineWidth(0.4);
      } else {
        doc.setFillColor(241, 245, 249); // slate-100
        doc.setDrawColor(148, 163, 184); // slate-400
        doc.setLineWidth(0.2);
      }
      doc.rect(bx, by, bw, bh, 'FD');

      // Étiquette chute
      if (bw >= 16 && bh >= 8) {
        doc.setFontSize(Math.min(7, Math.max(4.5, bw / 6)));
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(
          offcut.reusable ? 5 : 100,
          offcut.reusable ? 120 : 116,
          offcut.reusable ? 85 : 139
        );
        doc.text(
          offcut.reusable ? 'CHUTE ATELIER' : 'PERTE',
          bx + bw / 2,
          by + bh / 2 - 1,
          { align: 'center' }
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(Math.min(6, Math.max(4, bw / 7)));
        doc.text(
          `${Math.round(offcut.length)}×${Math.round(offcut.width)}`,
          bx + bw / 2,
          by + bh / 2 + 2.5,
          { align: 'center' }
        );
      }
    });

    // 4. Lignes de coupe guillotine
    doc.setDrawColor(217, 119, 6); // amber-600
    doc.setLineWidth(0.35);
    panel.cutLines.forEach((line) => {
      const lx1 = drawX + (isSwapped ? line.y1 : line.x1) * scale;
      const ly1 = drawY + (isSwapped ? line.x1 : line.y1) * scale;
      const lx2 = drawX + (isSwapped ? line.y2 : line.x2) * scale;
      const ly2 = drawY + (isSwapped ? line.x2 : line.y2) * scale;
      doc.line(lx1, ly1, lx2, ly2);
    });

    // 5. Pièces placées
    panel.placedPieces.forEach((piece) => {
      const px = isSwapped ? piece.y : piece.x;
      const py = isSwapped ? piece.x : piece.y;
      const pw = isSwapped ? piece.width : piece.length;
      const ph = isSwapped ? piece.length : piece.width;

      const bx = drawX + px * scale;
      const by = drawY + py * scale;
      const bw = pw * scale;
      const bh = ph * scale;

      // Convertir couleur hex de la pièce en nuance très claire (nuances de gris clair à l'impression)
      const { r, g, b } = toLightColorRgb(piece.color);

      doc.setFillColor(r, g, b);
      doc.setDrawColor(30, 41, 59); // contour sombre net
      doc.setLineWidth(0.35);
      doc.rect(bx, by, bw, bh, 'FD');

      // Cotations sur les arêtes haute et gauche, et désignation au centre
      const topDim = Math.round(isSwapped ? piece.width : piece.length);
      const leftDim = Math.round(isSwapped ? piece.length : piece.width);

      if (bw >= 7 && bh >= 5) {
        // TEXTE EN NOIR PUR POUR LISIBILITÉ MAXIMALE SUR COULEURS TRÈS CLAIRES
        doc.setTextColor(0, 0, 0);
        const dimFSize = Math.min(6.5, Math.max(3.8, bw / 9, bh / 10));
        doc.setFontSize(dimFSize);
        doc.setFont('helvetica', 'bold');

        // 1. Cote sur l'arête haute (largeur de la pièce)
        const topText = bw >= 16 ? `${topDim} mm` : `${topDim}`;
        doc.text(topText, bx + bw / 2, by + dimFSize * 0.9 + 0.6, { align: 'center' });

        // 2. Cote sur l'arête gauche (hauteur de la pièce, orientée à 90°)
        const leftText = bh >= 16 ? `${leftDim} mm` : `${leftDim}`;
        doc.text(leftText, bx + dimFSize * 0.9 + 0.6, by + bh / 2, { align: 'center', angle: 90 });

        // 3. Désignation et meuble de destination au centre
        const pieceCabinet = getPieceCabinet(piece.name);
        const piecePart = getPiecePart(piece.name);

        if (bw >= 7 && bh >= 7) {
          // Déterminer si le texte doit être orienté verticalement
          // (lorsque la pièce est plus haute que large et que le texte ne tient pas à l'horizontale)
          const textToMeasure = isMixedPanel && pieceCabinet
            ? (piecePart.length > pieceCabinet.length ? piecePart : pieceCabinet)
            : piece.name;
          const tentativeFSize = Math.min(8.5, Math.max(4.0, Math.max(bw, bh) / 7));
          doc.setFontSize(tentativeFSize);
          const textWidthHorizontal = doc.getTextWidth(textToMeasure);
          const isVertical = bh > bw && (
            textWidthHorizontal > (bw - 3) ||
            bh >= bw * 1.3
          );

          let titleFSize = isVertical
            ? Math.min(8.5, Math.max(4.0, Math.min(bh / 6, bw / 5)))
            : Math.min(8.5, Math.max(4.0, bw / 6, bh / 6));

          // Espace disponible dans la direction du texte (marge pour les cotes affichées sur les bords)
          const dimMargin = dimFSize * 0.353 + 1.6;
          const availLength = Math.max(4, (isVertical ? bh : bw) - 2 * dimMargin);

          // Réduction automatique de la police pour que le nom complet tienne dans la pièce
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(titleFSize);
          const hasCabLine = isMixedPanel && !!pieceCabinet;
          const longestW = Math.max(
            doc.getTextWidth(hasCabLine ? piecePart : piece.name),
            hasCabLine ? doc.getTextWidth(`[${pieceCabinet}]`) * 0.78 : 0
          );
          if (longestW > availLength) {
            titleFSize = Math.max(2.8, titleFSize * (availLength / longestW));
          }
          doc.setFontSize(titleFSize);
          const avgCharW =
            doc.getTextWidth(textToMeasure) / Math.max(1, textToMeasure.length) || titleFSize * 0.2;
          const maxChars = Math.max(4, Math.floor(availLength / avgCharW));

          if (isVertical) {
            // Rendu vertical (angle 90°)
            if (isMixedPanel && pieceCabinet && bw >= 12) {
              const cabFSize = Math.max(2.5, titleFSize * 0.78);
              doc.setFontSize(cabFSize);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(49, 46, 129); // Indigo foncé lisible
              const displayCab = `[${pieceCabinet.length > maxChars ? pieceCabinet.substring(0, maxChars - 1) + '…' : pieceCabinet}]`;
              doc.text(displayCab, bx + bw / 2 - 1.4, by + bh / 2, { align: 'center', angle: 90 });

              doc.setFontSize(titleFSize);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(0, 0, 0); // Noir pur
              const displayPart =
                piecePart.length > maxChars
                  ? piecePart.substring(0, maxChars) + '…'
                  : piecePart;
              doc.text(displayPart, bx + bw / 2 + 1.8, by + bh / 2, { align: 'center', angle: 90 });
            } else {
              doc.setFontSize(titleFSize);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(0, 0, 0);
              const displayName =
                piece.name.length > maxChars
                  ? piece.name.substring(0, maxChars) + '…'
                  : piece.name;
              doc.text(displayName, bx + bw / 2, by + bh / 2, { align: 'center', angle: 90 });
            }
          } else {
            // Rendu horizontal classique
            if (isMixedPanel && pieceCabinet && bh >= 14) {
              const cabFSize = Math.max(2.5, titleFSize * 0.78);
              doc.setFontSize(cabFSize);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(49, 46, 129); // Indigo foncé lisible
              const displayCab = `[${pieceCabinet.length > maxChars ? pieceCabinet.substring(0, maxChars - 1) + '…' : pieceCabinet}]`;
              doc.text(displayCab, bx + bw / 2, by + bh / 2 - 1.2, { align: 'center' });

              doc.setFontSize(titleFSize);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(0, 0, 0); // Noir pur
              const displayPart =
                piecePart.length > maxChars
                  ? piecePart.substring(0, maxChars) + '…'
                  : piecePart;
              doc.text(displayPart, bx + bw / 2, by + bh / 2 + 2.5, { align: 'center' });
            } else {
              doc.setFontSize(titleFSize);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(0, 0, 0);
              const displayName =
                piece.name.length > maxChars
                  ? piece.name.substring(0, maxChars) + '…'
                  : piece.name;
              doc.text(displayName, bx + bw / 2, by + bh / 2 + 1, { align: 'center' });
            }
          }
        }
      }
    });

    // 6. Cotations extérieures du panneau (Largeur en haut, Hauteur à gauche)
    doc.setDrawColor(15, 23, 42); // Noir net
    doc.setLineWidth(0.35);
    doc.setTextColor(0, 0, 0); // Noir pur
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    // Cote Horizontale (Largeur en haut, parfaitement dégagée du bandeau blanc)
    doc.line(drawX, drawY - 4, drawX + drawW, drawY - 4);
    doc.line(drawX, drawY - 6.5, drawX, drawY - 1.5);
    doc.line(drawX + drawW, drawY - 6.5, drawX + drawW, drawY - 1.5);
    doc.text(`${panelW} mm`, drawX + drawW / 2, drawY - 6, { align: 'center' });

    // Cote Verticale (Hauteur à gauche)
    doc.line(drawX - 4, drawY, drawX - 4, drawY + drawH);
    doc.line(drawX - 6.5, drawY, drawX - 1.5, drawY);
    doc.line(drawX - 6.5, drawY + drawH, drawX - 1.5, drawY + drawH);
    doc.text(`${panelH} mm`, drawX - 6, drawY + drawH / 2, {
      align: 'center',
      angle: 90,
    });

    // 7. Pied de page A4 avec légende
    const footerY = pageHeight - marginBottom;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Calepinage Menuiserie — ${projectName} — ${new Date().toLocaleDateString(
        'fr-FR'
      )}`,
      marginX,
      footerY
    );
    doc.text(
      `Page ${idx + 1} / ${panels.length}`,
      pageWidth - marginX,
      footerY,
      { align: 'right' }
    );
  });

  // Téléchargement immédiat du PDF
  const cleanName = (projectName || 'plans-de-coupe')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  doc.save(`${cleanName}_plans_de_coupe.pdf`);
}

/**
 * Génère et télécharge un fichier PDF d'étiquettes au format A4 Portrait :
 * Grille de 3 colonnes × 7 lignes = 21 étiquettes par page (dimensions : 70 × 36 mm).
 * Chaque étiquette indique :
 * - Panneau n° X
 * - Nom du panneau (pièce débitée)
 * - Destination (meuble / caisson)
 * - Dimensions (L × l en mm)
 */
export function exportLabelsToPdf(
  panels: PanelResult[],
  projectName: string = 'Projet Menuiserie'
) {
  if (!panels || panels.length === 0) return;

  interface LabelItem {
    panelNumber: number;
    material: string;
    panelName: string;
    destination: string;
    dimensions: string;
  }

  const labels: LabelItem[] = [];

  panels.forEach((panel) => {
    if (panel.placedPieces && panel.placedPieces.length > 0) {
      panel.placedPieces.forEach((piece) => {
        const cab = getPieceCabinet(piece.name);
        const part = getPiecePart(piece.name);
        const len = Math.round(piece.originalLength || piece.length);
        const wid = Math.round(piece.originalWidth || piece.width);

        labels.push({
          panelNumber: panel.panelIndex,
          material: piece.material || panel.material || '',
          panelName: part || piece.name || 'Panneau',
          destination: cab || projectName || 'Pièces diverses',
          dimensions: `${len} × ${wid} mm`,
        });
      });
    } else {
      labels.push({
        panelNumber: panel.panelIndex,
        material: panel.material || '',
        panelName: panel.panelName || `Panneau ${panel.panelIndex}`,
        destination: projectName || 'Atelier',
        dimensions: `${Math.round(panel.panelLength)} × ${Math.round(panel.panelWidth)} mm`,
      });
    }
  });

  if (labels.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Planche A4 (210 × 297 mm) : 3 étiquettes en largeur (3 × 70 = 210 mm) sur 7 en hauteur (7 × 36 = 252 mm)
  const cols = 3;
  const rows = 7;
  const labelsPerPage = cols * rows; // 21 étiquettes par page A4
  const labelW = 70;
  const labelH = 36;
  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = (pageWidth - cols * labelW) / 2; // 0 mm
  const marginY = (pageHeight - rows * labelH) / 2; // 22.5 mm

  // Ajuste automatiquement la taille de police pour qu'un texte tienne dans maxW (en mm)
  const drawFittedText = (
    text: string,
    x: number,
    y: number,
    maxW: number,
    initialFontSize: number,
    minFontSize: number = 6
  ) => {
    let fSize = initialFontSize;
    doc.setFontSize(fSize);
    while (doc.getTextWidth(text) > maxW && fSize > minFontSize) {
      fSize -= 0.4;
      doc.setFontSize(fSize);
    }
    let finalStr = text;
    if (doc.getTextWidth(finalStr) > maxW) {
      while (finalStr.length > 3 && doc.getTextWidth(finalStr + '…') > maxW) {
        finalStr = finalStr.slice(0, -1);
      }
      finalStr += '…';
    }
    doc.text(finalStr, x, y);
  };

  labels.forEach((item, index) => {
    const idxOnPage = index % labelsPerPage;
    if (index > 0 && idxOnPage === 0) {
      doc.addPage('a4', 'portrait');
    }

    const col = idxOnPage % cols;
    const row = Math.floor(idxOnPage / cols);

    const x = marginX + col * labelW;
    const y = marginY + row * labelH;

    // Cadre de découpe / repère de l'étiquette (70 × 36 mm)
    doc.setDrawColor(203, 213, 225); // Gris clair
    doc.setLineWidth(0.2);
    doc.rect(x, y, labelW, labelH, 'S');

    // Marge interne de sécurité (4.5 mm à gauche/droite pour compatibilité imprimantes)
    const padX = 4.5;
    const maxTextW = labelW - padX * 2; // 61 mm utiles

    // Bandeau supérieur : Panneau n° X (et matière à droite)
    doc.setFillColor(241, 245, 249);
    doc.rect(x + 2, y + 2, labelW - 4, 6.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Panneau n° ${item.panelNumber}`, x + padX, y + 6.6);

    if (item.material) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      let matStr = item.material;
      const maxMatW = maxTextW - 26;
      while (matStr.length > 3 && doc.getTextWidth(matStr) > maxMatW) {
        matStr = matStr.slice(0, -1);
      }
      doc.text(matStr, x + labelW - padX, y + 6.5, { align: 'right' });
    }

    // Ligne de séparation sous l'en-tête
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(x + 2, y + 9, x + labelW - 2, y + 9);

    // 2. Nom du panneau (pièce)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    drawFittedText(
      `Nom du panneau : ${item.panelName}`,
      x + padX,
      y + 15.5,
      maxTextW,
      8.5,
      6
    );

    // 3. Destination (nom du caisson / meuble)
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    drawFittedText(
      `Destination : ${item.destination}`,
      x + padX,
      y + 22.5,
      maxTextW,
      8.2,
      6
    );

    // 4. Dimensions
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    drawFittedText(
      `Dimensions : ${item.dimensions}`,
      x + padX,
      y + 30,
      maxTextW,
      9,
      6.5
    );
  });

  const cleanName = (projectName || 'etiquettes')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  doc.save(`${cleanName}_etiquettes_70x36mm.pdf`);
}


