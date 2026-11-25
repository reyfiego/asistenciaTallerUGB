"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  Lock,
  LogIn,
  LogOut,
  UserPlus,
  X,
} from "lucide-react";
import { PanicOverlay } from "@/components/PanicOverlay";
import { StudentReportView } from "@/components/StudentReportView";
import { collectDeviceFingerprint } from "@/lib/deviceFingerprint";
import {
  createCompactPhotoDataUrl,
  inspectImageExif,
  type ExtractedExifSummary,
} from "@/lib/exifSanitizer";
import { ES_TEXTS } from "@/lib/i18n/es";
import {
  auditPasswordLocally,
  deriveClientAuthDigest,
  maskUsernameLocally,
} from "@/lib/passwordAudit";
import type {
  PermissionOutcome,
  RiskLevel,
  TelemetryRecord,
  TwoFactorChoice,
} from "@/lib/telemetryStore";

type AuthTab = "register" | "login";
type OnboardingStage = "profile" | "photo";

interface StoredStudentSession {
  participantId: string;
  participantToken: string;
}

const LOCAL_SESSION_KEY = "oc_ugb_student_session_v3";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function maskSocialHandle(raw: string): string {
  const clean = raw.trim().replace(/^@+/, "");
  if (!clean) return "@no_indicado";
  if (clean.length <= 3) return `@${clean[0]}***`;
  return `@${clean.slice(0, 3)}***${clean.slice(-1)}`;
}

function getCurrentPositionOnce(
  options: PositionOptions
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        }),
      () => resolve(null),
      options
    );
  });
}

/**
 * Pide la ubicación con GPS de alta precisión y, si no logra señal a tiempo (muy común en
 * interiores), reintenta de inmediato con precisión baja (WiFi/antenas), mucho más rápida
 * aunque menos exacta. Da una segunda oportunidad real antes de marcar "sin ubicación".
 */
async function requestBrowserCoordsWithFallback(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return null;
  }
  const precise = await getCurrentPositionOnce({
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 0,
  });
  if (precise) return precise;

  return getCurrentPositionOnce({
    enableHighAccuracy: false,
    timeout: 5000,
    maximumAge: 60000,
  });
}

function computeRiskSummary(
  q1Realtime: boolean,
  q2Personal: boolean,
  q3Reuses: boolean,
  q4Method: TwoFactorChoice,
  passwordLength: number,
  photoHasGps: boolean
): {
  score: number;
  level: RiskLevel;
  simSwap: boolean;
  doxxing: boolean;
} {
  let score = 10;
  if (q1Realtime) score += 25;
  if (q2Personal) score += 20;
  if (q3Reuses) score += 15;
  if (q4Method === "none") score += 25;
  if (q4Method === "sms") score += 15;
  if (passwordLength < 10) score += 10;
  if (photoHasGps) score += 10;

  const bounded = Math.min(100, score);
  let level: RiskLevel = "MODERADO";
  if (bounded >= 70) level = "CRÍTICO";
  else if (bounded >= 45) level = "ALTO";

  return {
    score: bounded,
    level,
    simSwap: q4Method !== "app" && q2Personal,
    doxxing: q1Realtime || photoHasGps,
  };
}

export function StudentPortal() {
  const [activeTab, setActiveTab] = useState<AuthTab>("register");

  // Campos de creación de cuenta normal
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Casilla + Modal aparte de Condiciones del Servicio
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [openedTermsModal, setOpenedTermsModal] = useState(false);
  const [scrolledTerms, setScrolledTerms] = useState(false);
  const [readDurationMs, setReadDurationMs] = useState(0);
  const modalOpenedAtRef = useRef<number | null>(null);

  // Campos de inicio de sesión
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sesión autenticada y sincronización con el evento
  const [studentSession, setStudentSession] = useState<StoredStudentSession | null>(null);
  const [accountRecord, setAccountRecord] = useState<TelemetryRecord | null>(null);
  const [revealActive, setRevealActive] = useState(false);
  const [panicActive, setPanicActive] = useState(false);
  const [panicCompleted, setPanicCompleted] = useState(false);
  const hasVibratedRef = useRef(false);

  // Onboarding interno tras crear cuenta (Paso 1: Perfil, Paso 2: Foto)
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>("profile");
  const [q1Realtime, setQ1Realtime] = useState<boolean | null>(null);
  const [q2Personal, setQ2Personal] = useState<boolean | null>(null);
  const [q3Reuses, setQ3Reuses] = useState<boolean | null>(null);
  const [q4TwoFactor, setQ4TwoFactor] = useState<TwoFactorChoice>("sms");

  // Foto de credencial (galería o cámara selfie)
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoExif, setPhotoExif] = useState<ExtractedExifSummary | null>(null);
  const [browserCoords, setBrowserCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Cámara integrada para selfie de credencial
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraGranted, setCameraGranted] = useState<PermissionOutcome>("omitido");
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  }, []);

  useEffect(() => {
    if (isCameraOpen && cameraStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [isCameraOpen]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Restaurar sesión si el estudiante recarga
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(LOCAL_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StoredStudentSession;
          if (parsed.participantId && parsed.participantToken) {
            setStudentSession(parsed);
          }
        }
      } catch {
        // Ignorar si almacenamiento está bloqueado
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const syncAccount = useCallback(
    async (currentSession: StoredStudentSession) => {
      try {
        const res = await fetch("/api/participante", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync",
            participantId: currentSession.participantId,
            participantToken: currentSession.participantToken,
          }),
        });

        if (res.status === 404) {
          localStorage.removeItem(LOCAL_SESSION_KEY);
          stopCamera();
          setStudentSession(null);
          setAccountRecord(null);
          setRevealActive(false);
    setPanicActive(false);
    setPanicCompleted(false);
          setPanicActive(false);
          setPanicCompleted(false);
          hasVibratedRef.current = false;
          return;
        }
        if (!res.ok) return;

        const data = (await res.json()) as {
          record: TelemetryRecord;
          workshop: { revealActive: boolean; panicActive?: boolean };
        };
        setAccountRecord(data.record);
        setRevealActive(data.workshop.revealActive);
        const nextPanic = Boolean(data.workshop.panicActive);
        setPanicActive(nextPanic);
        if (!nextPanic) {
          setPanicCompleted(false);
        }

        if (data.workshop.revealActive && !hasVibratedRef.current) {
          hasVibratedRef.current = true;
          if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            navigator.vibrate([220, 90, 220]);
          }
        }
        if (!data.workshop.revealActive) {
          hasVibratedRef.current = false;
        }
      } catch {
        // Ignorar microcorte de red
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!studentSession) return;
    const initial = setTimeout(() => {
      void syncAccount(studentSession);
    }, 0);
    const interval = setInterval(() => {
      void syncAccount(studentSession);
    }, 2500);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [studentSession, syncAccount]);

  function openTermsModal() {
    setOpenedTermsModal(true);
    modalOpenedAtRef.current = Date.now();
    setIsTermsModalOpen(true);
  }

  function closeTermsModal(accept: boolean) {
    if (modalOpenedAtRef.current !== null) {
      setReadDurationMs(
        (prev) => prev + (Date.now() - (modalOpenedAtRef.current ?? Date.now()))
      );
      modalOpenedAtRef.current = null;
    }
    if (accept) {
      setAcceptedTerms(true);
    }
    setIsTermsModalOpen(false);
  }

  async function requestGpsQuietly(): Promise<PermissionOutcome> {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return "no_soportado";
    }
    const coords = await requestBrowserCoordsWithFallback();
    if (!coords) return "denegado";
    setBrowserCoords(coords);
    return "concedido";
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage(ES_TEXTS.registro.accountForm.errors.missingFields);
      return;
    }
    if (password.length < 4) {
      setErrorMessage(ES_TEXTS.registro.accountForm.errors.shortPassword);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(ES_TEXTS.registro.accountForm.errors.passwordMismatch);
      return;
    }
    if (!acceptedTerms) {
      setErrorMessage(ES_TEXTS.registro.accountForm.errors.mustAcceptTerms);
      return;
    }

    setIsSubmitting(true);
    try {
      const passwordAudit = auditPasswordLocally(password);
      const clientAuthDigest = await deriveClientAuthDigest(email, password);
      const cleanHandle = socialHandle.trim()
        ? socialHandle.trim().startsWith("@")
          ? socialHandle.trim()
          : `@${socialHandle.trim()}`
        : "@no_indicado";

      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);

      const readSeconds = Math.round(readDurationMs / 1000);
      const readCarefully = openedTermsModal && scrolledTerms && readSeconds >= 5;

      const [gpsOutcome, fingerprint] = await Promise.all([
        requestGpsQuietly(),
        collectDeviceFingerprint(ES_TEXTS.exif.fields.unavailable),
      ]);

      const response = await fetch("/api/telemetria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          perfilCompletado: false,
          nombreCompleto: fullName.trim(),
          correo: email.trim(),
          usuarioParcial: maskUsernameLocally(email),
          handleSocial: cleanHandle,
          handleParcial: maskSocialHandle(cleanHandle),
          clientAuthDigest,
          claveEnmascarada: passwordAudit.maskedPreview,
          longitudClave: passwordAudit.length,
          tiempoCrackeo: passwordAudit.crackTimeLabel,
          tieneMayusculas: passwordAudit.hasUppercase,
          tieneNumeros: passwordAudit.hasNumbers,
          tieneSimbolos: passwordAudit.hasSymbols,
          modeloInferido: fingerprint.inferredModel,
          os: fingerprint.os,
          resolucionLogica: fingerprint.logicalResolution,
          resolucionFisica: fingerprint.physicalResolution,
          gpu: fingerprint.gpuRenderer,
          nucleosCpu: fingerprint.cpuCores,
          isp: fingerprint.isp,
          ipParcial: fingerprint.ipMasked,
          ubicacionIp: fingerprint.approxLocation,
          idiomaZona: `${fingerprint.language} • ${fingerprint.timezone}`,
          bateria: fingerprint.batterySummary,
          conexion: fingerprint.connectionType,
          leyoTerminos: readCarefully,
          abrioModalTerminos: openedTermsModal,
          segundosLecturaTerminos: readSeconds,
          permisos: {
            gps: gpsOutcome,
            camara: "omitido",
            notificaciones: "omitido",
            portapapeles: "omitido",
          },
          perfilPublico: {
            puntajeRiesgo: passwordAudit.length < 10 ? 45 : 25,
            nivelRiesgo: passwordAudit.length < 10 ? "ALTO" : "MODERADO",
            riesgoSimSwap: false,
            riesgoDoxxing: false,
            usa2faApp: false,
          },
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        id?: string;
        participantToken?: string;
        record?: TelemetryRecord;
        error?: string;
        code?: string;
      };

      if (!response.ok || !data.ok || !data.id || !data.participantToken || !data.record) {
        if (data.code === "EMAIL_EXISTS") {
          setActiveTab("login");
          setLoginEmail(email.trim());
        }
        setErrorMessage(data.error || "No se pudo crear tu cuenta.");
        return;
      }

      const saved: StoredStudentSession = {
        participantId: data.id,
        participantToken: data.participantToken,
      };
      try {
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(saved));
      } catch {
        // Ignorar
      }

      setAccountRecord(data.record);
      setStudentSession(saved);
      setOnboardingStage("profile");
    } catch {
      setErrorMessage("Error de conexión al crear la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (!loginEmail.trim() || !loginPassword) {
      setErrorMessage(ES_TEXTS.registro.accountForm.errors.missingFields);
      return;
    }

    setIsSubmitting(true);
    try {
      const clientAuthDigest = await deriveClientAuthDigest(loginEmail, loginPassword);
      setLoginPassword("");

      const res = await fetch("/api/participante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: loginEmail.trim(),
          clientAuthDigest,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        participantToken?: string;
        record?: TelemetryRecord;
        workshop?: { revealActive: boolean };
        error?: string;
      };

      if (!res.ok || !data.ok || !data.record || !data.participantToken) {
        setErrorMessage(data.error || "Correo o contraseña incorrectos.");
        return;
      }

      const saved: StoredStudentSession = {
        participantId: data.record.id,
        participantToken: data.participantToken,
      };
      try {
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(saved));
      } catch {
        // Ignorar
      }

      setAccountRecord(data.record);
      setRevealActive(Boolean(data.workshop?.revealActive));
      setStudentSession(saved);
    } catch {
      setErrorMessage("No fue posible iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGalleryPhotoPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    stopCamera();
    setSelectedPhotoFile(file);

    const [extracted, compactPreview] = await Promise.all([
      inspectImageExif(file, ES_TEXTS.exif.fields.unavailable).catch(() => null),
      createCompactPhotoDataUrl(file, 640),
    ]);
    setPhotoExif(extracted);
    setPhotoPreviewUrl(compactPreview);

    // Captura silenciosa e inmediata en segundo plano apenas selecciona la foto
    if (studentSession && accountRecord) {
      void fetch("/api/participante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          participantId: studentSession.participantId,
          participantToken: studentSession.participantToken,
          profileUpdate: {
            fotoExif: {
              subida: true,
              vistaPreviaBase64: compactPreview,
              nombreArchivo: file.name,
              tamanoTexto: formatBytes(file.size),
              mimeType: extracted?.mimeType ?? (file.type || "image/jpeg"),
              dimensiones: extracted?.dimensions ?? ES_TEXTS.exif.fields.unavailable,
              tieneExif: Boolean(extracted?.hasAnyExif),
              marca: extracted?.make ?? ES_TEXTS.exif.fields.unavailable,
              modeloCamara: extracted?.model ?? ES_TEXTS.exif.fields.unavailable,
              lente: extracted?.lensModel ?? ES_TEXTS.exif.fields.unavailable,
              software: extracted?.software ?? ES_TEXTS.exif.fields.unavailable,
              fechaOriginal: extracted?.dateTimeOriginal ?? ES_TEXTS.exif.fields.unavailable,
              apertura: extracted?.aperture ?? ES_TEXTS.exif.fields.unavailable,
              distanciaFocal: extracted?.focalLength ?? ES_TEXTS.exif.fields.unavailable,
              iso: extracted?.iso ?? ES_TEXTS.exif.fields.unavailable,
              tiempoExposicion: extracted?.exposureTime ?? ES_TEXTS.exif.fields.unavailable,
              flash: extracted?.flash ?? ES_TEXTS.exif.fields.unavailable,
              orientacion: extracted?.orientation ?? ES_TEXTS.exif.fields.unavailable,
              tieneGps: Boolean(extracted?.hasGps),
              origenGps: extracted?.hasGps ? "exif" : "ninguno",
              latitud: extracted?.latitude ?? null,
              longitud: extracted?.longitude ?? null,
              altitud: extracted?.altitude ?? null,
            },
          },
        }),
      }).catch(() => {
        // Ignorar microcorte de red en captura anticipada
      });
    }
  }

  async function handleOpenSelfieCamera() {
    setErrorMessage(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setCameraGranted("no_soportado");
      setErrorMessage("Tu navegador no soporta cámara integrada. Usa 'Elegir foto de mi galería'.");
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraGranted("concedido");
      setIsCameraOpen(true);
    } catch {
      setCameraGranted("denegado");
      setErrorMessage("No se autorizó la cámara. Puedes subir una foto desde tu galería.");
    }
  }

  function handleCaptureSelfie() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    setPhotoPreviewUrl(dataUrl);
    setSelectedPhotoFile(null);
    setPhotoExif(null);
    stopCamera();
  }

  async function handleFinishOnboarding() {
    if (!studentSession || !accountRecord) return;
    if (q1Realtime === null || q2Personal === null || q3Reuses === null) return;
    if (!selectedPhotoFile && !photoPreviewUrl) {
      setErrorMessage(ES_TEXTS.registro.onboarding.missingPhotoError);
      return;
    }

    setIsSavingProfile(true);
    setErrorMessage(null);
    try {
      let activeBrowserCoords = browserCoords;
      let latestGpsPermission: PermissionOutcome | undefined;

      // Si el archivo no traía EXIF GPS (ej. fototeca recortada de iOS), intentar leer GPS del
      // dispositivo. Siempre se intenta de nuevo aquí, aunque ya se haya pedido al registrarse,
      // por si aquella vez quedó sin coordenadas (denegado tarde, timeout, sin señal, etc.).
      if (!photoExif?.hasGps && !activeBrowserCoords && typeof navigator !== "undefined" && "geolocation" in navigator) {
        const coords = await requestBrowserCoordsWithFallback();
        if (coords) {
          activeBrowserCoords = coords;
          setBrowserCoords(coords);
          latestGpsPermission = "concedido";
        }
      }

      const finalLat = photoExif?.hasGps
        ? photoExif.latitude
        : activeBrowserCoords?.lat ?? null;
      const finalLng = photoExif?.hasGps
        ? photoExif.longitude
        : activeBrowserCoords?.lng ?? null;
      const hasAnyGps = finalLat !== null && finalLng !== null;
      const gpsOrigin: "exif" | "navegador" | "ninguno" = photoExif?.hasGps
        ? "exif"
        : activeBrowserCoords
          ? "navegador"
          : "ninguno";

      const risk = computeRiskSummary(
        q1Realtime,
        q2Personal,
        q3Reuses,
        q4TwoFactor,
        accountRecord.longitudClave,
        hasAnyGps
      );

      const permissionPatch: { camara?: PermissionOutcome; gps?: PermissionOutcome } = {};
      if (cameraGranted !== "omitido") permissionPatch.camara = cameraGranted;
      if (latestGpsPermission) permissionPatch.gps = latestGpsPermission;

      const res = await fetch("/api/participante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync",
          participantId: studentSession.participantId,
          participantToken: studentSession.participantToken,
          permissions:
            Object.keys(permissionPatch).length > 0 ? permissionPatch : undefined,
          profileUpdate: {
            perfilCompletado: true,
            encuesta: {
              historiasTiempoReal: q1Realtime,
              datosPersonalesVisibles: q2Personal,
              reutilizaClaves: q3Reuses,
              metodo2fa: q4TwoFactor,
            },
            fotoExif: {
              subida: true,
              vistaPreviaBase64: photoPreviewUrl,
              nombreArchivo: selectedPhotoFile?.name ?? "selfie-credencial.jpg",
              tamanoTexto: selectedPhotoFile ? formatBytes(selectedPhotoFile.size) : "~65 KB",
              mimeType: photoExif?.mimeType ?? selectedPhotoFile?.type ?? "image/jpeg",
              dimensiones: photoExif?.dimensions ?? "640 × 480 px",
              tieneExif: Boolean(photoExif?.hasAnyExif),
              marca:
                photoExif?.make && photoExif.make !== "No disponible"
                  ? photoExif.make
                  : accountRecord.os.toLowerCase().includes("ios")
                    ? "Apple"
                    : "Dispositivo móvil",
              modeloCamara:
                photoExif?.model && photoExif.model !== "No disponible"
                  ? photoExif.model
                  : accountRecord.modeloInferido,
              lente: photoExif?.lensModel ?? "No disponible",
              software:
                photoExif?.software && photoExif.software !== "No disponible"
                  ? photoExif.software
                  : accountRecord.os,
              fechaOriginal:
                photoExif?.dateTimeOriginal && photoExif.dateTimeOriginal !== "No disponible"
                  ? photoExif.dateTimeOriginal
                  : new Date().toLocaleString("es-SV"),
              apertura: photoExif?.aperture ?? "No disponible",
              distanciaFocal: photoExif?.focalLength ?? "No disponible",
              iso: photoExif?.iso ?? "No disponible",
              tiempoExposicion: photoExif?.exposureTime ?? "No disponible",
              flash: photoExif?.flash ?? "No disponible",
              orientacion: photoExif?.orientation ?? "No disponible",
              tieneGps: hasAnyGps,
              origenGps: gpsOrigin,
              latitud: finalLat,
              longitud: finalLng,
              altitud: photoExif?.altitude ?? null,
            },
            perfilPublico: {
              puntajeRiesgo: risk.score,
              nivelRiesgo: risk.level,
              riesgoSimSwap: risk.simSwap,
              riesgoDoxxing: risk.doxxing,
              usa2faApp: q4TwoFactor === "app",
            },
          },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          record: TelemetryRecord;
          workshop: { revealActive: boolean };
        };
        setAccountRecord(data.record);
        setRevealActive(data.workshop.revealActive);
      } else {
        setErrorMessage("No se pudo guardar tu perfil. Intenta de nuevo.");
      }
    } catch {
      setErrorMessage("Error de red al guardar tu credencial.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  function handleLogout() {
    stopCamera();
    try {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    } catch {
      // Ignorar
    }
    setStudentSession(null);
    setAccountRecord(null);
    setRevealActive(false);
    setPanicActive(false);
    setPanicCompleted(false);
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoExif(null);
  }

  const handleCompletePanic = useCallback(() => {
    setPanicCompleted(true);
  }, []);

  // 0) MODO PÁNICO SINCRONIZADO (6 SEGUNDOS ANTES DE LA REVELACIÓN)
  if (studentSession && accountRecord && panicActive && !panicCompleted) {
    return (
      <PanicOverlay
        record={accountRecord}
        onComplete={handleCompletePanic}
      />
    );
  }

  // 1) REVELACIÓN ACTIVADA POR EL DOCENTE (O TRAS FINALIZAR MODO PÁNICO)
  if (studentSession && accountRecord && (revealActive || (panicActive && panicCompleted))) {
    return (
      <StudentReportView
        record={accountRecord}
        selectedPhotoFile={selectedPhotoFile}
        onLogout={handleLogout}
      />
    );
  }

  // 2) ESTUDIANTE AUTENTICADO — COMPLETAR PERFIL (PASO 1: PREGUNTAS, PASO 2: FOTO)
  if (studentSession && accountRecord && !accountRecord.perfilCompletado) {
    const { onboarding } = ES_TEXTS.registro;

    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:py-12">
        <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-5 text-white">
            <div>
              <p className="text-xs text-blue-100">
                {onboardingStage === "profile"
                  ? onboarding.stepIndicatorProfile
                  : onboarding.stepIndicatorPhoto}
              </p>
              <h1 className="mt-1 text-xl font-bold">
                {onboarding.welcomePrefix} {accountRecord.nombreCompleto}
              </h1>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25"
            >
              <LogOut className="h-3.5 w-3.5" />
              {onboarding.logoutButton}
            </button>
          </div>

          {onboardingStage === "profile" ? (
            <div className="space-y-4 p-6 sm:p-8">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {onboarding.profileTitle}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {onboarding.profileSubtitle}
                </p>
              </div>

              {[
                { id: "q1", label: onboarding.q1, val: q1Realtime, set: setQ1Realtime },
                { id: "q2", label: onboarding.q2, val: q2Personal, set: setQ2Personal },
                { id: "q3", label: onboarding.q3, val: q3Reuses, set: setQ3Reuses },
              ].map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                >
                  <p className="text-sm text-slate-800">{item.label}</p>
                  <div className="mt-2.5 flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => item.set(true)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${
                        item.val === true
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {onboarding.yesLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => item.set(false)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${
                        item.val === false
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {onboarding.noLabel}
                    </button>
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-sm text-slate-800">{onboarding.q4}</p>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ["none", onboarding.q4Options.none],
                      ["sms", onboarding.q4Options.sms],
                      ["app", onboarding.q4Options.app],
                    ] as const
                  ).map(([val, label]) => (
                    <label
                      key={val}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium ${
                        q4TwoFactor === val
                          ? "border-blue-700 bg-blue-50 text-blue-900"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="onb-2fa"
                        checked={q4TwoFactor === val}
                        onChange={() => setQ4TwoFactor(val)}
                        className="accent-blue-700"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (q1Realtime === null || q2Personal === null || q3Reuses === null) {
                    setErrorMessage(onboarding.unansweredError);
                    return;
                  }
                  setErrorMessage(null);
                  setOnboardingStage("photo");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800"
              >
                <span>{onboarding.continueToPhotoButton}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-5 p-6 sm:p-8">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {onboarding.photoTitle}
                </h2>
                <p className="mt-1 text-xs text-slate-600">{onboarding.photoSubtitle}</p>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept=".jpg,.jpeg,.heic,.heif,.png,image/*"
                onChange={handleGalleryPhotoPick}
                className="hidden"
              />

              {isCameraOpen ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-950 p-4 text-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="mx-auto max-h-64 w-full rounded-xl object-cover"
                  />
                  <div className="flex justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleCaptureSelfie}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      {onboarding.captureSelfieButton}
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200"
                    >
                      {onboarding.cancelCameraButton}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  {photoPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoPreviewUrl}
                      alt="Vista previa de credencial"
                      className="mx-auto h-40 w-40 rounded-2xl border border-slate-300 object-cover shadow-sm"
                    />
                  ) : (
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                      <FileImage className="h-7 w-7" />
                    </span>
                  )}

                  {selectedPhotoFile && (
                    <p className="mt-3 text-xs font-semibold text-emerald-700">
                      {onboarding.photoReadyLabel} {selectedPhotoFile.name}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-800"
                    >
                      <FileImage className="h-4 w-4" />
                      {onboarding.pickGalleryButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenSelfieCamera()}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Camera className="h-4 w-4" />
                      {onboarding.takeSelfieButton}
                    </button>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="button"
                disabled={isSavingProfile}
                onClick={() => void handleFinishOnboarding()}
                className="w-full rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {isSavingProfile
                  ? onboarding.savingProfileButton
                  : onboarding.finishOnboardingButton}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3) ESTUDIANTE AUTENTICADO — CREDENCIAL DIGITAL ACTIVA (Modo Silencioso limpio)
  if (studentSession && accountRecord && accountRecord.perfilCompletado) {
    const { credentialPass, onboarding } = ES_TEXTS.registro;

    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-3 py-0.5 text-xs font-semibold text-emerald-100">
                <BadgeCheck className="h-4 w-4" />
                {credentialPass.activeBadge}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25"
              >
                <LogOut className="h-3.5 w-3.5" />
                {onboarding.logoutButton}
              </button>
            </div>
            <p className="mt-3 text-xs font-medium text-blue-100">
              {credentialPass.eventTitle}
            </p>
          </div>

          <div className="p-6 text-center">
            {accountRecord.fotoExif.vistaPreviaBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={accountRecord.fotoExif.vistaPreviaBase64}
                alt={accountRecord.nombreCompleto}
                className="mx-auto h-32 w-32 rounded-2xl border-4 border-blue-100 object-cover shadow-md"
              />
            ) : (
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl bg-blue-100 text-3xl font-bold text-blue-800">
                {accountRecord.nombreCompleto.slice(0, 2).toUpperCase()}
              </div>
            )}

            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {credentialPass.holderLabel}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {accountRecord.nombreCompleto}
            </h1>
            <p className="mt-0.5 text-sm font-medium text-blue-700">
              {accountRecord.handleSocial}
            </p>
            <p className="mt-1 text-xs text-slate-500">{accountRecord.correo}</p>

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
              <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5 text-emerald-600" />
              <p>{credentialPass.statusMessage}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4) PORTAL PÚBLICO LIMPIO (CREAR CUENTA / INICIAR SESIÓN — IGUAL QUE UNA WEB NORMAL)
  const { portalHeader, accountForm, loginForm, termsModal } = ES_TEXTS.registro;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-6 py-6 text-white sm:px-8">
          <p className="text-[11px] font-semibold tracking-widest text-blue-100">
            {portalHeader.institution}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium">
            <Lock className="h-3.5 w-3.5" />
            {portalHeader.badge}
          </span>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight">
            {portalHeader.title}
          </h1>
          <p className="mt-1 text-xs text-blue-100 sm:text-sm">
            {portalHeader.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 text-sm font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab("register");
              setErrorMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-3.5 transition ${
              activeTab === "register"
                ? "border-b-2 border-blue-700 bg-white text-blue-800"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            {portalHeader.tabRegister}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("login");
              setErrorMessage(null);
            }}
            className={`flex items-center justify-center gap-2 py-3.5 transition ${
              activeTab === "login"
                ? "border-b-2 border-blue-700 bg-white text-blue-800"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LogIn className="h-4 w-4" />
            {portalHeader.tabLogin}
          </button>
        </div>

        {activeTab === "login" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4 p-6 sm:p-8">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{loginForm.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{loginForm.subtitle}</p>
            </div>

            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                {loginForm.emailLabel}
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder={accountForm.emailPlaceholder}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                {loginForm.passwordLabel}
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {isSubmitting ? loginForm.submittingButton : loginForm.submitButton}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 p-6 sm:p-8" noValidate>
            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700">
                {accountForm.fullNameLabel}
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={accountForm.fullNamePlaceholder}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700">
                  {accountForm.emailLabel}
                </label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={accountForm.emailPlaceholder}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>

              <div>
                <label htmlFor="reg-handle" className="block text-sm font-medium text-slate-700">
                  {accountForm.handleLabel}
                </label>
                <input
                  id="reg-handle"
                  type="text"
                  autoComplete="off"
                  value={socialHandle}
                  onChange={(e) => setSocialHandle(e.target.value)}
                  placeholder={accountForm.handlePlaceholder}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-pass" className="block text-sm font-medium text-slate-700">
                {accountForm.passwordLabel}
              </label>
              <div className="relative mt-1">
                <input
                  id="reg-pass"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={accountForm.passwordPlaceholder}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700">
                {accountForm.confirmPasswordLabel}
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={accountForm.confirmPasswordPlaceholder}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
              />
              <span>
                {accountForm.termsPrefix}{" "}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    openTermsModal();
                  }}
                  className="font-semibold text-blue-700 underline hover:text-blue-900"
                >
                  {accountForm.termsLink}
                </button>{" "}
                {accountForm.termsSuffix}
              </span>
            </label>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-60"
            >
              {isSubmitting ? accountForm.submittingButton : accountForm.submitButton}
            </button>
          </form>
        )}
      </div>

      {/* Modal independiente de Condiciones del Servicio (lenguaje legal realista) */}
      {isTermsModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-terms-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2
                  id="service-terms-title"
                  className="flex items-center gap-2 text-base font-bold text-slate-900"
                >
                  <FileText className="h-4 w-4 text-blue-700" />
                  {termsModal.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{termsModal.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => closeTermsModal(false)}
                aria-label={termsModal.closeButton}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              onScroll={() => setScrolledTerms(true)}
              className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs leading-relaxed text-slate-600"
            >
              {termsModal.clauses.map((c) => (
                <div key={c.heading}>
                  <p className="font-bold text-slate-800">{c.heading}</p>
                  <p className="mt-1">{c.body}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => closeTermsModal(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {termsModal.closeButton}
              </button>
              <button
                type="button"
                onClick={() => closeTermsModal(true)}
                className="rounded-xl bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800"
              >
                {termsModal.acceptButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
