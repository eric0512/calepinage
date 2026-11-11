import {
  CutItem,
  AssemblyType,
  BackType,
  DoorsType,
  DrawerBottomType,
  CabinetConfig,
  FacadeItem,
} from '@/types/cutting';

export type { AssemblyType, BackType, DoorsType, DrawerBottomType, CabinetConfig, FacadeItem };

export type CabinetPartKey =
  | 'sides'
  | 'top'
  | 'bottom'
  | 'partitions'
  | 'shelves'
  | 'back'
  | 'doors'
  | 'drawers';

/**
 * Liste des matières de base standards (MDF, Mela, OSB) par ordre alphabétique et par épaisseurs
 */
export const DEFAULT_BASE_MATERIALS: string[] = [
  // MDF (3, 6, 8, 9, 10, 12, 16, 19 mm)
  'MDF 3mm',
  'MDF 6mm',
  'MDF 8mm',
  'MDF 9mm',
  'MDF 10mm',
  'MDF 12mm',
  'MDF 16mm',
  'MDF 19mm',
  // Mela (8, 12, 16, 19, 25 mm)
  'Mela 8mm',
  'Mela 12mm',
  'Mela 16mm',
  'Mela 19mm',
  'Mela 25mm',
  // OSB (9, 12, 15, 16, 18, 22, 25 mm)
  'OSB 9mm',
  'OSB 12mm',
  'OSB 15mm',
  'OSB 16mm',
  'OSB 18mm',
  'OSB 22mm',
  'OSB 25mm',
];

export interface CabinetPieceCalculation {
  partKey?: CabinetPartKey;
  partId?: string;
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
  drawers: '#fed7aa', // Orange très clair (pastel)
};

/** Jeu périphérique appliqué autour de la façade (2 mm en haut + 2 mm en bas, idem en largeur) */
export const FACADE_EDGE_CLEARANCE = 2;
/** Hauteur minimale d'un composant de façade (mm) */
export const FACADE_MIN_HEIGHT = 50;

export interface FacadeLayoutResult {
  heights: number[]; // Hauteur résolue de chaque composant (0 si non déterminable)
  autoIndex: number; // Index du composant calculé automatiquement (-1 si aucun)
  available: number; // Hauteur totale disponible pour la façade (jeux périphériques déduits)
  gapsTotal: number; // Somme des espacements entre composants
  remaining: number; // Hauteur restante non attribuée (0 si tout est réparti)
  error: string | null; // Erreur bloquante
  warning: string | null; // Avertissement non bloquant
}

/**
 * Hauteur disponible pour les façades selon leur positionnement.
 * - En applique : hauteur extérieure - 2 × 2 mm de jeu
 * - À l'intérieur : hauteur intérieure (H - 2 × épaisseur) - 2 × 2 mm de jeu
 */
export function getFacadeAvailableHeight(
  height: number,
  thickness: number,
  placement: 'applique' | 'interieur' | undefined
): number {
  const base = placement === 'interieur' ? height - 2 * thickness : height;
  return Math.max(0, base - 2 * FACADE_EDGE_CLEARANCE);
}

/**
 * Répartit la hauteur de la façade entre ses composants empilés (tiroirs / portes).
 * Un seul composant peut être laissé vide : sa hauteur est déduite automatiquement
 * (hauteur disponible - hauteurs saisies - espacements entre composants).
 * La hauteur des tiroirs doit toujours être saisie.
 */
export function computeFacadeLayout(
  items: FacadeItem[],
  availableHeight: number,
  gap: number
): FacadeLayoutResult {
  const n = items.length;
  const safeGap = gap > 0 ? gap : 0;
  const gapsTotal = n > 1 ? (n - 1) * safeGap : 0;
  const base: FacadeLayoutResult = {
    heights: items.map((it) => (it.height && it.height > 0 ? it.height : 0)),
    autoIndex: -1,
    available: availableHeight,
    gapsTotal,
    remaining: 0,
    error: null,
    warning: null,
  };
  if (n === 0) return base;

  const missingDrawer = items.findIndex(
    (it) => it.type === 'tiroir' && !(it.height && it.height > 0)
  );
  if (missingDrawer >= 0) {
    return {
      ...base,
      error: `La hauteur de la façade du tiroir (élément ${missingDrawer + 1}) est obligatoire.`,
    };
  }

  const missingDrawerBox = items.findIndex(
    (it) =>
      it.type === 'tiroir' &&
      it.drawerHeight !== undefined &&
      !(it.drawerHeight && it.drawerHeight > 0)
  );
  if (missingDrawerBox >= 0) {
    return {
      ...base,
      error: `La hauteur du tiroir (élément ${missingDrawerBox + 1}) est obligatoire.`,
    };
  }

  const invalidDrawerBox = items.findIndex(
    (it) =>
      it.type === 'tiroir' &&
      it.height &&
      it.height > 0 &&
      it.drawerHeight &&
      it.drawerHeight > it.height
  );
  if (invalidDrawerBox >= 0) {
    const it = items[invalidDrawerBox];
    return {
      ...base,
      error: `La hauteur du tiroir (élément ${invalidDrawerBox + 1} : ${it.drawerHeight} mm) ne peut pas être supérieure à la hauteur de la façade (${it.height} mm).`,
    };
  }

  const emptyIdx = items
    .map((it, i) => (it.height && it.height > 0 ? -1 : i))
    .filter((i) => i >= 0);
  const fixedSum = base.heights.reduce((s, h) => s + h, 0);

  if (emptyIdx.length > 1) {
    return {
      ...base,
      error: `Saisissez la hauteur de ${n - 1} élément${n - 1 > 1 ? 's' : ''} sur ${n} : un seul élément peut être calculé automatiquement.`,
    };
  }

  if (emptyIdx.length === 1) {
    const autoIndex = emptyIdx[0];
    const autoH = Math.floor(availableHeight - fixedSum - gapsTotal);
    const heights = [...base.heights];
    heights[autoIndex] = Math.max(0, autoH);
    if (autoH < FACADE_MIN_HEIGHT) {
      return {
        ...base,
        heights,
        autoIndex,
        error: `Hauteurs trop importantes : il ne reste que ${Math.max(0, autoH)} mm pour l'élément ${autoIndex + 1} (minimum ${FACADE_MIN_HEIGHT} mm).`,
      };
    }
    return { ...base, heights, autoIndex };
  }

  // Toutes les hauteurs sont saisies
  const remaining = Math.round((availableHeight - fixedSum - gapsTotal) * 10) / 10;
  if (remaining < 0) {
    return {
      ...base,
      remaining,
      error: `La somme des hauteurs dépasse la hauteur disponible de ${Math.abs(remaining)} mm.`,
    };
  }
  return {
    ...base,
    remaining,
    warning:
      remaining > 0
        ? `Il reste ${remaining} mm non attribués sur la hauteur de la façade.`
        : null,
  };
}

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
    partitionsCount,
    doors,
    material,
    sidesMaterial,
    topMaterial,
    bottomMaterial,
    partitionsMaterial,
    shelvesMaterial,
    backMaterial,
    doorMaterial = material,
    cabinetCount: rawCabinetCount = 1,
  } = config;

  const resolvedSidesMaterial = (sidesMaterial || material || '').trim();
  const resolvedTopMaterial = (topMaterial || material || '').trim();
  const resolvedBottomMaterial = (bottomMaterial || material || '').trim();
  const resolvedPartitionsMaterial = (partitionsMaterial || material || '').trim();
  const resolvedShelvesMaterial = (shelvesMaterial || material || '').trim();
  const resolvedDoorMaterial = (doorMaterial || material || '').trim();
  const resolvedDrawerMaterial = (config.drawerMaterial || material || '').trim();

  const cabinetCount = Math.max(1, rawCabinetCount || 1);

  // Résolution stricte de la matière du fond pour éviter qu'il ne soit débité sur le panneau 18mm !
  let resolvedBackMaterial = backMaterial?.trim() || '';
  if (!resolvedBackMaterial && material?.trim()) {
    if (backThickness && backThickness !== thickness) {
      // Déduire le nom de base sans l'épaisseur du caisson (ex: "MDF 18mm" -> base "MDF" -> "MDF 8mm")
      const base = (material || '').replace(/\s*\d{1,2}\s*mm/i, '').trim();
      resolvedBackMaterial = `${base || 'MDF'} ${backThickness}mm`;
    } else {
      resolvedBackMaterial = material.trim();
    }
  }

  // Résolution individuelle d'une matière spécifique saisie par partie
  const getPartMat = (partId: string, fallback: string): string => {
    if (config.partMaterials && config.partMaterials[partId]) {
      return config.partMaterials[partId].trim();
    }
    return fallback;
  };

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
    partKey: 'sides',
    partId: 'sides',
    role: cabinetCount > 1 ? `Côtés (${sidesQty} pcs pour ${cabinetCount} caissons)` : 'Côtés (Gauche & Droit)',
    description: `${config.name} - Côtés`,
    formula: cabinetCount > 1 ? `${sideFormula} [2 × ${cabinetCount} = ${sidesQty} pcs]` : sideFormula,
    length: Math.max(sideHeight, structuralDepth),
    width: Math.min(sideHeight, structuralDepth),
    quantity: sidesQty,
    material: getPartMat('sides', resolvedSidesMaterial),
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
      partKey: 'top',
      partId: 'top',
      role: cabinetCount > 1 ? `Plateau haut (${topQty} pcs pour ${cabinetCount} caissons)` : 'Plateau haut (Dessus posé)',
      description: `${config.name} - Plateau du haut`,
      formula: cabinetCount > 1 ? `${topFormula} [1 × ${cabinetCount} = ${topQty} pcs]` : topFormula,
      length: Math.max(topWidth, topDepth),
      width: Math.min(topWidth, topDepth),
      quantity: topQty,
      material: getPartMat('top', resolvedTopMaterial),
      color: PIECE_COLORS.topBottom,
    });

    // Plateau du bas encastré entre les côtés
    const bottomWidth = width - 2 * thickness;
    const bottomDepth = depth;
    const bottomQty = 1 * cabinetCount;
    const bottomFormula = `Encastré entre côtés : ${width} - (2 × ${thickness}) = ${bottomWidth} mm × ${bottomDepth} mm`;

    pieces.push({
      partKey: 'bottom',
      partId: 'bottom',
      role: cabinetCount > 1 ? `Plateau bas (${bottomQty} pcs pour ${cabinetCount} caissons)` : 'Plateau bas (Dessous encastré)',
      description: `${config.name} - Plateau du bas`,
      formula: cabinetCount > 1 ? `${bottomFormula} [1 × ${cabinetCount} = ${bottomQty} pcs]` : bottomFormula,
      length: Math.max(bottomWidth, bottomDepth),
      width: Math.min(bottomWidth, bottomDepth),
      quantity: bottomQty,
      material: getPartMat('bottom', resolvedBottomMaterial),
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
      partKey: 'top',
      partId: 'top',
      role: cabinetCount > 1 ? `Plateau haut (${singleQty} pcs pour ${cabinetCount} caissons)` : 'Plateau haut (Dessus)',
      description: `${config.name} - Plateau du haut`,
      formula: cabinetCount > 1 ? `${topBottomFormula} [1 × ${cabinetCount} = ${singleQty} pcs]` : topBottomFormula,
      length: Math.max(topBottomWidth, structuralDepth),
      width: Math.min(topBottomWidth, structuralDepth),
      quantity: singleQty,
      material: getPartMat('top', resolvedTopMaterial),
      color: PIECE_COLORS.topBottom,
    });

    pieces.push({
      partKey: 'bottom',
      partId: 'bottom',
      role: cabinetCount > 1 ? `Plateau bas (${singleQty} pcs pour ${cabinetCount} caissons)` : 'Plateau bas (Dessous)',
      description: `${config.name} - Plateau du bas`,
      formula: cabinetCount > 1 ? `${topBottomFormula} [1 × ${cabinetCount} = ${singleQty} pcs]` : topBottomFormula,
      length: Math.max(topBottomWidth, structuralDepth),
      width: Math.min(topBottomWidth, structuralDepth),
      quantity: singleQty,
      material: getPartMat('bottom', resolvedBottomMaterial),
      color: PIECE_COLORS.topBottom,
    });
  }

  // Dimensions intérieures brutes
  const chosenBackMat = getPartMat('back', resolvedBackMaterial);
  const effectiveBackThickness =
    extractThicknessFromMaterialName(chosenBackMat) ||
    (backThickness && backThickness > 0 ? backThickness : 8);
  const interiorWidth = width - 2 * thickness;
  const interiorHeight = height - 2 * thickness;
  const interiorDepth = backType === 'groove' ? depth - effectiveBackThickness : depth;

  // 3. Séparations verticales (Montants intermédiaires, de 1 à 4)
  if (partitionsCount > 0) {
    const partitionHeight = interiorHeight;
    const partitionFormula = `Hauteur intérieure : ${height} - (2 × ${thickness}) = ${partitionHeight} mm`;
    const partitionQty = partitionsCount * cabinetCount;

    pieces.push({
      partKey: 'partitions',
      partId: 'partitions',
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
      material: getPartMat('partitions', resolvedPartitionsMaterial),
      color: PIECE_COLORS.partition,
    });
  }

  // 4. Étagères intérieures (tenant compte du fond encastré ou non + marge fixe de -5 mm)
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

    const shelfMargin = 5;
    const isBackGrooved = backType === 'groove';
    const baseShelfDepth = isBackGrooved
      ? structuralDepth - effectiveBackThickness
      : structuralDepth;
    const shelfDepth = Math.max(50, baseShelfDepth - shelfMargin);
    const depthFormulaDesc = isBackGrooved
      ? `${structuralDepth} - ${effectiveBackThickness} (ép. fond encastré) - ${shelfMargin} (marge) = ${shelfDepth} mm`
      : `${structuralDepth} - ${shelfMargin} (marge) = ${shelfDepth} mm`;

    const compartmentsCount = partitionsCount > 0 ? partitionsCount + 1 : 1;
    const shelvesPerCabinet = shelvesCount * compartmentsCount;
    const totalShelvesQty = shelvesPerCabinet * cabinetCount;

    pieces.push({
      partKey: 'shelves',
      partId: 'shelves',
      role:
        partitionsCount > 0
          ? `Étagères (${shelvesCount} par compartiment × ${compartmentsCount} = ${shelvesPerCabinet} pcs, ${isBackGrooved ? `fond encastré -${effectiveBackThickness} mm, ` : ''}marge -${shelfMargin} mm)`
          : `Étagère(s) (${shelvesCount} pcs) [${isBackGrooved ? `Fond encastré -${effectiveBackThickness} mm, ` : ''}Marge -${shelfMargin} mm]`,
      description: `${config.name} - Étagère`,
      formula: cabinetCount > 1
        ? `${shelfFormula} × Profondeur (${depthFormulaDesc}) [${shelvesPerCabinet} × ${cabinetCount} = ${totalShelvesQty} pcs]`
        : `${shelfFormula} × Profondeur (${depthFormulaDesc})`,
      length: Math.max(shelfWidth, shelfDepth),
      width: Math.min(shelfWidth, shelfDepth),
      quantity: totalShelvesQty,
      material: getPartMat('shelves', resolvedShelvesMaterial),
      color: PIECE_COLORS.shelf,
    });
  }

  // 5. Fond du caisson
  const backQty = 1 * cabinetCount;
  if (backType === 'applique') {
    // Fond cloué ou vissé en applique à l'arrière
    pieces.push({
      partKey: 'back',
      partId: 'back',
      role: `Fond (applique arrière)${chosenBackMat ? ` [${chosenBackMat}]` : ''}`,
      description: `${config.name} - Fond applique`,
      formula: cabinetCount > 1
        ? `Pleine cote extérieure arrière : ${height} × ${width} mm (Ép. ${effectiveBackThickness} mm) [1 × ${cabinetCount} = ${backQty} pcs]`
        : `Pleine cote extérieure arrière : ${height} × ${width} mm (Ép. ${effectiveBackThickness} mm${chosenBackMat ? ` - Matière : ${chosenBackMat}` : ''})`,
      length: Math.max(height, width),
      width: Math.min(height, width),
      quantity: backQty,
      material: chosenBackMat,
      color: PIECE_COLORS.back,
    });
  } else if (backType === 'groove') {
    // Fond dans une rainure (profondeur de rainure typique : 8 mm par côté)
    const grooveDepth = 8;
    const backH = interiorHeight + 2 * grooveDepth;
    const backW = interiorWidth + 2 * grooveDepth;

    pieces.push({
      partKey: 'back',
      partId: 'back',
      role: `Fond (rainure encastrée)${chosenBackMat ? ` [${chosenBackMat}]` : ''}`,
      description: `${config.name} - Fond encastré`,
      formula: cabinetCount > 1
        ? `Rainure (+2×${grooveDepth}mm) : ${backH} × ${backW} mm (Ép. ${effectiveBackThickness} mm) [1 × ${cabinetCount} = ${backQty} pcs]`
        : `Rainure (+2×${grooveDepth}mm) : ${backH} × ${backW} mm (Ép. ${effectiveBackThickness} mm${chosenBackMat ? ` - Matière : ${chosenBackMat}` : ''})`,
      length: Math.max(backH, backW),
      width: Math.min(backH, backW),
      quantity: backQty,
      material: chosenBackMat,
      color: PIECE_COLORS.back,
    });
  }

  // 6. Façades (en applique ou à l'intérieur du caisson, 1 ou plusieurs composants)
  const hasFacadesConfig = config.facadesCount !== undefined;
  const activeFacadesCount = hasFacadesConfig
    ? config.facadesCount || 0
    : doors === 'two_doors'
    ? 2
    : doors === 'one_door'
    ? 1
    : 0;

  // Spécifications des tiroirs issues de la composition détaillée de la façade (hauteur façade + hauteur tiroir choisie)
  let drawerSpecsFromFacade: { frontHeight: number; drawerHeight: number | null }[] = [];

  if (activeFacadesCount > 0 && config.facadeItems && config.facadeItems.length > 0) {
    // Composition détaillée : composants empilés du haut vers le bas, sur toute la largeur
    const isInside = config.facadePlacement === 'interieur';
    const gap = config.facadeGap !== undefined && config.facadeGap >= 0 ? config.facadeGap : 2;
    const items = config.facadeItems;
    const availH = getFacadeAvailableHeight(height, thickness, config.facadePlacement);
    const facadeW = Math.max(
      FACADE_MIN_HEIGHT,
      (isInside ? interiorWidth : width) - 2 * FACADE_EDGE_CLEARANCE
    );
    const layout = computeFacadeLayout(items, availH, gap);
    const placementLabel = isInside ? 'intérieure' : 'en applique';
    const baseH = isInside ? interiorHeight : height;

    drawerSpecsFromFacade = items
      .map((it, i) => {
        if (it.type !== 'tiroir') return null;
        const frontH = layout.heights[i];
        const chosenDrawerH =
          it.drawerHeight && it.drawerHeight > 0
            ? frontH > 0
              ? Math.min(it.drawerHeight, frontH)
              : it.drawerHeight
            : null;
        return { frontHeight: frontH, drawerHeight: chosenDrawerH };
      })
      .filter(
        (spec): spec is { frontHeight: number; drawerHeight: number | null } =>
          spec !== null && spec.frontHeight > 0
      );

    // Regroupement des composants identiques (même type et même hauteur)
    const groups = new Map<string, { type: FacadeItem['type']; h: number; count: number; auto: boolean }>();
    items.forEach((it, i) => {
      const h = Math.max(FACADE_MIN_HEIGHT, layout.heights[i] || FACADE_MIN_HEIGHT);
      const key = `${it.type}-${h}`;
      const g = groups.get(key);
      if (g) {
        g.count += 1;
        g.auto = g.auto || i === layout.autoIndex;
      } else {
        groups.set(key, { type: it.type, h, count: 1, auto: i === layout.autoIndex });
      }
    });

    const fixedDesc = items
      .map((it, i) => (i === layout.autoIndex ? null : `${layout.heights[i]}`))
      .filter(Boolean)
      .join(' - ');

    groups.forEach((g) => {
      const totalQty = g.count * cabinetCount;
      const label = g.type === 'tiroir' ? 'Façade tiroir' : 'Porte';
      const partId = g.type === 'tiroir' ? `facade_tiroir_${g.h}` : `facade_porte_${g.h}`;
      const defaultMat = g.type === 'tiroir'
        ? (config.partMaterials?.['facade_tiroir'] || config.partMaterials?.['doors'] || resolvedDoorMaterial)
        : (config.partMaterials?.['porte'] || config.partMaterials?.['doors'] || resolvedDoorMaterial);
      const pieceMat = getPartMat(partId, defaultMat);
      const autoFormula = g.auto
        ? `Auto : ${baseH} - ${2 * FACADE_EDGE_CLEARANCE} (jeux)${fixedDesc ? ` - ${fixedDesc}` : ''}${
            layout.gapsTotal > 0 ? ` - ${items.length - 1}×${gap} (espaces)` : ''
          } = ${g.h} mm`
        : `Hauteur saisie ${g.h} mm`;
      pieces.push({
        partKey: 'doors',
        partId,
        role: `${label} ${placementLabel} (H ${g.h} mm${g.count > 1 ? `, ${g.count} par caisson` : ''})`,
        description: `${config.name} - ${label}`,
        formula: `${autoFormula} × L ${facadeW} mm [${g.count} × ${cabinetCount} = ${totalQty} pcs]`,
        length: Math.max(g.h, facadeW),
        width: Math.min(g.h, facadeW),
        quantity: totalQty,
        material: pieceMat,
        color: g.type === 'tiroir' ? PIECE_COLORS.drawers : PIECE_COLORS.door,
      });
    });
  } else if (activeFacadesCount > 0) {
    const isInside = config.facadePlacement === 'interieur';
    const gap = config.facadeGap !== undefined && config.facadeGap >= 0 ? config.facadeGap : 2;

    if (isInside) {
      // Façades rentrantes / à l'intérieur du caisson (jeu périphérique 2 mm tout autour)
      const facadeH = Math.max(50, interiorHeight - 4);
      const totalAvailableW = Math.max(50, interiorWidth - 4);
      const facadeW =
        activeFacadesCount === 1
          ? totalAvailableW
          : Math.max(50, Math.floor((totalAvailableW - (activeFacadesCount - 1) * gap) / activeFacadesCount));
      const totalQty = activeFacadesCount * cabinetCount;

      pieces.push({
        partKey: 'doors',
        partId: 'doors',
        role: `Façade rentrante intérieure (${activeFacadesCount} composant${activeFacadesCount > 1 ? 's' : ''}, jeu 2 mm${activeFacadesCount > 1 ? `, espacement ${gap} mm` : ''})`,
        description: `${config.name} - Façade intérieure`,
        formula:
          activeFacadesCount > 1
            ? `(${interiorWidth} - 4 - ${activeFacadesCount - 1}×${gap}) / ${activeFacadesCount} = ${facadeW} mm × ${facadeH} mm [${activeFacadesCount} × ${cabinetCount} = ${totalQty} pcs]`
            : `(${interiorWidth} - 4mm) × (${interiorHeight} - 4mm) [1 × ${cabinetCount} = ${totalQty} pcs]`,
        length: Math.max(facadeH, facadeW),
        width: Math.min(facadeH, facadeW),
        quantity: totalQty,
        material: getPartMat('doors', resolvedDoorMaterial),
        color: PIECE_COLORS.door,
      });
    } else {
      // Façades en applique (recouvrement du caisson avec jeu périphérique de 2 mm)
      const facadeH = Math.max(50, height - 4);
      const totalAvailableW = Math.max(50, width - 4);
      const facadeW =
        activeFacadesCount === 1
          ? totalAvailableW
          : Math.max(50, Math.floor((totalAvailableW - (activeFacadesCount - 1) * gap) / activeFacadesCount));
      const totalQty = activeFacadesCount * cabinetCount;

      pieces.push({
        partKey: 'doors',
        partId: 'doors',
        role: `Façade en applique (${activeFacadesCount} composant${activeFacadesCount > 1 ? 's' : ''}, jeu 2 mm${activeFacadesCount > 1 ? `, espacement ${gap} mm` : ''})`,
        description: `${config.name} - Façade`,
        formula:
          activeFacadesCount > 1
            ? `(${width} - 4 - ${activeFacadesCount - 1}×${gap}) / ${activeFacadesCount} = ${facadeW} mm × ${facadeH} mm [${activeFacadesCount} × ${cabinetCount} = ${totalQty} pcs]`
            : `(${width} - 4mm) × (${height} - 4mm) [1 × ${cabinetCount} = ${totalQty} pcs]`,
        length: Math.max(facadeH, facadeW),
        width: Math.min(facadeH, facadeW),
        quantity: totalQty,
        material: getPartMat('doors', resolvedDoorMaterial),
        color: PIECE_COLORS.door,
      });
    }
  }

  // 7. Tiroirs (calcul des bacs de tiroirs : côtés, façades intérieures/dos et fond)
  let resolvedDrawerSlideLen = config.drawerSlideLength;
  if (config.drawersCount && config.drawersCount > 0) {
    const dCount = config.drawersCount;
    // Épaisseur coulisse par côté (ex: 12,7 mm ou 13 mm standard)
    const slideTh =
      config.drawerSlideThickness && config.drawerSlideThickness > 0
        ? config.drawerSlideThickness
        : 13;
    // Profondeur maximale disponible pour un tiroir à l'intérieur du caisson
    // (profondeur intérieure moins un retrait minimal de 10 mm, jamais supérieure à la profondeur du caisson)
    const maxAllowedSlideLen = Math.max(100, interiorDepth - 10);
    // Longueur standard de coulisse déduite de la profondeur du caisson (retrait standard ~50 mm, par pas de 50 mm)
    const autoSlideLen = Math.min(
      maxAllowedSlideLen,
      Math.min(600, Math.max(150, Math.floor((depth - 50) / 50) * 50))
    );
    // Longueur des coulisses / côtés de tiroir (interdit toute valeur supérieure à la profondeur disponible du caisson)
    const slideLen =
      config.drawerSlideLength &&
      config.drawerSlideLength > 0 &&
      config.drawerSlideLength <= maxAllowedSlideLen
        ? config.drawerSlideLength
        : autoSlideLen;
    resolvedDrawerSlideLen = slideLen;

    // Largeur de l'alvéole intérieure recevant les tiroirs (largeur extérieure - 2 × épaisseur côtés caisson principal)
    const compartmentW =
      partitionsCount > 0
        ? Math.round(((interiorWidth - partitionsCount * thickness) / (partitionsCount + 1)) * 10) / 10
        : interiorWidth;

    const slidesTotalTh = Math.round(2 * slideTh * 10) / 10;
    // Largeur extérieure du bloc tiroir (alvéole intérieure - épaisseur des 2 coulisses)
    const drawerOuterW = Math.max(50, Math.round((compartmentW - slidesTotalTh) * 10) / 10);
    // Hauteur du bac de tiroir par défaut (hauteur disponible divisée par nb de tiroirs avec jeu de 25-30 mm)
    const drawerBoxH = Math.min(220, Math.max(80, Math.floor((interiorHeight / dCount) - 30)));

    const bottomQty = 1 * dCount * cabinetCount;

    // Hauteur de chaque bac : hauteur de tiroir choisie dans la composition (bornée à la hauteur de la façade),
    // ou déduite de la hauteur de sa façade (façade - 40 mm), sinon répartition standard
    const useFrontHeights = drawerSpecsFromFacade.length === dCount;
    const boxGroups = new Map<number, { count: number; isCustomHeight: boolean }>();
    for (let i = 0; i < dCount; i++) {
      let boxH = drawerBoxH;
      let isCustom = false;
      if (useFrontHeights) {
        const spec = drawerSpecsFromFacade[i];
        if (spec.drawerHeight && spec.drawerHeight > 0) {
          boxH = Math.max(30, Math.round(Math.min(spec.drawerHeight, spec.frontHeight)));
          isCustom = true;
        } else {
          boxH = Math.max(
            60,
            Math.min(Math.max(60, interiorHeight - 30), Math.floor(spec.frontHeight - 40))
          );
        }
      }
      const existing = boxGroups.get(boxH);
      if (existing) {
        existing.count += 1;
        existing.isCustomHeight = existing.isCustomHeight || isCustom;
      } else {
        boxGroups.set(boxH, { count: 1, isCustomHeight: isCustom });
      }
    }

    const mainSidesTotalTh = Math.round(2 * thickness * 10) / 10;

    boxGroups.forEach(({ count: n, isCustomHeight }, boxH) => {
      const sidesQty = 2 * n * cabinetCount;
      const frontBackQty = 2 * n * cabinetCount;
      const hNote = isCustomHeight
        ? ' (hauteur tiroir choisie)'
        : useFrontHeights
        ? ' (hauteur façade - 40 mm)'
        : '';
      const sidesPartId = `drawer_sides_${boxH}`;
      const frontBackPartId = `drawer_front_back_${boxH}`;

      const sidesMat = getPartMat(
        sidesPartId,
        getPartMat('drawer_sides', getPartMat('drawers', resolvedDrawerMaterial))
      );
      // Épaisseur des côtés droit et gauche du caisson tiroir (extraite de la matière des côtés du tiroir ou égale à l'épaisseur du caisson)
      const drawerWallTh = extractThicknessFromMaterialName(sidesMat) || thickness;
      const drawerSidesTotalTh = Math.round(2 * drawerWallTh * 10) / 10;
      // Largeur avant/arrière = largeur caisson - 2×ép. côtés caisson - 2×ép. coulisses - 2×ép. côtés tiroir
      const drawerInnerW = Math.max(
        50,
        Math.round((drawerOuterW - drawerSidesTotalTh) * 10) / 10
      );

      // Côtés de tiroir
      pieces.push({
        partKey: 'drawers',
        partId: sidesPartId,
        role: `Côtés de tiroir (${n} tiroir${n > 1 ? 's' : ''}, H ${boxH} mm, coulisses ${slideLen} mm)`,
        description: `${config.name} - Côtés tiroir`,
        formula: `Coulisse ${slideLen} mm × H ${boxH} mm${hNote} [2 × ${n} × ${cabinetCount} = ${sidesQty} pcs]`,
        length: Math.max(slideLen, boxH),
        width: Math.min(slideLen, boxH),
        quantity: sidesQty,
        material: sidesMat,
        color: PIECE_COLORS.drawers,
      });

      const widthFormulaDesc =
        partitionsCount > 0
          ? `${compartmentW} - ${slidesTotalTh} (2 coulisses) - ${drawerSidesTotalTh} (côtés tiroir) = ${drawerInnerW} mm`
          : `${width} - ${mainSidesTotalTh} (côtés caisson) - ${slidesTotalTh} (2 coulisses) - ${drawerSidesTotalTh} (côtés tiroir) = ${drawerInnerW} mm`;

      // Avant et arrière de bac tiroir
      pieces.push({
        partKey: 'drawers',
        partId: frontBackPartId,
        role: `Avant et arrière de tiroir (${n} tiroir${n > 1 ? 's' : ''}, H ${boxH} mm)`,
        description: `${config.name} - Avant/Arrière tiroir`,
        formula: `${widthFormulaDesc} × H ${boxH} mm${hNote} [2 × ${n} × ${cabinetCount} = ${frontBackQty} pcs]`,
        length: Math.max(drawerInnerW, boxH),
        width: Math.min(drawerInnerW, boxH),
        quantity: frontBackQty,
        material: getPartMat(
          frontBackPartId,
          getPartMat('drawer_front_back', getPartMat('drawers', resolvedDrawerMaterial))
        ),
        color: PIECE_COLORS.drawers,
      });
    });

    // Résolution de la matière et de l'épaisseur des parois du tiroir pour le calcul du fond (rainure = 1/3 épaisseur)
    const anySidesPartId = Array.from(boxGroups.keys())
      .map((h) => `drawer_sides_${h}`)
      .find((id) => config.partMaterials?.[id]);
    const refSidesMat =
      (anySidesPartId ? config.partMaterials?.[anySidesPartId] : '') ||
      getPartMat('drawer_sides', getPartMat('drawers', resolvedDrawerMaterial));
    const refSidesTh = extractThicknessFromMaterialName(refSidesMat) || thickness;

    const anyFBPartId = Array.from(boxGroups.keys())
      .map((h) => `drawer_front_back_${h}`)
      .find((id) => config.partMaterials?.[id]);
    const refFBMat =
      (anyFBPartId ? config.partMaterials?.[anyFBPartId] : '') ||
      getPartMat('drawer_front_back', getPartMat('drawers', resolvedDrawerMaterial));
    const refFBTh = extractThicknessFromMaterialName(refFBMat) || refSidesTh;

    const refDrawerInnerW = Math.max(
      50,
      Math.round((drawerOuterW - 2 * refSidesTh) * 10) / 10
    );

    const drawerBottomType: DrawerBottomType = config.drawerBottomType || 'groove';
    // Profondeur de la rainure = 1/3 de l'épaisseur de la matière dans laquelle elle est faite
    const autoGrooveDepth = Math.round((refSidesTh / 3) * 10) / 10;
    const grooveDepth =
      config.drawerGrooveDepth && config.drawerGrooveDepth > 0
        ? config.drawerGrooveDepth
        : autoGrooveDepth;

    let bottomW: number;
    let bottomD: number;
    let bottomRole: string;
    let bottomFormula: string;

    if (drawerBottomType === 'applique') {
      // Fond de tiroir posé en applique : dimensions extérieures du tiroir diminuées de 1 mm de chaque côté (droit/gauche, avant/arrière -> -2 mm sur chaque axe)
      bottomW = Math.max(50, Math.round((drawerOuterW - 2) * 10) / 10);
      bottomD = Math.max(50, Math.round((slideLen - 2) * 10) / 10);
      bottomRole = `Fond de tiroir en applique (${dCount} tiroir${dCount > 1 ? 's' : ''}, -1 mm/côté)`;
      bottomFormula = `Applique (-1 mm/côté) : (${drawerOuterW} - 2 = ${bottomW} mm) × (${slideLen} - 2 = ${bottomD} mm) [1 × ${dCount} × ${cabinetCount} = ${bottomQty} pcs]`;
    } else {
      // Fond de tiroir encastré en rainure : cote intérieure + 2 × profondeur de rainure (1/3 ép.) - 1 mm de chaque côté (-2 mm sur chaque axe)
      const groove2 = Math.round(2 * grooveDepth * 10) / 10;
      const fb2 = Math.round(2 * refFBTh * 10) / 10;
      const innerDepth = Math.round((slideLen - fb2) * 10) / 10;
      bottomW = Math.max(50, Math.round((refDrawerInnerW + groove2 - 2) * 10) / 10);
      bottomD = Math.max(50, Math.round((innerDepth + groove2 - 2) * 10) / 10);
      bottomRole = `Fond de tiroir encastré (${dCount} tiroir${dCount > 1 ? 's' : ''}, rainure ${grooveDepth} mm = 1/3 ép. ${refSidesTh} mm, -1 mm/côté)`;
      bottomFormula = `Encastré rainure ${grooveDepth} mm (-1 mm/côté) : (${refDrawerInnerW} + 2×${grooveDepth} - 2 = ${bottomW} mm) × (${slideLen} - ${fb2} + 2×${grooveDepth} - 2 = ${bottomD} mm) [1 × ${dCount} × ${cabinetCount} = ${bottomQty} pcs]`;
    }

    // Fond de tiroir
    pieces.push({
      partKey: 'drawers',
      partId: 'drawer_bottom',
      role: bottomRole,
      description: `${config.name} - Fond tiroir`,
      formula: bottomFormula,
      length: Math.max(bottomW, bottomD),
      width: Math.min(bottomW, bottomD),
      quantity: bottomQty,
      material: getPartMat('drawer_bottom', getPartMat('drawers', resolvedDrawerMaterial)),
      color: PIECE_COLORS.drawers,
    });
  }

  const finalConfig: CabinetConfig = {
    ...config,
    shelfRecess: 5,
    ...(resolvedDrawerSlideLen !== undefined
      ? { drawerSlideLength: resolvedDrawerSlideLen }
      : {}),
  };

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
    cabinetConfig: { ...finalConfig },
  }));

  return {
    config: finalConfig,
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
 * Corrige automatiquement les pièces de tiroirs des caissons existants sauvegardés
 * lorsque :
 * 1) La longueur des côtés/fond de tiroir dépassait la profondeur du caisson (ex: 500 mm pour un caisson de 450 mm)
 * 2) L'avant/arrière de tiroir avait été calculé avec une épaisseur de paroi fixe de 15 mm (2×15 = 30 mm)
 *    au lieu de l'épaisseur réelle des côtés du tiroir (ex: 2×18 = 36 mm).
 */
export function repairSavedCabinetDrawers(items: CutItem[]): {
  items: CutItem[];
  modified: boolean;
} {
  if (!items || items.length === 0) {
    return { items, modified: false };
  }

  let modified = false;
  const nextItems = items.map((item) => {
    const cfg = item.cabinetConfig;
    if (!cfg || !cfg.depth || !cfg.width) return item;

    const nameLower = item.name.toLowerCase();
    const isDrawerPiece =
      nameLower.includes('côtés tiroir') ||
      nameLower.includes('cotes tiroir') ||
      nameLower.includes('avant/arrière tiroir') ||
      nameLower.includes('avant/arriere tiroir') ||
      nameLower.includes('fond tiroir');

    const isShelfPiece =
      nameLower.includes('étagère') ||
      nameLower.includes('etagere') ||
      nameLower.includes('tablette');

    const cabBackItem = items.find(
      (it) =>
        it.cabinetConfig?.name === cfg.name &&
        (it.name.toLowerCase().includes('fond') || it.name.toLowerCase().includes('dos')) &&
        !it.name.toLowerCase().includes('tiroir')
    );
    const effectiveBackMat =
      cabBackItem?.material ||
      cfg.partMaterials?.['back'] ||
      cfg.backMaterial ||
      '';
    const effectiveBackTh =
      extractThicknessFromMaterialName(effectiveBackMat) ||
      (cfg.backThickness && cfg.backThickness > 0 ? cfg.backThickness : 8);
    const isGrooveBack =
      cfg.backType === 'groove' ||
      Boolean(cabBackItem && cabBackItem.name.toLowerCase().includes('encastr'));

    const backTh = isGrooveBack ? effectiveBackTh : 0;
    const interiorDepth = cfg.depth - backTh;
    const maxAllowedSlideLen = Math.max(100, interiorDepth - 10);
    const autoSlideLen = Math.min(
      maxAllowedSlideLen,
      Math.min(600, Math.max(150, Math.floor((cfg.depth - 50) / 50) * 50))
    );
    const oldSlideLen = cfg.drawerSlideLength || 500;
    const resolvedSlideLen =
      oldSlideLen > 0 && oldSlideLen <= maxAllowedSlideLen
        ? oldSlideLen
        : autoSlideLen;

    if (isShelfPiece) {
      const mainTh = cfg.thickness && cfg.thickness > 0 ? cfg.thickness : 18;
      const interiorW = cfg.width - 2 * mainTh;
      const pCount = cfg.partitionsCount && cfg.partitionsCount > 0 ? cfg.partitionsCount : 0;
      const expectedShelfW =
        pCount > 0
          ? Math.floor((interiorW - pCount * mainTh) / (pCount + 1))
          : interiorW;
      const expectedShelfD = Math.max(
        50,
        (isGrooveBack ? cfg.depth - effectiveBackTh : cfg.depth) - 5
      );
      const expL = Math.max(expectedShelfW, expectedShelfD);
      const expW = Math.min(expectedShelfW, expectedShelfD);

      if (
        item.length !== expL ||
        item.width !== expW ||
        cfg.shelfRecess !== 5 ||
        (cfg.drawerSlideLength && cfg.drawerSlideLength > maxAllowedSlideLen)
      ) {
        modified = true;
        return {
          ...item,
          length: expL,
          width: expW,
          cabinetConfig: {
            ...cfg,
            shelfRecess: 5,
            ...(cfg.drawerSlideLength && cfg.drawerSlideLength > maxAllowedSlideLen
              ? { drawerSlideLength: resolvedSlideLen }
              : {}),
          },
        };
      }
      return item;
    }

    if (!isDrawerPiece) {
      if (
        (cfg.drawerSlideLength && cfg.drawerSlideLength > maxAllowedSlideLen) ||
        cfg.shelfRecess !== 5
      ) {
        modified = true;
        return {
          ...item,
          cabinetConfig: {
            ...cfg,
            shelfRecess: 5,
            ...(cfg.drawerSlideLength && cfg.drawerSlideLength > maxAllowedSlideLen
              ? { drawerSlideLength: resolvedSlideLen }
              : {}),
          },
        };
      }
      return item;
    }

    const mainTh = cfg.thickness && cfg.thickness > 0 ? cfg.thickness : 18;
    const interiorWidth = cfg.width - 2 * mainTh;
    const pCount = cfg.partitionsCount && cfg.partitionsCount > 0 ? cfg.partitionsCount : 0;
    const compartmentW =
      pCount > 0
        ? Math.round(((interiorWidth - pCount * mainTh) / (pCount + 1)) * 10) / 10
        : interiorWidth;
    const slideTh =
      cfg.drawerSlideThickness && cfg.drawerSlideThickness > 0
        ? cfg.drawerSlideThickness
        : 13;
    const slidesTotalTh = Math.round(2 * slideTh * 10) / 10;
    const drawerOuterW = Math.max(50, Math.round((compartmentW - slidesTotalTh) * 10) / 10);

    const cabName = cfg.name;
    const drawerSidesItem = items.find(
      (it) =>
        it.cabinetConfig?.name === cabName &&
        (it.name.toLowerCase().includes('côtés tiroir') ||
          it.name.toLowerCase().includes('cotes tiroir'))
    );
    const drawerSidesMat =
      drawerSidesItem?.material ||
      cfg.partMaterials?.['drawer_sides'] ||
      cfg.drawerMaterial ||
      item.material ||
      cfg.material ||
      '';
    const drawerWallTh = extractThicknessFromMaterialName(drawerSidesMat) || mainTh;
    const drawerSidesTotalTh = Math.round(2 * drawerWallTh * 10) / 10;
    const trueInnerW = Math.max(50, Math.round((drawerOuterW - drawerSidesTotalTh) * 10) / 10);
    const oldInnerW15 = Math.max(50, Math.round((drawerOuterW - 30) * 10) / 10);

    let newL = item.length;
    let newW = item.width;

    if (nameLower.includes('côtés tiroir') || nameLower.includes('cotes tiroir')) {
      if (oldSlideLen > maxAllowedSlideLen) {
        if (Math.abs(item.length - oldSlideLen) <= 1) {
          const boxH = item.width;
          newL = Math.max(resolvedSlideLen, boxH);
          newW = Math.min(resolvedSlideLen, boxH);
        } else if (Math.abs(item.width - oldSlideLen) <= 1) {
          const boxH = item.length;
          newL = Math.max(resolvedSlideLen, boxH);
          newW = Math.min(resolvedSlideLen, boxH);
        }
      }
    } else if (
      nameLower.includes('avant/arrière tiroir') ||
      nameLower.includes('avant/arriere tiroir')
    ) {
      if (Math.abs(item.length - oldInnerW15) <= 0.5) {
        const boxH = item.width;
        newL = Math.max(trueInnerW, boxH);
        newW = Math.min(trueInnerW, boxH);
      } else if (Math.abs(item.width - oldInnerW15) <= 0.5) {
        const boxH = item.length;
        newL = Math.max(trueInnerW, boxH);
        newW = Math.min(trueInnerW, boxH);
      }
    } else if (nameLower.includes('fond tiroir')) {
      const bType: DrawerBottomType = cfg.drawerBottomType || 'groove';
      const autoGrv = Math.round((drawerWallTh / 3) * 10) / 10;
      const grv = cfg.drawerGrooveDepth && cfg.drawerGrooveDepth > 0 ? cfg.drawerGrooveDepth : autoGrv;
      const calcBottomW =
        bType === 'applique'
          ? Math.max(50, Math.round((drawerOuterW - 2) * 10) / 10)
          : Math.max(50, Math.round((trueInnerW + 2 * grv - 2) * 10) / 10);
      const calcBottomD =
        bType === 'applique'
          ? Math.max(50, Math.round((resolvedSlideLen - 2) * 10) / 10)
          : Math.max(50, Math.round((resolvedSlideLen - 2 * drawerWallTh + 2 * grv - 2) * 10) / 10);
      if (
        oldSlideLen > maxAllowedSlideLen ||
        Math.abs(Math.max(item.length, item.width) - Math.max(drawerOuterW, resolvedSlideLen)) <= 1
      ) {
        newL = Math.max(calcBottomW, calcBottomD);
        newW = Math.min(calcBottomW, calcBottomD);
      }
    }

    if (
      newL !== item.length ||
      newW !== item.width ||
      cfg.drawerSlideLength !== resolvedSlideLen
    ) {
      modified = true;
      return {
        ...item,
        length: newL,
        width: newW,
        cabinetConfig: {
          ...cfg,
          drawerSlideLength: resolvedSlideLen,
        },
      };
    }

    return item;
  });

  return { items: nextItems, modified };
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
      !r.includes('tiroir') &&
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
      !r.includes('tiroir') &&
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

  const shelfRecess = 5;

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

