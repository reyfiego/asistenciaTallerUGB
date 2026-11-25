"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  Camera,
  Clock,
  Download,
  ExternalLink,
  FileImage,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import {
  inspectImageExif,
  sanitizeImageToJpegBlob,
  type ExtractedExifSummary,
} from "@/lib/exifSanitizer";
import { ES_TEXTS } from "@/lib/i18n/es";
import type { TelemetryRecord, TelemetrySnapshot } from "@/lib/telemetryStore";

interface ManualExifReport extends ExtractedExifSummary {
  fileName: string;
  fileSizeLabel: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export default function ExifPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Galería en vivo de fotos subidas por los estudiantes en SQLite
  const [participantPhotos, setParticipantPhotos] = useState<TelemetryRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isRefreshingGallery, setIsRefreshingGallery] = useState(false);

  // Inspector manual de archivo suelto desde la PC del docente
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [sanitizedDone, setSanitizedDone] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [manualPreviewUrl, setManualPreviewUrl] = useState<string | null>(null);
  const [manualSourceFile, setManualSourceFile] = useState<File | null>(null);
  const [manualReport, setManualReport] = useState<ManualExifReport | null>(null);

  const loadStudentPhotos = useCallback(async () => {
    setIsRefreshingGallery(true);
    try {
      const res = await fetch("/api/telemetria", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/acceso?next=/exif");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as TelemetrySnapshot;
      const withPhotos = data.records.filter((r) => r.fotoExif.subida);
      setParticipantPhotos(withPhotos);
      setSelectedStudentId((prev) => {
        if (prev && withPhotos.some((p) => p.id === prev)) return prev;
        return withPhotos.length > 0 ? withPhotos[0].id : null;
      });
    } finally {
      setIsRefreshingGallery(false);
    }
  }, [router]);

  useEffect(() => {
    const initial = setTimeout(() => {
      void loadStudentPhotos();
    }, 0);
    const interval = setInterval(() => {
      void loadStudentPhotos();
    }, 4000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [loadStudentPhotos]);

  useEffect(() => {
    return () => {
      if (manualPreviewUrl) {
        URL.revokeObjectURL(manualPreviewUrl);
      }
    };
  }, [manualPreviewUrl]);

  async function processManualFile(file: File) {
    setParseError(null);
    setSanitizedDone(false);
    setPreviewFailed(false);
    setIsParsing(true);
    setManualSourceFile(file);
    setSelectedStudentId(null);

    if (manualPreviewUrl) {
      URL.revokeObjectURL(manualPreviewUrl);
    }
    const nextUrl = URL.createObjectURL(file);
    setManualPreviewUrl(nextUrl);

    try {
      const summary = await inspectImageExif(file, ES_TEXTS.exif.fields.unavailable);
      setManualReport({
        ...summary,
        fileName: file.name,
        fileSizeLabel: formatBytes(file.size),
      });
    } catch {
      setManualReport(null);
      setParseError(ES_TEXTS.exif.parseError);
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSanitizeManual() {
    if (!manualSourceFile) return;
    setParseError(null);
    setIsSanitizing(true);
    try {
      const cleanBlob = await sanitizeImageToJpegBlob(manualSourceFile);
      const url = URL.createObjectURL(cleanBlob);
      const link = document.createElement("a");
      const baseName = manualSourceFile.name.replace(/\.[^.]+$/, "");
      link.href = url;
      link.download = `${baseName}-sin-exif.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSanitizedDone(true);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : ES_TEXTS.exif.parseError);
    } finally {
      setIsSanitizing(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processManualFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processManualFile(file);
  }

  function clearManualFile() {
    if (manualPreviewUrl) URL.revokeObjectURL(manualPreviewUrl);
    setManualPreviewUrl(null);
    setManualSourceFile(null);
    setManualReport(null);
    setSanitizedDone(false);
    setPreviewFailed(false);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const activeStudent = selectedStudentId
    ? participantPhotos.find((p) => p.id === selectedStudentId) ?? null
    : null;

  // Vista unificada: o bien el estudiante seleccionado de SQLite, o bien el archivo manual arrastrado
  const activeDisplay = activeStudent
    ? {
        uploaderName: activeStudent.nombreCompleto,
        uploaderMeta: `${activeStudent.correo} • ${activeStudent.handleSocial}`,
        previewSrc: activeStudent.fotoExif.vistaPreviaBase64,
        fileName: activeStudent.fotoExif.nombreArchivo,
        fileSizeLabel: activeStudent.fotoExif.tamanoTexto,
        make: activeStudent.fotoExif.marca,
        model: activeStudent.fotoExif.modeloCamara,
        lensModel: activeStudent.fotoExif.lente,
        software: activeStudent.fotoExif.software,
        dateTimeOriginal: activeStudent.fotoExif.fechaOriginal,
        dimensions: activeStudent.fotoExif.dimensiones,
        aperture: activeStudent.fotoExif.apertura,
        exposureTime: activeStudent.fotoExif.tiempoExposicion,
        focalLength: activeStudent.fotoExif.distanciaFocal,
        iso: activeStudent.fotoExif.iso,
        hasAnyExif: activeStudent.fotoExif.tieneExif,
        hasGps:
          activeStudent.fotoExif.tieneGps &&
          activeStudent.fotoExif.latitud !== null &&
          activeStudent.fotoExif.longitud !== null,
        latitude: activeStudent.fotoExif.latitud,
        longitude: activeStudent.fotoExif.longitud,
        isManual: false,
      }
    : manualReport
      ? {
          uploaderName: "Archivo local de demostración",
          uploaderMeta: `${manualReport.fileName} (${manualReport.fileSizeLabel})`,
          previewSrc: manualPreviewUrl,
          fileName: manualReport.fileName,
          fileSizeLabel: manualReport.fileSizeLabel,
          make: manualReport.make,
          model: manualReport.model,
          lensModel: manualReport.lensModel,
          software: manualReport.software,
          dateTimeOriginal: manualReport.dateTimeOriginal,
          dimensions: manualReport.dimensions,
          aperture: manualReport.aperture,
          exposureTime: manualReport.exposureTime,
          focalLength: manualReport.focalLength,
          iso: manualReport.iso,
          hasAnyExif: manualReport.hasAnyExif,
          hasGps:
            manualReport.hasGps &&
            manualReport.latitude !== null &&
            manualReport.longitude !== null,
          latitude: manualReport.latitude,
          longitude: manualReport.longitude,
          isManual: true,
        }
      : null;

  const googleMapsUrl =
    activeDisplay?.hasGps && activeDisplay.latitude !== null && activeDisplay.longitude !== null
      ? `https://www.google.com/maps?q=${activeDisplay.latitude},${activeDisplay.longitude}`
      : "";
  const googleMapsEmbedUrl =
    activeDisplay?.hasGps && activeDisplay.latitude !== null && activeDisplay.longitude !== null
      ? `https://maps.google.com/maps?q=${activeDisplay.latitude},${activeDisplay.longitude}&z=16&output=embed`
      : "";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300">
            <Camera className="h-3.5 w-3.5" />
            {ES_TEXTS.exif.badge}
          </span>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            {ES_TEXTS.exif.title}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-slate-300">
            {ES_TEXTS.exif.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadStudentPhotos()}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingGallery ? "animate-spin" : ""}`} />
          Actualizar fotos ({participantPhotos.length})
        </button>
      </div>

      {/* GALERÍA EN VIVO DE FOTOS SUBIDAS POR ESTUDIANTES */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
        <h2 className="font-mono text-sm font-bold text-cyan-300">
          {ES_TEXTS.exif.uploadedGalleryTitle} ({participantPhotos.length})
        </h2>

        {participantPhotos.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{ES_TEXTS.exif.uploadedEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {participantPhotos.map((student) => {
              const isSelected = selectedStudentId === student.id;
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => {
                    clearManualFile();
                    setSelectedStudentId(student.id);
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-cyan-400 bg-cyan-500/15 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                      : "border-slate-800 bg-slate-950/80 hover:border-slate-600"
                  }`}
                >
                  {student.fotoExif.vistaPreviaBase64 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={student.fotoExif.vistaPreviaBase64}
                      alt={student.nombreCompleto}
                      className="h-14 w-14 shrink-0 rounded-lg border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-500">
                      <FileImage className="h-6 w-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {student.nombreCompleto}
                    </p>
                    <p className="truncate font-mono text-[11px] text-cyan-300">
                      {student.handleSocial}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          student.fotoExif.tieneGps
                            ? "bg-rose-500/25 text-rose-200"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {student.fotoExif.tieneGps ? "GPS EXIF" : student.fotoExif.modeloCamara}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* DETALLE EXIF GIGANTE DE LA FOTO SELECCIONADA */}
      {activeDisplay && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/40 bg-slate-900/90 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                <User className="h-5 w-5" />
              </span>
              <div>
                <p className="font-mono text-xs text-slate-400">
                  {ES_TEXTS.exif.uploadedByLabel}
                </p>
                <p className="text-lg font-bold text-white">{activeDisplay.uploaderName}</p>
                <p className="font-mono text-xs text-cyan-300">{activeDisplay.uploaderMeta}</p>
              </div>
            </div>

            {activeDisplay.isManual && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSanitizeManual()}
                  disabled={isSanitizing}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {isSanitizing ? ES_TEXTS.exif.sanitizingButton : ES_TEXTS.exif.sanitizeButton}
                </button>
                <button
                  type="button"
                  onClick={clearManualFile}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300 hover:border-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                  {ES_TEXTS.exif.clearButton}
                </button>
              </div>
            )}
          </div>

          {sanitizedDone && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 font-mono text-xs text-emerald-300">
              {ES_TEXTS.exif.sanitizedDone}
            </div>
          )}

          {activeDisplay.hasGps ? (
            <div className="rounded-2xl border border-rose-500/60 bg-rose-950/45 p-5 shadow-[0_0_35px_rgba(244,63,94,0.2)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertOctagon className="mt-0.5 h-7 w-7 shrink-0 text-rose-400" />
                  <div>
                    <h2 className="font-mono text-base font-bold text-rose-200 sm:text-lg">
                      {ES_TEXTS.exif.gpsAlertTitle}
                    </h2>
                    <p className="mt-1 text-sm text-rose-100/85">
                      {ES_TEXTS.exif.gpsAlertBody}
                    </p>
                  </div>
                </div>
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-mono text-xs font-bold text-white hover:bg-rose-500"
                >
                  <MapPin className="h-4 w-4" />
                  {ES_TEXTS.exif.openMapsButton}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                <div>
                  <h2 className="font-mono text-sm font-bold text-emerald-300">
                    {activeDisplay.hasAnyExif
                      ? ES_TEXTS.exif.noGpsBadge
                      : ES_TEXTS.exif.noExifWarningTitle}
                  </h2>
                  <p className="mt-1 text-sm text-emerald-100/80">
                    {ES_TEXTS.exif.noExifWarningBody}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5">
              <p className="flex items-center gap-1.5 font-mono text-xs text-cyan-300">
                <Smartphone className="h-4 w-4" />
                {ES_TEXTS.exif.fields.make} / {ES_TEXTS.exif.fields.model}
              </p>
              <p className="mt-2 text-2xl font-bold text-white">{activeDisplay.model}</p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {activeDisplay.make} • {activeDisplay.lensModel}
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5">
              <p className="font-mono text-xs text-cyan-300">
                {ES_TEXTS.exif.fields.software}
              </p>
              <p className="mt-2 text-2xl font-bold text-amber-300">
                {activeDisplay.software}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {activeDisplay.dimensions}
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5">
              <p className="flex items-center gap-1.5 font-mono text-xs text-cyan-300">
                <Clock className="h-4 w-4" />
                {ES_TEXTS.exif.fields.dateTime}
              </p>
              <p className="mt-2 text-lg font-bold text-white">
                {activeDisplay.dateTimeOriginal}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {activeDisplay.fileName} ({activeDisplay.fileSizeLabel})
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5">
              <p className="font-mono text-xs text-cyan-300">
                {ES_TEXTS.exif.fields.aperture}
              </p>
              <p className="mt-2 text-2xl font-bold text-white">
                {activeDisplay.aperture} • {activeDisplay.exposureTime}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {activeDisplay.focalLength} • {activeDisplay.iso}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <p className="mb-3 font-mono text-xs font-semibold text-slate-300">
                {ES_TEXTS.exif.previewTitle}
              </p>
              {activeDisplay.previewSrc && !previewFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeDisplay.previewSrc}
                  alt={activeDisplay.uploaderName}
                  onError={() => setPreviewFailed(true)}
                  className="max-h-[380px] w-full rounded-xl bg-slate-950 object-contain"
                />
              ) : (
                <div className="flex h-[380px] items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950 p-6 text-center text-xs text-slate-400">
                  {ES_TEXTS.exif.heicPreviewNotice}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-xs font-semibold text-slate-300">
                  {ES_TEXTS.exif.mapTitle}
                </p>
                {activeDisplay.hasGps && (
                  <span className="font-mono text-xs text-rose-300">
                    {activeDisplay.latitude?.toFixed(6)},{" "}
                    {activeDisplay.longitude?.toFixed(6)}
                  </span>
                )}
              </div>

              {activeDisplay.hasGps ? (
                <iframe
                  title="Ubicación GPS extraída"
                  src={googleMapsEmbedUrl}
                  className="h-[380px] w-full rounded-xl border border-slate-700"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="flex h-[380px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center">
                  <MapPin className="h-10 w-10 text-slate-600" />
                  <p className="mt-3 font-mono text-sm text-slate-400">
                    {ES_TEXTS.exif.noGpsBadge}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ZONA OPCIONAL PARA ARRASTRAR UN ARCHIVO LOCAL EXTRA */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
        <p className="mb-3 font-mono text-xs font-semibold text-slate-400">
          {ES_TEXTS.exif.manualSectionTitle}
        </p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
            isDragging
              ? "border-cyan-400 bg-cyan-500/10"
              : "border-slate-700 bg-slate-950/60 hover:border-cyan-500/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="hidden"
          />
          <Upload className="h-6 w-6 text-cyan-300" />
          <p className="mt-2 text-sm font-bold text-white">
            {isParsing ? ES_TEXTS.exif.parsingLabel : ES_TEXTS.exif.dropTitle}
          </p>
          <p className="mt-1 text-xs text-slate-400">{ES_TEXTS.exif.dropSubtitle}</p>
        </div>

        {parseError && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-2.5 text-xs text-amber-200">
            {parseError}
          </div>
        )}
      </section>
    </div>
  );
}
