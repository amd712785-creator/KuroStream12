import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, logFirestoreError, OperationType } from '@/src/lib/firebase';
import { getAnilistApiUrl, logApiDiagnostic, resolveApiUrl } from '@/src/config/env';
import type {
  CharacterAnimeAppearance,
  CharacterProfile,
  CharacterRole,
  CharacterRoleFilter,
  CharacterVoiceActor,
  FavoriteCharacterItem,
} from '@/src/types/anime';

const RECENT_CHARS_KEY_PREFIX = 'kurostream_recent_chars_v1_';

export function getRecentlyViewedCharacters(uid?: string): CharacterProfile[] {
  try {
    const key = `${RECENT_CHARS_KEY_PREFIX}${uid || 'guest'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CharacterProfile[];
    }
  } catch {
    // ignore
  }
  return [];
}

export function recordRecentlyViewedCharacter(char: CharacterProfile, uid?: string): void {
  try {
    const key = `${RECENT_CHARS_KEY_PREFIX}${uid || 'guest'}`;
    const list = getRecentlyViewedCharacters(uid);
    const filtered = list.filter((c) => c.key !== char.key);
    const updated = [char, ...filtered].slice(0, 12);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

async function gqlCharacterFetch<T>(queryStr: string, variables: Record<string, unknown>): Promise<T> {
  const endpoints = [getAnilistApiUrl(), resolveApiUrl('/api/anilist')];
  const body = JSON.stringify({ query: queryStr, variables });
  let lastErr: Error | null = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        logApiDiagnostic('CharacterDB', endpoint, { status: response.status });
        lastErr = new Error(`Character request failed (HTTP ${response.status})`);
        continue;
      }
      const payload = await response.json();
      if (payload?.errors?.length) {
        throw new Error(payload.errors[0]?.message || 'AniList character API error');
      }
      return payload.data as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('Character request failed');
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastErr || new Error('Unable to connect to AniList character service.');
}

function parseAniListRole(rawRole?: string | null): CharacterRole {
  if (!rawRole) return 'Supporting';
  const upper = rawRole.toUpperCase();
  if (upper === 'MAIN') return 'Main';
  if (upper === 'VILLAIN' || upper === 'ANTAGONIST') return 'Villain';
  if (upper === 'BACKGROUND') return 'Background';
  return 'Supporting';
}

export async function searchCharacterDatabase(options: {
  search?: string;
  animeTitle?: string;
  roleFilter?: CharacterRoleFilter;
  sort?: 'POPULARITY' | 'ALPHABETICAL';
  page?: number;
  perPage?: number;
}): Promise<{ characters: CharacterProfile[]; hasNextPage: boolean }> {
  const search = options.search?.trim() || '';
  const roleFilter = options.roleFilter || 'ALL';
  const sort = options.sort || 'POPULARITY';
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 24;

  const resultsMap = new Map<string, CharacterProfile>();

  // 1. Fetch from Firestore admin characters collection
  if (db) {
    try {
      const charRef = collection(db, 'characters');
      const snap = await getDocs(charRef);
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.visible === false) return;
        const name = String(d.name || '');
        const animeTitle = String(d.animeTitle || '');
        const role = (d.role as CharacterRole) || 'Supporting';

        if (search) {
          const hay = `${name} ${d.nativeName || ''} ${animeTitle} ${d.description || ''}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return;
        }
        if (roleFilter !== 'ALL' && role.toUpperCase() !== roleFilter.toUpperCase()) return;
        if (options.animeTitle && !animeTitle.toLowerCase().includes(options.animeTitle.toLowerCase())) {
          return;
        }

        const profile: CharacterProfile = {
          key: `custom_${docSnap.id}`,
          customId: docSnap.id,
          name,
          nativeName: d.nativeName || null,
          animeTitle: animeTitle || null,
          animeMediaId: Number(d.animeMediaId) || null,
          description: d.description || null,
          gender: d.gender || null,
          birthday: d.birthday || null,
          age: d.age || null,
          height: d.height || null,
          personality: d.personality || null,
          role,
          abilities: Array.isArray(d.abilities) ? d.abilities : [],
          imageUrl: String(d.imageUrl || ''),
          bannerUrl: d.bannerUrl || null,
          favourites: Number(d.favourites) || 100,
          visible: true,
          featured: Boolean(d.featured),
          createdAt: Number(d.createdAt) || Date.now(),
          updatedAt: Number(d.updatedAt) || Date.now(),
        };
        resultsMap.set(profile.key, profile);
      });
    } catch (err) {
      logFirestoreError(err, OperationType.LIST, 'characters');
    }
  }

  // 2. Fetch from AniList GraphQL API
  try {
    const gqlQuery = `
      query CharacterSearch($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            currentPage
          }
          characters(search: $search, sort: FAVOURITES_DESC) {
            id
            name {
              full
              native
            }
            image {
              large
              medium
            }
            description(asHtml: false)
            gender
            dateOfBirth {
              year
              month
              day
            }
            age
            favourites
            media(sort: POPULARITY_DESC, perPage: 1) {
              edges {
                characterRole
                node {
                  id
                  title {
                    english
                    romaji
                  }
                  coverImage {
                    large
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = await gqlCharacterFetch<{
      Page: {
        pageInfo: { hasNextPage: boolean; currentPage: number };
        characters: Array<{
          id: number;
          name?: { full?: string | null; native?: string | null };
          image?: { large?: string | null; medium?: string | null };
          description?: string | null;
          gender?: string | null;
          dateOfBirth?: { year?: number | null; month?: number | null; day?: number | null };
          age?: string | number | null;
          favourites?: number | null;
          media?: {
            edges?: Array<{
              characterRole?: string | null;
              node?: {
                id: number;
                title?: { english?: string | null; romaji?: string | null };
                coverImage?: { large?: string | null };
              };
            }>;
          };
        }>;
      };
    }>(gqlQuery, {
      search: search || undefined,
      page,
      perPage: Math.max(perPage, 30),
    });

    const anilistChars = data.Page?.characters || [];
    for (const ch of anilistChars) {
      const fullName = ch.name?.full?.trim();
      const imageUrl = ch.image?.large || ch.image?.medium;
      if (!fullName || !imageUrl) continue;

      const topEdge = ch.media?.edges?.[0];
      const role = parseAniListRole(topEdge?.characterRole);
      const seriesTitle = topEdge?.node?.title?.english || topEdge?.node?.title?.romaji || 'Anime';

      if (roleFilter !== 'ALL' && role.toUpperCase() !== roleFilter.toUpperCase()) continue;
      if (options.animeTitle && !seriesTitle.toLowerCase().includes(options.animeTitle.toLowerCase())) {
        continue;
      }

      const key = `anilist_${ch.id}`;
      if (resultsMap.has(key)) continue; // admin override takes precedence

      // Extract birthday string if available
      let birthdayStr: string | null = null;
      if (ch.dateOfBirth?.month && ch.dateOfBirth?.day) {
        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        birthdayStr = `${months[ch.dateOfBirth.month] || ''} ${ch.dateOfBirth.day}${ch.dateOfBirth.year ? `, ${ch.dateOfBirth.year}` : ''}`;
      }

      resultsMap.set(key, {
        key,
        anilistId: ch.id,
        name: fullName,
        nativeName: ch.name?.native || null,
        animeTitle: seriesTitle,
        animeMediaId: topEdge?.node?.id || null,
        description: ch.description || null,
        gender: ch.gender || null,
        birthday: birthdayStr,
        age: ch.age ? String(ch.age) : null,
        role,
        imageUrl,
        favourites: ch.favourites || 50,
        visible: true,
        featured: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn('[CharacterDB] AniList query warning:', err);
  }

  let list = Array.from(resultsMap.values());
  if (sort === 'ALPHABETICAL') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    list.sort((a, b) => (b.favourites || 0) - (a.favourites || 0));
  }

  const start = (page - 1) * perPage;
  const sliced = list.slice(start, start + perPage);

  return {
    characters: sliced,
    hasNextPage: start + perPage < list.length,
  };
}

export async function getCharacterFullDetails(characterKey: string): Promise<CharacterProfile | null> {
  // 1. Check if custom Firebase character
  if (characterKey.startsWith('custom_')) {
    const customId = characterKey.replace('custom_', '');
    if (!db) return null;
    try {
      const snap = await getDoc(doc(db, 'characters', customId));
      if (snap.exists()) {
        const d = snap.data();
        return {
          key: characterKey,
          customId,
          name: String(d.name || ''),
          nativeName: d.nativeName || null,
          animeTitle: d.animeTitle || null,
          animeMediaId: Number(d.animeMediaId) || null,
          description: d.description || null,
          gender: d.gender || null,
          birthday: d.birthday || null,
          age: d.age || null,
          height: d.height || null,
          personality: d.personality || null,
          role: (d.role as CharacterRole) || 'Supporting',
          abilities: Array.isArray(d.abilities) ? d.abilities : [],
          imageUrl: String(d.imageUrl || ''),
          bannerUrl: d.bannerUrl || null,
          voiceActors: Array.isArray(d.voiceActors) ? d.voiceActors : [],
          relatedCharacters: Array.isArray(d.relatedCharacters) ? d.relatedCharacters : [],
          favourites: Number(d.favourites) || 100,
          visible: Boolean(d.visible !== false),
          featured: Boolean(d.featured),
          createdAt: Number(d.createdAt) || Date.now(),
          updatedAt: Number(d.updatedAt) || Date.now(),
        };
      }
    } catch (err) {
      logFirestoreError(err, OperationType.GET, `characters/${customId}`);
    }
    return null;
  }

  // 2. AniList character key (`anilist_123` or numeric id)
  const anilistIdStr = characterKey.replace('anilist_', '');
  const anilistId = Number.parseInt(anilistIdStr, 10);
  if (!Number.isFinite(anilistId)) return null;

  try {
    const gqlQuery = `
      query CharacterDetails($id: Int) {
        Character(id: $id) {
          id
          name {
            full
            native
            alternative
          }
          image {
            large
            medium
          }
          description(asHtml: false)
          gender
          dateOfBirth {
            year
            month
            day
          }
          age
          favourites
          media(sort: POPULARITY_DESC, perPage: 12) {
            edges {
              characterRole
              node {
                id
                title {
                  english
                  romaji
                }
                coverImage {
                  large
                }
                bannerImage
                format
              }
              voiceActors(sort: [RELEVANCE, ROLE]) {
                id
                name {
                  full
                  native
                }
                languageV2
                image {
                  large
                }
              }
            }
          }
        }
      }
    `;
    const data = await gqlCharacterFetch<{
      Character: {
        id: number;
        name?: { full?: string | null; native?: string | null; alternative?: string[] };
        image?: { large?: string | null; medium?: string | null };
        description?: string | null;
        gender?: string | null;
        dateOfBirth?: { year?: number | null; month?: number | null; day?: number | null };
        age?: string | number | null;
        favourites?: number | null;
        media?: {
          edges?: Array<{
            characterRole?: string | null;
            node?: {
              id: number;
              title?: { english?: string | null; romaji?: string | null };
              coverImage?: { large?: string | null };
              bannerImage?: string | null;
              format?: string | null;
            };
            voiceActors?: Array<{
              id: number;
              name?: { full?: string | null; native?: string | null };
              languageV2?: string | null;
              image?: { large?: string | null };
            }>;
          }>;
        };
      } | null;
    }>(gqlQuery, { id: anilistId });

    const ch = data.Character;
    if (!ch) return null;

    const primaryEdge = ch.media?.edges?.[0];
    const seriesTitle = primaryEdge?.node?.title?.english || primaryEdge?.node?.title?.romaji || 'Anime';
    const bannerUrl = primaryEdge?.node?.bannerImage || primaryEdge?.node?.coverImage?.large || null;

    let birthdayStr: string | null = null;
    if (ch.dateOfBirth?.month && ch.dateOfBirth?.day) {
      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      birthdayStr = `${months[ch.dateOfBirth.month] || ''} ${ch.dateOfBirth.day}${ch.dateOfBirth.year ? `, ${ch.dateOfBirth.year}` : ''}`;
    }

    const voiceActorsMap = new Map<number, CharacterVoiceActor>();
    const relatedCharsMap = new Map<number, CharacterAnimeAppearance>();

    ch.media?.edges?.forEach((edge) => {
      const mediaNode = edge.node;
      if (mediaNode) {
        const title = mediaNode.title?.english || mediaNode.title?.romaji || 'Anime';
        if (!relatedCharsMap.has(mediaNode.id)) {
          relatedCharsMap.set(mediaNode.id, {
            animeId: mediaNode.id,
            title,
            coverImage: mediaNode.coverImage?.large || null,
            bannerImage: mediaNode.bannerImage || null,
            role: parseAniListRole(edge.characterRole),
            format: mediaNode.format || null,
          });
        }
      }

      edge.voiceActors?.forEach((va) => {
        if (va && va.name?.full && !voiceActorsMap.has(va.id)) {
          voiceActorsMap.set(va.id, {
            id: va.id,
            name: va.name.full,
            nativeName: va.name.native || null,
            language: va.languageV2 || null,
            imageUrl: va.image?.large || null,
          });
        }
      });
    });

    return {
      key: `anilist_${ch.id}`,
      anilistId: ch.id,
      name: ch.name?.full || 'Character',
      nativeName: ch.name?.native || null,
      animeTitle: seriesTitle,
      animeMediaId: primaryEdge?.node?.id || null,
      description: ch.description || null,
      gender: ch.gender || null,
      birthday: birthdayStr,
      age: ch.age ? String(ch.age) : null,
      role: parseAniListRole(primaryEdge?.characterRole),
      imageUrl: ch.image?.large || ch.image?.medium || '',
      bannerUrl,
      voiceActors: Array.from(voiceActorsMap.values()),
      relatedCharacters: Array.from(relatedCharsMap.values()),
      favourites: ch.favourites || 100,
      visible: true,
      featured: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (err) {
    console.warn('[CharacterDB] Failed to fetch AniList character details:', err);
  }
  return null;
}

export function subscribeFavoriteCharacters(
  uid: string,
  onUpdate: (items: FavoriteCharacterItem[]) => void
): () => void {
  if (!db || !uid) {
    onUpdate([]);
    return () => {};
  }
  const favColRef = collection(db, `users/${uid}/favoriteCharacters`);
  const q = query(favColRef, where('ownerId', '==', uid));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const list: FavoriteCharacterItem[] = snap.docs.map((d) => {
        const data = d.data();
        const rawAddedAt = data.addedAt;
        let addedAtMillis = Date.now();
        if (rawAddedAt && typeof rawAddedAt.toMillis === 'function') {
          addedAtMillis = rawAddedAt.toMillis();
        } else if (typeof rawAddedAt === 'number') {
          addedAtMillis = rawAddedAt;
        }
        return {
          characterKey: String(data.characterKey || data.characterId || d.id),
          name: String(data.name || ''),
          imageUrl: String(data.imageUrl || data.portraitUrl || ''),
          animeTitle: data.animeTitle || null,
          role: (data.role as CharacterRole) || 'Supporting',
          addedAt: addedAtMillis,
        };
      });
      list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      onUpdate(list);
    },
    (err) => {
      logFirestoreError(err, OperationType.LIST, `users/${uid}/favoriteCharacters`);
      onUpdate([]);
    }
  );
  return unsub;
}

export async function toggleFavoriteCharacterInFirestore(
  uid: string,
  char: CharacterProfile,
  isFavorite: boolean
): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const charDocId = char.key.replace(/[/:]/g, '_').slice(0, 128);
  const docRef = doc(db, `users/${uid}/favoriteCharacters`, charDocId);
  if (isFavorite) {
    await deleteDoc(docRef);
  } else {
    await setDoc(docRef, {
      ownerId: uid,
      characterId: charDocId,
      characterKey: char.key.slice(0, 128),
      source: char.customId || char.key.startsWith('fb:') ? 'firebase' : 'anilist',
      anilistId: typeof char.anilistId === 'number' && char.anilistId >= 0 ? char.anilistId : 0,
      name: char.name.slice(0, 140),
      nativeName: (char.nativeName || '').slice(0, 140),
      animeId: typeof char.animeMediaId === 'number' && char.animeMediaId >= 0 ? char.animeMediaId : 0,
      animeTitle: (char.animeTitle || '').slice(0, 240),
      portraitUrl: (char.imageUrl || '').slice(0, 500),
      imageUrl: (char.imageUrl || '').slice(0, 500),
      role: char.role || 'Supporting',
      addedAt: serverTimestamp(),
    });
  }
}

export async function saveAdminCharacter(
  characterId: string | null,
  input: {
    name: string;
    nativeName?: string;
    animeTitle?: string;
    animeMediaId?: number;
    description?: string;
    gender?: string;
    birthday?: string;
    age?: string;
    height?: string;
    personality?: string;
    role: CharacterRole;
    abilities?: string[];
    imageUrl: string;
    bannerUrl?: string;
    visible: boolean;
    featured: boolean;
  },
  uid: string
): Promise<string> {
  if (!db) throw new Error('Firestore is not configured.');
  const id = characterId || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const docRef = doc(db, 'characters', id);
  const payload = {
    ...input,
    createdBy: uid,
    updatedAt: serverTimestamp(),
    ...(characterId ? {} : { createdAt: serverTimestamp() }),
  };
  await setDoc(docRef, payload, { merge: true });
  return id;
}

export async function deleteAdminCharacter(characterId: string): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  await deleteDoc(doc(db, 'characters', characterId));
}
