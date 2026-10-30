'use client';

import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  X,
  CheckCircle,
  ExternalLink,
  MoreVertical,
  AlertCircle,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMessengerOrInApp, setIsMessengerOrInApp] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [showChromeGuide, setShowChromeGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Enregistrement du Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('Service Worker enregistré:', reg.scope);
          })
          .catch((err) => {
            console.warn('Erreur Service Worker:', err);
          });
      });
    }

    // 2. Détection Standalone (déjà installée comme vraie application)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
      return isStandaloneMode;
    };

    if (checkStandalone()) {
      return;
    }

    // 3. Détection de l'appareil et du navigateur
    const ua = (window.navigator.userAgent || window.navigator.vendor || '').toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(ua);
    const isDroid = /android/.test(ua);
    const isInApp =
      /fban|fbav|fb_iab|messenger|instagram|line|whatsapp|micromessenger/.test(ua) ||
      document.referrer.includes('messenger');

    setIsIOS(isApple);
    setIsMessengerOrInApp(isInApp);

    // 4. Écoute de l'événement PWA standard
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setInstalledSuccess(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      setTimeout(() => setInstalledSuccess(false), 5000);
    });

    // 5. Afficher automatiquement sur mobile si non installé
    if (isApple || isDroid || isInApp) {
      const dismissed = localStorage.getItem('calepinage_pwa_dismissed');
      // Afficher immédiatement pour les nouveaux visiteurs ou ceux qui n'ont pas masqué
      if (!dismissed || Date.now() - parseInt(dismissed, 10) > 12 * 60 * 60 * 1000) {
        setShowPrompt(true);
      }
    }

    // Écouteur pour déclenchement manuel
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
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          setShowPrompt(false);
          setInstalledSuccess(true);
          setTimeout(() => setInstalledSuccess(false), 5000);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error(err);
        setShowChromeGuide(true);
      }
    } else {
      // Si l'événement différé n'est pas prêt, on affiche le guide étape par étape
      setShowChromeGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem('calepinage_pwa_dismissed', Date.now().toString());
    } catch { }
  };

  if (isStandalone) {
    return null;
  }

  // URL intent pour sortir de Messenger directement vers Chrome
  const chromeIntentUrl =
    typeof window !== 'undefined'
      ? `intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end`
      : 'https://calepinage-mu.vercel.app';

  return (
    <>
      {/* Toast succès */}
      {installedSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-bounce">
          <CheckCircle className="w-5 h-5 text-emerald-200" />
          <span>Application Calepinage installée avec succès sur votre téléphone !</span>
        </div>
      )}

      {/* Bannière principale */}
      {showPrompt && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-[9990] animate-in fade-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900/98 backdrop-blur-md border-2 border-amber-500/50 rounded-2xl p-4 shadow-2xl text-white relative">
            <button
              type="button"
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* CAS 1 : Ouvert dans MESSENGER (WebView restreinte) */}
            {isMessengerOrInApp ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 pr-6">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-400">
                      Installer l&apos;application
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-snug">
                      Vous êtes dans le navigateur interne de <strong>Messenger</strong>, qui bloque l&apos;installation directe.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-850 border border-slate-700/80 rounded-xl p-3 text-xs space-y-2 text-slate-200">
                  <p className="font-semibold text-white">Pour installer sur votre écran d&apos;accueil :</p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                    <li>
                      Touchez les <strong>3 points (•••)</strong> tout en haut à droite de Messenger.
                    </li>
                    <li>
                      Choisissez <strong>« Ouvrir dans Chrome »</strong> (ou dans le navigateur système).
                    </li>
                  </ol>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={chromeIntentUrl}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-2.5 px-3 rounded-xl text-xs transition-all shadow-md active:scale-95 text-center"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-950" />
                    <span>Ouvrir directement dans Chrome</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              /* CAS 2 : Vrai navigateur (Chrome, Safari, etc.) */
              <div className="space-y-3">
                <div className="flex items-start gap-3 pr-6">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shrink-0 shadow-md">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Installer l&apos;application Calepinage
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                      Installez l&apos;application sur votre écran d&apos;accueil pour l&apos;utiliser en plein écran comme une vraie application !
                    </p>
                  </div>
                </div>

                {/* Bouton d'installation ou Guide */}
                {!isIOS ? (
                  <div>
                    {deferredPrompt ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleInstallClick}
                          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-lg active:scale-95"
                        >
                          <Download className="w-4 h-4 text-slate-950" />
                          <span>Installer sur mon téléphone</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDismiss}
                          className="px-2.5 py-2 text-xs text-slate-400 hover:text-white"
                        >
                          Plus tard
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowChromeGuide(!showChromeGuide)}
                          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3 rounded-xl text-xs transition-all shadow-md"
                        >
                          <Download className="w-4 h-4 text-slate-950" />
                          <span>Installer l&apos;application (Guide 2 clics)</span>
                        </button>
                        {showChromeGuide && (
                          <div className="bg-slate-850 p-2.5 rounded-xl border border-slate-700 text-[11px] text-slate-300 space-y-1">
                            <p className="text-amber-400 font-semibold flex items-center gap-1">
                              <MoreVertical className="w-3.5 h-3.5 inline" /> Dans Google Chrome :
                            </p>
                            <p>1. Appuyez sur les <strong>3 petits points verticaux (⋮)</strong> en haut à droite de Chrome.</p>
                            <p>2. Appuyez sur <strong>« Installer l&apos;application »</strong> ou <strong>« Ajouter à l&apos;écran d&apos;accueil »</strong>.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Guide iOS Safari */
                  <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-2">
                    <p className="text-[11px] text-amber-300 font-medium">
                      Sur votre iPhone :
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                      <li className="flex items-center gap-1.5">
                        1. Appuyez sur Partager <Share className="w-3.5 h-3.5 text-blue-400 inline" /> (en bas de l&apos;écran).
                      </li>
                      <li className="flex items-center gap-1.5">
                        2. Choisissez{' '}
                        <span className="font-semibold text-white inline-flex items-center gap-1">
                          « Sur l&apos;écran d&apos;accueil » <PlusSquare className="w-3.5 h-3.5 text-amber-400 inline" />
                        </span>
                        .
                      </li>
                      <li>3. Touchez « Ajouter ».</li>
                    </ol>
                    <button
                      type="button"
                      onClick={handleDismiss}
                      className="w-full mt-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      J&apos;ai compris
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
