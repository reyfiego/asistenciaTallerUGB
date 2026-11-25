// Resolución de ISP/ubicación aproximada por IP, ejecutada en el SERVIDOR (no en cada celular).
//
// Antes, cada celular llamaba directamente a ipapi.co desde el navegador. En un salón
// completo detrás de la misma IP NAT de la universidad, eso generaba decenas de llamadas
// simultáneas a la misma API gratuita desde la misma IP en pocos segundos, lo que provoca
// bloqueo por límite de tasa y hace que la mayoría de alumnos termine mostrando
// "No disponible". Aquí se resuelve una sola vez por IP y se cachea en memoria, así que
// un salón entero comparte una sola consulta real a la API externa.

interface ResolvedNetworkInfo {
  isp: string;
  ipMasked: string;
  approxLocation: string;
}

interface CacheEntry {
  value: ResolvedNetworkInfo;
  expiresAt: number;
}

declare global {
  var ocIpGeoCache: Map<string, CacheEntry> | undefined;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos: suficiente para cubrir el pico de registros del salón
const FETCH_TIMEOUT_MS = 3500;

function getCache(): Map<string, CacheEntry> {
  if (!globalThis.ocIpGeoCache) {
    globalThis.ocIpGeoCache = new Map<string, CacheEntry>();
  }
  return globalThis.ocIpGeoCache;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  if (!value || value === "local" || value === "unknown") return true;
  if (value === "::1" || value === "127.0.0.1") return true;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  return false;
}

export function maskIpAddress(ip?: string | null): string {
  if (!ip || !ip.trim()) {
    return "No expuesta";
  }
  const trimmed = ip.trim();
  if (trimmed.includes(".")) {
    const octets = trimmed.split(".");
    if (octets.length === 4) {
      return `${octets[0]}.${octets[1]}.xxx.xxx`;
    }
  }
  if (trimmed.includes(":")) {
    const segments = trimmed.split(":");
    return `${segments.slice(0, 2).join(":")}:xxxx:xxxx`;
  }
  return "xxx.xxx.xxx.xxx";
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeoutId);
  }
}

interface IpapiCoResponse {
  ip?: string;
  org?: string;
  city?: string;
  region?: string;
  country_name?: string;
}

interface IpwhoIsResponse {
  success?: boolean;
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  connection?: { isp?: string };
}

async function tryIpapiCo(ip: string): Promise<ResolvedNetworkInfo | null> {
  try {
    const res = await fetchWithTimeout(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as IpapiCoResponse;
    const locationParts = [data.city, data.region, data.country_name].filter(
      (part): part is string => Boolean(part && part.trim())
    );
    if (locationParts.length === 0 && !data.org) return null;
    return {
      isp: data.org?.trim() || "No disponible",
      ipMasked: maskIpAddress(data.ip || ip),
      approxLocation: locationParts.length > 0 ? locationParts.join(", ") : "No disponible",
    };
  } catch {
    return null;
  }
}

async function tryIpwhoIs(ip: string): Promise<ResolvedNetworkInfo | null> {
  try {
    const res = await fetchWithTimeout(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as IpwhoIsResponse;
    if (data.success === false) return null;
    const locationParts = [data.city, data.region, data.country].filter(
      (part): part is string => Boolean(part && part.trim())
    );
    if (locationParts.length === 0 && !data.connection?.isp) return null;
    return {
      isp: data.connection?.isp?.trim() || "No disponible",
      ipMasked: maskIpAddress(data.ip || ip),
      approxLocation: locationParts.length > 0 ? locationParts.join(", ") : "No disponible",
    };
  } catch {
    return null;
  }
}

/**
 * Resuelve ISP + ubicación aproximada para una IP, con caché en memoria por IP
 * y una cadena de proveedores de respaldo si el primero falla o está limitado.
 */
export async function resolveNetworkInfoForIp(ip: string): Promise<ResolvedNetworkInfo> {
  const fallback: ResolvedNetworkInfo = {
    isp: "No disponible",
    ipMasked: maskIpAddress(ip),
    approxLocation: "No disponible",
  };

  if (isPrivateOrLocalIp(ip)) {
    return { ...fallback, approxLocation: "Red local / entorno de pruebas" };
  }

  const cache = getCache();
  const now = Date.now();
  const cached = cache.get(ip);
  if (cached && now < cached.expiresAt) {
    return cached.value;
  }

  const resolved = (await tryIpapiCo(ip)) ?? (await tryIpwhoIs(ip)) ?? fallback;
  cache.set(ip, { value: resolved, expiresAt: now + CACHE_TTL_MS });

  // Limpieza ocasional para no crecer sin límite durante una jornada larga
  if (cache.size > 500) {
    for (const [key, entry] of cache.entries()) {
      if (now >= entry.expiresAt) cache.delete(key);
    }
  }

  return resolved;
}
