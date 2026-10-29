import { createClient } from '@supabase/supabase-js';
import { SavedProject, CutSettings, StockPanel, CutItem } from '@/types/cutting';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iahzaogwukljmhjdxguv.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseAnonKey.length > 10);
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface DbCuttingProject {
  id: string;
  name: string;
  description?: string;
  settings: CutSettings;
  stock_panels: StockPanel[];
  cut_items: CutItem[];
  updated_at: string;
}

// Convertisseur DB -> Modèle App
function mapDbToProject(row: DbCuttingProject): SavedProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    updatedAt: row.updated_at,
    settings: row.settings,
    stockPanels: row.stock_panels,
    cutItems: row.cut_items,
  };
}

// Convertisseur Modèle App -> DB
function mapProjectToDb(p: SavedProject): DbCuttingProject {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    settings: p.settings,
    stock_panels: p.stockPanels,
    cut_items: p.cutItems,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Récupérer tous les projets depuis Supabase (avec secours sur localStorage)
 */
export async function getProjects(): Promise<{
  projects: SavedProject[];
  source: 'supabase' | 'local';
}> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('cutting_projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const mapped = data.map(mapDbToProject);
        // Mettre à jour le cache local
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
        return { projects: JSON.parse(cached), source: 'local' };
      }
    } catch {}
  }

  return { projects: [], source: 'local' };
}

/**
 * Sauvegarder ou mettre à jour un projet dans Supabase
 */
export async function saveProjectToCloud(project: SavedProject): Promise<boolean> {
  let cloudSuccess = false;

  if (supabase) {
    try {
      const dbPayload = mapProjectToDb(project);
      const { error } = await supabase
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

  if (supabase) {
    try {
      const { error } = await supabase
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

