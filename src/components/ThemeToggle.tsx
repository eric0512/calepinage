'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showLabel = false,
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedTheme = localStorage.getItem('calepinage_theme') as 'dark' | 'light' | null;
      if (savedTheme === 'light') {
        setTheme('light');
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        setTheme('dark');
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    } catch {
      // Fallback dark
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);

    if (nextTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }

    try {
      localStorage.setItem('calepinage_theme', nextTheme);
    } catch {}
  };

  if (!mounted) {
    return (
      <button
        type="button"
        className={`p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 opacity-0 ${className}`}
        aria-label="Changer de thème"
      >
        <Sun className="w-4 h-4" />
      </button>
    );
  }

  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all shadow-sm ${
        isLight
          ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300'
      } ${className}`}
      title={isLight ? 'Passer en mode sombre (foncé)' : 'Passer en mode clair'}
      aria-label="Changer de thème clair / sombre"
    >
      {isLight ? (
        <>
          <Moon className="w-4 h-4 text-indigo-600 transition-transform hover:-rotate-12" />
          {showLabel && <span className="text-xs font-semibold">Mode Sombre</span>}
        </>
      ) : (
        <>
          <Sun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" />
          {showLabel && <span className="text-xs font-semibold">Mode Clair</span>}
        </>
      )}
    </button>
  );
};

