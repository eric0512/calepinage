/**
 * Utilitaires de libellés de pièces.
 * Convention de nommage : "<Nom du meuble> - <Désignation de la pièce>"
 * Ex : "Meuble bas de 500 - Côtés"
 */

export const UNASSIGNED_CABINET_LABEL = 'Pièces diverses';

/** Nom du meuble de destination (ou null si la pièce n'est rattachée à aucun meuble) */
export function getPieceCabinet(name: string): string | null {
  if (!name || !name.includes(' - ')) return null;
  const parts = name.split(' - ');
  parts.pop();
  const cabinet = parts.join(' - ').trim();
  return cabinet || null;
}

/** Désignation de la pièce sans le nom du meuble (ex : "Côtés") */
export function getPiecePart(name: string): string {
  if (!name) return '';
  if (!name.includes(' - ')) return name.trim();
  const parts = name.split(' - ');
  return parts[parts.length - 1].trim() || name.trim();
}

/** Liste des meubles distincts présents sur un ensemble de pièces (ordre d'apparition) */
export function getDistinctCabinets(names: string[]): string[] {
  const seen: string[] = [];
  names.forEach((n) => {
    const c = getPieceCabinet(n);
    if (c && !seen.includes(c)) seen.push(c);
  });
  return seen;
}

export type CabinetSectionKey = 'caisson' | 'facade' | 'tiroir' | 'divers';

export interface CabinetSectionInfo {
  key: CabinetSectionKey;
  title: string;
  subtitle: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

export const SECTION_METAS: Record<CabinetSectionKey, CabinetSectionInfo> = {
  caisson: {
    key: 'caisson',
    title: 'Éléments caisson',
    subtitle: '(côtés, haut et bas, étagères)',
    color: '#3b82f6',
    badgeBg: 'bg-blue-500/15',
    badgeBorder: 'border-blue-500/30',
    badgeText: 'text-blue-300',
  },
  facade: {
    key: 'facade',
    title: 'Éléments façades',
    subtitle: '(portes et tiroir)',
    color: '#06b6d4',
    badgeBg: 'bg-cyan-500/15',
    badgeBorder: 'border-cyan-500/30',
    badgeText: 'text-cyan-300',
  },
  tiroir: {
    key: 'tiroir',
    title: 'Éléments tiroir',
    subtitle: '(côtés droits et gauches, avant arrière, fond)',
    color: '#f97316',
    badgeBg: 'bg-orange-500/15',
    badgeBorder: 'border-orange-500/30',
    badgeText: 'text-orange-300',
  },
  divers: {
    key: 'divers',
    title: 'Autres pièces',
    subtitle: '',
    color: '#94a3b8',
    badgeBg: 'bg-slate-500/15',
    badgeBorder: 'border-slate-500/30',
    badgeText: 'text-slate-300',
  },
};

export interface PieceClassification {
  sectionKey: CabinetSectionKey;
  category: string;
  color: string;
}

/**
 * Classe une pièce selon les 3 sous-groupes demandés :
 * 1. elements caisson (cotés haut et bas, etageres)
 * 2. elements façades (portes et tiroir)
 * 3. elements tiroir (cotés droirts et gauches, avant arriere, fond)
 */
export function classifyPiece(name: string): PieceClassification {
  if (!name || !name.trim()) {
    return { sectionKey: 'divers', category: 'Autres pièces', color: '#94a3b8' };
  }

  let piecePart = name;
  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    piecePart = parts[parts.length - 1].trim();
  }

  const clean = piecePart.toLowerCase().trim();

  // 1. FAÇADES (Portes et Façades de tiroir)
  if (clean.includes('facade') || clean.includes('façade')) {
    if (clean.includes('tiroir')) {
      return {
        sectionKey: 'facade',
        category: 'Façade tiroir',
        color: '#06b6d4',
      };
    }
    return {
      sectionKey: 'facade',
      category: 'Façades',
      color: '#06b6d4',
    };
  }

  if (clean.includes('porte') || clean.includes('battant') || clean.includes('ouvrant')) {
    return {
      sectionKey: 'facade',
      category: 'Portes',
      color: '#06b6d4',
    };
  }

  // 2. ÉLÉMENTS TIROIR (Bacs de tiroir : Côtés droits/gauches, Avant/Arrière, Fond)
  if (clean.includes('tiroir') || clean.includes('coulisse')) {
    if (clean.includes('côté') || clean.includes('cote') || clean.includes('flanc')) {
      return {
        sectionKey: 'tiroir',
        category: 'Côtés tiroir (droits et gauches)',
        color: '#f97316',
      };
    }
    if (clean.includes('avant') || clean.includes('arrière') || clean.includes('arriere')) {
      return {
        sectionKey: 'tiroir',
        category: 'Avant / Arrière tiroir',
        color: '#fb923c',
      };
    }
    if (clean.includes('fond')) {
      return {
        sectionKey: 'tiroir',
        category: 'Fond de tiroir',
        color: '#ea580c',
      };
    }
    return {
      sectionKey: 'tiroir',
      category: 'Éléments tiroir',
      color: '#f97316',
    };
  }

  // 3. ÉLÉMENTS CAISSON (Côtés, Haut et bas, Étagères, Fond, Séparations, etc.)
  if (clean.includes('côté') || clean.includes('cote') || clean.includes('montant') || clean.includes('flanc')) {
    return {
      sectionKey: 'caisson',
      category: 'Côtés',
      color: '#3b82f6',
    };
  }

  if (
    clean.includes('dessus') ||
    clean.includes('dessous') ||
    clean.includes('haut') ||
    clean.includes('bas') ||
    clean.includes('chapeau') ||
    clean.includes('plateau') ||
    clean.includes('plancher') ||
    clean.includes('plafond') ||
    clean.includes('filant')
  ) {
    return {
      sectionKey: 'caisson',
      category: 'Haut et bas',
      color: '#10b981',
    };
  }

  if (
    clean.includes('étagère') ||
    clean.includes('etagere') ||
    clean.includes('tablette') ||
    clean.includes('rayonnage')
  ) {
    return {
      sectionKey: 'caisson',
      category: 'Étagères',
      color: '#f59e0b',
    };
  }

  if (clean.includes('fond') || clean.includes('dos') || clean.includes('arriere') || clean.includes('arrière')) {
    return {
      sectionKey: 'caisson',
      category: 'Fond',
      color: '#ec4899',
    };
  }

  if (
    clean.includes('séparation') ||
    clean.includes('separation') ||
    clean.includes('cloison') ||
    clean.includes('diviseur')
  ) {
    return {
      sectionKey: 'caisson',
      category: 'Séparations & Cloisons',
      color: '#8b5cf6',
    };
  }

  if (
    clean.includes('traverse') ||
    clean.includes('renfort') ||
    clean.includes('plinthe') ||
    clean.includes('bandeau')
  ) {
    return {
      sectionKey: 'caisson',
      category: 'Traverses & Renforts',
      color: '#14b8a6',
    };
  }

  return {
    sectionKey: 'caisson',
    category: piecePart,
    color: '#3b82f6',
  };
}

