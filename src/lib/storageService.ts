/**
 * Client-side image compression for zero-config mobile & desktop photo uploads
 * plus music link parsing (Spotify, YouTube, SoundCloud, Deezer, direct audio).
 */

const MAX_WALL_DATA_URL_CHARS = 150000;
const MAX_AVATAR_DATA_URL_CHARS = 45000;

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const isImageMime = file.type.startsWith('image/');
  const isImageExt = /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name);
  if (!isImageMime && !isImageExt) {
    throw new Error('Sélectionnez une image depuis votre téléphone ou ordinateur (JPG, PNG, WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Cette image est trop lourde (maximum 15 Mo avant compression).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire cette photo.'));
      }
    };
    reader.onerror = () => reject(new Error('Impossible de lire cette photo.'));
    reader.readAsDataURL(file);
  });

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () =>
      reject(
        new Error(
          'Format d’image non pris en charge par ce navigateur (convertissez en JPG ou PNG si besoin).'
        )
      );
    el.src = dataUrl;
  });
}

export async function compressPhotoForWall(file: File): Promise<string> {
  const img = await loadImageFromFile(file);

  const maxSideList = [760, 620, 500];
  const qualities = [0.76, 0.62, 0.48];

  for (const maxSide of maxSideList) {
    const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Traitement d’image indisponible sur ce navigateur.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of qualities) {
      const compressed = canvas.toDataURL('image/jpeg', quality);
      if (compressed.length <= MAX_WALL_DATA_URL_CHARS) {
        return compressed;
      }
    }
  }

  throw new Error(
    'Cette photo reste trop dense après compression. Essayez une autre photo ou collez son lien.'
  );
}

export async function compressAvatarForProfile(file: File): Promise<string> {
  const img = await loadImageFromFile(file);
  const srcWidth = img.width || 1;
  const srcHeight = img.height || 1;
  const cropSide = Math.min(srcWidth, srcHeight);
  const offsetX = Math.max(0, Math.round((srcWidth - cropSide) / 2));
  const offsetY = Math.max(0, Math.round((srcHeight - cropSide) / 2));

  const targetSizes = [320, 256, 200];
  const qualities = [0.8, 0.68, 0.54];

  for (const size of targetSizes) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Traitement d’image indisponible sur ce navigateur.');
    }
    ctx.drawImage(img, offsetX, offsetY, cropSide, cropSide, 0, 0, size, size);

    for (const quality of qualities) {
      const compressed = canvas.toDataURL('image/jpeg', quality);
      if (compressed.length <= MAX_AVATAR_DATA_URL_CHARS) {
        return compressed;
      }
    }
  }

  throw new Error(
    'Cette photo de profil reste trop lourde après compression. Essayez une autre image.'
  );
}

export interface ParsedMusicSource {
  type: 'audio' | 'youtube' | 'soundcloud' | 'spotify' | 'deezer' | 'link' | 'none';
  trackId?: string;
  embedUrl?: string;
  originalUrl?: string;
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|open\.spotify\.com|youtu\.be|youtube\.com|music\.youtube\.com|soundcloud\.com|deezer\.com)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function parseMusicSource(rawUrl: string): ParsedMusicSource {
  const url = normalizeUrl(rawUrl);
  if (!url) return { type: 'none' };

  const lower = url.toLowerCase();
  const audiusProxyMatch = url.match(/\/api\/music\/audius\/stream\/([a-zA-Z0-9_-]+)/i);
  if (audiusProxyMatch) {
    return {
      type: 'audio',
      originalUrl: `/api/music/audius/stream/${encodeURIComponent(audiusProxyMatch[1])}`,
    };
  }

  const audiusDirectMatch = url.match(/\/v1\/tracks\/([^/?#]+)\/stream/i);
  if (audiusDirectMatch) {
    return {
      type: 'audio',
      originalUrl: `/api/music/audius/stream/${encodeURIComponent(audiusDirectMatch[1])}`,
    };
  }

  const deezerProxyMatch = url.match(/\/api\/music\/deezer\/stream\/([0-9]+)/i);
  if (deezerProxyMatch) {
    return {
      type: 'audio',
      originalUrl: `/api/music/deezer/stream/${deezerProxyMatch[1]}`,
    };
  }

  if (
    /\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(lower) ||
    /dzcdn\.net\//i.test(lower)
  ) {
    return { type: 'audio', originalUrl: url };
  }

  // YouTube (watch, youtu.be, music.youtube, shorts, embed, live)
  const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  const ytLong = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  const ytPath = url.match(/youtube\.com\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{6,})/);
  const ytId = ytShort?.[1] || ytLong?.[1] || ytPath?.[1];
  if (ytId) {
    return {
      type: 'youtube',
      trackId: ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&playsinline=1`,
      originalUrl: url,
    };
  }

  // SoundCloud
  if (lower.includes('soundcloud.com/')) {
    return {
      type: 'soundcloud',
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        url
      )}&auto_play=true&visual=false&show_artwork=false`,
      originalUrl: url,
    };
  }

  // Spotify
  const spotifyMatch = url.match(
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/
  );
  if (spotifyMatch) {
    return {
      type: 'spotify',
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}?utm_source=generator&theme=0`,
      originalUrl: url,
    };
  }

  // Deezer
  const deezerMatch = url.match(/deezer\.com\/(?:[a-z]+\/)?(track|album|playlist)\/([0-9]+)/);
  if (deezerMatch) {
    return {
      type: 'deezer',
      embedUrl: `https://widget.deezer.com/widget/light/${deezerMatch[1]}/${deezerMatch[2]}`,
      originalUrl: url,
    };
  }

  return { type: 'link', originalUrl: url };
}
