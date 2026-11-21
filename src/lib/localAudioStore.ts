import type { ReadingTrack } from './musicService';

const DB_NAME = 'lisiere_local_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';

interface StoredAudioRecord {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  addedAt: number;
  blob: Blob;
}

const AUDIO_EXT_REGEX = /\.(mp3|m4a|wav|ogg|aac|flac|opus|webm)$/i;

function isSupportedAudioFile(file: File): boolean {
  if (file.type && file.type.toLowerCase().startsWith('audio/')) {
    return true;
  }
  return AUDIO_EXT_REGEX.test(file.name || '');
}

function cleanTrackTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  return withoutExt ? withoutExt.slice(0, 120) : 'Audio personnel';
}

function openAudioDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Ouverture IndexedDB impossible'));
  });
}

function readAudioDurationMs(objectUrl: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(undefined);
      return;
    }
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const timer = window.setTimeout(() => {
      audio.src = '';
      resolve(undefined);
    }, 1800);

    const finish = (dur?: number) => {
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.src = '';
      resolve(dur);
    };

    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(Math.round(audio.duration * 1000));
      } else {
        finish(undefined);
      }
    };
    audio.onerror = () => finish(undefined);
    audio.src = objectUrl;
  });
}

function recordToTrack(record: StoredAudioRecord): ReadingTrack {
  const objectUrl = URL.createObjectURL(record.blob);
  return {
    id: record.id,
    title: record.title,
    artist: record.artist || 'Sur mon appareil',
    durationMs: record.durationMs,
    source: 'local',
    streamUrl: objectUrl,
    isPreview: false,
  };
}

export async function loadLocalAudioTracks(): Promise<ReadingTrack[]> {
  try {
    const db = await openAudioDatabase();
    return await new Promise<ReadingTrack[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredAudioRecord[]) || [];
        rows.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        resolve(rows.map(recordToTrack));
      };
      req.onerror = () => resolve([]);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function addLocalAudioFiles(fileList: FileList | File[]): Promise<{
  added: ReadingTrack[];
  skippedCount: number;
}> {
  const files = Array.from(fileList);
  const added: ReadingTrack[] = [];
  let skippedCount = 0;

  let db: IDBDatabase | null = null;
  try {
    db = await openAudioDatabase();
  } catch {
    db = null;
  }

  for (const file of files) {
    if (!isSupportedAudioFile(file)) {
      skippedCount += 1;
      continue;
    }

    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const objectUrl = URL.createObjectURL(file);
    const durationMs = await readAudioDurationMs(objectUrl);

    const record: StoredAudioRecord = {
      id,
      title: cleanTrackTitle(file.name),
      artist: 'Sur mon appareil',
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      sizeBytes: file.size,
      durationMs,
      addedAt: Date.now(),
      blob: file,
    };

    if (db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db!.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        // Keep session ObjectURL track even if IndexedDB storage quota is exceeded
      }
    }

    added.push({
      id: record.id,
      title: record.title,
      artist: record.artist,
      durationMs: record.durationMs,
      source: 'local',
      streamUrl: objectUrl,
      isPreview: false,
    });
  }

  if (db) {
    db.close();
  }

  return { added, skippedCount };
}

export async function removeLocalAudioTrack(track: ReadingTrack): Promise<void> {
  if (track.streamUrl && track.streamUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(track.streamUrl);
    } catch {
      // Ignore
    }
  }

  try {
    const db = await openAudioDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(track.id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

export function revokeLocalTrackUrls(tracks: ReadingTrack[]): void {
  for (const t of tracks) {
    if (t.source === 'local' && t.streamUrl?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(t.streamUrl);
      } catch {
        // Ignore
      }
    }
  }
}
