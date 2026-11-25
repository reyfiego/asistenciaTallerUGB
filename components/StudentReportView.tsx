"use client";

import { useState } from "react";
import {
  BatteryCharging,
  Camera,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  Globe,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { sanitizeImageToJpegBlob } from "@/lib/exifSanitizer";
import { ES_TEXTS } from "@/lib/i18n/es";
import type { TelemetryRecord } from "@/lib/telemetryStore";

interface StudentReportViewProps {
  record: TelemetryRecord;
  selectedPhotoFile: File | null;
  onLogout: () => void;
}

function buildPersonalizedChecklist(record: TelemetryRecord): string[] {
  const items: string[] = [];
  if (!record.leyoTerminos) {
    items.push(
      "Antes de aceptar términos en una app o evento, busca apartados de ubicación, cámara, datos de dispositivo y uso de archivos multimedia."
    );
  }
  if (record.encuesta.metodo2fa !== "app") {
    items.push(
      "Activa la verificación en dos pasos con aplicación autenticadora (Google Authenticator o Authy) en lugar de SMS y solicita PIN de portabilidad a tu operadora."
    );
  }
  if (record.encuesta.historiasTiempoReal || record.fotoExif.tieneGps) {
    items.push(
      "Publica historias en diferido (después de salir del lugar) y limpia los metadatos EXIF antes de enviar fotos originales como archivo."
    );
  }
  if (record.encuesta.datosPersonalesVisibles) {
    items.push(
      "Evita dejar visibles en historias destacadas mascotas, documentos, familia cercana o fechas exactas que respondan preguntas de recuperación."
    );
  }
  if (record.encuesta.reutilizaClaves || record.longitudClave < 12) {
    items.push(
      "Utiliza contraseñas únicas de más de 14 caracteres por plataforma apoyándote en un gestor de contraseñas."
    );
  }
  return items;
}

export function StudentReportView({
  record,
  selectedPhotoFile,
  onLogout,
}: StudentReportViewProps) {
  const [sanitizeNotice, setSanitizeNotice] = useState<string | null>(null);
  const [sanitizeError, setSanitizeError] = useState<string | null>(null);

  const { educationalReport } = ES_TEXTS.registro;
  const checklist = buildPersonalizedChecklist(record);
  const isIosDevice = record.os.toLowerCase().includes("ios");

  async function handleDownloadCleanPhoto() {
    setSanitizeNotice(null);
    setSanitizeError(null);
    try {
      if (selectedPhotoFile) {
        const blob = await sanitizeImageToJpegBlob(selectedPhotoFile);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "foto-segura-sin-exif.jpg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setSanitizeNotice(educationalReport.sanitizeSuccess);
        return;
      }

      if (record.fotoExif.vistaPreviaBase64) {
        const link = document.createElement("a");
        link.href = record.fotoExif.vistaPreviaBase64;
        link.download = "foto-segura-sin-exif.jpg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setSanitizeNotice(educationalReport.sanitizeSuccess);
      }
    } catch (err) {
      setSanitizeError(
        err instanceof Error ? err.message : ES_TEXTS.exif.parseError
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl border border-rose-500/70 bg-rose-950/60 px-4 py-3 text-rose-200 shadow-[0_0_30px_rgba(244,63,94,0.25)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 font-mono text-xs font-bold tracking-wider sm:text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
              <span>{educationalReport.banner}</span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="shrink-0 rounded-lg border border-rose-400/40 bg-rose-950 px-2.5 py-1 font-mono text-xs text-rose-200 hover:bg-rose-900"
            >
              {educationalReport.logoutButton}
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {educationalReport.title}: {record.nombreCompleto}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
            {educationalReport.subtitle}
          </p>
        </div>

        {/* Sección 1: Lectura de condiciones */}
        <article className="rounded-2xl border border-amber-500/40 bg-slate-900/90 p-5">
          <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-amber-300">
            <FileText className="h-4 w-4" />
            {educationalReport.section1Title}
          </h2>
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3.5 text-sm text-amber-100">
            <p className="font-semibold">
              {record.abrioModalTerminos
                ? `Abriste el modal durante ${record.segundosLecturaTerminos} segundos.`
                : "Aceptaste las Condiciones sin abrir el documento."}
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              {record.leyoTerminos
                ? educationalReport.termsReadOk
                : educationalReport.termsUnreadAlert}
            </p>
          </div>
        </article>

        {/* Sección 2: Huella móvil y contraseña */}
        <article className="rounded-2xl border border-cyan-500/35 bg-slate-900/90 p-5">
          <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
            <Smartphone className="h-4 w-4" />
            {educationalReport.section2Title}
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <p className="font-mono text-[11px] text-slate-400">
                {educationalReport.deviceLabel}
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {record.modeloInferido}
              </p>
              <p className="mt-0.5 font-mono text-xs text-sky-300">
                {record.os} • {record.resolucionLogica}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <p className="font-mono text-[11px] text-slate-400">
                <Cpu className="mr-1 inline h-3 w-3" />
                {educationalReport.hardwareLabel}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-amber-300" title={record.gpu}>
                {record.gpu}
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-400">
                <BatteryCharging className="mr-1 inline h-3 w-3" />
                {record.bateria} • {record.nucleosCpu}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <p className="font-mono text-[11px] text-slate-400">
                <Globe className="mr-1 inline h-3 w-3" />
                {educationalReport.networkLabel}
              </p>
              <p className="mt-1 text-xs font-semibold text-white">{record.isp}</p>
              <p className="mt-0.5 font-mono text-xs text-cyan-300">
                {record.ipParcial}
              </p>
            </div>

            <div className="rounded-xl border border-rose-500/35 bg-rose-950/25 p-3.5">
              <p className="font-mono text-[11px] text-rose-300">
                <KeyRound className="mr-1 inline h-3 w-3" />
                {educationalReport.passwordLabel}
              </p>
              <p className="mt-1 font-mono text-base font-bold text-rose-200">
                {record.claveEnmascarada} ({record.longitudClave})
              </p>
              <p className="mt-0.5 font-mono text-xs text-amber-300">
                Crackeo: {record.tiempoCrackeo}
              </p>
            </div>
          </div>
        </article>

        {/* Sección 3: Metadatos EXIF de su foto */}
        <article className="rounded-2xl border border-cyan-500/35 bg-slate-900/90 p-5">
          <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
            <Camera className="h-4 w-4" />
            {educationalReport.section3Title}
          </h2>

          {record.fotoExif.subida ? (
            <div className="mt-3 space-y-3">
              {record.fotoExif.tieneGps &&
              record.fotoExif.latitud !== null &&
              record.fotoExif.longitud !== null ? (
                <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3.5 text-xs text-rose-100">
                  <p className="font-bold text-rose-300">
                    {educationalReport.photoGpsExposed}
                  </p>
                  <p className="mt-1 font-mono text-sm text-white">
                    {record.fotoExif.latitud}, {record.fotoExif.longitud}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-emerald-300">
                  {educationalReport.photoNoGps}
                </p>
              )}

              <div className="grid gap-2.5 font-mono text-xs sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <span className="text-slate-400">Cámara:</span>{" "}
                  <strong className="text-white">
                    {record.fotoExif.marca} • {record.fotoExif.modeloCamara}
                  </strong>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <span className="text-slate-400">Software:</span>{" "}
                  <strong className="text-amber-300">{record.fotoExif.software}</strong>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <span className="text-slate-400">Fecha original:</span>{" "}
                  <strong className="text-white">
                    {record.fotoExif.fechaOriginal}
                  </strong>
                </div>
              </div>

              {(selectedPhotoFile || record.fotoExif.vistaPreviaBase64) && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => void handleDownloadCleanPhoto()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-mono text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    <Download className="h-4 w-4" />
                    {educationalReport.sanitizePhotoButton}
                  </button>
                  {sanitizeNotice && (
                    <p className="mt-2 font-mono text-xs text-emerald-300">
                      {sanitizeNotice}
                    </p>
                  )}
                  {sanitizeError && (
                    <p className="mt-2 font-mono text-xs text-amber-300">
                      {sanitizeError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              Aún no habías completado la carga de fotografía en tu credencial.
            </p>
          )}
        </article>

        {/* Sección 4: Guía práctica para llevar */}
        <article className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              {educationalReport.section4Title}
            </h2>
            <span className="rounded-full border border-rose-500/50 bg-rose-500/15 px-3 py-1 font-mono text-xs font-bold text-rose-200">
              Exposición: {record.perfilPublico.nivelRiesgo} (
              {record.perfilPublico.puntajeRiesgo}/100)
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <p className="font-mono text-xs text-slate-400">
                {educationalReport.simSwapLabel}
              </p>
              <p
                className={`mt-1 font-mono text-sm font-bold ${
                  record.perfilPublico.riesgoSimSwap
                    ? "text-rose-300"
                    : "text-emerald-300"
                }`}
              >
                {record.perfilPublico.riesgoSimSwap ? "ALTO" : "CONTROLADO"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <p className="font-mono text-xs text-slate-400">
                {educationalReport.doxxingLabel}
              </p>
              <p
                className={`mt-1 font-mono text-sm font-bold ${
                  record.perfilPublico.riesgoDoxxing
                    ? "text-rose-300"
                    : "text-emerald-300"
                }`}
              >
                {record.perfilPublico.riesgoDoxxing ? "ALTO" : "BAJO"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3.5 text-xs text-cyan-100">
            <p className="font-bold text-cyan-300">
              Desactiva el GPS en la cámara de tu teléfono hoy mismo:
            </p>
            <p className="mt-1 leading-relaxed">
              {isIosDevice
                ? educationalReport.guides.iosGps
                : educationalReport.guides.androidGps}
            </p>
          </div>

          <p className="mt-4 text-xs font-semibold text-emerald-200">
            {educationalReport.takeawayIntro}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-emerald-100/90">
            {checklist.map((tip) => (
              <li
                key={tip}
                className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-slate-950/70 px-3.5 py-2.5 text-xs leading-relaxed"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
