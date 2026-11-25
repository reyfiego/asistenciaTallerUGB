// Utilidad 100% client-side para extraer el diccionario completo EXIF/TIFF/GPS y sanitizar imágenes

import exifr from "exifr";

export interface ExtractedExifSummary {
  hasAnyExif: boolean;
  hasGps: boolean;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  make: string;
  model: string;
  lensModel: string;
  software: string;
  dateTimeOriginal: string;
  aperture: string;
  focalLength: string;
  iso: string;
  exposureTime: string;
  flash: string;
  orientation: string;
  dimensions: string;
  mimeType: string;
}

function readNaturalImageSize(
  objectUrl: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

function formatDateValue(value: unknown, fallback: string): string {
  if (!value) return fallback;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString("es-SV", {
      dateStyle: "long",
      timeStyle: "medium",
    });
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function formatExposureTime(value: unknown, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  if (value >= 1) {
    return `${value.toFixed(1)} s`;
  }
  return `1/${Math.round(1 / value)} s`;
}

function readCleanString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

/**
 * Extrae todos los metadatos EXIF, TIFF, óptica y GPS disponibles en la imagen.
 */
export async function inspectImageExif(
  file: File,
  unavailableLabel: string
): Promise<ExtractedExifSummary> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const parsed = (await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
    })) as Record<string, unknown> | undefined;

    const exifWidth =
      typeof parsed?.ExifImageWidth === "number"
        ? parsed.ExifImageWidth
        : typeof parsed?.ImageWidth === "number"
          ? parsed.ImageWidth
          : null;
    const exifHeight =
      typeof parsed?.ExifImageHeight === "number"
        ? parsed.ExifImageHeight
        : typeof parsed?.ImageHeight === "number"
          ? parsed.ImageHeight
          : null;

    let dimensions: string = unavailableLabel;
    if (exifWidth && exifHeight) {
      dimensions = `${exifWidth} × ${exifHeight} px`;
    } else {
      const natural = await readNaturalImageSize(objectUrl);
      if (natural) {
        dimensions = `${natural.width} × ${natural.height} px`;
      }
    }

    const latitude =
      typeof parsed?.latitude === "number" && Number.isFinite(parsed.latitude)
        ? Number(parsed.latitude.toFixed(6))
        : null;
    const longitude =
      typeof parsed?.longitude === "number" && Number.isFinite(parsed.longitude)
        ? Number(parsed.longitude.toFixed(6))
        : null;
    const altitude =
      typeof parsed?.GPSAltitude === "number" && Number.isFinite(parsed.GPSAltitude)
        ? Math.round(parsed.GPSAltitude)
        : null;

    return {
      hasAnyExif: Boolean(parsed && Object.keys(parsed).length > 0),
      hasGps: latitude !== null && longitude !== null,
      latitude,
      longitude,
      altitude,
      make: readCleanString(parsed?.Make, unavailableLabel),
      model: readCleanString(parsed?.Model, unavailableLabel),
      lensModel: readCleanString(parsed?.LensModel, unavailableLabel),
      software: readCleanString(parsed?.Software, unavailableLabel),
      dateTimeOriginal: formatDateValue(
        parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? parsed?.ModifyDate,
        unavailableLabel
      ),
      aperture:
        typeof parsed?.FNumber === "number" ? `f/${parsed.FNumber}` : unavailableLabel,
      focalLength:
        typeof parsed?.FocalLength === "number"
          ? `${parsed.FocalLength} mm`
          : unavailableLabel,
      iso: typeof parsed?.ISO === "number" ? `ISO ${parsed.ISO}` : unavailableLabel,
      exposureTime: formatExposureTime(parsed?.ExposureTime, unavailableLabel),
      flash: readCleanString(parsed?.Flash, unavailableLabel),
      orientation: readCleanString(parsed?.Orientation, unavailableLabel),
      dimensions,
      mimeType: file.type || "image/unknown",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Genera una miniatura JPEG ligera en Base64 (máx. 640px) para visualizar la foto subida
 * en el panel del docente e inspector EXIF (en iOS convierte HEIC a JPEG automáticamente).
 */
export async function createCompactPhotoDataUrl(
  file: File,
  maxDimension = 640
): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("No decodificable"));
      element.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Re-renderiza únicamente los píxeles en un canvas local para eliminar el 100% de EXIF/GPS.
 * En navegadores de escritorio que no decodifican .HEIC de forma nativa lanza un error descriptivo.
 */
export async function sanitizeImageToJpegBlob(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(
          new Error(
            "Este navegador no decodifica píxeles HEIC de forma nativa (Safari en iPhone/Mac sí lo soporta; en Windows usa JPG/PNG para sanitizar)."
          )
        );
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Contexto 2D no disponible.");
    }

    ctx.drawImage(img, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("No se pudo generar la imagen sanitizada."));
          }
        },
        "image/jpeg",
        0.92
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
