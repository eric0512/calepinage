'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User, ChevronDown, Plus, Check } from 'lucide-react';
import { normalizeUserKey } from '@/lib/users';

interface UserSelectorProps {
  activeUser: string;
  usersList: string[];
  onSwitchUser: (userName: string) => void;
  onAddUser: (userName: string) => void;
  compact?: boolean;
  align?: 'left' | 'right';
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  activeUser,
  usersList,
  onSwitchUser,
  onAddUser,
  compact = false,
  align = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAdding(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConfirmAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddUser(trimmed);
    setNewName('');
    setIsAdding(false);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-lg border transition-colors font-semibold shadow-sm ${
          compact
            ? 'px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40'
            : 'px-3.5 py-2 text-xs sm:text-sm bg-slate-900/90 hover:bg-slate-800 text-amber-300 border-amber-500/40'
        }`}
        title="Changer d'utilisateur (projets et stock séparés)"
      >
        <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="truncate max-w-[110px]">{activeUser}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1.5 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50 animate-in fade-in duration-100`}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Espace utilisateur
          </div>
          <div className="space-y-0.5 mt-0.5">
            {usersList.map((u) => {
              const isSelected = normalizeUserKey(u) === normalizeUserKey(activeUser);
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    onSwitchUser(u);
                    setIsOpen(false);
                    setIsAdding(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{u}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-800 mt-1.5 pt-1.5">
            {isAdding ? (
              <form onSubmit={handleConfirmAdd} className="flex items-center gap-1 px-1">
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Prénom..."
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  OK
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ajouter un utilisateur</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
