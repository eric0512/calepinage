-- ========================================================================
-- CalepinagePro : Script de création de la table des projets dans Supabase
-- Exécutez ce script dans : Dashboard Supabase > SQL Editor > New Query
-- ========================================================================

-- 1. Création de la table des projets de calepinage
create table if not exists public.cutting_projects (
  id text primary key,
  name text not null,
  description text,
  settings jsonb not null default '{}'::jsonb,
  stock_panels jsonb not null default '[]'::jsonb,
  cut_items jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Index pour accélérer les requêtes de tri par date
create index if not exists idx_cutting_projects_updated_at 
  on public.cutting_projects (updated_at desc);

-- 3. Activation du Row Level Security (RLS)
alter table public.cutting_projects enable row level security;

-- 4. Politiques d'accès public (lecture, écriture, modification, suppression via la clé anon)
drop policy if exists "Autoriser l'accès public pour CalepinagePro" on public.cutting_projects;
drop policy if exists "Lecture publique cutting_projects" on public.cutting_projects;
drop policy if exists "Insertion publique cutting_projects" on public.cutting_projects;
drop policy if exists "Modification publique cutting_projects" on public.cutting_projects;
drop policy if exists "Suppression publique cutting_projects" on public.cutting_projects;

create policy "Lecture publique cutting_projects"
  on public.cutting_projects
  for select
  to anon, authenticated
  using (true);

create policy "Insertion publique cutting_projects"
  on public.cutting_projects
  for insert
  to anon, authenticated
  with check (current_user in ('anon', 'authenticated', 'service_role', 'postgres'));

create policy "Modification publique cutting_projects"
  on public.cutting_projects
  for update
  to anon, authenticated
  using (current_user in ('anon', 'authenticated', 'service_role', 'postgres'))
  with check (current_user in ('anon', 'authenticated', 'service_role', 'postgres'));

create policy "Suppression publique cutting_projects"
  on public.cutting_projects
  for delete
  to anon, authenticated
  using (current_user in ('anon', 'authenticated', 'service_role', 'postgres'));

