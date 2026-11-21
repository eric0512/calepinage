export const DEFAULT_USERS = ['Éric', 'Christophe'];
const USERS_LIST_KEY = 'calepinage_users_list';
const ACTIVE_USER_KEY = 'calepinage_active_user';

export function normalizeUserKey(name: string): string {
  return (name || 'eric')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'eric';
}

export function getUsersList(): string[] {
  if (typeof window === 'undefined') return DEFAULT_USERS;
  try {
    const raw = localStorage.getItem(USERS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_USERS;
}

export function saveUsersList(users: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USERS_LIST_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

export function getActiveUser(): string {
  if (typeof window === 'undefined') return DEFAULT_USERS[0];
  try {
    const saved = localStorage.getItem(ACTIVE_USER_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore
  }
  return DEFAULT_USERS[0];
}

export function setActiveUserStorage(userName: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_USER_KEY, userName.trim());
  } catch {
    // ignore
  }
}

export function getProjectOwner(project: {
  owner?: string;
  settings?: { owner?: string };
}): string {
  return project.owner || project.settings?.owner || DEFAULT_USERS[0];
}
