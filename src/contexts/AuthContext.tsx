import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  clearOAuthRedirectPending,
  getAuthEnvironmentSnapshot,
  logAuthDiagnostic,
  markOAuthRedirectPending,
} from '../lib/authDiagnostics';
import { auth, googleProvider } from '../lib/firebase';
import {
  ensureUserProfiles,
  subscribeToFavoriteAuthors,
  subscribeToPrivateInfo,
  subscribeToPublicProfile,
} from '../lib/storyService';
import { FavoriteAuthor, PrivateUserInfo, PublicProfile, StoryThemeId } from '../types/story';

interface AuthContextValue {
  user: User | null;
  profile: PublicProfile | null;
  privateInfo: PrivateUserInfo | null;
  privateInfoLoaded: boolean;
  viewerAge: number | null;
  favoriteThemes: StoryThemeId[];
  favoriteAuthors: FavoriteAuthor[];
  needsAgeOnboarding: boolean;
  dismissAgeOnboarding: () => void;
  authReady: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  logOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<PrivateUserInfo | null>(null);
  const [privateInfoLoaded, setPrivateInfoLoaded] = useState(false);
  const [favoriteAuthors, setFavoriteAuthors] = useState<FavoriteAuthor[]>([]);
  const [ageOnboardingDismissed, setAgeOnboardingDismissed] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const env = getAuthEnvironmentSnapshot();
    logAuthDiagnostic('init', 'info', 'Initialisation du flux Firebase Auth', {
      runtimeMode: env.runtimeMode,
      platform: env.platform,
      isStandalonePWA: env.isStandalonePWA,
      serviceWorkerControlled: env.serviceWorkerControlled,
      origin: env.origin,
    });
    logAuthDiagnostic(
      'config',
      env.authDomainMatches ? 'ok' : 'warn',
      env.hasOAuthClientIdInConfig
        ? 'oAuthClientId présent dans firebase-applet-config.json (utilisé sur Android natif ; ignoré par initializeApp côté Web SDK)'
        : 'oAuthClientId absent de firebase-applet-config.json',
      {
        authDomain: env.authDomain,
        sdkAuthDomain: env.sdkAuthDomain,
        authDomainMatches: env.authDomainMatches,
        hasOAuthClientIdInConfig: env.hasOAuthClientIdInConfig,
        webSdkConsumesOAuthClientIdDirectly: env.webSdkConsumesOAuthClientIdDirectly,
      }
    );

    if (!env.isNative) {
      void getRedirectResult(auth)
        .then((result) => {
          if (result?.user) {
            clearOAuthRedirectPending();
            logAuthDiagnostic(
              'redirect-check',
              'ok',
              'Retour de redirection OAuth réussi (getRedirectResult)',
              {
                uid: result.user.uid,
                providerId: result.providerId ?? 'google.com',
                emailVerified: result.user.emailVerified,
              }
            );
          } else if (env.redirectPending) {
            clearOAuthRedirectPending();
            logAuthDiagnostic(
              'redirect-check',
              'warn',
              'Une redirection OAuth était en attente mais getRedirectResult a renvoyé null (sessionStorage/tiers bloqué ou redirection annulée).',
              {
                runtimeMode: env.runtimeMode,
                isStandalonePWA: env.isStandalonePWA,
                redirectInitiatedAt: env.redirectInitiatedAt,
              }
            );
          } else {
            logAuthDiagnostic('redirect-check', 'info', 'Aucune redirection OAuth en attente au démarrage.', {
              runtimeMode: env.runtimeMode,
            });
          }
        })
        .catch((err) => {
          clearOAuthRedirectPending();
          const msg = err instanceof Error ? err.message : String(err);
          logAuthDiagnostic('redirect-check', 'error', `Échec getRedirectResult : ${msg}`, {
            runtimeMode: env.runtimeMode,
            isStandalonePWA: env.isStandalonePWA,
          });
        });
    }

    let unsubProfile: (() => void) | null = null;
    let unsubPrivate: (() => void) | null = null;
    let unsubFavoriteAuthors: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (unsubPrivate) {
        unsubPrivate();
        unsubPrivate = null;
      }
      if (unsubFavoriteAuthors) {
        unsubFavoriteAuthors();
        unsubFavoriteAuthors = null;
      }

      setUser(currentUser);
      setPrivateInfo(null);
      setPrivateInfoLoaded(false);
      setFavoriteAuthors([]);

      logAuthDiagnostic(
        'auth-state',
        currentUser ? 'ok' : 'info',
        currentUser ? 'Session Firebase active détectée' : 'Aucun utilisateur Firebase connecté',
        {
          uid: currentUser?.uid ?? null,
          emailVerified: currentUser?.emailVerified ?? null,
        }
      );

      if (currentUser) {
        try {
          const skipped = sessionStorage.getItem(`lisiere_age_skip_${currentUser.uid}`) === '1';
          setAgeOnboardingDismissed(skipped);
        } catch {
          setAgeOnboardingDismissed(false);
        }

        try {
          await ensureUserProfiles(currentUser);
          unsubProfile = subscribeToPublicProfile(currentUser.uid, (loadedProfile) => {
            setProfile(loadedProfile);
          });
          unsubPrivate = subscribeToPrivateInfo(currentUser.uid, (loadedPrivate) => {
            setPrivateInfo(loadedPrivate);
            setPrivateInfoLoaded(true);
          });
          unsubFavoriteAuthors = subscribeToFavoriteAuthors(currentUser.uid, setFavoriteAuthors);
        } catch (err) {
          console.error('Erreur initialisation profil:', err);
          setPrivateInfoLoaded(true);
        }
      } else {
        setProfile(null);
        setPrivateInfo(null);
        setPrivateInfoLoaded(true);
        setFavoriteAuthors([]);
        setAgeOnboardingDismissed(false);
      }

      setAuthReady(true);
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubPrivate) unsubPrivate();
      if (unsubFavoriteAuthors) unsubFavoriteAuthors();
    };
  }, []);

  const signInWithGoogleRedirect = async () => {
    setAuthError(null);
    const env = getAuthEnvironmentSnapshot();
    logAuthDiagnostic('signin-redirect', 'info', 'Démarrage de signInWithRedirect (OAuth Google)', {
      runtimeMode: env.runtimeMode,
      isStandalonePWA: env.isStandalonePWA,
      authDomain: env.authDomain,
    });
    try {
      markOAuthRedirectPending();
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      clearOAuthRedirectPending();
      const rawMessage = err instanceof Error ? err.message : String(err);
      logAuthDiagnostic('signin-error', 'error', `Échec signInWithRedirect : ${rawMessage}`, {
        runtimeMode: env.runtimeMode,
      });
      setAuthError(`Connexion par redirection impossible (${rawMessage}).`);
    }
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    const env = getAuthEnvironmentSnapshot();
    logAuthDiagnostic('signin-start', 'info', 'Tentative de connexion Google lancée', {
      runtimeMode: env.runtimeMode,
      isNative: env.isNative,
      isStandalonePWA: env.isStandalonePWA,
      isInIframe: env.isInIframe,
    });

    try {
      if (Capacitor.isNativePlatform()) {
        logAuthDiagnostic('signin-native', 'info', 'Appel natif FirebaseAuthentication.signInWithGoogle');
        let nativeResult;
        try {
          nativeResult = await FirebaseAuthentication.signInWithGoogle({
            useCredentialManager: true,
          });
        } catch (cmErr) {
          const cmMessage = cmErr instanceof Error ? cmErr.message : String(cmErr);
          const isCanceled =
            cmMessage.toLowerCase().includes('cancel') ||
            cmMessage.toLowerCase().includes('dismiss');
          if (isCanceled) {
            throw cmErr;
          }
          logAuthDiagnostic(
            'signin-native',
            'warn',
            `Credential Manager indisponible (${cmMessage}), repli sur GoogleSignInClient`
          );
          nativeResult = await FirebaseAuthentication.signInWithGoogle({
            useCredentialManager: false,
          });
        }

        const idToken = nativeResult.credential?.idToken;
        if (!idToken) {
          throw new Error('Aucun jeton Google (idToken) renvoyé par Android.');
        }
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        logAuthDiagnostic('signin-success', 'ok', 'Connexion Google native Android finalisée');
        return;
      }

      logAuthDiagnostic('signin-popup', 'info', 'Appel signInWithPopup(auth, googleProvider)', {
        authDomain: env.authDomain,
        isStandalonePWA: env.isStandalonePWA,
      });
      const result = await signInWithPopup(auth, googleProvider);
      logAuthDiagnostic('signin-success', 'ok', 'Connexion Google via popup réussie', {
        uid: result.user.uid,
        emailVerified: result.user.emailVerified,
      });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const lower = rawMessage.toLowerCase();

      if (
        !Capacitor.isNativePlatform() &&
        env.isStandalonePWA &&
        (lower.includes('popup-blocked') ||
          lower.includes('operation-not-supported-in-this-environment'))
      ) {
        logAuthDiagnostic(
          'signin-popup',
          'warn',
          `Popup bloquée en PWA installée (${rawMessage}), bascule vers signInWithRedirect`
        );
        await signInWithGoogleRedirect();
        return;
      }

      logAuthDiagnostic('signin-error', 'error', `Erreur connexion Google : ${rawMessage}`, {
        runtimeMode: env.runtimeMode,
        isStandalonePWA: env.isStandalonePWA,
      });

      let message = 'Impossible de finaliser la connexion Google pour le moment.';
      if (
        lower.includes('popup-closed-by-user') ||
        lower.includes('cancel') ||
        lower.includes('dismiss')
      ) {
        message = 'La fenêtre de connexion a été fermée avant la fin.';
      } else if (lower.includes('popup-blocked')) {
        message =
          'La fenêtre de connexion a été bloquée par le navigateur. Autorisez les popups ou utilisez la redirection OAuth dans le diagnostic.';
      } else if (lower.includes('unauthorized-domain')) {
        message =
          'Ce domaine n’est pas autorisé dans Firebase Authentication (Domaines autorisés).';
      } else if (
        Capacitor.isNativePlatform() &&
        (lower.includes('developer_error') ||
          lower.includes('10:') ||
          lower.includes('12500') ||
          lower.includes('default_web_client_id') ||
          lower.includes('no credentials available'))
      ) {
        message =
          'Connexion Google Android non configurée : ajoutez l’application app.lisiere.recits et son empreinte SHA-1 dans Firebase Console (ou utilisez la version PWA dans Chrome).';
      } else if (rawMessage) {
        message = `Connexion Google impossible (${rawMessage}).`;
      }
      setAuthError(message);
    }
  };

  const logOut = async () => {
    setAuthError(null);
    clearOAuthRedirectPending();
    logAuthDiagnostic('signout', 'info', 'Déconnexion utilisateur');
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch {
        // Ignore native signOut failure and still clear web session
      }
    }
    await signOut(auth);
  };

  const clearAuthError = () => setAuthError(null);

  const dismissAgeOnboarding = () => {
    setAgeOnboardingDismissed(true);
    if (user) {
      try {
        sessionStorage.setItem(`lisiere_age_skip_${user.uid}`, '1');
      } catch {
        // Ignore storage restrictions
      }
    }
  };

  const viewerAge =
    typeof privateInfo?.declaredAge === 'number' && Number.isFinite(privateInfo.declaredAge)
      ? privateInfo.declaredAge
      : null;

  const favoriteThemes = useMemo<StoryThemeId[]>(
    () => (Array.isArray(privateInfo?.favoriteThemes) ? privateInfo.favoriteThemes : []),
    [privateInfo?.favoriteThemes]
  );

  const needsAgeOnboarding = Boolean(
    user && privateInfoLoaded && viewerAge === null && !ageOnboardingDismissed
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        privateInfo,
        privateInfoLoaded,
        viewerAge,
        favoriteThemes,
        favoriteAuthors,
        needsAgeOnboarding,
        dismissAgeOnboarding,
        authReady,
        authError,
        signInWithGoogle,
        signInWithGoogleRedirect,
        logOut,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return ctx;
}
