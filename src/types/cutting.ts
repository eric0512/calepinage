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
  material: string; // Ex: "MDF 19mm", "Contreplaqué Bouleau 15mm"
  length: number; // en mm
  width: number; // en mm
  quantity: number; // Quantité disponible
}

export interface CutItem {
  id: string;
  name: string; // Étiquette / Nom de la pièce
  material: string; // Matière correspondante
  length: number; // en mm
  width: number; // en mm
  quantity: number; // Quantité requise
  canRotate: boolean; // Autoriser rotation (si le sens du fil du bois le permet)
  color?: string; // Couleur d'identification visuelle
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

