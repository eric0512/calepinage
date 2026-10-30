'use client';

import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // 1. Enregistrement du Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('Service Worker enregistré avec succès:', reg.scope);
          })
          .catch((err) => {
            console.warn('Erreur lors de l’enregistrement du Service Worker:', err);
          });
      });
    }

    // 2. Vérification si l'application est déjà installée et ouverte en mode Standalone
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
      return isStandaloneMode;
    };

    if (checkStandalone()) {
      return; // Déjà installée et ouverte comme une app native !
    }

    // 3. Détection iOS (Safari iPhone / iPad)
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isAppleDevice);

    // 4. Écoute de l'événement beforeinstallprompt (Android Chrome / Chromium)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Afficher immédiatement la proposition d'installation
      const dismissed = localStorage.getItem('calepinage_pwa_dismissed');
      // Si l'utilisateur n'a pas fermé il y a moins de 24h, on affiche
      if (!dismissed || Date.now() - parseInt(dismissed, 10) > 24 * 60 * 60 * 1000) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Détection si l'application vient d'être installée
    window.addEventListener('appinstalled', () => {
      setInstalledSuccess(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      setTimeout(() => setInstalledSuccess(false), 4000);
    });

    // Si on est sur iOS et non installé, afficher après un court délai pour guider l'utilisateur
    if (isAppleDevice && !checkStandalone()) {
      const dismissed = localStorage.getItem('calepinage_pwa_dismissed');
      if (!dismissed || Date.now() - parseInt(dismissed, 10) > 24 * 60 * 60 * 1000) {
        const timer = setTimeout(() => {
          setShowPrompt(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }

    // Écouteur pour déclenchement manuel (ex: bouton dans le menu ou la barre)
    const handleTriggerCustom = () => {
      setShowPrompt(true);
    };
    window.addEventListener('trigger-pwa-install', handleTriggerCustom);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('trigger-pwa-install', handleTriggerCustom);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowPrompt(false);
        setInstalledSuccess(true);
        setTimeout(() => setInstalledSuccess(false), 4000);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('Erreur lors du déclenchement de l’installation:', err);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem('calepinage_pwa_dismissed', Date.now().toString());
    } catch {}
  };

  // Si déjà en plein écran autonome, ne rien afficher
  if (isStandalone) {
    return null;
  }

  return (
    <>
      {/* Toast de succès une fois installé */}
      {installedSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-200" />
          <span>Application installée avec succès sur votre téléphone !</span>
        </div>
      )}

      {/* Bannière / Boîte de dialogue d'installation automatique */}
      {showPrompt && (
        <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-[9990] animate-in fade-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900/95 backdrop-blur-md border-2 border-amber-500/40 rounded-2xl p-4 shadow-2xl text-white relative">
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5 pr-6">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shrink-0 shadow-md">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Installer l&apos;application Calepinage
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  Profitez de l&apos;application en plein écran, avec un accès direct depuis votre écran d&apos;accueil sans passer par le navigateur !
                </p>
              </div>
            </div>

            {/* Guide Android avec bouton direct d'installation */}
            {deferredPrompt && (
              <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-lg active:scale-95"
                >
                  <Download className="w-4 h-4 text-slate-950" />
                  <span>Installer maintenant</span>
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="px-3 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Plus tard
                </button>
              </div>
            )}

            {/* Guide iPhone / iPad (iOS Safari) */}
            {isIOS && !deferredPrompt && (
              <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-300 space-y-2">
                <p className="text-[11px] text-amber-300 font-medium">
                  Pour installer sur votre iPhone :
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                  <li className="flex items-center gap-1.5">
                    1. Appuyez sur le bouton Partager{' '}
                    <Share className="w-3.5 h-3.5 text-blue-400 inline" /> (au bas de l’écran Safari).
                  </li>
                  <li className="flex items-center gap-1.5">
                    2. Faites défiler et touchez{' '}
                    <span className="font-semibold text-white inline-flex items-center gap-1">
                      « Sur l&apos;écran d&apos;accueil » <PlusSquare className="w-3.5 h-3.5 text-amber-400 inline" />
                    </span>
                    .
                  </li>
                  <li>3. Touchez « Ajouter » en haut à droite.</li>
                </ol>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  J&apos;ai compris
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

