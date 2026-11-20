import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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
  Chapter,
  CustomSalon,
  CustomSalonMessage,
  CustomSalonVisibility,
  Echo,
  EchoReplyType,
  Exchange,
  ExchangeMessage,
  ExchangeStatus,
  FIELD_LIMITS,
  ID_PATTERN,
  PublicProfile,
  ReleaseCadence,
  SalonMember,
  SalonMemberStatus,
  SalonMessage,
  SeriesStatus,
  Story,
  StoryBookmark,
  StoryFormat,
  StoryRepost,
  StoryResonanceEvent,
  StoryScope,
  StoryThemeId,
  StoryViewEvent,
  StoryVisibility,
  WallAccentTone,
  WallItem,
  WallItemKind,
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

export function buildDirectExchangeId(uidA: string, uidB: string): string {
  const pair = [uidA, uidB].sort();
  return `dm_${pair[0]}_${pair[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
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
        favoriteTrackTitle: '',
        favoriteTrackArtist: '',
        favoriteTrackUrl: '',
        favoriteNovel: '',
        interests: '',
        avatarUrl: clampString(user.photoURL || '', FIELD_LIMITS.avatarUrl.max),
        discoverable: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = publicSnap.data() as Partial<PublicProfile>;
      if (data.discoverable === undefined) {
        await updateDoc(publicRef, {
          discoverable: true,
          updatedAt: serverTimestamp(),
        });
      }
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

export function subscribeToDiscoverableProfiles(
  onData: (profiles: PublicProfile[]) => void
): () => void {
  const path = 'publicProfiles';
  const q = query(collection(db, 'publicProfiles'), where('discoverable', '==', true), limit(80));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as PublicProfile);
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
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

export interface ProfileUpdatePayload {
  displayName: string;
  bio: string;
  listeningNote: string;
  favoriteTrackTitle?: string;
  favoriteTrackArtist?: string;
  favoriteTrackUrl?: string;
  favoriteNovel?: string;
  interests?: string;
  avatarUrl?: string;
  discoverable?: boolean;
}

export async function updatePublicProfile(
  userId: string,
  payload: ProfileUpdatePayload
): Promise<void> {
  assertValidId(userId, 'userId');
  const displayName = clampString(payload.displayName, FIELD_LIMITS.displayName.max);
  if (displayName.length < FIELD_LIMITS.displayName.min) {
    throw new Error('Votre nom affiché doit contenir au moins 2 caractères.');
  }

  const updateFields: Record<string, unknown> = {
    displayName,
    bio: clampString(payload.bio, FIELD_LIMITS.bio.max),
    listeningNote: clampString(payload.listeningNote, FIELD_LIMITS.listeningNote.max),
    updatedAt: serverTimestamp(),
  };

  if (payload.favoriteTrackTitle !== undefined) {
    updateFields.favoriteTrackTitle = clampString(
      payload.favoriteTrackTitle,
      FIELD_LIMITS.favoriteTrackTitle.max
    );
  }
  if (payload.favoriteTrackArtist !== undefined) {
    updateFields.favoriteTrackArtist = clampString(
      payload.favoriteTrackArtist,
      FIELD_LIMITS.favoriteTrackArtist.max
    );
  }
  if (payload.favoriteTrackUrl !== undefined) {
    updateFields.favoriteTrackUrl = clampString(
      payload.favoriteTrackUrl,
      FIELD_LIMITS.favoriteTrackUrl.max
    );
  }
  if (payload.favoriteNovel !== undefined) {
    updateFields.favoriteNovel = clampString(payload.favoriteNovel, FIELD_LIMITS.favoriteNovel.max);
  }
  if (payload.interests !== undefined) {
    updateFields.interests = clampString(payload.interests, FIELD_LIMITS.interests.max);
  }
  if (payload.avatarUrl !== undefined) {
    updateFields.avatarUrl = clampString(payload.avatarUrl, FIELD_LIMITS.avatarUrl.max);
  }
  if (payload.discoverable !== undefined) {
    updateFields.discoverable = Boolean(payload.discoverable);
  }

  const path = `publicProfiles/${userId}`;
  try {
    await updateDoc(doc(db, 'publicProfiles', userId), updateFields);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Yope-style Profile Wall Items ---

export function subscribeToWallItems(
  userId: string,
  onData: (items: WallItem[]) => void
): () => void {
  const path = `publicProfiles/${userId}/wallItems`;
  const q = query(
    collection(db, 'publicProfiles', userId, 'wallItems'),
    where('visibility', '==', 'public'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as WallItem);
      list.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface CreateWallItemInput {
  kind: WallItemKind;
  title: string;
  subtitle: string;
  body: string;
  mediaUrl: string;
  accentTone: WallAccentTone;
}

export async function createWallItem(
  ownerId: string,
  ownerName: string,
  input: CreateWallItemInput
): Promise<string> {
  assertValidId(ownerId, 'ownerId');
  const title = clampString(input.title, FIELD_LIMITS.wallTitle.max);
  if (title.length < FIELD_LIMITS.wallTitle.min) {
    throw new Error('Ajoutez un titre à votre carte du mur.');
  }

  const cleanOwnerName = clampString(ownerName, FIELD_LIMITS.displayName.max);
  const itemId = generateSafeId('wall');
  const path = `publicProfiles/${ownerId}/wallItems/${itemId}`;

  try {
    await setDoc(doc(db, 'publicProfiles', ownerId, 'wallItems', itemId), {
      itemId,
      ownerId,
      ownerName: cleanOwnerName.length >= 2 ? cleanOwnerName : 'Auteur',
      visibility: 'public',
      kind: input.kind,
      title,
      subtitle: clampString(input.subtitle, FIELD_LIMITS.wallSubtitle.max),
      body: clampString(input.body, FIELD_LIMITS.wallBody.max),
      mediaUrl: clampString(input.mediaUrl, FIELD_LIMITS.wallMediaUrl.max),
      accentTone: input.accentTone,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return itemId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteWallItem(ownerId: string, itemId: string): Promise<void> {
  assertValidId(ownerId, 'ownerId');
  assertValidId(itemId, 'itemId');
  const path = `publicProfiles/${ownerId}/wallItems/${itemId}`;
  try {
    await deleteDoc(doc(db, 'publicProfiles', ownerId, 'wallItems', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Stories & Wattpad-style Serialized Novels ---

export function subscribeToPublicStories(onData: (stories: Story[]) => void): () => void {
  const path = 'stories';
  const q = query(collection(db, 'stories'), where('visibility', '==', 'public'), limit(80));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Story);
      list.sort((a, b) => toTimestampMs(b.updatedAt || b.createdAt) - toTimestampMs(a.updatedAt || a.createdAt));
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

export interface StoryCustomSalonTarget {
  salonId: string;
  name: string;
  visibility: CustomSalonVisibility;
}

export interface StoryInput {
  title: string;
  excerpt: string;
  content: string;
  theme: StoryThemeId;
  storyScope?: StoryScope;
  customSalon?: StoryCustomSalonTarget | null;
  storyFormat?: StoryFormat;
  releaseCadence?: ReleaseCadence;
  seriesStatus?: SeriesStatus;
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

  const storyFormat: StoryFormat = input.storyFormat ?? 'confession';
  const releaseCadence: ReleaseCadence =
    storyFormat === 'confession' ? 'unique' : (input.releaseCadence ?? 'hebdomadaire');
  const seriesStatus: SeriesStatus =
    storyFormat === 'confession' ? 'complet' : (input.seriesStatus ?? 'en-cours');

  const promptQuestion = clampString(input.promptQuestion, FIELD_LIMITS.promptQuestion.max);
  const readingMinutes = estimateReadingMinutes(content);
  const effectiveVisibility: StoryVisibility =
    input.customSalon?.visibility === 'private' ? 'private' : input.visibility;
  const storyScope: StoryScope = input.customSalon ? 'salon' : (input.storyScope ?? 'salon');

  return {
    authorName: cleanAuthorName,
    title,
    excerpt,
    content,
    theme: input.theme,
    storyScope,
    storyFormat,
    releaseCadence,
    seriesStatus,
    promptQuestion,
    visibility: effectiveVisibility,
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

  const docData: Record<string, unknown> = {
    storyId,
    authorId,
    ...fields,
    chapterCount: 1,
    resonanceCount: 0,
    echoCount: 0,
    viewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.customSalon) {
    assertValidId(input.customSalon.salonId, 'customSalonId');
    docData.customSalonId = input.customSalon.salonId;
    docData.customSalonName = clampString(input.customSalon.name, FIELD_LIMITS.salonName.max);
    docData.customSalonVisibility = input.customSalon.visibility;
  }

  try {
    await setDoc(doc(db, 'stories', storyId), docData);
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

export function subscribeToStoryChapters(
  storyId: string,
  storyVisibility: StoryVisibility,
  userId: string | null,
  authorId: string,
  onData: (chapters: Chapter[]) => void,
  customSalonVisibility?: CustomSalonVisibility
): () => void {
  const path = `stories/${storyId}/chapters`;
  const q =
    storyVisibility === 'public'
      ? query(
          collection(db, 'stories', storyId, 'chapters'),
          where('storyVisibility', '==', 'public'),
          limit(100)
        )
      : customSalonVisibility === 'private'
        ? query(collection(db, 'stories', storyId, 'chapters'), limit(100))
        : query(
            collection(db, 'stories', storyId, 'chapters'),
            where('authorId', '==', userId || authorId),
            limit(100)
          );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Chapter);
      list.sort((a, b) => a.chapterNumber - b.chapterNumber);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function addStoryChapter(params: {
  story: Story;
  authorId: string;
  chapterNumber: number;
  title: string;
  content: string;
  authorNote: string;
  nextSeriesStatus?: SeriesStatus;
}): Promise<string> {
  assertValidId(params.story.storyId, 'storyId');
  assertValidId(params.authorId, 'authorId');

  const title = clampString(params.title, FIELD_LIMITS.chapterTitle.max);
  if (title.length < FIELD_LIMITS.chapterTitle.min) {
    throw new Error('Le titre du chapitre doit contenir au moins 2 caractères.');
  }

  const content = clampString(params.content, FIELD_LIMITS.chapterContent.max);
  if (content.length < FIELD_LIMITS.chapterContent.min) {
    throw new Error('Le chapitre doit contenir au moins 20 caractères.');
  }

  const authorNote = clampString(params.authorNote, FIELD_LIMITS.chapterNote.max);
  const readingMinutes = estimateReadingMinutes(content);
  const chapterId = generateSafeId('chap');
  const chapterRef = doc(db, 'stories', params.story.storyId, 'chapters', chapterId);
  const storyRef = doc(db, 'stories', params.story.storyId);
  const path = `stories/${params.story.storyId}/chapters/${chapterId}`;

  const currentCount = params.story.chapterCount ?? 1;
  const nextSeriesStatus: SeriesStatus =
    params.nextSeriesStatus ?? params.story.seriesStatus ?? 'en-cours';

  try {
    const batch = writeBatch(db);
    batch.set(chapterRef, {
      chapterId,
      storyId: params.story.storyId,
      authorId: params.authorId,
      storyVisibility: params.story.visibility,
      chapterNumber: params.chapterNumber,
      title,
      content,
      authorNote,
      readingMinutes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(storyRef, {
      chapterCount: currentCount + 1,
      lastChapterId: chapterId,
      seriesStatus: nextSeriesStatus,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return chapterId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Resonances & Comments / Echoes ---

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

export function formatLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function toggleStoryResonance(
  storyId: string,
  userId: string,
  authorId: string
): Promise<boolean> {
  assertValidId(storyId, 'storyId');
  assertValidId(userId, 'userId');
  assertValidId(authorId, 'authorId');
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
        authorId,
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

export async function recordStoryView(
  storyId: string,
  authorId: string,
  viewerId: string
): Promise<void> {
  assertValidId(storyId, 'storyId');
  assertValidId(authorId, 'authorId');
  assertValidId(viewerId, 'viewerId');

  const viewId = generateSafeId('view');
  const dateKey = formatLocalDateKey();
  const viewRef = doc(db, 'stories', storyId, 'views', viewId);
  const storyRef = doc(db, 'stories', storyId);
  const path = `stories/${storyId}/views/${viewId}`;

  try {
    const batch = writeBatch(db);
    batch.set(viewRef, {
      viewId,
      storyId,
      authorId,
      viewerId,
      dateKey,
      createdAt: serverTimestamp(),
    });
    batch.update(storyRef, {
      viewCount: increment(1),
      lastViewId: viewId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAuthorReadingTimeline(
  authorId: string,
  stories: Story[]
): Promise<{ views: StoryViewEvent[]; resonances: StoryResonanceEvent[] }> {
  assertValidId(authorId, 'authorId');
  const publicStories = stories.filter((s) => s.visibility === 'public' && s.authorId === authorId);
  if (publicStories.length === 0) {
    return { views: [], resonances: [] };
  }

  const perStoryResults = await Promise.all(
    publicStories.map(async (story) => {
      try {
        const [viewsSnap, resonancesSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'stories', story.storyId, 'views'),
              where('authorId', '==', authorId),
              limit(250)
            )
          ),
          getDocs(
            query(
              collection(db, 'stories', story.storyId, 'resonances'),
              where('authorId', '==', authorId),
              limit(250)
            )
          ),
        ]);
        return {
          views: viewsSnap.docs.map((d) => d.data() as StoryViewEvent),
          resonances: resonancesSnap.docs.map((d) => d.data() as StoryResonanceEvent),
        };
      } catch (err) {
        console.warn(`Impossible de charger les statistiques pour ${story.storyId}:`, err);
        return { views: [] as StoryViewEvent[], resonances: [] as StoryResonanceEvent[] };
      }
    })
  );

  return {
    views: perStoryResults.flatMap((r) => r.views),
    resonances: perStoryResults.flatMap((r) => r.resonances),
  };
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
    throw new Error('Votre commentaire doit contenir au moins 2 caractères.');
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

// --- Salon Public Text-Only Chat ---

export function subscribeToSalonMessages(
  salonId: StoryThemeId,
  onData: (messages: SalonMessage[]) => void
): () => void {
  const path = `salons/${salonId}/messages`;
  const q = query(
    collection(db, 'salons', salonId, 'messages'),
    where('salonId', '==', salonId),
    limit(150)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as SalonMessage);
      list.sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function sendSalonMessage(params: {
  salonId: StoryThemeId;
  senderId: string;
  senderName: string;
  rawContent: string;
}): Promise<void> {
  assertValidId(params.salonId, 'salonId');
  assertValidId(params.senderId, 'senderId');

  const content = clampString(params.rawContent, FIELD_LIMITS.salonChatContent.max);
  if (content.length < FIELD_LIMITS.salonChatContent.min) {
    throw new Error('Écrivez un message avant d’envoyer.');
  }

  const cleanName = clampString(params.senderName, FIELD_LIMITS.displayName.max);
  const messageId = generateSafeId('smsg');
  const path = `salons/${params.salonId}/messages/${messageId}`;

  try {
    await setDoc(doc(db, 'salons', params.salonId, 'messages', messageId), {
      messageId,
      salonId: params.salonId,
      senderId: params.senderId,
      senderName: cleanName.length >= 2 ? cleanName : 'Auteur',
      content,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteSalonMessage(
  salonId: StoryThemeId,
  messageId: string
): Promise<void> {
  assertValidId(salonId, 'salonId');
  assertValidId(messageId, 'messageId');
  const path = `salons/${salonId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'salons', salonId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- 1-on-1 Private Exchanges (Story-Anchored OR Direct Member Chat) ---

export function subscribeToUserExchanges(
  userId: string,
  onData: (exchanges: Exchange[]) => void
): () => void {
  const path = 'exchanges';
  const q = query(
    collection(db, 'exchanges'),
    where('participantIds', 'array-contains', userId),
    limit(60)
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
      kind: 'story',
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

export async function createDirectExchangeWithFirstMessage(params: {
  initiatorId: string;
  initiatorName: string;
  recipientId: string;
  recipientName: string;
  firstMessage: string;
}): Promise<string> {
  assertValidId(params.initiatorId, 'initiatorId');
  assertValidId(params.recipientId, 'recipientId');
  if (params.initiatorId === params.recipientId) {
    throw new Error('Vous ne pouvez pas ouvrir une conversation privée avec vous-même.');
  }

  const content = clampString(params.firstMessage, FIELD_LIMITS.messageContent.max);
  if (content.length < FIELD_LIMITS.messageContent.min) {
    throw new Error('Écrivez un premier message pour commencer la discussion.');
  }

  const exchangeId = buildDirectExchangeId(params.initiatorId, params.recipientId);
  const exchangeRef = doc(db, 'exchanges', exchangeId);

  try {
    const existingSnap = await getDoc(exchangeRef);
    if (existingSnap.exists()) {
      const existingExchange = existingSnap.data() as Exchange;
      if (existingExchange.status !== 'active') {
        await updateExchangeStatus(exchangeId, 'active');
      }
      await sendExchangeMessage({
        exchange: { ...existingExchange, status: 'active' },
        senderId: params.initiatorId,
        senderName: params.initiatorName,
        rawContent: content,
      });
      return exchangeId;
    }

    const messageId = generateSafeId('msg');
    const participantIds = [params.initiatorId, params.recipientId];
    const initiatorName =
      clampString(params.initiatorName, FIELD_LIMITS.displayName.max) || 'Auteur';
    const recipientName =
      clampString(params.recipientName, FIELD_LIMITS.displayName.max) || 'Auteur';
    const lastMessagePreview = clampString(content, FIELD_LIMITS.lastMessagePreview.max);

    const messageRef = doc(db, 'exchanges', exchangeId, 'messages', messageId);
    const batch = writeBatch(db);
    batch.set(exchangeRef, {
      exchangeId,
      kind: 'direct',
      storyId: 'direct',
      storyTitle: 'Discussion privée',
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

// --- User-Created Community Salons & Admission Rules ---

export interface CustomSalonInput {
  name: string;
  description: string;
  promptQuestion: string;
  admissionRules: string;
  visibility: CustomSalonVisibility;
  accentTone: WallAccentTone;
}

export function subscribeToCustomSalons(onData: (salons: CustomSalon[]) => void): () => void {
  const path = 'customSalons';
  const q = query(
    collection(db, 'customSalons'),
    where('visibility', 'in', ['public', 'private']),
    limit(80)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as CustomSalon);
      list.sort(
        (a, b) =>
          toTimestampMs(b.updatedAt || b.createdAt) - toTimestampMs(a.updatedAt || a.createdAt)
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToSalonMemberRecord(
  salonId: string,
  userId: string,
  onData: (member: SalonMember | null) => void
): () => void {
  assertValidId(salonId, 'salonId');
  assertValidId(userId, 'userId');
  const path = `customSalons/${salonId}/members/${userId}`;
  return onSnapshot(
    doc(db, 'customSalons', salonId, 'members', userId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as SalonMember) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeToSalonMembersForOwner(
  salonId: string,
  ownerId: string,
  onData: (members: SalonMember[]) => void
): () => void {
  assertValidId(salonId, 'salonId');
  assertValidId(ownerId, 'ownerId');
  const path = `customSalons/${salonId}/members`;
  const q = query(
    collection(db, 'customSalons', salonId, 'members'),
    where('salonOwnerId', '==', ownerId),
    limit(120)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as SalonMember);
      list.sort((a, b) => toTimestampMs(b.updatedAt || b.createdAt) - toTimestampMs(a.updatedAt || a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

function buildValidatedSalonFields(input: CustomSalonInput, ownerName: string) {
  const cleanOwnerName = clampString(ownerName, FIELD_LIMITS.displayName.max);
  const name = clampString(input.name, FIELD_LIMITS.salonName.max);
  if (name.length < FIELD_LIMITS.salonName.min) {
    throw new Error('Le nom du salon doit contenir au moins 3 caractères.');
  }

  const description = clampString(input.description, FIELD_LIMITS.salonDescription.max);
  if (description.length < FIELD_LIMITS.salonDescription.min) {
    throw new Error('La présentation du salon doit contenir au moins 10 caractères.');
  }

  return {
    name,
    description,
    promptQuestion: clampString(input.promptQuestion, FIELD_LIMITS.salonPrompt.max),
    admissionRules: clampString(input.admissionRules, FIELD_LIMITS.salonAdmissionRules.max),
    visibility: input.visibility,
    ownerName: cleanOwnerName.length >= 2 ? cleanOwnerName : 'Auteur',
    accentTone: input.accentTone,
  };
}

export async function createCustomSalon(
  ownerId: string,
  ownerName: string,
  input: CustomSalonInput
): Promise<string> {
  assertValidId(ownerId, 'ownerId');
  const fields = buildValidatedSalonFields(input, ownerName);
  const salonId = generateSafeId('salon');
  const salonRef = doc(db, 'customSalons', salonId);
  const ownerMemberRef = doc(db, 'customSalons', salonId, 'members', ownerId);
  const path = `customSalons/${salonId}`;

  try {
    const batch = writeBatch(db);
    batch.set(salonRef, {
      salonId,
      ...fields,
      ownerId,
      memberCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(ownerMemberRef, {
      userId: ownerId,
      salonId,
      salonOwnerId: ownerId,
      userName: fields.ownerName,
      requestNote: '',
      status: 'approved',
      role: 'owner',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return salonId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCustomSalon(
  salonId: string,
  ownerName: string,
  input: CustomSalonInput
): Promise<void> {
  assertValidId(salonId, 'salonId');
  const fields = buildValidatedSalonFields(input, ownerName);
  const path = `customSalons/${salonId}`;

  try {
    await updateDoc(doc(db, 'customSalons', salonId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCustomSalon(salonId: string): Promise<void> {
  assertValidId(salonId, 'salonId');
  const path = `customSalons/${salonId}`;
  try {
    await deleteDoc(doc(db, 'customSalons', salonId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function joinOrRequestCustomSalon(params: {
  salon: CustomSalon;
  userId: string;
  userName: string;
  requestNote?: string;
}): Promise<SalonMemberStatus> {
  assertValidId(params.salon.salonId, 'salonId');
  assertValidId(params.userId, 'userId');
  const cleanUserName = clampString(params.userName, FIELD_LIMITS.displayName.max);
  const safeUserName = cleanUserName.length >= 2 ? cleanUserName : 'Auteur';
  const cleanNote = clampString(params.requestNote ?? '', FIELD_LIMITS.salonRequestNote.max);

  const salonRef = doc(db, 'customSalons', params.salon.salonId);
  const memberRef = doc(db, 'customSalons', params.salon.salonId, 'members', params.userId);
  const path = `customSalons/${params.salon.salonId}/members/${params.userId}`;

  try {
    const existingSnap = await getDoc(memberRef);

    if (params.salon.visibility === 'public') {
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as SalonMember;
        if (existingData.status === 'approved') {
          return 'approved';
        }
        await deleteDoc(memberRef);
      }

      const batch = writeBatch(db);
      batch.set(memberRef, {
        userId: params.userId,
        salonId: params.salon.salonId,
        salonOwnerId: params.salon.ownerId,
        userName: safeUserName,
        requestNote: cleanNote,
        status: 'approved',
        role: 'member',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(salonRef, {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return 'approved';
    }

    // Private salon admission request
    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as SalonMember;
      if (existingData.status === 'approved') {
        return 'approved';
      }
      await updateDoc(memberRef, {
        status: 'pending',
        requestNote: cleanNote,
        userName: safeUserName,
        updatedAt: serverTimestamp(),
      });
      return 'pending';
    }

    await setDoc(memberRef, {
      userId: params.userId,
      salonId: params.salon.salonId,
      salonOwnerId: params.salon.ownerId,
      userName: safeUserName,
      requestNote: cleanNote,
      status: 'pending',
      role: 'member',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'pending';
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function respondToSalonMemberRequest(params: {
  salonId: string;
  targetUserId: string;
  decision: 'approved' | 'rejected';
  previousStatus: SalonMemberStatus;
}): Promise<void> {
  assertValidId(params.salonId, 'salonId');
  assertValidId(params.targetUserId, 'targetUserId');
  const salonRef = doc(db, 'customSalons', params.salonId);
  const memberRef = doc(db, 'customSalons', params.salonId, 'members', params.targetUserId);
  const path = `customSalons/${params.salonId}/members/${params.targetUserId}`;

  try {
    if (params.decision === 'approved' && params.previousStatus !== 'approved') {
      const batch = writeBatch(db);
      batch.update(memberRef, {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });
      batch.update(salonRef, {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }

    if (params.decision === 'rejected' && params.previousStatus === 'approved') {
      const batch = writeBatch(db);
      batch.update(memberRef, {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
      batch.update(salonRef, {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }

    await updateDoc(memberRef, {
      status: params.decision,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function leaveOrRemoveSalonMember(params: {
  salonId: string;
  targetUserId: string;
  wasApproved: boolean;
}): Promise<void> {
  assertValidId(params.salonId, 'salonId');
  assertValidId(params.targetUserId, 'targetUserId');
  const salonRef = doc(db, 'customSalons', params.salonId);
  const memberRef = doc(db, 'customSalons', params.salonId, 'members', params.targetUserId);
  const path = `customSalons/${params.salonId}/members/${params.targetUserId}`;

  try {
    if (params.wasApproved) {
      const batch = writeBatch(db);
      batch.delete(memberRef);
      batch.update(salonRef, {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } else {
      await deleteDoc(memberRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToCustomSalonStories(
  salonId: string,
  salonVisibility: CustomSalonVisibility,
  onData: (stories: Story[]) => void
): () => void {
  assertValidId(salonId, 'salonId');
  const path = 'stories';
  const q =
    salonVisibility === 'private'
      ? query(
          collection(db, 'stories'),
          where('customSalonId', '==', salonId),
          where('customSalonVisibility', '==', 'private'),
          limit(80)
        )
      : query(
          collection(db, 'stories'),
          where('customSalonId', '==', salonId),
          where('visibility', '==', 'public'),
          limit(80)
        );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as Story);
      list.sort(
        (a, b) =>
          toTimestampMs(b.updatedAt || b.createdAt) - toTimestampMs(a.updatedAt || a.createdAt)
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToCustomSalonMessages(
  salonId: string,
  onData: (messages: CustomSalonMessage[]) => void
): () => void {
  assertValidId(salonId, 'salonId');
  const path = `customSalons/${salonId}/messages`;
  const q = query(
    collection(db, 'customSalons', salonId, 'messages'),
    where('salonId', '==', salonId),
    limit(150)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as CustomSalonMessage);
      list.sort((a, b) => toTimestampMs(a.createdAt) - toTimestampMs(b.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function sendCustomSalonMessage(params: {
  salonId: string;
  senderId: string;
  senderName: string;
  rawContent: string;
}): Promise<void> {
  assertValidId(params.salonId, 'salonId');
  assertValidId(params.senderId, 'senderId');

  const content = clampString(params.rawContent, FIELD_LIMITS.salonChatContent.max);
  if (content.length < FIELD_LIMITS.salonChatContent.min) {
    throw new Error('Écrivez un message avant d’envoyer.');
  }

  const cleanName = clampString(params.senderName, FIELD_LIMITS.displayName.max);
  const messageId = generateSafeId('csmsg');
  const path = `customSalons/${params.salonId}/messages/${messageId}`;

  try {
    await setDoc(doc(db, 'customSalons', params.salonId, 'messages', messageId), {
      messageId,
      salonId: params.salonId,
      senderId: params.senderId,
      senderName: cleanName.length >= 2 ? cleanName : 'Auteur',
      content,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCustomSalonMessage(
  salonId: string,
  messageId: string
): Promise<void> {
  assertValidId(salonId, 'salonId');
  assertValidId(messageId, 'messageId');
  const path = `customSalons/${salonId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'customSalons', salonId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Bookmarks ("À lire plus tard") & Reposts ("Repartages") ---

function buildStorySnapshotFields(story: Story): {
  storyTitle: string;
  storyExcerpt: string;
  storyAuthorId: string;
  storyAuthorName: string;
  storyTheme: StoryThemeId;
  readingMinutes: number;
  customSalonId?: string;
  customSalonName?: string;
  storyScope?: StoryScope;
  storyFormat?: StoryFormat;
} {
  assertValidId(story.storyId, 'storyId');
  assertValidId(story.authorId, 'storyAuthorId');
  const cleanTitle = clampString(story.title, FIELD_LIMITS.title.max) || 'Récit';
  const cleanExcerpt = clampString(story.excerpt, FIELD_LIMITS.excerpt.max);
  const rawAuthor = clampString(story.authorName, FIELD_LIMITS.displayName.max);
  const cleanAuthor = rawAuthor.length >= FIELD_LIMITS.displayName.min ? rawAuthor : 'Auteur';
  const readingMinutes = Math.min(60, Math.max(1, Math.round(story.readingMinutes || 1)));

  const snapshot: {
    storyTitle: string;
    storyExcerpt: string;
    storyAuthorId: string;
    storyAuthorName: string;
    storyTheme: StoryThemeId;
    readingMinutes: number;
    customSalonId?: string;
    customSalonName?: string;
    storyScope?: StoryScope;
    storyFormat?: StoryFormat;
  } = {
    storyTitle: cleanTitle,
    storyExcerpt: cleanExcerpt,
    storyAuthorId: story.authorId,
    storyAuthorName: cleanAuthor,
    storyTheme: story.theme,
    readingMinutes,
  };

  if (story.customSalonId && ID_PATTERN.test(story.customSalonId)) {
    snapshot.customSalonId = story.customSalonId.slice(0, 128);
  }
  if (story.customSalonName && story.customSalonName.trim()) {
    snapshot.customSalonName = clampString(story.customSalonName, FIELD_LIMITS.salonName.max);
  }
  if (story.storyScope === 'salon' || story.storyScope === 'pelemele') {
    snapshot.storyScope = story.storyScope;
  }
  if (story.storyFormat === 'confession' || story.storyFormat === 'roman') {
    snapshot.storyFormat = story.storyFormat;
  }
  return snapshot;
}

export function subscribeToUserBookmarks(
  userId: string,
  onData: (bookmarks: StoryBookmark[]) => void
): () => void {
  assertValidId(userId, 'userId');
  const path = `users/${userId}/bookmarks`;
  const q = query(
    collection(db, 'users', userId, 'bookmarks'),
    where('userId', '==', userId),
    limit(200)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as StoryBookmark);
      list.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function toggleStoryBookmark(userId: string, story: Story): Promise<boolean> {
  assertValidId(userId, 'userId');
  assertValidId(story.storyId, 'storyId');
  const path = `users/${userId}/bookmarks/${story.storyId}`;
  const bookmarkRef = doc(db, 'users', userId, 'bookmarks', story.storyId);

  try {
    const existing = await getDoc(bookmarkRef);
    if (existing.exists()) {
      await deleteDoc(bookmarkRef);
      return false;
    }
    const snapshotFields = buildStorySnapshotFields(story);
    await setDoc(bookmarkRef, {
      userId,
      storyId: story.storyId,
      ...snapshotFields,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeStoryBookmark(userId: string, storyId: string): Promise<void> {
  assertValidId(userId, 'userId');
  assertValidId(storyId, 'storyId');
  const path = `users/${userId}/bookmarks/${storyId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'bookmarks', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToProfileReposts(
  memberId: string,
  viewerUserId: string | null,
  onData: (reposts: StoryRepost[]) => void
): () => void {
  assertValidId(memberId, 'memberId');
  const path = `publicProfiles/${memberId}/reposts`;
  const isOwner = Boolean(viewerUserId && viewerUserId === memberId);
  const q = isOwner
    ? query(
        collection(db, 'publicProfiles', memberId, 'reposts'),
        where('reposterId', '==', memberId),
        limit(120)
      )
    : query(
        collection(db, 'publicProfiles', memberId, 'reposts'),
        where('visibility', '==', 'public'),
        limit(120)
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => d.data() as StoryRepost);
      list.sort(
        (a, b) =>
          toTimestampMs(b.updatedAt || b.createdAt) - toTimestampMs(a.updatedAt || a.createdAt)
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function upsertStoryRepost(params: {
  userId: string;
  reposterName: string;
  story: Story;
  note: string;
  visibility: StoryVisibility;
}): Promise<StoryVisibility> {
  assertValidId(params.userId, 'userId');
  assertValidId(params.story.storyId, 'storyId');
  const path = `publicProfiles/${params.userId}/reposts/${params.story.storyId}`;
  const repostRef = doc(db, 'publicProfiles', params.userId, 'reposts', params.story.storyId);

  const isSourceRestricted =
    params.story.visibility !== 'public' || params.story.customSalonVisibility === 'private';
  const effectiveVisibility: StoryVisibility = isSourceRestricted ? 'private' : params.visibility;

  const rawReposter = clampString(params.reposterName, FIELD_LIMITS.displayName.max);
  const cleanReposter = rawReposter.length >= FIELD_LIMITS.displayName.min ? rawReposter : 'Auteur';
  const cleanNote = clampString(params.note, FIELD_LIMITS.repostNote.max);

  try {
    const existing = await getDoc(repostRef);
    if (existing.exists()) {
      await updateDoc(repostRef, {
        reposterName: cleanReposter,
        note: cleanNote,
        visibility: effectiveVisibility,
        updatedAt: serverTimestamp(),
      });
    } else {
      const snapshotFields = buildStorySnapshotFields(params.story);
      await setDoc(repostRef, {
        repostId: params.story.storyId,
        reposterId: params.userId,
        reposterName: cleanReposter,
        storyId: params.story.storyId,
        ...snapshotFields,
        note: cleanNote,
        visibility: effectiveVisibility,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return effectiveVisibility;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateRepostVisibility(
  userId: string,
  storyId: string,
  nextVisibility: StoryVisibility
): Promise<StoryVisibility> {
  assertValidId(userId, 'userId');
  assertValidId(storyId, 'storyId');
  const path = `publicProfiles/${userId}/reposts/${storyId}`;

  try {
    if (nextVisibility === 'public') {
      const storySnap = await getDoc(doc(db, 'stories', storyId));
      if (!storySnap.exists()) {
        throw new Error('Ce récit d’origine n’existe plus.');
      }
      const storyData = storySnap.data() as Partial<Story>;
      if (storyData.visibility !== 'public' || storyData.customSalonVisibility === 'private') {
        throw new Error(
          'Ce récit est privé ou provient d’un salon privé : son repartage reste uniquement privé.'
        );
      }
    }

    await updateDoc(doc(db, 'publicProfiles', userId, 'reposts', storyId), {
      visibility: nextVisibility,
      updatedAt: serverTimestamp(),
    });
    return nextVisibility;
  } catch (error) {
    if (error instanceof Error && error.message.includes('salon privé')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncUserRepostsVisibility(
  userId: string,
  nextVisibility: StoryVisibility
): Promise<{ updated: number; keptPrivate: number }> {
  assertValidId(userId, 'userId');
  const path = `publicProfiles/${userId}/reposts`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'publicProfiles', userId, 'reposts'),
        where('reposterId', '==', userId),
        limit(120)
      )
    );
    const docsToProcess = snap.docs.filter((d) => {
      const data = d.data() as StoryRepost;
      return data.visibility !== nextVisibility;
    });

    if (docsToProcess.length === 0) {
      return { updated: 0, keptPrivate: 0 };
    }

    let keptPrivate = 0;
    const updatableIds: string[] = [];

    if (nextVisibility === 'private') {
      for (const d of docsToProcess) {
        updatableIds.push(d.id);
      }
    } else {
      const checks = await Promise.all(
        docsToProcess.map(async (d) => {
          const data = d.data() as StoryRepost;
          try {
            const storySnap = await getDoc(doc(db, 'stories', data.storyId));
            if (!storySnap.exists()) return { id: d.id, allowed: false };
            const s = storySnap.data() as Partial<Story>;
            const allowed = s.visibility === 'public' && s.customSalonVisibility !== 'private';
            return { id: d.id, allowed };
          } catch {
            return { id: d.id, allowed: false };
          }
        })
      );
      for (const item of checks) {
        if (item.allowed) updatableIds.push(item.id);
        else keptPrivate += 1;
      }
    }

    if (updatableIds.length > 0) {
      const batch = writeBatch(db);
      for (const id of updatableIds) {
        batch.update(doc(db, 'publicProfiles', userId, 'reposts', id), {
          visibility: nextVisibility,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return { updated: updatableIds.length, keptPrivate };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStoryRepost(userId: string, storyId: string): Promise<void> {
  assertValidId(userId, 'userId');
  assertValidId(storyId, 'storyId');
  const path = `publicProfiles/${userId}/reposts/${storyId}`;
  try {
    await deleteDoc(doc(db, 'publicProfiles', userId, 'reposts', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
