// Utilidad 100% client-side para inferencia de dispositivo, WebGL GPU, batería e información de red

export interface DeviceFingerprint {
  inferredModel: string;
  os: string;
  logicalResolution: string;
  physicalResolution: string;
  devicePixelRatio: number;
  gpuRenderer: string;
  gpuVendor: string;
  cpuCores: string;
  language: string;
  timezone: string;
  batterySummary: string;
  connectionType: string;
  isp: string;
  ipMasked: string;
  approxLocation: string;
  networkStatus: "ok" | "fallback";
}

interface WebGLGpuInfo {
  renderer: string;
  vendor: string;
}

interface BatteryManagerLike {
  level: number;
  charging: boolean;
}

interface NavigatorWithExtras extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
  connection?: {
    effectiveType?: string;
    downlink?: number;
  };
}

/**
 * Extrae el renderizador y fabricante de GPU mediante un canvas WebGL oculto.
 */
export function getWebGLGpuInfo(): WebGLGpuInfo {
  if (typeof document === "undefined") {
    return { renderer: "No disponible", vendor: "No disponible" };
  }

  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      return { renderer: "WebGL no soportado", vendor: "Desconocido" };
    }

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    let renderer = "GPU genérica (oculta por navegador)";
    let vendor = "Desconocido";

    if (debugInfo) {
      const rawRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const rawVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      if (typeof rawRenderer === "string" && rawRenderer.trim().length > 0) {
        renderer = rawRenderer.trim();
      }
      if (typeof rawVendor === "string" && rawVendor.trim().length > 0) {
        vendor = rawVendor.trim();
      }
    } else {
      const fallbackRenderer = gl.getParameter(gl.RENDERER);
      if (typeof fallbackRenderer === "string" && fallbackRenderer.trim().length > 0) {
        renderer = fallbackRenderer.trim();
      }
    }

    // Liberar contexto WebGL para no consumir recursos del dispositivo
    const loseContextExt = gl.getExtension("WEBGL_lose_context");
    loseContextExt?.loseContext();

    return { renderer, vendor };
  } catch {
    return { renderer: "Bloqueado por política de privacidad", vendor: "Desconocido" };
  }
}

/**
 * Normaliza la resolución lógica en orientación vertical (menor x mayor).
 */
function getNormalizedScreenSize(): { width: number; height: number; dpr: number } {
  const rawW = Math.round(window.screen.width);
  const rawH = Math.round(window.screen.height);
  const dpr = Number((window.devicePixelRatio || 1).toFixed(2));
  return {
    width: Math.min(rawW, rawH),
    height: Math.max(rawW, rawH),
    dpr,
  };
}

/**
 * Mapea resoluciones lógicas de Apple + DPR para identificar modelos de iPhone.
 */
function inferAppleDeviceModel(width: number, height: number, dpr: number): string {
  const key = `${width}x${height}`;

  if ((key === "430x932" || key === "440x956") && dpr >= 3) {
    return "iPhone Pro Max / Plus (Serie 14/15/16)";
  }
  if (key === "428x926" && dpr >= 3) {
    return "iPhone 12/13 Pro Max / 14 Plus";
  }
  if (key === "402x874" && dpr >= 3) {
    return "iPhone 16 Pro";
  }
  if ((key === "393x852" || key === "390x844") && dpr >= 3) {
    return "iPhone Estándar / Pro (Serie 12/13/14/15)";
  }
  if (key === "414x896" && (dpr === 2 || dpr >= 3)) {
    return "iPhone XR / 11 / Max";
  }
  if (key === "375x812" && dpr >= 3) {
    return "iPhone X / XS / 12-13 Mini";
  }
  if (key === "375x667" && dpr === 2) {
    return "iPhone SE (2.ª/3.ª gen) / 8";
  }
  if (key === "320x568" && dpr === 2) {
    return "iPhone SE (1.ª gen) / 5s";
  }

  return `iPhone (${width}x${height} @${dpr}x)`;
}

/**
 * Extrae una pista legible de modelo Android desde navigator.userAgent si está presente.
 */
function inferAndroidDeviceModel(userAgent: string, width: number, height: number, dpr: number): string {
  const match = userAgent.match(/Android\s[\d.]+;\s*([^;)]+?)(?:\sBuild\/|\))/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (candidate !== "K" && candidate.length > 1) {
      return `Android (${candidate})`;
    }
  }
  return `Smartphone Android (${width}x${height} @${dpr}x)`;
}

/**
 * Determina el sistema operativo e infiere el modelo de dispositivo.
 */
function detectOsAndModel(
  userAgent: string,
  gpuRenderer: string,
  width: number,
  height: number,
  dpr: number
): { os: string; model: string } {
  const isIphoneUa = /iPhone|iPod/i.test(userAgent);
  const isIpadUa = /iPad/i.test(userAgent);
  const isAppleGpuMobile =
    /Apple GPU/i.test(gpuRenderer) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1;

  if (isIphoneUa || (isAppleGpuMobile && width <= 460)) {
    const iosMatch = userAgent.match(/OS\s(\d+[_\d]*)/i);
    const iosVersion = iosMatch ? ` ${iosMatch[1].replace(/_/g, ".")}` : "";
    return {
      os: `iOS${iosVersion}`,
      model: inferAppleDeviceModel(width, height, dpr),
    };
  }

  if (isIpadUa || isAppleGpuMobile) {
    return {
      os: "iPadOS",
      model: `Apple iPad (${width}x${height} @${dpr}x)`,
    };
  }

  if (/Android/i.test(userAgent)) {
    const androidMatch = userAgent.match(/Android\s([\d.]+)/i);
    const androidVersion = androidMatch ? ` ${androidMatch[1]}` : "";
    return {
      os: `Android${androidVersion}`,
      model: inferAndroidDeviceModel(userAgent, width, height, dpr),
    };
  }

  if (/Windows/i.test(userAgent)) {
    return {
      os: "Windows",
      model: `PC Windows (${window.screen.width}x${window.screen.height})`,
    };
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return {
      os: "macOS",
      model: `Apple Mac (${window.screen.width}x${window.screen.height})`,
    };
  }

  if (/Linux/i.test(userAgent)) {
    return {
      os: "Linux",
      model: `Equipo Linux (${window.screen.width}x${window.screen.height})`,
    };
  }

  return {
    os: "Desconocido",
    model: `Dispositivo genérico (${width}x${height})`,
  };
}

/**
 * Enmascara parcialmente una dirección IP para proteger la privacidad en proyector.
 */
export function maskIpAddress(ip?: string): string {
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

/**
 * Lee nivel de batería y estado de carga cuando la Battery Status API está disponible.
 */
async function getBatterySummary(): Promise<string> {
  if (typeof navigator === "undefined") {
    return "No expuesta";
  }
  const nav = navigator as NavigatorWithExtras;
  if (typeof nav.getBattery !== "function") {
    return "Bloqueada (Safari/Firefox)";
  }
  try {
    const battery = await nav.getBattery();
    const pct = Math.round(battery.level * 100);
    return `${pct}% (${battery.charging ? "cargando" : "batería"})`;
  } catch {
    return "No expuesta";
  }
}

/**
 * Lee tipo de red pasiva cuando Network Information API está disponible.
 */
function getConnectionType(): string {
  if (typeof navigator === "undefined") {
    return "No expuesta";
  }
  const nav = navigator as NavigatorWithExtras;
  const effectiveType = nav.connection?.effectiveType;
  if (!effectiveType) {
    return "No expuesta";
  }
  return effectiveType.toUpperCase();
}

/**
 * ISP y ubicación aproximada ya NO se consultan desde cada celular: el servidor las resuelve
 * una sola vez por IP (ver lib/ipGeoLookup.ts) y sobreescribe estos campos al registrar la
 * cuenta. Antes, cada celular llamaba directamente a ipapi.co desde el navegador; con un
 * salón completo detrás de la misma IP NAT, eso disparaba decenas de llamadas simultáneas a
 * la misma API gratuita y terminaba bloqueado, mostrando "No disponible" a casi todos.
 * Aquí solo devolvemos un valor provisional instantáneo; el servidor lo reemplaza al guardar.
 */
async function fetchNetworkInfo(fallbackLabel: string): Promise<{
  isp: string;
  ipMasked: string;
  approxLocation: string;
  networkStatus: "ok" | "fallback";
}> {
  return {
    isp: fallbackLabel,
    ipMasked: fallbackLabel,
    approxLocation: fallbackLabel,
    networkStatus: "fallback",
  };
}

/**
 * Recolecta la huella digital completa del navegador de forma local y sin permisos intrusivos.
 */
export async function collectDeviceFingerprint(
  networkFallbackLabel: string
): Promise<DeviceFingerprint> {
  const { width, height, dpr } = getNormalizedScreenSize();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const gpu = getWebGLGpuInfo();
  const { os, model } = detectOsAndModel(userAgent, gpu.renderer, width, height, dpr);

  const cpuCores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? `${navigator.hardwareConcurrency} núcleos lógicos`
      : "No expuesto";

  const language =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "No expuesto";

  let timezone = "No expuesta";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "No expuesta";
  } catch {
    timezone = "No expuesta";
  }

  const [batterySummary, network] = await Promise.all([
    getBatterySummary(),
    fetchNetworkInfo(networkFallbackLabel),
  ]);

  return {
    inferredModel: model,
    os,
    logicalResolution: `${width}×${height} (@${dpr}x)`,
    physicalResolution: `${Math.round(width * dpr)}×${Math.round(height * dpr)} px`,
    devicePixelRatio: dpr,
    gpuRenderer: gpu.renderer,
    gpuVendor: gpu.vendor,
    cpuCores,
    language,
    timezone,
    batterySummary,
    connectionType: getConnectionType(),
    isp: network.isp,
    ipMasked: network.ipMasked,
    approxLocation: network.approxLocation,
    networkStatus: network.networkStatus,
  };
}
