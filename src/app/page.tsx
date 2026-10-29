'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CutItem,
  CutSettings,
  OptimizationResult,
  StockPanel,
  OffcutArea,
} from '@/types/cutting';
import { DEFAULT_SETTINGS, PRESETS, ProjectPreset } from '@/lib/presets';
import { optimizeCutting } from '@/lib/optimizer/guillotine';
import { Navbar } from '@/components/Navbar';
import { SettingsBar } from '@/components/SettingsBar';
import { StockManager } from '@/components/StockManager';
import { CutListManager } from '@/components/CutListManager';
import { StatsSummary } from '@/components/StatsSummary';
import { CuttingVisualizer } from '@/components/CuttingVisualizer';
import { OffcutsList } from '@/components/OffcutsList';
import { PrintDossier } from '@/components/PrintDossier';
import { Play, Layers, ListPlus } from 'lucide-react';

export default function Home() {
  // États de l'application (initialisés avec le preset 1 par défaut)
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS);
  const [stockPanels, setStockPanels] = useState<StockPanel[]>(
    PRESETS[0].stockPanels
  );
  const [cutItems, setCutItems] = useState<CutItem[]>(PRESETS[0].cutItems);

  // État du résultat d'optimisation
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResult | null>(null);

  // Onglet mobile
  const [mobileTab, setMobileTab] = useState<'input' | 'results'>('input');

  // Chargement depuis localStorage au montage
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('calepinage_settings');
      const savedStock = localStorage.getItem('calepinage_stock');
      const savedCutItems = localStorage.getItem('calepinage_cutitems');

      if (savedSettings) setSettings(JSON.parse(savedSettings));
      if (savedStock) setStockPanels(JSON.parse(savedStock));
      if (savedCutItems) setCutItems(JSON.parse(savedCutItems));
    } catch {
      // Ignorer les erreurs de parsing
    }
  }, []);

  // Sauvegarde dans localStorage à chaque modification
  useEffect(() => {
    try {
      localStorage.setItem('calepinage_settings', JSON.stringify(settings));
      localStorage.setItem('calepinage_stock', JSON.stringify(stockPanels));
      localStorage.setItem('calepinage_cutitems', JSON.stringify(cutItems));
    } catch {
      // Ignorer les erreurs de quota localstorage
    }
  }, [settings, stockPanels, cutItems]);

  // Recalcul de l'optimisation
  const handleOptimize = useCallback(() => {
    const res = optimizeCutting(stockPanels, cutItems, settings);
    setOptimizationResult(res);
    setMobileTab('results');
  }, [stockPanels, cutItems, settings]);

  // Lancer un premier calcul dès que les données de base sont prêtes
  useEffect(() => {
    if (cutItems.length > 0 && stockPanels.length > 0) {
      const res = optimizeCutting(stockPanels, cutItems, settings);
      setOptimizationResult(res);
    }
  }, [settings, stockPanels, cutItems]);

  // Matières disponibles
  const availableMaterials = useMemo(() => {
    const set = new Set<string>();
    stockPanels.forEach((p) => p.material && set.add(p.material.trim()));
    cutItems.forEach((i) => i.material && set.add(i.material.trim()));
    return Array.from(set).filter(Boolean);
  }, [stockPanels, cutItems]);

  // Charger un projet preset
  const handleLoadPreset = (preset: ProjectPreset) => {
    setSettings(preset.settings);
    setStockPanels(preset.stockPanels);
    setCutItems(preset.cutItems);

    const res = optimizeCutting(
      preset.stockPanels,
      preset.cutItems,
      preset.settings
    );
    setOptimizationResult(res);
  };

  // Réinitialiser à zéro
  const handleReset = () => {
    if (
      window.confirm(
        'Êtes-vous sûr de vouloir vider le stock et la liste de débit ?'
      )
    ) {
      setStockPanels([]);
      setCutItems([]);
      setOptimizationResult(null);
    }
  };

  // Imprimer le dossier
  const handlePrint = () => {
    window.print();
  };

  // Ajouter une chute au stock
  const handleAddOffcutToStock = (
    offcut: OffcutArea & { material: string }
  ) => {
    const newPanel: StockPanel = {
      id: `stock-offcut-${Date.now()}`,
      material: offcut.material,
      length: Math.round(Math.max(offcut.length, offcut.width)),
      width: Math.round(Math.min(offcut.length, offcut.width)),
      quantity: 1,
    };
    setStockPanels((prev) => [...prev, newPanel]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Barre de navigation */}
      <Navbar
        onLoadPreset={handleLoadPreset}
        onReset={handleReset}
        onPrint={handlePrint}
      />

      {/* Impression Atelier (visible uniquement lors du print) */}
      {optimizationResult && (
        <PrintDossier
          result={optimizationResult}
          cutItems={cutItems}
          settings={settings}
        />
      )}

      {/* Contenu Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 print:hidden">
        {/* 1. Configuration & Trait de scie (Kerf) */}
        <SettingsBar settings={settings} onChange={setSettings} />

        {/* Boutons d'onglets pour navigation sur mobile */}
        <div className="flex lg:hidden bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setMobileTab('input')}
            className={`flex-1 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              mobileTab === 'input'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ListPlus className="w-4 h-4" />
            <span>1. Stock &amp; Débit</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('results')}
            className={`flex-1 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              mobileTab === 'results'
                ? 'bg-amber-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>2. Plans de Coupe</span>
          </button>
        </div>

        {/* Grille principale : Formulaires à gauche, Plans et Résultats à droite */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Colonne Gauche : Saisie Stock et Liste de débit (Largeur 5 colonnes sur desktop) */}
          <div
            className={`lg:col-span-5 space-y-6 ${
              mobileTab === 'results' ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Gestion du stock de panneaux */}
            <StockManager
              panels={stockPanels}
              onChange={setStockPanels}
              availableMaterials={availableMaterials}
            />

            {/* Saisie de la liste de débit */}
            <CutListManager
              items={cutItems}
              onChange={setCutItems}
              availableMaterials={availableMaterials}
            />

            {/* Bouton d'action principal : Calcul de l'optimisation */}
            <div className="pt-2 sticky bottom-4 z-20">
              <button
                type="button"
                onClick={handleOptimize}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider py-3.5 px-6 rounded-2xl shadow-xl hover:shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] border border-amber-400/30"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Calculer l&apos;optimisation des coupes</span>
              </button>
            </div>
          </div>

          {/* Colonne Droite : Visualisation graphique & Résultats (Largeur 7 colonnes sur desktop) */}
          <div
            className={`lg:col-span-7 space-y-6 ${
              mobileTab === 'input' ? 'hidden lg:block' : 'block'
            }`}
          >
            {optimizationResult ? (
              <>
                {/* Statistiques Globales & Taux de chute */}
                <StatsSummary result={optimizationResult} />

                {/* Visualiseur SVG interactif des panneaux */}
                <CuttingVisualizer
                  panels={optimizationResult.panels}
                  kerf={settings.kerf}
                />

                {/* Liste des chutes valorisables */}
                <OffcutsList
                  offcuts={optimizationResult.reusableOffcuts}
                  onAddOffcutToStock={handleAddOffcutToStock}
                />
              </>
            ) : (
              <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-12 text-center text-slate-400">
                <Layers className="w-16 h-16 mx-auto text-slate-600 mb-4 animate-pulse" />
                <h3 className="text-base font-bold text-white">
                  Prêt pour le calcul d&apos;optimisation
                </h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
                  Configurez vos panneaux et pièces requises puis cliquez sur{' '}
                  <strong className="text-amber-400">
                    « Calculer l&apos;optimisation des coupes »
                  </strong>{' '}
                  pour générer les plans d&apos;atelier.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 py-4 text-center text-xs text-slate-500 print:hidden">
        <p>
          CalepinagePro — Application d&apos;optimisation de découpe pour la
          menuiserie et l&apos;agencement. Prêt pour Vercel.
        </p>
      </footer>
    </div>
  );
}
