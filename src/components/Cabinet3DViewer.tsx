'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Box,
  Ruler,
  Info,
} from 'lucide-react';
import { CabinetConfig } from '@/types/cutting';
import { computeFacadeLayout, getFacadeAvailableHeight } from '@/lib/cabinet-calculator';

export interface Cabinet3DViewerProps {
  config: CabinetConfig;
  className?: string;
  initialViewMode?: 'closed' | 'open' | 'exploded';
  initialAngle?: 'iso_right' | 'iso_left' | 'front' | 'top';
  showControls?: boolean;
  compact?: boolean;
  onOpenFullscreen?: () => void;
}

type Point3D = [number, number, number]; // [x, y, z]

interface Point2D {
  u: number;
  v: number;
  z: number;
}

type FaceType = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

interface Polygon3D {
  id: string;
  name: string;
  category:
    | 'carcass'
    | 'shelf'
    | 'partition'
    | 'back'
    | 'door'
    | 'drawer_front'
    | 'drawer_box'
    | 'slide'
    | 'foot'
    | 'handle';
  dimensionsDesc: string;
  material: string;
  faceType: FaceType;
  points3D: Point3D[];
  baseColor: string;
  strokeColor: string;
  opacity?: number;
}

/** Palette de couleurs pour les matériaux du meuble */
function getMaterialPalette(materialName: string, category: Polygon3D['category']): { base: string; stroke: string } {
  const m = (materialName || '').toLowerCase();

  if (category === 'foot') {
    return { base: '#1e293b', stroke: '#0f172a' };
  }
  if (category === 'slide') {
    return { base: '#94a3b8', stroke: '#64748b' };
  }
  if (category === 'handle') {
    return { base: '#475569', stroke: '#0f172a' };
  }
  if (m.includes('mdf')) {
    return { base: '#d7b896', stroke: '#a27b53' };
  }
  if (m.includes('osb')) {
    return { base: '#dfbe83', stroke: '#a8833d' };
  }
  if (
    m.includes('chene') ||
    m.includes('chêne') ||
    m.includes('oak') ||
    m.includes('bois') ||
    m.includes('wood') ||
    m.includes('hêtre') ||
    m.includes('hetre')
  ) {
    return { base: '#d99b58', stroke: '#996329' };
  }
  if (m.includes('noir') || m.includes('black') || m.includes('anthracite')) {
    return { base: '#334155', stroke: '#1e293b' };
  }
  if (m.includes('mela') || m.includes('blanc') || m.includes('white')) {
    return { base: '#f1f5f9', stroke: '#cbd5e1' };
  }

  // Par défaut : teinte mélaminé clair moderne
  return { base: '#e2e8f0', stroke: '#94a3b8' };
}

/** Nuance d'éclairage selon l'orientation de la face */
function applyLighting(hexColor: string, faceType: FaceType): string {
  // Ajustement de luminosité selon la normale
  const factorMap: Record<FaceType, number> = {
    top: 1.15, // Pleine lumière zénithale
    front: 1.04, // Face principale bien éclairée
    right: 0.92, // Ombrage doux sur le côté droit
    left: 0.82, // Ombrage moyen sur le côté gauche
    back: 0.75, // Arrière dans l'ombre
    bottom: 0.68, // Face inférieure très ombrée
  };
  const factor = factorMap[faceType] ?? 1;

  // Conversion simple hex -> rgb -> ajustement
  let c = hexColor.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  if (isNaN(num)) return hexColor;

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.min(255, Math.max(0, Math.round(r * factor)));
  g = Math.min(255, Math.max(0, Math.round(g * factor)));
  b = Math.min(255, Math.max(0, Math.round(b * factor)));

  return `rgb(${r}, ${g}, ${b})`;
}

/** Génère les 6 faces d'un pavé droit (cuboid) */
function createBoxFaces(
  box: { x1: number; x2: number; y1: number; y2: number; z1: number; z2: number },
  meta: {
    id: string;
    name: string;
    category: Polygon3D['category'];
    dimensionsDesc: string;
    material: string;
    baseColor: string;
    strokeColor: string;
    opacity?: number;
  }
): Polygon3D[] {
  const { x1, x2, y1, y2, z1, z2 } = box;
  return [
    // Front face (Z = z2)
    {
      ...meta,
      faceType: 'front',
      points3D: [
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y2, z2],
        [x1, y2, z2],
      ],
    },
    // Back face (Z = z1)
    {
      ...meta,
      faceType: 'back',
      points3D: [
        [x2, y1, z1],
        [x1, y1, z1],
        [x1, y2, z1],
        [x2, y2, z1],
      ],
    },
    // Left face (X = x1)
    {
      ...meta,
      faceType: 'left',
      points3D: [
        [x1, y1, z1],
        [x1, y1, z2],
        [x1, y2, z2],
        [x1, y2, z1],
      ],
    },
    // Right face (X = x2)
    {
      ...meta,
      faceType: 'right',
      points3D: [
        [x2, y1, z2],
        [x2, y1, z1],
        [x2, y2, z1],
        [x2, y2, z2],
      ],
    },
    // Top face (Y = y2)
    {
      ...meta,
      faceType: 'top',
      points3D: [
        [x1, y2, z2],
        [x2, y2, z2],
        [x2, y2, z1],
        [x1, y2, z1],
      ],
    },
    // Bottom face (Y = y1)
    {
      ...meta,
      faceType: 'bottom',
      points3D: [
        [x1, y1, z1],
        [x2, y1, z1],
        [x2, y1, z2],
        [x1, y1, z2],
      ],
    },
  ];
}

export const Cabinet3DViewer: React.FC<Cabinet3DViewerProps> = ({
  config,
  className = '',
  initialViewMode = 'closed',
  initialAngle = 'iso_right',
  showControls = true,
  onOpenFullscreen,
}) => {
  // Mode d'affichage : 'closed' (assemblé complet) | 'open' (intérieur & tiroirs tirés) | 'exploded' (vue éclatée)
  const [viewMode, setViewMode] = useState<'closed' | 'open' | 'exploded'>(initialViewMode);
  const [anglePreset, setAnglePreset] = useState<'iso_right' | 'iso_left' | 'front' | 'top'>(initialAngle);
  const [showDimensions, setShowDimensions] = useState(true);
  const [hoveredPart, setHoveredPart] = useState<Polygon3D | null>(null);

  // Angles de rotation (radians)
  const [yaw, setYaw] = useState<number>(() =>
    initialAngle === 'iso_right'
      ? (-35 * Math.PI) / 180
      : initialAngle === 'iso_left'
      ? (35 * Math.PI) / 180
      : initialAngle === 'front'
      ? 0
      : 0
  );
  const [pitch, setPitch] = useState<number>(() =>
    initialAngle === 'top' ? (80 * Math.PI) / 180 : (20 * Math.PI) / 180
  );

  // Zoom et translation (Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Changement d'angle prédéfini
  const applyPreset = useCallback((preset: 'iso_right' | 'iso_left' | 'front' | 'top') => {
    setAnglePreset(preset);
    if (preset === 'iso_right') {
      setYaw((-35 * Math.PI) / 180);
      setPitch((20 * Math.PI) / 180);
    } else if (preset === 'iso_left') {
      setYaw((35 * Math.PI) / 180);
      setPitch((20 * Math.PI) / 180);
    } else if (preset === 'front') {
      setYaw(0);
      setPitch(0);
    } else if (preset === 'top') {
      setYaw(0);
      setPitch((80 * Math.PI) / 180);
    }
  }, []);

  const resetView = () => {
    applyPreset('iso_right');
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Dimensions géométriques du caisson
  const W = Math.max(100, config.width || 600);
  const H = Math.max(100, config.height || 1900);
  const D = Math.max(100, config.depth || 350);
  const T = Math.max(10, config.thickness || 18);
  const hasFeet = Boolean(config.hasFeet && (config.feetHeight || 0) > 0);
  const Hfeet = hasFeet ? config.feetHeight || 40 : 0;
  const Hbody = Math.max(50, H - Hfeet);
  const Y0 = Hfeet; // Base inférieure du corps du caisson
  const Ytop = H;

  // Débords éventuels pour l'assemblage mixte
  const overhangSides = config.assemblyType === 'bottom_inside_top_over' ? config.topOverhangSides || 0 : 0;
  const overhangFront = config.assemblyType === 'bottom_inside_top_over' ? config.topOverhangFront || 0 : 0;
  const overhangBack = config.assemblyType === 'bottom_inside_top_over' ? config.topOverhangBack || 0 : 0;

  // Fond
  const backType = config.backType || 'none';
  const backT = Math.max(3, config.backThickness || 8);

  // Déplacement en vue éclatée
  const delta = viewMode === 'exploded' ? 70 : 0;

  // Construction de tous les panneaux 3D du caisson
  const polygons: Polygon3D[] = useMemo(() => {
    const list: Polygon3D[] = [];

    // Matériaux
    const matMain = config.material || 'Mela 19mm';
    const matSides = config.sidesMaterial || matMain;
    const matTop = config.topMaterial || matMain;
    const matBottom = config.bottomMaterial || matMain;
    const matBack = config.backMaterial || 'MDF 8mm';
    const matDoor = config.doorMaterial || matMain;
    const matDrawer = config.drawerMaterial || matMain;

    const palSides = getMaterialPalette(matSides, 'carcass');
    const palTop = getMaterialPalette(matTop, 'carcass');
    const palBottom = getMaterialPalette(matBottom, 'carcass');
    const palBack = getMaterialPalette(matBack, 'back');
    const palDoor = getMaterialPalette(matDoor, 'door');
    const palDrawer = getMaterialPalette(matDrawer, 'drawer_front');
    const palFoot = getMaterialPalette('foot', 'foot');

    // 1. PIEDS SOUS LE MEUBLE
    if (hasFeet && Hfeet > 0) {
      const footW = 40;
      const footD = 40;
      const footInset = 35;
      const feetCoords = [
        { x: footInset, z: footInset, label: 'Pied arrière gauche' },
        { x: W - footInset - footW, z: footInset, label: 'Pied arrière droit' },
        { x: footInset, z: D - footInset - footD, label: 'Pied avant gauche' },
        { x: W - footInset - footW, z: D - footInset - footD, label: 'Pied avant droit' },
      ];

      feetCoords.forEach((fc, idx) => {
        list.push(
          ...createBoxFaces(
            {
              x1: fc.x,
              x2: fc.x + footW,
              y1: 0 - delta * 1.5,
              y2: Hfeet - delta * 0.8,
              z1: fc.z,
              z2: fc.z + footD,
            },
            {
              id: `foot-${idx}`,
              name: `Pied réglable (${idx + 1}/4)`,
              category: 'foot',
              dimensionsDesc: `H: ${Hfeet} mm • Section: ${footW}×${footD} mm`,
              material: 'Pied vérin réglable',
              baseColor: palFoot.base,
              strokeColor: palFoot.stroke,
            }
          )
        );
      });
    }

    // 2. CORPS DU MEUBLE (Côtés, Haut, Bas)
    if (config.assemblyType === 'sides_full') {
      // Montants continus toute hauteur
      // Côté Gauche
      list.push(
        ...createBoxFaces(
          {
            x1: 0 - delta,
            x2: T - delta,
            y1: Y0,
            y2: Ytop,
            z1: 0,
            z2: D,
          },
          {
            id: 'side-left',
            name: 'Côté gauche (Montant)',
            category: 'carcass',
            dimensionsDesc: `${Hbody} × ${D} × ${T} mm`,
            material: matSides,
            baseColor: palSides.base,
            strokeColor: palSides.stroke,
          }
        )
      );

      // Côté Droit
      list.push(
        ...createBoxFaces(
          {
            x1: W - T + delta,
            x2: W + delta,
            y1: Y0,
            y2: Ytop,
            z1: 0,
            z2: D,
          },
          {
            id: 'side-right',
            name: 'Côté droit (Montant)',
            category: 'carcass',
            dimensionsDesc: `${Hbody} × ${D} × ${T} mm`,
            material: matSides,
            baseColor: palSides.base,
            strokeColor: palSides.stroke,
          }
        )
      );

      // Plateau Haut (intérieur entre côtés)
      list.push(
        ...createBoxFaces(
          {
            x1: T,
            x2: W - T,
            y1: Ytop - T + delta,
            y2: Ytop + delta,
            z1: 0,
            z2: D,
          },
          {
            id: 'top-panel',
            name: 'Plateau du haut',
            category: 'carcass',
            dimensionsDesc: `${W - 2 * T} × ${D} × ${T} mm`,
            material: matTop,
            baseColor: palTop.base,
            strokeColor: palTop.stroke,
          }
        )
      );

      // Plateau Bas (intérieur entre côtés)
      list.push(
        ...createBoxFaces(
          {
            x1: T,
            x2: W - T,
            y1: Y0 - delta,
            y2: Y0 + T - delta,
            z1: 0,
            z2: D,
          },
          {
            id: 'bottom-panel',
            name: 'Plateau du bas',
            category: 'carcass',
            dimensionsDesc: `${W - 2 * T} × ${D} × ${T} mm`,
            material: matBottom,
            baseColor: palBottom.base,
            strokeColor: palBottom.stroke,
          }
        )
      );
    } else if (config.assemblyType === 'top_bottom_full') {
      // Dessus et Dessous filants
      // Plateau Haut (plein)
      list.push(
        ...createBoxFaces(
          {
            x1: 0,
            x2: W,
            y1: Ytop - T + delta,
            y2: Ytop + delta,
            z1: 0,
            z2: D,
          },
          {
            id: 'top-panel',
            name: 'Plateau du haut (Filant)',
            category: 'carcass',
            dimensionsDesc: `${W} × ${D} × ${T} mm`,
            material: matTop,
            baseColor: palTop.base,
            strokeColor: palTop.stroke,
          }
        )
      );

      // Plateau Bas (plein)
      list.push(
        ...createBoxFaces(
          {
            x1: 0,
            x2: W,
            y1: Y0 - delta,
            y2: Y0 + T - delta,
            z1: 0,
            z2: D,
          },
          {
            id: 'bottom-panel',
            name: 'Plateau du bas (Filant)',
            category: 'carcass',
            dimensionsDesc: `${W} × ${D} × ${T} mm`,
            material: matBottom,
            baseColor: palBottom.base,
            strokeColor: palBottom.stroke,
          }
        )
      );

      // Côté Gauche (intérieur)
      list.push(
        ...createBoxFaces(
          {
            x1: 0 - delta,
            x2: T - delta,
            y1: Y0 + T,
            y2: Ytop - T,
            z1: 0,
            z2: D,
          },
          {
            id: 'side-left',
            name: 'Côté gauche (Intérieur)',
            category: 'carcass',
            dimensionsDesc: `${Hbody - 2 * T} × ${D} × ${T} mm`,
            material: matSides,
            baseColor: palSides.base,
            strokeColor: palSides.stroke,
          }
        )
      );

      // Côté Droit (intérieur)
      list.push(
        ...createBoxFaces(
          {
            x1: W - T + delta,
            x2: W + delta,
            y1: Y0 + T,
            y2: Ytop - T,
            z1: 0,
            z2: D,
          },
          {
            id: 'side-right',
            name: 'Côté droit (Intérieur)',
            category: 'carcass',
            dimensionsDesc: `${Hbody - 2 * T} × ${D} × ${T} mm`,
            material: matSides,
            baseColor: palSides.base,
            strokeColor: palSides.stroke,
          }
        )
      );
    } else {
      // Mixte : Bas encastré & Dessus posé avec éventuels débords
      // Plateau Haut (avec débords)
      list.push(
        ...createBoxFaces(
          {
            x1: -overhangSides,
            x2: W + overhangSides,
            y1: Ytop - T + delta,
            y2: Ytop + delta,
            z1: -overhangBack,
            z2: D + overhangFront,
          },
          {
            id: 'top-panel',
            name: 'Plateau du haut (Posé)',
            category: 'carcass',
            dimensionsDesc: `${W + 2 * overhangSides} × ${D + overhangFront + overhangBack} × ${T} mm`,
            material: matTop,
            baseColor: palTop.base,
            strokeColor: palTop.stroke,
          }
        )
      );

      // Côtés (sous le plateau)
      list.push(
        ...createBoxFaces(
          {
            x1: 0 - delta,
            x2: T - delta,
            y1: Y0,
            y2: Ytop - T,
            z1: 0,
            z2: D,
          },
          {
            id: 'side-left',
            name: 'Côté gauche',
            category: 'carcass',
            dimensionsDesc: `${Hbody - T} × ${D} × ${T} mm`,
            material: matSides,
            baseColor: palSides.base,
            strokeColor: palSides.stroke,
          }
        )
      );

      list.push(
        ...createBoxFaces(
          {
            x1: W - T + delta,
            x2: W + delta,
            y1: Y0,
            y2: Ytop - T,
            z1: 0,
            z2: D,
          },
          {
            id: 'side-right',
            name: 'Côté droit',
            category: 'carcass',
            dimensionsDesc: `${Hbody - T} × ${D} × ${T} mm`,
            material: matSides,
            baseColor: palSides.base,
            strokeColor: palSides.stroke,
          }
        )
      );

      // Plateau Bas (encastré entre côtés)
      list.push(
        ...createBoxFaces(
          {
            x1: T,
            x2: W - T,
            y1: Y0 - delta,
            y2: Y0 + T - delta,
            z1: 0,
            z2: D,
          },
          {
            id: 'bottom-panel',
            name: 'Plateau du bas (Encastré)',
            category: 'carcass',
            dimensionsDesc: `${W - 2 * T} × ${D} × ${T} mm`,
            material: matBottom,
            baseColor: palBottom.base,
            strokeColor: palBottom.stroke,
          }
        )
      );
    }

    // 3. FOND DU CAISSON
    if (backType === 'applique') {
      list.push(
        ...createBoxFaces(
          {
            x1: 0,
            x2: W,
            y1: Y0,
            y2: Ytop,
            z1: -backT - delta,
            z2: 0 - delta,
          },
          {
            id: 'back-panel',
            name: 'Fond (Applique arrière)',
            category: 'back',
            dimensionsDesc: `${Hbody} × ${W} × ${backT} mm`,
            material: matBack,
            baseColor: palBack.base,
            strokeColor: palBack.stroke,
          }
        )
      );
    } else if (backType === 'groove') {
      list.push(
        ...createBoxFaces(
          {
            x1: T - 5,
            x2: W - T + 5,
            y1: Y0 + T - 5,
            y2: Ytop - T + 5,
            z1: 15 - delta,
            z2: 15 + backT - delta,
          },
          {
            id: 'back-panel',
            name: 'Fond (Encastré en rainure)',
            category: 'back',
            dimensionsDesc: `${Hbody - 2 * T + 10} × ${W - 2 * T + 10} × ${backT} mm`,
            material: matBack,
            baseColor: palBack.base,
            strokeColor: palBack.stroke,
          }
        )
      );
    }

    // Délimitation du volume intérieur
    const intX1 = T;
    const intX2 = W - T;
    const intY1 = Y0 + T;
    const intY2 = config.assemblyType === 'top_bottom_full' ? Ytop - T : Ytop - T;
    const intW = intX2 - intX1;
    const intH = intY2 - intY1;
    const intZ1 = backType === 'groove' ? 15 + backT : 0;
    const intZ2 = D;

    // 4. SÉPARATIONS VERTICALES (Partitions)
    const P = Math.max(0, config.partitionsCount || 0);
    const compW = P > 0 ? (intW - P * T) / (P + 1) : intW;

    if (P > 0) {
      for (let pIdx = 0; pIdx < P; pIdx++) {
        const partX1 = intX1 + (pIdx + 1) * compW + pIdx * T;
        const partX2 = partX1 + T;
        list.push(
          ...createBoxFaces(
            {
              x1: partX1,
              x2: partX2,
              y1: intY1,
              y2: intY2,
              z1: intZ1,
              z2: intZ2,
            },
            {
              id: `partition-${pIdx}`,
              name: `Séparation verticale (${pIdx + 1}/${P})`,
              category: 'partition',
              dimensionsDesc: `${intH} × ${intZ2 - intZ1} × ${T} mm`,
              material: config.partitionsMaterial || matMain,
              baseColor: palSides.base,
              strokeColor: palSides.stroke,
            }
          )
        );
      }
    }

    // 5. FAÇADES (Portes & Tiroirs)
    const hasDetailedFacades = Boolean(config.hasFacades && config.facadeItems && config.facadeItems.length > 0);
    const isApplique = config.facadePlacement !== 'interieur';
    const facadeGap = config.facadeGap !== undefined ? config.facadeGap : 2;
    const facadeAvailH = getFacadeAvailableHeight(Hbody, T, config.facadePlacement);
    const facadeLayout = hasDetailedFacades
      ? computeFacadeLayout(config.facadeItems || [], facadeAvailH, facadeGap)
      : null;

    const facadeZ1 = isApplique ? D + delta : D - T;
    const facadeZ2 = isApplique ? D + T + delta : D;
    const facadeX1 = isApplique ? 2 : intX1 + 2;
    const facadeX2 = isApplique ? W - 2 : intX2 - 2;
    const facadeW = facadeX2 - facadeX1;

    // Hauteur de départ en haut
    let currentYTop = isApplique ? Ytop - 2 : intY2 - 2;

    if (hasDetailedFacades && config.facadeItems && facadeLayout) {
      config.facadeItems.forEach((item, fIdx) => {
        const itemH = Math.max(30, facadeLayout.heights[fIdx] || 100);
        const itemY2 = currentYTop;
        const itemY1 = itemY2 - itemH;
        currentYTop = itemY1 - facadeGap;

        const isDoor = item.type === 'porte';
        const isDrawer = item.type === 'tiroir';

        // En mode ouvert :
        // - Porte : transparence pour voir l'intérieur
        // - Tiroir : tiré vers l'avant (déplacement Z) avec son bac et ses coulisses
        const drawerPullZ = viewMode === 'open' && isDrawer ? 90 : 0;
        const doorOpacity = viewMode === 'open' && isDoor ? 0.3 : 1;

        if (isDoor) {
          // Panneau de la porte
          list.push(
            ...createBoxFaces(
              {
                x1: facadeX1,
                x2: facadeX2,
                y1: itemY1,
                y2: itemY2,
                z1: facadeZ1,
                z2: facadeZ2,
              },
              {
                id: `facade-${fIdx}`,
                name: `Porte battante #${fIdx + 1} (Haut en Bas)`,
                category: 'door',
                dimensionsDesc: `${itemH} × ${facadeW} × ${T} mm`,
                material: matDoor,
                baseColor: palDoor.base,
                strokeColor: palDoor.stroke,
                opacity: doorOpacity,
              }
            )
          );

          // Poignée verticale moderne sur la porte (fermée)
          if (viewMode !== 'open') {
            const handleW = 10;
            const handleH = Math.min(130, Math.max(50, itemH * 0.3));
            const handleD = 18;
            const handleX = facadeX2 - 35;
            const handleY = itemY1 + (itemH - handleH) / 2;

            list.push(
              ...createBoxFaces(
                {
                  x1: handleX,
                  x2: handleX + handleW,
                  y1: handleY,
                  y2: handleY + handleH,
                  z1: facadeZ2,
                  z2: facadeZ2 + handleD,
                },
                {
                  id: `handle-door-${fIdx}`,
                  name: `Poignée porte #${fIdx + 1}`,
                  category: 'handle',
                  dimensionsDesc: `${handleH} mm`,
                  material: 'Alu brossé / Noir',
                  baseColor: '#334155',
                  strokeColor: '#0f172a',
                }
              )
            );
          }

          // Étagères intérieures derrière cette porte
          const shelvesInDoor = item.shelvesCount !== undefined ? item.shelvesCount : (fIdx === 0 ? Math.min(3, config.shelvesCount || 0) : 0);
          if (shelvesInDoor > 0) {
            const shelfStep = (itemH - 20) / (shelvesInDoor + 1);
            for (let s = 1; s <= shelvesInDoor; s++) {
              const sY = Math.max(intY1 + 10, itemY1 + s * shelfStep);
              const sD = Math.max(50, intZ2 - intZ1 - (config.shelfRecess || 20));

              list.push(
                ...createBoxFaces(
                  {
                    x1: intX1 + 2,
                    x2: intX2 - 2,
                    y1: sY,
                    y2: sY + T,
                    z1: intZ1,
                    z2: intZ1 + sD,
                  },
                  {
                    id: `shelf-door-${fIdx}-${s}`,
                    name: `Étagère (${s}/${shelvesInDoor}) sous porte #${fIdx + 1}`,
                    category: 'shelf',
                    dimensionsDesc: `${intW - 4} × ${sD} × ${T} mm`,
                    material: config.shelvesMaterial || matMain,
                    baseColor: palTop.base,
                    strokeColor: palTop.stroke,
                  }
                )
              );
            }
          }
        } else if (isDrawer) {
          // Façade du tiroir
          const fZ1 = facadeZ1 + drawerPullZ;
          const fZ2 = facadeZ2 + drawerPullZ;

          list.push(
            ...createBoxFaces(
              {
                x1: facadeX1,
                x2: facadeX2,
                y1: itemY1,
                y2: itemY2,
                z1: fZ1,
                z2: fZ2,
              },
              {
                id: `facade-${fIdx}`,
                name: `Façade tiroir #${fIdx + 1} (Haut en Bas)`,
                category: 'drawer_front',
                dimensionsDesc: `${itemH} × ${facadeW} × ${T} mm • Bac: ${item.drawerHeight || '--'} mm`,
                material: matDrawer,
                baseColor: palDrawer.base,
                strokeColor: palDrawer.stroke,
              }
            )
          );

          // Poignée horizontale centrée sur la façade de tiroir
          const handleW = Math.min(160, Math.max(70, facadeW * 0.3));
          const handleH = 10;
          const handleD = 18;
          const handleX = (facadeX1 + facadeX2 - handleW) / 2;
          const handleY = itemY1 + (itemH - handleH) / 2;

          list.push(
            ...createBoxFaces(
              {
                x1: handleX,
                x2: handleX + handleW,
                y1: handleY,
                y2: handleY + handleH,
                z1: fZ2,
                z2: fZ2 + handleD,
              },
              {
                id: `handle-drawer-${fIdx}`,
                name: `Poignée tiroir #${fIdx + 1}`,
                category: 'handle',
                dimensionsDesc: `${handleW} mm`,
                material: 'Alu profilé / Noir',
                baseColor: '#334155',
                strokeColor: '#0f172a',
              }
            )
          );

          // En mode ouvert : Bac du tiroir + Coulisses télescopiques
          if (viewMode === 'open') {
            const boxH = Math.min(itemH - 15, Math.max(40, item.drawerHeight || itemH * 0.7));
            const boxT = 15;
            const slideW = config.drawerSlideThickness || 13;
            const boxX1 = intX1 + slideW;
            const boxX2 = intX2 - slideW;
            const boxY1 = itemY1 + 10;
            const boxY2 = boxY1 + boxH;
            const boxDepth = Math.max(150, D - 60);
            const boxZ2 = fZ1;
            const boxZ1 = boxZ2 - boxDepth;

            // Côtés du bac tiroir
            list.push(
              ...createBoxFaces(
                {
                  x1: boxX1,
                  x2: boxX1 + boxT,
                  y1: boxY1,
                  y2: boxY2,
                  z1: boxZ1,
                  z2: boxZ2,
                },
                {
                  id: `drawer-box-left-${fIdx}`,
                  name: `Côté gauche du bac tiroir #${fIdx + 1}`,
                  category: 'drawer_box',
                  dimensionsDesc: `${boxDepth} × ${boxH} × ${boxT} mm`,
                  material: matDrawer,
                  baseColor: palDrawer.base,
                  strokeColor: palDrawer.stroke,
                }
              ),
              ...createBoxFaces(
                {
                  x1: boxX2 - boxT,
                  x2: boxX2,
                  y1: boxY1,
                  y2: boxY2,
                  z1: boxZ1,
                  z2: boxZ2,
                },
                {
                  id: `drawer-box-right-${fIdx}`,
                  name: `Côté droit du bac tiroir #${fIdx + 1}`,
                  category: 'drawer_box',
                  dimensionsDesc: `${boxDepth} × ${boxH} × ${boxT} mm`,
                  material: matDrawer,
                  baseColor: palDrawer.base,
                  strokeColor: palDrawer.stroke,
                }
              ),
              // Avant et arrière du bac
              ...createBoxFaces(
                {
                  x1: boxX1 + boxT,
                  x2: boxX2 - boxT,
                  y1: boxY1,
                  y2: boxY2,
                  z1: boxZ2 - boxT,
                  z2: boxZ2,
                },
                {
                  id: `drawer-box-front-${fIdx}`,
                  name: `Façade avant intérieure tiroir #${fIdx + 1}`,
                  category: 'drawer_box',
                  dimensionsDesc: `${boxX2 - boxX1 - 2 * boxT} × ${boxH} × ${boxT} mm`,
                  material: matDrawer,
                  baseColor: palDrawer.base,
                  strokeColor: palDrawer.stroke,
                }
              ),
              ...createBoxFaces(
                {
                  x1: boxX1 + boxT,
                  x2: boxX2 - boxT,
                  y1: boxY1,
                  y2: boxY2,
                  z1: boxZ1,
                  z2: boxZ1 + boxT,
                },
                {
                  id: `drawer-box-back-${fIdx}`,
                  name: `Dos du bac tiroir #${fIdx + 1}`,
                  category: 'drawer_box',
                  dimensionsDesc: `${boxX2 - boxX1 - 2 * boxT} × ${boxH} × ${boxT} mm`,
                  material: matDrawer,
                  baseColor: palDrawer.base,
                  strokeColor: palDrawer.stroke,
                }
              ),
              // Fond du bac tiroir
              ...createBoxFaces(
                {
                  x1: boxX1,
                  x2: boxX2,
                  y1: boxY1,
                  y2: boxY1 + 6,
                  z1: boxZ1,
                  z2: boxZ2,
                },
                {
                  id: `drawer-box-bottom-${fIdx}`,
                  name: `Fond de tiroir #${fIdx + 1}`,
                  category: 'drawer_box',
                  dimensionsDesc: `${boxX2 - boxX1} × ${boxDepth} × 6 mm`,
                  material: 'MDF 6mm / Isorel',
                  baseColor: palBack.base,
                  strokeColor: palBack.stroke,
                }
              ),
              // Coulisses à billes métalliques sur les montants
              ...createBoxFaces(
                {
                  x1: intX1,
                  x2: intX1 + slideW,
                  y1: boxY1 + 10,
                  y2: boxY1 + 32,
                  z1: intZ1 + 20,
                  z2: fZ1 - 10,
                },
                {
                  id: `slide-left-${fIdx}`,
                  name: `Coulisse gauche tiroir #${fIdx + 1}`,
                  category: 'slide',
                  dimensionsDesc: `Épaisseur : ${slideW} mm`,
                  material: 'Acier zingué / Coulisse à billes',
                  baseColor: '#94a3b8',
                  strokeColor: '#64748b',
                }
              ),
              ...createBoxFaces(
                {
                  x1: intX2 - slideW,
                  x2: intX2,
                  y1: boxY1 + 10,
                  y2: boxY1 + 32,
                  z1: intZ1 + 20,
                  z2: fZ1 - 10,
                },
                {
                  id: `slide-right-${fIdx}`,
                  name: `Coulisse droite tiroir #${fIdx + 1}`,
                  category: 'slide',
                  dimensionsDesc: `Épaisseur : ${slideW} mm`,
                  material: 'Acier zingué / Coulisse à billes',
                  baseColor: '#94a3b8',
                  strokeColor: '#64748b',
                }
              )
            );
          }
        }
      });
    } else {
      // Pas de façades détaillées configurées : étagères standards réparties
      const S = Math.max(0, config.shelvesCount || 0);
      if (S > 0) {
        const step = intH / (S + 1);
        const sD = Math.max(50, intZ2 - intZ1 - (config.shelfRecess || 20));

        for (let sIdx = 0; sIdx < S; sIdx++) {
          const sY = intY1 + (sIdx + 1) * step;

          if (P > 0) {
            for (let cIdx = 0; cIdx <= P; cIdx++) {
              const cX1 = intX1 + cIdx * (compW + T);
              const cX2 = cX1 + compW;
              list.push(
                ...createBoxFaces(
                  {
                    x1: cX1,
                    x2: cX2,
                    y1: sY,
                    y2: sY + T,
                    z1: intZ1,
                    z2: intZ1 + sD,
                  },
                  {
                    id: `shelf-${sIdx}-${cIdx}`,
                    name: `Étagère (${sIdx + 1}/${S}, comp. ${cIdx + 1})`,
                    category: 'shelf',
                    dimensionsDesc: `${compW} × ${sD} × ${T} mm`,
                    material: config.shelvesMaterial || matMain,
                    baseColor: palTop.base,
                    strokeColor: palTop.stroke,
                  }
                )
              );
            }
          } else {
            list.push(
              ...createBoxFaces(
                {
                  x1: intX1,
                  x2: intX2,
                  y1: sY,
                  y2: sY + T,
                  z1: intZ1,
                  z2: intZ1 + sD,
                },
                {
                  id: `shelf-${sIdx}`,
                  name: `Étagère (${sIdx + 1}/${S})`,
                  category: 'shelf',
                  dimensionsDesc: `${intW} × ${sD} × ${T} mm`,
                  material: config.shelvesMaterial || matMain,
                  baseColor: palTop.base,
                  strokeColor: palTop.stroke,
                }
              )
            );
          }
        }
      }
    }

    return list;
  }, [
    config,
    W,
    D,
    T,
    hasFeet,
    Hfeet,
    Hbody,
    Y0,
    Ytop,
    overhangSides,
    overhangFront,
    overhangBack,
    backType,
    backT,
    delta,
    viewMode,
  ]);

  // Centre du meuble pour la rotation 3D
  const cx = W / 2;
  const cy = H / 2;
  const cz = D / 2;

  // Projection 3D -> 2D avec rotation Yaw / Pitch
  const projectPoint = useCallback(
    (p: Point3D): Point2D => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const dz = p[2] - cz;

      // 1. Rotation autour de l'axe Y (Yaw)
      const x1 = dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const z1 = -dx * Math.sin(yaw) + dz * Math.cos(yaw);

      // 2. Rotation autour de l'axe X (Pitch)
      const y2 = dy * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = dy * Math.sin(pitch) + z1 * Math.cos(pitch);

      // SVG Y inversé (vers le bas)
      return { u: x1, v: -y2, z: z2 };
    },
    [cx, cy, cz, yaw, pitch]
  );

  // Aire 2D signée du polygone projeté pour le Back-face Culling
  const computeProjectedArea = (pts: Point2D[]): number => {
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += pts[i].u * pts[j].v - pts[j].u * pts[i].v;
    }
    return a / 2;
  };

  // Traitement et tri des polygones par profondeur (Painter's algorithm)
  const renderedFaces = useMemo(() => {
    const list: {
      poly: Polygon3D;
      pts2D: Point2D[];
      avgZ: number;
      fillColor: string;
      pathData: string;
    }[] = [];

    polygons.forEach((poly) => {
      const pts2D = poly.points3D.map(projectPoint);
      const area = computeProjectedArea(pts2D);

      // Back-face culling : dans notre convention SVG, area < 0 correspond à une face orientée vers l'observateur.
      // Si la face a une opacité < 1 (ex: porte ouverte semi-transparente), on l'affiche même si elle est arrière.
      const isFacingCamera = area < 0;
      if (!isFacingCamera && (!poly.opacity || poly.opacity >= 1)) {
        return;
      }

      const avgZ = pts2D.reduce((s, p) => s + p.z, 0) / pts2D.length;
      const pathData =
        pts2D.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.u.toFixed(2)} ${p.v.toFixed(2)}`).join(' ') +
        ' Z';

      const shadedColor = applyLighting(poly.baseColor, poly.faceType);

      list.push({
        poly,
        pts2D,
        avgZ,
        fillColor: shadedColor,
        pathData,
      });
    });

    // Tri arrière vers avant (plus petit Z d'abord, plus grand Z en dernier)
    list.sort((a, b) => a.avgZ - b.avgZ);
    return list;
  }, [polygons, projectPoint]);

  // Cotes 3D projetées (Dimensions extérieures principales)
  const dimensionLines = useMemo(() => {
    if (!showDimensions) return [];

    const lines: {
      p1: Point2D;
      p2: Point2D;
      label: string;
      color: string;
      offsetSide?: 'left' | 'right' | 'top' | 'bottom';
    }[] = [];

    // 1. Largeur totale W (en haut ou bas avant)
    const wP1 = projectPoint([0, Ytop + 30, D]);
    const wP2 = projectPoint([W, Ytop + 30, D]);
    lines.push({
      p1: wP1,
      p2: wP2,
      label: `L = ${W} mm`,
      color: '#38bdf8', // Cyan
      offsetSide: 'top',
    });

    // 2. Hauteur totale H (sur le côté gauche)
    const hP1 = projectPoint([-35, 0, D]);
    const hP2 = projectPoint([-35, H, D]);
    lines.push({
      p1: hP1,
      p2: hP2,
      label: hasFeet ? `H = ${H} mm (Corps : ${Hbody} mm)` : `H = ${H} mm`,
      color: '#f59e0b', // Ambre
      offsetSide: 'left',
    });

    // 3. Pieds (si présents)
    if (hasFeet && Hfeet > 0) {
      const fP1 = projectPoint([-20, 0, D]);
      const fP2 = projectPoint([-20, Hfeet, D]);
      lines.push({
        p1: fP1,
        p2: fP2,
        label: `Pieds : ${Hfeet} mm`,
        color: '#fbbf24',
        offsetSide: 'left',
      });
    }

    // 4. Profondeur D (sur le flanc bas droit)
    const dP1 = projectPoint([W + 25, Y0, D]);
    const dP2 = projectPoint([W + 25, Y0, 0]);
    lines.push({
      p1: dP1,
      p2: dP2,
      label: `P = ${D} mm`,
      color: '#10b981', // Émeraude
      offsetSide: 'right',
    });

    return lines;
  }, [showDimensions, projectPoint, W, H, D, Y0, Ytop, hasFeet, Hfeet, Hbody]);

  // Échelle automatique pour cadrer le meuble dans le viewport SVG (600x500)
  const autoScale = useMemo(() => {
    const maxDim = Math.max(W, H, D, 600);
    return 360 / maxDim;
  }, [W, H, D]);

  // Gestion du Pan & Drag
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Zoom à la molette
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(3.5, Math.max(0.4, prev * factor)));
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden select-none ${className}`}
    >
      {/* Barre d'outils supérieure */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm z-20">
          {/* Titre & Dimensions du caisson */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Box className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span>{config.name || 'Caisson assemblé'}</span>
                {hasFeet && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/30">
                    Pieds {Hfeet} mm
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {W} × {H} × {D} mm • Ép. {T} mm
              </div>
            </div>
          </div>

          {/* Boutons d'angles et modes */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Modes d'affichage */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('closed')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'closed'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Caisson fermé avec façades, portes, tiroirs et poignées"
              >
                Assemblé
              </button>
              <button
                type="button"
                onClick={() => setViewMode('open')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'open'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Caisson ouvert : voir l'intérieur, les tiroirs sortis et les coulisses"
              >
                Intérieur
              </button>
              <button
                type="button"
                onClick={() => setViewMode('exploded')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'exploded'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vue éclatée pour visualiser l'assemblage de chaque pièce"
              >
                Éclaté
              </button>
            </div>

            {/* Sélecteur d'angle prédéfini */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => applyPreset('iso_right')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  anglePreset === 'iso_right'
                    ? 'bg-slate-800 text-amber-300 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vue 3D Isométrique Droite (3/4 face)"
              >
                3D Droite
              </button>
              <button
                type="button"
                onClick={() => applyPreset('iso_left')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  anglePreset === 'iso_left'
                    ? 'bg-slate-800 text-amber-300 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vue 3D Isométrique Gauche"
              >
                3D Gauche
              </button>
              <button
                type="button"
                onClick={() => applyPreset('front')}
                className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                  anglePreset === 'front'
                    ? 'bg-slate-800 text-amber-300 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Vue de Face 2D"
              >
                Face 2D
              </button>
            </div>

            {/* Toggle Cotes */}
            <button
              type="button"
              onClick={() => setShowDimensions((prev) => !prev)}
              className={`p-1.5 rounded-lg border text-xs font-semibold transition-all ${
                showDimensions
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Afficher ou masquer les cotes principales"
            >
              <Ruler className="w-4 h-4" />
            </button>

            {/* Plein écran si demandé */}
            {onOpenFullscreen && (
              <button
                type="button"
                onClick={onOpenFullscreen}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all"
                title="Agrandir en plein écran"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Zone Canvas SVG 3D interactif */}
      <div
        className="relative flex-1 w-full min-h-[340px] sm:min-h-[420px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 cursor-grab active:cursor-grabbing overflow-hidden flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Grille de sol de référence */}
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

        <svg
          viewBox="-300 -250 600 500"
          className="w-full h-full overflow-visible transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <defs>
            {/* Filtre d'ombre portée douce */}
            <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#000000" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Ombre globale au sol */}
          <ellipse
            cx="0"
            cy={(cy * autoScale * Math.cos(pitch) + 80).toFixed(0)}
            rx={(W * autoScale * 0.7).toFixed(0)}
            ry={(D * autoScale * 0.35).toFixed(0)}
            fill="#000000"
            opacity="0.35"
          />

          {/* Rendu des polygones 3D triés */}
          <g transform={`scale(${autoScale})`}>
            {renderedFaces.map((item, idx) => {
              const isHovered = hoveredPart?.id === item.poly.id;
              return (
                <path
                  key={`${item.poly.id}-${item.poly.faceType}-${idx}`}
                  d={item.pathData}
                  fill={item.fillColor}
                  stroke={isHovered ? '#38bdf8' : item.poly.strokeColor}
                  strokeWidth={isHovered ? 2.5 : 1}
                  strokeLinejoin="round"
                  opacity={item.poly.opacity ?? 1}
                  className="transition-colors duration-75 cursor-pointer"
                  onMouseEnter={() => setHoveredPart(item.poly)}
                  onMouseLeave={() => setHoveredPart(null)}
                />
              );
            })}

            {/* Lignes de cotes 3D */}
            {dimensionLines.map((dim, idx) => {
              const midU = (dim.p1.u + dim.p2.u) / 2;
              const midV = (dim.p1.v + dim.p2.v) / 2;
              return (
                <g key={`dim-${idx}`} className="select-none pointer-events-none">
                  {/* Ligne de cote */}
                  <line
                    x1={dim.p1.u}
                    y1={dim.p1.v}
                    x2={dim.p2.u}
                    y2={dim.p2.v}
                    stroke={dim.color}
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    opacity="0.85"
                  />
                  {/* Flèches d'extrémité */}
                  <circle cx={dim.p1.u} cy={dim.p1.v} r="2.5" fill={dim.color} />
                  <circle cx={dim.p2.u} cy={dim.p2.v} r="2.5" fill={dim.color} />
                  {/* Badge de cote */}
                  <g transform={`translate(${midU}, ${midV - 8})`}>
                    <rect
                      x="-42"
                      y="-9"
                      width="84"
                      height="18"
                      rx="4"
                      fill="#0f172a"
                      stroke={dim.color}
                      strokeWidth="1"
                      opacity="0.9"
                    />
                    <text
                      x="0"
                      y="3.5"
                      fill={dim.color}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {dim.label}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Info-bulle (Tooltip) au survol d'une pièce */}
        {hoveredPart && (
          <div className="absolute bottom-3 left-3 bg-slate-900/95 border border-slate-700/80 rounded-xl px-3 py-2 text-xs shadow-2xl backdrop-blur-md pointer-events-none z-30 animate-in fade-in duration-100 max-w-xs">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-0.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>{hoveredPart.name}</span>
            </div>
            <div className="text-[11px] font-mono text-white">{hoveredPart.dimensionsDesc}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Matière : <span className="text-slate-300 font-semibold">{hoveredPart.material}</span>
            </div>
          </div>
        )}

        {/* Commandes flottantes de zoom et reset en bas à droite */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1 rounded-xl shadow-lg backdrop-blur-sm z-20">
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.min(3.5, prev * 1.2))}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Zoomer (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((prev) => Math.max(0.4, prev * 0.8))}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Dézoomer (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Réinitialiser la vue et le zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Légende en bas de carte */}
      <div className="p-2.5 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 z-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-400" />
            <span>Panneaux</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500" />
            <span>Façades & Tiroirs</span>
          </span>
          {hasFeet && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-amber-500/50" />
              <span>Pieds ({Hfeet} mm)</span>
            </span>
          )}
          {viewMode === 'open' && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2.5 h-2.5 rounded bg-blue-400" />
              <span>Coulisses métalliques</span>
            </span>
          )}
        </div>

        <div className="text-[10px] text-slate-500 italic">
          Glisser pour déplacer • Molette pour zoomer • Cliquer sur les pièces pour inspecter
        </div>
      </div>
    </div>
  );
};

