// Autenticación HMAC-SHA256 sin estado compatible con Node.js y Edge/Proxy

export const INSTRUCTOR_COOKIE_NAME = "oc_instructor_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 horas para cubrir toda la jornada del taller

interface SessionPayload {
  role: "instructor";
  exp: number;
}

function getConfiguredAccessKey(): string | null {
  const key = process.env.INSTRUCTOR_ACCESS_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isServerAuthConfigured(): boolean {
  return getConfiguredAccessKey() !== null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + "=".repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function sha256(text: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(digest);
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const accessKey = getConfiguredAccessKey();
  if (!accessKey) {
    return null;
  }

  const explicitSecret = process.env.SESSION_SECRET?.trim();
  const rawMaterial =
    explicitSecret && explicitSecret.length >= 16
      ? explicitSecret
      : `oc-ugb-derived:${accessKey}`;

  const keyBytes = await sha256(rawMaterial);
  return crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Compara la clave enviada por el docente contra INSTRUCTOR_ACCESS_KEY en tiempo constante.
 */
export async function verifyInstructorAccessKey(candidate: string): Promise<boolean> {
  const configured = getConfiguredAccessKey();
  if (!configured || !candidate) {
    return false;
  }
  const [candidateHash, expectedHash] = await Promise.all([
    sha256(candidate.trim()),
    sha256(configured),
  ]);
  return constantTimeEqual(candidateHash, expectedHash);
}

/**
 * Emite un token firmado con expiración para la cookie HttpOnly del docente.
 */
export async function createInstructorSessionToken(): Promise<string | null> {
  const key = await getSigningKey();
  if (!key) {
    return null;
  }

  const payload: SessionPayload = {
    role: "instructor",
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = toBase64Url(payloadBytes);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  const signatureB64 = toBase64Url(new Uint8Array(signatureBuffer));
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Valida firma HMAC y expiración del token de sesión del docente.
 */
export async function verifyInstructorSessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) {
    return false;
  }
  const key = await getSigningKey();
  if (!key) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadB64, signatureB64] = parts;
  const signatureBytes = fromBase64Url(signatureB64);
  if (!signatureBytes) {
    return false;
  }

  const isSignatureValid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(payloadB64)
  );

  if (!isSignatureValid) {
    return false;
  }

  const payloadBytes = fromBase64Url(payloadB64);
  if (!payloadBytes) {
    return false;
  }

  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(payloadBytes)
    ) as Partial<SessionPayload>;
    if (decoded.role !== "instructor" || typeof decoded.exp !== "number") {
      return false;
    }
    return decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/**
 * Determina si la petición original llegó por HTTPS (incluyendo proxies como Vercel).
 */
export function isHttpsRequest(request: Request): boolean {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  return forwardedProto === "https" || request.url.startsWith("https://");
}

/**
 * Extrae una cookie específica desde la cabecera Cookie de un Request estándar.
 */
export function readCookieFromHeader(
  cookieHeader: string | null,
  cookieName: string
): string | null {
  if (!cookieHeader) {
    return null;
  }
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    if (name === cookieName) {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}
