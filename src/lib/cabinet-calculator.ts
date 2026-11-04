import {
  CutItem,
  AssemblyType,
  BackType,
  DoorsType,
  CabinetConfig,
} from '@/types/cutting';

export type { AssemblyType, BackType, DoorsType, CabinetConfig };

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
  } else if (assemblyType === 'bottom_inside_top_over') {
    sideHeight = height - thickness;
    sideFormula = `${height} - ${thickness} = ${sideHeight} mm (Sous plateau supérieur, bas encastré)`;
  }

  const sidesQty = 2 * cabinetCount;
  pieces.push({
    role: cabinetCount > 1 ? `Côtés (${sidesQty} pcs pour ${cabinetCount} caissons)` : 'Côtés (Gauche & Droit)',
    description: `${config.name} - Côtés`,
    formula: cabinetCount > 1 ? `${sideFormula} [2 × ${cabinetCount} = ${sidesQty} pcs]` : sideFormula,
    length: Math.max(sideHeight, structuralDepth),
    width: Math.min(sideHeight, structuralDepth),
    quantity: sidesQty,
    material,
    color: PIECE_COLORS.sides,
  });

  // 2. Haut et Bas (Plateau Dessus et Plateau Dessous - Calculés distinctement)
  const overhangSides = config.topOverhangSides || 0;
  const overhangFront = config.topOverhangFront || 0;
  const overhangBack = config.topOverhangBack || 0;

  if (assemblyType === 'bottom_inside_top_over') {
    // Plateau du haut posé sur les côtés avec éventuels débords
    const topWidth = width + 2 * overhangSides;
    const topDepth = depth + overhangFront + overhangBack;
    const topQty = 1 * cabinetCount;
    const topFormula =
      overhangSides > 0 || overhangFront > 0
        ? `Posé sur côtés : ${width} mm ${overhangSides ? `+ (2×${overhangSides}mm débord côtés) = ${topWidth} mm` : ''} × ${depth} mm ${overhangFront ? `+ ${overhangFront}mm débord avant = ${topDepth} mm` : ''}`
        : `Posé sur côtés : Pleine largeur extérieure ${width} × ${depth} mm`;

    pieces.push({
      role: cabinetCount > 1 ? `Plateau haut (${topQty} pcs pour ${cabinetCount} caissons)` : 'Plateau haut (Dessus posé)',
      description: `${config.name} - Plateau du haut`,
      formula: cabinetCount > 1 ? `${topFormula} [1 × ${cabinetCount} = ${topQty} pcs]` : topFormula,
      length: Math.max(topWidth, topDepth),
      width: Math.min(topWidth, topDepth),
      quantity: topQty,
      material,
      color: PIECE_COLORS.topBottom,
    });

    // Plateau du bas encastré entre les côtés
    const bottomWidth = width - 2 * thickness;
    const bottomDepth = depth;
    const bottomQty = 1 * cabinetCount;
    const bottomFormula = `Encastré entre côtés : ${width} - (2 × ${thickness}) = ${bottomWidth} mm × ${bottomDepth} mm`;

    pieces.push({
      role: cabinetCount > 1 ? `Plateau bas (${bottomQty} pcs pour ${cabinetCount} caissons)` : 'Plateau bas (Dessous encastré)',
      description: `${config.name} - Plateau du bas`,
      formula: cabinetCount > 1 ? `${bottomFormula} [1 × ${cabinetCount} = ${bottomQty} pcs]` : bottomFormula,
      length: Math.max(bottomWidth, bottomDepth),
      width: Math.min(bottomWidth, bottomDepth),
      quantity: bottomQty,
      material,
      color: PIECE_COLORS.topBottom,
    });
  } else {
    // Cas standards : 'sides_full' ou 'top_bottom_full'
    let topBottomWidth = width;
    let topBottomFormula = `${width} mm (Pleine largeur extérieure)`;

    if (assemblyType === 'sides_full') {
      topBottomWidth = width - 2 * thickness;
      topBottomFormula = `${width} - (2 × ${thickness}) = ${topBottomWidth} mm (Encastré intérieur)`;
    }

    const singleQty = 1 * cabinetCount;
    pieces.push({
      role: cabinetCount > 1 ? `Plateau haut (${singleQty} pcs pour ${cabinetCount} caissons)` : 'Plateau haut (Dessus)',
      description: `${config.name} - Plateau du haut`,
      formula: cabinetCount > 1 ? `${topBottomFormula} [1 × ${cabinetCount} = ${singleQty} pcs]` : topBottomFormula,
      length: Math.max(topBottomWidth, structuralDepth),
      width: Math.min(topBottomWidth, structuralDepth),
      quantity: singleQty,
      material,
      color: PIECE_COLORS.topBottom,
    });

    pieces.push({
      role: cabinetCount > 1 ? `Plateau bas (${singleQty} pcs pour ${cabinetCount} caissons)` : 'Plateau bas (Dessous)',
      description: `${config.name} - Plateau du bas`,
      formula: cabinetCount > 1 ? `${topBottomFormula} [1 × ${cabinetCount} = ${singleQty} pcs]` : topBottomFormula,
      length: Math.max(topBottomWidth, structuralDepth),
      width: Math.min(topBottomWidth, structuralDepth),
      quantity: singleQty,
      material,
      color: PIECE_COLORS.topBottom,
    });
  }

  // Dimensions intérieures brutes
  const interiorWidth = width - 2 * thickness;
  const interiorHeight = height - 2 * thickness;
  const interiorDepth = backType === 'applique' ? depth : depth - backThickness;

  // 3. Séparations verticales (Montants intermédiaires, de 1 à 4)
  if (partitionsCount > 0) {
    const partitionHeight = interiorHeight;
    const partitionFormula = `Hauteur intérieure : ${height} - (2 × ${thickness}) = ${partitionHeight} mm`;
    const partitionQty = partitionsCount * cabinetCount;

    pieces.push({
      role:
        partitionsCount > 1
          ? `Séparations verticales (${partitionQty} pcs pour ${cabinetCount} caisson${cabinetCount > 1 ? 's' : ''})`
          : cabinetCount > 1
          ? `Séparation verticale (${partitionQty} pcs pour ${cabinetCount} caissons)`
          : 'Séparation verticale centrale',
      description:
        partitionsCount > 1
          ? `${config.name} - Séparations (${partitionsCount})`
          : `${config.name} - Séparation centrale`,
      formula:
        cabinetCount > 1
          ? `${partitionFormula} [${partitionsCount} × ${cabinetCount} = ${partitionQty} pcs]`
          : partitionFormula,
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
      // Étagère divisée par les montants intermédiaires
      shelfWidth = Math.floor((interiorWidth - partitionsCount * thickness) / (partitionsCount + 1));
      shelfFormula = `Compartiment (${partitionsCount + 1}) : (${interiorWidth} - ${
        partitionsCount > 1 ? `${partitionsCount}×${thickness}` : thickness
      }) / ${partitionsCount + 1} = ${shelfWidth} mm`;
    }

    const shelfDepth = Math.max(50, structuralDepth - shelfRecess);
    const compartmentsCount = partitionsCount > 0 ? partitionsCount + 1 : 1;
    const shelvesPerCabinet = shelvesCount * compartmentsCount;
    const totalShelvesQty = shelvesPerCabinet * cabinetCount;

    pieces.push({
      role:
        partitionsCount > 0
          ? `Étagères (${shelvesCount} par compartiment × ${compartmentsCount} = ${shelvesPerCabinet} pcs)`
          : `Étagère(s) (${shelvesCount} pcs) [Retrait ${shelfRecess} mm]`,
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
      description: `${config.name} - Fond encastré`,
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
    cabinetConfig: { ...config },
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
 * Reconstruit ou récupère la configuration (et les dimensions extérieures H × L × P)
 * d'un caisson à partir de ses pièces dans la liste de débit.
 */
export function inferCabinetConfigFromItems(
  cabinetName: string,
  cabItems: CutItem[]
): CabinetConfig {
  const withConfig = cabItems.find((it) => it.cabinetConfig);
  if (withConfig?.cabinetConfig) {
    return {
      ...withConfig.cabinetConfig,
      name: cabinetName,
    };
  }

  const getRolePart = (fullName: string) => {
    if (fullName.includes(' - ')) {
      const parts = fullName.split(' - ');
      return parts[parts.length - 1].toLowerCase().trim();
    }
    return fullName.toLowerCase().trim();
  };

  const sides = cabItems.filter((it) => {
    const r = getRolePart(it.name);
    return (
      (r.includes('côté') || r.includes('cote') || r.includes('montant') || r.includes('flanc')) &&
      !r.includes('séparat') &&
      !r.includes('separat') &&
      !r.includes('central')
    );
  });

  const topBottom = cabItems.filter((it) => {
    const r = getRolePart(it.name);
    return (
      r.includes('haut') ||
      r.includes('bas') ||
      r.includes('dessus') ||
      r.includes('dessous') ||
      r.includes('chapeau') ||
      r.includes('plancher') ||
      r.includes('base') ||
      r.includes('horizontal')
    );
  });

  const shelves = cabItems.filter((it) => {
    const r = getRolePart(it.name);
    return r.includes('étagère') || r.includes('etagere') || r.includes('tablette');
  });

  const backs = cabItems.filter((it) => {
    const r = getRolePart(it.name);
    return (
      (r.includes('fond') || r.includes('dos') || r.includes('arrière') || r.includes('arriere')) &&
      !r.includes('horizontal')
    );
  });

  const partitions = cabItems.filter((it) => {
    const r = getRolePart(it.name);
    return (
      r.includes('séparation') ||
      r.includes('separation') ||
      r.includes('cloison') ||
      r.includes('central')
    );
  });

  const doors = cabItems.filter((it) => {
    const r = getRolePart(it.name);
    return r.includes('porte') || r.includes('battant') || r.includes('façade') || r.includes('facade');
  });

  const mainMat =
    sides[0]?.material ||
    topBottom[0]?.material ||
    cabItems[0]?.material ||
    'MDF 18mm';
  const thickness = extractThicknessFromMaterialName(mainMat) || 18;

  let height = 720;
  let width = 600;
  let depth = 560;
  let assemblyType: AssemblyType = 'sides_full';
  let topOverhangSides = 0;
  let topOverhangFront = 0;

  if (sides.length > 0 && topBottom.length > 0) {
    const s = sides[0];
    const tb = topBottom[topBottom.length - 1];
    let sideH = Math.max(s.length, s.width);
    if (Math.abs(s.length - tb.length) <= 2 || Math.abs(s.length - tb.width) <= 2) {
      depth = s.length;
      sideH = s.width;
    } else if (Math.abs(s.width - tb.length) <= 2 || Math.abs(s.width - tb.width) <= 2) {
      depth = s.width;
      sideH = s.length;
    } else {
      sideH = Math.max(s.length, s.width);
      depth = Math.min(s.length, s.width);
    }

    const bottomW = Math.abs(tb.length - depth) <= 2 ? tb.width : tb.length;

    if (topBottom.length >= 2) {
      const topIt = topBottom[0];
      const topW =
        Math.abs(topIt.length - depth) <= 2
          ? topIt.width
          : Math.max(topIt.length, topIt.width);
      const topD = topIt.length === topW ? topIt.width : topIt.length;
      if (topW > bottomW + 2) {
        assemblyType = 'bottom_inside_top_over';
        height = sideH + thickness;
        width = bottomW + 2 * thickness;
        topOverhangSides = Math.max(0, Math.round((topW - width) / 2));
        topOverhangFront = Math.max(0, Math.round(topD - depth));
      } else {
        assemblyType = 'sides_full';
        height = sideH;
        width = bottomW + 2 * thickness;
      }
    } else {
      assemblyType = 'sides_full';
      height = sideH;
      width = bottomW + 2 * thickness;
    }
  } else if (sides.length > 0) {
    height = Math.max(sides[0].length, sides[0].width);
    depth = Math.min(sides[0].length, sides[0].width);
  } else if (cabItems.length > 0) {
    height = Math.max(...cabItems.map((i) => i.length));
    width = Math.max(...cabItems.map((i) => i.width));
    depth = Math.min(...cabItems.map((i) => i.width));
  }

  const sidesTotalQty = sides.reduce((sum, it) => sum + it.quantity, 0);
  const cabinetCount = sidesTotalQty >= 2 ? Math.max(1, Math.round(sidesTotalQty / 2)) : 1;
  const partitionsTotalQty = partitions.reduce((sum, it) => sum + it.quantity, 0);
  const partitionsCount = Math.min(4, Math.max(0, Math.round(partitionsTotalQty / cabinetCount)));

  const shelvesTotalQty = shelves.reduce((sum, it) => sum + it.quantity, 0);
  const compartments = partitionsCount + 1;
  const shelvesCount =
    shelvesTotalQty > 0
      ? Math.max(1, Math.round(shelvesTotalQty / (compartments * cabinetCount)))
      : 0;

  let shelfRecess = 20;
  if (shelves[0]) {
    const sMin = Math.min(shelves[0].length, shelves[0].width);
    const sMax = Math.max(shelves[0].length, shelves[0].width);
    const candidateDepth = Math.abs(depth - sMin) < Math.abs(depth - sMax) ? sMin : sMax;
    if (depth > candidateDepth && depth - candidateDepth <= 150) {
      shelfRecess = depth - candidateDepth;
    }
  }

  let backType: BackType = 'none';
  let backMaterial = 'MDF 8mm';
  let backThickness = 8;
  if (backs.length > 0) {
    const bName = backs[0].name.toLowerCase();
    backType =
      bName.includes('encastr') || bName.includes('rainur') ? 'groove' : 'applique';
    backMaterial = backs[0].material || 'MDF 8mm';
    backThickness = extractThicknessFromMaterialName(backMaterial) || 8;
  }

  let doorsType: DoorsType = 'none';
  if (doors.length > 0) {
    const doorsQty = doors.reduce((sum, it) => sum + it.quantity, 0);
    doorsType = doorsQty / cabinetCount >= 2 ? 'two_doors' : 'one_door';
  }

  return {
    name: cabinetName,
    height,
    width,
    depth,
    thickness,
    assemblyType,
    topOverhangSides,
    topOverhangFront,
    backType,
    backThickness,
    shelvesCount,
    shelfRecess,
    partitionsCount,
    doors: doorsType,
    material: mainMat,
    backMaterial,
    doorMaterial: doors[0]?.material || mainMat,
    cabinetCount,
  };
}

/**
 * Recalcule les pièces d'un caisson existant suite à la modification de ses dimensions extérieures (H, L, P),
 * en préservant les identifiants et préférences de fil (canRotate) de chaque pièce.
 */
export function recalculateCabinetItems(
  cabItems: CutItem[],
  updatedConfig: CabinetConfig
): CutItem[] {
  const prevConfig = inferCabinetConfigFromItems(updatedConfig.name, cabItems);
  const calculated = calculateCabinetPieces(updatedConfig);
  const usedOldIds = new Set<string>();

  const updatedGenerated = calculated.cutItems.map((genItem) => {
    const match = cabItems.find(
      (old) => !usedOldIds.has(old.id) && old.name === genItem.name
    );
    if (match) {
      usedOldIds.add(match.id);
      return {
        ...genItem,
        id: match.id,
        canRotate: match.canRotate,
        color: match.color || genItem.color,
        cabinetConfig: { ...updatedConfig },
      };
    }
    return {
      ...genItem,
      cabinetConfig: { ...updatedConfig },
    };
  });

  // Cas principal : caisson généré par l'Assistant IA (les noms de pièces correspondent)
  if (usedOldIds.size > 0) {
    const leftoverCustom = cabItems
      .filter((old) => !usedOldIds.has(old.id))
      .map((old) => ({
        ...old,
        cabinetConfig: { ...updatedConfig },
      }));
    return [...updatedGenerated, ...leftoverCustom];
  }

  // Cas alternatif (pièces saisies manuellement ou issues d'un modèle libre) : application des écarts ΔH, ΔL, ΔP
  const dH = updatedConfig.height - prevConfig.height;
  const dW = updatedConfig.width - prevConfig.width;
  const dD = updatedConfig.depth - prevConfig.depth;

  return cabItems.map((item) => {
    const n = item.name.toLowerCase();
    let l = item.length;
    let w = item.width;
    const isHFirst = Math.abs(l - prevConfig.height) <= Math.abs(w - prevConfig.height);
    const isWFirst = Math.abs(l - prevConfig.width) <= Math.abs(w - prevConfig.width);

    if (n.includes('côté') || n.includes('cote') || n.includes('montant') || n.includes('séparation') || n.includes('separation')) {
      if (isHFirst) {
        l = Math.max(10, l + dH);
        w = Math.max(10, w + dD);
      } else {
        w = Math.max(10, w + dH);
        l = Math.max(10, l + dD);
      }
    } else if (n.includes('fond') || n.includes('dos') || n.includes('porte') || n.includes('battant')) {
      if (isHFirst) {
        l = Math.max(10, l + dH);
        w = Math.max(10, w + dW);
      } else {
        w = Math.max(10, w + dH);
        l = Math.max(10, l + dW);
      }
    } else {
      // Haut, bas, étagères, traverses
      if (isWFirst) {
        l = Math.max(10, l + dW);
        w = Math.max(10, w + dD);
      } else {
        w = Math.max(10, w + dW);
        l = Math.max(10, l + dD);
      }
    }

    return {
      ...item,
      length: Math.max(l, w),
      width: Math.min(l, w),
      cabinetConfig: { ...updatedConfig },
    };
  });
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

  // 1. Détection des 3 dimensions
  // A. Format "700x1000x450" ou "700 x 1000 x 450" ou "700*1000*450"
  const dims3Match = text.match(/(\d{2,4})\s*(?:x|\*|×)\s*(\d{2,4})\s*(?:x|\*|×)\s*(\d{2,4})/i);
  if (dims3Match) {
    const d1 = parseInt(dims3Match[1], 10);
    const d2 = parseInt(dims3Match[2], 10);
    const d3 = parseInt(dims3Match[3], 10);
    config.height = d1;
    config.width = d2;
    config.depth = d3;
  } else {
    // B. Recherche robuste avec nombre AVANT ou APRÈS les mots-clés
    // Exemples : "700 de haut", "700mm de haut", "hauteur 700", "700 haut", "70 cm de haut"
    // Hauteur
    const hMatch =
      text.match(/(\d{2,4})\s*(?:mm|cm)?\s*(?:de\s+)?(?:haut(?:eur)?|h\b)/i) ||
      text.match(/(?:hauteur|haut|h)\s*(?:de|:|=)?\s*(\d{2,4})\s*(?:mm|cm)?/i);
    if (hMatch) {
      let val = parseInt(hMatch[1], 10);
      if (val < 100 && (text.includes(`${val} cm`) || text.includes(`${val}cm`))) val *= 10;
      config.height = val;
    }

    // Largeur
    const wMatch =
      text.match(/(\d{2,4})\s*(?:mm|cm)?\s*(?:de\s+)?(?:large(?:ur)?|l\b)/i) ||
      text.match(/(?:largeur|large|l)\s*(?:de|:|=)?\s*(\d{2,4})\s*(?:mm|cm)?/i);
    if (wMatch) {
      let val = parseInt(wMatch[1], 10);
      if (val < 100 && (text.includes(`${val} cm`) || text.includes(`${val}cm`))) val *= 10;
      config.width = val;
    }

    // Profondeur
    const dMatch =
      text.match(/(\d{2,4})\s*(?:mm|cm)?\s*(?:de\s+)?(?:prof(?:ondeur)?|p\b)/i) ||
      text.match(/(?:profondeur|prof|p)\s*(?:de|:|=)?\s*(\d{2,4})\s*(?:mm|cm)?/i);
    if (dMatch) {
      let val = parseInt(dMatch[1], 10);
      if (val < 100 && (text.includes(`${val} cm`) || text.includes(`${val}cm`))) val *= 10;
      config.depth = val;
    }
  }

  // 2. Détection de l'épaisseur du bois des panneaux principaux (en évitant le fond !)
  // Ex: "en 18mm", "épaisseur 19mm", "panneaux de 18", mais PAS "fond de 9mm" !
  const mainThickMatch = text.match(/(?:épaisseur|epaisseur|panneaux?\s+de)\s*(\d{1,2})\s*(?:mm)?/i);
  if (mainThickMatch) {
    const val = parseInt(mainThickMatch[1], 10);
    if (val >= 10 && val <= 40) {
      config.thickness = val;
    }
  } else {
    const enThickMatch = text.match(/\ben\s+(\d{1,2})\s*(?:mm)?\b/i);
    if (enThickMatch) {
      const idx = enThickMatch.index || 0;
      const surrounding = text.slice(Math.max(0, idx - 15), idx + 25);
      if (!surrounding.includes('fond') && !surrounding.includes('mdf')) {
        const val = parseInt(enThickMatch[1], 10);
        if (val >= 12 && val <= 40) {
          config.thickness = val;
        }
      }
    }
  }

  // 3. Type d'assemblage & Débords
  const isBottomInside =
    text.includes('bas sera encastré') ||
    text.includes('bas sera encastre') ||
    text.includes('bas encastré') ||
    text.includes('bas encastre') ||
    text.includes("bas à l'intérieur") ||
    text.includes('bas a l interieur') ||
    text.includes('bas entre les cotés') ||
    text.includes('bas entre les côtés');

  const isTopOver =
    text.includes('haut sera posé') ||
    text.includes('haut sera pose') ||
    text.includes('haut posé') ||
    text.includes('haut pose') ||
    text.includes('dessus posé') ||
    text.includes('dessus pose') ||
    text.includes('sur les côtés') ||
    text.includes('sur les cotés') ||
    text.includes('débord') ||
    text.includes('debord');

  if (isBottomInside && isTopOver) {
    config.assemblyType = 'bottom_inside_top_over';
  } else if (
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
  } else if (isTopOver) {
    config.assemblyType = 'bottom_inside_top_over';
  }

  // Détection des débords du plateau supérieur (ex: "debord de 2 cm sur les cotés et l'avant")
  const debordMatch = text.match(/(?:débord|debord)\s*(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(cm|mm)?/i);
  if (debordMatch) {
    const rawVal = parseFloat(debordMatch[1].replace(',', '.'));
    const unit = debordMatch[2]?.toLowerCase();
    const valMm = unit === 'cm' || (!unit && rawVal <= 5) ? Math.round(rawVal * 10) : Math.round(rawVal);

    if (valMm > 0 && valMm <= 200) {
      const hasSides = /c[oô]t[eé]/i.test(text) || /lat[eé]ral/i.test(text);
      const hasFront = /avant/i.test(text) || /fa[cç]ade/i.test(text);

      if (hasSides) {
        config.topOverhangSides = valMm;
      }
      if (hasFront) {
        config.topOverhangFront = valMm;
      }
      if (!config.topOverhangSides && !config.topOverhangFront) {
        config.topOverhangSides = valMm;
        config.topOverhangFront = valMm;
      }
    }
  }

  // 4. Nombre d'étagères
  // A. Étagères par côté / compartiment (ex: "2 etageres de chaque cotés", "2 étagères par côté")
  const shelvesPerSideMatch = text.match(
    /(\d+)\s*(?:étagère|etagere|rayonnage|tablette)s?\s*(?:de\s+chaque\s+côt[ée]s?|par\s+côt[ée]|par\s+compartiment)/i
  );
  if (shelvesPerSideMatch) {
    config.shelvesCount = parseInt(shelvesPerSideMatch[1], 10);
  } else {
    const shelvesMatch = text.match(/(\d+)\s*(?:étagère|etagere|rayonnage|tablette)s?/i);
    if (shelvesMatch) {
      config.shelvesCount = parseInt(shelvesMatch[1], 10);
    } else if (text.includes('une étagère') || text.includes('1 étagère')) {
      config.shelvesCount = 1;
    } else if (text.includes('deux étagères') || text.includes('2 étagères')) {
      config.shelvesCount = 2;
    }
  }

  // 5. Fond du meuble
  if (text.includes('sans fond') || text.includes('pas de fond')) {
    config.backType = 'none';
  } else if (
    text.includes('rainure') ||
    text.includes('rainuré') ||
    text.includes('encastré') ||
    text.includes('encastre') ||
    text.includes('feuillure')
  ) {
    config.backType = 'groove';
  } else if (text.includes('fond') || text.includes('applique')) {
    config.backType = 'applique';
  }

  // Détection de la matière et de l'épaisseur du fond
  // Exemples : "fond sera en mdf de 9 mm encastré", "fond en mdf 9mm", "fond mdf 9", "fond de 8mm", "fond 8mm"
  const backPattern =
    /(?:fond\s*(?:sera)?\s*(?:de|en)?\s*([a-zA-ZÀ-ÿ\s]+)?\s*(\d{1,2})\s*(?:mm)?)|(?:([a-zA-ZÀ-ÿ]+)\s*(?:de)?\s*(\d{1,2})\s*(?:mm)?\s*(?:pour\s+le|en)?\s*fond)/i;
  const backMatch = text.match(backPattern);
  if (backMatch) {
    const rawBackMat = (backMatch[1] || backMatch[3] || '').trim();
    const thickVal = parseInt(backMatch[2] || backMatch[4], 10);
    if (thickVal >= 3 && thickVal <= 30) {
      config.backThickness = thickVal;
      // Chercher d'abord dans les chutes atelier ou le stock saisi si une matière correspond à cette épaisseur
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

  // 6. Séparations verticales (de 0 à 4)
  const partMatch = text.match(/(\d+)\s*(?:séparations?|separations?|cloisons?|montants?\s+intermédiaires?|montants?\s+intermediaires?)/i);
  if (partMatch) {
    const pVal = parseInt(partMatch[1], 10);
    if (pVal >= 0 && pVal <= 4) {
      config.partitionsCount = pVal;
    }
  } else if (text.includes('quatre séparations') || text.includes('4 séparations')) {
    config.partitionsCount = 4;
  } else if (text.includes('trois séparations') || text.includes('3 séparations')) {
    config.partitionsCount = 3;
  } else if (text.includes('deux séparations') || text.includes('2 séparations')) {
    config.partitionsCount = 2;
  } else if (
    text.includes('séparation') ||
    text.includes('separation') ||
    text.includes('cloison') ||
    text.includes('montant central') ||
    text.includes('montant intermédiaire') ||
    text.includes('montant intermediaire')
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

