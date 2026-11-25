import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles, Users } from 'lucide-react';
import { AnimeImage } from '@/src/components/AnimeImage';
import { db, logFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { CharacterProfile } from '@/src/types/anime';

export const FeaturedCharactersSection: React.FC = () => {
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!db) {
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, 'characters'), where('featured', '==', true), where('visible', '==', true));
        const snap = await getDocs(q);
        if (!active) return;
        const list: CharacterProfile[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            key: `custom_${docSnap.id}`,
            customId: docSnap.id,
            name: String(d.name || ''),
            nativeName: d.nativeName || null,
            animeTitle: d.animeTitle || null,
            role: d.role || 'Main',
            imageUrl: String(d.imageUrl || ''),
            visible: true,
            featured: true,
            createdAt: Number(d.createdAt) || Date.now(),
            updatedAt: Number(d.updatedAt) || Date.now(),
          };
        });
        setCharacters(list);
      } catch (err) {
        logFirestoreError(err, OperationType.LIST, 'characters');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  if (!loading && characters.length === 0) return null;

  return (
    <section className="kuro-content-auto space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 shrink-0 text-violet-400" />
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Featured Anime Characters
            </h2>
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
            Explore legendary protagonists, villains, and fan favorites
          </p>
        </div>

        <Link
          to="/characters"
          className="kuro-btn-glass inline-flex min-h-[36px] items-center gap-1 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-violet-200 whitespace-nowrap shrink-0"
        >
          <span>Character Database</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-[#10121c]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {characters.map((ch) => (
            <Link
              key={ch.key}
              to={`/characters/${encodeURIComponent(ch.key)}`}
              className="kuro-glass group relative overflow-hidden rounded-2xl p-2.5 transition-all duration-300 hover:border-violet-500/50 hover:shadow-[0_12px_32px_-10px_rgba(139,92,246,0.4)] active:scale-[0.98]"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-[#12101f]">
                <AnimeImage
                  src={ch.imageUrl}
                  alt={ch.name}
                  className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-violet-600/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                  <Sparkles className="h-2.5 w-2.5 text-amber-300" />
                  <span>{ch.role}</span>
                </span>
              </div>
              <div className="mt-2.5 min-w-0">
                <p className="truncate text-xs sm:text-sm font-bold text-white group-hover:text-violet-300 transition-colors">
                  {ch.name}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {ch.animeTitle || 'Anime Character'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};
