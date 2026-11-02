/**
 * Utilitaires de libellés de pièces.
 * Convention de nommage : "<Nom du meuble> - <Désignation de la pièce>"
 * Ex : "Meuble bas de 500 - Côtés"
 */

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

