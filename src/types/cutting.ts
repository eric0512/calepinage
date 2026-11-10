export interface SavedProject {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  settings: CutSettings;
  stockPanels: StockPanel[];
  cutItems: CutItem[];
}

export interface CutSettings {
  kerf: number; // Trait de scie en mm (ex: 3.2)
  minOffcutWidth: number; // Largeur min pour chute réutilisable en mm (ex: 200)
  minOffcutLength: number; // Longueur min pour chute réutilisable en mm (ex: 200)
}

export interface StockPanel {
  id: string;
  name?: string;
  material: string; // Ex: "MDF", "Contreplaqué Bouleau"
  thickness?: number; // Épaisseur en mm (ex: 19)
  length: number; // en mm
  width: number; // en mm
  quantity: number; // Quantité disponible
  workshopSourceId?: string; // Si le panneau provient du stock atelier
}

export interface WorkshopItem {
  id: string;
  material: string;
  length: number;
  width: number;
  quantity: number;
}

export type AssemblyType =
  | 'sides_full' // Montants continus (Haut et Bas intérieurs)
  | 'top_bottom_full' // Dessus et Dessous filants (Côtés intérieurs)
  | 'bottom_inside_top_over'; // Bas encastré entre côtés, Dessus posé sur côtés (avec ou sans débord)
export type BackType = 'none' | 'applique' | 'groove';
export type DoorsType = 'none' | 'one_door' | 'two_doors';
export type FacadePlacement = 'applique' | 'interieur';
export type FacadeItemType = 'porte' | 'tiroir';

export interface FacadeItem {
  type: FacadeItemType; // Porte ou façade de tiroir
  height: number | null; // Hauteur saisie (mm) ou null = calcul automatique
}

export interface CabinetConfig {
  name: string;
  height: number; // Hauteur extérieure (mm)
  width: number; // Largeur extérieure (mm)
  depth: number; // Profondeur extérieure (mm)
  thickness: number; // Épaisseur des panneaux principaux (mm, ex: 18 ou 19)
  assemblyType: AssemblyType; // Type d'assemblage
  topOverhangSides?: number; // Débord latéral du plateau haut (gauche et droite, en mm, ex: 20)
  topOverhangFront?: number; // Débord avant du plateau haut (en mm, ex: 20)
  topOverhangBack?: number; // Débord arrière du plateau haut (en mm, défaut: 0)
  backType: BackType; // Fond : aucun, applique arrière, ou en rainure
  backThickness: number; // Épaisseur du fond (mm, ex: 8 ou 10)
  shelvesCount: number; // Nombre d'étagères par compartiment
  shelfRecess: number; // Retrait de l'étagère par rapport à la façade (mm, ex: 20)
  partitionsCount: number; // Séparations verticales (de 0 à 4)
  doors: DoorsType; // Portes en applique
  material: string; // Matière principale
  sidesMaterial?: string; // Matière spécifique des côtés
  topMaterial?: string; // Matière spécifique du plateau du haut
  bottomMaterial?: string; // Matière spécifique du plateau du bas
  partitionsMaterial?: string; // Matière spécifique des séparations verticales
  shelvesMaterial?: string; // Matière spécifique des étagères
  backMaterial?: string; // Matière du fond
  doorMaterial?: string; // Matière des portes
  drawerMaterial?: string; // Matière des tiroirs
  cabinetCount?: number; // Nombre de caissons identiques à fabriquer

  // Composition détaillée du meuble (façades & tiroirs)
  hasFacades?: boolean;
  facadesCount?: number; // Nombre de composants de façade (0 si aucune)
  facadePlacement?: FacadePlacement; // 'applique' ou 'interieur'
  facadeGap?: number; // Espace entre composants de façade (mm)
  // Composition détaillée de la façade, du haut vers le bas (composants empilés sur toute la largeur).
  // height = null → hauteur calculée automatiquement (espace restant, jeux et espacements déduits)
  facadeItems?: FacadeItem[];
  hasDrawers?: boolean;
  drawersCount?: number; // Nombre de tiroirs (0 si aucun)
  drawerSlideThickness?: number; // Épaisseur des coulisses (mm par côté, ex: 13)
  drawerSlideLength?: number; // Longueur des coulisses (mm)
}

export interface CutItem {
  id: string;
  name: string; // Étiquette / Nom de la pièce
  material: string; // Matière correspondante
  thickness?: number; // Épaisseur en mm (ex: 19)
  length: number; // en mm
  width: number; // en mm
  quantity: number; // Quantité requise
  canRotate: boolean; // Autoriser rotation (si le sens du fil du bois le permet)
  color?: string; // Couleur d'identification visuelle
  cabinetConfig?: CabinetConfig; // Configuration et dimensions du caisson associé
}

export interface PlacedPiece {
  id: string;
  itemId: string;
  name: string;
  material: string;
  x: number;
  y: number;
  length: number; // Dimension le long de l'axe X
  width: number; // Dimension le long de l'axe Y
  originalLength: number;
  originalWidth: number;
  rotated: boolean;
  color: string;
}

export interface OffcutArea {
  id: string;
  x: number;
  y: number;
  length: number;
  width: number;
  reusable: boolean;
  areaM2: number;
}

export interface CutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isKerf?: boolean;
}

export interface PanelResult {
  panelId: string;
  workshopSourceId?: string;
  panelName?: string;
  panelIndex: number;
  material: string;
  panelLength: number;
  panelWidth: number;
  placedPieces: PlacedPiece[];
  offcuts: OffcutArea[];
  cutLines: CutLine[];
  usedAreaM2: number;
  totalAreaM2: number;
  wasteAreaM2: number;
  efficiencyPercentage: number;
}

export interface OptimizationResult {
  panels: PanelResult[];
  unplacedItems: {
    item: CutItem;
    remainingQuantity: number;
    reason: string;
  }[];
  totalPanelsUsed: number;
  totalStockAvailable: number;
  totalUsedAreaM2: number;
  totalPanelsAreaM2: number;
  totalWasteAreaM2: number;
  overallEfficiencyPercentage: number;
  reusableOffcuts: (OffcutArea & { material: string; panelIndex: number })[];
  totalLinearCutM: number;
}

