import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Share2,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 shadow-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
      <span>Hors ligne — Mode lecture en cache actif</span>
    </div>
  );
}

interface PWAInstallButtonProps {
  onOpenMobileGuide: () => void;
  variant?: 'header' | 'sidebar' | 'footer';
}

export function PWAInstallButton({
  onOpenMobileGuide,
  variant = 'header',
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    onOpenMobileGuide();
  };

  if (isInstalled && variant === 'header') {
    return null;
  }

  if (variant === 'footer') {
    return (
      <button
        type="button"
        onClick={() => void handleClick()}
        className="hover:text-stone-900 transition-colors inline-flex items-center gap-1.5 font-medium text-[#1B365D]"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>
          {isInstalled
            ? 'Application mobile active'
            : isInstallable
              ? 'Installer la version mobile'
              : 'Version mobile'}
        </span>
      </button>
    );
  }

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={() => void handleClick()}
        className="w-full min-h-[36px] px-2.5 py-2 rounded-md border border-[#CBD6E6] bg-white text-xs font-medium text-[#1B365D] hover:border-[#1B365D] transition-colors flex items-center justify-between gap-2"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {isInstalled
              ? 'App mobile installée'
              : isInstallable
                ? 'Installer sur mobile'
                : 'Version mobile'}
          </span>
        </span>
        {!isInstalled && (
          <Download className="w-3.5 h-3.5 shrink-0 opacity-80" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label={
        isInstallable
          ? 'Installer la version mobile de Lisière'
          : isIOS
            ? 'Installer Lisière sur iPhone ou iPad'
            : 'Ouvrir les liens vers la version mobile'
      }
      title="Version mobile & installation sur téléphone"
      className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#1B365D] bg-white border border-stone-200 rounded-md hover:border-[#1B365D] transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
    >
      {isInstallable ? (
        <Download className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="hidden sm:inline">
        {isInstallable ? 'Installer l’app' : 'Version mobile'}
      </span>
    </button>
  );
}

interface MobileAppModalProps {
  open: boolean;
  onClose: () => void;
}

export function MobileAppModal({ open, onClose }: MobileAppModalProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  if (!open) return null;

  const mobileUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?source=mobile` : '/';

  const handleCopyLink = async () => {
    setShareFeedback(null);
    try {
      await navigator.clipboard.writeText(mobileUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setShareFeedback('Impossible de copier automatiquement. Copiez le lien affiché ci-dessus.');
    }
  };

  const handleNativeShare = async () => {
    setShareFeedback(null);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Lisière — Version mobile',
          text: 'Ouvrir Lisière sur téléphone et l’installer sur l’écran d’accueil :',
          url: mobileUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    await handleCopyLink();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-app-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-[#FBF9F5] border border-stone-200 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="px-5 py-4 border-b border-stone-200 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="Icône Lisière"
              className="w-9 h-9 rounded-lg border border-stone-200 shrink-0"
            />
            <div className="min-w-0">
              <h2
                id="mobile-app-modal-title"
                className="font-display text-xl font-medium text-stone-900 truncate"
              >
                Lisière sur mobile
              </h2>
              <p className="text-xs text-stone-500">
                Application web installable (Android, iPhone &amp; tablette)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {isInstalled ? (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Vous utilisez actuellement Lisière en mode application mobile autonome.
              </span>
            </div>
          ) : isInstallable ? (
            <div className="p-4 rounded-lg bg-[#F3F6FA] border border-[#CBD6E6] space-y-3">
              <p className="text-xs text-stone-700 leading-relaxed">
                Installez directement Lisière sur l’écran d’accueil de votre téléphone pour une lecture plein écran, rapide et avec barre de navigation mobile dédiée.
              </p>
              <button
                type="button"
                onClick={() => void install()}
                className="w-full min-h-[42px] px-4 py-2 rounded-md bg-[#1B365D] text-white text-sm font-medium hover:bg-[#132744] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Installer l’application mobile</span>
              </button>
            </div>
          ) : null}

          {/* Direct mobile link sharing */}
          <div className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-stone-500 font-medium">
              Lien direct vers la version mobile
            </p>
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-[#FBF9F5] border border-stone-200">
              <span className="text-xs font-mono text-stone-700 truncate flex-1 select-all">
                {mobileUrl}
              </span>
              <a
                href={mobileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir le lien mobile"
                aria-label="Ouvrir le lien mobile dans un nouvel onglet"
                className="p-1.5 rounded text-[#1B365D] hover:bg-stone-200/60 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="min-h-[38px] px-3 py-1.5 rounded-md border border-stone-200 bg-[#FBF9F5] hover:border-[#1B365D] text-xs font-medium text-stone-800 inline-flex items-center justify-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Lien copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copier le lien mobile</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="min-h-[38px] px-3 py-1.5 rounded-md bg-[#1B365D] text-white hover:bg-[#132744] text-xs font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Envoyer vers un téléphone</span>
              </button>
            </div>
            {shareFeedback && (
              <p className="text-xs text-stone-600">{shareFeedback}</p>
            )}
          </div>

          {/* Step-by-step phone install guides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-3.5 rounded-lg border bg-white space-y-1.5 ${
                isIOS ? 'border-[#1B365D] ring-1 ring-[#1B365D]/20' : 'border-stone-200'
              }`}
            >
              <p className="text-xs font-semibold text-stone-900">
                iPhone &amp; iPad (Safari)
              </p>
              <ol className="text-xs text-stone-600 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Ouvrez le lien dans <strong>Safari</strong>.</li>
                <li>Touchez le bouton <strong>Partager</strong> (carré avec flèche).</li>
                <li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li>
              </ol>
            </div>

            <div className="p-3.5 rounded-lg border border-stone-200 bg-white space-y-1.5">
              <p className="text-xs font-semibold text-stone-900">
                Android (Chrome)
              </p>
              <ol className="text-xs text-stone-600 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Ouvrez le lien dans <strong>Chrome</strong>.</li>
                <li>Touchez <strong>Installer l’app</strong> ou le menu <strong>⋮</strong>.</li>
                <li>Sélectionnez <strong>Ajouter à l’écran d’accueil</strong>.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
