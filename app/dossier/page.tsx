"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ExternalLink,
  Fingerprint,
  Globe,
  Loader2,
  MapPin,
  MessageSquareWarning,
  Radar,
  RefreshCw,
  RotateCcw,
  Smartphone,
  UserCheck,
  Users,
} from "lucide-react";
import { VOLUNTEER_DOSSIER, type AttackSimulationStep } from "@/data/voluntaria";
import { ES_TEXTS } from "@/lib/i18n/es";
import type { OsintLookupReport } from "@/lib/osintLookup";
import type { TelemetryRecord, TelemetrySnapshot } from "@/lib/telemetryStore";

function buildLiveAttackSteps(
  student: TelemetryRecord,
  osint: OsintLookupReport | null
): AttackSimulationStep[] {
  const foundPlatforms =
    osint?.platforms
      .filter((p) => p.status === "encontrado")
      .map((p) => p.platform) ?? [];
  const platformSummary =
    foundPlatforms.length > 0
      ? foundPlatforms.slice(0, 4).join(", ")
      : "redes vinculadas al mismo alias";

  const hasGps =
    student.fotoExif.tieneGps &&
    student.fotoExif.latitud !== null &&
    student.fotoExif.longitud !== null;

  return [
    {
      stepNumber: "PASO 1",
      channel: "OSINT / Huella Digital",
      title: `Correlación de identidad sobre ${student.handleSocial}`,
      attackerAction: `Se cruza el correo ${student.correo} y el alias ${student.handleSocial} en plataformas públicas (${platformSummary}), además de su huella técnica (${student.modeloInferido}, ${student.os}).`,
      messagePreview: `Perfil identificado: ${student.nombreCompleto} • Red: ${student.isp} (${student.ubicacionIp}) • Clave evaluada: ${student.longitudClave} caracteres (${student.tiempoCrackeo}).`,
      consequence: student.encuesta.reutilizaClaves
        ? "Al reutilizar contraseñas entre plataformas, una filtración previa compromete múltiples cuentas de inmediato."
        : "El atacante ya cuenta con identidad verificada, dispositivo exacto y superficie de contacto.",
    },
    {
      stepNumber: "PASO 2",
      channel: hasGps ? "Metadatos EXIF / GPS" : "Ingeniería Social Dirigida",
      title: hasGps
        ? "Geolocalización y rutina diaria expuesta"
        : "Pretexto personalizado con datos reales",
      attackerAction: hasGps
        ? `La fotografía analizada conservaba coordenadas (${student.fotoExif.latitud}, ${student.fotoExif.longitud}) capturadas con ${student.fotoExif.modeloCamara}.`
        : `Se aprovecha el contexto de ${student.ubicacionIp} y sus respuestas (${student.encuesta.historiasTiempoReal ? "historias en tiempo real" : "datos personales en perfil"}) para redactar un mensaje creíble.`,
      messagePreview: `"Hola ${student.nombreCompleto.split(" ")[0]}, detectamos un inicio de sesión inusual desde tu ${student.modeloInferido} en ${student.isp}. Confirma tu acceso aquí..."`,
      consequence:
        "La víctima confía porque el mensaje incluye datos reales de su teléfono, ciudad o hábitos recientes.",
    },
    {
      stepNumber: "PASO 3",
      channel:
        student.encuesta.metodo2fa === "app"
          ? "Phishing de Sesión (AiTM)"
          : "SIM Swapping / Recuperación",
      title:
        student.encuesta.metodo2fa === "app"
          ? "Captura de token de sesión tras login falso"
          : `Explotación de 2FA (${student.encuesta.metodo2fa.toUpperCase()})`,
      attackerAction:
        student.encuesta.metodo2fa === "app"
          ? "Aunque usa app autenticadora, un enlace proxy captura la cookie de sesión ya iniciada."
          : `Con ${student.correo} y sin 2FA por aplicación, se solicita portabilidad o restablecimiento usando datos públicos.`,
      messagePreview:
        student.encuesta.metodo2fa === "app"
          ? "Sesión capturada -> acceso directo al correo y redes vinculadas sin volver a pedir código."
          : "Código SMS interceptado -> cambio inmediato de contraseña de recuperación.",
      consequence: `Control total sobre ${student.correo} y las cuentas asociadas a ${student.handleSocial}.`,
    },
  ];
}

function DossierWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id");

  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("demo");
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);

  const [customHandle, setCustomHandle] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [isRunningOsint, setIsRunningOsint] = useState(false);
  const [osintReport, setOsintReport] = useState<OsintLookupReport | null>(null);
  const [osintError, setOsintError] = useState<string | null>(null);

  const [revealedSteps, setRevealedSteps] = useState(1);

  const loadParticipants = useCallback(async () => {
    setIsLoadingRecords(true);
    try {
      const res = await fetch("/api/telemetria", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/acceso?next=/dossier");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as TelemetrySnapshot;
      setRecords(data.records);

      const resolvedId =
        queryId && data.records.some((r) => r.id === queryId)
          ? queryId
          : data.records.length > 0
            ? data.records[0].id
            : "demo";

      setSelectedId((prev) => {
        const nextId =
          prev !== "demo" && data.records.some((r) => r.id === prev)
            ? prev
            : resolvedId;
        const nextStudent = data.records.find((r) => r.id === nextId);
        if (nextStudent) {
          setCustomHandle((curr) => curr || nextStudent.handleSocial);
          setCustomEmail((curr) => curr || nextStudent.correo);
        } else {
          setCustomHandle((curr) => curr || VOLUNTEER_DOSSIER.profile.aliasHandle);
          setCustomEmail((curr) => curr || VOLUNTEER_DOSSIER.profile.inferredEmail);
        }
        return nextId;
      });
    } finally {
      setIsLoadingRecords(false);
    }
  }, [queryId, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadParticipants();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadParticipants]);

  const selectedStudent = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  );

  function handleSelectParticipant(nextId: string) {
    setSelectedId(nextId);
    setRevealedSteps(1);
    setOsintReport(null);
    setOsintError(null);
    const nextStudent = records.find((r) => r.id === nextId);
    if (nextStudent) {
      setCustomHandle(nextStudent.handleSocial);
      setCustomEmail(nextStudent.correo);
    } else {
      setCustomHandle(VOLUNTEER_DOSSIER.profile.aliasHandle);
      setCustomEmail(VOLUNTEER_DOSSIER.profile.inferredEmail);
    }
  }

  async function handleRunLiveOsint() {
    setIsRunningOsint(true);
    setOsintError(null);
    try {
      const res = await fetch("/api/osint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: customHandle,
          email: customEmail,
        }),
      });
      if (res.status === 401) {
        router.replace("/acceso?next=/dossier");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        report?: OsintLookupReport;
      };
      if (!res.ok || !data.report) {
        setOsintError(data.error ?? "No se pudo ejecutar el escaneo OSINT.");
        return;
      }
      setOsintReport(data.report);
    } catch {
      setOsintError("Error de red al consultar las plataformas públicas.");
    } finally {
      setIsRunningOsint(false);
    }
  }

  const simulationSteps = useMemo(
    () =>
      selectedStudent
        ? buildLiveAttackSteps(selectedStudent, osintReport)
        : VOLUNTEER_DOSSIER.attackSimulation.steps,
    [selectedStudent, osintReport]
  );

  const totalSteps = simulationSteps.length;

  function handleNextStep() {
    setRevealedSteps((prev) => Math.min(totalSteps, prev + 1));
  }

  function handleResetSimulation() {
    setRevealedSteps(1);
  }

  const profileAvatar =
    osintReport?.emailFindings?.gravatarAvatarUrl ||
    selectedStudent?.fotoExif.vistaPreviaBase64 ||
    VOLUNTEER_DOSSIER.profile.avatarUrl;

  const hasLiveGps =
    selectedStudent &&
    selectedStudent.fotoExif.tieneGps &&
    selectedStudent.fotoExif.latitud !== null &&
    selectedStudent.fotoExif.longitud !== null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Cabecera y Selector de Participante Real */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300">
              <Fingerprint className="h-3.5 w-3.5" />
              {ES_TEXTS.dossier.badge}
            </span>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              {ES_TEXTS.dossier.title}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              {ES_TEXTS.dossier.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadParticipants()}
            disabled={isLoadingRecords}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 font-mono text-xs text-slate-200 hover:border-cyan-400/50 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoadingRecords ? "animate-spin" : ""}`}
            />
            {ES_TEXTS.dossier.liveSelector.refreshButton} ({records.length})
          </button>
        </div>

        {/* Barra de Selección de Objetivo + Ejecución OSINT en Vivo */}
        <div className="grid gap-3 rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-mono text-xs font-semibold text-cyan-300">
              <Users className="h-3.5 w-3.5" />
              {ES_TEXTS.dossier.liveSelector.targetLabel}
            </label>
            <select
              value={selectedId}
              onChange={(e) => handleSelectParticipant(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white outline-none focus:border-cyan-400"
            >
              {records.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.nombreCompleto} • {student.handleSocial} • {student.correo}
                </option>
              ))}
              <option value="demo">
                {ES_TEXTS.dossier.liveSelector.demoFallbackOption}
              </option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-slate-400">
              {ES_TEXTS.dossier.liveSelector.handleInputLabel}
            </label>
            <input
              type="text"
              value={customHandle}
              onChange={(e) => setCustomHandle(e.target.value)}
              placeholder="@usuario"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-slate-400">
              {ES_TEXTS.dossier.liveSelector.emailInputLabel}
            </label>
            <input
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs text-amber-200 outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleRunLiveOsint()}
            disabled={isRunningOsint}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 font-mono text-xs font-bold text-white shadow-lg shadow-rose-950/50 transition hover:bg-rose-500 disabled:opacity-60"
          >
            {isRunningOsint ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {ES_TEXTS.dossier.liveSelector.scanningButton}
              </>
            ) : (
              <>
                <Radar className="h-4 w-4" />
                {ES_TEXTS.dossier.liveSelector.scanButton}
              </>
            )}
          </button>
        </div>

        {osintError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 font-mono text-xs text-rose-200">
            {osintError}
          </div>
        )}
      </div>

      {/* Dashboard en 4 cuadrantes */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Cuadrante 1: Perfil Objetivo (Real o Señuelo) */}
        <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
              <UserCheck className="h-4 w-4" />
              {ES_TEXTS.dossier.quadrants.profileTitle}
            </h2>
            <span className="rounded-full border border-rose-500/50 bg-rose-500/15 px-3 py-0.5 font-mono text-xs font-bold text-rose-300">
              {selectedStudent
                ? `${selectedStudent.perfilPublico.nivelRiesgo} (${selectedStudent.perfilPublico.puntajeRiesgo}/100)`
                : `${VOLUNTEER_DOSSIER.profile.exposureLevel} (${VOLUNTEER_DOSSIER.profile.exposureScore}/100)`}
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profileAvatar}
              alt={
                selectedStudent?.nombreCompleto ??
                VOLUNTEER_DOSSIER.profile.fullName
              }
              className="h-28 w-28 shrink-0 rounded-2xl border border-cyan-400/40 bg-slate-950 object-cover"
            />
            <div className="min-w-0 space-y-1.5">
              <h3 className="truncate text-xl font-bold text-white">
                {selectedStudent
                  ? selectedStudent.nombreCompleto
                  : VOLUNTEER_DOSSIER.profile.fullName}
              </h3>
              <p className="font-mono text-sm text-cyan-300">
                {selectedStudent
                  ? selectedStudent.handleSocial
                  : VOLUNTEER_DOSSIER.profile.aliasHandle}
              </p>
              <p className="flex items-center gap-1.5 text-sm text-slate-300">
                <Smartphone className="h-4 w-4 shrink-0 text-cyan-400" />
                {selectedStudent
                  ? `${selectedStudent.modeloInferido} • ${selectedStudent.os}`
                  : VOLUNTEER_DOSSIER.profile.careerOrRole}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {selectedStudent
                  ? `${selectedStudent.ubicacionIp} • IP: ${selectedStudent.ipParcial}`
                  : VOLUNTEER_DOSSIER.profile.city}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <dt className="font-mono text-[11px] text-slate-400">
                {selectedStudent
                  ? ES_TEXTS.dossier.liveLabels.realEmail
                  : ES_TEXTS.dossier.profileLabels.emailGuess}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-amber-300">
                {selectedStudent
                  ? selectedStudent.correo
                  : VOLUNTEER_DOSSIER.profile.inferredEmail}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <dt className="font-mono text-[11px] text-slate-400">
                {selectedStudent
                  ? ES_TEXTS.dossier.liveLabels.ispNetwork
                  : ES_TEXTS.dossier.profileLabels.phoneCarrier}
              </dt>
              <dd className="mt-1 font-mono text-xs text-slate-200">
                {selectedStudent
                  ? `${selectedStudent.isp} (${selectedStudent.conexion})`
                  : VOLUNTEER_DOSSIER.profile.mobileCarrier}
              </dd>
            </div>
            {selectedStudent && (
              <>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                  <dt className="font-mono text-[11px] text-slate-400">
                    {ES_TEXTS.dossier.liveLabels.passwordAudit}
                  </dt>
                  <dd className="mt-1 font-mono text-xs text-rose-300">
                    {selectedStudent.claveEnmascarada} ({selectedStudent.longitudClave} chars) •{" "}
                    {selectedStudent.tiempoCrackeo}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                  <dt className="font-mono text-[11px] text-slate-400">
                    {ES_TEXTS.dossier.liveLabels.hardwareGpu}
                  </dt>
                  <dd className="mt-1 truncate font-mono text-xs text-slate-200">
                    {selectedStudent.gpu} • {selectedStudent.bateria}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {/* Cuadrante 2: Rutina / Ubicación GPS / Evidencia EXIF */}
        <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
              <Clock className="h-4 w-4" />
              {selectedStudent
                ? ES_TEXTS.dossier.liveLabels.telemetryAndExifTitle
                : ES_TEXTS.dossier.quadrants.routineTitle}
            </h2>
          </div>

          {selectedStudent ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
                  <p className="font-mono text-[11px] font-semibold text-amber-300">
                    COMPORTAMIENTO EN REGISTRO
                  </p>
                  <p className="mt-1 font-mono text-xs text-amber-100">
                    {selectedStudent.leyoTerminos
                      ? `Leyó términos (${selectedStudent.segundosLecturaTerminos} s)`
                      : `Aceptó sin leer (${selectedStudent.segundosLecturaTerminos} s)`}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    GPS: {selectedStudent.permisos.gps} • Cámara:{" "}
                    {selectedStudent.permisos.camara}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                  <p className="font-mono text-[11px] font-semibold text-cyan-300">
                    CÁMARA / EXIF CAPTURADO
                  </p>
                  <p className="mt-1 font-mono text-xs text-white">
                    {selectedStudent.fotoExif.subida
                      ? `${selectedStudent.fotoExif.marca} ${selectedStudent.fotoExif.modeloCamara}`
                      : "Aún no sube fotografía"}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    {selectedStudent.fotoExif.subida
                      ? selectedStudent.fotoExif.fechaOriginal
                      : "Pendiente de etapa de foto"}
                  </p>
                </div>
              </div>

              {hasLiveGps ? (
                <div className="space-y-2 rounded-xl border border-rose-500/35 bg-rose-950/20 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs font-bold text-rose-300">
                      GPS ({selectedStudent.fotoExif.origenGps.toUpperCase()}):{" "}
                      {selectedStudent.fotoExif.latitud},{" "}
                      {selectedStudent.fotoExif.longitud}
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${selectedStudent.fotoExif.latitud},${selectedStudent.fotoExif.longitud}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 font-mono text-[11px] font-bold text-white hover:bg-rose-500"
                    >
                      Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <iframe
                    title="Mapa GPS del objetivo"
                    src={`https://maps.google.com/maps?q=${selectedStudent.fotoExif.latitud},${selectedStudent.fotoExif.longitud}&z=16&output=embed`}
                    className="h-48 w-full rounded-lg border border-slate-800"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 font-mono text-xs text-slate-400">
                  Sin coordenadas GPS capturadas para este participante todavía (zona:{" "}
                  {selectedStudent.idiomaZona}).
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
                <p className="font-mono text-xs font-semibold text-amber-300">
                  {ES_TEXTS.dossier.routineLabels.activeHours}
                </p>
                <p className="mt-1 text-sm text-amber-100/90">
                  {VOLUNTEER_DOSSIER.routine.peakPostingHours}
                </p>
                <p className="mt-1.5 font-mono text-xs text-slate-400">
                  {VOLUNTEER_DOSSIER.routine.sleepWindowInferred}
                </p>
              </div>

              <div className="mt-4 space-y-2.5">
                <p className="font-mono text-xs text-slate-400">
                  {ES_TEXTS.dossier.routineLabels.frequentPlaces}
                </p>
                {VOLUNTEER_DOSSIER.routine.frequentPlaces.map((place) => (
                  <div
                    key={place.name}
                    className="rounded-xl border border-slate-800 bg-slate-950/80 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{place.name}</span>
                      <span className="font-mono text-xs text-cyan-300">
                        {place.timeWindow}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {place.frequency} • {place.sourceEvidence}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Cuadrante 3: Rastreo OSINT en Vivo (Redes y Correo) */}
        <section className="rounded-2xl border border-rose-500/35 bg-slate-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-rose-300">
              <Globe className="h-4 w-4" />
              {osintReport
                ? `${ES_TEXTS.dossier.liveLabels.osintResultsTitle} (${osintReport.foundCount}/${osintReport.platformsChecked})`
                : ES_TEXTS.dossier.quadrants.vectorsTitle}
            </h2>
            {osintReport && (
              <span className="font-mono text-[11px] text-slate-400">
                {osintReport.handle} • {(osintReport.durationMs / 1000).toFixed(1)} s
              </span>
            )}
          </div>

          {osintReport ? (
            <div className="mt-4 space-y-4">
              {/* Hallazgos por correo */}
              {osintReport.emailFindings && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 font-mono text-xs">
                  <p className="font-bold text-amber-300">
                    CORREO ANALIZADO: {osintReport.emailFindings.email} (
                    {osintReport.emailFindings.providerType.toUpperCase()})
                  </p>
                  <div className="mt-2 space-y-1 text-slate-200">
                    <p>
                      • Gravatar público:{" "}
                      <strong className="text-white">
                        {osintReport.emailFindings.gravatarFound
                          ? `ENCONTRADO (${osintReport.emailFindings.gravatarName ?? "Avatar activo"})`
                          : "No registrado"}
                      </strong>
                    </p>
                    <p>
                      • GitHub por correo:{" "}
                      {osintReport.emailFindings.githubByEmailUrl ? (
                        <a
                          href={osintReport.emailFindings.githubByEmailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-cyan-300 underline"
                        >
                          {osintReport.emailFindings.githubByEmailLogin ??
                            osintReport.emailFindings.githubByEmailUrl}
                        </a>
                      ) : (
                        <span className="text-slate-400">No expuesto</span>
                      )}
                    </p>
                    <p className="text-slate-300">
                      • Brechas (HIBP): {osintReport.emailFindings.hibpNote}
                    </p>
                  </div>
                </div>
              )}

              {/* Resumen Web vs Apps */}
              <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/25 p-3">
                  <p className="text-[11px] text-cyan-300">PÁGINAS WEB</p>
                  <p className="mt-1 text-lg font-bold text-white">
                    {osintReport.webFound}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      / {osintReport.webChecked} analizadas
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-3">
                  <p className="text-[11px] text-emerald-300">APPS Y REDES</p>
                  <p className="mt-1 text-lg font-bold text-white">
                    {osintReport.appFound}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      / {osintReport.appChecked} analizadas
                    </span>
                  </p>
                </div>
              </div>

              {/* Grid separado: Páginas Web y Apps */}
              <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                <div>
                  <p className="mb-2 font-mono text-[11px] font-bold text-cyan-300">
                    PÁGINAS WEB, PORTAFOLIOS Y FOROS ({osintReport.webChecked})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {osintReport.platforms
                      .filter((item) => item.kind === "web")
                      .map((item) => (
                        <a
                          key={item.platform}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition hover:border-cyan-400/50 ${
                            item.status === "encontrado"
                              ? "border-emerald-500/40 bg-emerald-950/25"
                              : item.status === "bloqueado"
                                ? "border-amber-500/30 bg-amber-950/15"
                                : "border-slate-800 bg-slate-950/70 opacity-65"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs font-bold text-white">
                              {item.platform}
                            </p>
                            <p className="truncate font-mono text-[10px] text-slate-400">
                              {item.detail ?? item.category}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              item.status === "encontrado"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : item.status === "bloqueado"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {item.status === "encontrado"
                              ? "ENCONTRADO"
                              : item.status === "bloqueado"
                                ? "BLOQ"
                                : "NO"}
                          </span>
                        </a>
                      ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 font-mono text-[11px] font-bold text-emerald-300">
                    APPS, REDES Y GAMING ({osintReport.appChecked})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {osintReport.platforms
                      .filter((item) => item.kind === "app")
                      .map((item) => (
                        <a
                          key={item.platform}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition hover:border-cyan-400/50 ${
                            item.status === "encontrado"
                              ? "border-emerald-500/40 bg-emerald-950/25"
                              : item.status === "bloqueado"
                                ? "border-amber-500/30 bg-amber-950/15"
                                : "border-slate-800 bg-slate-950/70 opacity-65"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs font-bold text-white">
                              {item.platform}
                            </p>
                            <p className="truncate font-mono text-[10px] text-slate-400">
                              {item.detail ?? item.category}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              item.status === "encontrado"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : item.status === "bloqueado"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {item.status === "encontrado"
                              ? "ENCONTRADO"
                              : item.status === "bloqueado"
                                ? "BLOQ"
                                : "NO"}
                          </span>
                        </a>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3.5 text-xs text-rose-100/90">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div>
                  <p className="font-semibold text-rose-300">
                    {selectedStudent
                      ? ES_TEXTS.dossier.liveLabels.readyToScanTitle
                      : ES_TEXTS.dossier.vectorsLabels.simSwapRisk}
                  </p>
                  <p className="mt-1">
                    {selectedStudent
                      ? ES_TEXTS.dossier.liveLabels.readyToScanBody
                      : VOLUNTEER_DOSSIER.vectors.simSwapSummary}
                  </p>
                </div>
              </div>

              {!selectedStudent && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {VOLUNTEER_DOSSIER.vectors.items.map((item) => (
                    <div
                      key={item.category}
                      className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-400">
                          {item.category}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            item.riskLevel === "CRÍTICO"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {item.riskLevel}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-slate-300">
                        {item.questionOrVector}
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold text-white">
                        {item.exposedAnswer}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {ES_TEXTS.dossier.vectorsLabels.sourceLabel}{" "}
                        {item.publicSource}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Cuadrante 4: Simulador de Secuestro en Cadena */}
        <section className="flex flex-col justify-between rounded-2xl border border-rose-500/40 bg-slate-900/85 p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-rose-300">
                <MessageSquareWarning className="h-4 w-4" />
                {ES_TEXTS.dossier.quadrants.simulationTitle}
              </h2>
              <span className="font-mono text-xs text-slate-400">
                {ES_TEXTS.dossier.simulationLabels.targetPrefix}{" "}
                {selectedStudent
                  ? selectedStudent.handleSocial
                  : VOLUNTEER_DOSSIER.attackSimulation.targetAccount}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {simulationSteps.slice(0, revealedSteps).map((step) => (
                <div
                  key={step.stepNumber}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300">
                      {step.stepNumber} • {step.channel}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">
                    <strong className="text-amber-300">
                      {ES_TEXTS.dossier.simulationLabels.attackerLabel}{" "}
                    </strong>
                    {step.attackerAction}
                  </p>
                  <blockquote className="mt-2 rounded-lg border-l-4 border-cyan-500 bg-slate-900 p-2.5 font-mono text-xs text-cyan-100">
                    {step.messagePreview}
                  </blockquote>
                  <p className="mt-2 text-xs text-rose-200">
                    <strong className="text-rose-400">
                      {ES_TEXTS.dossier.simulationLabels.impactLabel}{" "}
                    </strong>
                    {step.consequence}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            {revealedSteps < totalSteps ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-mono text-xs font-bold text-white transition hover:bg-rose-500"
              >
                <span>
                  {revealedSteps === 1
                    ? ES_TEXTS.dossier.simulationLabels.startButton
                    : ES_TEXTS.dossier.simulationLabels.nextStepButton}{" "}
                  ({revealedSteps}/{totalSteps})
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <span className="font-mono text-xs font-bold text-rose-300">
                Cadena completa ejecutada ({totalSteps}/{totalSteps})
              </span>
            )}

            <button
              type="button"
              onClick={handleResetSimulation}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 font-mono text-xs text-slate-300 hover:border-slate-500 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {ES_TEXTS.dossier.simulationLabels.resetButton}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DossierPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-12 font-mono text-sm text-slate-400">
          Cargando dossier OSINT...
        </div>
      }
    >
      <DossierWorkspace />
    </Suspense>
  );
}
