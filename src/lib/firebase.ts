import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const firebaseAuthMetadata = {
  projectId: firebaseConfig.projectId || '',
  authDomain: firebaseConfig.authDomain || '',
  sdkAuthDomain: auth.config.authDomain || '',
  oAuthClientId: firebaseConfig.oAuthClientId || '',
  providerId: googleProvider.providerId,
  hasOAuthClientIdInConfig: Boolean(firebaseConfig.oAuthClientId?.trim()),
  // Le SDK Web Firebase (initializeApp / GoogleAuthProvider) ignore oAuthClientId dans firebaseConfig :
  // il s'appuie sur la configuration serveur de Firebase Auth (/__/auth/handler).
  // En revanche, sur APK Android natif, oAuthClientId est injecté comme default_web_client_id.
  webSdkConsumesOAuthClientIdDirectly: false,
} as const;

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Veuillez vérifier votre configuration Firebase : client hors ligne.');
    }
  }
}

void testConnection();
