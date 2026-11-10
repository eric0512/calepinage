'use client';

import React, { useState, useEffect } from 'react';
import { CutSettings } from '@/types/cutting';
import { Disc, Ruler, Layers, Check, Plus } from 'lucide-react';

interface SettingsBarProps {
  settings: CutSettings;
  onChange: (settings: CutSettings) => void;
}

const PRESET_KERFS = [2.4, 3.0, 3.2, 4.0];
const BASE_EDGE_BANDINGS = ['Sans', '1mm', '2mm', '3mm'];
const STORAGE_KEY = 'calepinage_custom_edge_bandings';

export const SettingsBar: React.FC<SettingsBarProps> = ({
  settings,
  onChange,
}) => {
  const [customEdgeBandings, setCustomEdgeBandings] = useState<string[]>([]);
  const [isManualInput, setIsManualInput] = useState<boolean>(false);
  const [manualValue, setManualValue] = useState<string>('');

  // Charger les épaisseurs personnalisées enregistrées dans le navigateur
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomEdgeBandings(parsed);
        }
      }
    } catch (e) {
      console.error('Erreur chargement bandes de chant personnalisées:', e);
    }
  }, []);

  const updateKerf = (val: number) => {
    // 1 chiffre après la virgule
    const rounded = Math.round(val * 10) / 10;
    if (rounded >= 0 && rounded <= 15) {
      onChange({ ...settings, kerf: rounded });
    }
  };

  const allEdgeBandingOptions = Array.from(
    new Set([...BASE_EDGE_BANDINGS, ...customEdgeBandings])
  );

  const handleSelectEdgeBanding = (val: string) => {
    if (val === '__manual__') {
      setIsManualInput(true);
      setManualValue('');
    } else {
      setIsManualInput(false);
      onChange({ ...settings, edgeBanding: val });
    }
  };

  const handleManualValueChange = (raw: string) => {
    setManualValue(raw);
    const clean = raw.replace(',', '.').trim();
    const num = parseFloat(clean);
    if (!isNaN(num) && num >= 0) {
      const formatted = num === 0 ? 'Sans' : `${clean}mm`;
      onChange({ ...settings, edgeBanding: formatted });
    } else if (raw.trim() === '') {
      onChange({ ...settings, edgeBanding: '' });
    }
  };

  const handleSaveManualChoice = () => {
    const clean = manualValue.replace(',', '.').trim();
    const num = parseFloat(clean);
    if (isNaN(num) || num <= 0) return;
    const formatted = `${clean}mm`;

    if (
      window.confirm(
        `Voulez-vous enregistrer « ${formatted} » dans la liste des bandes de champs pour vos prochains projets ?`
      )
    ) {
      if (!allEdgeBandingOptions.includes(formatted)) {
        const updated = [...customEdgeBandings, formatted];
        setCustomEdgeBandings(updated);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error(e);
        }
      }
      setIsManualInput(false);
      onChange({ ...settings, edgeBanding: formatted });
    }
  };

  const isEdgeBandingEmpty =
    !settings.edgeBanding || settings.edgeBanding.trim() === '';

  // Déterminer la valeur du select : soit l'option, soit '__manual__' si valeur inconnue ou mode manuel actif
  const selectValue = isManualInput
    ? '__manual__'
    : allEdgeBandingOptions.includes(settings.edgeBanding || '')
      ? settings.edgeBanding
      : settings.edgeBanding && settings.edgeBanding.trim() !== ''
        ? '__manual__'
        : '';

  return (
    <div
      id="settings-bar-container"
      className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-4 shadow-sm text-slate-200 print:hidden transition-all"
    >
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        {/* Titre & Description */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Disc className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Paramètres de Coupe &amp; Lame de Scie
            </h2>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Trait de scie, gestion du stock atelier et bande de champs
            </p>
          </div>
        </div>

        {/* Section Contrôles organisée en 2 lignes */}
        <div className="flex flex-col gap-3">
          {/* LIGNE 1 : Trait de scie et Seuil stock atelier SUR LA MÊME LIGNE */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Épaisseur Trait de scie */}
            <div className="flex items-center gap-3 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-inner">
              <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5 shrink-0">
                <span>Trait de scie :</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateKerf(settings.kerf - 0.1)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-colors"
                  title="-0.1 mm"
                >
                  -
                </button>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="15"
                    value={settings.kerf}
                    onChange={(e) => updateKerf(parseFloat(e.target.value) || 0)}
                    className="w-16 text-center bg-slate-950 text-amber-400 font-mono font-bold text-sm px-2 py-1 rounded-lg border border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <span className="text-xs font-mono text-slate-400">mm</span>
                <button
                  type="button"
                  onClick={() => updateKerf(settings.kerf + 0.1)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold transition-colors"
                  title="+0.1 mm"
                >
                  +
                </button>
              </div>

              {/* Boutons rapides pour standards courants */}
              <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-slate-700/60">
                {PRESET_KERFS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => updateKerf(k)}
                    className={`text-[11px] px-2 py-0.5 rounded font-mono transition-colors ${
                      settings.kerf === k
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {k.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Seuil Chute Atelier (sur la même ligne) */}
            <div className="flex items-center gap-2 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-inner">
              <Ruler className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-slate-300 shrink-0">Seuil stock atelier :</span>
              <input
                type="number"
                step="50"
                min="100"
                max="2000"
                value={settings.minOffcutLength}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 500;
                  onChange({
                    ...settings,
                    minOffcutLength: val,
                    minOffcutWidth: val,
                  });
                }}
                className="w-16 text-center bg-slate-950 text-emerald-400 font-mono font-semibold text-xs px-2 py-1 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-xs font-mono text-slate-400">mm</span>
            </div>
          </div>

          {/* LIGNE 2 (DESSOUS) : Bande de champs (obligatoire avec sélection & saisie manuelle) */}
          <div
            className={`flex flex-wrap items-center gap-3 px-3.5 py-2 rounded-xl border transition-all ${
              isEdgeBandingEmpty
                ? 'bg-amber-500/10 border-amber-500/70 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-slate-900/80 border-slate-700/80 shadow-inner'
            }`}
          >
            {/* Label avec astérisque obligatoire */}
            <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5 shrink-0">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Bande de champs</span>
              <span className="text-amber-400 font-bold" title="Champ obligatoire">*</span>
              <span>:</span>
            </div>

            {/* Liste de choix déroulante */}
            <div className="flex items-center gap-2">
              <select
                value={selectValue}
                onChange={(e) => handleSelectEdgeBanding(e.target.value)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border focus:outline-none transition-colors ${
                  isEdgeBandingEmpty
                    ? 'bg-slate-950 text-amber-300 border-amber-500/80 focus:border-amber-400 ring-1 ring-amber-500/40'
                    : 'bg-slate-950 text-white border-slate-700 focus:border-amber-500'
                }`}
                required
              >
                <option value="" disabled>
                  -- Choisir l&apos;épaisseur * --
                </option>
                {allEdgeBandingOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__manual__">Autre épaisseur (saisie manuelle)...</option>
              </select>

              {/* Saisie manuelle si sélectionné ou valeur personnalisée */}
              {(isManualInput || (!allEdgeBandingOptions.includes(settings.edgeBanding || '') && !isEdgeBandingEmpty)) && (
                <div className="flex items-center gap-1 bg-slate-950 border border-amber-500/70 rounded-lg px-2 py-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 0.8"
                    value={
                      manualValue !== ''
                        ? manualValue
                        : (settings.edgeBanding || '').replace('mm', '')
                    }
                    onChange={(e) => handleManualValueChange(e.target.value)}
                    className="w-14 bg-transparent text-xs font-mono font-bold text-amber-300 focus:outline-none placeholder:text-slate-600"
                    autoFocus
                  />
                  <span className="text-[11px] font-mono text-slate-400">mm</span>
                  {manualValue.trim() !== '' && (
                    <button
                      type="button"
                      onClick={handleSaveManualChoice}
                      className="ml-1 px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition-colors flex items-center gap-0.5"
                      title="Enregistrer cette épaisseur dans la liste de choix"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Mémoriser</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Boutons rapides pour choix fréquents */}
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-slate-700/60">
              {BASE_EDGE_BANDINGS.map((preset) => (
                <button
                  key={`preset-band-${preset}`}
                  type="button"
                  onClick={() => {
                    setIsManualInput(false);
                    onChange({ ...settings, edgeBanding: preset });
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded font-mono transition-colors ${
                    settings.edgeBanding === preset
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Statut / Indication obligatoire */}
            {isEdgeBandingEmpty ? (
              <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse">
                Saisie obligatoire *
              </span>
            ) : (
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 hidden md:inline-flex">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{settings.edgeBanding}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
