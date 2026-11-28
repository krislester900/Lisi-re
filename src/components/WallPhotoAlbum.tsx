import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Columns2,
  Edit3,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  LayoutList,
  Maximize2,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { formatFrenchDate } from '../lib/themes';
import { sanitizeMediaUrl } from '../lib/urlSecurity';
import {
  FIELD_LIMITS,
  WallItem,
  WallPhotoLayout,
  WallPhotoPlacement,
} from '../types/story';

interface WallPhotoAlbumProps {
  memberName: string;
  photos: WallItem[];
  photoLayout: WallPhotoLayout;
  albumTitle?: string;
  albumNote?: string;
  isOwner: boolean;
  deletingItemId: string | null;
  failedImages: Record<string, boolean>;
  onImageError: (itemId: string) => void;
  onAddPhoto: () => void;
  onOpenLightbox: (photo: WallItem) => void;
  onDeletePhoto: (itemId: string) => void;
  onChangeLayout: (layout: WallPhotoLayout) => Promise<void>;
  onSaveAlbumHeader: (title: string, note: string) => Promise<void>;
  onReorderPhotos: (nextPhotos: WallItem[]) => Promise<void>;
  onSetPhotoPlacement: (itemId: string, placement: WallPhotoPlacement) => Promise<void>;
}

const LAYOUT_ORDER: WallPhotoLayout[] = ['album', 'cote', 'bento', 'galerie'];

const LAYOUT_ICONS: Record<WallPhotoLayout, React.ComponentType<{ className?: string }>> = {
  album: LayoutList,
  cote: Columns2,
  bento: LayoutGrid,
  galerie: Grid3x3,
};

const PLACEMENT_ICONS: Array<{
  id: WallPhotoPlacement;
  ariaLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'auto', ariaLabel: 'Format libre', icon: Square },
  { id: 'top', ariaLabel: 'Grand format', icon: RectangleHorizontal },
  { id: 'side', ariaLabel: 'Format portrait', icon: RectangleVertical },
];

export function WallPhotoAlbum({
  memberName,
  photos,
  photoLayout,
  albumTitle,
  albumNote,
  isOwner,
  deletingItemId,
  failedImages,
  onImageError,
  onAddPhoto,
  onOpenLightbox,
  onDeletePhoto,
  onChangeLayout,
  onSaveAlbumHeader,
  onReorderPhotos,
  onSetPhotoPlacement,
}: WallPhotoAlbumProps) {
  const [organizing, setOrganizing] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [draftTitle, setDraftTitle] = useState(albumTitle ?? '');
  const [draftNote, setDraftNote] = useState(albumNote ?? '');
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!editingHeader) {
      setDraftTitle(albumTitle ?? '');
      setDraftNote(albumNote ?? '');
    }
  }, [albumTitle, albumNote, editingHeader]);

  useEffect(() => {
    setOrganizing(false);
    setEditingHeader(false);
    setFlippedIds({});
  }, [memberName]);

  const effectiveTitle = albumTitle?.trim() || `Album photo de ${memberName}`;
  const effectiveNote =
    albumNote?.trim() ||
    (photos.length > 0
      ? 'Instants choisis, lumières et souvenirs visuels partagés sur ce mur.'
      : isOwner
        ? 'Composez un accueil visuel chaleureux pour les visiteurs de votre mur.'
        : `L’album photo de ${memberName} attend ses premiers clichés.`);

  const CurrentLayoutIcon = LAYOUT_ICONS[photoLayout] ?? LayoutList;

  const handleCycleLayout = async () => {
    if (!isOwner || savingLayout) return;
    const currentIndex = LAYOUT_ORDER.indexOf(photoLayout);
    const nextLayout = LAYOUT_ORDER[(currentIndex + 1) % LAYOUT_ORDER.length];
    setSavingLayout(true);
    try {
      await onChangeLayout(nextLayout);
    } finally {
      setSavingLayout(false);
    }
  };

  const handleHeaderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || savingHeader) return;
    setSavingHeader(true);
    try {
      await onSaveAlbumHeader(draftTitle.trim(), draftNote.trim());
      setEditingHeader(false);
    } finally {
      setSavingHeader(false);
    }
  };

  const handleMovePhoto = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (!isOwner || reordering || targetIdx < 0 || targetIdx >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    setReordering(true);
    try {
      await onReorderPhotos(next);
    } finally {
      setReordering(false);
    }
  };

  const handlePlacementChange = async (itemId: string, placement: WallPhotoPlacement) => {
    if (!isOwner || reordering) return;
    setReordering(true);
    try {
      await onSetPhotoPlacement(itemId, placement);
    } finally {
      setReordering(false);
    }
  };

  const toggleFlipPhoto = (itemId: string) => {
    setFlippedIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const renderOrganizeToolbar = (photo: WallItem, index: number) => {
    if (!isOwner || !organizing) return null;
    const currentPlacement: WallPhotoPlacement = photo.photoPlacement ?? 'auto';

    return (
      <div className="mt-2 pt-2 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-700">
        <div className="flex items-center gap-1">
          <span className="font-mono tabular-nums text-stone-500 mr-1">
            #{index + 1}
          </span>
          <button
            type="button"
            disabled={index === 0 || reordering}
            onClick={(e) => {
              e.stopPropagation();
              void handleMovePhoto(index, -1);
            }}
            aria-label={`Reculer ${photo.title}`}
            className="min-h-[28px] min-w-[28px] px-1.5 rounded border border-stone-200 bg-white hover:border-stone-400 disabled:opacity-35 inline-flex items-center justify-center"
          >
            <ArrowLeft className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={index === photos.length - 1 || reordering}
            onClick={(e) => {
              e.stopPropagation();
              void handleMovePhoto(index, 1);
            }}
            aria-label={`Avancer ${photo.title}`}
            className="min-h-[28px] min-w-[28px] px-1.5 rounded border border-stone-200 bg-white hover:border-stone-400 disabled:opacity-35 inline-flex items-center justify-center"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Proportion du tirage">
          {PLACEMENT_ICONS.map((opt) => {
            const Icon = opt.icon;
            const active = currentPlacement === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={reordering}
                aria-pressed={active}
                aria-label={opt.ariaLabel}
                title={opt.ariaLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  void handlePlacementChange(photo.itemId, opt.id);
                }}
                className={`min-h-[28px] min-w-[28px] px-1.5 rounded inline-flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-[#1B365D] text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPhotoCard = (
    photo: WallItem,
    index: number,
    options?: {
      aspectClass?: string;
      wrapperClass?: string;
      featured?: boolean;
      variant?: 'mat' | 'bento';
    }
  ) => {
    const imgFailed = Boolean(failedImages[photo.itemId]);
    const aspectClass = options?.aspectClass ?? 'aspect-[4/3]';
    const wrapperClass = options?.wrapperClass ?? '';
    const variant = options?.variant ?? 'mat';
    const dateStr = formatFrenchDate(photo.createdAt?.toDate() ?? null);
    const isFlipped = Boolean(flippedIds[photo.itemId]);

    if (variant === 'bento') {
      return (
        <article
          key={photo.itemId}
          className={`lisiere-flip-scene flex flex-col ${wrapperClass}`}
        >
          <div
            className={`lisiere-flip-card relative flex-1 w-full h-full ${
              isFlipped ? 'is-flipped' : ''
            }`}
          >
            {/* Front Face */}
            <div
              aria-hidden={isFlipped}
              className={`lisiere-flip-face relative w-full h-full rounded-2xl overflow-hidden bg-stone-900 border border-white/15 shadow-[6px_6px_0px_rgba(8,7,6,0.85)] flex flex-col group ${
                isFlipped ? 'pointer-events-none' : 'pointer-events-auto'
              }`}
            >
              {!imgFailed && sanitizeMediaUrl(photo.mediaUrl) ? (
                <button
                  type="button"
                  onClick={() => toggleFlipPhoto(photo.itemId)}
                  aria-label={`Retourner ${photo.title}`}
                  className="relative flex-1 w-full h-full overflow-hidden focus-visible:outline-2 focus-visible:outline-white text-left cursor-pointer"
                >
                  <img
                    src={sanitizeMediaUrl(photo.mediaUrl)}
                    alt={photo.title}
                    referrerPolicy="no-referrer"
                    onError={() => onImageError(photo.itemId)}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 pt-10 text-white">
                    <p
                      className={`font-display font-medium leading-snug ${
                        options?.featured ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
                      }`}
                    >
                      {photo.title}
                    </p>
                    {(photo.subtitle || photo.body) && (
                      <p className="text-xs text-stone-200/90 line-clamp-1 mt-0.5">
                        {photo.subtitle || photo.body}
                      </p>
                    )}
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleFlipPhoto(photo.itemId)}
                  className="flex-1 w-full h-full bg-stone-800 flex flex-col items-center justify-center p-5 text-center text-stone-300 cursor-pointer"
                >
                  <ImageIcon className="w-7 h-7 mb-2" />
                  <span className="text-xs">{photo.title}</span>
                </button>
              )}

              <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLightbox(photo);
                  }}
                  aria-label={`Agrandir ${photo.title}`}
                  className="w-8 h-8 rounded-full bg-stone-950/75 text-white hover:bg-stone-900 flex items-center justify-center"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                {isOwner && !organizing && (
                  <button
                    type="button"
                    disabled={deletingItemId === photo.itemId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePhoto(photo.itemId);
                    }}
                    aria-label={`Supprimer ${photo.title}`}
                    className="w-8 h-8 rounded-full bg-stone-950/75 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isOwner && organizing && (
                <div className="bg-[#FAF9F6] px-3 pb-2.5 text-stone-900">
                  {renderOrganizeToolbar(photo, index)}
                </div>
              )}
            </div>

            {/* Back Face (Revealed when turned) */}
            <div
              aria-hidden={!isFlipped}
              onClick={() => toggleFlipPhoto(photo.itemId)}
              className={`lisiere-flip-face lisiere-flip-face-back absolute inset-0 rounded-2xl bg-[#F5F1E8] text-stone-900 border border-stone-200 p-4 sm:p-5 shadow-[6px_6px_0px_rgba(8,7,6,0.85)] flex flex-col justify-between overflow-y-auto cursor-pointer ${
                isFlipped ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500">
                  <span className="truncate">
                    {photo.subtitle}
                    {photo.subtitle && dateStr ? ' · ' : ''}
                    {dateStr || (!photo.subtitle ? 'Souvenir' : '')}
                  </span>
                  <RotateCcw className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                </div>
                <h4 className="font-display text-lg sm:text-xl font-medium text-stone-900 leading-snug">
                  {photo.title}
                </h4>
                <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                  {photo.body?.trim() ||
                    `Photographie partagée dans l’album de ${memberName}.`}
                </p>
              </div>

              <div className="pt-3 border-t border-stone-300/70 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLightbox(photo);
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded bg-[#1B365D] text-white hover:bg-[#132744] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Agrandir</span>
                </button>

                {isOwner && (
                  <button
                    type="button"
                    disabled={deletingItemId === photo.itemId}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePhoto(photo.itemId);
                    }}
                    aria-label={`Supprimer ${photo.title}`}
                    className="min-h-[32px] px-2 py-1 rounded text-xs text-stone-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        key={photo.itemId}
        className={`lisiere-flip-scene ${wrapperClass}`}
      >
        <div
          className={`lisiere-flip-card w-full ${
            wrapperClass.includes('h-full') ? 'h-full' : ''
          } ${isFlipped ? 'is-flipped' : ''}`}
        >
          {/* Front Face */}
          <div
            aria-hidden={isFlipped}
            className={`lisiere-flip-face group relative bg-[#FAF9F6] p-2 sm:p-2.5 rounded-lg shadow-[7px_7px_0px_rgba(8,7,6,0.9)] text-stone-900 flex flex-col ${
              wrapperClass.includes('h-full') ? 'h-full' : ''
            } ${isFlipped ? 'pointer-events-none' : 'pointer-events-auto'}`}
          >
            <div className="relative">
              {!imgFailed && sanitizeMediaUrl(photo.mediaUrl) ? (
                <button
                  type="button"
                  onClick={() => toggleFlipPhoto(photo.itemId)}
                  aria-label={`Retourner ${photo.title}`}
                  className={`block w-full ${aspectClass} rounded overflow-hidden bg-stone-200 focus-visible:outline-2 focus-visible:outline-[#1B365D] cursor-pointer`}
                >
                  <img
                    src={sanitizeMediaUrl(photo.mediaUrl)}
                    alt={photo.title}
                    referrerPolicy="no-referrer"
                    onError={() => onImageError(photo.itemId)}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleFlipPhoto(photo.itemId)}
                  className={`w-full ${aspectClass} rounded bg-stone-800 flex flex-col items-center justify-center p-5 text-center text-stone-300 cursor-pointer`}
                >
                  <ImageIcon className="w-7 h-7 mb-2" />
                  <span className="text-xs">{photo.title}</span>
                </button>
              )}

              {!imgFailed && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLightbox(photo);
                  }}
                  aria-label={`Agrandir ${photo.title}`}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-stone-950/70 text-white hover:bg-stone-900 flex items-center justify-center opacity-85 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="pt-2.5 px-1 pb-0.5 flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleFlipPhoto(photo.itemId)}
                className="min-w-0 text-left flex-1 cursor-pointer"
              >
                <p
                  className={`font-display font-medium text-stone-900 leading-snug ${
                    options?.featured ? 'text-base sm:text-lg' : 'text-sm'
                  }`}
                >
                  {photo.title}
                </p>
                {(photo.subtitle || dateStr) && (
                  <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                    {photo.subtitle}
                    {photo.subtitle && dateStr ? ' · ' : ''}
                    {dateStr}
                  </p>
                )}
                {photo.body && (
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed line-clamp-2">
                    {photo.body}
                  </p>
                )}
              </button>

              {isOwner && (
                <button
                  type="button"
                  disabled={deletingItemId === photo.itemId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePhoto(photo.itemId);
                  }}
                  aria-label={`Supprimer ${photo.title}`}
                  className="text-stone-400 hover:text-red-700 disabled:opacity-50 p-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {renderOrganizeToolbar(photo, index)}
          </div>

          {/* Back Face (Revealed when photo is clicked / turned) */}
          <div
            aria-hidden={!isFlipped}
            onClick={() => toggleFlipPhoto(photo.itemId)}
            className={`lisiere-flip-face lisiere-flip-face-back absolute inset-0 bg-[#F5F1E8] p-4 sm:p-5 rounded-lg shadow-[7px_7px_0px_rgba(8,7,6,0.9)] border border-stone-200 text-stone-900 flex flex-col justify-between overflow-y-auto cursor-pointer ${
              isFlipped ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500">
                <span className="truncate">
                  {photo.subtitle}
                  {photo.subtitle && dateStr ? ' · ' : ''}
                  {dateStr || (!photo.subtitle ? 'Verso du tirage' : '')}
                </span>
                <RotateCcw className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              </div>

              <h4
                className={`font-display font-medium text-stone-900 leading-snug ${
                  options?.featured ? 'text-xl sm:text-2xl' : 'text-lg'
                }`}
              >
                {photo.title}
              </h4>

              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line">
                {photo.body?.trim() ||
                  `Instantané conservé dans l’album de ${memberName}.`}
              </p>
            </div>

            <div className="pt-3 border-t border-stone-300/70 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLightbox(photo);
                }}
                className="min-h-[34px] px-3 py-1 rounded-md bg-[#1B365D] text-white hover:bg-[#132744] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Agrandir</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFlipPhoto(photo.itemId);
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-md border border-stone-300 bg-white text-stone-700 hover:text-stone-900 text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Photo</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderGalleryContent = () => {
    if (photos.length === 0) {
      if (isOwner) {
        return (
          <button
            type="button"
            onClick={onAddPhoto}
            className="w-full rounded-xl border border-dashed border-white/25 bg-white/[0.04] hover:bg-white/[0.08] transition-[background-color,transform] duration-150 active:scale-[0.99] py-12 px-6 flex flex-col items-center justify-center text-center space-y-2.5"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white">
              <Camera className="w-5 h-5" />
            </div>
            <span className="font-display text-xl text-white">
              Ouvrir votre album photo
            </span>
            <span className="text-xs text-stone-300 max-w-md leading-relaxed">
              Ajoutez vos photos depuis votre téléphone ou ordinateur pour composer cet album.
            </span>
          </button>
        );
      }

      return (
        <div className="rounded-xl border border-white/15 bg-white/[0.04] p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-display text-xl text-white">
              {memberName} prépare ses premiers clichés
            </p>
            <p className="text-xs text-stone-300">
              Les photos de cet album s’afficheront ici dès leur publication.
            </p>
          </div>
          <ImageIcon className="w-7 h-7 text-stone-400 shrink-0" />
        </div>
      );
    }

    const indexMap = new Map<string, number>();
    photos.forEach((p, idx) => indexMap.set(p.itemId, idx));
    const idxOf = (photo: WallItem) => indexMap.get(photo.itemId) ?? 0;

    // 1. ALBUM LAYOUT: Featured lead photo + gallery below
    if (photoLayout === 'album') {
      const topPhoto = photos.find((p) => p.photoPlacement === 'top') ?? photos[0];
      const remaining = photos.filter((p) => p.itemId !== topPhoto.itemId);
      const sideFeatured = remaining.filter((p) => p.photoPlacement === 'side');
      const standardRest = remaining.filter((p) => p.photoPlacement !== 'side');
      const orderedRest = [...sideFeatured, ...standardRest];

      return (
        <div className="space-y-5">
          {renderPhotoCard(topPhoto, idxOf(topPhoto), {
            aspectClass: 'aspect-[4/3] sm:aspect-[16/9] max-h-[430px]',
            featured: true,
          })}

          {orderedRest.length > 0 && (
            <div
              className={`grid gap-4 items-start ${
                orderedRest.length === 1
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : orderedRest.length === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {orderedRest.map((photo) =>
                renderPhotoCard(photo, idxOf(photo), {
                  aspectClass:
                    photo.photoPlacement === 'side' ? 'aspect-[4/5]' : 'aspect-[4/3]',
                })
              )}
            </div>
          )}
        </div>
      );
    }

    // 2. DIPTYQUE / ASYMMETRIC SPLIT LAYOUT
    if (photoLayout === 'cote') {
      const explicitTop =
        photos.length >= 2 ? photos.find((p) => p.photoPlacement === 'top') ?? null : null;
      const poolAfterTop = explicitTop
        ? photos.filter((p) => p.itemId !== explicitTop.itemId)
        : photos;
      const sideLead =
        poolAfterTop.find((p) => p.photoPlacement === 'side') ?? poolAfterTop[0];
      const companions = poolAfterTop.filter((p) => p.itemId !== sideLead?.itemId);
      const stackedCompanions = companions.slice(0, 2);
      const overflowPhotos = companions.slice(2);

      return (
        <div className="space-y-5">
          {explicitTop &&
            renderPhotoCard(explicitTop, idxOf(explicitTop), {
              aspectClass: 'aspect-[16/9] max-h-[360px]',
              featured: true,
            })}

          {sideLead && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-7 flex">
                {renderPhotoCard(sideLead, idxOf(sideLead), {
                  aspectClass:
                    stackedCompanions.length >= 2
                      ? 'aspect-[4/3] lg:flex-1 lg:min-h-[390px]'
                      : 'aspect-[4/3] lg:min-h-[320px]',
                  wrapperClass: 'w-full h-full',
                  featured: true,
                })}
              </div>

              <div className="lg:col-span-5 flex flex-col gap-5 justify-between">
                {stackedCompanions.length > 0 ? (
                  stackedCompanions.map((photo) =>
                    renderPhotoCard(photo, idxOf(photo), {
                      aspectClass:
                        stackedCompanions.length === 1
                          ? 'aspect-[4/3] lg:min-h-[260px]'
                          : 'aspect-[16/10]',
                      wrapperClass: stackedCompanions.length === 1 ? 'h-full' : '',
                    })
                  )
                ) : (
                  <div className="h-full rounded-xl border border-white/15 bg-white/[0.04] p-6 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-widest text-stone-400">
                        À l’affiche
                      </p>
                      <h4 className="font-display text-2xl text-white leading-snug">
                        {sideLead.title}
                      </h4>
                      {sideLead.body && (
                        <p className="text-sm text-stone-300 leading-relaxed">
                          {sideLead.body}
                        </p>
                      )}
                    </div>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={onAddPhoto}
                        className="min-h-[38px] px-4 py-2 rounded-md border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-medium text-white inline-flex items-center gap-2 self-start whitespace-nowrap"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Ajouter une photo</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {overflowPhotos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {overflowPhotos.map((photo) =>
                renderPhotoCard(photo, idxOf(photo), {
                  aspectClass: 'aspect-[4/3]',
                })
              )}
            </div>
          )}
        </div>
      );
    }

    // 3. BENTO LAYOUT: Magazine Bento grid
    if (photoLayout === 'bento') {
      const topPhoto = photos.find((p) => p.photoPlacement === 'top') ?? photos[0];
      const others = photos.filter((p) => p.itemId !== topPhoto.itemId);
      const arranged = [topPhoto, ...others];

      if (arranged.length === 1) {
        return renderPhotoCard(arranged[0], idxOf(arranged[0]), {
          wrapperClass: 'aspect-[16/9] max-h-[430px]',
          featured: true,
          variant: 'bento',
        });
      }

      if (arranged.length === 2) {
        return (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
            {renderPhotoCard(arranged[0], idxOf(arranged[0]), {
              wrapperClass: 'sm:col-span-7 min-h-[260px] sm:min-h-[330px]',
              featured: true,
              variant: 'bento',
            })}
            {renderPhotoCard(arranged[1], idxOf(arranged[1]), {
              wrapperClass: 'sm:col-span-5 min-h-[240px] sm:min-h-[330px]',
              variant: 'bento',
            })}
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 auto-rows-[210px] gap-4">
          {arranged.map((photo, idx) => {
            let spanClass = 'col-span-1 row-span-1';
            if (idx === 0) {
              spanClass = 'sm:col-span-2 sm:row-span-2';
            } else if (photo.photoPlacement === 'top') {
              spanClass = 'sm:col-span-2 row-span-1';
            } else if (photo.photoPlacement === 'side') {
              spanClass = 'sm:col-span-1 sm:row-span-2';
            } else if (idx === 1 && arranged.length === 3) {
              spanClass = 'sm:col-span-2 row-span-1';
            } else if (idx === 2 && arranged.length === 3) {
              spanClass = 'sm:col-span-2 row-span-1';
            }

            return renderPhotoCard(photo, idxOf(photo), {
              wrapperClass: `${spanClass} min-h-[200px]`,
              featured: idx === 0,
              variant: 'bento',
            });
          })}
        </div>
      );
    }

    // 4. GALERIE LAYOUT: Crisp 3-column framed album grid
    const explicitTop = photos.filter((p) => p.photoPlacement === 'top');
    const regularPhotos = photos.filter((p) => p.photoPlacement !== 'top');

    return (
      <div className="space-y-5">
        {explicitTop.map((photo) =>
          renderPhotoCard(photo, idxOf(photo), {
            aspectClass: 'aspect-[16/9] max-h-[400px]',
            featured: true,
          })
        )}

        {regularPhotos.length > 0 && (
          <div
            className={`grid gap-5 items-start ${
              regularPhotos.length === 1
                ? 'grid-cols-1 sm:grid-cols-2'
                : regularPhotos.length === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {regularPhotos.map((photo) =>
              renderPhotoCard(photo, idxOf(photo), {
                aspectClass:
                  photo.photoPlacement === 'side' ? 'aspect-[4/5]' : 'aspect-[4/3]',
              })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Welcoming Album Header */}
      <div className="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs uppercase tracking-widest text-stone-300">
              Album photo ·{' '}
              <span className="tabular-nums">
                {photos.length} cliché{photos.length > 1 ? 's' : ''}
              </span>
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-medium text-white tracking-tight text-balance">
              {effectiveTitle}
            </h2>
            <p className="text-sm text-stone-300 leading-relaxed max-w-2xl">
              {effectiveNote}
            </p>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={savingLayout}
                onClick={() => void handleCycleLayout()}
                aria-label="Changer la mise en page de l’album"
                title="Changer la mise en page"
                className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg bg-white/10 text-white border border-white/15 hover:bg-white/20 disabled:opacity-50 inline-flex items-center justify-center transition-colors shrink-0"
              >
                <CurrentLayoutIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                aria-pressed={organizing}
                onClick={() => setOrganizing((prev) => !prev)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  organizing
                    ? 'bg-amber-200 text-stone-950 border-amber-200'
                    : 'bg-white/10 text-white border-white/15 hover:bg-white/15'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{organizing ? 'Terminer' : 'Agencer'}</span>
              </button>

              <button
                type="button"
                onClick={onAddPhoto}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#FAF9F6] text-stone-900 hover:bg-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>+ Photo</span>
              </button>
            </div>
          )}
        </div>

        {/* Owner Quick Header Customization */}
        {isOwner && organizing && (
          <div className="pt-4 border-t border-white/15 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setEditingHeader((prev) => !prev)}
                className="min-h-[34px] px-3 py-1 rounded-md border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-medium text-white inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>
                  {editingHeader ? 'Masquer l’en-tête' : 'Personnaliser l’accueil de l’album'}
                </span>
              </button>
            </div>

            {editingHeader && (
              <form
                onSubmit={handleHeaderSubmit}
                className="p-4 rounded-lg bg-black/25 border border-white/15 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="album-header-title"
                      className="block text-xs text-stone-300 mb-1"
                    >
                      Titre de l’album
                    </label>
                    <input
                      id="album-header-title"
                      type="text"
                      maxLength={FIELD_LIMITS.photoAlbumTitle.max}
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder={`Album photo de ${memberName}`}
                      className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/20 text-sm text-white placeholder:text-stone-400 focus:outline-none focus:border-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="album-header-note"
                      className="block text-xs text-stone-300 mb-1"
                    >
                      Mot d’accueil pour les visiteurs
                    </label>
                    <input
                      id="album-header-note"
                      type="text"
                      maxLength={FIELD_LIMITS.photoAlbumNote.max}
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder="Ex. Bienvenue dans mon carnet visuel…"
                      className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/20 text-sm text-white placeholder:text-stone-400 focus:outline-none focus:border-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={savingHeader}
                    onClick={() => setEditingHeader(false)}
                    className="min-h-[34px] px-3 py-1 text-xs text-stone-300 hover:text-white inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Annuler</span>
                  </button>
                  <button
                    type="submit"
                    disabled={savingHeader}
                    className="min-h-[34px] px-3.5 py-1 rounded-md bg-[#FAF9F6] text-stone-900 hover:bg-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingHeader ? 'Enregistrement…' : 'Enregistrer l’en-tête'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Curated Photo Gallery */}
      {renderGalleryContent()}
    </div>
  );
}
