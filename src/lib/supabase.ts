import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SavedProject, CutSettings, StockPanel, CutItem, WorkshopItem } from '@/types/cutting';
import { normalizeUserKey } from '@/lib/users';

export const SUPABASE_PROJECT_ID = 'iahzaogwukljmhjdxguv';
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export function getStoredSupabaseKey(): string {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('calepinage_supabase_anon_key');
    if (local && local.trim().length > 10) return local.trim();
  }
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

export function setStoredSupabaseKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key && key.trim().length > 10) {
      localStorage.setItem('calepinage_supabase_anon_key', key.trim());
    } else {
      localStorage.removeItem('calepinage_supabase_anon_key');
    }
  }
}

export const isSupabaseConfigured = (): boolean => {
  const key = getStoredSupabaseKey();
  return Boolean(SUPABASE_URL && key && key.length > 10);
};

let cachedClient: SupabaseClient | null = null;
let lastUsedKey = '';

export function getSupabase(): SupabaseClient | null {
  const currentKey = getStoredSupabaseKey();
  if (!currentKey || currentKey.length < 10) {
    return null;
  }
  if (!cachedClient || lastUsedKey !== currentKey) {
    cachedClient = createClient(SUPABASE_URL, currentKey);
    lastUsedKey = currentKey;
  }
  return cachedClient;
}

export interface DbCuttingProject {
  id: string;
  name: string;
  description?: string;
  settings: CutSettings;
  stock_panels: StockPanel[];
  cut_items: CutItem[];
  updated_at: string;
}

function mapDbToProject(row: DbCuttingProject): SavedProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    owner: row.settings?.owner,
    updatedAt: row.updated_at,
    settings: row.settings,
    stockPanels: row.stock_panels,
    cutItems: row.cut_items,
  };
}

function mapProjectToDb(p: SavedProject): DbCuttingProject {
  const owner = p.owner || p.settings?.owner;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    settings: owner ? { ...p.settings, owner } : p.settings,
    stock_panels: p.stockPanels,
    cut_items: p.cutItems,
    updated_at: new Date().toISOString(),
  };
}

const STOCK_ROW_PREFIX = '__workshop_stock__';

/**
 * Récupérer tous les projets depuis Supabase (avec secours sur localStorage)
 */
export async function getProjects(): Promise<{
  projects: SavedProject[];
  source: 'supabase' | 'local';
}> {
  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client
        .from('cutting_projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const mapped = (data as DbCuttingProject[])
          .filter((row) => !row.id.startsWith(STOCK_ROW_PREFIX))
          .map(mapDbToProject);
        if (typeof window !== 'undefined') {
          localStorage.setItem('calepinage_saved_projects', JSON.stringify(mapped));
        }
        return { projects: mapped, source: 'supabase' };
      } else if (error) {
        console.warn('Supabase fetch error, fallback local:', error.message);
      }
    } catch (err) {
      console.warn('Supabase offline or unreachable:', err);
    }
  }

  // Fallback localStorage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('calepinage_saved_projects');
      if (cached) {
        const parsed = JSON.parse(cached) as SavedProject[];
        return {
          projects: parsed.filter((p) => !p.id.startsWith(STOCK_ROW_PREFIX)),
          source: 'local',
        };
      }
    } catch {}
  }

  return { projects: [], source: 'local' };
}

/**
 * Sauvegarder ou mettre à jour un projet dans Supabase & local
 */
export async function saveProjectToCloud(project: SavedProject): Promise<boolean> {
  let cloudSuccess = false;
  const client = getSupabase();

  if (client) {
    try {
      const dbPayload = mapProjectToDb(project);
      const { error } = await client
        .from('cutting_projects')
        .upsert(dbPayload, { onConflict: 'id' });

      if (!error) {
        cloudSuccess = true;
      } else {
        console.warn('Erreur de sauvegarde Supabase:', error.message);
      }
    } catch (e) {
      console.warn('Exception Supabase:', e);
    }
  }

  // Toujours mettre à jour le cache localStorage
  if (typeof window !== 'undefined') {
    try {
      const cachedStr = localStorage.getItem('calepinage_saved_projects');
      const cachedList: SavedProject[] = cachedStr ? JSON.parse(cachedStr) : [];
      const updated = [project, ...cachedList.filter((p) => p.id !== project.id)];
      localStorage.setItem('calepinage_saved_projects', JSON.stringify(updated));
    } catch {}
  }

  return cloudSuccess;
}

/**
 * Supprimer un projet
 */
export async function deleteProjectFromCloud(projectId: string): Promise<boolean> {
  let cloudSuccess = false;
  const client = getSupabase();

  if (client) {
    try {
      const { error } = await client
        .from('cutting_projects')
        .delete()
        .eq('id', projectId);

      if (!error) cloudSuccess = true;
    } catch (e) {
      console.warn('Erreur suppression Supabase:', e);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const cachedStr = localStorage.getItem('calepinage_saved_projects');
      if (cachedStr) {
        const cachedList: SavedProject[] = JSON.parse(cachedStr);
        const updated = cachedList.filter((p) => p.id !== projectId);
        localStorage.setItem('calepinage_saved_projects', JSON.stringify(updated));
      }
    } catch {}
  }

  return cloudSuccess;
}

/**
 * Récupérer le stock atelier d'un utilisateur (Supabase Cloud + localStorage)
 */
export async function getWorkshopStockForUser(userName: string): Promise<WorkshopItem[]> {
  const keySuffix = normalizeUserKey(userName);
  const localKey = `calepinage_workshop_stock_${keySuffix}`;
  const stockRowId = `${STOCK_ROW_PREFIX}${keySuffix}`;

  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client
        .from('cutting_projects')
        .select('stock_panels')
        .eq('id', stockRowId)
        .maybeSingle();

      if (!error && data && Array.isArray(data.stock_panels)) {
        const items = data.stock_panels as unknown as WorkshopItem[];
        if (typeof window !== 'undefined') {
          localStorage.setItem(localKey, JSON.stringify(items));
        }
        return items;
      }
    } catch (err) {
      console.warn('Erreur lecture stock utilisateur Supabase:', err);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        return JSON.parse(stored) as WorkshopItem[];
      }
      // Migration douce de l'ancien stock global vers Éric
      if (keySuffix === 'eric') {
        const legacy = localStorage.getItem('calepinage_workshop_stock');
        if (legacy) {
          const parsed = JSON.parse(legacy) as WorkshopItem[];
          localStorage.setItem(localKey, JSON.stringify(parsed));
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * Sauvegarder le stock atelier d'un utilisateur (localStorage + Supabase Cloud)
 */
export async function saveWorkshopStockForUser(
  userName: string,
  items: WorkshopItem[]
): Promise<boolean> {
  const keySuffix = normalizeUserKey(userName);
  const localKey = `calepinage_workshop_stock_${keySuffix}`;
  const stockRowId = `${STOCK_ROW_PREFIX}${keySuffix}`;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(localKey, JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  const client = getSupabase();
  if (client) {
    try {
      const payload: DbCuttingProject = {
        id: stockRowId,
        name: `__STOCK__${userName}`,
        settings: {
          kerf: 3.2,
          minOffcutWidth: 200,
          minOffcutLength: 200,
          owner: userName,
        },
        stock_panels: items as unknown as StockPanel[],
        cut_items: [],
        updated_at: new Date().toISOString(),
      };
      const { error } = await client
        .from('cutting_projects')
        .upsert(payload, { onConflict: 'id' });
      return !error;
    } catch (e) {
      console.warn('Erreur sauvegarde stock utilisateur Supabase:', e);
    }
  }

  return false;
}
