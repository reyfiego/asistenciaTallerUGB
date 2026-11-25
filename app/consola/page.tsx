"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Activity,
  Camera,
  Check,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileSearch,
  FileWarning,
  Lock,
  MapPin,
  Pause,
  Play,
  QrCode,
  Radio,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { ES_TEXTS } from "@/lib/i18n/es";
import type {
  TelemetryRecord,
  TelemetrySnapshot,
} from "@/lib/telemetryStore";

const EMPTY_SNAPSHOT: TelemetrySnapshot = {
  records: [],
  stats: {
    total: 0,
    iosCount: 0,
    androidCount: 0,
    otherCount: 0,
    iosPercentage: 0,
    androidPercentage: 0,
    credentialsCaptured: 0,
    acceptedWithoutReadingCount: 0,
    acceptedWithoutReadingPercentage: 0,
    gpsGrantedCount: 0,
    cameraGrantedCount: 0,
    notificationsGrantedCount: 0,
    clipboardGrantedCount: 0,
    photoUploadedCount: 0,
    photoWithGpsCount: 0,
    highRiskPublicCount: 0,
    simSwapVulnerableCount: 0,
    reusedPasswordsCount: 0,
    withoutApp2faCount: 0,
  },
  workshop: {
    revealActive: false,
    panicActive: false,
    acceptingSubmissions: true,
    storageEngine: "sqlite",
  },
};

function formatTime(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString("es-SV", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoDate;
  }
}

export default function ConsolaPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(EMPTY_SNAPSHOT);
  const [isPolling, setIsPolling] = useState(true);
  const [isPurging, setIsPurging] = useState(false);
  const [isUpdatingWorkshop, setIsUpdatingWorkshop] = useState(false);
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorBanner, setErrorBanner] = useState(false);
  const [purgedBanner, setPurgedBanner] = useState(false);

  // Modal QR proyectable
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [registroFullUrl, setRegistroFullUrl] = useState<string>("");
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Expediente individual seleccionado
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const loadTelemetry = useCallback(
    async (isCancelled?: () => boolean) => {
      try {
        const response = await fetch("/api/telemetria", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/acceso?next=/consola");
          return;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as TelemetrySnapshot;
        if (!isCancelled?.()) {
          setSnapshot(data);
          setErrorBanner(false);
        }
      } catch {
        if (!isCancelled?.()) {
          setErrorBanner(true);
        }
      }
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const initialTimer = setTimeout(() => {
      void loadTelemetry(isCancelled);
    }, 0);

    if (!isPolling) {
      return () => {
        cancelled = true;
        clearTimeout(initialTimer);
      };
    }

    const intervalId = setInterval(() => {
      void loadTelemetry(isCancelled);
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [isPolling, loadTelemetry]);

  async function handleOpenQrModal() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/`;
    setRegistroFullUrl(url);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 440,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
      setQrDataUrl(dataUrl);
      setIsQrModalOpen(true);
    } catch {
      setIsQrModalOpen(true);
    }
  }

  async function handleCopyUrl() {
    if (!registroFullUrl) return;
    try {
      await navigator.clipboard.writeText(registroFullUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignorar si portapapeles está restringido
    }
  }

  async function handleToggleWorkshopFlag(patch: {
    revealActive?: boolean;
    panicActive?: boolean;
    acceptingSubmissions?: boolean;
  }) {
    setIsUpdatingWorkshop(true);
    try {
      const res = await fetch("/api/taller", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        router.replace("/acceso?next=/consola");
        return;
      }
      if (res.ok) {
        await loadTelemetry();
      }
    } finally {
      setIsUpdatingWorkshop(false);
    }
  }

  async function handlePurgeDatabase() {
    setIsPurging(true);
    setPurgedBanner(false);
    try {
      const response = await fetch("/api/telemetria", {
        method: "DELETE",
      });
      if (response.status === 401) {
        router.replace("/acceso?next=/consola");
        return;
      }
      if (response.ok) {
        const data = (await response.json()) as TelemetrySnapshot;
        setSnapshot({
          records: data.records,
          stats: data.stats,
          workshop: data.workshop,
        });
        setSelectedStudentId(null);
        setPurgedBanner(true);
        setErrorBanner(false);
      }
    } catch {
      setErrorBanner(true);
    } finally {
      setIsPurging(false);
    }
  }

  const { stats, records, workshop } = snapshot;

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.nombreCompleto.toLowerCase().includes(q) ||
        r.correo.toLowerCase().includes(q) ||
        r.handleSocial.toLowerCase().includes(q) ||
        r.modeloInferido.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  const selectedStudent: TelemetryRecord | null = useMemo(() => {
    if (!selectedStudentId) return null;
    return records.find((r) => r.id === selectedStudentId) ?? null;
  }, [records, selectedStudentId]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Encabezado y Controles Maestros del Taller */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300">
              <Database className="h-3.5 w-3.5" />
              {ES_TEXTS.consola.badge} ({workshop.storageEngine.toUpperCase()})
            </span>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              {ES_TEXTS.consola.title}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              {ES_TEXTS.consola.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleOpenQrModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 font-mono text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.3)] transition hover:bg-cyan-400"
            >
              <QrCode className="h-4 w-4" />
              <span>{ES_TEXTS.consola.qrButton}</span>
            </button>

            <button
              type="button"
              disabled={isUpdatingWorkshop}
              onClick={() =>
                void handleToggleWorkshopFlag(
                  workshop.panicActive
                    ? { panicActive: false }
                    : { panicActive: true, revealActive: true }
                )
              }
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 font-mono text-xs font-bold transition ${
                workshop.panicActive
                  ? "border-rose-400 bg-rose-600/30 text-rose-200 hover:bg-rose-600/40"
                  : "border-rose-500/70 bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.35)] hover:bg-rose-500"
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>
                {workshop.panicActive
                  ? ES_TEXTS.consola.panicActiveButton
                  : ES_TEXTS.consola.panicInactiveButton}
              </span>
            </button>

            <button
              type="button"
              disabled={isUpdatingWorkshop}
              onClick={() =>
                void handleToggleWorkshopFlag({
                  revealActive: !workshop.revealActive,
                })
              }
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 font-mono text-xs font-bold transition ${
                workshop.revealActive
                  ? "border-amber-400/70 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                  : "border-emerald-500/60 bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-500"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {workshop.revealActive
                  ? ES_TEXTS.consola.revealActiveButton
                  : ES_TEXTS.consola.revealInactiveButton}
              </span>
            </button>
          </div>
        </div>

        {/* Barra secundaria de controles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isUpdatingWorkshop}
              onClick={() =>
                void handleToggleWorkshopFlag({
                  acceptingSubmissions: !workshop.acceptingSubmissions,
                })
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-xs font-semibold ${
                workshop.acceptingSubmissions
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-300"
              }`}
            >
              {workshop.acceptingSubmissions ? (
                <Unlock className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              <span>
                {workshop.acceptingSubmissions
                  ? ES_TEXTS.consola.submissionsOpenLabel
                  : ES_TEXTS.consola.submissionsClosedLabel}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPrivacyBlur((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200 hover:border-cyan-400/50"
            >
              {privacyBlur ? (
                <EyeOff className="h-3.5 w-3.5 text-amber-300" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-cyan-300" />
              )}
              <span>
                {privacyBlur
                  ? ES_TEXTS.consola.privacyBlurOn
                  : ES_TEXTS.consola.privacyBlurOff}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsPolling((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-xs ${
                isPolling
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              {isPolling ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span>{ES_TEXTS.consola.liveLabel}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>{ES_TEXTS.consola.pausedLabel}</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handlePurgeDatabase}
            disabled={isPurging}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/70 bg-rose-600 px-4 py-2 font-mono text-xs font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            <span>
              {isPurging
                ? ES_TEXTS.consola.purgingButton
                : `${ES_TEXTS.consola.purgeButtonPrefix} (${stats.total} ${ES_TEXTS.consola.purgeButtonSuffix})`}
            </span>
          </button>
        </div>
      </div>

      {purgedBanner && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 font-mono text-xs text-emerald-300"
        >
          {ES_TEXTS.consola.purgedNotice}
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 font-mono text-xs text-amber-300"
        >
          <Radio className="mr-2 inline h-3.5 w-3.5 animate-spin" />
          {ES_TEXTS.consola.fetchError}
        </div>
      )}

      {/* Métricas del Aula */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-cyan-300">
            <span>{ES_TEXTS.consola.stats.totalDevices}</span>
            <Smartphone className="h-4 w-4" />
          </div>
          <p className="mt-2 font-mono text-4xl font-extrabold text-white">
            {stats.total}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {stats.iosPercentage}% iOS / {stats.androidPercentage}% Android
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/40 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-amber-300">
            <span>{ES_TEXTS.consola.stats.acceptedUnread}</span>
            <FileWarning className="h-4 w-4" />
          </div>
          <p className="mt-2 font-mono text-4xl font-extrabold text-amber-200">
            {stats.acceptedWithoutReadingPercentage}%
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {stats.acceptedWithoutReadingCount} de {stats.total}
          </p>
        </div>

        <div className="rounded-2xl border border-rose-500/40 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-rose-300">
            <span>{ES_TEXTS.consola.stats.permissionsGranted}</span>
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5 font-mono text-4xl font-extrabold text-rose-200">
            <span>{stats.gpsGrantedCount}</span>
            <span className="text-slate-600">/</span>
            <span>{stats.cameraGrantedCount}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Ubicación GPS • Cámara
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/40 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-amber-300">
            <span>{ES_TEXTS.consola.stats.passwordHabits}</span>
            <Lock className="h-4 w-4" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5 font-mono text-4xl font-extrabold text-amber-200">
            <span>{stats.reusedPasswordsCount}</span>
            <span className="text-slate-600">/</span>
            <span>{stats.withoutApp2faCount}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Reutilizan clave • Sin App 2FA
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-cyan-300">
            <span>{ES_TEXTS.consola.stats.photosWithGps}</span>
            <Camera className="h-4 w-4" />
          </div>
          <p className="mt-2 font-mono text-4xl font-extrabold text-white">
            {stats.photoWithGpsCount}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            de {stats.photoUploadedCount} fotos adjuntas
          </p>
        </div>

        <div className="rounded-2xl border border-rose-500/45 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-rose-300">
            <span>{ES_TEXTS.consola.stats.publicRiskHigh}</span>
            <Activity className="h-4 w-4" />
          </div>
          <p className="mt-2 font-mono text-4xl font-extrabold text-rose-300">
            {stats.highRiskPublicCount}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {stats.simSwapVulnerableCount} expuestos a SIM Swap
          </p>
        </div>
      </section>

      {/* Buscador y Tabla de Estudiantes */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-900/90 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold text-cyan-300">
            <Terminal className="h-4 w-4" />
            <h2>{ES_TEXTS.consola.table.title}</h2>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={ES_TEXTS.consola.searchPlaceholder}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-1.5 pl-9 pr-3 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-mono text-base font-semibold text-slate-200">
              {ES_TEXTS.consola.table.emptyTitle}
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
              {ES_TEXTS.consola.table.emptyBody}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.photo}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.student}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.terms}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.device}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.photoExif}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.credential}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.publicRisk}</th>
                  <th className="px-3.5 py-3">{ES_TEXTS.consola.table.headers.detail}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRecords.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedStudentId(entry.id)}
                    className="cursor-pointer transition hover:bg-slate-900/85"
                  >
                    <td className="px-3.5 py-3">
                      {entry.fotoExif.vistaPreviaBase64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.fotoExif.vistaPreviaBase64}
                          alt={entry.nombreCompleto}
                          className="h-11 w-11 rounded-lg border border-slate-700 object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-[10px] text-slate-500">
                          {formatTime(entry.timestamp).slice(0, 5)}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="font-bold text-white">
                        {privacyBlur
                          ? `${entry.nombreCompleto.slice(0, 3)}***`
                          : entry.nombreCompleto}
                      </div>
                      <div className="text-[11px] text-cyan-300">
                        {privacyBlur ? entry.usuarioParcial : entry.correo} •{" "}
                        {privacyBlur ? entry.handleParcial : entry.handleSocial}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                          entry.leyoTerminos
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : "border-amber-500/50 bg-amber-500/15 text-amber-200"
                        }`}
                      >
                        {entry.leyoTerminos
                          ? `Leído (${entry.segundosLecturaTerminos}s)`
                          : `SIN LEER (${entry.segundosLecturaTerminos}s)`}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="font-semibold text-white">
                        {entry.modeloInferido} ({entry.os})
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {entry.isp} • {entry.ipParcial}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      {entry.fotoExif.subida ? (
                        <div>
                          <span
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                              entry.fotoExif.tieneGps
                                ? "border-rose-500/60 bg-rose-500/20 text-rose-200"
                                : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                            }`}
                          >
                            {entry.fotoExif.tieneGps ? "GPS EXIF SÍ" : "EXIF (sin GPS)"}
                          </span>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {entry.fotoExif.modeloCamara}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">Sin foto</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <div className="font-bold text-rose-300">
                        {entry.claveEnmascarada} ({entry.longitudClave})
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {entry.tiempoCrackeo}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                          entry.perfilPublico.nivelRiesgo === "CRÍTICO"
                            ? "border-rose-500/60 bg-rose-500/20 text-rose-200"
                            : entry.perfilPublico.nivelRiesgo === "ALTO"
                              ? "border-amber-500/50 bg-amber-500/20 text-amber-200"
                              : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {entry.perfilPublico.nivelRiesgo} (
                        {entry.perfilPublico.puntajeRiesgo}%)
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                        <FileSearch className="h-3.5 w-3.5" />
                        {ES_TEXTS.consola.table.viewDetailButton}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MODAL QR GIGANTE PARA PROYECTOR */}
      {isQrModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-lg rounded-3xl border border-cyan-500/40 bg-slate-900 p-8 text-center shadow-[0_0_60px_rgba(34,211,238,0.2)]">
            <h2 className="text-2xl font-bold text-white">
              {ES_TEXTS.consola.qrModal.title}
            </h2>
            <p className="mt-1.5 text-sm text-slate-300">
              {ES_TEXTS.consola.qrModal.subtitle}
            </p>

            {qrDataUrl && (
              <div className="mx-auto mt-6 inline-block rounded-2xl bg-white p-4 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="Código QR de registro"
                  className="h-72 w-72 sm:h-80 sm:w-80"
                />
              </div>
            )}

            <p className="mt-5 break-all rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 font-mono text-sm text-cyan-300">
              {registroFullUrl}
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => void handleCopyUrl()}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2.5 font-mono text-xs font-bold text-cyan-200 hover:bg-cyan-500/25"
              >
                {copiedUrl ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copiedUrl
                  ? ES_TEXTS.consola.qrModal.copiedButton
                  : ES_TEXTS.consola.qrModal.copyButton}
              </button>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="rounded-xl bg-slate-800 px-5 py-2.5 font-mono text-xs font-semibold text-white hover:bg-slate-700"
              >
                {ES_TEXTS.consola.qrModal.closeButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / DRAWER DE EXPEDIENTE TÉCNICO INDIVIDUAL */}
      {selectedStudent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
              <div>
                <p className="font-mono text-xs text-cyan-400">
                  {ES_TEXTS.consola.drawer.title}
                </p>
                <h2 className="text-xl font-bold text-white">
                  {privacyBlur
                    ? `${selectedStudent.nombreCompleto.slice(0, 3)}***`
                    : selectedStudent.nombreCompleto}{" "}
                  <span className="font-mono text-sm font-normal text-cyan-300">
                    ({privacyBlur ? selectedStudent.handleParcial : selectedStudent.handleSocial})
                  </span>
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/dossier?id=${encodeURIComponent(selectedStudent.id)}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 py-1.5 font-mono text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                >
                  <FileSearch className="h-4 w-4" />
                  {ES_TEXTS.consola.drawer.openDossierButton}
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedStudentId(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-300 hover:text-white"
                >
                  <X className="h-4 w-4" />
                  {ES_TEXTS.consola.drawer.closeButton}
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
              {/* 1. Identidad, Cuenta y Términos */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4">
                <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                  {ES_TEXTS.consola.drawer.identitySection}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 font-mono">
                  <div>
                    <span className="text-slate-400">Correo:</span>
                    <p className="mt-0.5 text-white">
                      {privacyBlur
                        ? selectedStudent.usuarioParcial
                        : selectedStudent.correo}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Lectura de Términos:</span>
                    <p className="mt-0.5 text-amber-300">
                      {selectedStudent.leyoTerminos ? "Leyó con scroll" : "Aceptó sin leer"}{" "}
                      ({selectedStudent.segundosLecturaTerminos}s)
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Contraseña evaluada:</span>
                    <p className="mt-0.5 text-rose-300">
                      {selectedStudent.claveEnmascarada} ({selectedStudent.longitudClave}{" "}
                      chars • {selectedStudent.tiempoCrackeo})
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Dispositivo Móvil */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4">
                <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                  {ES_TEXTS.consola.drawer.deviceSection}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 font-mono">
                  <div>
                    <span className="text-slate-400">Modelo / SO:</span>
                    <p className="mt-0.5 font-bold text-white">
                      {selectedStudent.modeloInferido} • {selectedStudent.os}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Pantalla (Lógica / Física):</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.resolucionLogica} / {selectedStudent.resolucionFisica}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">GPU WebGL:</span>
                    <p className="mt-0.5 text-amber-300">{selectedStudent.gpu}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">CPU / Batería / Red:</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.nucleosCpu} • {selectedStudent.bateria} •{" "}
                      {selectedStudent.conexion}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">ISP / IP:</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.isp} ({selectedStudent.ipParcial})
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Zona / Idioma:</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.ubicacionIp} • {selectedStudent.idiomaZona}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Metadatos EXIF completos de la Foto */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4">
                <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                  {ES_TEXTS.consola.drawer.photoSection}
                </h3>

                {!selectedStudent.fotoExif.subida ? (
                  <p className="mt-2 font-mono text-slate-400">
                    El estudiante aún no ha subido fotografía.
                  </p>
                ) : (
                  <div className="mt-3 space-y-4 font-mono">
                    {selectedStudent.fotoExif.vistaPreviaBase64 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedStudent.fotoExif.vistaPreviaBase64}
                        alt={selectedStudent.nombreCompleto}
                        className="max-h-60 rounded-xl border border-slate-700 bg-black object-contain"
                      />
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <span className="text-slate-400">Archivo:</span>
                        <p className="mt-0.5 text-white">
                          {selectedStudent.fotoExif.nombreArchivo} (
                          {selectedStudent.fotoExif.tamanoTexto})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Marca / Modelo cámara:</span>
                        <p className="mt-0.5 font-bold text-white">
                          {selectedStudent.fotoExif.marca} •{" "}
                          {selectedStudent.fotoExif.modeloCamara}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Lente:</span>
                        <p className="mt-0.5 text-white">
                          {selectedStudent.fotoExif.lente}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Software / SO:</span>
                        <p className="mt-0.5 text-amber-300">
                          {selectedStudent.fotoExif.software}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Fecha original captura:</span>
                        <p className="mt-0.5 text-white">
                          {selectedStudent.fotoExif.fechaOriginal}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Dimensiones / MIME:</span>
                        <p className="mt-0.5 text-white">
                          {selectedStudent.fotoExif.dimensiones} (
                          {selectedStudent.fotoExif.mimeType})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Óptica:</span>
                        <p className="mt-0.5 text-white">
                          {selectedStudent.fotoExif.apertura} •{" "}
                          {selectedStudent.fotoExif.tiempoExposicion} •{" "}
                          {selectedStudent.fotoExif.distanciaFocal} •{" "}
                          {selectedStudent.fotoExif.iso}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Flash / Orientación:</span>
                        <p className="mt-0.5 text-white">
                          {selectedStudent.fotoExif.flash} •{" "}
                          {selectedStudent.fotoExif.orientacion}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Coordenadas GPS EXIF:</span>
                        <p className="mt-0.5 font-bold text-rose-300">
                          {selectedStudent.fotoExif.tieneGps &&
                          selectedStudent.fotoExif.latitud !== null &&
                          selectedStudent.fotoExif.longitud !== null
                            ? privacyBlur
                              ? `${selectedStudent.fotoExif.latitud.toFixed(2)}**, ${selectedStudent.fotoExif.longitud.toFixed(2)}**`
                              : `${selectedStudent.fotoExif.latitud}, ${selectedStudent.fotoExif.longitud}`
                            : "Sin coordenadas GPS"}
                        </p>
                      </div>
                    </div>

                    {selectedStudent.fotoExif.tieneGps &&
                      selectedStudent.fotoExif.latitud !== null &&
                      selectedStudent.fotoExif.longitud !== null &&
                      !privacyBlur && (
                        <div className="space-y-2">
                          <a
                            href={`https://www.google.com/maps?q=${selectedStudent.fotoExif.latitud},${selectedStudent.fotoExif.longitud}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {ES_TEXTS.consola.drawer.openMapsLink}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <iframe
                            title="Mapa EXIF del expediente"
                            src={`https://maps.google.com/maps?q=${selectedStudent.fotoExif.latitud},${selectedStudent.fotoExif.longitud}&z=16&output=embed`}
                            className="h-64 w-full rounded-xl border border-slate-700"
                            loading="lazy"
                          />
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* 4. Encuesta y Riesgo de Figura Pública */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4">
                <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                  {ES_TEXTS.consola.drawer.surveySection}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-4 font-mono">
                  <div>
                    <span className="text-slate-400">Historias en tiempo real:</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.encuesta.historiasTiempoReal ? "SÍ" : "NO"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Mascotas/Fechas públicas:</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.encuesta.datosPersonalesVisibles ? "SÍ" : "NO"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Reutiliza contraseñas:</span>
                    <p className="mt-0.5 text-white">
                      {selectedStudent.encuesta.reutilizaClaves ? "SÍ" : "NO"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Método 2FA actual:</span>
                    <p className="mt-0.5 font-bold text-amber-300">
                      {selectedStudent.encuesta.metodo2fa.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Simulación Dinámica de Vulneración (Caso Figura Pública personalizado) */}
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4">
                <h3 className="font-mono text-xs font-bold uppercase text-rose-300">
                  {ES_TEXTS.consola.drawer.attackSimSection}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 font-mono text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <span className="text-[10px] font-bold text-amber-300">
                      FASE 1 • RECONOCIMIENTO MÓVIL
                    </span>
                    <p className="mt-1 text-slate-300">
                      Usa un <strong className="text-white">{selectedStudent.modeloInferido}</strong> en{" "}
                      <strong className="text-white">{selectedStudent.isp}</strong>. Su contraseña de{" "}
                      {selectedStudent.longitudClave} caracteres se rompe en{" "}
                      <strong className="text-rose-300">{selectedStudent.tiempoCrackeo}</strong>
                      {selectedStudent.encuesta.reutilizaClaves
                        ? " y declaró reutilizar su misma clave base en otras plataformas."
                        : "."}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <span className="text-[10px] font-bold text-cyan-300">
                      FASE 2 • CORRELACIÓN DE RUTINA Y FOTO
                    </span>
                    <p className="mt-1 text-slate-300">
                      {selectedStudent.encuesta.historiasTiempoReal
                        ? "Publica historias en tiempo real desde los lugares que visita"
                        : "Mantiene reserva parcial de horarios"}
                      {selectedStudent.fotoExif.tieneGps
                        ? ` y su fotografía expuso coordenadas GPS (${selectedStudent.fotoExif.origenGps.toUpperCase()}).`
                        : `, con fotografía capturada en ${selectedStudent.fotoExif.modeloCamara}.`}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <span className="text-[10px] font-bold text-rose-300">
                      FASE 3 • VECTOR DE SECUESTRO DE CUENTA
                    </span>
                    <p className="mt-1 text-slate-300">
                      {selectedStudent.encuesta.metodo2fa === "app"
                        ? "Usa App Autenticadora (mitiga robo por SMS), por lo que el riesgo se concentra en sesiones web o phishing directo."
                        : `Al usar 2FA '${selectedStudent.encuesta.metodo2fa.toUpperCase()}'${
                            selectedStudent.encuesta.datosPersonalesVisibles
                              ? " y exponer fechas/mascotas en su perfil"
                              : ""
                          }, su cuenta es vulnerable a SIM Swapping o restablecimiento dirigido.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
