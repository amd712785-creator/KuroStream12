export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | string;
export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS' | string;

export interface AnimeTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export interface AnimeCoverImage {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
  color?: string | null;
}

export interface AnimeStudio {
  id: number;
  name: string;
  isAnimationStudio?: boolean;
}

export interface AnimeNextAiring {
  episode: number;
  airingAt: number;
  timeUntilAiring?: number;
}

export interface AnimeTrailer {
  id?: string | null;
  site?: string | null;
  thumbnail?: string | null;
}

export interface AnimeStreamingEpisode {
  title?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  site?: string | null;
}

export interface AnimeRelationEdge {
  relationType: string;
  node: AnimeSummary;
}

export interface AnimeSummary {
  id: number;
  idMal?: number | null;
  title: AnimeTitle;
  coverImage: AnimeCoverImage;
  bannerImage?: string | null;
  format?: MediaFormat | null;
  status?: MediaStatus | null;
  episodes?: number | null;
  duration?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[];
  description?: string | null;
  nextAiringEpisode?: AnimeNextAiring | null;
}

export interface AnimeDetail extends AnimeSummary {
  studios?: {
    nodes?: AnimeStudio[];
  };
  trailer?: AnimeTrailer | null;
  streamingEpisodes?: AnimeStreamingEpisode[];
  relations?: {
    edges?: AnimeRelationEdge[];
  };
}

export interface AiringScheduleItem {
  id: number;
  airingAt: number;
  episode: number;
  media: AnimeSummary;
}

export interface EpisodeItem {
  id: string;
  dubId?: string;
  number: number;
  title: string;
  description?: string;
  image?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  isFiller?: boolean;
  hasDub?: boolean;
  externalUrl?: string | null;
}

export interface StreamSource {
  url: string;
  quality: string;
  type: 'hls' | 'mp4' | 'embed';
  isM3U8: boolean;
  language?: string;
}

export interface StreamSubtitle {
  url: string;
  lang: string;
  label: string;
}

export interface StreamServer {
  name: string;
  url?: string;
}

export interface SkipInterval {
  start: number;
  end: number;
  type?: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
  source?: 'aniskip' | 'provider';
}

export interface ParsedStreamResult {
  sources: StreamSource[];
  subtitles: StreamSubtitle[];
  servers: StreamServer[];
  headers?: Record<string, string>;
  downloadUrl?: string;
  intro?: SkipInterval;
  outro?: SkipInterval;
  recap?: SkipInterval;
  hasHindiAudio?: boolean;
  audioLanguages?: string[];
  providerSource?: string;
  rawResponse?: unknown;
}

export interface StreamFetchError {
  message: string;
  statusCode?: number;
  endpointUrl: string;
  detail?: string;
}

export interface AnimeWorldItem {
  title: string;
  image: string | null;
  year: string | null;
  rating: string | null;
  type: 'series' | 'movie';
  seriesId?: string;
  movieId?: string;
}

export interface AnimeWorldSeason {
  seasonNumber: string;
  seasonName: string;
  episodes: string;
  seasonId: string;
  postId?: string;
  isSubOnly?: boolean;
}

export interface AnimeWorldEpisode {
  episodeId: string;
  title: string;
  episodeNumber: string;
  airDate: string | null;
  image: string | null;
  overview: string | null;
}

export interface AnimeWorldStreamItem {
  language: string;
  url: string;
  type: 'hls' | 'mp4' | 'embed';
  label: string;
}

export interface AnimeWorldStreamResponse {
  success: boolean;
  type: 'episode' | 'movie';
  source: string;
  title: string;
  hasHindiAudio: boolean;
  audioLanguages: string[];
  stream: {
    streamLink: string | null;
    file: string | null;
    type: 'hls' | 'mp4' | 'embed';
  };
  streams: AnimeWorldStreamItem[];
  error?: string;
}

export interface AniZipMappings {
  anilistId?: number | null;
  malId?: number | null;
  anidbId?: number | null;
  thetvdbId?: number | null;
  kitsuId?: number | null;
  imdbId?: string | null;
  themoviedbId?: string | null;
}

export interface AniZipEpisodeMeta {
  episodeNumber: number;
  absoluteEpisodeNumber?: number;
  seasonNumber?: number;
  title: string;
  nativeTitle?: string;
  romajiTitle?: string;
  overview?: string;
  image?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  rating?: string | null;
}

export interface AniZipResponse {
  found: boolean;
  anilistId: number;
  mappings: AniZipMappings;
  episodeCount: number;
  episodes: Record<string, AniZipEpisodeMeta>;
  error?: string;
}

export interface AniSkipResponse {
  found: boolean;
  malId: number;
  episodeNumber: number;
  intro?: SkipInterval;
  outro?: SkipInterval;
  recap?: SkipInterval;
  skipTimes: SkipInterval[];
}

export type ExtensionCompatibility =
  | 'adapted'
  | 'android-runtime-required'
  | 'manga-incompatible';

export interface ExtensionSourceEntry {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
}

export interface ExtensionRepoItem {
  id: string;
  repoType: 'aniyomi' | 'tachiyomi';
  repoLabel: string;
  name: string;
  pkg: string;
  apk: string;
  lang: string;
  code: number;
  version: string;
  nsfw: boolean;
  sources: ExtensionSourceEntry[];
  compatibility: ExtensionCompatibility;
  compatible: boolean;
  adapterServer?: string;
  limitationReason: string;
}

export interface ExtensionRepoSummary {
  id: 'aniyomi' | 'tachiyomi';
  name: string;
  url: string;
  status: 'ok' | 'error';
  totalCount: number;
  compatibleCount: number;
  error?: string;
}

export interface ExtensionsCatalogResponse {
  repositories: ExtensionRepoSummary[];
  extensions: ExtensionRepoItem[];
  fetchedAt: string;
}

export interface LibraryAnimeItem {
  animeId: number;
  title: string;
  coverImage: string;
  format?: string;
  episodes?: number;
  averageScore?: number;
  addedAt: number;
}

export interface WatchHistoryItem {
  animeId: number;
  title: string;
  coverImage: string;
  episodeId: string;
  episodeNumber: number;
  episodeTitle?: string;
  progressSeconds: number;
  durationSeconds: number;
  audioMode: 'sub' | 'dub' | 'hindi';
  updatedAt: number;
}

export type ThemeId =
  | 'midnight-purple'
  | 'deep-black'
  | 'ocean-blue'
  | 'crimson-red'
  | 'emerald-green'
  | 'rose-pink'
  | 'amoled-black';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  tagline: string;
  previewColor: string;
  accentFrom: string;
  accentTo: string;
  glowColor: string;
  bgDark: string;
  surfaceDark: string;
  description: string;
  contrastRatio: string;
}

export type AchievementId =
  | 'first_episode'
  | 'beginner'
  | 'lover'
  | 'master'
  | 'binge_watcher'
  | 'legendary';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'purple';

export interface AchievementBadge {
  id: AchievementId;
  title: string;
  description: string;
  targetCount: number;
  tier: BadgeTier;
  iconName: string;
  badgeLabel: string;
}

export interface StreakMilestone {
  days: number;
  title: string;
  rewardBadge: string;
  unlocked: boolean;
}

export interface UserWatchStats {
  theme?: ThemeId;
  streakCurrent: number;
  streakLongest: number;
  streakLastWatchedDate?: string;
  streakWatchedDays: string[];
  totalEpisodesCompleted: number;
  todayEpisodesCompleted: number;
  todayCompletedDate?: string;
  unlockedAchievements: string[];
}

export interface UserPreferences {
  displayName: string;
  photoURL?: string;
  preferredAudio: 'sub' | 'dub' | 'hindi';
  autoNext: boolean;
  theme?: ThemeId;
}

export interface AnimeCharacterAvatar {
  id: number;
  name: string;
  nativeName?: string | null;
  imageUrl: string;
  mediumImageUrl?: string | null;
  seriesTitle: string;
  role?: string | null;
  favourites?: number | null;
}

export type BannerFrequency =
  | 'once_per_session'
  | 'once_per_day'
  | 'once_per_user'
  | 'always_on_launch';

export interface PopupBanner {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  buttonText?: string;
  destinationUrl?: string;
  openInNewTab: boolean;
  enabled: boolean;
  startAt?: string;
  expiresAt?: string;
  frequency: BannerFrequency;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PopupBannerInput {
  title: string;
  description: string;
  imageUrl: string;
  buttonText?: string;
  destinationUrl?: string;
  openInNewTab: boolean;
  enabled: boolean;
  startAt?: string;
  expiresAt?: string;
  frequency: BannerFrequency;
}

export interface DailyTrafficPoint {
  date: string;
  visits: number;
  activeUsers: number;
  registeredActive: number;
}

export interface AdminServerStats {
  currentlyOnlineUsers: number;
  onlineRegisteredUsers: number;
  onlineGuestUsers: number;
  usersActiveToday: number;
  registeredActiveToday: number;
  guestActiveToday: number;
  totalWebsiteVisits: number;
  visitsToday: number;
  totalUniqueVisitors: number;
  dailySeries: DailyTrafficPoint[];
  updatedAt: string;
}

export interface RegisteredUsersStats {
  totalRegisteredUsers: number;
  totalActiveRegisteredUsers: number;
  registeredActiveToday: number;
  registeredLast7Days: number;
}

