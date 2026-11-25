import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Heart,
  Info,
  Mic,
  Share2,
  Sparkles,
  Tv,
  User,
  Users,
} from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { CharacterDetailSkeleton } from '@/src/components/LoadingSkeletons';
import { useAuth } from '@/src/context/AuthContext';
import {
  getCharacterFullDetails,
  recordRecentlyViewedCharacter,
} from '@/src/services/characterDatabaseService';
import type { CharacterProfile } from '@/src/types/anime';

export const CharacterDetailPage: React.FC = () => {
  const { characterKey } = useParams<{ characterKey: string }>();
  const { user, isFavoriteCharacter, toggleFavoriteCharacter } = useAuth();
  const navigate = useNavigate();

  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!characterKey) {
        setError('Character not found.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const details = await getCharacterFullDetails(characterKey);
        if (!active) return;
        if (!details) {
          setError('Character profile could not be retrieved.');
        } else {
          setCharacter(details);
          recordRecentlyViewedCharacter(details, user?.uid);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load character profile.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [characterKey, user?.uid]);

  const favorited = character ? isFavoriteCharacter(character.key) : false;

  const handleShare = async () => {
    if (!character) return;
    const shareUrl = window.location.href;
    const shareData = {
      title: `${character.name} · KuroStream Character`,
      text: `Check out ${character.name} from ${character.animeTitle || 'Anime'} on KuroStream!`,
      url: shareUrl,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToast(true);
      window.setTimeout(() => setCopiedToast(false), 2500);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <CharacterDetailSkeleton />;
  }

  if (error || !character) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="kuro-glass rounded-3xl p-8 space-y-4">
          <h2 className="text-xl font-bold text-white">Character Not Found</h2>
          <p className="text-sm text-slate-300">{error || 'Unable to load character profile.'}</p>
          <button
            type="button"
            onClick={() => navigate('/characters')}
            className="kuro-btn-primary inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Character Database</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      {/* Top Navigation Back */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="kuro-btn-glass inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share character profile"
            className="kuro-btn-glass inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold text-slate-200"
          >
            {copiedToast ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
            <span>{copiedToast ? 'Link Copied' : 'Share'}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleFavoriteCharacter(character)}
            aria-label={favorited ? 'Remove from favorites' : 'Add to favorite characters'}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
              favorited
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-950/50'
                : 'kuro-btn-glass text-slate-200'
            }`}
          >
            <Heart className={`h-4 w-4 ${favorited ? 'fill-current' : ''}`} />
            <span>{favorited ? 'Favorited' : 'Favorite'}</span>
          </button>
        </div>
      </div>

      {/* Cinematic Banner Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-[#0b0d15] shadow-2xl">
        <div className="relative h-[300px] sm:h-[400px] w-full">
          <AnimeImage
            src={character.bannerUrl || character.imageUrl}
            alt={character.name}
            variant="banner"
            priority
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07080d] via-[#07080d]/60 to-[#07080d]/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07080d]/90 via-transparent to-transparent" />

          <div className="absolute inset-0 flex items-end p-6 sm:p-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 w-full">
              <div className="relative h-36 w-28 sm:h-44 sm:w-32 shrink-0 overflow-hidden rounded-2xl border-2 border-violet-400/40 bg-[#120e1e] shadow-2xl">
                <AnimeImage
                  src={character.imageUrl}
                  alt={character.name}
                  className="h-full w-full object-cover object-top"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-violet-400/45 bg-violet-500/20 px-2.5 py-1 text-xs font-semibold text-violet-200 backdrop-blur-md">
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    <span>{character.role} Character</span>
                  </span>
                  {character.animeTitle && (
                    <span className="text-xs font-medium text-slate-300">
                      {character.animeTitle}
                    </span>
                  )}
                </div>

                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
                  {character.name}
                </h1>

                {character.nativeName && (
                  <p className="text-sm font-medium text-violet-300/90">
                    {character.nativeName}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Attributes & Metadata */}
        <div className="space-y-6">
          <div className="kuro-glass rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-violet-400">
              Character Profile
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {character.gender && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <span className="block text-slate-400">Gender</span>
                  <span className="mt-0.5 block font-bold text-white">{character.gender}</span>
                </div>
              )}
              {character.age && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <span className="block text-slate-400">Age</span>
                  <span className="mt-0.5 block font-bold text-white">{character.age}</span>
                </div>
              )}
              {character.birthday && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <span className="block text-slate-400">Birthday</span>
                  <span className="mt-0.5 block font-bold text-white">{character.birthday}</span>
                </div>
              )}
              {character.height && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <span className="block text-slate-400">Height</span>
                  <span className="mt-0.5 block font-bold text-white">{character.height}</span>
                </div>
              )}
            </div>

            {character.abilities && character.abilities.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                <span className="block text-xs font-semibold text-slate-400">Special Abilities &amp; Powers</span>
                <div className="flex flex-wrap gap-1.5">
                  {character.abilities.map((ab, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-200"
                    >
                      {ab}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Biography & Related Anime */}
        <div className="lg:col-span-2 space-y-6">
          <div className="kuro-glass rounded-3xl p-6 sm:p-8 space-y-4">
            <h3 className="text-lg font-bold text-white">Biography &amp; Background</h3>
            {character.description ? (
              <div className="prose prose-invert max-w-none text-sm leading-relaxed text-slate-300 space-y-3">
                {character.description.split('\n\n').map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No biography details currently recorded.</p>
            )}
          </div>

          {/* Voice Actors */}
          {character.voiceActors && character.voiceActors.length > 0 && (
            <div className="kuro-glass rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-violet-400" />
                <h3 className="text-lg font-bold text-white">Voice Actors</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {character.voiceActors.map((va) => (
                  <div key={va.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <AnimeImage
                      src={va.imageUrl}
                      alt={va.name}
                      className="h-12 w-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{va.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {[va.language, va.nativeName].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anime Appearances & Related Links */}
          {character.animeMediaId && (
            <div className="kuro-glass rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tv className="h-5 w-5 text-violet-400" />
                  <h3 className="text-lg font-bold text-white">Anime Origin</h3>
                </div>
                <Link
                  to={`/anime/${character.animeMediaId}`}
                  className="kuro-btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white"
                >
                  <span>View Anime Details</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <p className="text-sm text-slate-300">
                Featured prominently in <span className="font-bold text-white">{character.animeTitle}</span>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
