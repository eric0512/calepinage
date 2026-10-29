'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  ExternalLink,
  Copy,
  Check,
  KeyRound,
  FileCode2,
} from 'lucide-react';
import {
  getStoredSupabaseKey,
  setStoredSupabaseKey,
  isSupabaseConfigured,
  SUPABASE_PROJECT_ID,
} from '@/lib/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export const SQL_SCHEMA_SCRIPT = `-- 1. Création de la table des projets
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

create index if not exists idx_cutting_projects_updated_at 
  on public.cutting_projects (updated_at desc);

-- 2. Activer les droits d'accès
alter table public.cutting_projects enable row level security;

create policy "Accès public CalepinagePro"
  on public.cutting_projects
  for all
  using (true)
  with check (true);`;

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredSupabaseKey());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredSupabaseKey(apiKey.trim());
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onConfigSaved();
      onClose();
    }, 1200);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const configured = isSupabaseConfigured();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-slate-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Liaison Supabase Cloud
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Projet : roadtrip-vercel ({SUPABASE_PROJECT_ID})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="mt-5 space-y-6 text-xs">
          {/* Étape 1 : Obtenir la clé */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                1. Clé d&apos;accès Supabase (anon public)
              </span>
              <a
                href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/settings/api`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-semibold"
              >
                <span>Ouvrir la page des clés</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-slate-400">
              Copiez votre clé publique nommée <strong>anon public</strong> sur
              Supabase et collez-la ci-dessous :
            </p>

            <form onSubmit={handleSaveKey} className="space-y-2.5">
              <input
                type="text"
                placeholder="eyJh..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-900 text-white font-mono text-xs px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                  saveSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Clé enregistrée avec succès !</span>
                  </>
                ) : (
                  <span>Enregistrer la clé de connexion</span>
                )}
              </button>
            </form>
          </div>

          {/* Étape 2 : Le code SQL de sauvegarde */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-blue-400" />
                2. Code SQL pour créer la table de sauvegarde
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copier le SQL</span>
                    </>
                  )}
                </button>
                <a
                  href={`https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql/new`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline font-semibold"
                >
                  <span>Ouvrir l&apos;éditeur SQL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <p className="text-slate-400">
              Copiez ce code et exécutez-le dans le <strong>SQL Editor</strong>{' '}
              de votre projet Supabase pour créer la table :
            </p>

            <pre className="bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-40">
              {SQL_SCHEMA_SCRIPT}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs">
          <div className="text-slate-500 font-mono text-[11px]">
            {configured
              ? '✅ Prêt pour la sauvegarde Cloud'
              : 'ℹ️ Mode sauvegarde locale active'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

