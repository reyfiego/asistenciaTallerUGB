// Evaluador local de contraseñas y derivación criptográfica sin enviar texto plano por red

export type PasswordStrengthLevel = "critical" | "weak" | "moderate" | "strong";

export interface PasswordAuditResult {
  maskedPreview: string;
  length: number;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumbers: boolean;
  hasSymbols: boolean;
  crackTimeLabel: string;
  strengthLevel: PasswordStrengthLevel;
}

/**
 * Enmascara una contraseña mostrando únicamente los 2 primeros y 2 últimos caracteres.
 */
export function maskPasswordLocally(password: string): string {
  const length = password.length;
  if (length === 0) {
    return "";
  }
  if (length <= 2) {
    return "*".repeat(length);
  }
  if (length <= 5) {
    return `${password[0]}${"*".repeat(length - 2)}${password[length - 1]}`;
  }
  return `${password.slice(0, 2)}${"*".repeat(length - 4)}${password.slice(-2)}`;
}

/**
 * Enmascara un identificador o correo para modo censura en proyector.
 */
export function maskUsernameLocally(rawInput: string): string {
  const value = rawInput.trim();
  if (!value) {
    return "anonimo";
  }

  const atIndex = value.indexOf("@");
  if (atIndex > 0) {
    const localPart = value.slice(0, atIndex);
    const domain = value.slice(atIndex);
    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}***${domain}`;
  }

  const visiblePrefix = value.slice(0, Math.min(3, value.length));
  return `${visiblePrefix}***`;
}

/**
 * Deriva un digest SHA-256 en el navegador a partir de correo + contraseña para permitir
 * registro e inicio de sesión real sin transmitir jamás la contraseña en texto plano.
 */
export async function deriveClientAuthDigest(
  email: string,
  rawPassword: string
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const payload = new TextEncoder().encode(`oc-ugb-auth-v2:${normalizedEmail}:${rawPassword}`);
  const digestBuffer = await crypto.subtle.digest("SHA-256", payload);
  const bytes = new Uint8Array(digestBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatCrackDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds > 3.1536e12) {
    return "Miles de siglos";
  }
  if (seconds < 1) {
    return "Instantáneo (< 1 seg)";
  }
  if (seconds < 60) {
    return `~${Math.max(1, Math.round(seconds))} segundos`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `~${Math.round(minutes)} minutos`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `~${Math.round(hours)} horas`;
  }
  const days = hours / 24;
  if (days < 365) {
    return `~${Math.round(days)} días`;
  }
  const years = days / 365;
  if (years < 1000) {
    return `~${Math.round(years)} años`;
  }
  return "Siglos";
}

/**
 * Audita la complejidad de la contraseña en memoria local sin conservar el valor original.
 */
export function auditPasswordLocally(password: string): PasswordAuditResult {
  const length = password.length;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSymbols = /[^A-Za-z0-9]/.test(password);

  let charsetSize = 0;
  if (hasLowercase) charsetSize += 26;
  if (hasUppercase) charsetSize += 26;
  if (hasNumbers) charsetSize += 10;
  if (hasSymbols) charsetSize += 32;
  if (charsetSize === 0 && length > 0) charsetSize = 26;

  // Estimación asumiendo ataque offline con clúster GPU moderno (~10^10 intentos/seg)
  const guessesPerSecond = 1e10;
  const combinations = length > 0 ? Math.pow(charsetSize, length) : 0;
  const estimatedSeconds = combinations / guessesPerSecond;

  let strengthLevel: PasswordStrengthLevel = "critical";
  if (estimatedSeconds >= 3.1536e9 && length >= 12) {
    strengthLevel = "strong";
  } else if (estimatedSeconds >= 86400 * 30 && length >= 9) {
    strengthLevel = "moderate";
  } else if (estimatedSeconds >= 60 && length >= 6) {
    strengthLevel = "weak";
  }

  return {
    maskedPreview: maskPasswordLocally(password),
    length,
    hasUppercase,
    hasLowercase,
    hasNumbers,
    hasSymbols,
    crackTimeLabel: formatCrackDuration(estimatedSeconds),
    strengthLevel,
  };
}
