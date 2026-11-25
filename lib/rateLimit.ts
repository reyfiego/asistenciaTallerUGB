// Limitador de tasa ligero en memoria para proteger endpoints públicos en el aula

interface RateBucket {
  count: number;
  resetAt: number;
}

declare global {
  var ocRateBuckets: Map<string, RateBucket> | undefined;
}

function getBuckets(): Map<string, RateBucket> {
  if (!globalThis.ocRateBuckets) {
    globalThis.ocRateBuckets = new Map<string, RateBucket>();
  }
  return globalThis.ocRateBuckets;
}

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/**
 * Devuelve true si la petición está dentro del límite permitido para la ventana indicada.
 */
export function checkRateLimit(
  namespace: string,
  clientKey: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const buckets = getBuckets();
  const now = Date.now();
  const key = `${namespace}:${clientKey}`;
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Limpieza ocasional para evitar crecimiento indefinido
    if (buckets.size > 2000) {
      for (const [k, v] of buckets.entries()) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }
    return true;
  }

  if (current.count >= maxRequests) {
    return false;
  }

  current.count += 1;
  return true;
}
