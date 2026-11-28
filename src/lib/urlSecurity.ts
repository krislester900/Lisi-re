/**
 * Client-side URL & origin sanitization helpers to block javascript:/data:text/html/SVG XSS
 * and untrusted cross-origin postMessage events.
 */

const SAFE_DATA_IMAGE_RE =
  /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

const TRUSTED_APP_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
  /^capacitor:\/\/localhost$/i,
  /^https:\/\/[a-z0-9-]+\.run\.app$/i,
  /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i,
];

/**
 * Allows only safe http(s) URLs (and optional same-origin relative /api/ or /assets/ paths).
 * Rejects javascript:, vbscript:, data:, file:, etc.
 */
export function sanitizeHttpUrl(
  rawUrl: string | null | undefined,
  options: { allowRelativeApiOrAssets?: boolean } = {}
): string {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return '';

  if (
    options.allowRelativeApiOrAssets &&
    (trimmed.startsWith('/api/') || trimmed.startsWith('/assets/')) &&
    !trimmed.startsWith('//') &&
    !/[\r\n\0]/.test(trimmed)
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Allows safe http(s) image/media URLs, app-local /api/ or /assets/ paths,
 * and strictly raster data:image/(jpeg|png|webp|gif);base64,... URLs.
 * Explicitly rejects data:image/svg+xml and executable schemes.
 */
export function sanitizeMediaUrl(rawUrl: string | null | undefined): string {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:')) {
    return SAFE_DATA_IMAGE_RE.test(trimmed) ? trimmed : '';
  }

  return sanitizeHttpUrl(trimmed, { allowRelativeApiOrAssets: true });
}

/**
 * Verifies postMessage origins strictly against current window origin
 * or known Lisière runtime origins (no substring `.includes('localhost')`).
 */
export function isTrustedAppOrigin(origin: string): boolean {
  const clean = (origin ?? '').trim();
  if (!clean) return false;
  if (typeof window !== 'undefined' && clean === window.location.origin) {
    return true;
  }
  return TRUSTED_APP_ORIGIN_PATTERNS.some((pattern) => pattern.test(clean));
}
