import jsPDF from 'jspdf';
import { PanelResult } from '@/types/cutting';

/**
 * Génère et télécharge un fichier PDF haute résolution (1 panneau par page A4 portrait),
 * avec les panneaux orientés verticalement (plus grande dimension à la verticale, plus petite à l'horizontale).
 */
export function exportCuttingPlansToPdf(
  panels: PanelResult[],
  kerf: number,
  projectName: string = 'Projet Menuiserie'
) {
  if (!panels || panels.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 12;
  const marginTop = 12;
  const marginBottom = 12;
  const contentWidth = pageWidth - marginX * 2; // 186 mm

  panels.forEach((panel, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'portrait');
    }

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
      `Matière : ${panel.material} (${sourceLabel}) — Format brut : ${panel.panelLength} × ${panel.panelWidth} mm`,
      marginX + 5,
      marginTop + 12.5
    );

    // Métriques (Rendement, trait de scie, nb pièces)
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text(
      `Rendement : ${panel.efficiencyPercentage}%  |  Trait de scie : ${kerf.toFixed(
        1
      )} mm  |  Pièces : ${panel.placedPieces.length}  |  Chutes atelier : ${
        panel.offcuts.filter((o) => o.reusable).length
      }`,
      marginX + 5,
      marginTop + 18
    );

    // 2. Dimensions du plan de coupe en orientation VERTICALE
    // La plus grande dimension à la verticale, la plus petite à l'horizontale
    const isLandscape = panel.panelLength > panel.panelWidth;
    const panelW = isLandscape ? panel.panelWidth : panel.panelLength; // petite dimension (horizontale)
    const panelH = isLandscape ? panel.panelLength : panel.panelWidth; // grande dimension (verticale)

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
      const ox = isLandscape ? offcut.y : offcut.x;
      const oy = isLandscape ? offcut.x : offcut.y;
      const ow = isLandscape ? offcut.width : offcut.length;
      const oh = isLandscape ? offcut.length : offcut.width;

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
      const lx1 = drawX + (isLandscape ? line.y1 : line.x1) * scale;
      const ly1 = drawY + (isLandscape ? line.x1 : line.y1) * scale;
      const lx2 = drawX + (isLandscape ? line.y2 : line.x2) * scale;
      const ly2 = drawY + (isLandscape ? line.x2 : line.y2) * scale;
      doc.line(lx1, ly1, lx2, ly2);
    });

    // 5. Pièces placées
    panel.placedPieces.forEach((piece) => {
      const px = isLandscape ? piece.y : piece.x;
      const py = isLandscape ? piece.x : piece.y;
      const pw = isLandscape ? piece.width : piece.length;
      const ph = isLandscape ? piece.length : piece.width;

      const bx = drawX + px * scale;
      const by = drawY + py * scale;
      const bw = pw * scale;
      const bh = ph * scale;

      // Convertir couleur hex de la pièce en RGB
      const hex = (piece.color || '#3b82f6').replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 59;
      const g = parseInt(hex.substring(2, 4), 16) || 130;
      const b = parseInt(hex.substring(4, 6), 16) || 246;

      doc.setFillColor(r, g, b);
      doc.setDrawColor(15, 23, 42); // contour sombre net
      doc.setLineWidth(0.4);
      doc.rect(bx, by, bw, bh, 'FD');

      // Cotations sur les arêtes haute et gauche, et désignation au centre
      const topDim = Math.round(isLandscape ? piece.width : piece.length);
      const leftDim = Math.round(isLandscape ? piece.length : piece.width);

      if (bw >= 7 && bh >= 5) {
        doc.setTextColor(255, 255, 255);
        const dimFSize = Math.min(6.5, Math.max(3.8, bw / 9, bh / 10));
        doc.setFontSize(dimFSize);
        doc.setFont('helvetica', 'bold');

        // 1. Cote sur l'arête haute (largeur de la pièce)
        const topText = bw >= 16 ? `${topDim} mm` : `${topDim}`;
        doc.text(topText, bx + bw / 2, by + dimFSize * 0.9 + 0.6, { align: 'center' });

        // 2. Cote sur l'arête gauche (hauteur de la pièce, orientée à 90°)
        const leftText = bh >= 16 ? `${leftDim} mm` : `${leftDim}`;
        doc.text(leftText, bx + dimFSize * 0.9 + 0.6, by + bh / 2, { align: 'center', angle: 90 });

        // 3. Désignation de la pièce au centre
        if (bw >= 12 && bh >= 9) {
          const titleFSize = Math.min(8.5, Math.max(4.5, bw / 6, bh / 6));
          doc.setFontSize(titleFSize);
          const maxChars = Math.floor(bw / 1.8);
          const displayName =
            piece.name.length > maxChars
              ? piece.name.substring(0, maxChars) + '…'
              : piece.name;
          doc.text(displayName, bx + bw / 2, by + bh / 2 + 1, { align: 'center' });
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

