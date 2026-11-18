import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreErrors';
import { estimateReadingMinutes } from './themes';
import {
  Echo,
  EchoReplyType,
  Exchange,
  ExchangeMessage,
  ExchangeStatus,
  FIELD_LIMITS,
  ID_PATTERN,
  PublicProfile,
  Story,
  StoryThemeId,
  StoryVisibility,
} from '../types/story';

function clampString(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function generateSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const id = `${prefix}_${randomPart}`;
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function assertValidId(id: string, label: string): void {
  if (!id || id.length > 128 || !ID_PATTERN.test(id)) {
    throw new Error(`Identifiant invalide (${label}).`);
  }
}

function toTimestampMs(ts: Timestamp | null | undefined): number {
  if (!ts) return 0;
  return ts.toMillis();
}

export function buildExchangeId(storyId: string, uidA: string, uidB: string): string {
  const pair = [uidA, uidB].sort();
  return `ex_${storyId.slice(0, 32)}_${pair[0]}_${pair[1]}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
}

export async function ensureUserProfiles(user: User): Promise<void> {
  assertValidId(user.uid, 'userId');
  const publicPath = `publicProfiles/${user.uid}`;
  const publicRef = doc(db, 'publicProfiles', user.uid);

  try {
    const publicSnap = await getDoc(publicRef);
    if (!publicSnap.exists()) {
      const rawName = (user.displayName || user.email?.split('@')[0] || 'Auteur').trim();
      const displayName =
        rawName.length >= FIELD_LIMITS.displayName.min
          ? rawName.slice(0, FIELD_LIMITS.displayName.max)
          : 'Auteur';
      await setDoc(publicRef, {
        userId: user.uid,
        displayName,
        bio: '',
        listeningNote: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  const privatePath = `users/${user.uid}/private/info`;
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');
  try {
    const privateSnap = await getDoc(privateRef);
    if (!privateSnap.exists()) {
      const email = clampString(user.email || 'utilisateur@lisiere.app', 200);
      await setDoc(privateRef, {
        userId: user.uid,
        email: email.length >= 3 ? email : 'utilisateur@lisiere.app',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export function subscribeToPublicProfile(
  userId: string,
  onData: (profile: PublicProfile | null) => void
): () => void {
  const path = `publicProfiles/${userId}`;
  return onSnapshot(
    doc(db, 'publicProfiles', userId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PublicProfile) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  assertValidId(userId, 'userId');
  const path = `publicProfiles/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', userId));
    return snap.exists() ? (snap.data() as PublicProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function updatePublicProfile(
  userId: string,
  payload: { displayName: string; bio: string; listeningNote: string }
): Promise<void> {
  assertValidId(userId, 'userId');
  const displayName = clampString(payload.displayName, FIELD_LIMITS.displayName.max);
  if (displayName.length < FIELD_LIMITS.displayName.min) {
    throw new Error('Votre nom affiché doit contenir au moins 2 caractères.');
  }
  const bio = clampString(payload.bio, FIELD_LIMITS.bio.max);
  const listeningNote = clampString(payload.listeningNote, FIELD_LIMITS.listeningNote.max);

  const path = `publicProfiles/${userId}`;
  try {
    await updateDoc(doc(db, 'publicProfiles', userId), {
      displayName,
      bio,
      listeningNote,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeToPublicStories(
  onData: (stories: Story[]) => void
): () => void {
  const path = 'stories';
  const q = query(collection(db, 'stories'), where('visibility', '==', 'public'), limit(60));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Story);
      list.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToUserStories(
  authorId: string,
  onData: (stories: Story[]) => void
): () => void {
  const path = 'stories';
  const q = query(collection(db, 'stories'), where('authorId', '==', authorId), limit(60));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Story);
      list.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface StoryInput {
  title: string;
  excerpt: string;
  content: string;
  theme: StoryThemeId;
  promptQuestion: string;
  visibility: StoryVisibility;
}

function buildValidatedStoryFields(input: StoryInput, authorName: string) {
  const cleanAuthorName = clampString(authorName, FIELD_LIMITS.displayName.max);
  if (cleanAuthorName.length < FIELD_LIMITS.displayName.min) {
    throw new Error('Votre nom d’auteur doit contenir au moins 2 caractères.');
  }

  const title = clampString(input.title, FIELD_LIMITS.title.max);
  if (title.length < FIELD_LIMITS.title.min) {
    throw new Error('Le titre doit contenir au moins 3 caractères.');
  }

  const content = clampString(input.content, FIELD_LIMITS.content.max);
  if (content.length < FIELD_LIMITS.content.min) {
    throw new Error('Votre récit doit contenir au moins 20 caractères.');
  }

  let excerpt = clampString(input.excerpt, FIELD_LIMITS.excerpt.max);
  if (excerpt.length < FIELD_LIMITS.excerpt.min) {
    excerpt = clampString(content.replace(/\s+/g, ' '), 180);
    if (excerpt.length < FIELD_LIMITS.excerpt.min) {
      excerpt = `${excerpt}...`.slice(0, FIELD_LIMITS.excerpt.max);
    }
  }

  const promptQuestion = clampString(input.promptQuestion, FIELD_LIMITS.promptQuestion.max);
  const readingMinutes = estimateReadingMinutes(content);

  return {
    authorName: cleanAuthorName,
    title,
    excerpt,
    content,
    theme: input.theme,
    promptQuestion,
    visibility: input.visibility,
    readingMinutes,
  };
}

export async function createStory(
  authorId: string,
  authorName: string,
  input: StoryInput
): Promise<string> {
  assertValidId(authorId, 'authorId');
  const storyId = generateSafeId('story');
  const fields = buildValidatedStoryFields(input, authorName);
  const path = `stories/${storyId}`;

  try {
    await setDoc(doc(db, 'stories', storyId), {
      storyId,
      authorId,
      ...fields,
      resonanceCount: 0,
      echoCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return storyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStory(
  storyId: string,
  authorName: string,
  input: StoryInput
): Promise<void> {
  assertValidId(storyId, 'storyId');
  const fields = buildValidatedStoryFields(input, authorName);
  const path = `stories/${storyId}`;

  try {
    await updateDoc(doc(db, 'stories', storyId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  assertValidId(storyId, 'storyId');
  const path = `stories/${storyId}`;
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToUserResonance(
  storyId: string,
  userId: string,
  onData: (hasResonated: boolean) => void
): () => void {
  const path = `stories/${storyId}/resonances/${userId}`;
  return onSnapshot(
    doc(db, 'stories', storyId, 'resonances', userId),
    (snap) => {
      onData(snap.exists());
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function toggleStoryResonance(storyId: string, userId: string): Promise<boolean> {
  assertValidId(storyId, 'storyId');
  assertValidId(userId, 'userId');
  const resonanceRef = doc(db, 'stories', storyId, 'resonances', userId);
  const storyRef = doc(db, 'stories', storyId);
  const path = `stories/${storyId}/resonances/${userId}`;

  try {
    const snap = await getDoc(resonanceRef);
    const batch = writeBatch(db);
    if (snap.exists()) {
      batch.delete(resonanceRef);
      batch.update(storyRef, {
        resonanceCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(resonanceRef, {
        userId,
        storyId,
        createdAt: serverTimestamp(),
      });
      batch.update(storyRef, {
        resonanceCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToStoryEchoes(
  storyId: string,
  onData: (echoes: Echo[]) => void
): () => void {
  const path = `stories/${storyId}/echoes`;
  const q = query(
    collection(db, 'stories', storyId, 'echoes'),
    where('storyVisibility', '==', 'public'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Echo);
      list.sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addStoryEcho(
  storyId: string,
  authorId: string,
  authorName: string,
  replyType: EchoReplyType,
  rawContent: string
): Promise<void> {
  assertValidId(storyId, 'storyId');
  assertValidId(authorId, 'authorId');
  const cleanName = clampString(authorName, FIELD_LIMITS.displayName.max);
  const content = clampString(rawContent, FIELD_LIMITS.echoContent.max);
  if (content.length < FIELD_LIMITS.echoContent.min) {
    throw new Error('Votre écho doit contenir au moins 5 caractères.');
  }

  const echoId = generateSafeId('echo');
  const echoRef = doc(db, 'stories', storyId, 'echoes', echoId);
  const storyRef = doc(db, 'stories', storyId);
  const path = `stories/${storyId}/echoes/${echoId}`;

  try {
    const batch = writeBatch(db);
    batch.set(echoRef, {
      echoId,
      storyId,
      storyVisibility: 'public',
      authorId,
      authorName: cleanName.length >= 2 ? cleanName : 'Auteur',
      replyType,
      content,
      createdAt: serverTimestamp(),
    });
    batch.update(storyRef, {
      echoCount: increment(1),
      lastEchoId: echoId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToUserExchanges(
  userId: string,
  onData: (exchanges: Exchange[]) => void
): () => void {
  const path = 'exchanges';
  const q = query(
    collection(db, 'exchanges'),
    where('participantIds', 'array-contains', userId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Exchange);
      list.sort((a, b) => toTimestampMs(b.updatedAt) - toTimestampMs(a.updatedAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToExchangeMessages(
  exchangeId: string,
  userId: string,
  onData: (messages: ExchangeMessage[]) => void
): () => void {
  const path = `exchanges/${exchangeId}/messages`;
  const q = query(
    collection(db, 'exchanges', exchangeId, 'messages'),
    where('participantIds', 'array-contains', userId),
    limit(200)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as ExchangeMessage);
      list.sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createExchangeWithFirstMessage(params: {
  storyId: string;
  storyTitle: string;
  initiatorId: string;
  initiatorName: string;
  recipientId: string;
  recipientName: string;
  firstMessage: string;
}): Promise<string> {
  assertValidId(params.storyId, 'storyId');
  assertValidId(params.initiatorId, 'initiatorId');
  assertValidId(params.recipientId, 'recipientId');
  if (params.initiatorId === params.recipientId) {
    throw new Error('Vous ne pouvez pas ouvrir une passerelle avec vous-même.');
  }

  const content = clampString(params.firstMessage, FIELD_LIMITS.messageContent.max);
  if (content.length < FIELD_LIMITS.messageContent.min) {
    throw new Error('Écrivez quelques mots pour ouvrir cet échange.');
  }

  const exchangeId = buildExchangeId(params.storyId, params.initiatorId, params.recipientId);
  const messageId = generateSafeId('msg');
  const participantIds = [params.initiatorId, params.recipientId];
  const initiatorName = clampString(params.initiatorName, FIELD_LIMITS.displayName.max) || 'Auteur';
  const recipientName = clampString(params.recipientName, FIELD_LIMITS.displayName.max) || 'Auteur';
  const storyTitle = clampString(params.storyTitle, FIELD_LIMITS.title.max) || 'Récit partagé';
  const lastMessagePreview = clampString(content, FIELD_LIMITS.lastMessagePreview.max);

  const exchangeRef = doc(db, 'exchanges', exchangeId);
  const messageRef = doc(db, 'exchanges', exchangeId, 'messages', messageId);

  try {
    const batch = writeBatch(db);
    batch.set(exchangeRef, {
      exchangeId,
      storyId: params.storyId,
      storyTitle,
      initiatorId: params.initiatorId,
      initiatorName: initiatorName.length >= 2 ? initiatorName : 'Auteur',
      recipientId: params.recipientId,
      recipientName: recipientName.length >= 2 ? recipientName : 'Auteur',
      participantIds,
      status: 'active',
      lastMessagePreview,
      lastSenderId: params.initiatorId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(messageRef, {
      messageId,
      exchangeId,
      senderId: params.initiatorId,
      senderName: initiatorName.length >= 2 ? initiatorName : 'Auteur',
      participantIds,
      content,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return exchangeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `exchanges/${exchangeId}`);
  }
}

export async function sendExchangeMessage(params: {
  exchange: Exchange;
  senderId: string;
  senderName: string;
  rawContent: string;
}): Promise<void> {
  assertValidId(params.exchange.exchangeId, 'exchangeId');
  assertValidId(params.senderId, 'senderId');
  const content = clampString(params.rawContent, FIELD_LIMITS.messageContent.max);
  if (content.length < FIELD_LIMITS.messageContent.min) {
    throw new Error('Le message ne peut pas être vide.');
  }

  const messageId = generateSafeId('msg');
  const senderName = clampString(params.senderName, FIELD_LIMITS.displayName.max) || 'Auteur';
  const lastMessagePreview = clampString(content, FIELD_LIMITS.lastMessagePreview.max);

  const exchangeRef = doc(db, 'exchanges', params.exchange.exchangeId);
  const messageRef = doc(
    db,
    'exchanges',
    params.exchange.exchangeId,
    'messages',
    messageId
  );

  try {
    const batch = writeBatch(db);
    batch.set(messageRef, {
      messageId,
      exchangeId: params.exchange.exchangeId,
      senderId: params.senderId,
      senderName: senderName.length >= 2 ? senderName : 'Auteur',
      participantIds: params.exchange.participantIds,
      content,
      createdAt: serverTimestamp(),
    });
    batch.update(exchangeRef, {
      lastMessagePreview,
      lastSenderId: params.senderId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `exchanges/${params.exchange.exchangeId}/messages/${messageId}`
    );
  }
}

export async function updateExchangeStatus(
  exchangeId: string,
  status: ExchangeStatus
): Promise<void> {
  assertValidId(exchangeId, 'exchangeId');
  const path = `exchanges/${exchangeId}`;
  try {
    await updateDoc(doc(db, 'exchanges', exchangeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
