import { Capacitor } from '@capacitor/core';
import { auth, firebaseAuthMetadata } from './firebase';

export type AuthDiagnosticStage =
  | 'init'
  | 'config'
  | 'pwa'
  | 'redirect-check'
  | 'signin-start'
  | 'signin-popup'
  | 'signin-redirect'
  | 'signin-native'
  | 'signin-success'
  | 'signin-error'
  | 'auth-state'
  | 'signout';

export type AuthDiagnosticStatus = 'info' | 'ok' | 'warn' | 'error';

export interface AuthDiagnosticEntry {
  id: string;
  timestamp: string;
  stage: AuthDiagnosticStage;
  status: AuthDiagnosticStatus;
  message: string;
  details?: Record<string, string | boolean | number | null>;
}

export interface AuthEnvironmentSnapshot {
  runtimeMode: 'capacitor-native' | 'pwa-standalone' | 'browser-iframe' | 'browser-tab';
  platform: string;
  isNative: boolean;
  isStandalonePWA: boolean;
  isInIframe: boolean;
  origin: string;
  currentPath: string;
  serviceWorkerControlled: boolean;
  redirectPending: boolean;
  redirectInitiatedAt: string | null;
  projectId: string;
  authDomain: string;
  sdkAuthDomain: string;
  authDomainMatches: boolean;
  oAuthClientId: string;
  hasOAuthClientIdInConfig: boolean;
  webSdkConsumesOAuthClientIdDirectly: boolean;
  providerId: string;
  currentUserUid: string | null;
  currentUserEmailVerified: boolean | null;
  androidPackageName: string;
  expectedAndroidSha1: string;
}

const DIAGNOSTIC_STORAGE_KEY = 'lisiere_auth_diagnostics_v1';
const REDIRECT_PENDING_KEY = 'lisiere_oauth_redirect_pending_v1';
const MAX_DIAGNOSTIC_ENTRIES = 40;

type Listener = (entries: AuthDiagnosticEntry[]) => void;

const listeners = new Set<Listener>();
let memoryEntries: AuthDiagnosticEntry[] = loadStoredEntries();

function loadStoredEntries(): AuthDiagnosticEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuthDiagnosticEntry[]).slice(-MAX_DIAGNOSTIC_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveStoredEntries(entries: AuthDiagnosticEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_DIAGNOSTIC_ENTRIES))
    );
  } catch {
    // Ignore storage quota errors
  }
}

function notifyListeners(): void {
  const snapshot = [...memoryEntries];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function logAuthDiagnostic(
  stage: AuthDiagnosticStage,
  status: AuthDiagnosticStatus,
  message: string,
  details?: Record<string, string | boolean | number | null>
): void {
  const entry: AuthDiagnosticEntry = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    stage,
    status,
    message,
    details,
  };
  memoryEntries = [...memoryEntries, entry].slice(-MAX_DIAGNOSTIC_ENTRIES);
  saveStoredEntries(memoryEntries);
  notifyListeners();
}

export function getAuthDiagnosticLogs(): AuthDiagnosticEntry[] {
  return [...memoryEntries];
}

export function clearAuthDiagnosticLogs(): void {
  memoryEntries = [];
  saveStoredEntries(memoryEntries);
  notifyListeners();
}

export function subscribeToAuthDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  listener([...memoryEntries]);
  return () => {
    listeners.delete(listener);
  };
}

export function markOAuthRedirectPending(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, new Date().toISOString());
  } catch {
    // Ignore storage restrictions
  }
}

export function clearOAuthRedirectPending(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // Ignore storage restrictions
  }
}

export function getOAuthRedirectPendingAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(REDIRECT_PENDING_KEY);
  } catch {
    return null;
  }
}

export function getAuthEnvironmentSnapshot(): AuthEnvironmentSnapshot {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isStandalonePWA =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
  const isInIframe =
    typeof window !== 'undefined' && (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const runtimeMode: AuthEnvironmentSnapshot['runtimeMode'] = isNative
    ? 'capacitor-native'
    : isStandalonePWA
      ? 'pwa-standalone'
      : isInIframe
        ? 'browser-iframe'
        : 'browser-tab';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const currentPath =
    typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
  const serviceWorkerControlled =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller);

  const redirectInitiatedAt = getOAuthRedirectPendingAt();

  return {
    runtimeMode,
    platform,
    isNative,
    isStandalonePWA,
    isInIframe,
    origin,
    currentPath,
    serviceWorkerControlled,
    redirectPending: Boolean(redirectInitiatedAt),
    redirectInitiatedAt,
    projectId: firebaseAuthMetadata.projectId,
    authDomain: firebaseAuthMetadata.authDomain,
    sdkAuthDomain: firebaseAuthMetadata.sdkAuthDomain,
    authDomainMatches:
      Boolean(firebaseAuthMetadata.authDomain) &&
      firebaseAuthMetadata.authDomain === firebaseAuthMetadata.sdkAuthDomain,
    oAuthClientId: firebaseAuthMetadata.oAuthClientId,
    hasOAuthClientIdInConfig: firebaseAuthMetadata.hasOAuthClientIdInConfig,
    webSdkConsumesOAuthClientIdDirectly: firebaseAuthMetadata.webSdkConsumesOAuthClientIdDirectly,
    providerId: firebaseAuthMetadata.providerId,
    currentUserUid: auth.currentUser?.uid ?? null,
    currentUserEmailVerified: auth.currentUser?.emailVerified ?? null,
    androidPackageName: 'app.lisiere.recits',
    expectedAndroidSha1: '5E:BA:36:38:A0:EF:7A:AF:0B:76:A4:E6:A6:30:4F:B7:7A:BB:B9:D9',
  };
}

export function formatAuthDiagnosticReport(): string {
  const env = getAuthEnvironmentSnapshot();
  const logs = getAuthDiagnosticLogs();
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment: env,
      logs,
    },
    null,
    2
  );
}
