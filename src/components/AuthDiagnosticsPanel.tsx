import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Info,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  AuthDiagnosticEntry,
  clearAuthDiagnosticLogs,
  formatAuthDiagnosticReport,
  getAuthEnvironmentSnapshot,
  subscribeToAuthDiagnostics,
} from '../lib/authDiagnostics';

const RUNTIME_LABELS: Record<string, string> = {
  'capacitor-native': 'Application native (Capacitor)',
  'pwa-standalone': 'PWA installée (mode autonome)',
  'browser-iframe': 'Aperçu intégré (iframe)',
  'browser-tab': 'Navigateur web classique',
};

export function AuthDiagnosticsPanel() {
  const { signInWithGoogleRedirect } = useAuth();
  const [entries, setEntries] = useState<AuthDiagnosticEntry[]>([]);
  const [env, setEnv] = useState(() => getAuthEnvironmentSnapshot());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = subscribeToAuthDiagnostics((nextEntries) => {
      setEntries(nextEntries);
      setEnv(getAuthEnvironmentSnapshot());
    });
    return () => unsub();
  }, []);

  const refreshEnv = () => {
    setEnv(getAuthEnvironmentSnapshot());
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(formatAuthDiagnosticReport());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-stone-900 dark:text-stone-100">
          Inspection Firebase Auth, OAuth &amp; PWA
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={refreshEnv}
            title="Actualiser l’état"
            aria-label="Actualiser l’état"
            className="p-1.5 rounded border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-[#1B365D] dark:hover:border-amber-400"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleCopyReport()}
            className="px-2 py-1 rounded border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-[#1B365D] dark:hover:border-amber-400 inline-flex items-center gap-1"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copier</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={clearAuthDiagnosticLogs}
            title="Vider les logs"
            aria-label="Vider les logs"
            className="p-1.5 rounded border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-red-700 dark:hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Environment & oAuthClientId check */}
      <div className="grid grid-cols-1 gap-1.5 p-2.5 rounded-md bg-[#FBF9F5] dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-[11px] text-stone-700 dark:text-stone-300">
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-500 dark:text-stone-400">Mode détecté :</span>
          <span className="font-medium text-stone-900 dark:text-stone-100">
            {RUNTIME_LABELS[env.runtimeMode] || env.runtimeMode}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-500 dark:text-stone-400">Origine :</span>
          <span className="font-mono truncate max-w-[230px]">{env.origin}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-500 dark:text-stone-400">Service Worker PWA :</span>
          <span className="font-medium">
            {env.serviceWorkerControlled ? 'Actif (/__/ exclu)' : 'Inactif'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-500 dark:text-stone-400">Redirection OAuth en cours :</span>
          <span className="font-medium">
            {env.redirectPending ? `Oui (${env.redirectInitiatedAt})` : 'Non'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-500 dark:text-stone-400">authDomain SDK :</span>
          <span className="font-mono truncate max-w-[230px]">
            {env.sdkAuthDomain || '—'} ({env.authDomainMatches ? 'OK' : 'Écart'})
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-500 dark:text-stone-400">oAuthClientId config :</span>
          <span className="font-mono truncate max-w-[220px]">
            {env.hasOAuthClientIdInConfig ? env.oAuthClientId : 'Absent'}
          </span>
        </div>
      </div>

      <div className="p-2.5 rounded-md bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-950 dark:text-amber-100 leading-relaxed flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong>Vérification oAuthClientId :</strong> côté navigateur / PWA,{' '}
          <span className="font-mono">initializeApp</span> et{' '}
          <span className="font-mono">GoogleAuthProvider</span> n’utilisent pas directement{' '}
          <span className="font-mono">oAuthClientId</span> (Firebase Auth lit la configuration Google du projet via{' '}
          <span className="font-mono">authDomain</span>). Côté APK Android natif,{' '}
          <span className="font-mono">oAuthClientId</span> est injecté comme{' '}
          <span className="font-mono">default_web_client_id</span> pour obtenir l’<span className="font-mono">idToken</span>.
        </div>
      </div>

      {!env.isNative && !env.currentUserUid && (
        <button
          type="button"
          onClick={() => void signInWithGoogleRedirect()}
          className="w-full min-h-[36px] px-3 py-1.5 rounded-md border border-[#1B365D] dark:border-amber-500 text-[#1B365D] dark:text-amber-300 bg-[#FBF9F5] dark:bg-stone-950 hover:bg-[#F3F6FA] dark:hover:bg-stone-800 font-medium text-xs transition-colors"
        >
          Tester la connexion Google par redirection (PWA)
        </button>
      )}

      {/* Chronological diagnostic log */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="text-[11px] text-stone-500 dark:text-stone-400 italic">
            Aucun événement enregistré pour cette session.
          </p>
        ) : (
          [...entries].reverse().map((entry) => (
            <div
              key={entry.id}
              className="p-2 rounded border border-stone-200 dark:border-stone-800 bg-[#FBF9F5] dark:bg-stone-950 space-y-0.5"
            >
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-stone-700 dark:text-stone-200">
                  {entry.status === 'ok' && (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  )}
                  {entry.status === 'error' && (
                    <ShieldAlert className="w-3 h-3 text-red-600 dark:text-red-400" />
                  )}
                  {entry.stage}
                </span>
                <span className="font-mono text-stone-400 dark:text-stone-500">
                  {entry.timestamp.slice(11, 19)}
                </span>
              </div>
              <p className="text-[11px] text-stone-800 dark:text-stone-200 leading-snug">
                {entry.message}
              </p>
              {entry.details && (
                <p className="text-[10px] font-mono text-stone-500 dark:text-stone-400 break-all">
                  {Object.entries(entry.details)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
