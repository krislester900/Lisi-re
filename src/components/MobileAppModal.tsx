import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FolderGit2,
  Loader2,
  Settings2,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  WifiOff,
  Workflow,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { isModerationAdminEmail } from '../lib/moderationLabels';
import { AuthDiagnosticsPanel } from './AuthDiagnosticsPanel';
import {
  clearMobileDistributionConfig,
  formatFriendlyFirestoreError,
  isValidGitHubRepoUrl,
  normalizeGitHubRepoUrl,
  saveMobileDistributionConfig,
  subscribeToMobileDistributionConfig,
} from '../lib/storyService';
import { MobileDistributionConfig } from '../types/story';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/90 px-3 py-2 text-xs font-medium text-amber-950 dark:text-amber-100 shadow-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
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
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();

  const handleClick = async () => {
    if (isInstallable && !isInIframe) {
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
        className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors inline-flex items-center gap-1.5 font-medium text-[#1B365D] dark:text-amber-300"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>
          {isInstalled
            ? 'Application mobile active'
            : isInstallable && !isInIframe
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
        className="w-full min-h-[36px] px-2.5 py-2 rounded-md border border-[#CBD6E6] dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-[#1B365D] dark:text-amber-300 hover:border-[#1B365D] dark:hover:border-amber-400 transition-colors flex items-center justify-between gap-2"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {isInstalled
              ? 'App mobile installée'
              : isInstallable && !isInIframe
                ? 'Installer sur mobile'
                : 'Version mobile'}
          </span>
        </span>
        {!isInstalled && <Download className="w-3.5 h-3.5 shrink-0 opacity-80" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-label={
        isInstallable && !isInIframe
          ? 'Installer la version mobile de Lisière'
          : isIOS
            ? 'Installer Lisière sur iPhone ou iPad'
            : 'Ouvrir les liens vers la version mobile'
      }
      title="Version mobile & téléchargement APK Android"
      className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-md hover:border-[#1B365D] dark:hover:border-amber-400 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
    >
      {isInstallable && !isInIframe ? (
        <Download className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="hidden sm:inline">
        {isInstallable && !isInIframe ? 'Installer l’app' : 'Version mobile'}
      </span>
    </button>
  );
}

interface MobileAppModalProps {
  open: boolean;
  onClose: () => void;
  initialShowDiagnostics?: boolean;
}

export function MobileAppModal({
  open,
  onClose,
  initialShowDiagnostics = false,
}: MobileAppModalProps) {
  const { user, profile, authReady } = useAuth();
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const [firestoreConfig, setFirestoreConfig] = useState<MobileDistributionConfig | null>(null);
  const [repoInput, setRepoInput] = useState('');
  const [showAdminConfig, setShowAdminConfig] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(Boolean(initialShowDiagnostics));
  const [savingRepo, setSavingRepo] = useState(false);
  const [repoFeedback, setRepoFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const isAdmin = Boolean(
    user &&
      user.emailVerified !== false &&
      (profile?.isAdmin || isModerationAdminEmail(user.email))
  );

  const envRepoUrl = normalizeGitHubRepoUrl(import.meta.env.VITE_GITHUB_REPO_URL || '');
  const activeRepoUrl = normalizeGitHubRepoUrl(firestoreConfig?.githubRepoUrl || envRepoUrl);
  const hasValidRepoUrl = isValidGitHubRepoUrl(activeRepoUrl);

  useEffect(() => {
    if (!open || !authReady) return;
    const unsub = subscribeToMobileDistributionConfig((cfg) => {
      setFirestoreConfig(cfg);
      if (cfg?.githubRepoUrl) {
        setRepoInput(cfg.githubRepoUrl);
      } else if (envRepoUrl) {
        setRepoInput(envRepoUrl);
      }
    });
    return () => unsub();
  }, [open, authReady, envRepoUrl]);

  useEffect(() => {
    if (open && !repoInput && activeRepoUrl) {
      setRepoInput(activeRepoUrl);
    }
  }, [open, activeRepoUrl, repoInput]);

  useEffect(() => {
    if (open) {
      setShowDiagnostics(Boolean(initialShowDiagnostics));
    }
  }, [open, initialShowDiagnostics]);

  if (!open) return null;

  const mobileUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/?source=mobile` : '/';
  const directApkUrl = hasValidRepoUrl
    ? `${activeRepoUrl}/releases/latest/download/Lisiere-mobile.apk`
    : '';
  const releasesPageUrl = hasValidRepoUrl ? `${activeRepoUrl}/releases` : '';
  const actionsPageUrl = hasValidRepoUrl ? `${activeRepoUrl}/actions` : '';

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

  const handleSaveRepoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;
    setRepoFeedback(null);
    setSavingRepo(true);
    try {
      const savedUrl = await saveMobileDistributionConfig({
        githubRepoUrl: repoInput,
        updatedBy: user.uid,
      });
      setRepoInput(savedUrl);
      setRepoFeedback({
        type: 'success',
        text: 'Lien GitHub enregistré. Le bouton de téléchargement APK pointe désormais vers ce dépôt.',
      });
      setShowAdminConfig(false);
    } catch (err) {
      setRepoFeedback({
        type: 'error',
        text: formatFriendlyFirestoreError(
          err,
          'Impossible d’enregistrer le lien GitHub.',
          'Seul l’administrateur vérifié peut modifier le lien du dépôt GitHub.'
        ),
      });
    } finally {
      setSavingRepo(false);
    }
  };

  const handleClearRepoUrl = async () => {
    if (!user || !isAdmin || !firestoreConfig) return;
    setRepoFeedback(null);
    setSavingRepo(true);
    try {
      await clearMobileDistributionConfig();
      setRepoInput(envRepoUrl || '');
      setRepoFeedback({
        type: 'success',
        text: 'Lien personnalisé supprimé.',
      });
    } catch (err) {
      setRepoFeedback({
        type: 'error',
        text: formatFriendlyFirestoreError(err, 'Impossible de réinitialiser le lien GitHub.'),
      });
    } finally {
      setSavingRepo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-app-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="Icône Lisière"
              className="w-9 h-9 rounded-lg border border-stone-200 dark:border-stone-700 shrink-0"
            />
            <div className="min-w-0">
              <h2
                id="mobile-app-modal-title"
                className="font-display text-xl font-medium text-stone-900 dark:text-stone-100 truncate"
              >
                Lisière sur mobile
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                APK Android via GitHub &amp; application web installable
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Android APK via GitHub Actions / GitHub Releases */}
          <div className="p-4 rounded-lg bg-white dark:bg-stone-900 border border-[#CBD6E6] dark:border-stone-700 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <FolderGit2 className="w-4 h-4 text-[#1B365D] dark:text-amber-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Application Android (.APK) via GitHub
                  </p>
                  <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed mt-0.5">
                    Compilée automatiquement par GitHub Actions à chaque mise à jour du dépôt.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminConfig((prev) => !prev)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 text-[11px] font-medium text-stone-700 dark:text-stone-300 hover:border-[#1B365D] dark:hover:border-amber-400"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>{hasValidRepoUrl ? 'Modifier' : 'Configurer'}</span>
                </button>
              )}
            </div>

            {hasValidRepoUrl ? (
              <div className="space-y-2.5">
                <a
                  href={releasesPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[42px] px-4 py-2 rounded-md bg-[#1B365D] dark:bg-amber-600 text-white text-sm font-medium hover:bg-[#132744] dark:hover:bg-amber-500 inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Télécharger l’APK / AAB (GitHub Releases)</span>
                </a>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <a
                    href={directApkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 hover:border-[#1B365D] dark:hover:border-amber-400 text-xs font-medium text-stone-800 dark:text-stone-200 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>Lien direct APK</span>
                  </a>
                  <a
                    href={actionsPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 hover:border-[#1B365D] dark:hover:border-amber-400 text-xs font-medium text-stone-800 dark:text-stone-200 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Workflow className="w-3.5 h-3.5 shrink-0" />
                    <span>Artifacts GitHub Actions</span>
                  </a>
                </div>

                <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                  Dépôt lié :{' '}
                  <a
                    href={activeRepoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline hover:text-stone-800 dark:hover:text-stone-200 break-all"
                  >
                    {activeRepoUrl}
                  </a>
                  . Sur Android, autorisez « Sources inconnues » lors de l’ouverture du fichier{' '}
                  <span className="font-mono">Lisiere-mobile.apk</span>.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-md bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 leading-relaxed space-y-1.5">
                <p>
                  Le workflow de build Android (<span className="font-mono">.github/workflows/android-apk.yml</span>) est prêt dans le code source.
                </p>
                {isAdmin ? (
                  <p className="text-stone-800 dark:text-stone-200 font-medium">
                    Poussez le projet sur GitHub, puis collez l’URL de votre dépôt ci-dessous pour activer le bouton de téléchargement APK pour tous vos lecteurs.
                  </p>
                ) : (
                  <p>
                    Dès que l’administrateur aura lié le dépôt GitHub, le bouton de téléchargement de l’APK apparaîtra ici. En attendant, vous pouvez installer la version mobile instantanément ci-dessous.
                  </p>
                )}
              </div>
            )}

            {isAdmin && (showAdminConfig || !hasValidRepoUrl) && (
              <form
                onSubmit={(e) => void handleSaveRepoUrl(e)}
                className="pt-3 border-t border-stone-200 dark:border-stone-800 space-y-2.5"
              >
                <label
                  htmlFor="github-repo-url-input"
                  className="block text-[11px] uppercase tracking-wider font-medium text-stone-600 dark:text-stone-400"
                >
                  URL du dépôt GitHub (admin)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="github-repo-url-input"
                    type="url"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="https://github.com/votre-compte/lisiere"
                    required
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 text-xs font-mono text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-[#1B365D]/30 dark:focus:ring-amber-400/30"
                  />
                  <button
                    type="submit"
                    disabled={savingRepo}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-md bg-[#1B365D] dark:bg-amber-600 text-white text-xs font-medium hover:bg-[#132744] dark:hover:bg-amber-500 disabled:opacity-60 inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {savingRepo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Enregistrer</span>
                  </button>
                  {firestoreConfig && (
                    <button
                      type="button"
                      disabled={savingRepo}
                      onClick={() => void handleClearRepoUrl()}
                      title="Supprimer le lien enregistré"
                      aria-label="Supprimer le lien GitHub enregistré"
                      className="min-h-[38px] px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:text-red-700 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 inline-flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Format attendu : <span className="font-mono">https://github.com/utilisateur/depot</span>
                </p>
              </form>
            )}

            {repoFeedback && (
              <p
                className={`text-xs ${
                  repoFeedback.type === 'success'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {repoFeedback.text}
              </p>
            )}
          </div>

          {isInstalled ? (
            <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-950 dark:text-emerald-100 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>
                Vous utilisez actuellement Lisière en mode application mobile autonome.
              </span>
            </div>
          ) : isInIframe ? (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-950 dark:text-amber-100 leading-relaxed">
                  <p className="font-semibold">
                    Installation rapide sur iPhone / navigateur (hors aperçu) :
                  </p>
                  <p>
                    Les navigateurs bloquent l’ajout à l’écran d’accueil dans un cadre d’aperçu intégré. Ouvrez l’adresse directement dans Chrome (Android) ou Safari (iPhone).
                  </p>
                </div>
              </div>
              <a
                href={mobileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[42px] px-4 py-2 rounded-md border border-[#1B365D] dark:border-amber-500 text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-900 text-sm font-medium hover:bg-[#F3F6FA] dark:hover:bg-stone-800 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ouvrir la version web mobile</span>
              </a>
            </div>
          ) : isInstallable ? (
            <div className="p-4 rounded-lg bg-[#F3F6FA] dark:bg-stone-900 border border-[#CBD6E6] dark:border-stone-700 space-y-3">
              <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                Installez directement Lisière sur l’écran d’accueil de votre téléphone pour une lecture plein écran, rapide et avec barre de navigation mobile dédiée.
              </p>
              <button
                type="button"
                onClick={() => void install()}
                className="w-full min-h-[42px] px-4 py-2 rounded-md border border-[#1B365D] dark:border-amber-500 text-[#1B365D] dark:text-amber-300 bg-white dark:bg-stone-950 text-sm font-medium hover:bg-[#F3F6FA] dark:hover:bg-stone-800 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Installer sur l’écran d’accueil (PWA)</span>
              </button>
            </div>
          ) : null}

          {/* Direct mobile link sharing */}
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-4 space-y-3">
            <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 font-medium">
              Lien direct vers la version web mobile
            </p>
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-700">
              <span className="text-xs font-mono text-stone-700 dark:text-stone-200 truncate flex-1 select-all">
                {mobileUrl}
              </span>
              <a
                href={mobileUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir le lien mobile"
                aria-label="Ouvrir le lien mobile dans un nouvel onglet"
                className="p-1.5 rounded text-[#1B365D] dark:text-amber-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="min-h-[38px] px-3 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 bg-[#FBF9F5] dark:bg-stone-950 hover:border-[#1B365D] dark:hover:border-amber-400 text-xs font-medium text-stone-800 dark:text-stone-200 inline-flex items-center justify-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
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
                className="min-h-[38px] px-3 py-1.5 rounded-md bg-stone-800 dark:bg-stone-700 text-white hover:bg-stone-900 dark:hover:bg-stone-600 text-xs font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Envoyer vers un téléphone</span>
              </button>
            </div>
            {shareFeedback && (
              <p className="text-xs text-stone-600 dark:text-stone-400">{shareFeedback}</p>
            )}
          </div>

          {/* Step-by-step phone install guides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-3.5 rounded-lg border bg-white dark:bg-stone-900 space-y-1.5 ${
                isIOS
                  ? 'border-[#1B365D] dark:border-amber-400 ring-1 ring-[#1B365D]/20 dark:ring-amber-400/20'
                  : 'border-stone-200 dark:border-stone-800'
              }`}
            >
              <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                iPhone &amp; iPad (Safari)
              </p>
              <ol className="text-xs text-stone-600 dark:text-stone-400 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Ouvrez le lien hors aperçu dans <strong>Safari</strong>.</li>
                <li>Touchez le bouton <strong>Partager</strong> (carré avec flèche).</li>
                <li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li>
              </ol>
            </div>

            <div
              className={`p-3.5 rounded-lg border bg-white dark:bg-stone-900 space-y-1.5 ${
                isAndroid
                  ? 'border-[#1B365D] dark:border-amber-400 ring-1 ring-[#1B365D]/20 dark:ring-amber-400/20'
                  : 'border-stone-200 dark:border-stone-800'
              }`}
            >
              <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                Android (APK ou Chrome)
              </p>
              <ol className="text-xs text-stone-600 dark:text-stone-400 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Téléchargez <strong>Lisiere-mobile.apk</strong> via GitHub Releases.</li>
                <li>Ou ouvrez dans <strong>Chrome</strong> et touchez <strong>⋮</strong>.</li>
                <li>Sélectionnez <strong>Ajouter à l’écran d’accueil</strong>.</li>
              </ol>
            </div>
          </div>

          {/* Collapsible Firebase Auth & PWA OAuth Diagnostics */}
          <div className="pt-1 border-t border-stone-200 dark:border-stone-800 space-y-3">
            <button
              type="button"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              aria-expanded={showDiagnostics}
              className="w-full min-h-[38px] px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-[#1B365D] dark:hover:border-amber-400 text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center justify-between gap-2 transition-colors"
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-[#1B365D] dark:text-amber-300 shrink-0" />
                <span className="truncate">
                  Diagnostic connexion Google &amp; redirection OAuth (PWA)
                </span>
              </span>
              {showDiagnostics ? (
                <ChevronUp className="w-4 h-4 shrink-0 text-stone-400" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0 text-stone-400" />
              )}
            </button>

            {showDiagnostics && <AuthDiagnosticsPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
