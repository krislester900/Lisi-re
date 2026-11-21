import React, { useEffect, useState } from 'react';
import { Globe, Lock, Repeat2, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { deleteStoryRepost, upsertStoryRepost } from '../lib/storyService';
import { FIELD_LIMITS, PublicProfile, Story, StoryRepost, StoryVisibility } from '../types/story';

interface RepostModalProps {
  story: Story | null;
  existingRepost: StoryRepost | null;
  userProfile: PublicProfile | null;
  onClose: () => void;
  onSaved: (visibility: StoryVisibility, removed?: boolean) => void;
}

export function RepostModal({
  story,
  existingRepost,
  userProfile,
  onClose,
  onSaved,
}: RepostModalProps) {
  const { user, signInWithGoogle } = useAuth();
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<StoryVisibility>('public');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileDefaultVisibility: StoryVisibility =
    userProfile?.discoverable === false ? 'private' : 'public';

  const isSourceRestricted = Boolean(
    story && (story.visibility !== 'public' || story.customSalonVisibility === 'private')
  );

  useEffect(() => {
    if (!story) return;
    setError(null);
    setNote(existingRepost?.note ?? '');
    if (isSourceRestricted) {
      setVisibility('private');
    } else {
      setVisibility(existingRepost?.visibility ?? profileDefaultVisibility);
    }
  }, [story?.storyId, existingRepost, profileDefaultVisibility, isSourceRestricted]);

  useEffect(() => {
    if (!story) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [story, saving, onClose]);

  if (!story) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const reposterName = userProfile?.displayName || user.displayName || 'Auteur';
      const savedVis = await upsertStoryRepost({
        userId: user.uid,
        reposterName,
        story,
        note,
        visibility: isSourceRestricted ? 'private' : visibility,
      });
      onSaved(savedVis, false);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de repartager cette histoire pour le moment.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!user || !existingRepost || saving) return;
    setError(null);
    setSaving(true);
    try {
      await deleteStoryRepost(user.uid, story.storyId);
      onSaved(existingRepost.visibility, true);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de retirer ce repartage.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Repartager cette histoire"
      onClick={() => {
        if (!saving) onClose();
      }}
      className="fixed inset-0 z-[60] bg-stone-950/60 p-4 sm:p-6 flex items-center justify-center overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white border border-stone-300 rounded-xl p-6 sm:p-7 space-y-5 shadow-xl my-auto"
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-stone-200">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-stone-500 inline-flex items-center gap-1.5">
              <Repeat2 className="w-3.5 h-3.5 text-[#1B365D]" />
              <span>{existingRepost ? 'Modifier le repartage' : 'Repartager sur mon compte'}</span>
            </p>
            <h2 className="font-display text-2xl font-medium text-stone-900 leading-snug">
              {story.title}
            </h2>
            <p className="text-xs text-stone-500">
              Par {story.isAnonymous ? 'Auteur anonyme' : story.authorName}
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 border border-stone-200 rounded-md inline-flex items-center gap-1.5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Fermer</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Visibility selector */}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-stone-800">
                Visibilité sur votre compte
              </span>
              <span className="text-[11px] text-stone-500">
                Profil actuel :{' '}
                <strong>{userProfile?.discoverable === false ? 'Privé' : 'Public'}</strong>
              </span>
            </div>

            {isSourceRestricted ? (
              <div className="p-3.5 rounded-md border border-stone-200 bg-[#FBF9F5] flex items-start gap-2.5 text-xs text-stone-700">
                <Lock className="w-4 h-4 text-[#1B365D] shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Ce récit est privé ou provient d’un salon privé. Par respect pour la confidentialité de son salon, votre repartage est enregistré <strong>en privé sur votre compte uniquement</strong>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                    visibility === 'public'
                      ? 'border-[#1B365D] bg-[#F3F6FA]'
                      : 'border-stone-200 bg-[#FBF9F5] hover:border-stone-400'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-900">
                    <Globe className="w-4 h-4 text-[#1B365D]" />
                    <span>Public · Sur mon mur</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Visible par les personnes qui visitent votre mur et votre profil.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`p-3.5 rounded-lg border text-left transition-colors space-y-1 ${
                    visibility === 'private'
                      ? 'border-[#1B365D] bg-[#F3F6FA]'
                      : 'border-stone-200 bg-[#FBF9F5] hover:border-stone-400'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-900">
                    <Lock className="w-4 h-4 text-[#1B365D]" />
                    <span>Privé · Mon compte seul</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Conservé dans votre carnet privé sans apparaître aux visiteurs.
                  </p>
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="repost-note" className="block text-xs font-medium text-stone-700 mb-1.5">
              Un mot d’accompagnement (facultatif)
            </label>
            <textarea
              id="repost-note"
              rows={3}
              maxLength={FIELD_LIMITS.repostNote.max}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Pourquoi souhaitez-vous garder ou partager cette histoire ?"
              className="w-full px-3.5 py-2.5 bg-[#FBF9F5] border border-stone-200 rounded-md text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-[#1B365D]"
            />
            <p className="text-[11px] text-stone-500 mt-1 text-right tabular-nums">
              {note.length}/{FIELD_LIMITS.repostNote.max}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {existingRepost ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleRemove()}
                className="min-h-[40px] px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Retirer le repartage</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 hover:text-stone-900"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-5 py-2 text-sm font-medium text-white bg-[#1B365D] rounded-md hover:bg-[#132744] disabled:opacity-60 inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Repeat2 className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Enregistrement…'
                    : existingRepost
                      ? 'Mettre à jour'
                      : visibility === 'private' || isSourceRestricted
                        ? 'Repartager en privé'
                        : 'Repartager sur mon mur'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
