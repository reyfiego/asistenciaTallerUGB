// Motor OSINT ligero en Node.js para consultar presencia pública de @handle y correo
// sin depender de binarios externos, con timeouts cortos para uso en vivo durante el taller.

import { createHash } from "node:crypto";

export type OsintMatchStatus = "encontrado" | "no_encontrado" | "bloqueado";

export interface OsintPlatformResult {
  platform: string;
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
  platforms: OsintPlatformResult[];
  emailFindings: OsintEmailFindings | null;
}

interface PlatformCheckDef {
  platform: string;
  category: string;
  buildUrl: (username: string) => string;
  check: (username: string) => Promise<OsintPlatformResult>;
}

const REQUEST_TIMEOUT_MS = 4000;
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
  category: string,
  buildUrl: (username: string) => string,
  options?: {
    notFoundMarkers?: string[];
    foundMarkers?: string[];
  }
): PlatformCheckDef {
  return {
    platform,
    category,
    buildUrl,
    async check(username: string): Promise<OsintPlatformResult> {
      const url = buildUrl(username);
      try {
        const res = await fetchWithTimeout(url);
        if (res.status === 404 || res.status === 410) {
          return { platform, category, url, status: "no_encontrado" };
        }
        if (res.status === 403 || res.status === 429 || res.status >= 500) {
          return {
            platform,
            category,
            url,
            status: "bloqueado",
            detail: `HTTP ${res.status}`,
          };
        }
        if (!res.ok) {
          return {
            platform,
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
          return { platform, category, url, status: "no_encontrado" };
        }

        if (options?.foundMarkers && options.foundMarkers.length > 0) {
          const hasMatch = options.foundMarkers.some((marker) =>
            lower.includes(marker.toLowerCase())
          );
          if (!hasMatch) {
            return { platform, category, url, status: "no_encontrado" };
          }
        }

        return { platform, category, url, status: "encontrado" };
      } catch {
        return {
          platform,
          category,
          url,
          status: "bloqueado",
          detail: "Tiempo agotado o red bloqueada",
        };
      }
    },
  };
}

function buildPlatformChecks(): PlatformCheckDef[] {
  return [
    {
      platform: "GitHub",
      category: "Desarrollo",
      buildUrl: (u) => `https://github.com/${encodeURIComponent(u)}`,
      async check(username: string): Promise<OsintPlatformResult> {
        const profileUrl = `https://github.com/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            { headers: { Accept: "application/vnd.github+json" } }
          );
          if (res.status === 404) {
            return {
              platform: "GitHub",
              category: "Desarrollo",
              url: profileUrl,
              status: "no_encontrado",
            };
          }
          if (!res.ok) {
            return {
              platform: "GitHub",
              category: "Desarrollo",
              url: profileUrl,
              status: "bloqueado",
              detail: `HTTP ${res.status}`,
            };
          }
          const data = (await res.json()) as {
            name?: string | null;
            public_repos?: number;
            followers?: number;
          };
          const parts = [
            data.name ? `Nombre: ${data.name}` : null,
            typeof data.public_repos === "number"
              ? `${data.public_repos} repos`
              : null,
            typeof data.followers === "number"
              ? `${data.followers} seguidores`
              : null,
          ].filter(Boolean);
          return {
            platform: "GitHub",
            category: "Desarrollo",
            url: profileUrl,
            status: "encontrado",
            detail: parts.join(" • ") || "Perfil público",
          };
        } catch {
          return {
            platform: "GitHub",
            category: "Desarrollo",
            url: profileUrl,
            status: "bloqueado",
            detail: "Tiempo agotado",
          };
        }
      },
    },
    {
      platform: "Reddit",
      category: "Foros",
      buildUrl: (u) => `https://www.reddit.com/user/${encodeURIComponent(u)}`,
      async check(username: string): Promise<OsintPlatformResult> {
        const profileUrl = `https://www.reddit.com/user/${encodeURIComponent(username)}`;
        try {
          const res = await fetchWithTimeout(
            `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`
          );
          if (res.status === 404) {
            return {
              platform: "Reddit",
              category: "Foros",
              url: profileUrl,
              status: "no_encontrado",
            };
          }
          if (!res.ok) {
            return {
              platform: "Reddit",
              category: "Foros",
              url: profileUrl,
              status: "bloqueado",
              detail: `HTTP ${res.status}`,
            };
          }
          const data = (await res.json()) as {
            data?: { total_karma?: number; is_suspended?: boolean };
          };
          if (data.data?.is_suspended) {
            return {
              platform: "Reddit",
              category: "Foros",
              url: profileUrl,
              status: "encontrado",
              detail: "Cuenta suspendida",
            };
          }
          return {
            platform: "Reddit",
            category: "Foros",
            url: profileUrl,
            status: "encontrado",
            detail:
              typeof data.data?.total_karma === "number"
                ? `Karma: ${data.data.total_karma}`
                : "Perfil activo",
          };
        } catch {
          return {
            platform: "Reddit",
            category: "Foros",
            url: profileUrl,
            status: "bloqueado",
            detail: "Tiempo agotado",
          };
        }
      },
    },
    makeStatusChecker(
      "TikTok",
      "Social",
      (u) => `https://www.tiktok.com/@${encodeURIComponent(u)}`,
      {
        notFoundMarkers: ["couldn't find this account", "no se pudo encontrar esta cuenta"],
      }
    ),
    makeStatusChecker(
      "Instagram",
      "Social",
      (u) => `https://www.instagram.com/${encodeURIComponent(u)}/`,
      {
        notFoundMarkers: ["sorry, this page isn't available", "esta página no está disponible"],
      }
    ),
    makeStatusChecker(
      "Telegram",
      "Mensajería",
      (u) => `https://t.me/${encodeURIComponent(u)}`,
      {
        foundMarkers: ["tgme_page_title"],
        notFoundMarkers: ["if you have telegram, you can contact"],
      }
    ),
    makeStatusChecker(
      "YouTube",
      "Video",
      (u) => `https://www.youtube.com/@${encodeURIComponent(u)}`
    ),
    makeStatusChecker(
      "Twitch",
      "Streaming",
      (u) => `https://www.twitch.tv/${encodeURIComponent(u)}`,
      {
        foundMarkers: ["og:title"],
      }
    ),
    makeStatusChecker(
      "Pinterest",
      "Social",
      (u) => `https://www.pinterest.com/${encodeURIComponent(u)}/`,
      {
        notFoundMarkers: ["user not found", "page not found"],
      }
    ),
    makeStatusChecker(
      "GitLab",
      "Desarrollo",
      (u) => `https://gitlab.com/${encodeURIComponent(u)}`,
      {
        notFoundMarkers: ["sign in · gitlab"],
      }
    ),
    makeStatusChecker(
      "DEV Community",
      "Desarrollo",
      (u) => `https://dev.to/${encodeURIComponent(u)}`
    ),
    makeStatusChecker(
      "Medium",
      "Publicaciones",
      (u) => `https://medium.com/@${encodeURIComponent(u)}`,
      {
        notFoundMarkers: ["page not found", "404"],
      }
    ),
    makeStatusChecker(
      "Linktree",
      "Bio / Enlaces",
      (u) => `https://linktr.ee/${encodeURIComponent(u)}`,
      {
        notFoundMarkers: ["the page you're looking for doesn't exist"],
      }
    ),
    makeStatusChecker(
      "SoundCloud",
      "Audio",
      (u) => `https://soundcloud.com/${encodeURIComponent(u)}`
    ),
    makeStatusChecker(
      "Steam",
      "Gaming",
      (u) => `https://steamcommunity.com/id/${encodeURIComponent(u)}`,
      {
        notFoundMarkers: ["the specified profile could not be found"],
      }
    ),
    makeStatusChecker(
      "Vimeo",
      "Video",
      (u) => `https://vimeo.com/${encodeURIComponent(u)}`
    ),
    makeStatusChecker(
      "Behance",
      "Portafolio",
      (u) => `https://www.behance.net/${encodeURIComponent(u)}`
    ),
    makeStatusChecker(
      "Roblox",
      "Gaming",
      (u) => `https://www.roblox.com/users/profile?username=${encodeURIComponent(u)}`
    ),
    makeStatusChecker(
      "Chess.com",
      "Comunidad",
      (u) => `https://www.chess.com/member/${encodeURIComponent(u)}`
    ),
  ];
}

async function inspectEmailOsint(email: string): Promise<OsintEmailFindings> {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.includes("@") ? normalized.split("@")[1] : "";
  const providerType: OsintEmailFindings["providerType"] = domain.endsWith(".edu") ||
    domain.includes(".edu.")
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
      // Ignorar error de parseo en Gravatar
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
 * Ejecuta un escaneo OSINT en vivo por @handle y/o correo electrónico.
 */
export async function runLiveOsintLookup(input: {
  handle?: string;
  email?: string;
}): Promise<OsintLookupReport> {
  const startedAt = Date.now();
  const rawHandle = (input.handle ?? "").trim().replace(/^@+/, "");
  const cleanEmail = (input.email ?? "").trim();

  // Si no indicó @handle o dejó "@no_indicado", derivamos el alias base del correo
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

  const foundCount = platformResults.filter(
    (item) => item.status === "encontrado"
  ).length;
  const blockedCount = platformResults.filter(
    (item) => item.status === "bloqueado"
  ).length;

  return {
    queriedAt: new Date().toISOString(),
    handle: effectiveHandle ? `@${effectiveHandle}` : "@no_indicado",
    durationMs: Date.now() - startedAt,
    platformsChecked: platformResults.length,
    foundCount,
    blockedCount,
    platforms: platformResults,
    emailFindings,
  };
}
