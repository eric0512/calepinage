import { CutItem } from '@/types/cutting';

export type AssemblyType = 'sides_full' | 'top_bottom_full';
export type BackType = 'none' | 'applique' | 'groove';
export type DoorsType = 'none' | 'one_door' | 'two_doors';

export interface CabinetConfig {
  name: string;
  height: number; // Hauteur extérieure (mm)
  width: number; // Largeur extérieure (mm)
  depth: number; // Profondeur extérieure (mm)
  thickness: number; // Épaisseur des panneaux principaux (mm, ex: 18 ou 19)
  assemblyType: AssemblyType; // 'sides_full' (haut/bas à l'intérieur) ou 'top_bottom_full' (côtés à l'intérieur)
  backType: BackType; // Fond : aucun, applique arrière, ou en rainure
  backThickness: number; // Épaisseur du fond (mm, ex: 8 ou 10)
  shelvesCount: number; // Nombre d'étagères
  shelfRecess: number; // Retrait de l'étagère par rapport à la façade (mm, ex: 20)
  partitionsCount: number; // Séparations verticales (0 ou 1)
  doors: DoorsType; // Portes en applique
  material: string; // Matière principale
  backMaterial?: string; // Matière du fond
  doorMaterial?: string; // Matière des portes
  cabinetCount?: number; // Nombre de caissons identiques à fabriquer
}

export interface CabinetPieceCalculation {
  role: string;
  description: string;
  formula: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  color: string;
}

export interface CalculatedCabinet {
  config: CabinetConfig;
  pieces: CabinetPieceCalculation[];
  cutItems: CutItem[];
  interiorDimensions: {
    height: number;
    width: number;
    depth: number;
  };
}

const PIECE_COLORS = {
  sides: '#dbeafe', // Bleu très clair (pastel)
  topBottom: '#dcfce7', // Vert très clair (pastel)
  shelf: '#fef3c7', // Ambre / Jaune très clair (pastel)
  partition: '#f3e8ff', // Violet très clair (pastel)
  back: '#fce7f3', // Rose très clair (pastel)
  door: '#cffafe', // Cyan très clair (pastel)
};

/**
 * Calcule avec rigueur mathématique toutes les pièces à débiter pour un caisson.
 */
export function calculateCabinetPieces(config: CabinetConfig): CalculatedCabinet {
  const {
    height,
    width,
    depth,
    thickness,
    assemblyType,
    backType,
    backThickness,
    shelvesCount,
    shelfRecess,
    partitionsCount,
    doors,
    material,
    backMaterial,
    doorMaterial = material,
    cabinetCount: rawCabinetCount = 1,
  } = config;

  const cabinetCount = Math.max(1, rawCabinetCount || 1);

  // Résolution stricte de la matière du fond pour éviter qu'il ne soit débité sur le panneau 18mm !
  let resolvedBackMaterial = backMaterial?.trim();
  if (!resolvedBackMaterial) {
    if (backThickness && backThickness !== thickness) {
      // Déduire le nom de base sans l'épaisseur du caisson (ex: "MDF 18mm" -> base "MDF" -> "MDF 8mm")
      const base = material.replace(/\s*\d{1,2}\s*mm/i, '').trim();
      resolvedBackMaterial = `${base || 'MDF'} ${backThickness}mm`;
    } else {
      resolvedBackMaterial = material;
    }
  }

  const pieces: CabinetPieceCalculation[] = [];

  // Profondeur utile pour les pièces de structure (si fond en applique, le fond vient en plus ou en retrait)
  const structuralDepth = depth;

  // 1. Côtés (Montants gauche et droit)
  let sideHeight = height;
  let sideFormula = `${height} mm (Pleine hauteur extérieure)`;

  if (assemblyType === 'top_bottom_full') {
    sideHeight = height - 2 * thickness;
    sideFormula = `${height} - (2 × ${thickness}) = ${sideHeight} mm (Côtés intérieurs)`;
  }

  const sidesQty = 2 * cabinetCount;
  pieces.push({
    role: cabinetCount > 1 ? `Côtés (${sidesQty} pcs pour ${cabinetCount} caissons)` : 'Côtés (Gauche & Droit)',
    description: `${config.name} - Côtés`,
    formula: cabinetCount > 1 ? `${sideFormula} (2 × ${cabinetCount} = ${sidesQty} pcs)` : sideFormula,
    length: Math.max(sideHeight, structuralDepth),
    width: Math.min(sideHeight, structuralDepth),
    quantity: sidesQty,
    material,
    color: PIECE_COLORS.sides,
  });

  // 2. Haut et Bas (Dessus et Dessous)
  let topBottomWidth = width;
  let topBottomFormula = `${width} mm (Pleine largeur extérieure)`;

  if (assemblyType === 'sides_full') {
    topBottomWidth = width - 2 * thickness;
    topBottomFormula = `${width} - (2 × ${thickness}) = ${topBottomWidth} mm (Haut/Bas intérieurs)`;
  }

  const topBottomQty = 2 * cabinetCount;
  pieces.push({
    role: cabinetCount > 1 ? `Haut & Bas (${topBottomQty} pcs pour ${cabinetCount} caissons)` : 'Haut & Bas (Dessus & Dessous)',
    description: `${config.name} - Dessus / Dessous`,
    formula: cabinetCount > 1 ? `${topBottomFormula} (2 × ${cabinetCount} = ${topBottomQty} pcs)` : topBottomFormula,
    length: Math.max(topBottomWidth, structuralDepth),
    width: Math.min(topBottomWidth, structuralDepth),
    quantity: topBottomQty,
    material,
    color: PIECE_COLORS.topBottom,
  });

  // Dimensions intérieures brutes
  const interiorWidth = width - 2 * thickness;
  const interiorHeight = height - 2 * thickness;
  const interiorDepth = backType === 'applique' ? depth : depth - backThickness;

  // 3. Séparation verticale (Montant central intermédiaire)
  if (partitionsCount > 0) {
    const partitionHeight = interiorHeight;
    const partitionFormula = `Hauteur intérieure : ${height} - (2 × ${thickness}) = ${partitionHeight} mm`;
    const partitionQty = partitionsCount * cabinetCount;

    pieces.push({
      role: 'Séparation verticale',
      description: `${config.name} - Séparation centrale`,
      formula: cabinetCount > 1 ? `${partitionFormula} (${partitionsCount} × ${cabinetCount} = ${partitionQty} pcs)` : partitionFormula,
      length: Math.max(partitionHeight, structuralDepth),
      width: Math.min(partitionHeight, structuralDepth),
      quantity: partitionQty,
      material,
      color: PIECE_COLORS.partition,
    });
  }

  // 4. Étagères intérieures
  if (shelvesCount > 0) {
    let shelfWidth = interiorWidth;
    let shelfFormula = `Largeur intérieure : ${width} - (2 × ${thickness}) = ${shelfWidth} mm`;

    if (partitionsCount > 0) {
      // Étagère divisée par le montant intermédiaire
      shelfWidth = Math.floor((interiorWidth - partitionsCount * thickness) / (partitionsCount + 1));
      shelfFormula = `Compartiment : (${interiorWidth} - ${thickness}) / 2 = ${shelfWidth} mm`;
    }

    const shelfDepth = Math.max(50, structuralDepth - shelfRecess);
    const shelvesPerCabinet = partitionsCount > 0 ? shelvesCount * (partitionsCount + 1) : shelvesCount;
    const totalShelvesQty = shelvesPerCabinet * cabinetCount;

    pieces.push({
      role: `Étagère(s) [Retrait ${shelfRecess} mm]`,
      description: `${config.name} - Étagère`,
      formula: cabinetCount > 1
        ? `${shelfFormula} × Profondeur (${structuralDepth} - ${shelfRecess} = ${shelfDepth} mm) [${shelvesPerCabinet} × ${cabinetCount} = ${totalShelvesQty} pcs]`
        : `${shelfFormula} × Profondeur (${structuralDepth} - ${shelfRecess} = ${shelfDepth} mm)`,
      length: Math.max(shelfWidth, shelfDepth),
      width: Math.min(shelfWidth, shelfDepth),
      quantity: totalShelvesQty,
      material,
      color: PIECE_COLORS.shelf,
    });
  }

  // 5. Fond du caisson
  const backQty = 1 * cabinetCount;
  if (backType === 'applique') {
    // Fond cloué ou vissé en applique à l'arrière
    pieces.push({
      role: `Fond (applique arrière) [${resolvedBackMaterial}]`,
      description: `${config.name} - Fond applique`,
      formula: cabinetCount > 1
        ? `Pleine cote extérieure arrière : ${height} × ${width} mm (Ép. ${backThickness} mm) [1 × ${cabinetCount} = ${backQty} pcs]`
        : `Pleine cote extérieure arrière : ${height} × ${width} mm (Ép. ${backThickness} mm - Matière : ${resolvedBackMaterial})`,
      length: Math.max(height, width),
      width: Math.min(height, width),
      quantity: backQty,
      material: resolvedBackMaterial,
      color: PIECE_COLORS.back,
    });
  } else if (backType === 'groove') {
    // Fond dans une rainure (profondeur de rainure typique : 8 mm par côté)
    const grooveDepth = 8;
    const backH = interiorHeight + 2 * grooveDepth;
    const backW = interiorWidth + 2 * grooveDepth;

    pieces.push({
      role: `Fond (rainure encastrée) [${resolvedBackMaterial}]`,
      description: `${config.name} - Fond rainure`,
      formula: cabinetCount > 1
        ? `Rainure (+2×${grooveDepth}mm) : ${backH} × ${backW} mm (Ép. ${backThickness} mm) [1 × ${cabinetCount} = ${backQty} pcs]`
        : `Rainure (+2×${grooveDepth}mm) : ${backH} × ${backW} mm (Ép. ${backThickness} mm - Matière : ${resolvedBackMaterial})`,
      length: Math.max(backH, backW),
      width: Math.min(backH, backW),
      quantity: backQty,
      material: resolvedBackMaterial,
      color: PIECE_COLORS.back,
    });
  }

  // 6. Portes battantes en applique (avec jeu périphérique de 2 mm de chaque côté)
  if (doors === 'one_door') {
    const doorH = height - 4; // 2mm en haut, 2mm en bas
    const doorW = width - 4; // 2mm à gauche, 2mm à droite
    const doorQty = 1 * cabinetCount;
    pieces.push({
      role: 'Porte battante simple (Jeu 2 mm)',
      description: `${config.name} - Porte`,
      formula: cabinetCount > 1
        ? `Applique (${height} - 4mm) × (${width} - 4mm) [1 × ${cabinetCount} = ${doorQty} pcs]`
        : `Applique (${height} - 4mm) × (${width} - 4mm)`,
      length: Math.max(doorH, doorW),
      width: Math.min(doorH, doorW),
      quantity: doorQty,
      material: doorMaterial,
      color: PIECE_COLORS.door,
    });
  } else if (doors === 'two_doors') {
    const doorH = height - 4;
    const doorW = Math.floor((width - 6) / 2); // 2mm à gauche, 2mm au centre, 2mm à droite
    const doorQty = 2 * cabinetCount;
    pieces.push({
      role: 'Portes battantes doubles (2 battants, Jeu 2 mm)',
      description: `${config.name} - Battant de porte`,
      formula: cabinetCount > 1
        ? `2 battants : (${width} - 6mm) / 2 = ${doorW} mm × ${doorH} mm [2 × ${cabinetCount} = ${doorQty} pcs]`
        : `2 battants : (${width} - 6mm) / 2 = ${doorW} mm × ${doorH} mm`,
      length: Math.max(doorH, doorW),
      width: Math.min(doorH, doorW),
      quantity: doorQty,
      material: doorMaterial,
      color: PIECE_COLORS.door,
    });
  }

  // Conversion en CutItem pour la liste de débit
  const cutItems: CutItem[] = pieces.map((p, idx) => ({
    id: `cabinet-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
    name: p.description,
    material: p.material,
    length: p.length,
    width: p.width,
    quantity: p.quantity,
    canRotate: true,
    color: p.color,
  }));

  return {
    config,
    pieces,
    cutItems,
    interiorDimensions: {
      height: interiorHeight,
      width: interiorWidth,
      depth: interiorDepth,
    },
  };
}

/**
 * Analyseur intelligent en français (NLP / Moteur de règles) pour transformer une phrase
 * en paramètres de caisson précis, même sans clé API !
 */
export function parseCabinetPromptWithNLP(
  prompt: string,
  availableMaterials: string[] = [],
  stockPanels: { material: string; length: number; width: number; quantity: number }[] = [],
  workshopStock: { material: string; length: number; width: number; quantity: number }[] = []
): Partial<CabinetConfig> {
  const text = prompt.toLowerCase();
  const config: Partial<CabinetConfig> = {};

  // 0. Détection du nombre de caissons (ex: "3 caissons", "faire 2 meubles", "quantité: 4")
  const countMatch =
    text.match(/(\d+)\s*(?:caissons?|meubles?)/i) ||
    text.match(/(?:quantité|qte|qté|nombre)\s*(?:de)?\s*(?:caissons?)?\s*(?:de|:)?\s*(\d+)/i);
  if (countMatch) {
    const cVal = parseInt(countMatch[1], 10);
    if (cVal >= 1 && cVal <= 100) {
      config.cabinetCount = cVal;
    }
  }

  // 1. Détection des 3 dimensions (ex: 800x600x400 ou 800 * 600 * 400 ou 800 × 600 × 400)
  const dims3Match = text.match(/(\d{2,4})\s*(?:x|\*|×)\s*(\d{2,4})\s*(?:x|\*|×)\s*(\d{2,4})/);
  if (dims3Match) {
    const d1 = parseInt(dims3Match[1], 10);
    const d2 = parseInt(dims3Match[2], 10);
    const d3 = parseInt(dims3Match[3], 10);

    // Heuristique courante en menuiserie : Hauteur (souvent la plus grande), Largeur, Profondeur
    // Si l'utilisateur a écrit H x L x P ou L x H x P
    if (d1 >= d2 && d2 >= d3) {
      config.height = d1;
      config.width = d2;
      config.depth = d3;
    } else {
      config.height = d1;
      config.width = d2;
      config.depth = d3;
    }
  } else {
    // Recherche par mots-clés : hauteur, largeur, profondeur
    const hMatch = text.match(/(?:hauteur|haut|h)\s*(?:de|:|=)?\s*(\d{2,4})/);
    const wMatch = text.match(/(?:largeur|large|l)\s*(?:de|:|=)?\s*(\d{2,4})/);
    const dMatch = text.match(/(?:profondeur|prof|p)\s*(?:de|:|=)?\s*(\d{2,4})/);

    if (hMatch) config.height = parseInt(hMatch[1], 10);
    if (wMatch) config.width = parseInt(wMatch[1], 10);
    if (dMatch) config.depth = parseInt(dMatch[1], 10);
  }

  // 2. Détection de l'épaisseur du bois (ex: en 18mm, 19 mm, épaisseur 18)
  const thickMatch = text.match(/(?:épaisseur|epaisseur|en)\s*(\d{1,2})\s*(?:mm)?/);
  if (thickMatch) {
    const val = parseInt(thickMatch[1], 10);
    if (val >= 10 && val <= 40) {
      config.thickness = val;
    }
  }

  // 3. Type d'assemblage
  // "haut et bas à l'intérieur" / "montants filants" -> 'sides_full'
  // "côtés à l'intérieur" / "dessus dessous filants" -> 'top_bottom_full'
  if (
    text.includes("haut et bas à l'intérieur") ||
    text.includes("haut et bas à l interieur") ||
    text.includes('haut et bas dedans') ||
    text.includes('haut et bas entre') ||
    text.includes('montants filants') ||
    text.includes('montant filant') ||
    text.includes('montants continus')
  ) {
    config.assemblyType = 'sides_full';
  } else if (
    text.includes("côtés à l'intérieur") ||
    text.includes("cotes a l interieur") ||
    text.includes('côtés entre') ||
    text.includes('dessus dessous filant') ||
    text.includes('chapeau filant')
  ) {
    config.assemblyType = 'top_bottom_full';
  }

  // 4. Nombre d'étagères
  const shelvesMatch = text.match(/(\d+)\s*(?:étagère|etagere|rayonnage|tablette)s?/);
  if (shelvesMatch) {
    config.shelvesCount = parseInt(shelvesMatch[1], 10);
  } else if (text.includes('une étagère') || text.includes('1 étagère')) {
    config.shelvesCount = 1;
  } else if (text.includes('deux étagères') || text.includes('2 étagères')) {
    config.shelvesCount = 2;
  }

  // 5. Fond du meuble
  if (text.includes('sans fond') || text.includes('pas de fond')) {
    config.backType = 'none';
  } else if (text.includes('rainure') || text.includes('rainuré')) {
    config.backType = 'groove';
  } else if (text.includes('fond') || text.includes('applique')) {
    config.backType = 'applique';
  }

  // Détection de la matière et de l'épaisseur du fond
  // Exemples : "fond de mdf 8mm", "fond en mdf 8mm", "fond mdf 8", "fond isorel 3mm", "fond de 8mm", "fond 8mm"
  const backPattern = /fond\s*(?:de|en)?\s*([a-zA-ZÀ-ÿ\s]+)?\s*(\d{1,2})\s*(?:mm)?/i;
  const backMatch = text.match(backPattern);
  if (backMatch) {
    const rawBackMat = (backMatch[1] || '').trim();
    const thickVal = parseInt(backMatch[2], 10);
    if (thickVal >= 3 && thickVal <= 30) {
      config.backThickness = thickVal;
      // 1. Chercher d'abord dans les chutes atelier ou le stock saisi si une matière correspond à cette épaisseur
      const matchingStockBack =
        workshopStock.find((w) => extractThicknessFromMaterialName(w.material) === thickVal) ||
        stockPanels.find((p) => extractThicknessFromMaterialName(p.material) === thickVal);

      if (matchingStockBack) {
        config.backMaterial = matchingStockBack.material;
      } else if (rawBackMat.includes('mdf')) {
        config.backMaterial = `MDF ${thickVal}mm`;
      } else if (rawBackMat.includes('isorel')) {
        config.backMaterial = `Isorel ${thickVal}mm`;
      } else if (rawBackMat.includes('contreplaqu')) {
        config.backMaterial = `Contreplaqué ${thickVal}mm`;
      } else if (rawBackMat.includes('melamin')) {
        config.backMaterial = `Mélaminé ${thickVal}mm`;
      } else if (rawBackMat) {
        config.backMaterial = `${rawBackMat.charAt(0).toUpperCase() + rawBackMat.slice(1)} ${thickVal}mm`;
      } else {
        config.backMaterial = `MDF ${thickVal}mm`;
      }
    }
  } else if (config.backType !== 'none') {
    // Si fond demandé sans préciser, vérifier si des chutes minces existent en stock atelier ou saisi
    const thinStock =
      workshopStock.find((w) => {
        const th = extractThicknessFromMaterialName(w.material);
        return th && th <= 10;
      }) ||
      stockPanels.find((p) => {
        const th = extractThicknessFromMaterialName(p.material);
        return th && th <= 10;
      });

    if (thinStock) {
      config.backMaterial = thinStock.material;
      config.backThickness = extractThicknessFromMaterialName(thinStock.material) || 8;
    }
  }

  // 6. Séparation verticale
  if (
    text.includes('séparation') ||
    text.includes('separation') ||
    text.includes('cloison') ||
    text.includes('montant central')
  ) {
    config.partitionsCount = 1;
  }

  // 7. Portes
  if (text.includes('2 portes') || text.includes('deux portes') || text.includes('double porte')) {
    config.doors = 'two_doors';
  } else if (text.includes('1 porte') || text.includes('une porte')) {
    config.doors = 'one_door';
  }

  // 8. Matière du caisson (Priorité absolue au stock saisi et atelier)
  const allStockMats = [
    ...stockPanels.map((p) => p.material.trim()),
    ...workshopStock.map((w) => w.material.trim()),
  ];

  // A. Recherche d'une correspondance directe avec les panneaux en stock
  for (const mat of allStockMats) {
    const cleanMat = mat.toLowerCase();
    // Ex: "osb", "mdf", "chene", ou le nom complet
    const words = cleanMat.split(/\s+/).filter((w) => w.length > 2);
    if (text.includes(cleanMat) || words.some((w) => text.includes(w))) {
      config.material = mat;
      const th = extractThicknessFromMaterialName(mat);
      if (th) config.thickness = th;
      break;
    }
  }

  // B. Recherche dans availableMaterials si pas trouvé dans le stock
  if (!config.material && availableMaterials.length > 0) {
    for (const mat of availableMaterials) {
      if (text.includes(mat.toLowerCase().trim())) {
        config.material = mat;
        const th = extractThicknessFromMaterialName(mat);
        if (th) config.thickness = th;
        break;
      }
    }
  }

  // C. Si aucune matière mentionnée mais du stock est présent, utiliser le stock saisi en premier
  if (!config.material) {
    if (stockPanels.length > 0) {
      config.material = stockPanels[0].material;
      const th = extractThicknessFromMaterialName(stockPanels[0].material);
      if (th) config.thickness = th;
    } else if (workshopStock.length > 0) {
      config.material = workshopStock[0].material;
      const th = extractThicknessFromMaterialName(workshopStock[0].material);
      if (th) config.thickness = th;
    }
  }

  // D. Fallback générique si vraiment aucun stock n'est renseigné
  if (!config.material) {
    if (text.includes('mélaminé') || text.includes('melamine')) {
      config.material = 'Mélaminé Blanc 18mm';
    } else if (text.includes('mdf')) {
      config.material = 'MDF 19mm';
    } else if (text.includes('contreplaqué') || text.includes('contre-plaqué')) {
      config.material = 'Contreplaqué 15mm';
    } else if (text.includes('osb')) {
      config.material = 'OSB 18mm';
    } else if (text.includes('chêne') || text.includes('chene')) {
      config.material = 'Chêne Massif 20mm';
    }
  }

  return config;
}

/**
 * Extrait l'épaisseur en millimètres depuis le libellé d'une matière.
 * Exemples : "MDF 18mm" -> 18, "Contreplaqué 15 mm" -> 15, "OSB 18" -> 18, "Mélaminé Blanc 19mm" -> 19
 */
export function extractThicknessFromMaterialName(matName: string): number | null {
  if (!matName) return null;
  const mmMatch = matName.match(/(\d{1,2})\s*mm/i);
  if (mmMatch) {
    const val = parseInt(mmMatch[1], 10);
    if (val >= 3 && val <= 50) return val;
  }
  const numMatch = matName.match(/\b(\d{1,2})\b/);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (val >= 6 && val <= 40) return val;
  }
  return null;
}

