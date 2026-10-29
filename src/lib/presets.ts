import { CutItem, CutSettings, StockPanel } from '@/types/cutting';

export const DEFAULT_SETTINGS: CutSettings = {
  kerf: 3.0, // 3 mm par défaut
  minOffcutWidth: 500, // 500 mm
  minOffcutLength: 500, // 500 mm
};

export interface ProjectPreset {
  id: string;
  name: string;
  description: string;
  settings: CutSettings;
  stockPanels: StockPanel[];
  cutItems: CutItem[];
}

export const PRESETS: ProjectPreset[] = [
  {
    id: 'cuisine-caissons',
    name: 'Caissons Meuble Cuisine (MDF & Contreplaqué)',
    description: 'Ensemble de caissons bas et étagères avec fond de meuble.',
    settings: {
      kerf: 3.0,
      minOffcutWidth: 500,
      minOffcutLength: 500,
    },
    stockPanels: [
      {
        id: 'stock-mdf-1',
        material: 'MDF 19mm',
        length: 2800,
        width: 2070,
        quantity: 2,
      },
      {
        id: 'stock-cp-1',
        material: 'Contreplaqué 5mm',
        length: 2500,
        width: 1220,
        quantity: 1,
      },
    ],
    cutItems: [
      {
        id: 'piece-1',
        name: 'Côté caisson gauche',
        material: 'MDF 19mm',
        length: 720,
        width: 560,
        quantity: 3,
        canRotate: true,
        color: '#3b82f6',
      },
      {
        id: 'piece-2',
        name: 'Côté caisson droit',
        material: 'MDF 19mm',
        length: 720,
        width: 560,
        quantity: 3,
        canRotate: true,
        color: '#2563eb',
      },
      {
        id: 'piece-3',
        name: 'Fond meuble horizontal',
        material: 'MDF 19mm',
        length: 762,
        width: 560,
        quantity: 3,
        canRotate: true,
        color: '#10b981',
      },
      {
        id: 'piece-4',
        name: 'Étagère amovible',
        material: 'MDF 19mm',
        length: 760,
        width: 520,
        quantity: 4,
        canRotate: true,
        color: '#f59e0b',
      },
      {
        id: 'piece-5',
        name: 'Traverse renfort haute',
        material: 'MDF 19mm',
        length: 762,
        width: 100,
        quantity: 6,
        canRotate: true,
        color: '#8b5cf6',
      },
      {
        id: 'piece-6',
        name: 'Dos de meuble (fond)',
        material: 'Contreplaqué 5mm',
        length: 780,
        width: 710,
        quantity: 3,
        canRotate: false, // Respect du fil
        color: '#ec4899',
      },
    ],
  },
  {
    id: 'dressing-placard',
    name: 'Placard / Dressing (Mélaminé Blanc 18mm)',
    description: 'Grande penderie avec montants, étagères et séparateurs.',
    settings: {
      kerf: 3.0,
      minOffcutWidth: 500,
      minOffcutLength: 500,
    },
    stockPanels: [
      {
        id: 'stock-mela-1',
        material: 'Mélaminé Blanc 18mm',
        length: 2800,
        width: 2070,
        quantity: 3,
      },
    ],
    cutItems: [
      {
        id: 'd-1',
        name: 'Grand Montant Extérieur',
        material: 'Mélaminé Blanc 18mm',
        length: 2300,
        width: 550,
        quantity: 2,
        canRotate: false,
        color: '#3b82f6',
      },
      {
        id: 'd-2',
        name: 'Montant Séparateur Central',
        material: 'Mélaminé Blanc 18mm',
        length: 2200,
        width: 550,
        quantity: 1,
        canRotate: false,
        color: '#06b6d4',
      },
      {
        id: 'd-3',
        name: 'Chapeau / Haut meuble',
        material: 'Mélaminé Blanc 18mm',
        length: 1800,
        width: 550,
        quantity: 1,
        canRotate: true,
        color: '#10b981',
      },
      {
        id: 'd-4',
        name: 'Base meuble',
        material: 'Mélaminé Blanc 18mm',
        length: 1800,
        width: 550,
        quantity: 1,
        canRotate: true,
        color: '#84cc16',
      },
      {
        id: 'd-5',
        name: 'Étagères Penderie',
        material: 'Mélaminé Blanc 18mm',
        length: 880,
        width: 540,
        quantity: 6,
        canRotate: true,
        color: '#f59e0b',
      },
    ],
  },
];

