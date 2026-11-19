// server.ts
import "dotenv/config";
import express from "express";
import * as cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { cert, getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var isVercelRuntime = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME
);
var AUTHORIZED_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "amd712785@gmail.com").trim();
function resolveWritableDataDir() {
  const candidates = isVercelRuntime ? [path.join(os.tmpdir(), "kurostream-data")] : [path.resolve(__dirname, ".kurostream-data"), path.join(os.tmpdir(), "kurostream-data")];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(path.join(dir, "uploads", "banners"), { recursive: true });
      return dir;
    } catch {
    }
  }
  return path.join(os.tmpdir(), "kurostream-data");
}
var DATA_DIR = resolveWritableDataDir();
var BANNER_UPLOADS_DIR = path.join(DATA_DIR, "uploads", "banners");
var ANALYTICS_FILE_PATH = path.join(DATA_DIR, "analytics.json");
function loadFirebaseAppletConfig() {
  const envJson = process.env.FIREBASE_CONFIG_JSON;
  if (envJson && envJson.trim()) {
    try {
      const parsed = JSON.parse(envJson);
      if (parsed.projectId && parsed.apiKey) {
        return {
          projectId: parsed.projectId,
          apiKey: parsed.apiKey,
          firestoreDatabaseId: parsed.firestoreDatabaseId || "(default)"
        };
      }
    } catch {
    }
  }
  const candidatePaths = [
    path.resolve(__dirname, "firebase-applet-config.json"),
    path.resolve(process.cwd(), "firebase-applet-config.json")
  ];
  for (const configPath of candidatePaths) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.projectId && parsed.apiKey) {
        return {
          projectId: parsed.projectId,
          apiKey: parsed.apiKey,
          firestoreDatabaseId: parsed.firestoreDatabaseId || "(default)"
        };
      }
    } catch {
    }
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_WEB_API_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      apiKey: process.env.FIREBASE_WEB_API_KEY,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || "(default)"
    };
  }
  return null;
}
var FIREBASE_CONFIG = loadFirebaseAppletConfig();
if (getApps().length === 0 && FIREBASE_CONFIG?.projectId) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson && serviceAccountJson.trim()) {
      const sa = JSON.parse(serviceAccountJson);
      initAdminApp({
        credential: cert(sa),
        projectId: FIREBASE_CONFIG.projectId
      });
    } else {
      initAdminApp({
        projectId: FIREBASE_CONFIG.projectId
      });
    }
  } catch {
  }
}
function getTodayDateKey() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function sanitizeIdToken(val, maxLen = 128) {
  if (typeof val !== "string") return "";
  const trimmed = val.trim().slice(0, maxLen);
  return /^[a-zA-Z0-9_.\-:]+$/.test(trimmed) ? trimmed : "";
}
function loadAnalyticsStore() {
  try {
    if (fs.existsSync(ANALYTICS_FILE_PATH)) {
      const raw = fs.readFileSync(ANALYTICS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      return {
        totalWebsiteVisits: typeof parsed.totalWebsiteVisits === "number" && parsed.totalWebsiteVisits >= 0 ? parsed.totalWebsiteVisits : 0,
        knownClientIds: Array.isArray(parsed.knownClientIds) ? parsed.knownClientIds : [],
        daily: parsed.daily && typeof parsed.daily === "object" ? parsed.daily : {}
      };
    }
  } catch {
  }
  return {
    totalWebsiteVisits: 0,
    knownClientIds: [],
    daily: {}
  };
}
var analyticsStore = loadAnalyticsStore();
var knownClientsSet = new Set(analyticsStore.knownClientIds);
var activePresenceSessions = /* @__PURE__ */ new Map();
var seenVisitSessions = /* @__PURE__ */ new Map();
var analyticsPersistTimer = null;
function scheduleAnalyticsPersist() {
  if (analyticsPersistTimer || isVercelRuntime) return;
  analyticsPersistTimer = setTimeout(() => {
    analyticsPersistTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      analyticsStore.knownClientIds = Array.from(knownClientsSet).slice(-5e4);
      const keys = Object.keys(analyticsStore.daily).sort();
      if (keys.length > 90) {
        for (const oldKey of keys.slice(0, keys.length - 90)) {
          delete analyticsStore.daily[oldKey];
        }
      }
      const tmpPath = `${ANALYTICS_FILE_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(analyticsStore, null, 2), "utf8");
      fs.renameSync(tmpPath, ANALYTICS_FILE_PATH);
    } catch (err) {
      console.error("Failed to persist analytics store:", err);
    }
  }, 1e3);
}
function getOrCreateDailyBucket(dateKey) {
  if (!analyticsStore.daily[dateKey]) {
    analyticsStore.daily[dateKey] = {
      date: dateKey,
      visits: 0,
      activeClientIds: [],
      activeUserIds: [],
      guestClientIds: []
    };
  }
  const bucket = analyticsStore.daily[dateKey];
  if (!Array.isArray(bucket.activeClientIds)) bucket.activeClientIds = [];
  if (!Array.isArray(bucket.activeUserIds)) bucket.activeUserIds = [];
  if (!Array.isArray(bucket.guestClientIds)) bucket.guestClientIds = [];
  return bucket;
}
function recordActorActivity(clientId, uid) {
  const today = getTodayDateKey();
  const bucket = getOrCreateDailyBucket(today);
  if (clientId) {
    knownClientsSet.add(clientId);
    if (!bucket.activeClientIds.includes(clientId)) {
      bucket.activeClientIds.push(clientId);
    }
  }
  if (uid) {
    if (!bucket.activeUserIds.includes(uid)) {
      bucket.activeUserIds.push(uid);
    }
    if (clientId) {
      bucket.guestClientIds = bucket.guestClientIds.filter((c) => c !== clientId);
    }
  } else if (clientId && !bucket.guestClientIds.includes(clientId)) {
    bucket.guestClientIds.push(clientId);
  }
}
function pruneStalePresence(now = Date.now()) {
  const active = [];
  for (const [sid, sess] of activePresenceSessions.entries()) {
    if (now - sess.lastSeen > 75e3) {
      activePresenceSessions.delete(sid);
    } else {
      active.push(sess);
    }
  }
  for (const [sid, ts] of seenVisitSessions.entries()) {
    if (now - ts > 12 * 60 * 60 * 1e3) {
      seenVisitSessions.delete(sid);
    }
  }
  return active;
}
async function verifyAdminRequest(req) {
  if (!FIREBASE_CONFIG) {
    return { ok: false, status: 503, error: "Firebase configuration is unavailable on server." };
  }
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return { ok: false, status: 401, error: "Missing Authorization Bearer token." };
  }
  const idToken = match[1].trim();
  let verifiedEmail;
  let verifiedUid;
  let isEmailVerified = false;
  if (getApps().length > 0) {
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      verifiedEmail = decoded.email;
      verifiedUid = decoded.uid;
      isEmailVerified = decoded.email_verified === true;
    } catch {
    }
  }
  if (!verifiedEmail) {
    try {
      const lookupRes = await fetchWithTimeout(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        },
        6e3
      );
      if (!lookupRes.ok) {
        return { ok: false, status: 401, error: "Invalid or expired authentication token." };
      }
      const lookupData = await lookupRes.json();
      const account = lookupData.users?.[0];
      verifiedEmail = account?.email;
      verifiedUid = account?.localId;
      isEmailVerified = account?.emailVerified === true;
    } catch (err) {
      return {
        ok: false,
        status: 500,
        error: err instanceof Error ? err.message : "Failed to verify administrator credentials."
      };
    }
  }
  if (!verifiedUid || !verifiedEmail || !isEmailVerified) {
    return { ok: false, status: 403, error: "Verified email authentication is required." };
  }
  const normalizedEmail = verifiedEmail.toLowerCase();
  if (normalizedEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: "Access denied: Only amd712785@gmail.com is authorized as administrator."
    };
  }
  if (getApps().length > 0) {
    try {
      const adminAuth = getAdminAuth();
      const userRec = await adminAuth.getUser(verifiedUid);
      if (!userRec.customClaims?.admin) {
        await adminAuth.setCustomUserClaims(verifiedUid, { admin: true });
      }
    } catch {
    }
  }
  return { ok: true, status: 200, uid: verifiedUid, email: verifiedEmail };
}
function detectVerifiedImageFormat(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10) {
    return { mime: "image/png", ext: ".png" };
  }
  const header6 = buffer.subarray(0, 6).toString("ascii");
  if (header6 === "GIF87a" || header6 === "GIF89a") {
    return { mime: "image/gif", ext: ".gif" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mime: "image/webp", ext: ".webp" };
  }
  return null;
}
var PORT = Number(process.env.PORT || 3e3);
var DEFAULT_STREAMING_API = (process.env.VITE_STREAMING_API_BASE || "https://ashanime-api.vercel.app").replace(/\/+$/, "");
var ANILIST_API_URL = process.env.VITE_ANILIST_API_URL || "https://graphql.anilist.co";
var ANIYOMI_REPO_URL = "https://gitea.k3vinb5.dev/Backups/kohi-den-extensions/raw/branch/main/index.min.json";
var TACHIYOMI_REPO_URL = "https://gitea.k3vinb5.dev/Backups/keiyoushi-extensions/raw/branch/repo/index.min.json";
var ANIZIP_API_URL = "https://api.ani.zip/mappings";
var ANISKIP_API_URL = "https://api.aniskip.com/v2/skip-times";
var ANIMEWORLD_UPSTREAM = (process.env.ANIMEWORLD_UPSTREAM_URL || "https://animesky.app").replace(/\/+$/, "");
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
var aniZipCache = /* @__PURE__ */ new Map();
var aniSkipCache = /* @__PURE__ */ new Map();
var primaryUnavailableCache = /* @__PURE__ */ new Map();
var extensionsCache = null;
function normalizeUrl(raw) {
  return raw.trim().replace(/^https:\/{3,}/i, "https://").replace(/^http:\/{3,}/i, "http://");
}
function isBlockedPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    return true;
  }
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}
function convertSrtToVtt(srt) {
  const cleaned = srt.replace(/\r+/g, "").trim();
  const converted = cleaned.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    "$1.$2 --> $3.$4"
  );
  return `WEBVTT

${converted}
`;
}
async function fetchWithTimeout(url, init = {}, timeoutMs = 7e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
async function resolveMalIdFromAnilist(anilistId) {
  if (!Number.isFinite(anilistId) || anilistId <= 0) return null;
  try {
    const res = await fetchWithTimeout(
      ANILIST_API_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: `query ($id: Int) { Media(id: $id, type: ANIME) { id idMal } }`,
          variables: { id: anilistId }
        })
      },
      5e3
    );
    if (!res.ok) return null;
    const json = await res.json();
    const idMal = json.data?.Media?.idMal;
    return typeof idMal === "number" && idMal > 0 ? idMal : null;
  } catch {
    return null;
  }
}
async function verifyStreamPlaylistReachable(url, referer, timeoutMs = 3500) {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Referer: referer,
          "User-Agent": BROWSER_UA,
          Accept: "*/*"
        }
      },
      timeoutMs
    );
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (url.toLowerCase().includes(".m3u8") || ct.includes("mpegurl")) {
      const text = await res.text();
      return text.includes("#EXTM3U");
    }
    return true;
  } catch {
    return false;
  }
}
async function fetchAniZipMetadata(anilistId) {
  const cached = aniZipCache.get(anilistId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  try {
    const res = await fetchWithTimeout(
      `${ANIZIP_API_URL}?anilist_id=${encodeURIComponent(String(anilistId))}`,
      { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
      6500
    );
    if (!res.ok) {
      return {
        found: false,
        anilistId,
        mappings: {},
        episodeCount: 0,
        episodes: {},
        error: `AniZip returned HTTP ${res.status}`
      };
    }
    const raw = await res.json();
    const rawMappings = raw.mappings || {};
    const mappings = {
      anilistId: typeof rawMappings.anilist_id === "number" ? rawMappings.anilist_id : anilistId,
      malId: typeof rawMappings.mal_id === "number" ? rawMappings.mal_id : null,
      anidbId: typeof rawMappings.anidb_id === "number" ? rawMappings.anidb_id : null,
      thetvdbId: typeof rawMappings.thetvdb_id === "number" ? rawMappings.thetvdb_id : null,
      kitsuId: typeof rawMappings.kitsu_id === "number" ? rawMappings.kitsu_id : null,
      imdbId: typeof rawMappings.imdb_id === "string" ? rawMappings.imdb_id : null,
      themoviedbId: rawMappings.themoviedb_id !== void 0 && rawMappings.themoviedb_id !== null ? String(rawMappings.themoviedb_id) : null
    };
    const episodes = {};
    const rawEpisodes = raw.episodes || {};
    for (const [key, epObj] of Object.entries(rawEpisodes)) {
      if (!/^\d+$/.test(key) || !epObj || typeof epObj !== "object") continue;
      const epNum = Number(key);
      if (!Number.isFinite(epNum) || epNum <= 0) continue;
      const titleObj = epObj.title && typeof epObj.title === "object" ? epObj.title : {};
      const preferredTitle = titleObj.en || titleObj["x-jat"] || titleObj.ja || `Episode ${epNum}`;
      episodes[String(epNum)] = {
        episodeNumber: epNum,
        absoluteEpisodeNumber: typeof epObj.absoluteEpisodeNumber === "number" ? epObj.absoluteEpisodeNumber : void 0,
        seasonNumber: typeof epObj.seasonNumber === "number" ? epObj.seasonNumber : void 0,
        title: preferredTitle,
        nativeTitle: titleObj.ja || void 0,
        romajiTitle: titleObj["x-jat"] || void 0,
        overview: typeof epObj.overview === "string" ? epObj.overview : typeof epObj.summary === "string" ? epObj.summary : void 0,
        image: typeof epObj.image === "string" ? epObj.image : null,
        airDate: typeof epObj.airDate === "string" ? epObj.airDate : typeof epObj.airdate === "string" ? epObj.airdate : null,
        runtime: typeof epObj.runtime === "number" ? epObj.runtime : typeof epObj.length === "number" ? epObj.length : null,
        rating: typeof epObj.rating === "string" ? epObj.rating : null
      };
    }
    const normalized = {
      found: Object.keys(episodes).length > 0 || Boolean(mappings.malId),
      anilistId,
      mappings,
      episodeCount: typeof raw.episodeCount === "number" ? raw.episodeCount : Object.keys(episodes).length,
      episodes
    };
    aniZipCache.set(anilistId, {
      expiresAt: Date.now() + 30 * 60 * 1e3,
      data: normalized
    });
    return normalized;
  } catch (err) {
    return {
      found: false,
      anilistId,
      mappings: {},
      episodeCount: 0,
      episodes: {},
      error: err instanceof Error ? err.message : "Failed to query AniZip."
    };
  }
}
async function fetchAniSkipTimestamps(malId, episodeNumber, episodeLength = 0) {
  const cacheKey = `${malId}:${episodeNumber}`;
  const cached = aniSkipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  try {
    const url = `${ANISKIP_API_URL}/${malId}/${episodeNumber}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=${Math.max(
      0,
      Math.floor(episodeLength)
    )}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
      5e3
    );
    if (!res.ok) {
      const empty = { found: false, malId, episodeNumber, skipTimes: [] };
      aniSkipCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1e3, data: empty });
      return empty;
    }
    const json = await res.json();
    const skipTimes = [];
    for (const item of json.results || []) {
      const start = item.interval?.startTime;
      const end = item.interval?.endTime;
      const type = item.skipType || "op";
      if (typeof start === "number" && typeof end === "number" && end > start) {
        skipTimes.push({ start, end, type, source: "aniskip" });
      }
    }
    const intro = skipTimes.find((s) => s.type === "op") || skipTimes.find((s) => s.type === "mixed-op");
    const outro = skipTimes.find((s) => s.type === "ed") || skipTimes.find((s) => s.type === "mixed-ed");
    const recap = skipTimes.find((s) => s.type === "recap");
    const payload = {
      found: skipTimes.length > 0,
      malId,
      episodeNumber,
      intro,
      outro,
      recap,
      skipTimes
    };
    aniSkipCache.set(cacheKey, {
      expiresAt: Date.now() + 30 * 60 * 1e3,
      data: payload
    });
    return payload;
  } catch {
    return { found: false, malId, episodeNumber, skipTimes: [] };
  }
}
var ADAPTED_ANIYOMI_SOURCES = {
  "eu.kanade.tachiyomi.animeextension.en.zoro": {
    server: "vidstreaming",
    note: "Backend Node.js adapter enabled (HiAnime/Zoro \u2192 Vidstreaming/Megacloud HLS stream)."
  },
  "eu.kanade.tachiyomi.animeextension.en.aniwatch": {
    server: "megacloud",
    note: "Backend Node.js adapter enabled (AniWatch \u2192 Megacloud/Vidstreaming HLS stream)."
  },
  "eu.kanade.tachiyomi.animeextension.en.kaido": {
    server: "vidstreaming",
    note: "Backend Node.js adapter enabled (Kaido \u2192 Vidstreaming/Megacloud HLS stream)."
  },
  "eu.kanade.tachiyomi.animeextension.en.animepahe": {
    server: "streamsb",
    note: "Backend Node.js adapter enabled (AnimePahe \u2192 Streamsb/Megacloud HLS fallback)."
  },
  "eu.kanade.tachiyomi.animeextension.all.animeonsen": {
    server: "vidstreaming",
    note: "Backend Node.js adapter enabled (AnimeOnsen \u2192 Vidstreaming HLS stream)."
  },
  "eu.kanade.tachiyomi.animeextension.all.anizone": {
    server: "megacloud",
    note: "Backend Node.js adapter enabled (AniZone \u2192 Megacloud HLS stream)."
  }
};
async function fetchExtensionsCatalog() {
  if (extensionsCache && extensionsCache.expiresAt > Date.now()) {
    return extensionsCache.data;
  }
  const [aniyomiResult, tachiyomiResult] = await Promise.allSettled([
    fetchWithTimeout(
      ANIYOMI_REPO_URL,
      { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
      1e4
    ).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }),
    fetchWithTimeout(
      TACHIYOMI_REPO_URL,
      { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
      1e4
    ).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    })
  ]);
  const extensions = [];
  const mapAniyomi = (items) => {
    let compatCount = 0;
    for (const item of items) {
      const pkg = String(item.pkg || "");
      const adapter = ADAPTED_ANIYOMI_SOURCES[pkg];
      const compatible = Boolean(adapter);
      if (compatible) compatCount += 1;
      extensions.push({
        id: `aniyomi:${pkg || item.name}`,
        repoType: "aniyomi",
        repoLabel: "Aniyomi (Kohi-den)",
        name: String(item.name || "Unknown Aniyomi Extension").replace(/^Aniyomi:\s*/i, ""),
        pkg,
        apk: String(item.apk || ""),
        lang: String(item.lang || "all"),
        code: Number(item.code || 0),
        version: String(item.version || "0.0"),
        nsfw: Number(item.nsfw || 0) === 1,
        sources: Array.isArray(item.sources) ? item.sources.map((s) => ({
          id: String(s.id || ""),
          name: String(s.name || ""),
          lang: String(s.lang || item.lang || "all"),
          baseUrl: String(s.baseUrl || "")
        })) : [],
        compatibility: compatible ? "adapted" : "android-runtime-required",
        compatible,
        adapterServer: adapter?.server,
        limitationReason: adapter ? adapter.note : "Requires Android Aniyomi runtime (.apk); Dalvik/JVM extractors cannot execute directly in a web browser."
      });
    }
    return compatCount;
  };
  const mapTachiyomi = (items) => {
    for (const item of items) {
      const pkg = String(item.pkg || "");
      extensions.push({
        id: `tachiyomi:${pkg || item.name}`,
        repoType: "tachiyomi",
        repoLabel: "Tachiyomi (Keiyoushi)",
        name: String(item.name || "Unknown Tachiyomi Extension"),
        pkg,
        apk: String(item.apk || ""),
        lang: String(item.lang || "all"),
        code: Number(item.code || 0),
        version: String(item.version || "0.0"),
        nsfw: Number(item.nsfw || 0) === 1,
        sources: Array.isArray(item.sources) ? item.sources.map((s) => ({
          id: String(s.id || ""),
          name: String(s.name || ""),
          lang: String(s.lang || item.lang || "all"),
          baseUrl: String(s.baseUrl || "")
        })) : [],
        compatibility: "manga-incompatible",
        compatible: false,
        limitationReason: "Tachiyomi/Mihon Android manga extension (.apk); incompatible with browser anime video streaming."
      });
    }
  };
  const aniyomiItems = aniyomiResult.status === "fulfilled" && Array.isArray(aniyomiResult.value) ? aniyomiResult.value : [];
  const tachiyomiItems = tachiyomiResult.status === "fulfilled" && Array.isArray(tachiyomiResult.value) ? tachiyomiResult.value : [];
  const aniyomiCompatCount = mapAniyomi(aniyomiItems);
  mapTachiyomi(tachiyomiItems);
  extensions.sort((a, b) => {
    if (Boolean(a.compatible) !== Boolean(b.compatible)) {
      return a.compatible ? -1 : 1;
    }
    return String(a.name).localeCompare(String(b.name));
  });
  const payload = {
    repositories: [
      {
        id: "aniyomi",
        name: "Aniyomi Extensions (Kohi-den)",
        url: ANIYOMI_REPO_URL,
        status: aniyomiResult.status === "fulfilled" ? "ok" : "error",
        totalCount: aniyomiItems.length,
        compatibleCount: aniyomiCompatCount,
        error: aniyomiResult.status === "rejected" ? aniyomiResult.reason instanceof Error ? aniyomiResult.reason.message : "Failed to load Aniyomi repository" : void 0
      },
      {
        id: "tachiyomi",
        name: "Tachiyomi Extensions (Keiyoushi)",
        url: TACHIYOMI_REPO_URL,
        status: tachiyomiResult.status === "fulfilled" ? "ok" : "error",
        totalCount: tachiyomiItems.length,
        compatibleCount: 0,
        error: tachiyomiResult.status === "rejected" ? tachiyomiResult.reason instanceof Error ? tachiyomiResult.reason.message : "Failed to load Tachiyomi repository" : void 0
      }
    ],
    extensions,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  extensionsCache = {
    expiresAt: Date.now() + 15 * 60 * 1e3,
    data: payload
  };
  return payload;
}
function normalizeAnimeWorldImg(src) {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:image/svg")) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}
function extractSlugFromHref(href, segment) {
  if (!href) return null;
  const match = href.match(new RegExp(`/${segment}/([^/?#]+)`, "i"));
  return match ? match[1].trim() : null;
}
function parseAnimeWorldCards($, root) {
  const container = root || $.root();
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  container.find("article.tr-movie-card").each((_, el) => {
    const card = $(el);
    const linkEl = card.find("a.tr-movie-link").first();
    const href = linkEl.attr("href") || "";
    const seriesId = extractSlugFromHref(href, "series");
    const movieId = extractSlugFromHref(href, "movies") || extractSlugFromHref(href, "movie");
    const idKey = seriesId ? `series:${seriesId}` : movieId ? `movie:${movieId}` : "";
    if (!idKey || seen.has(idKey)) return;
    seen.add(idKey);
    const imgEl = card.find("img").first();
    const imgRaw = imgEl.attr("data-src") || imgEl.attr("src");
    const title = card.find(".tr-movie-title, h3, h2").first().text().trim();
    const year = card.find(".year, .tr-year").first().text().trim() || null;
    const rating = card.find(".vote, .tr-rating").first().text().trim() || null;
    if (!title) return;
    items.push({
      title,
      image: normalizeAnimeWorldImg(imgRaw),
      year,
      rating,
      type: seriesId ? "series" : "movie",
      ...seriesId ? { seriesId } : {},
      ...movieId ? { movieId } : {}
    });
  });
  if (items.length === 0) {
    container.find("ul.post-lst li.status-publish").each((_, el) => {
      const li = $(el);
      const href = li.find("a.lnk-blk").first().attr("href") || "";
      const seriesId = extractSlugFromHref(href, "series");
      const movieId = extractSlugFromHref(href, "movies") || extractSlugFromHref(href, "movie");
      const idKey = seriesId ? `series:${seriesId}` : movieId ? `movie:${movieId}` : "";
      if (!idKey || seen.has(idKey)) return;
      seen.add(idKey);
      const imgEl = li.find("img").first();
      const imgRaw = imgEl.attr("data-src") || imgEl.attr("src");
      const title = li.find("h2.entry-title, h3").first().text().trim();
      const year = li.find("span.year").first().text().trim() || null;
      const rating = li.find("span.vote").first().text().trim() || null;
      if (!title) return;
      items.push({
        title,
        image: normalizeAnimeWorldImg(imgRaw),
        year,
        rating,
        type: seriesId ? "series" : "movie",
        ...seriesId ? { seriesId } : {},
        ...movieId ? { movieId } : {}
      });
    });
  }
  return items;
}
function classifyAnimeWorldStreamType(url) {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (/\.(mp4|webm|mkv)(\?|$)/i.test(lower)) return "mp4";
  return "embed";
}
async function fetchAnimeWorldHtml(url) {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Referer: `${ANIMEWORLD_UPSTREAM}/`,
          Origin: ANIMEWORLD_UPSTREAM,
          "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1"
        }
      },
      8e3
    );
    const cfMitigated = (res.headers.get("cf-mitigated") || "").toLowerCase();
    const serverHeader = (res.headers.get("server") || "").toLowerCase();
    const blockedByUpstream = res.status === 403 && (cfMitigated.includes("challenge") || serverHeader.includes("cloudflare"));
    const html = res.ok ? await res.text() : "";
    if (!res.ok) {
      console.warn(
        `[AnimeWorld Diagnostic] Upstream request failed: URL=${url}, Status=${res.status} ${res.statusText}${blockedByUpstream ? " (Cloudflare challenge)" : ""}`
      );
    }
    return { ok: res.ok, status: res.status, html, blockedByUpstream };
  } catch (err) {
    console.error(
      `[AnimeWorld Diagnostic] Upstream fetch error: URL=${url}, Error=${err instanceof Error ? err.message : String(err)}`
    );
    return { ok: false, status: 502, html: "" };
  }
}
function formatAnimeWorldUpstreamError(status, blockedByUpstream, context = "request") {
  if (status === 403 || blockedByUpstream) {
    return `AnimeWorld India upstream (${ANIMEWORLD_UPSTREAM}) returned HTTP 403 (server/datacenter IP blocked by upstream Cloudflare protection). Switch to Vidstreaming, Megacloud, or Streamsb for playback.`;
  }
  return `AnimeWorld India ${context} returned HTTP ${status || 502}`;
}
async function verifyRavokAudioLanguages(ravokUrl) {
  try {
    const res = await fetchWithTimeout(
      ravokUrl,
      {
        headers: {
          Referer: `${ANIMEWORLD_UPSTREAM}/`,
          "User-Agent": BROWSER_UA,
          Accept: "text/html,*/*"
        }
      },
      4500
    );
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var\s+defaultAudio\s*=\s*(\[[^\]]+\])/);
    if (match) {
      const codes = JSON.parse(match[1]);
      const codeMap = {
        hin: "Hindi",
        eng: "English",
        jpn: "Japanese",
        tam: "Tamil",
        tel: "Telugu",
        ben: "Bengali",
        mal: "Malayalam",
        mar: "Marathi",
        kan: "Kannada",
        kor: "Korean"
      };
      return codes.map((c) => codeMap[c.toLowerCase()]).filter((x) => Boolean(x));
    }
  } catch {
  }
  return [];
}
function isValidHttpUrl(raw) {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
function logProviderDiagnostic(provider, stage, meta) {
  const safeParts = Object.entries(meta).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
  console.info(`[ProviderDiag] provider=${provider} stage=${stage} ${safeParts}`);
}
async function resolveFromMegavid(malId, episodeNumber, category, requestedServer) {
  const catToUse = category === "hindi" ? "dub" : category;
  const refererUrl = `https://megavid.buzz/mal/${malId}/${episodeNumber}/${catToUse}`;
  const baseSourceUrl = `${refererUrl}/source`;
  const serverLower = requestedServer.toLowerCase();
  const candidateQueries = serverLower === "streamsb" || serverLower.includes("animepahe") ? [
    { qs: "axsv=sora", label: "Streamsb" },
    { qs: "noax=1", label: "Megacloud" }
  ] : serverLower === "vidstreaming" || serverLower.includes("hianime") || serverLower.includes("zoro") || serverLower.includes("kaido") || serverLower.includes("animeonsen") ? [
    { qs: "noax=1", label: "Vidstreaming" },
    { qs: "axsv=yuki", label: "Vidstreaming" }
  ] : [
    { qs: "noax=1", label: "Megacloud" },
    { qs: "axsv=nero", label: "Megacloud" }
  ];
  let lastMessage = "Stream not available for this episode.";
  let lastStatus = 404;
  for (const candidate of candidateQueries) {
    const started = Date.now();
    try {
      const targetUrl = `${baseSourceUrl}?${candidate.qs}`;
      const res = await fetchWithTimeout(
        targetUrl,
        {
          headers: {
            Referer: refererUrl,
            "User-Agent": BROWSER_UA,
            Accept: "application/json"
          }
        },
        4500
      );
      if (!res.ok) {
        lastStatus = res.status;
        lastMessage = `Upstream stream endpoint returned HTTP ${res.status}.`;
        logProviderDiagnostic("megavid", "source", {
          server: requestedServer,
          candidate: candidate.qs,
          status: res.status,
          latencyMs: Date.now() - started,
          working: false
        });
        continue;
      }
      const data = await res.json();
      if (data.status !== "ok" || !data.source) {
        lastStatus = typeof data.code === "number" ? data.code : 404;
        lastMessage = typeof data.message === "string" && data.message.trim() ? data.message.trim() : "Episode stream not found on provider.";
        logProviderDiagnostic("megavid", "source", {
          server: requestedServer,
          candidate: candidate.qs,
          status: lastStatus,
          apiStatus: data.status || "missing",
          latencyMs: Date.now() - started,
          working: false
        });
        continue;
      }
      const cleanSourceUrl = normalizeUrl(data.source);
      if (!isValidHttpUrl(cleanSourceUrl)) {
        lastStatus = 502;
        lastMessage = "Provider returned a malformed stream URL.";
        continue;
      }
      const isReachable = await verifyStreamPlaylistReachable(cleanSourceUrl, "https://megavid.buzz/", 3e3);
      let sourceHost = "";
      try {
        sourceHost = new URL(cleanSourceUrl).hostname;
      } catch {
      }
      logProviderDiagnostic("megavid", "playlist-verify", {
        server: requestedServer,
        candidate: candidate.qs,
        host: sourceHost,
        reachable: isReachable,
        latencyMs: Date.now() - started,
        working: isReachable
      });
      if (!isReachable) {
        lastStatus = 502;
        lastMessage = `Stream CDN host (${sourceHost || "unknown"}) is unreachable or returned invalid HLS manifest.`;
        continue;
      }
      const sources = [
        {
          url: cleanSourceUrl,
          quality: `${candidate.label} \xB7 Auto HLS`,
          isM3U8: data.type === "hls" || cleanSourceUrl.includes(".m3u8"),
          type: "hls"
        }
      ];
      try {
        const masterRes = await fetchWithTimeout(
          cleanSourceUrl,
          { headers: { Referer: "https://megavid.buzz/", "User-Agent": BROWSER_UA } },
          3e3
        );
        if (masterRes.ok) {
          const playlistText = await masterRes.text();
          const lines = playlistText.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("#EXT-X-STREAM-INF:")) {
              const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
              const nextLine = (lines[i + 1] || "").trim();
              if (nextLine && !nextLine.startsWith("#")) {
                const variantUrl = new URL(nextLine, cleanSourceUrl).toString();
                sources.push({
                  url: variantUrl,
                  quality: resMatch ? `${resMatch[1]}p` : "HD",
                  isM3U8: true,
                  type: "hls"
                });
              }
            }
          }
        }
      } catch {
      }
      const subtitles = (data.tracks || []).filter((t) => {
        if (typeof t.file !== "string" || !t.file.trim()) return false;
        const kind = (t.kind || "").toLowerCase();
        const fileLower = t.file.toLowerCase();
        if (kind === "thumbnails" || fileLower.includes("thumbnails.vtt")) return false;
        return true;
      }).map((t) => {
        const trackUrl = normalizeUrl(t.file);
        const label = t.label?.trim() || "Subtitles";
        const needsProxy = trackUrl.includes("megavid.buzz/sub/") || trackUrl.toLowerCase().endsWith(".srt") || !trackUrl.includes("cp.megavid.buzz");
        return {
          url: needsProxy ? `/api/anime/proxy?url=${encodeURIComponent(trackUrl)}&referer=${encodeURIComponent(
            "https://megavid.buzz/"
          )}` : trackUrl,
          lang: label,
          label
        };
      });
      const introChapter = (data.chapters || []).find(
        (c) => c.title?.toLowerCase().includes("intro")
      );
      const outroChapter = (data.chapters || []).find(
        (c) => c.title?.toLowerCase().includes("outro")
      );
      return {
        ok: true,
        payload: {
          sources,
          subtitles,
          servers: [
            { name: "animeworld-india" },
            { name: "vidstreaming" },
            { name: "megacloud" },
            { name: "streamsb" }
          ],
          headers: { Referer: "https://megavid.buzz/" },
          hasHindiAudio: false,
          audioLanguages: [catToUse === "dub" ? "English" : "Japanese"],
          intro: typeof introChapter?.start === "number" && typeof introChapter?.end === "number" ? { start: introChapter.start, end: introChapter.end } : void 0,
          outro: typeof outroChapter?.start === "number" && typeof outroChapter?.end === "number" ? { start: outroChapter.start, end: outroChapter.end } : void 0,
          providerMeta: {
            source: "megavid",
            activeServer: requestedServer || "vidstreaming",
            category
          }
        }
      };
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : "Failed to reach streaming resolver.";
    }
  }
  return {
    ok: false,
    statusCode: lastStatus,
    message: lastMessage
  };
}
function createExpressApp() {
  const app2 = express();
  const rawJsonParser = express.json({ limit: "8mb" });
  const jsonParser = (req, res, next) => {
    if (req.body !== void 0 && req.body !== null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      next();
      return;
    }
    if (req.readableEnded) {
      req.body = {};
      next();
      return;
    }
    rawJsonParser(req, res, next);
  };
  app2.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, If-Range");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type"
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app2.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      platform: isVercelRuntime ? "vercel" : "node",
      nodeVersion: process.version,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      providers: {
        consumetBase: DEFAULT_STREAMING_API,
        animeWorldUpstream: ANIMEWORLD_UPSTREAM,
        anilistUrl: ANILIST_API_URL
      },
      firebaseConfigured: Boolean(FIREBASE_CONFIG?.projectId)
    });
  });
  app2.get("/api/streaming/diagnostics", async (req, res) => {
    const malId = Math.max(1, Number(req.query.malId || 20));
    const ep = Math.max(1, Number(req.query.ep || 1));
    const searchQuery = typeof req.query.query === "string" && req.query.query.trim() ? req.query.query.trim() : "naruto";
    const probeUrl = async (name, url, init = {}, timeoutMs = 4500) => {
      const started = Date.now();
      try {
        const response = await fetchWithTimeout(url, init, timeoutMs);
        const latencyMs = Date.now() - started;
        return {
          name,
          url,
          ok: response.ok,
          status: response.status,
          latencyMs,
          response
        };
      } catch (err) {
        return {
          name,
          url,
          ok: false,
          status: 0,
          latencyMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
          response: null
        };
      }
    };
    const [
      consumetRes,
      megavidPrimaryRes,
      megavidSoraRes,
      megavidNeroRes,
      animeWorldRes,
      anilistRes,
      aniZipRes,
      aniSkipRes
    ] = await Promise.all([
      probeUrl(
        "consumet-primary",
        `${DEFAULT_STREAMING_API}/meta/anilist/info/20`,
        { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
        4e3
      ),
      probeUrl(
        "megavid-vidstreaming",
        `https://megavid.buzz/mal/${malId}/${ep}/sub/source?noax=1`,
        {
          headers: {
            Referer: `https://megavid.buzz/mal/${malId}/${ep}/sub`,
            "User-Agent": BROWSER_UA,
            Accept: "application/json"
          }
        },
        4500
      ),
      probeUrl(
        "megavid-streamsb",
        `https://megavid.buzz/mal/${malId}/${ep}/sub/source?axsv=sora`,
        {
          headers: {
            Referer: `https://megavid.buzz/mal/${malId}/${ep}/sub`,
            "User-Agent": BROWSER_UA,
            Accept: "application/json"
          }
        },
        4500
      ),
      probeUrl(
        "megavid-megacloud",
        `https://megavid.buzz/mal/${malId}/${ep}/sub/source?axsv=nero`,
        {
          headers: {
            Referer: `https://megavid.buzz/mal/${malId}/${ep}/sub`,
            "User-Agent": BROWSER_UA,
            Accept: "application/json"
          }
        },
        4500
      ),
      probeUrl(
        "animeworld-india",
        `${ANIMEWORLD_UPSTREAM}/?s=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: `${ANIMEWORLD_UPSTREAM}/`
          }
        },
        5e3
      ),
      probeUrl(
        "anilist",
        ANILIST_API_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: `query ($id: Int) { Media(id: $id, type: ANIME) { id idMal } }`,
            variables: { id: 20 }
          })
        },
        4e3
      ),
      probeUrl(
        "anizip",
        `${ANIZIP_API_URL}?anilist_id=20`,
        { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
        4e3
      ),
      probeUrl(
        "aniskip",
        `${ANISKIP_API_URL}/${malId}/${ep}?types[]=op&episodeLength=0`,
        { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
        4e3
      )
    ]);
    const [vidstreamingResolved, megacloudResolved, streamsbResolved] = await Promise.all([
      resolveFromMegavid(malId, ep, "sub", "vidstreaming"),
      resolveFromMegavid(malId, ep, "sub", "megacloud"),
      resolveFromMegavid(malId, ep, "sub", "streamsb")
    ]);
    const inspectMegavid = async (probe, resolved) => {
      const primaryPayload = resolved.payload;
      const firstSource = primaryPayload?.sources?.[0];
      let resolvedHost = "";
      try {
        if (firstSource?.url) resolvedHost = new URL(firstSource.url).hostname;
      } catch {
      }
      let primaryCandidateHost = "";
      let primaryCandidateReachable = false;
      if (probe.response && probe.ok) {
        try {
          const json = await probe.response.json();
          const candidateUrl = json.source ? normalizeUrl(json.source) : "";
          if (candidateUrl) {
            primaryCandidateHost = new URL(candidateUrl).hostname;
            primaryCandidateReachable = candidateUrl === firstSource?.url ? Boolean(resolved.ok) : await verifyStreamPlaylistReachable(candidateUrl, "https://megavid.buzz/", 2e3);
          }
        } catch {
        }
      }
      return {
        status: resolved.ok ? 200 : resolved.statusCode || probe.status || 502,
        ok: Boolean(resolved.ok && firstSource?.url),
        working: Boolean(resolved.ok && firstSource?.url),
        latencyMs: probe.latencyMs,
        primaryCandidateHost: primaryCandidateHost || void 0,
        primaryCandidateReachable,
        resolvedHost: resolvedHost || void 0,
        verifiedStreamType: firstSource?.type || void 0,
        verifiedQualities: primaryPayload?.sources?.map((s) => s.quality) || [],
        error: resolved.ok ? void 0 : resolved.message || probe.error || `HTTP ${probe.status}`,
        note: resolved.ok && primaryCandidateHost && !primaryCandidateReachable ? `Primary CDN (${primaryCandidateHost}) unreachable; automatically fell back to verified HLS (${resolvedHost}).` : void 0
      };
    };
    const [vidstreamingDiag, streamsbDiag, megacloudDiag] = await Promise.all([
      inspectMegavid(megavidPrimaryRes, vidstreamingResolved),
      inspectMegavid(megavidSoraRes, streamsbResolved),
      inspectMegavid(megavidNeroRes, megacloudResolved)
    ]);
    const consumetVercelErr = consumetRes.response?.headers.get("x-vercel-error") || void 0;
    const awCfMitigated = animeWorldRes.response?.headers.get("cf-mitigated") || void 0;
    let awResultCount = 0;
    let awPlayableVerified = false;
    let awSampleStreamType;
    let awSampleError;
    if (animeWorldRes.response && animeWorldRes.ok) {
      try {
        const html = await animeWorldRes.response.text();
        const $ = cheerio.load(html);
        const cards = parseAnimeWorldCards($);
        awResultCount = cards.length;
        const firstSeries = cards.find((c) => typeof c.seriesId === "string" && c.seriesId);
        if (firstSeries?.seriesId) {
          const seriesHtmlRes = await fetchAnimeWorldHtml(
            `${ANIMEWORLD_UPSTREAM}/series/${encodeURIComponent(String(firstSeries.seriesId))}/`
          );
          if (seriesHtmlRes.ok && seriesHtmlRes.html) {
            const $s = cheerio.load(seriesHtmlRes.html);
            const epHref = $s("article.tr-episode-card a.tr-episode-link").first().attr("href") || "";
            const epSlug = extractSlugFromHref(epHref, "episode");
            if (epSlug) {
              const epHtmlRes = await fetchAnimeWorldHtml(
                `${ANIMEWORLD_UPSTREAM}/episode/${encodeURIComponent(epSlug)}/`
              );
              if (epHtmlRes.ok && epHtmlRes.html) {
                const $e = cheerio.load(epHtmlRes.html);
                const iframeSrc = ($e("#aa-options iframe, .video-player iframe, .video-embed iframe").first().attr("src") || "").trim();
                if (isValidHttpUrl(iframeSrc)) {
                  awPlayableVerified = true;
                  awSampleStreamType = classifyAnimeWorldStreamType(iframeSrc);
                } else {
                  awSampleError = "Episode page had no valid stream/embed URL.";
                }
              } else {
                awSampleError = `Episode fetch returned HTTP ${epHtmlRes.status}`;
              }
            } else {
              awSampleError = "No episode link found on sample series page.";
            }
          } else {
            awSampleError = `Series page returned HTTP ${seriesHtmlRes.status}`;
          }
        }
      } catch (err) {
        awSampleError = err instanceof Error ? err.message : "Failed to verify AnimeWorld sample stream.";
      }
    } else {
      awSampleError = animeWorldRes.status === 403 ? "Upstream Cloudflare WAF blocks server/datacenter IPs with HTTP 403." : animeWorldRes.error || `Upstream returned HTTP ${animeWorldRes.status}`;
    }
    const awWorking = Boolean(animeWorldRes.ok && awResultCount > 0 && awPlayableVerified);
    logProviderDiagnostic("diagnostics", "summary", {
      consumetStatus: consumetRes.status,
      vidstreamingWorking: vidstreamingDiag.working,
      megacloudWorking: megacloudDiag.working,
      streamsbWorking: streamsbDiag.working,
      animeWorldWorking: awWorking,
      animeWorldStatus: animeWorldRes.status
    });
    res.json({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      platform: isVercelRuntime ? "vercel" : "node",
      testParams: { malId, episode: ep, searchQuery },
      providers: {
        consumetPrimary: {
          baseUrl: DEFAULT_STREAMING_API,
          status: consumetRes.status,
          ok: consumetRes.ok,
          working: consumetRes.ok,
          latencyMs: consumetRes.latencyMs,
          upstreamHeaderError: consumetVercelErr,
          note: !consumetRes.ok ? "Consumet primary host is unavailable; KuroStream automatically falls back to Megavid + AniZip + AniSkip." : void 0
        },
        vidstreaming: vidstreamingDiag,
        megacloud: megacloudDiag,
        streamsb: streamsbDiag,
        animeWorldIndia: {
          upstream: ANIMEWORLD_UPSTREAM,
          status: animeWorldRes.status,
          ok: awWorking,
          working: awWorking,
          latencyMs: animeWorldRes.latencyMs,
          parsedCards: awResultCount,
          playableStreamVerified: awPlayableVerified,
          sampleStreamType: awSampleStreamType,
          blockedByCloudflare: animeWorldRes.status === 403 || Boolean(awCfMitigated),
          error: awWorking ? void 0 : awSampleError,
          note: animeWorldRes.status === 403 ? "Upstream Cloudflare WAF blocks server/datacenter IPs with HTTP 403. Other providers remain operational." : void 0
        },
        anilist: {
          status: anilistRes.status,
          ok: anilistRes.ok,
          latencyMs: anilistRes.latencyMs
        },
        anizip: {
          status: aniZipRes.status,
          ok: aniZipRes.ok,
          latencyMs: aniZipRes.latencyMs
        },
        aniskip: {
          status: aniSkipRes.status,
          ok: aniSkipRes.ok,
          latencyMs: aniSkipRes.latencyMs
        }
      }
    });
  });
  app2.post("/api/analytics/visit", jsonParser, (req, res) => {
    const body = req.body || {};
    const sessionId = sanitizeIdToken(body.sessionId, 128);
    const clientId = sanitizeIdToken(body.clientId, 128);
    const uid = sanitizeIdToken(body.uid, 128) || void 0;
    if (!sessionId || !clientId) {
      res.status(400).json({ error: "Missing valid sessionId or clientId." });
      return;
    }
    const now = Date.now();
    const today = getTodayDateKey();
    const bucket = getOrCreateDailyBucket(today);
    let countedNewVisit = false;
    if (!seenVisitSessions.has(sessionId)) {
      seenVisitSessions.set(sessionId, now);
      analyticsStore.totalWebsiteVisits += 1;
      bucket.visits += 1;
      countedNewVisit = true;
    }
    recordActorActivity(clientId, uid);
    activePresenceSessions.set(sessionId, { sessionId, clientId, uid, lastSeen: now });
    scheduleAnalyticsPersist();
    res.json({ ok: true, countedNewVisit });
  });
  app2.post("/api/analytics/heartbeat", jsonParser, (req, res) => {
    const body = req.body || {};
    const sessionId = sanitizeIdToken(body.sessionId, 128);
    const clientId = sanitizeIdToken(body.clientId, 128);
    const uid = sanitizeIdToken(body.uid, 128) || void 0;
    if (!sessionId || !clientId) {
      res.status(400).json({ error: "Missing valid sessionId or clientId." });
      return;
    }
    const now = Date.now();
    activePresenceSessions.set(sessionId, { sessionId, clientId, uid, lastSeen: now });
    recordActorActivity(clientId, uid);
    scheduleAnalyticsPersist();
    res.json({ ok: true, serverTime: now });
  });
  app2.post("/api/analytics/offline", jsonParser, (req, res) => {
    const body = req.body || {};
    const sessionId = sanitizeIdToken(body.sessionId, 128);
    if (sessionId) {
      activePresenceSessions.delete(sessionId);
    }
    res.status(204).end();
  });
  app2.get("/api/admin/stats", async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const activeList = pruneStalePresence();
    const onlineActors = /* @__PURE__ */ new Set();
    const onlineRegisteredUids = /* @__PURE__ */ new Set();
    const onlineGuestClients = /* @__PURE__ */ new Set();
    for (const s of activeList) {
      if (s.uid) {
        onlineActors.add(`u:${s.uid}`);
        onlineRegisteredUids.add(s.uid);
      } else {
        onlineActors.add(`c:${s.clientId}`);
        onlineGuestClients.add(s.clientId);
      }
    }
    const today = getTodayDateKey();
    const todayBucket = getOrCreateDailyBucket(today);
    const dailySeries = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const d = new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
      const bucket = analyticsStore.daily[d];
      const uniqueToday = bucket ? (/* @__PURE__ */ new Set([
        ...(bucket.activeUserIds || []).map((id) => `u:${id}`),
        ...(bucket.guestClientIds || []).map((id) => `c:${id}`)
      ])).size : 0;
      dailySeries.push({
        date: d,
        visits: bucket?.visits || 0,
        activeUsers: uniqueToday,
        registeredActive: bucket?.activeUserIds?.length || 0
      });
    }
    const todayCombinedActors = (/* @__PURE__ */ new Set([
      ...(todayBucket.activeUserIds || []).map((id) => `u:${id}`),
      ...(todayBucket.guestClientIds || []).map((id) => `c:${id}`)
    ])).size;
    res.json({
      currentlyOnlineUsers: onlineActors.size,
      onlineRegisteredUsers: onlineRegisteredUids.size,
      onlineGuestUsers: onlineGuestClients.size,
      usersActiveToday: todayCombinedActors,
      registeredActiveToday: todayBucket.activeUserIds.length,
      guestActiveToday: todayBucket.guestClientIds.length,
      totalWebsiteVisits: analyticsStore.totalWebsiteVisits,
      visitsToday: todayBucket.visits,
      totalUniqueVisitors: knownClientsSet.size,
      dailySeries,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.post("/api/admin/banners/upload", jsonParser, async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const body = req.body || {};
    const rawData = typeof body.dataBase64 === "string" ? body.dataBase64.trim() : "";
    const declaredMime = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    if (!rawData) {
      res.status(400).json({ error: "Missing image data." });
      return;
    }
    const allowedMimes = /* @__PURE__ */ new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
    if (declaredMime && !allowedMimes.has(declaredMime)) {
      res.status(400).json({ error: "Unsupported image format. Allowed: JPG, PNG, WebP, GIF." });
      return;
    }
    const cleanedBase64 = rawData.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    let buffer;
    try {
      buffer = Buffer.from(cleanedBase64, "base64");
    } catch {
      res.status(400).json({ error: "Invalid base64 image payload." });
      return;
    }
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Banner image must be between 1 byte and 5 MB." });
      return;
    }
    const verified = detectVerifiedImageFormat(buffer);
    if (!verified) {
      res.status(400).json({ error: "Invalid or corrupted image binary. Allowed: JPG, PNG, WebP, GIF." });
      return;
    }
    const safeFileName = `banner_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${verified.ext}`;
    const destPath = path.join(BANNER_UPLOADS_DIR, safeFileName);
    try {
      fs.mkdirSync(BANNER_UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(destPath, buffer);
    } catch (err) {
      res.status(507).json({
        error: err instanceof Error ? err.message : "Unable to store banner image on server."
      });
      return;
    }
    res.json({
      imageUrl: `/api/banners/image/${safeFileName}`,
      mimeType: verified.mime,
      size: buffer.length
    });
  });
  app2.get("/api/banners/image/:filename", (req, res) => {
    const filename = String(req.params.filename || "");
    if (!/^[a-zA-Z0-9_\-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
      res.status(400).json({ error: "Invalid banner filename." });
      return;
    }
    const targetPath = path.join(BANNER_UPLOADS_DIR, filename);
    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: "Banner image not found." });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif"
    };
    res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(targetPath).pipe(res);
  });
  app2.delete("/api/admin/banners/image/:filename", async (req, res) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }
    const filename = String(req.params.filename || "");
    if (!/^[a-zA-Z0-9_\-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
      res.status(400).json({ error: "Invalid banner filename." });
      return;
    }
    const targetPath = path.join(BANNER_UPLOADS_DIR, filename);
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch {
    }
    res.json({ ok: true });
  });
  app2.get("/api/extensions/repos", async (_req, res) => {
    try {
      const catalog = await fetchExtensionsCatalog();
      res.json(catalog);
    } catch (err) {
      res.status(502).json({
        repositories: [],
        extensions: [],
        error: err instanceof Error ? err.message : "Failed to load extension repositories."
      });
    }
  });
  app2.get("/api/anime-world-india/v1/home.php", async (_req, res) => {
    try {
      const { ok, status, html, blockedByUpstream } = await fetchAnimeWorldHtml(`${ANIMEWORLD_UPSTREAM}/`);
      if (!ok || !html) {
        res.status(status || 502).json({
          success: false,
          error: formatAnimeWorldUpstreamError(status, blockedByUpstream, "homepage")
        });
        return;
      }
      const $ = cheerio.load(html);
      const allCards = parseAnimeWorldCards($);
      const latest_series = allCards.filter((item) => item.type === "series");
      const latest_movies = allCards.filter((item) => item.type === "movie");
      res.json({
        success: true,
        source: ANIMEWORLD_UPSTREAM,
        latest_series,
        latest_movies
      });
    } catch (err) {
      res.status(502).json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to load AnimeWorld India homepage."
      });
    }
  });
  app2.get("/api/anime-world-india/v1/series.php", async (req, res) => {
    const page = Math.max(1, Number(req.query.p || 1));
    const targetUrl = page > 1 ? `${ANIMEWORLD_UPSTREAM}/series/page/${page}/` : `${ANIMEWORLD_UPSTREAM}/series/`;
    try {
      const { ok, status, html, blockedByUpstream } = await fetchAnimeWorldHtml(targetUrl);
      if (!ok || !html) {
        res.status(status || 404).json({
          success: false,
          error: formatAnimeWorldUpstreamError(status, blockedByUpstream, "series list")
        });
        return;
      }
      const $ = cheerio.load(html);
      const series = parseAnimeWorldCards($).filter((x) => x.seriesId);
      const pages = [];
      $("nav.pagination a.page-numbers, nav.pagination a.page-link, .pagination a").each((_, el) => {
        const num = Number($(el).text().trim());
        if (Number.isFinite(num) && num > 0) pages.push(num);
      });
      const totalPages = pages.length > 0 ? Math.max(...pages, page) : page;
      res.json({
        success: true,
        source: `${ANIMEWORLD_UPSTREAM}/series`,
        current_page: page,
        total_pages: totalPages,
        has_next: page < totalPages || $("a.next").length > 0,
        has_prev: page > 1,
        pages: Array.from(new Set(pages)).sort((a, b) => a - b),
        total_results: series.length,
        series
      });
    } catch (err) {
      res.status(502).json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch series list."
      });
    }
  });
  app2.get("/api/anime-world-india/v1/search.php", async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const page = Math.max(1, Number(req.query.p || 1));
    if (!query) {
      res.status(400).json({ success: false, error: "Missing query parameter" });
      return;
    }
    const targetUrl = page > 1 ? `${ANIMEWORLD_UPSTREAM}/page/${page}/?s=${encodeURIComponent(query)}` : `${ANIMEWORLD_UPSTREAM}/?s=${encodeURIComponent(query)}`;
    try {
      const { ok, status, html, blockedByUpstream } = await fetchAnimeWorldHtml(targetUrl);
      if (!ok || !html) {
        res.status(status || 404).json({
          success: false,
          error: formatAnimeWorldUpstreamError(status, blockedByUpstream, "search")
        });
        return;
      }
      const $ = cheerio.load(html);
      const results = parseAnimeWorldCards($);
      res.json({
        success: true,
        query,
        currentPage: page,
        source: `${ANIMEWORLD_UPSTREAM}/search`,
        results
      });
    } catch (err) {
      res.status(502).json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to search AnimeWorld India."
      });
    }
  });
  app2.get("/api/anime-world-india/v1/seasons.php", async (req, res) => {
    const seriesID = typeof req.query.seriesID === "string" ? req.query.seriesID.trim() : typeof req.query.seriesId === "string" ? req.query.seriesId.trim() : "";
    if (!seriesID) {
      res.status(400).json({ success: false, error: "Missing seriesID parameter" });
      return;
    }
    const targetUrl = `${ANIMEWORLD_UPSTREAM}/series/${encodeURIComponent(seriesID)}/`;
    try {
      const { ok, status, html, blockedByUpstream } = await fetchAnimeWorldHtml(targetUrl);
      if (!ok || !html) {
        res.status(status || 404).json({
          success: false,
          error: formatAnimeWorldUpstreamError(status, blockedByUpstream, `series "${seriesID}"`)
        });
        return;
      }
      const $ = cheerio.load(html);
      const title = $("h1.hero-title, h1.entry-title").first().text().trim() || seriesID;
      const poster = normalizeAnimeWorldImg(
        $(".hero-poster img, .post-thumbnail img").first().attr("data-src") || $(".hero-poster img, .post-thumbnail img").first().attr("src")
      );
      const description = $("#overview-text p, .description p").first().text().trim() || null;
      const heroBadges = [];
      $(".hero-badge").each((_, el) => {
        const txt = $(el).text().trim();
        if (txt) heroBadges.push(txt);
      });
      const year = heroBadges.find((b) => /^\d{4}$/.test(b)) || null;
      const languages = [];
      $("a.language-tag").each((_, el) => {
        const lang = $(el).text().trim();
        if (lang && !languages.includes(lang)) languages.push(lang);
      });
      const seasons = [];
      $("a.season-btn.sel-temp").each((_, el) => {
        const btn = $(el);
        const postId = btn.attr("data-post") || "";
        const seasonNum = btn.attr("data-season") || "1";
        const seasonName = btn.find(".season-label").text().trim() || `Season ${seasonNum}`;
        const episodesText = btn.find(".season-episodes").text().trim() || "";
        const isSubOnly = btn.hasClass("non-regional");
        const seasonId = postId ? `${seriesID}__post-${postId}__season-${seasonNum}` : `${seriesID}-season-${seasonNum}`;
        seasons.push({
          seasonNumber: seasonNum,
          seasonName,
          episodes: episodesText,
          seasonId,
          postId,
          isSubOnly
        });
      });
      if (seasons.length === 0) {
        const epCount = $("article.tr-episode-card").length;
        seasons.push({
          seasonNumber: "1",
          seasonName: "Season 1",
          episodes: `${epCount} Episodes`,
          seasonId: `${seriesID}__season-1`,
          isSubOnly: false
        });
      }
      res.json({
        success: true,
        source: `${ANIMEWORLD_UPSTREAM}/series`,
        series: {
          seriesId: seriesID,
          title,
          poster,
          year,
          totalSeasons: String(seasons.length),
          languages,
          description
        },
        seasons
      });
    } catch (err) {
      res.status(502).json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to load seasons."
      });
    }
  });
  app2.get("/api/anime-world-india/v1/episodes.php", async (req, res) => {
    const seasonId = typeof req.query.seasonId === "string" ? req.query.seasonId.trim() : "";
    if (!seasonId) {
      res.status(400).json({ success: false, error: "Missing seasonId parameter" });
      return;
    }
    const parseEpisodesFromHtml = (html) => {
      const $ = cheerio.load(html);
      const episodes = [];
      const seen = /* @__PURE__ */ new Set();
      $("article.tr-episode-card").each((_, el) => {
        const card = $(el);
        const href = card.find("a.tr-episode-link").first().attr("href") || "";
        const episodeId = extractSlugFromHref(href, "episode");
        if (!episodeId || seen.has(episodeId)) return;
        seen.add(episodeId);
        const epTitle = card.find(".tr-episode-title, h3, h2").first().text().trim() || episodeId;
        const epNumber = card.find(".tr-episode-number").first().text().trim() || "";
        const imgEl = card.find("img").first();
        const image = normalizeAnimeWorldImg(imgEl.attr("data-src") || imgEl.attr("src"));
        episodes.push({
          episodeId,
          title: epTitle,
          episodeNumber: epNumber,
          airDate: null,
          image,
          overview: null
        });
      });
      return { $, episodes };
    };
    try {
      const encodedMatch = seasonId.match(/^(.+?)__post-(\d+)__season-(\d+)$/);
      if (encodedMatch) {
        const [, seriesSlug2, postId2, seasonNum] = encodedMatch;
        const ajaxUrl = `${ANIMEWORLD_UPSTREAM}/wp-admin/admin-ajax.php?action=action_select_season&season=${encodeURIComponent(
          seasonNum
        )}&post=${encodeURIComponent(postId2)}`;
        const { ok, status, html, blockedByUpstream } = await fetchAnimeWorldHtml(ajaxUrl);
        if (!ok || !html) {
          res.status(status || 404).json({
            success: false,
            error: formatAnimeWorldUpstreamError(status, blockedByUpstream, "episodes endpoint")
          });
          return;
        }
        const { episodes: episodes2 } = parseEpisodesFromHtml(html);
        res.json({
          success: true,
          source: `${ANIMEWORLD_UPSTREAM}/season`,
          season: {
            seasonId,
            animeTitle: seriesSlug2,
            seasonName: `Season ${seasonNum}`,
            totalEpisodes: String(episodes2.length)
          },
          episodes: episodes2
        });
        return;
      }
      const slugMatch = seasonId.match(/^(.+?)(?:__|-)season-(\d+)$/i);
      const seriesSlug = slugMatch ? slugMatch[1] : seasonId;
      const targetSeasonNum = slugMatch ? slugMatch[2] : "1";
      const seriesUrl = `${ANIMEWORLD_UPSTREAM}/series/${encodeURIComponent(seriesSlug)}/`;
      const seriesPage = await fetchAnimeWorldHtml(seriesUrl);
      if (!seriesPage.ok || !seriesPage.html) {
        res.status(seriesPage.status || 404).json({
          success: false,
          error: formatAnimeWorldUpstreamError(
            seriesPage.status,
            seriesPage.blockedByUpstream,
            `season "${seasonId}"`
          )
        });
        return;
      }
      const $series = cheerio.load(seriesPage.html);
      const animeTitle = $series("h1.hero-title, h1.entry-title").first().text().trim() || seriesSlug;
      const matchingBtn = $series(`a.season-btn.sel-temp[data-season="${targetSeasonNum}"]`).first();
      const postId = matchingBtn.attr("data-post");
      let episodes = [];
      if (postId && targetSeasonNum !== "1") {
        const ajaxUrl = `${ANIMEWORLD_UPSTREAM}/wp-admin/admin-ajax.php?action=action_select_season&season=${encodeURIComponent(
          targetSeasonNum
        )}&post=${encodeURIComponent(postId)}`;
        const ajaxRes = await fetchAnimeWorldHtml(ajaxUrl);
        if (ajaxRes.ok && ajaxRes.html) {
          episodes = parseEpisodesFromHtml(ajaxRes.html).episodes;
        }
      } else {
        episodes = parseEpisodesFromHtml(seriesPage.html).episodes;
      }
      res.json({
        success: true,
        source: `${ANIMEWORLD_UPSTREAM}/season`,
        season: {
          seasonId,
          animeTitle,
          seasonName: `Season ${targetSeasonNum}`,
          totalEpisodes: String(episodes.length)
        },
        episodes
      });
    } catch (err) {
      res.status(502).json({
        success: false,
        error: err instanceof Error ? err.message : "Failed to fetch episodes."
      });
    }
  });
  app2.get("/api/anime-world-india/v1/stream.php", async (req, res) => {
    const episodeId = typeof req.query.episodeId === "string" ? req.query.episodeId.trim() : "";
    const movieId = typeof req.query.movieId === "string" ? req.query.movieId.trim() : "";
    if (!episodeId && !movieId) {
      res.status(400).json({ success: false, error: "Missing episodeId or movieId" });
      return;
    }
    const type = episodeId ? "episode" : "movie";
    const targetUrl = episodeId ? `${ANIMEWORLD_UPSTREAM}/episode/${encodeURIComponent(episodeId)}/` : `${ANIMEWORLD_UPSTREAM}/movies/${encodeURIComponent(movieId)}/`;
    try {
      const { ok, status, html, blockedByUpstream } = await fetchAnimeWorldHtml(targetUrl);
      if (!ok || !html) {
        res.status(status === 404 ? 404 : status || 502).json({
          success: false,
          error: formatAnimeWorldUpstreamError(status, blockedByUpstream, "stream endpoint")
        });
        return;
      }
      const $ = cheerio.load(html);
      const iframeSrcs = [];
      $("#aa-options iframe, .video-player iframe, .video-embed iframe").each((_, el) => {
        const s = ($(el).attr("src") || $(el).attr("data-src") || "").trim();
        if (s && s.startsWith("http") && !iframeSrcs.includes(s)) {
          iframeSrcs.push(s);
        }
      });
      const downloadLink = $(".archive-link-wrap a, a[download], a.btn-download").first().attr("href") || null;
      const streams = [];
      const audioLanguages = [];
      let hindiStreamLink = null;
      let hasHindiAudio = false;
      for (const src of iframeSrcs) {
        if (src.includes("multi-lang-plyr.php") && src.includes("data=")) {
          try {
            const parsedUrl = new URL(src);
            const rawData = parsedUrl.searchParams.get("data");
            if (rawData) {
              const entries = JSON.parse(Buffer.from(rawData, "base64").toString("utf8"));
              for (const entry of entries) {
                const lang = (entry.language || "").trim();
                const link = (entry.link || "").trim();
                if (!lang || !link) continue;
                if (!audioLanguages.includes(lang)) audioLanguages.push(lang);
                const lowerLang = lang.toLowerCase();
                if (lowerLang === "hindi" || lowerLang === "hin") {
                  hasHindiAudio = true;
                  if (!hindiStreamLink) hindiStreamLink = link;
                }
                streams.push({
                  language: lang,
                  url: link,
                  type: classifyAnimeWorldStreamType(link),
                  label: `AnimeWorld India \xB7 ${lang} Audio`
                });
              }
            }
          } catch {
          }
        }
      }
      let ravokUrl = null;
      for (const src of iframeSrcs) {
        if (src.includes("multi-lang-plyr.php")) continue;
        if (src.includes("ravok.buzz")) {
          ravokUrl = src;
          const ravokLangs = await verifyRavokAudioLanguages(src);
          for (const l of ravokLangs) {
            if (!audioLanguages.includes(l)) audioLanguages.push(l);
          }
          const ravokHasHindi = ravokLangs.some((l) => l.toLowerCase() === "hindi");
          if (ravokHasHindi) {
            hasHindiAudio = true;
          }
          streams.push({
            language: ravokHasHindi ? "Hindi" : ravokLangs[0] || "Multi-Audio",
            url: src,
            type: "embed",
            label: ravokHasHindi ? "AnimeWorld India \xB7 Multi-Audio (Hindi Default)" : "AnimeWorld India \xB7 PlayX Mirror"
          });
        } else if (src.includes("megaplay.buzz")) {
          const isDub = src.toLowerCase().includes("/dub");
          const lang = isDub ? "English" : "Japanese";
          if (!audioLanguages.includes(lang)) audioLanguages.push(lang);
          streams.push({
            language: lang,
            url: src,
            type: "embed",
            label: isDub ? "AnimeWorld India \xB7 English Dub" : "AnimeWorld India \xB7 Japanese Sub"
          });
        } else {
          streams.push({
            language: "Unknown",
            url: src,
            type: classifyAnimeWorldStreamType(src),
            label: "AnimeWorld India \xB7 Mirror"
          });
        }
      }
      const validStreams = streams.filter((s) => isValidHttpUrl(s.url));
      validStreams.sort((a, b) => {
        const aHindi = a.language.toLowerCase() === "hindi" ? 0 : 1;
        const bHindi = b.language.toLowerCase() === "hindi" ? 0 : 1;
        return aHindi - bHindi;
      });
      const primaryCandidate = hindiStreamLink || hasHindiAudio && ravokUrl || validStreams[0]?.url || downloadLink || null;
      const primaryLink = isValidHttpUrl(primaryCandidate) ? primaryCandidate : validStreams[0]?.url || null;
      logProviderDiagnostic("animeworld-india", "stream", {
        id: episodeId || movieId,
        type,
        streamCount: validStreams.length,
        hasHindiAudio,
        hasPrimaryLink: Boolean(primaryLink)
      });
      if (!primaryLink) {
        res.status(404).json({
          success: false,
          error: "AnimeWorld India returned no playable stream link for this item."
        });
        return;
      }
      const title = $("h1.hero-title, h1.episode-title, h1.entry-title").first().text().trim() || episodeId || movieId;
      res.json({
        success: true,
        type,
        source: targetUrl,
        title,
        hasHindiAudio,
        audioLanguages,
        stream: {
          streamLink: primaryLink,
          file: downloadLink,
          type: classifyAnimeWorldStreamType(primaryLink)
        },
        streams: validStreams
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load AnimeWorld India stream.";
      logProviderDiagnostic("animeworld-india", "stream-error", {
        id: episodeId || movieId,
        error: msg
      });
      res.status(502).json({
        success: false,
        error: msg
      });
    }
  });
  app2.get("/api/anime/anizip/:anilistId", async (req, res) => {
    const anilistId = Number(req.params.anilistId);
    if (!Number.isFinite(anilistId) || anilistId <= 0) {
      res.status(400).json({ found: false, error: "Invalid AniList ID." });
      return;
    }
    const data = await fetchAniZipMetadata(anilistId);
    res.json(data);
  });
  app2.get("/api/anime/skip/:malId/:episodeNumber", async (req, res) => {
    const malId = Number(req.params.malId);
    const episodeNumber = Number(req.params.episodeNumber);
    const episodeLength = Number(req.query.length || 0);
    if (!Number.isFinite(malId) || malId <= 0 || !Number.isFinite(episodeNumber) || episodeNumber <= 0) {
      res.status(400).json({ found: false, skipTimes: [] });
      return;
    }
    const data = await fetchAniSkipTimestamps(malId, episodeNumber, episodeLength);
    res.json(data);
  });
  app2.get("/api/anime/info/:id", async (req, res) => {
    const anilistId = req.params.id;
    const base = typeof req.query.base === "string" && req.query.base.startsWith("http") ? req.query.base.replace(/\/+$/, "") : DEFAULT_STREAMING_API;
    const dub = req.query.dub === "true" ? "?dub=true" : "";
    const upstreamUrl = `${base}/meta/anilist/info/${encodeURIComponent(anilistId)}${dub}`;
    const cachedDown = primaryUnavailableCache.get(base);
    if (cachedDown && cachedDown.expiresAt > Date.now()) {
      res.status(200).json({
        episodes: [],
        upstreamError: {
          statusCode: cachedDown.data.statusCode,
          endpointUrl: upstreamUrl,
          message: cachedDown.data.message,
          detail: cachedDown.data.detail
        }
      });
      return;
    }
    try {
      const upstream = await fetchWithTimeout(
        upstreamUrl,
        {
          headers: { Accept: "application/json", "User-Agent": BROWSER_UA }
        },
        3500
      );
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        const msg = upstream.status === 402 ? "Configured external streaming API returned HTTP 402 (Deployment Disabled)." : `External streaming info API returned HTTP ${upstream.status}.`;
        if (upstream.status === 402 || upstream.status === 502 || upstream.status === 503) {
          primaryUnavailableCache.set(base, {
            expiresAt: Date.now() + 3 * 60 * 1e3,
            data: { statusCode: upstream.status, message: msg, detail: text.slice(0, 200) }
          });
        }
        res.status(200).json({
          episodes: [],
          upstreamError: {
            statusCode: upstream.status,
            endpointUrl: upstreamUrl,
            message: msg,
            detail: text.slice(0, 200)
          }
        });
        return;
      }
      const json = await upstream.json();
      res.json(json);
    } catch (err) {
      res.status(200).json({
        episodes: [],
        upstreamError: {
          endpointUrl: upstreamUrl,
          message: err instanceof Error ? err.message : "Upstream info request failed."
        }
      });
    }
  });
  app2.get("/api/anime/servers/:episodeId", async (req, res) => {
    const episodeId = req.params.episodeId;
    const base = typeof req.query.base === "string" && req.query.base.startsWith("http") ? req.query.base.replace(/\/+$/, "") : DEFAULT_STREAMING_API;
    const upstreamUrl = `${base}/meta/anilist/servers/${encodeURIComponent(episodeId)}`;
    const cachedDown = primaryUnavailableCache.get(base);
    if (!cachedDown || cachedDown.expiresAt <= Date.now()) {
      try {
        const upstream = await fetchWithTimeout(
          upstreamUrl,
          { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } },
          3e3
        );
        if (upstream.ok) {
          const data = await upstream.json();
          if (Array.isArray(data) && data.length > 0) {
            res.json(data);
            return;
          }
        } else if (upstream.status === 402 || upstream.status === 502 || upstream.status === 503) {
          primaryUnavailableCache.set(base, {
            expiresAt: Date.now() + 3 * 60 * 1e3,
            data: {
              statusCode: upstream.status,
              message: `Primary endpoint (${base}) returned HTTP ${upstream.status}.`
            }
          });
        }
      } catch {
      }
    }
    res.json([
      { name: "animeworld-india" },
      { name: "vidstreaming" },
      { name: "megacloud" },
      { name: "streamsb" }
    ]);
  });
  app2.get("/api/anime/watch/:episodeId", async (req, res) => {
    const episodeId = (req.params.episodeId || "").trim();
    if (!episodeId || episodeId === "EPISODE_ID") {
      res.status(400).json({
        message: "A valid episodeId is required instead of the placeholder EPISODE_ID."
      });
      return;
    }
    const base = typeof req.query.base === "string" && req.query.base.startsWith("http") ? req.query.base.replace(/\/+$/, "") : DEFAULT_STREAMING_API;
    const server = typeof req.query.server === "string" ? req.query.server.trim() : "vidstreaming";
    const category = req.query.category === "hindi" ? "hindi" : req.query.category === "dub" ? "dub" : "sub";
    const epQuery = Number(req.query.ep || 0);
    const anilistId = Number(req.query.anilistId || 0);
    let malId = Number(req.query.malId || 0);
    const serverLower = server.toLowerCase();
    if (serverLower === "animeworld-india") {
      res.status(400).json({
        message: "AnimeWorld-India uses /api/anime-world-india/v1/ (search.php, seasons.php, episodes.php, stream.php) with native AnimeWorld IDs rather than AniList IDs."
      });
      return;
    }
    const params = new URLSearchParams();
    if (server) params.set("server", server);
    params.set("category", category);
    const primaryUrl = `${base}/meta/anilist/watch/${encodeURIComponent(episodeId)}?${params.toString()}`;
    let primaryErrorMsg = "";
    let primaryStatus = 0;
    const cachedDown = primaryUnavailableCache.get(base);
    if (cachedDown && cachedDown.expiresAt > Date.now()) {
      primaryStatus = cachedDown.data.statusCode;
      primaryErrorMsg = cachedDown.data.message;
    } else {
      try {
        const upstream = await fetchWithTimeout(
          primaryUrl,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": BROWSER_UA
            }
          },
          3500
        );
        if (upstream.ok) {
          const data = await upstream.json();
          const sources = Array.isArray(data.sources) ? data.sources : [];
          if (sources.length > 0) {
            res.json(data);
            return;
          }
          primaryStatus = 404;
          primaryErrorMsg = "Primary streaming API returned no playable sources.";
        } else {
          primaryStatus = upstream.status;
          const body = await upstream.text().catch(() => "");
          primaryErrorMsg = upstream.status === 402 ? `Primary endpoint (${base}) returned HTTP 402 (DEPLOYMENT_DISABLED).` : `Primary endpoint returned HTTP ${upstream.status}: ${body.slice(0, 120)}`;
          if (upstream.status === 402 || upstream.status === 502 || upstream.status === 503) {
            primaryUnavailableCache.set(base, {
              expiresAt: Date.now() + 3 * 60 * 1e3,
              data: { statusCode: upstream.status, message: primaryErrorMsg, detail: body.slice(0, 200) }
            });
          }
        }
      } catch (err) {
        primaryErrorMsg = err instanceof Error ? err.message : "Primary streaming endpoint unreachable.";
      }
    }
    if (!malId && anilistId > 0) {
      const resolved = await resolveMalIdFromAnilist(anilistId);
      if (resolved) {
        malId = resolved;
      } else {
        const aniZip = await fetchAniZipMetadata(anilistId);
        const zipMal = aniZip.mappings?.malId;
        if (typeof zipMal === "number" && zipMal > 0) {
          malId = zipMal;
        }
      }
    }
    const epMatch = episodeId.match(/(?:episode|ep)[-_]?(\d+)/i);
    const episodeNumber = epQuery > 0 ? epQuery : epMatch ? Number(epMatch[1]) : 1;
    if (malId > 0 && episodeNumber > 0) {
      const [fallback, aniSkip] = await Promise.all([
        resolveFromMegavid(malId, episodeNumber, category, server),
        fetchAniSkipTimestamps(malId, episodeNumber)
      ]);
      if (fallback.ok && fallback.payload) {
        const payload = { ...fallback.payload };
        if (!payload.intro && aniSkip.intro) payload.intro = aniSkip.intro;
        if (!payload.outro && aniSkip.outro) payload.outro = aniSkip.outro;
        if (!payload.recap && aniSkip.recap) payload.recap = aniSkip.recap;
        res.json({
          ...payload,
          malId,
          primaryEndpointNotice: primaryErrorMsg || void 0
        });
        return;
      }
      res.status(fallback.statusCode || 404).json({
        message: fallback.message || primaryErrorMsg || "Episode stream unavailable.",
        endpointUrl: primaryUrl,
        primaryStatus
      });
      return;
    }
    res.status(primaryStatus || 502).json({
      message: primaryErrorMsg || "Unable to resolve episode stream. Missing MyAnimeList ID for fallback resolver.",
      endpointUrl: primaryUrl,
      primaryStatus
    });
  });
  app2.options("/api/anime/proxy", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, If-Range, Content-Type");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type"
    );
    res.status(204).end();
  });
  app2.get("/api/anime/proxy", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const referer = typeof req.query.referer === "string" && req.query.referer.startsWith("http") ? req.query.referer : "https://megavid.buzz/";
    if (!rawUrl) {
      res.status(400).json({ message: "Missing url parameter." });
      return;
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizeUrl(rawUrl));
    } catch {
      res.status(400).json({ message: "Invalid url parameter." });
      return;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol) || isBlockedPrivateHost(parsedUrl.hostname)) {
      res.status(403).json({ message: "Blocked upstream host." });
      return;
    }
    const upstreamHeaders = {
      Referer: referer,
      "User-Agent": BROWSER_UA,
      Accept: "*/*"
    };
    if (typeof req.headers.range === "string" && req.headers.range.trim()) {
      upstreamHeaders.Range = req.headers.range;
    }
    if (typeof req.headers["if-range"] === "string" && req.headers["if-range"].trim()) {
      upstreamHeaders["If-Range"] = req.headers["if-range"];
    }
    try {
      const upstream = await fetchWithTimeout(
        parsedUrl.toString(),
        {
          headers: upstreamHeaders
        },
        25e3
      );
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).send(`Upstream proxy error: HTTP ${upstream.status}`);
        return;
      }
      const lowerPath = parsedUrl.pathname.toLowerCase();
      let contentType = upstream.headers.get("content-type") || "application/octet-stream";
      if (lowerPath.endsWith(".ts") && (!contentType || contentType.includes("linguist") || contentType.includes("octet-stream"))) {
        contentType = "video/mp2t";
      } else if (lowerPath.endsWith(".mp4") && contentType.includes("octet-stream")) {
        contentType = "video/mp4";
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range, If-Range, Content-Type");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Range, Accept-Ranges, Content-Type"
      );
      if (lowerPath.endsWith(".srt") || contentType.includes("subrip")) {
        const srtText = await upstream.text();
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.send(convertSrtToVtt(srtText));
        return;
      }
      if (contentType.includes("mpegurl") || lowerPath.endsWith(".m3u8")) {
        const playlist = await upstream.text();
        const proxyHref = (target) => {
          const absolute = new URL(target, parsedUrl).toString();
          return `/api/anime/proxy?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(
            referer
          )}`;
        };
        const rewritten = playlist.split(/\r?\n/).map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/gi, (_m, uri) => `URI="${proxyHref(uri)}"`);
          }
          return proxyHref(trimmed);
        }).join("\n");
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.send(rewritten);
        return;
      }
      res.status(upstream.status);
      res.setHeader("Content-Type", contentType);
      const acceptRanges = upstream.headers.get("accept-ranges") || "bytes";
      res.setHeader("Accept-Ranges", acceptRanges);
      const passthroughHeaders = ["content-range", "content-length", "cache-control", "etag", "last-modified"];
      for (const h of passthroughHeaders) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      if (upstream.body) {
        const nodeStream = Readable.fromWeb(upstream.body);
        nodeStream.on("error", () => {
          if (!res.headersSent) {
            res.status(502).end();
          } else {
            res.destroy();
          }
        });
        res.on("close", () => {
          if (!nodeStream.destroyed) nodeStream.destroy();
        });
        nodeStream.pipe(res);
      } else {
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.send(buffer);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).send(err instanceof Error ? err.message : "Proxy fetch failed.");
      }
    }
  });
  app2.all("/api/*", (req, res) => {
    res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });
  app2.use("/api", (err, req, res, _next) => {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Internal API server error.";
    console.error(`[API Error] ${req.method} ${req.originalUrl}: ${message}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: message,
        message
      });
    }
  });
  return app2;
}
var app = createExpressApp();
var server_default = app;
async function startStandaloneServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      const indexHtml = path.join(distPath, "index.html");
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send("Build output not found.");
      }
    });
  }
  return app.listen(PORT, "0.0.0.0", () => {
    console.log(`KuroStream server listening on http://0.0.0.0:${PORT}`);
  });
}
var isDirectEntry = typeof process !== "undefined" && Array.isArray(process.argv) && Boolean(process.argv[1]) && path.basename(process.argv[1]).startsWith("server");
if (!isVercelRuntime && (isDirectEntry || process.env.START_SERVER === "true")) {
  startStandaloneServer();
}

// api/index.ts
function handler(req, res) {
  try {
    if (req.url) {
      const parsed = new URL(req.url, "http://localhost");
      const rewrittenPath = parsed.searchParams.get("__kuro_path");
      if (rewrittenPath !== null) {
        parsed.searchParams.delete("__kuro_path");
        const cleanSubpath = rewrittenPath.replace(/^\/+/, "");
        const qs = parsed.searchParams.toString();
        req.url = `/api/${cleanSubpath}${qs ? `?${qs}` : ""}`;
      } else if (!parsed.pathname.startsWith("/api")) {
        const qs = parsed.searchParams.toString();
        req.url = `/api${parsed.pathname.startsWith("/") ? "" : "/"}${parsed.pathname}${qs ? `?${qs}` : ""}`;
      } else if (parsed.pathname === "/api" || parsed.pathname === "/api/") {
        req.url = "/api/health";
      }
    }
    return server_default(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Serverless API handler failure.";
    console.error("[Vercel Handler Error]", message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ success: false, error: message, message }));
    }
  }
}
export {
  handler as default
};
