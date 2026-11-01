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

    // 1. En-tête de la page A4
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(marginX, marginTop, contentWidth, 24, 3, 3, 'F');

    // Titre principal
    doc.setTextColor(245, 158, 11); // amber-500
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(
      `PLAN DE COUPE — PANNEAU ${panel.panelIndex} / ${panels.length}`,
      marginX + 6,
      marginTop + 8
    );

    // Projet et matière
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const sourceLabel = panel.workshopSourceId ? 'Chute Atelier' : 'Panneau Stock';
    doc.text(
      `Matière : ${panel.material} (${sourceLabel}) — Format brut : ${panel.panelLength} × ${panel.panelWidth} mm`,
      marginX + 6,
      marginTop + 14.5
    );

    // Métriques (Rendement, trait de scie, nb pièces)
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Rendement : ${panel.efficiencyPercentage}%  |  Trait de scie : ${kerf.toFixed(
        1
      )} mm  |  Pièces : ${panel.placedPieces.length}  |  Chutes atelier : ${
        panel.offcuts.filter((o) => o.reusable).length
      }`,
      marginX + 6,
      marginTop + 20
    );

    // 2. Dimensions du plan de coupe en orientation VERTICALE
    // La plus grande dimension à la verticale, la plus petite à l'horizontale
    const isLandscape = panel.panelLength > panel.panelWidth;
    const panelW = isLandscape ? panel.panelWidth : panel.panelLength; // petite dimension (horizontale)
    const panelH = isLandscape ? panel.panelLength : panel.panelWidth; // grande dimension (verticale)

    const availableAreaY = marginTop + 28;
    const availableAreaHeight = pageHeight - availableAreaY - marginBottom - 12; // hauteur disponible
    const availableAreaWidth = contentWidth - 14; // largeur disponible avec marges pour cotations

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

      // Étiquette & Dimensions
      if (bw >= 10 && bh >= 6) {
        doc.setTextColor(255, 255, 255);
        const fSize = Math.min(8, Math.max(4.5, bw / 6, bh / 6));
        doc.setFontSize(fSize);
        doc.setFont('helvetica', 'bold');

        // Nom de la pièce
        const maxChars = Math.floor(bw / 1.8);
        const displayName =
          piece.name.length > maxChars
            ? piece.name.substring(0, maxChars) + '…'
            : piece.name;
        doc.text(displayName, bx + bw / 2, by + bh / 2 - 1, { align: 'center' });

        // Cotes L × l
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fSize * 0.85);
        doc.text(
          `${piece.length} × ${piece.width}`,
          bx + bw / 2,
          by + bh / 2 + fSize * 0.7,
          { align: 'center' }
        );
      }
    });

    // 6. Cotations extérieures du panneau (Largeur en haut, Hauteur à gauche)
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.3);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    // Cote Horizontale (Largeur en haut)
    doc.line(drawX, drawY - 3, drawX + drawW, drawY - 3);
    doc.line(drawX, drawY - 5, drawX, drawY - 1);
    doc.line(drawX + drawW, drawY - 5, drawX + drawW, drawY - 1);
    doc.text(`${panelW} mm`, drawX + drawW / 2, drawY - 4.5, { align: 'center' });

    // Cote Verticale (Hauteur à gauche)
    doc.line(drawX - 3, drawY, drawX - 3, drawY + drawH);
    doc.line(drawX - 5, drawY, drawX - 1, drawY);
    doc.line(drawX - 5, drawY + drawH, drawX - 1, drawY + drawH);
    doc.text(`${panelH} mm`, drawX - 4.5, drawY + drawH / 2, {
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

