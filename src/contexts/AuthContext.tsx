import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
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

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      if (Capacitor.isNativePlatform()) {
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
        return;
      }

      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const lower = rawMessage.toLowerCase();

      let message = 'Impossible de finaliser la connexion Google pour le moment.';
      if (
        lower.includes('popup-closed-by-user') ||
        lower.includes('cancel') ||
        lower.includes('dismiss')
      ) {
        message = 'La fenêtre de connexion a été fermée avant la fin.';
      } else if (lower.includes('popup-blocked')) {
        message =
          'La fenêtre de connexion a été bloquée par le navigateur. Autorisez les popups pour Lisière.';
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
