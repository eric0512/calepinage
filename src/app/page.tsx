'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  CutItem,
  CutSettings,
  OptimizationResult,
  StockPanel,
  OffcutArea,
  SavedProject,
  WorkshopItem,
} from '@/types/cutting';
import { DEFAULT_SETTINGS, PRESETS, ProjectPreset } from '@/lib/presets';
import { optimizeCutting } from '@/lib/optimizer/guillotine';
import { repairSavedCabinetDrawers } from '@/lib/cabinet-calculator';
import {
  getProjects,
  saveProjectToCloud,
  deleteProjectFromCloud,
} from '@/lib/supabase';
import { Navbar } from '@/components/Navbar';
import { SettingsBar } from '@/components/SettingsBar';
import { StockManager } from '@/components/StockManager';
import { CutListManager } from '@/components/CutListManager';
import { StatsSummary } from '@/components/StatsSummary';
import { CuttingVisualizer } from '@/components/CuttingVisualizer';
import { OffcutsList } from '@/components/OffcutsList';
import { PrintDossier } from '@/components/PrintDossier';
import { ProjectHub } from '@/components/ProjectHub';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { SupabaseConfigModal } from '@/components/SupabaseConfigModal';
import {
  MissingStockModal,
  MissingMaterialInfo,
} from '@/components/MissingStockModal';
import { Play, Layers, ListPlus, FolderOpen, Sparkles } from 'lucide-react';

export default function Home() {
  // Vue active : 'hub' (écran d'accueil nouveau/existant) ou 'editor' (l'atelier de coupe)
  const [currentView, setCurrentView] = useState<'hub' | 'editor'>('hub');

  // Projet en cours
  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('Nouveau Projet');

  // Données du calepinage
  const [settings, setSettings] = useState<CutSettings>(DEFAULT_SETTINGS);
  const [stockPanels, setStockPanels] = useState<StockPanel[]>([]);
  const [cutItems, setCutItems] = useState<CutItem[]>([]);
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResult | null>(null);

  // Liste des projets sauvegardés
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [showCabinetModal, setShowCabinetModal] = useState<boolean>(false);
  // Orientations individuelles des panneaux dans le plan de coupe (vertical / horizontal)
  const [panelOrientations, setPanelOrientations] = useState<
    Record<string, 'vertical' | 'horizontal'>
  >({});

  // Onglet mobile
  const [mobileTab, setMobileTab] = useState<'input' | 'results'>('input');

  // Gestion des matières absentes du stock (suspension de l'optimisation)
  const [showMissingStockModal, setShowMissingStockModal] = useState<boolean>(false);
  const [missingStockData, setMissingStockData] = useState<MissingMaterialInfo[]>([]);

  // Stock Atelier (inventaire persistant des chutes >= 500x500mm)
  const [workshopStock, setWorkshopStock] = useState<WorkshopItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('calepinage_workshop_stock');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Sauvegarder le stock atelier dans le localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'calepinage_workshop_stock',
          JSON.stringify(workshopStock)
        );
      } catch (e) {
        console.error(e);
      }
    }
  }, [workshopStock]);

  // Réintégrer un panneau au Stock Atelier (si non utilisé ou supprimé du projet)
  const reintegrateToWorkshop = useCallback(
    (panel: {
      material: string;
      length: number;
      width: number;
      quantity?: number;
      workshopSourceId?: string;
    }) => {
      const qty = panel.quantity || 1;
      const len = Math.round(Math.max(panel.length, panel.width));
      const wid = Math.round(Math.min(panel.length, panel.width));
      const mat = panel.material.trim();

      setWorkshopStock((prev) => {
        const existingIdx = prev.findIndex(
          (it) =>
            it.material.toLowerCase().trim() === mat.toLowerCase() &&
            Math.round(Math.max(it.length, it.width)) === len &&
            Math.round(Math.min(it.length, it.width)) === wid
        );

        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: next[existingIdx].quantity + qty,
          };
          return next;
        } else {
          return [
            ...prev,
            {
              id:
                panel.workshopSourceId ||
                `workshop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              material: mat,
              length: len,
              width: wid,
              quantity: qty,
            },
          ];
        }
      });
    },
    []
  );

  // Intégrer un panneau du stock atelier au projet en cours (le supprime du stock atelier)
  const handleAddFromWorkshop = useCallback(
    (item: WorkshopItem) => {
      // 1. Décrémenter la quantité ou supprimer du stock atelier
      setWorkshopStock((prev) =>
        prev
          .map((w) =>
            w.id === item.id ? { ...w, quantity: w.quantity - 1 } : w
          )
          .filter((w) => w.quantity > 0)
      );

      // 2. Ajouter au stock du projet en conservant son nom de matière d'origine
      const originalMaterial = item.material.trim();
      const newPanel: StockPanel = {
        id: `stock-workshop-${item.id}-${Date.now()}`,
        name: originalMaterial,
        material: originalMaterial,
        length: Math.round(item.length),
        width: Math.round(item.width),
        quantity: 1,
        workshopSourceId: item.id,
      };

      setStockPanels((prev) => [...prev, newPanel]);
    },
    []
  );

  // Supprimer un élément du stock atelier
  const handleDeleteWorkshopItem = useCallback((id: string) => {
    setWorkshopStock((prev) => prev.filter((it) => it.id !== id));
  }, []);

  // Ajouter manuellement une chute au stock atelier
  const handleAddManualWorkshopItem = useCallback(
    (newItem: WorkshopItem) => {
      setWorkshopStock((prev) => {
        const len = Math.round(Math.max(newItem.length, newItem.width));
        const wid = Math.round(Math.min(newItem.length, newItem.width));
        const mat = newItem.material.trim();

        const existingIdx = prev.findIndex(
          (it) =>
            it.material.toLowerCase().trim() === mat.toLowerCase() &&
            Math.round(Math.max(it.length, it.width)) === len &&
            Math.round(Math.min(it.length, it.width)) === wid
        );

        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: next[existingIdx].quantity + newItem.quantity,
          };
          return next;
        } else {
          return [...prev, newItem];
        }
      });
    },
    []
  );

  // Ref pour éviter l'auto-save au tout premier rendu
  const isInitialMount = useRef(true);

  // Charger les projets depuis Supabase ou Cache local
  const refreshProjectsList = useCallback(() => {
    getProjects().then(({ projects }) => {
      const isFirstLaunch =
        typeof window !== 'undefined' &&
        localStorage.getItem('calepinage_saved_projects') === null;

      if (isFirstLaunch && (!projects || projects.length === 0)) {
        const initialPresets: SavedProject[] = PRESETS.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          updatedAt: new Date().toISOString(),
          settings: p.settings,
          stockPanels: p.stockPanels,
          cutItems: p.cutItems,
        }));
        setSavedProjects(initialPresets);
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'calepinage_saved_projects',
            JSON.stringify(initialPresets)
          );
        }
      } else {
        const repairedProjects = (projects || []).map((proj) => {
          const { items: repairedItems, modified } = repairSavedCabinetDrawers(
            proj.cutItems || []
          );
          if (modified) {
            const updatedProj = { ...proj, cutItems: repairedItems };
            saveProjectToCloud(updatedProj);
            return updatedProj;
          }
          return proj;
        });
        setSavedProjects(repairedProjects);
      }
    });
  }, []);

  useEffect(() => {
    refreshProjectsList();
  }, [refreshProjectsList]);

  // Sauvegarder un projet
  const persistProject = useCallback(
    async (silent: boolean = false) => {
      if (!currentProjectId && currentView !== 'editor') return;

      // Si le projet est vidé de toutes ses informations (aucun panneau et aucune pièce),
      // supprimer définitivement l'enregistrement de Supabase pour ne laisser aucun projet fantôme.
      if (stockPanels.length === 0 && cutItems.length === 0) {
        if (currentProjectId) {
          await deleteProjectFromCloud(currentProjectId);
          setSavedProjects((prev) => prev.filter((p) => p.id !== currentProjectId));
        }
        return;
      }

      const projectToSave: SavedProject = {
        id: currentProjectId || `project-${Date.now()}`,
        name: projectName,
        updatedAt: new Date().toISOString(),
        settings,
        stockPanels,
        cutItems,
      };

      setSavedProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== projectToSave.id);
        return [projectToSave, ...filtered];
      });

      await saveProjectToCloud(projectToSave);

      if (!silent) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      }
    },
    [currentProjectId, currentView, projectName, settings, stockPanels, cutItems]
  );

  // Auto-Save avec debounce quand on est dans l'éditeur
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (currentView === 'editor' && currentProjectId) {
      const timer = setTimeout(() => {
        persistProject(true);
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [stockPanels, cutItems, settings, projectName, currentView, currentProjectId, persistProject]);

  // Création d'un NOUVEAU PROJET VIERGE (aucun champ rempli)
  const handleCreateNewProject = (name: string) => {
    const newId = `project-${Date.now()}`;
    setCurrentProjectId(newId);
    setProjectName(name);

    // Initialisation totalement vide selon la demande
    setSettings(DEFAULT_SETTINGS);
    setStockPanels([]);
    setCutItems([]);
    setOptimizationResult(null);
    setIsSaved(false);

    // Ouvrir directement l'atelier
    setCurrentView('editor');
    setMobileTab('input');
  };

  // Ouverture d'un PROJET EXISTANT
  const handleOpenProject = (project: SavedProject) => {
    const { items: repairedItems, modified } = repairSavedCabinetDrawers(
      project.cutItems || []
    );
    if (modified) {
      const updatedProj = { ...project, cutItems: repairedItems };
      saveProjectToCloud(updatedProj);
      setSavedProjects((prev) =>
        prev.map((p) => (p.id === updatedProj.id ? updatedProj : p))
      );
    }

    setCurrentProjectId(project.id);
    setProjectName(project.name);
    setSettings(project.settings || DEFAULT_SETTINGS);
    setStockPanels(project.stockPanels || []);
    setCutItems(repairedItems);
    setIsSaved(true);

    // Lancer automatiquement l'optimisation si des panneaux et pièces sont présents
    if (
      repairedItems &&
      repairedItems.length > 0 &&
      project.stockPanels &&
      project.stockPanels.length > 0
    ) {
      const res = optimizeCutting(
        project.stockPanels,
        repairedItems,
        project.settings || DEFAULT_SETTINGS
      );
      setOptimizationResult(res);
    } else {
      setOptimizationResult(null);
    }

    setCurrentView('editor');
    setMobileTab('input');
  };

  // Sauvegarder manuellement
  const handleManualSave = () => {
    persistProject(false);
  };

  // Supprimer un projet existant et effacer tous ses enregistrements sur Supabase Cloud
  const handleDeleteProject = async (projectId: string) => {
    // 1. Mettre à jour immédiatement la liste des projets locale
    setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));

    // 2. Si le projet supprimé est celui actuellement chargé dans l'éditeur, réinitialiser pour couper tout auto-save
    if (currentProjectId === projectId) {
      setCurrentProjectId('');
      setProjectName('Nouveau Projet');
      setStockPanels([]);
      setCutItems([]);
      setOptimizationResult(null);
      setIsSaved(false);
      setCurrentView('hub');
    }

    // 3. Supprimer définitivement l'enregistrement dans la table Supabase
    await deleteProjectFromCloud(projectId);

    // 4. Resynchroniser avec Supabase Cloud
    await refreshProjectsList();
  };

  // Exécution du calcul d'optimisation
  const executeOptimization = useCallback(
    (customStockPanels?: StockPanel[], customCutItems?: CutItem[]) => {
      const activeStockPanels = customStockPanels || stockPanels;
      const activeCutItems = customCutItems || cutItems;

      // 1. Panneaux bruts saisis dans le projet
      const projectPanels: StockPanel[] = activeStockPanels.map((p) => ({ ...p }));

      // 2. Chutes et panneaux disponibles dans le stock atelier (convertis en candidats réutilisables)
      const workshopPanels: StockPanel[] = workshopStock.map((w, idx) => ({
        id: `stock-workshop-${w.id}-${idx}`,
        name: `Chute Atelier (${w.length}×${w.width})`,
        material: w.material.trim(),
        length: Math.round(Math.max(w.length, w.width)),
        width: Math.round(Math.min(w.length, w.width)),
        quantity: w.quantity,
        workshopSourceId: w.id,
      }));

      // Combiner les stocks : les chutes atelier (priorisées par l'algorithme pour éviter le gaspillage) + panneaux saisis
      const combinedPanels = [...workshopPanels, ...projectPanels];

      if (activeCutItems.length === 0 || combinedPanels.length === 0) {
        alert(
          'Veuillez ajouter au moins un panneau en stock (saisi ou atelier) et une pièce à découper.'
        );
        return;
      }

      // Validation obligatoire de la Bande de champs
      if (!settings.edgeBanding || settings.edgeBanding.trim() === '') {
        alert(
          'Le champ « Bande de champs » est obligatoire dans les Paramètres de Coupe.\n\nVeuillez sélectionner une option (Sans, 1mm, 2mm, 3mm ou saisir une épaisseur manuelle) avant de lancer le calcul.'
        );
        const el = document.getElementById('settings-bar-container');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      const res = optimizeCutting(combinedPanels, activeCutItems, settings);
      setOptimizationResult(res);
      setMobileTab('results');

      // Mettre à jour le stock atelier selon ce qui a été RÉELLEMENT consommé par l'optimisation
      const usedWorkshopCounts = new Map<string, number>();
      res.panels.forEach((p) => {
        // Si ce panneau provient d'une chute atelier qui n'était pas déjà décomptée dans le projet
        const wasAlreadyInProject = activeStockPanels.some((sp) => sp.id === p.panelId);
        if (p.workshopSourceId && !wasAlreadyInProject) {
          usedWorkshopCounts.set(
            p.workshopSourceId,
            (usedWorkshopCounts.get(p.workshopSourceId) || 0) + 1
          );
        }
      });

      if (usedWorkshopCounts.size > 0) {
        setWorkshopStock((prev) =>
          prev
            .map((w) => {
              const used = usedWorkshopCounts.get(w.id) || 0;
              return { ...w, quantity: Math.max(0, w.quantity - used) };
            })
            .filter((w) => w.quantity > 0)
        );
      }

      // Vérifier si des panneaux issus du stock atelier manuellement ajoutés n'ont PAS été utilisés
      const usedPanelIds = new Set(res.panels.map((p) => p.panelId));
      const unusedWorkshopPanels = activeStockPanels.filter(
        (p) => p.workshopSourceId && !usedPanelIds.has(p.id)
      );

      if (unusedWorkshopPanels.length > 0) {
        // Les réintégrer au stock atelier
        unusedWorkshopPanels.forEach((p) => {
          reintegrateToWorkshop(p);
        });

        // Les retirer du stock de panneaux du projet
        const unusedIds = new Set(unusedWorkshopPanels.map((p) => p.id));
        setStockPanels((prev) => prev.filter((p) => !unusedIds.has(p.id)));
      }

      // Enregistrer les nouvelles chutes >= 500x500 mm créées par la coupe dans le stock atelier
      const newQualifyingOffcuts = (res.reusableOffcuts || []).filter((o) => {
        const d1 = Math.max(o.length, o.width);
        const d2 = Math.min(o.length, o.width);
        return d1 >= 500 && d2 >= 500;
      });

      if (newQualifyingOffcuts.length > 0) {
        newQualifyingOffcuts.forEach((o) => {
          reintegrateToWorkshop({
            material: o.material,
            length: o.length,
            width: o.width,
            quantity: 1,
          });
        });
      }
    },
    [stockPanels, workshopStock, cutItems, settings, reintegrateToWorkshop]
  );

  // Recalcul de l'optimisation avec contrôle strict des matières en stock
  const handleOptimize = useCallback(
    (customCutItems?: CutItem[]) => {
      const itemsToCheck = customCutItems || cutItems;
      if (itemsToCheck.length === 0) {
        alert('Veuillez ajouter au moins une pièce à découper.');
        return;
      }

      // 1. Vérifier si chaque matière demandée est présente en stock (saisi ou atelier)
      const availableMats = new Set([
        ...stockPanels.map((p) => p.material.trim().toLowerCase()),
        ...workshopStock.map((w) => w.material.trim().toLowerCase()),
      ]);

      const missing: MissingMaterialInfo[] = [];
      itemsToCheck.forEach((it) => {
        const mat = it.material?.trim();
        if (mat && !availableMats.has(mat.toLowerCase())) {
          const existing = missing.find(
            (m) => m.material.toLowerCase() === mat.toLowerCase()
          );
          const len = Math.max(it.length, it.width);
          const wid = Math.min(it.length, it.width);
          if (existing) {
            existing.requiredPiecesCount += it.quantity;
            existing.maxPieceLength = Math.max(existing.maxPieceLength, len);
            existing.maxPieceWidth = Math.max(existing.maxPieceWidth, wid);
          } else {
            missing.push({
              material: mat,
              requiredPiecesCount: it.quantity,
              maxPieceLength: len,
              maxPieceWidth: wid,
            });
          }
        }
      });

      // 2. STOPPER L'OPTIMISATION SI UNE MATIÈRE EST ABSENTE DU STOCK !
      if (missing.length > 0) {
        setMissingStockData(missing);
        setShowMissingStockModal(true);
        return;
      }

      // 3. Si toutes les matières sont en stock, lancer le calcul
      executeOptimization(stockPanels, itemsToCheck);
    },
    [cutItems, stockPanels, workshopStock, executeOptimization]
  );

  // Confirmation de l'ajout en stock et calcul immédiat de l'optimisation
  const handleConfirmMissingStockAndOptimize = useCallback(
    (newPanels: StockPanel[]) => {
      setShowMissingStockModal(false);
      const updatedStock = [...stockPanels, ...newPanels];
      setStockPanels(updatedStock);
      // Lancer le calepinage avec le stock mis à jour
      executeOptimization(updatedStock, cutItems);
    },
    [stockPanels, cutItems, executeOptimization]
  );

  // Confirmation de l'ajout en stock seulement
  const handleConfirmMissingStockOnly = useCallback((newPanels: StockPanel[]) => {
    setShowMissingStockModal(false);
    setStockPanels((prev) => [...prev, ...newPanels]);
  }, []);

  // Matières présentes dans le stock de panneaux (groupées et triées par ordre alphabétique)
  const stockMaterials = useMemo(() => {
    const set = new Set<string>();
    stockPanels.forEach((p) => {
      const m = p.material?.trim();
      if (m) set.add(m);
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [stockPanels]);

  // Toutes les matières connues (stock, atelier, suggestions) triées par ordre alphabétique
  const allAvailableMaterials = useMemo(() => {
    const set = new Set<string>();
    stockPanels.forEach((p) => p.material && set.add(p.material.trim()));
    workshopStock.forEach((w) => w.material && set.add(w.material.trim()));
    cutItems.forEach((i) => i.material && set.add(i.material.trim()));
    [
      'Chêne Massif 20mm',
      'Contreplaqué 5mm',
      'Contreplaqué Bouleau 15mm',
      'Isorel 3mm',
      'MDF 8mm',
      'MDF 18mm',
      'MDF 19mm',
      'Mélaminé Blanc 18mm',
      'OSB 3 18mm',
    ].forEach((m) => set.add(m));

    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [stockPanels, workshopStock, cutItems]);

  // Charger un preset depuis la barre d'outils
  const handleLoadPreset = (preset: ProjectPreset) => {
    setProjectName(preset.name);
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

  // Réinitialiser le projet actuel
  const handleReset = async () => {
    if (
      window.confirm(
        'Êtes-vous sûr de vouloir vider tous les panneaux et les pièces de ce projet ?\n\nToutes les informations associées seront supprimées.'
      )
    ) {
      // Réintégrer les panneaux empruntés au stock atelier
      stockPanels
        .filter((p) => p.workshopSourceId)
        .forEach((p) => reintegrateToWorkshop(p));

      setStockPanels([]);
      setCutItems([]);
      setOptimizationResult(null);

      // Si le projet est enregistré sur Supabase, supprimer son enregistrement maintenant qu'il est vidé
      if (currentProjectId) {
        await deleteProjectFromCloud(currentProjectId);
        setSavedProjects((prev) => prev.filter((p) => p.id !== currentProjectId));
      }
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
    const len = Math.round(Math.max(offcut.length, offcut.width));
    const wid = Math.round(Math.min(offcut.length, offcut.width));
    const isQualifying = len >= 500 && wid >= 500;

    const newPanel: StockPanel = {
      id: `stock-offcut-${Date.now()}`,
      material: offcut.material,
      length: len,
      width: wid,
      quantity: 1,
      workshopSourceId: isQualifying ? `offcut-${Date.now()}` : undefined,
    };
    setStockPanels((prev) => [...prev, newPanel]);

    // Si cette chute était dans le stock atelier, la décrémenter
    if (isQualifying) {
      setWorkshopStock((prev) => {
        const idx = prev.findIndex(
          (it) =>
            it.material.toLowerCase().trim() ===
              offcut.material.toLowerCase().trim() &&
            Math.round(Math.max(it.length, it.width)) === len &&
            Math.round(Math.min(it.length, it.width)) === wid
        );
        if (idx >= 0) {
          const next = [...prev];
          if (next[idx].quantity > 1) {
            next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
          } else {
            next.splice(idx, 1);
          }
          return next;
        }
        return prev;
      });
    }
  };

  // SI LA VUE ACTIVE EST LE HUB (ACCUEIL)
  if (currentView === 'hub') {
    return (
      <>
        <ProjectHub
          savedProjects={savedProjects}
          onOpenProject={handleOpenProject}
          onCreateNewProject={handleCreateNewProject}
          onDeleteProject={handleDeleteProject}
        />
        {/* L'invitation à installer l'application n'est proposée QUE sur la page d'accueil */}
        <PwaInstallPrompt />
        <SupabaseConfigModal
          isOpen={isSupabaseModalOpen}
          onClose={() => setIsSupabaseModalOpen(false)}
          onConfigSaved={refreshProjectsList}
        />
      </>
    );
  }

  // SI LA VUE ACTIVE EST L'ATELIER (ÉDITEUR)
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Barre de navigation avec nom du projet et bouton Accueil */}
      <Navbar
        projectName={projectName}
        onOpenHub={() => setCurrentView('hub')}
        onSaveProject={handleManualSave}
        onDeleteCurrentProject={
          currentProjectId
            ? () => {
                if (
                  window.confirm(
                    `Supprimer définitivement le projet "${projectName}" et toutes ses données sur Supabase Cloud ?`
                  )
                ) {
                  handleDeleteProject(currentProjectId);
                }
              }
            : undefined
        }
        onLoadPreset={handleLoadPreset}
        onReset={handleReset}
        onPrint={handlePrint}
        isSaved={isSaved}
      />

      {/* Modal de configuration Supabase Cloud */}
      <SupabaseConfigModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
        onConfigSaved={refreshProjectsList}
      />

      {/* Impression Atelier (visible uniquement lors du print) */}
      {optimizationResult && (
        <PrintDossier
          result={optimizationResult}
          cutItems={cutItems}
          settings={settings}
          projectName={projectName}
          panelOrientations={panelOrientations}
        />
      )}

      {/* Contenu Principal de l'Atelier */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-5 print:hidden">
        {/* Bandeau du Titre du Projet avec bouton Assistant IA à droite */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Projet en cours
              </span>
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight truncate">
                {projectName}
              </h1>
            </div>
          </div>

          {/* Bouton Assistant IA à droite du titre du projet (identique à la photo jointe) */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setShowCabinetModal(true)}
              className="btn-assistant-ia-photo inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold transition-all shadow-sm active:scale-95"
              title="Assistant IA : calculer automatiquement les cotes d'un caisson selon les dimensions extérieures et l'assemblage"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Assistant IA</span>
            </button>
          </div>
        </div>
        {/* Boutons d'onglets pour navigation sur mobile (placés tout en haut sur mobile) */}
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

        {/* 1. Configuration & Trait de scie (Kerf) : masqué sur mobile lorsque l'onglet 2 est actif */}
        <div className={mobileTab === 'results' ? 'hidden lg:block' : 'block'}>
          <SettingsBar settings={settings} onChange={setSettings} />
        </div>

        {/* Grille principale : Formulaires à gauche, Plans et Résultats à droite */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Colonne Gauche : Saisie Stock et Liste de débit */}
          <div
            className={`lg:col-span-5 space-y-6 ${
              mobileTab === 'results' ? 'hidden lg:block' : 'block'
            }`}
          >
            {/* Gestion du stock de panneaux */}
            <StockManager
              key={`stock-${currentProjectId}`}
              panels={stockPanels}
              onChange={setStockPanels}
              availableMaterials={allAvailableMaterials}
              workshopStock={workshopStock}
              onAddFromWorkshop={handleAddFromWorkshop}
              onReintegrateToWorkshop={reintegrateToWorkshop}
              onDeleteWorkshopItem={handleDeleteWorkshopItem}
              onAddManualWorkshopItem={handleAddManualWorkshopItem}
            />

            {/* Saisie de la liste de débit (alimentée exclusivement par les matières en stock) */}
            <CutListManager
              key={`cut-${currentProjectId}`}
              items={cutItems}
              onChange={setCutItems}
              availableMaterials={stockMaterials}
              allAvailableMaterials={allAvailableMaterials}
              stockPanels={stockPanels}
              workshopStock={workshopStock}
              isCabinetModalOpen={showCabinetModal}
              onOpenCabinetModal={() => setShowCabinetModal(true)}
              onCloseCabinetModal={() => setShowCabinetModal(false)}
              onRequestOptimize={(updatedItems) =>
                handleOptimize(updatedItems || cutItems)
              }
            />

            {/* Bouton d'action principal : Calcul de l'optimisation */}
            <div className="pt-2 sticky bottom-4 z-20">
              <button
                type="button"
                onClick={() => handleOptimize()}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider py-3.5 px-6 rounded-2xl shadow-xl hover:shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] border border-amber-400/30"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Calculer l&apos;optimisation des coupes</span>
              </button>
            </div>
          </div>

          {/* Colonne Droite : Visualisation graphique & Résultats */}
          <div
            className={`lg:col-span-7 space-y-6 ${
              mobileTab === 'input' ? 'hidden lg:block' : 'block'
            }`}
          >
            {optimizationResult ? (
              <>
                {/* Visualiseur SVG interactif des panneaux (placé directement sous l'onglet 2. Plans de coupe) */}
                <CuttingVisualizer
                  panels={optimizationResult.panels}
                  kerf={settings.kerf}
                  projectName={projectName}
                  panelOrientations={panelOrientations}
                  onPanelOrientationsChange={setPanelOrientations}
                  edgeBanding={settings.edgeBanding}
                />

                {/* Statistiques Globales & Taux de chute */}
                <StatsSummary result={optimizationResult} />

                {/* Liste des chutes valorisables */}
                <OffcutsList
                  offcuts={optimizationResult.reusableOffcuts}
                  onAddOffcutToStock={handleAddOffcutToStock}
                />
              </>
            ) : (
              <div className="bg-slate-800/80 backdrop-blur border border-slate-700/80 rounded-2xl p-10 text-center text-slate-400">
                <Layers className="w-14 h-14 mx-auto text-slate-600 mb-4 animate-pulse" />
                <h3 className="text-base font-bold text-white">
                  Prêt pour le calcul d&apos;optimisation
                </h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
                  Saisissez vos panneaux bruts en stock et vos pièces à débiter,
                  puis cliquez sur{' '}
                  <strong className="text-amber-400">
                    « Calculer l&apos;optimisation des coupes »
                  </strong>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modale de suspension d'optimisation : Matière hors stock */}
      <MissingStockModal
        isOpen={showMissingStockModal}
        missingMaterials={missingStockData}
        onClose={() => setShowMissingStockModal(false)}
        onConfirmAndOptimize={handleConfirmMissingStockAndOptimize}
        onConfirmOnly={handleConfirmMissingStockOnly}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800 py-4 text-center text-xs text-slate-500 print:hidden">
        <p>
          Calepinage — Application d&apos;optimisation de découpe pour la
          menuiserie et l&apos;agencement.
        </p>
      </footer>
    </div>
  );
}
