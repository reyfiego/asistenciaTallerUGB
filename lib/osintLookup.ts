// Motor OSINT ligero en Node.js para consultar presencia pública de @handle y correo
// en >20 páginas web y >20 apps/redes sin depender de binarios externos.

import { createHash } from "node:crypto";

export type OsintMatchStatus = "encontrado" | "no_encontrado" | "bloqueado";
export type OsintPlatformKind = "web" | "app";

export interface OsintPlatformResult {
  platform: string;
  kind: OsintPlatformKind;
  category: string;
  url: string;
  status: OsintMatchStatus;
  detail?: string;
}

export interface OsintEmailFindings {
  email: string;
  domain: string;
  providerType: "institucional" | "gratuito" | "corporativo";
  gravatarFound: boolean;
  gravatarAvatarUrl: string | null;
  gravatarName: string | null;
  githubByEmailUrl: string | null;
  githubByEmailLogin: string | null;
  hibpChecked: boolean;
  hibpBreaches: Array<{ name: string; breachDate: string; domain: string }>;
  hibpNote: string;
}

export interface OsintLookupReport {
  queriedAt: string;
  handle: string;
  durationMs: number;
  platformsChecked: number;
  foundCount: number;
  blockedCount: number;
  webChecked: number;
  webFound: number;
  appChecked: number;
  appFound: number;
  platforms: OsintPlatformResult[];
  emailFindings: OsintEmailFindings | null;
}

interface PlatformCheckDef {
  platform: string;
  kind: OsintPlatformKind;
  category: string;
  buildUrl: (username: string) => string;
  check: (username: string) => Promise<OsintPlatformResult>;
}

const REQUEST_TIMEOUT_MS = 3500;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

async function fetchWithTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-SV,es;q=0.9,en;q=0.8",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function makeStatusChecker(
  platform: string,
  kind: OsintPlatformKind,
  category: string,
  buildUrl: (username: string) => string,
  options?: {
    notFoundMarkers?: string[];
    foundMarkers?: string[];
  }
): PlatformCheckDef {
  return {
    platform,
    kind,
    category,
    buildUrl,
    async check(username: string): Promise<OsintPlatformResult> {
      const url = buildUrl(username);
      try {
        const res = await fetchWithTimeout(url);
        if (res.status === 404 || res.status === 410) {
          return { platform, kind, category, url, status: "no_encontrado" };
        }
        if (res.status === 403 || res.status === 429 || res.status >= 500) {
          return {
            platform,
            kind,
            category,
            url,
            status: "bloqueado",
            detail: `HTTP ${res.status}`,
          };
        }
        if (!res.ok) {
          return {
            platform,
            kind,
            category,
            url,
            status: "bloqueado",
            detail: `HTTP ${res.status}`,
          };
        }

        const body = await res.text();
        const lower = body.toLowerCase();

        if (
          options?.notFoundMarkers?.some((marker) =>
            lower.includes(marker.toLowerCase())
          )
        ) {
          return { platform, kind, category, url, status: "no_encontrado" };
        }

        if (options?.foundMarkers && options.foundMarkers.length > 0) {
          const hasMatch = options.foundMarkers.some((marker) =>
            lower.includes(marker.toLowerCase())
          );
          if (!hasMatch) {
            return { platform, kind, category, url, status: "no_encontrado" };
          }
        }

        return { platform, kind, category, url, status: "encontrado" };
      } catch {
        return {
          platform,
          kind,
          category,
          url,
          status: "bloqueado",
          detail: "Tiempo agotado",
        };
      }
    },
  };
}

function buildPlatformChecks(): PlatformCheckDef[] {
  return [
    // ==========================================
    // 1. PÁGINAS WEB, PORTAFOLIOS Y FOROS (23)
    // ==========================================
    {
      platform: "GitHub",
      kind: "web",
      category: "Código",
      buildUrl: (u) => `https://github.com/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://github.com/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            { headers: { Accept: "application/vnd.github+json" } }
          );
          if (res.status === 404) {
            return { platform: "GitHub", kind: "web", category: "Código", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "GitHub", kind: "web", category: "Código", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as {
            name?: string | null;
            public_repos?: number;
            followers?: number;
          };
          const info = [
            data.name || null,
            typeof data.public_repos === "number" ? `${data.public_repos} repos` : null,
            typeof data.followers === "number" ? `${data.followers} seg.` : null,
          ]
            .filter(Boolean)
            .join(" • ");
          return {
            platform: "GitHub",
            kind: "web",
            category: "Código",
            url,
            status: "encontrado",
            detail: info || "Perfil público",
          };
        } catch {
          return { platform: "GitHub", kind: "web", category: "Código", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "GitLab",
      kind: "web",
      category: "Código",
      buildUrl: (u) => `https://gitlab.com/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://gitlab.com/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`
          );
          if (!res.ok) {
            return { platform: "GitLab", kind: "web", category: "Código", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const arr = (await res.json()) as Array<{ name?: string }>;
          if (!Array.isArray(arr) || arr.length === 0) {
            return { platform: "GitLab", kind: "web", category: "Código", url, status: "no_encontrado" };
          }
          return {
            platform: "GitLab",
            kind: "web",
            category: "Código",
            url,
            status: "encontrado",
            detail: arr[0]?.name ? `Nombre: ${arr[0].name}` : "Usuario activo",
          };
        } catch {
          return { platform: "GitLab", kind: "web", category: "Código", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "DEV.to",
      kind: "web",
      category: "Blog Tech",
      buildUrl: (u) => `https://dev.to/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://dev.to/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`
          );
          if (res.status === 404) {
            return { platform: "DEV.to", kind: "web", category: "Blog Tech", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "DEV.to", kind: "web", category: "Blog Tech", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as { name?: string };
          return {
            platform: "DEV.to",
            kind: "web",
            category: "Blog Tech",
            url,
            status: "encontrado",
            detail: data.name ?? "Autor público",
          };
        } catch {
          return { platform: "DEV.to", kind: "web", category: "Blog Tech", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Hacker News",
      kind: "web",
      category: "Foro Tech",
      buildUrl: (u) => `https://news.ycombinator.com/user?id=${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://news.ycombinator.com/user?id=${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`
          );
          if (!res.ok) {
            return { platform: "Hacker News", kind: "web", category: "Foro Tech", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as { karma?: number } | null;
          if (!data) {
            return { platform: "Hacker News", kind: "web", category: "Foro Tech", url, status: "no_encontrado" };
          }
          return {
            platform: "Hacker News",
            kind: "web",
            category: "Foro Tech",
            url,
            status: "encontrado",
            detail: typeof data.karma === "number" ? `Karma: ${data.karma}` : "Cuenta activa",
          };
        } catch {
          return { platform: "Hacker News", kind: "web", category: "Foro Tech", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Codeforces",
      kind: "web",
      category: "Algoritmos",
      buildUrl: (u) => `https://codeforces.com/profile/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://codeforces.com/profile/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`
          );
          if (res.status === 400) {
            return { platform: "Codeforces", kind: "web", category: "Algoritmos", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "Codeforces", kind: "web", category: "Algoritmos", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as {
            status?: string;
            result?: Array<{ rank?: string; rating?: number; country?: string }>;
          };
          const user = data.result?.[0];
          if (data.status !== "OK" || !user) {
            return { platform: "Codeforces", kind: "web", category: "Algoritmos", url, status: "no_encontrado" };
          }
          return {
            platform: "Codeforces",
            kind: "web",
            category: "Algoritmos",
            url,
            status: "encontrado",
            detail: [user.rank, user.rating ? `Rating ${user.rating}` : null, user.country]
              .filter(Boolean)
              .join(" • "),
          };
        } catch {
          return { platform: "Codeforces", kind: "web", category: "Algoritmos", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Keybase",
      kind: "web",
      category: "Criptografía",
      buildUrl: (u) => `https://keybase.io/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://keybase.io/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(username)}`
          );
          if (!res.ok) {
            return { platform: "Keybase", kind: "web", category: "Criptografía", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as {
            them?: Array<{ id?: string; profile?: { full_name?: string } } | null>;
          };
          const hit = data.them?.[0];
          if (!hit?.id) {
            return { platform: "Keybase", kind: "web", category: "Criptografía", url, status: "no_encontrado" };
          }
          return {
            platform: "Keybase",
            kind: "web",
            category: "Criptografía",
            url,
            status: "encontrado",
            detail: hit.profile?.full_name ?? "Identidad verificada",
          };
        } catch {
          return { platform: "Keybase", kind: "web", category: "Criptografía", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    makeStatusChecker("Bitbucket", "web", "Código", (u) => `https://bitbucket.org/${encodeURIComponent(u)}/`),
    makeStatusChecker("CodePen", "web", "Código", (u) => `https://codepen.io/${encodeURIComponent(u)}`),
    makeStatusChecker("Replit", "web", "Código", (u) => `https://replit.com/@${encodeURIComponent(u)}`),
    makeStatusChecker("LeetCode", "web", "Algoritmos", (u) => `https://leetcode.com/u/${encodeURIComponent(u)}/`, {
      notFoundMarkers: ["page not found"],
    }),
    makeStatusChecker("HackerRank", "web", "Algoritmos", (u) => `https://www.hackerrank.com/profile/${encodeURIComponent(u)}`, {
      notFoundMarkers: ["something went wrong", "page not found"],
    }),
    makeStatusChecker("Kaggle", "web", "Datos / IA", (u) => `https://www.kaggle.com/${encodeURIComponent(u)}`),
    makeStatusChecker("npm", "web", "Paquetes JS", (u) => `https://www.npmjs.com/~${encodeURIComponent(u)}`),
    makeStatusChecker("PyPI", "web", "Paquetes Py", (u) => `https://pypi.org/user/${encodeURIComponent(u)}/`),
    makeStatusChecker("Wikipedia (ES)", "web", "Wiki", (u) => `https://es.wikipedia.org/wiki/Usuario:${encodeURIComponent(u)}`, {
      notFoundMarkers: ["wikipedia no tiene todavía una página de usuario"],
    }),
    makeStatusChecker("Medium", "web", "Artículos", (u) => `https://medium.com/@${encodeURIComponent(u)}`, {
      notFoundMarkers: ["page not found", "404"],
    }),
    makeStatusChecker("Substack", "web", "Newsletter", (u) => `https://substack.com/@${encodeURIComponent(u)}`),
    makeStatusChecker("Behance", "web", "Portafolio", (u) => `https://www.behance.net/${encodeURIComponent(u)}`),
    makeStatusChecker("Dribbble", "web", "Diseño", (u) => `https://dribbble.com/${encodeURIComponent(u)}`),
    makeStatusChecker("DeviantArt", "web", "Arte", (u) => `https://www.deviantart.com/${encodeURIComponent(u)}`),
    makeStatusChecker("Flickr", "web", "Fotografía", (u) => `https://www.flickr.com/people/${encodeURIComponent(u)}/`),
    makeStatusChecker("About.me", "web", "Bio", (u) => `https://about.me/${encodeURIComponent(u)}`),
    makeStatusChecker("Archive.org", "web", "Archivo", (u) => `https://archive.org/details/@${encodeURIComponent(u)}`, {
      notFoundMarkers: ["cannot find account"],
    }),

    // ==========================================
    // 2. APPS, REDES, GAMING Y STREAMING (23)
    // ==========================================
    {
      platform: "Reddit",
      kind: "app",
      category: "Foro / App",
      buildUrl: (u) => `https://www.reddit.com/user/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://www.reddit.com/user/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`
          );
          if (res.status === 404) {
            return { platform: "Reddit", kind: "app", category: "Foro / App", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "Reddit", kind: "app", category: "Foro / App", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as {
            data?: { total_karma?: number; is_suspended?: boolean };
          };
          return {
            platform: "Reddit",
            kind: "app",
            category: "Foro / App",
            url,
            status: "encontrado",
            detail: data.data?.is_suspended
              ? "Cuenta suspendida"
              : typeof data.data?.total_karma === "number"
                ? `Karma: ${data.data.total_karma}`
                : "Perfil activo",
          };
        } catch {
          return { platform: "Reddit", kind: "app", category: "Foro / App", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Bluesky",
      kind: "app",
      category: "Microblog",
      buildUrl: (u) => `https://bsky.app/profile/${encodeURIComponent(u)}.bsky.social`,
      async check(username): Promise<OsintPlatformResult> {
        const handle = username.includes(".") ? username : `${username}.bsky.social`;
        const url = `https://bsky.app/profile/${encodeURIComponent(handle)}`;
        try {
          const res = await fetchWithTimeout(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`
          );
          if (res.status === 400 || res.status === 404) {
            return { platform: "Bluesky", kind: "app", category: "Microblog", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "Bluesky", kind: "app", category: "Microblog", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as { displayName?: string; followersCount?: number };
          return {
            platform: "Bluesky",
            kind: "app",
            category: "Microblog",
            url,
            status: "encontrado",
            detail: [data.displayName, typeof data.followersCount === "number" ? `${data.followersCount} seg.` : null]
              .filter(Boolean)
              .join(" • "),
          };
        } catch {
          return { platform: "Bluesky", kind: "app", category: "Microblog", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Mastodon",
      kind: "app",
      category: "Microblog",
      buildUrl: (u) => `https://mastodon.social/@${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://mastodon.social/@${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://mastodon.social/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`
          );
          if (res.status === 404) {
            return { platform: "Mastodon", kind: "app", category: "Microblog", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "Mastodon", kind: "app", category: "Microblog", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as { display_name?: string };
          return {
            platform: "Mastodon",
            kind: "app",
            category: "Microblog",
            url,
            status: "encontrado",
            detail: data.display_name || "Perfil activo",
          };
        } catch {
          return { platform: "Mastodon", kind: "app", category: "Microblog", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Duolingo",
      kind: "app",
      category: "Educación",
      buildUrl: (u) => `https://www.duolingo.com/profile/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://www.duolingo.com/profile/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(username)}`
          );
          if (!res.ok) {
            return { platform: "Duolingo", kind: "app", category: "Educación", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as {
            users?: Array<{ name?: string; totalXp?: number; streak?: number }>;
          };
          const user = data.users?.[0];
          if (!user) {
            return { platform: "Duolingo", kind: "app", category: "Educación", url, status: "no_encontrado" };
          }
          return {
            platform: "Duolingo",
            kind: "app",
            category: "Educación",
            url,
            status: "encontrado",
            detail: [
              user.name || null,
              typeof user.totalXp === "number" ? `${user.totalXp} XP` : null,
              typeof user.streak === "number" ? `Racha ${user.streak}d` : null,
            ]
              .filter(Boolean)
              .join(" • "),
          };
        } catch {
          return { platform: "Duolingo", kind: "app", category: "Educación", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Chess.com",
      kind: "app",
      category: "Juegos",
      buildUrl: (u) => `https://www.chess.com/member/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://www.chess.com/member/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`
          );
          if (res.status === 404) {
            return { platform: "Chess.com", kind: "app", category: "Juegos", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "Chess.com", kind: "app", category: "Juegos", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as { name?: string; status?: string };
          return {
            platform: "Chess.com",
            kind: "app",
            category: "Juegos",
            url,
            status: "encontrado",
            detail: data.name ?? data.status ?? "Jugador activo",
          };
        } catch {
          return { platform: "Chess.com", kind: "app", category: "Juegos", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    {
      platform: "Lichess",
      kind: "app",
      category: "Juegos",
      buildUrl: (u) => `https://lichess.org/@/${encodeURIComponent(u)}`,
      async check(username): Promise<OsintPlatformResult> {
        const url = `https://lichess.org/@/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://lichess.org/api/user/${encodeURIComponent(username)}`
          );
          if (res.status === 404) {
            return { platform: "Lichess", kind: "app", category: "Juegos", url, status: "no_encontrado" };
          }
          if (!res.ok) {
            return { platform: "Lichess", kind: "app", category: "Juegos", url, status: "bloqueado", detail: `HTTP ${res.status}` };
          }
          const data = (await res.json()) as { count?: { all?: number } };
          return {
            platform: "Lichess",
            kind: "app",
            category: "Juegos",
            url,
            status: "encontrado",
            detail: typeof data.count?.all === "number" ? `${data.count.all} partidas` : "Jugador activo",
          };
        } catch {
          return { platform: "Lichess", kind: "app", category: "Juegos", url, status: "bloqueado", detail: "Tiempo agotado" };
        }
      },
    },
    makeStatusChecker("Instagram", "app", "Red Social", (u) => `https://www.instagram.com/${encodeURIComponent(u)}/`, {
      notFoundMarkers: ["sorry, this page isn't available", "esta página no está disponible"],
    }),
    makeStatusChecker("TikTok", "app", "Red Social", (u) => `https://www.tiktok.com/@${encodeURIComponent(u)}`, {
      notFoundMarkers: ["couldn't find this account", "no se pudo encontrar esta cuenta"],
    }),
    makeStatusChecker("Threads", "app", "Red Social", (u) => `https://www.threads.net/@${encodeURIComponent(u)}`),
    makeStatusChecker("Telegram", "app", "Mensajería", (u) => `https://t.me/${encodeURIComponent(u)}`, {
      foundMarkers: ["tgme_page_title"],
      notFoundMarkers: ["if you have telegram, you can contact"],
    }),
    makeStatusChecker("YouTube", "app", "Video", (u) => `https://www.youtube.com/@${encodeURIComponent(u)}`),
    makeStatusChecker("Twitch", "app", "Streaming", (u) => `https://www.twitch.tv/${encodeURIComponent(u)}`, {
      foundMarkers: ["og:title"],
    }),
    makeStatusChecker("Pinterest", "app", "Red Social", (u) => `https://www.pinterest.com/${encodeURIComponent(u)}/`, {
      notFoundMarkers: ["user not found", "page not found"],
    }),
    makeStatusChecker("Steam", "app", "Gaming", (u) => `https://steamcommunity.com/id/${encodeURIComponent(u)}`, {
      notFoundMarkers: ["the specified profile could not be found"],
    }),
    makeStatusChecker("Roblox", "app", "Gaming", (u) => `https://www.roblox.com/users/profile?username=${encodeURIComponent(u)}`),
    makeStatusChecker("SoundCloud", "app", "Música", (u) => `https://soundcloud.com/${encodeURIComponent(u)}`),
    makeStatusChecker("Last.fm", "app", "Música", (u) => `https://www.last.fm/user/${encodeURIComponent(u)}`),
    makeStatusChecker("Letterboxd", "app", "Cine", (u) => `https://letterboxd.com/${encodeURIComponent(u)}/`),
    makeStatusChecker("MyAnimeList", "app", "Anime", (u) => `https://myanimelist.net/profile/${encodeURIComponent(u)}`),
    makeStatusChecker("Linktree", "app", "Bio Links", (u) => `https://linktr.ee/${encodeURIComponent(u)}`, {
      notFoundMarkers: ["the page you're looking for doesn't exist"],
    }),
    makeStatusChecker("Ko-fi", "app", "Pagos / Creadores", (u) => `https://ko-fi.com/${encodeURIComponent(u)}`),
    makeStatusChecker("Patreon", "app", "Creadores", (u) => `https://www.patreon.com/${encodeURIComponent(u)}`),
    makeStatusChecker("Vimeo", "app", "Video", (u) => `https://vimeo.com/${encodeURIComponent(u)}`),
  ];
}

async function inspectEmailOsint(email: string): Promise<OsintEmailFindings> {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.includes("@") ? normalized.split("@")[1] : "";
  const providerType: OsintEmailFindings["providerType"] =
    domain.endsWith(".edu") || domain.includes(".edu.")
      ? "institucional"
      : FREE_EMAIL_DOMAINS.has(domain)
        ? "gratuito"
        : "corporativo";

  const md5 = createHash("md5").update(normalized).digest("hex");
  const gravatarAvatarCandidate = `https://www.gravatar.com/avatar/${md5}?d=404&s=200`;

  const [gravatarAvatarRes, gravatarProfileRes, githubSearchRes, hibpRes] =
    await Promise.all([
      fetchWithTimeout(gravatarAvatarCandidate).catch(() => null),
      fetchWithTimeout(`https://www.gravatar.com/${md5}.json`).catch(() => null),
      fetchWithTimeout(
        `https://api.github.com/search/users?q=${encodeURIComponent(normalized)}+in:email`,
        { headers: { Accept: "application/vnd.github+json" } }
      ).catch(() => null),
      process.env.HIBP_API_KEY
        ? fetchWithTimeout(
            `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(normalized)}?truncateResponse=false`,
            {
              headers: {
                "hibp-api-key": process.env.HIBP_API_KEY,
                "user-agent": "operacion-carnada-ugb-osint",
              },
            }
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

  let gravatarFound = Boolean(gravatarAvatarRes && gravatarAvatarRes.ok);
  let gravatarName: string | null = null;

  if (gravatarProfileRes && gravatarProfileRes.ok) {
    try {
      const gData = (await gravatarProfileRes.json()) as {
        entry?: Array<{ displayName?: string; preferredUsername?: string }>;
      };
      const entry = gData.entry?.[0];
      if (entry) {
        gravatarFound = true;
        gravatarName = entry.displayName || entry.preferredUsername || null;
      }
    } catch {
      // Ignorar error de parseo
    }
  }

  let githubByEmailUrl: string | null = null;
  let githubByEmailLogin: string | null = null;
  if (githubSearchRes && githubSearchRes.ok) {
    try {
      const ghData = (await githubSearchRes.json()) as {
        items?: Array<{ login?: string; html_url?: string }>;
      };
      const first = ghData.items?.[0];
      if (first?.html_url) {
        githubByEmailUrl = first.html_url;
        githubByEmailLogin = first.login ?? null;
      }
    } catch {
      // Ignorar error de parseo
    }
  }

  let hibpChecked = false;
  let hibpBreaches: OsintEmailFindings["hibpBreaches"] = [];
  let hibpNote =
    "Consulta automática de brechas por correo desactivada (falta HIBP_API_KEY).";

  if (hibpRes) {
    hibpChecked = true;
    if (hibpRes.status === 404) {
      hibpNote = "Sin brechas públicas registradas en Have I Been Pwned.";
    } else if (hibpRes.ok) {
      try {
        const list = (await hibpRes.json()) as Array<{
          Name?: string;
          BreachDate?: string;
          Domain?: string;
        }>;
        hibpBreaches = list.slice(0, 12).map((b) => ({
          name: b.Name || "Desconocida",
          breachDate: b.BreachDate || "N/D",
          domain: b.Domain || "N/D",
        }));
        hibpNote =
          hibpBreaches.length > 0
            ? `Encontrado en ${hibpBreaches.length} filtración(es) pública(s).`
            : "Sin brechas registradas.";
      } catch {
        hibpNote = "No se pudo interpretar la respuesta de HIBP.";
      }
    } else {
      hibpNote = `HIBP respondió HTTP ${hibpRes.status}.`;
    }
  }

  return {
    email: normalized,
    domain,
    providerType,
    gravatarFound,
    gravatarAvatarUrl: gravatarFound ? gravatarAvatarCandidate : null,
    gravatarName,
    githubByEmailUrl,
    githubByEmailLogin,
    hibpChecked,
    hibpBreaches,
    hibpNote,
  };
}

/**
 * Ejecuta un escaneo OSINT en vivo por @handle y/o correo electrónico
 * sobre más de 20 páginas web y más de 20 apps/redes.
 */
export async function runLiveOsintLookup(input: {
  handle?: string;
  email?: string;
}): Promise<OsintLookupReport> {
  const startedAt = Date.now();
  const rawHandle = (input.handle ?? "").trim().replace(/^@+/, "");
  const cleanEmail = (input.email ?? "").trim();

  const effectiveHandle =
    rawHandle && rawHandle !== "no_indicado"
      ? rawHandle
      : cleanEmail.includes("@")
        ? cleanEmail.split("@")[0]
        : "";

  const checks = effectiveHandle ? buildPlatformChecks() : [];

  const [platformResults, emailFindings] = await Promise.all([
    effectiveHandle
      ? Promise.all(checks.map((item) => item.check(effectiveHandle)))
      : Promise.resolve([]),
    cleanEmail ? inspectEmailOsint(cleanEmail) : Promise.resolve(null),
  ]);

  const webItems = platformResults.filter((item) => item.kind === "web");
  const appItems = platformResults.filter((item) => item.kind === "app");

  return {
    queriedAt: new Date().toISOString(),
    handle: effectiveHandle ? `@${effectiveHandle}` : "@no_indicado",
    durationMs: Date.now() - startedAt,
    platformsChecked: platformResults.length,
    foundCount: platformResults.filter((i) => i.status === "encontrado").length,
    blockedCount: platformResults.filter((i) => i.status === "bloqueado").length,
    webChecked: webItems.length,
    webFound: webItems.filter((i) => i.status === "encontrado").length,
    appChecked: appItems.length,
    appFound: appItems.filter((i) => i.status === "encontrado").length,
    platforms: platformResults,
    emailFindings,
  };
}
