// Persistencia SQLite nativa (node:sqlite en Node 22+) con respaldo automático en disco/RAM.
// Soporta lista completa de estudiantes, metadatos EXIF detallados, login con hash scrypt y estado del taller.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type PermissionOutcome =
  | "concedido"
  | "denegado"
  | "no_soportado"
  | "omitido";

export type RiskLevel = "CRÍTICO" | "ALTO" | "MODERADO";
export type TwoFactorChoice = "none" | "sms" | "app";

export interface PermissionSummary {
  gps: PermissionOutcome;
  camara: PermissionOutcome;
  notificaciones: PermissionOutcome;
  portapapeles: PermissionOutcome;
}

export interface PhotoExifDetailed {
  subida: boolean;
  vistaPreviaBase64: string | null;
  nombreArchivo: string;
  tamanoTexto: string;
  mimeType: string;
  dimensiones: string;
  tieneExif: boolean;
  marca: string;
  modeloCamara: string;
  lente: string;
  software: string;
  fechaOriginal: string;
  apertura: string;
  distanciaFocal: string;
  iso: string;
  tiempoExposicion: string;
  flash: string;
  orientacion: string;
  tieneGps: boolean;
  origenGps: "exif" | "navegador" | "ninguno";
  latitud: number | null;
  longitud: number | null;
  altitud: number | null;
}

export interface SurveyAnswers {
  historiasTiempoReal: boolean;
  datosPersonalesVisibles: boolean;
  reutilizaClaves: boolean;
  metodo2fa: TwoFactorChoice;
}

export interface PublicProfileRiskSummary {
  puntajeRiesgo: number;
  nivelRiesgo: RiskLevel;
  riesgoSimSwap: boolean;
  riesgoDoxxing: boolean;
  usa2faApp: boolean;
}

export interface TelemetryRecord {
  id: string;
  timestamp: string;
  perfilCompletado: boolean;
  nombreCompleto: string;
  correo: string;
  usuarioParcial: string;
  handleSocial: string;
  handleParcial: string;
  claveEnmascarada: string;
  longitudClave: number;
  tiempoCrackeo: string;
  tieneMayusculas: boolean;
  tieneNumeros: boolean;
  tieneSimbolos: boolean;
  modeloInferido: string;
  os: string;
  resolucionLogica: string;
  resolucionFisica: string;
  gpu: string;
  nucleosCpu: string;
  isp: string;
  ipParcial: string;
  ubicacionIp: string;
  idiomaZona: string;
  bateria: string;
  conexion: string;
  leyoTerminos: boolean;
  abrioModalTerminos: boolean;
  segundosLecturaTerminos: number;
  permisos: PermissionSummary;
  encuesta: SurveyAnswers;
  fotoExif: PhotoExifDetailed;
  perfilPublico: PublicProfileRiskSummary;
}

export interface WorkshopState {
  revealActive: boolean;
  panicActive: boolean;
  acceptingSubmissions: boolean;
  storageEngine: "sqlite" | "json-fallback";
}

export interface TelemetryStats {
  total: number;
  iosCount: number;
  androidCount: number;
  otherCount: number;
  iosPercentage: number;
  androidPercentage: number;
  credentialsCaptured: number;
  acceptedWithoutReadingCount: number;
  acceptedWithoutReadingPercentage: number;
  gpsGrantedCount: number;
  cameraGrantedCount: number;
  notificationsGrantedCount: number;
  clipboardGrantedCount: number;
  photoUploadedCount: number;
  photoWithGpsCount: number;
  highRiskPublicCount: number;
  simSwapVulnerableCount: number;
  reusedPasswordsCount: number;
  withoutApp2faCount: number;
}

export interface TelemetrySnapshot {
  records: TelemetryRecord[];
  stats: TelemetryStats;
  workshop: WorkshopState;
}

interface StoredAccountRow {
  id: string;
  emailKey: string;
  passwordSalt: string;
  passwordVerifier: string;
  participantToken: string;
  createdAt: string;
  record: TelemetryRecord;
}

// Tipado mínimo para node:sqlite sin acoplar tipos experimentales en compilación
interface SqliteStatementLike {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => Record<string, unknown> | undefined;
  all: (...params: unknown[]) => Array<Record<string, unknown>>;
}

interface SqliteDatabaseLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatementLike;
}

interface NodeSqliteModule {
  DatabaseSync: new (filePath: string) => SqliteDatabaseLike;
}

declare global {
  var ocSqliteDb: SqliteDatabaseLike | null | undefined;
  var ocFallbackStore:
    | {
        accounts: StoredAccountRow[];
        revealActive: boolean;
        panicActive: boolean;
        acceptingSubmissions: boolean;
      }
    | undefined;
}

const STORAGE_DIR = path.join(process.cwd(), "storage");
const SQLITE_PATH = path.join(STORAGE_DIR, "taller.sqlite");
const FALLBACK_JSON_PATH = path.join(STORAGE_DIR, "taller-fallback.json");

const VALID_PERMISSION_OUTCOMES = new Set<PermissionOutcome>([
  "concedido",
  "denegado",
  "no_soportado",
  "omitido",
]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["CRÍTICO", "ALTO", "MODERADO"]);
const VALID_2FA = new Set<TwoFactorChoice>(["none", "sms", "app"]);

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function getSqliteDb(): SqliteDatabaseLike | null {
  if (globalThis.ocSqliteDb !== undefined) {
    return globalThis.ocSqliteDb;
  }

  try {
    ensureStorageDir();
    const getBuiltin = (
      process as unknown as { getBuiltinModule?: (id: string) => NodeSqliteModule | undefined }
    ).getBuiltinModule;

    const sqliteMod = getBuiltin ? getBuiltin("node:sqlite") : undefined;
    if (!sqliteMod || typeof sqliteMod.DatabaseSync !== "function") {
      globalThis.ocSqliteDb = null;
      return null;
    }

    const db = new sqliteMod.DatabaseSync(SQLITE_PATH);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS workshop_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        email_key TEXT UNIQUE NOT NULL,
        password_salt TEXT NOT NULL,
        password_verifier TEXT NOT NULL,
        participant_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      INSERT OR IGNORE INTO workshop_config (key, value) VALUES ('reveal_active', 'false');
      INSERT OR IGNORE INTO workshop_config (key, value) VALUES ('panic_active', 'false');
      INSERT OR IGNORE INTO workshop_config (key, value) VALUES ('accepting_submissions', 'true');
    `);

    globalThis.ocSqliteDb = db;
    return db;
  } catch {
    globalThis.ocSqliteDb = null;
    return null;
  }
}

function getFallbackState() {
  if (globalThis.ocFallbackStore) {
    return globalThis.ocFallbackStore;
  }

  ensureStorageDir();
  try {
    if (fs.existsSync(FALLBACK_JSON_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FALLBACK_JSON_PATH, "utf8")) as {
        accounts?: StoredAccountRow[];
        revealActive?: boolean;
        panicActive?: boolean;
        acceptingSubmissions?: boolean;
      };
      globalThis.ocFallbackStore = {
        accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
        revealActive: Boolean(raw.revealActive),
        panicActive: Boolean(raw.panicActive),
        acceptingSubmissions:
          raw.acceptingSubmissions === undefined ? true : Boolean(raw.acceptingSubmissions),
      };
      return globalThis.ocFallbackStore;
    }
  } catch {
    // Iniciar estado limpio si el archivo previo estaba corrupto
  }

  globalThis.ocFallbackStore = {
    accounts: [],
    revealActive: false,
    panicActive: false,
    acceptingSubmissions: true,
  };
  return globalThis.ocFallbackStore;
}

function persistFallbackState() {
  if (!globalThis.ocFallbackStore) return;
  try {
    ensureStorageDir();
    fs.writeFileSync(
      FALLBACK_JSON_PATH,
      JSON.stringify(globalThis.ocFallbackStore, null, 2),
      "utf8"
    );
  } catch {
    // Mantener en RAM si el sistema de archivos está restringido
  }
}

function sanitizeText(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.replace(/[\r\n\t]+/g, " ").trim();
  if (!cleaned) {
    return fallback;
  }
  return cleaned.slice(0, maxLength);
}

function sanitizeNullableCoord(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < min || value > max) {
    return null;
  }
  return Number(value.toFixed(6));
}

function sanitizePermissionOutcome(value: unknown): PermissionOutcome {
  if (typeof value === "string" && VALID_PERMISSION_OUTCOMES.has(value as PermissionOutcome)) {
    return value as PermissionOutcome;
  }
  return "omitido";
}

function sanitizeRiskLevel(value: unknown): RiskLevel {
  if (typeof value === "string" && VALID_RISK_LEVELS.has(value as RiskLevel)) {
    return value as RiskLevel;
  }
  return "MODERADO";
}

function sanitizeTwoFactor(value: unknown): TwoFactorChoice {
  if (typeof value === "string" && VALID_2FA.has(value as TwoFactorChoice)) {
    return value as TwoFactorChoice;
  }
  return "none";
}

function hashClientDigest(clientDigest: string, saltHex: string): string {
  return scryptSync(clientDigest, saltHex, 32).toString("hex");
}

function verifyClientDigest(
  clientDigest: string,
  saltHex: string,
  expectedVerifierHex: string
): boolean {
  try {
    const candidateBuf = Buffer.from(hashClientDigest(clientDigest, saltHex), "hex");
    const expectedBuf = Buffer.from(expectedVerifierHex, "hex");
    if (candidateBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(candidateBuf, expectedBuf);
  } catch {
    return false;
  }
}

function sanitizePhotoDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/") || trimmed.length > 450_000) {
    return null;
  }
  return trimmed;
}

export function normalizeStoredRecord(item: Partial<TelemetryRecord>): TelemetryRecord {
  const rawPhoto: Partial<PhotoExifDetailed> = item.fotoExif ?? {};
  const rawSurvey: Partial<SurveyAnswers> = item.encuesta ?? {};
  const rawProfile: Partial<PublicProfileRiskSummary> = item.perfilPublico ?? {};

  return {
    id: item.id ?? crypto.randomUUID(),
    timestamp: item.timestamp ?? new Date().toISOString(),
    perfilCompletado:
      item.perfilCompletado === undefined ? Boolean(rawPhoto.subida) : Boolean(item.perfilCompletado),
    nombreCompleto: item.nombreCompleto ?? "Participante",
    correo: item.correo ?? item.usuarioParcial ?? "anonimo",
    usuarioParcial: item.usuarioParcial ?? "anonimo",
    handleSocial: item.handleSocial ?? item.handleParcial ?? "@no_indicado",
    handleParcial: item.handleParcial ?? "@no_indicado",
    claveEnmascarada: item.claveEnmascarada ?? "****",
    longitudClave: typeof item.longitudClave === "number" ? item.longitudClave : 0,
    tiempoCrackeo: item.tiempoCrackeo ?? "N/D",
    tieneMayusculas: Boolean(item.tieneMayusculas),
    tieneNumeros: Boolean(item.tieneNumeros),
    tieneSimbolos: Boolean(item.tieneSimbolos),
    modeloInferido: item.modeloInferido ?? "Dispositivo desconocido",
    os: item.os ?? "Desconocido",
    resolucionLogica: item.resolucionLogica ?? "N/D",
    resolucionFisica: item.resolucionFisica ?? "N/D",
    gpu: item.gpu ?? "No expuesta",
    nucleosCpu: item.nucleosCpu ?? "No expuesto",
    isp: item.isp ?? "No disponible",
    ipParcial: item.ipParcial ?? "xxx.xxx.xxx.xxx",
    ubicacionIp: item.ubicacionIp ?? "No disponible",
    idiomaZona: item.idiomaZona ?? "N/D",
    bateria: item.bateria ?? "No expuesta",
    conexion: item.conexion ?? "No expuesta",
    leyoTerminos: Boolean(item.leyoTerminos),
    abrioModalTerminos: Boolean(item.abrioModalTerminos),
    segundosLecturaTerminos:
      typeof item.segundosLecturaTerminos === "number" ? item.segundosLecturaTerminos : 0,
    permisos: {
      gps: sanitizePermissionOutcome(item.permisos?.gps),
      camara: sanitizePermissionOutcome(item.permisos?.camara),
      notificaciones: sanitizePermissionOutcome(item.permisos?.notificaciones),
      portapapeles: sanitizePermissionOutcome(item.permisos?.portapapeles),
    },
    encuesta: {
      historiasTiempoReal: Boolean(rawSurvey.historiasTiempoReal),
      datosPersonalesVisibles: Boolean(rawSurvey.datosPersonalesVisibles),
      reutilizaClaves: Boolean(rawSurvey.reutilizaClaves),
      metodo2fa: sanitizeTwoFactor(rawSurvey.metodo2fa),
    },
    fotoExif: {
      subida: Boolean(rawPhoto.subida),
      vistaPreviaBase64: sanitizePhotoDataUrl(rawPhoto.vistaPreviaBase64),
      nombreArchivo: rawPhoto.nombreArchivo ?? "Sin archivo",
      tamanoTexto: rawPhoto.tamanoTexto ?? "0 KB",
      mimeType: rawPhoto.mimeType ?? "N/D",
      dimensiones: rawPhoto.dimensiones ?? "N/D",
      tieneExif: Boolean(rawPhoto.tieneExif),
      marca: rawPhoto.marca ?? "No disponible",
      modeloCamara: rawPhoto.modeloCamara ?? "Sin foto",
      lente: rawPhoto.lente ?? "No disponible",
      software: rawPhoto.software ?? "No disponible",
      fechaOriginal: rawPhoto.fechaOriginal ?? "No disponible",
      apertura: rawPhoto.apertura ?? "No disponible",
      distanciaFocal: rawPhoto.distanciaFocal ?? "No disponible",
      iso: rawPhoto.iso ?? "No disponible",
      tiempoExposicion: rawPhoto.tiempoExposicion ?? "No disponible",
      flash: rawPhoto.flash ?? "No disponible",
      orientacion: rawPhoto.orientacion ?? "No disponible",
      tieneGps: Boolean(rawPhoto.tieneGps),
      origenGps:
        rawPhoto.origenGps === "exif" || rawPhoto.origenGps === "navegador"
          ? rawPhoto.origenGps
          : Boolean(rawPhoto.tieneGps)
            ? "exif"
            : "ninguno",
      latitud: typeof rawPhoto.latitud === "number" ? rawPhoto.latitud : null,
      longitud: typeof rawPhoto.longitud === "number" ? rawPhoto.longitud : null,
      altitud: typeof rawPhoto.altitud === "number" ? rawPhoto.altitud : null,
    },
    perfilPublico: {
      puntajeRiesgo:
        typeof rawProfile.puntajeRiesgo === "number" ? rawProfile.puntajeRiesgo : 0,
      nivelRiesgo: sanitizeRiskLevel(rawProfile.nivelRiesgo),
      riesgoSimSwap: Boolean(rawProfile.riesgoSimSwap),
      riesgoDoxxing: Boolean(rawProfile.riesgoDoxxing),
      usa2faApp: Boolean(rawProfile.usa2faApp),
    },
  };
}

export interface ValidatedRegistrationInput {
  record: TelemetryRecord;
  emailKey: string;
  clientAuthDigest: string;
}

export function validateTelemetryPayload(raw: unknown): ValidatedRegistrationInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const rawLength = Number(input.longitudClave);
  const safeLength =
    Number.isFinite(rawLength) && rawLength >= 0 && rawLength <= 256 ? Math.round(rawLength) : 0;

  let maskedPassword = sanitizeText(input.claveEnmascarada, 128, "****");
  if (maskedPassword.length > 2 && !maskedPassword.includes("*")) {
    maskedPassword = `${maskedPassword.slice(0, 1)}${"*".repeat(
      Math.max(2, maskedPassword.length - 2)
    )}${maskedPassword.slice(-1)}`;
  }

  const correo = sanitizeText(input.correo ?? input.usuarioParcial, 120, "anonimo@ugb.edu.sv");
  const emailKey = correo.toLowerCase();
  const rawDigest = sanitizeText(input.clientAuthDigest, 128, "legacy-digest");

  const rawPermissions =
    input.permisos && typeof input.permisos === "object"
      ? (input.permisos as Record<string, unknown>)
      : {};
  const rawSurvey =
    input.encuesta && typeof input.encuesta === "object"
      ? (input.encuesta as Record<string, unknown>)
      : {};
  const rawPhoto =
    input.fotoExif && typeof input.fotoExif === "object"
      ? (input.fotoExif as Record<string, unknown>)
      : {};
  const rawProfile =
    input.perfilPublico && typeof input.perfilPublico === "object"
      ? (input.perfilPublico as Record<string, unknown>)
      : {};

  const rawReadSeconds = Number(input.segundosLecturaTerminos);
  const safeReadSeconds =
    Number.isFinite(rawReadSeconds) && rawReadSeconds >= 0 && rawReadSeconds <= 3600
      ? Math.round(rawReadSeconds)
      : 0;

  const rawRiskScore = Number(rawProfile.puntajeRiesgo);
  const safeRiskScore =
    Number.isFinite(rawRiskScore) && rawRiskScore >= 0 && rawRiskScore <= 100
      ? Math.round(rawRiskScore)
      : 0;

  const latitud = sanitizeNullableCoord(rawPhoto.latitud, -90, 90);
  const longitud = sanitizeNullableCoord(rawPhoto.longitud, -180, 180);
  const rawAlt = Number(rawPhoto.altitud);
  const altitud =
    Number.isFinite(rawAlt) && rawAlt >= -500 && rawAlt <= 10000 ? Math.round(rawAlt) : null;

  const record: TelemetryRecord = {
    id: sanitizeText(input.id, 64, crypto.randomUUID()),
    timestamp: sanitizeText(input.timestamp, 40, new Date().toISOString()),
    perfilCompletado: Boolean(input.perfilCompletado),
    nombreCompleto: sanitizeText(input.nombreCompleto, 100, "Participante"),
    correo,
    usuarioParcial: sanitizeText(input.usuarioParcial, 80, correo),
    handleSocial: sanitizeText(input.handleSocial ?? input.handleParcial, 60, "@no_indicado"),
    handleParcial: sanitizeText(input.handleParcial, 60, "@no_indicado"),
    claveEnmascarada: maskedPassword,
    longitudClave: safeLength,
    tiempoCrackeo: sanitizeText(input.tiempoCrackeo, 48, "N/D"),
    tieneMayusculas: Boolean(input.tieneMayusculas),
    tieneNumeros: Boolean(input.tieneNumeros),
    tieneSimbolos: Boolean(input.tieneSimbolos),
    modeloInferido: sanitizeText(input.modeloInferido, 90, "Dispositivo desconocido"),
    os: sanitizeText(input.os, 40, "Desconocido"),
    resolucionLogica: sanitizeText(input.resolucionLogica, 40, "N/D"),
    resolucionFisica: sanitizeText(input.resolucionFisica, 40, "N/D"),
    gpu: sanitizeText(input.gpu, 120, "No expuesta"),
    nucleosCpu: sanitizeText(input.nucleosCpu, 40, "No expuesto"),
    isp: sanitizeText(input.isp, 100, "No disponible"),
    ipParcial: sanitizeText(input.ipParcial, 48, "xxx.xxx.xxx.xxx"),
    ubicacionIp: sanitizeText(input.ubicacionIp, 100, "No disponible"),
    idiomaZona: sanitizeText(input.idiomaZona, 80, "N/D"),
    bateria: sanitizeText(input.bateria, 40, "No expuesta"),
    conexion: sanitizeText(input.conexion, 40, "No expuesta"),
    leyoTerminos: Boolean(input.leyoTerminos),
    abrioModalTerminos: Boolean(input.abrioModalTerminos),
    segundosLecturaTerminos: safeReadSeconds,
    permisos: {
      gps: sanitizePermissionOutcome(rawPermissions.gps),
      camara: sanitizePermissionOutcome(rawPermissions.camara),
      notificaciones: sanitizePermissionOutcome(rawPermissions.notificaciones),
      portapapeles: sanitizePermissionOutcome(rawPermissions.portapapeles),
    },
    encuesta: {
      historiasTiempoReal: Boolean(rawSurvey.historiasTiempoReal),
      datosPersonalesVisibles: Boolean(rawSurvey.datosPersonalesVisibles),
      reutilizaClaves: Boolean(rawSurvey.reutilizaClaves),
      metodo2fa: sanitizeTwoFactor(rawSurvey.metodo2fa),
    },
    fotoExif: {
      subida: Boolean(rawPhoto.subida),
      vistaPreviaBase64: sanitizePhotoDataUrl(rawPhoto.vistaPreviaBase64),
      nombreArchivo: sanitizeText(rawPhoto.nombreArchivo, 100, "Sin archivo"),
      tamanoTexto: sanitizeText(rawPhoto.tamanoTexto, 32, "0 KB"),
      mimeType: sanitizeText(rawPhoto.mimeType, 48, "N/D"),
      dimensiones: sanitizeText(rawPhoto.dimensiones, 40, "N/D"),
      tieneExif: Boolean(rawPhoto.tieneExif),
      marca: sanitizeText(rawPhoto.marca, 60, "No disponible"),
      modeloCamara: sanitizeText(rawPhoto.modeloCamara, 80, "Sin foto"),
      lente: sanitizeText(rawPhoto.lente, 100, "No disponible"),
      software: sanitizeText(rawPhoto.software, 60, "No disponible"),
      fechaOriginal: sanitizeText(rawPhoto.fechaOriginal, 60, "No disponible"),
      apertura: sanitizeText(rawPhoto.apertura, 32, "No disponible"),
      distanciaFocal: sanitizeText(rawPhoto.distanciaFocal, 32, "No disponible"),
      iso: sanitizeText(rawPhoto.iso, 32, "No disponible"),
      tiempoExposicion: sanitizeText(rawPhoto.tiempoExposicion, 32, "No disponible"),
      flash: sanitizeText(rawPhoto.flash, 60, "No disponible"),
      orientacion: sanitizeText(rawPhoto.orientacion, 40, "No disponible"),
      tieneGps: Boolean(rawPhoto.tieneGps) && latitud !== null && longitud !== null,
      origenGps:
        rawPhoto.origenGps === "navegador" && latitud !== null && longitud !== null
          ? "navegador"
          : latitud !== null && longitud !== null
            ? "exif"
            : "ninguno",
      latitud,
      longitud,
      altitud,
    },
    perfilPublico: {
      puntajeRiesgo: safeRiskScore,
      nivelRiesgo: sanitizeRiskLevel(rawProfile.nivelRiesgo),
      riesgoSimSwap: Boolean(rawProfile.riesgoSimSwap),
      riesgoDoxxing: Boolean(rawProfile.riesgoDoxxing),
      usa2faApp: Boolean(rawProfile.usa2faApp),
    },
  };

  return { record, emailKey, clientAuthDigest: rawDigest };
}

export function getWorkshopState(): WorkshopState {
  const db = getSqliteDb();
  if (db) {
    const revRow = db
      .prepare("SELECT value FROM workshop_config WHERE key = 'reveal_active'")
      .get();
    const panicRow = db
      .prepare("SELECT value FROM workshop_config WHERE key = 'panic_active'")
      .get();
    const accRow = db
      .prepare("SELECT value FROM workshop_config WHERE key = 'accepting_submissions'")
      .get();
    return {
      revealActive: revRow?.value === "true",
      panicActive: panicRow?.value === "true",
      acceptingSubmissions: accRow?.value !== "false",
      storageEngine: "sqlite",
    };
  }

  const fb = getFallbackState();
  return {
    revealActive: fb.revealActive,
    panicActive: fb.panicActive,
    acceptingSubmissions: fb.acceptingSubmissions,
    storageEngine: "json-fallback",
  };
}

export function updateWorkshopState(patch: {
  revealActive?: boolean;
  panicActive?: boolean;
  acceptingSubmissions?: boolean;
}): WorkshopState {
  const db = getSqliteDb();
  if (db) {
    const stmt = db.prepare(
      "INSERT INTO workshop_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    if (typeof patch.revealActive === "boolean") {
      stmt.run("reveal_active", patch.revealActive ? "true" : "false");
    }
    if (typeof patch.panicActive === "boolean") {
      stmt.run("panic_active", patch.panicActive ? "true" : "false");
    }
    if (typeof patch.acceptingSubmissions === "boolean") {
      stmt.run("accepting_submissions", patch.acceptingSubmissions ? "true" : "false");
    }
    return getWorkshopState();
  }

  const fb = getFallbackState();
  if (typeof patch.revealActive === "boolean") {
    fb.revealActive = patch.revealActive;
  }
  if (typeof patch.panicActive === "boolean") {
    fb.panicActive = patch.panicActive;
  }
  if (typeof patch.acceptingSubmissions === "boolean") {
    fb.acceptingSubmissions = patch.acceptingSubmissions;
  }
  persistFallbackState();
  return getWorkshopState();
}

function readAllRecordsNewestFirst(): TelemetryRecord[] {
  const db = getSqliteDb();
  if (db) {
    const rows = db
      .prepare("SELECT payload_json FROM participants ORDER BY created_at DESC LIMIT 500")
      .all();
    return rows.map((row) => {
      try {
        const parsed = JSON.parse(String(row.payload_json)) as Partial<TelemetryRecord>;
        return normalizeStoredRecord(parsed);
      } catch {
        return normalizeStoredRecord({});
      }
    });
  }

  const fb = getFallbackState();
  return fb.accounts.map((acc) => normalizeStoredRecord(acc.record));
}

function computeStats(records: TelemetryRecord[]): TelemetryStats {
  const total = records.length;
  let iosCount = 0;
  let androidCount = 0;
  let otherCount = 0;
  let credentialsCaptured = 0;
  let acceptedWithoutReadingCount = 0;
  let gpsGrantedCount = 0;
  let cameraGrantedCount = 0;
  let notificationsGrantedCount = 0;
  let clipboardGrantedCount = 0;
  let photoUploadedCount = 0;
  let photoWithGpsCount = 0;
  let highRiskPublicCount = 0;
  let simSwapVulnerableCount = 0;
  let reusedPasswordsCount = 0;
  let withoutApp2faCount = 0;

  for (const item of records) {
    const osLower = item.os.toLowerCase();
    const modelLower = item.modeloInferido.toLowerCase();
    if (osLower.includes("ios") || osLower.includes("ipados") || modelLower.includes("iphone")) {
      iosCount += 1;
    } else if (osLower.includes("android") || modelLower.includes("android")) {
      androidCount += 1;
    } else {
      otherCount += 1;
    }

    if (item.longitudClave > 0) credentialsCaptured += 1;
    if (!item.leyoTerminos) acceptedWithoutReadingCount += 1;
    if (item.permisos?.gps === "concedido") gpsGrantedCount += 1;
    if (item.permisos?.camara === "concedido") cameraGrantedCount += 1;
    if (item.permisos?.notificaciones === "concedido") notificationsGrantedCount += 1;
    if (item.permisos?.portapapeles === "concedido") clipboardGrantedCount += 1;
    if (item.fotoExif?.subida) photoUploadedCount += 1;
    if (item.fotoExif?.tieneGps) photoWithGpsCount += 1;
    if (item.encuesta?.reutilizaClaves) reusedPasswordsCount += 1;
    if (item.encuesta?.metodo2fa !== "app") withoutApp2faCount += 1;
    if (
      item.perfilPublico?.nivelRiesgo === "CRÍTICO" ||
      item.perfilPublico?.nivelRiesgo === "ALTO"
    ) {
      highRiskPublicCount += 1;
    }
    if (item.perfilPublico?.riesgoSimSwap) simSwapVulnerableCount += 1;
  }

  return {
    total,
    iosCount,
    androidCount,
    otherCount,
    iosPercentage: total > 0 ? Math.round((iosCount / total) * 100) : 0,
    androidPercentage: total > 0 ? Math.round((androidCount / total) * 100) : 0,
    credentialsCaptured,
    acceptedWithoutReadingCount,
    acceptedWithoutReadingPercentage:
      total > 0 ? Math.round((acceptedWithoutReadingCount / total) * 100) : 0,
    gpsGrantedCount,
    cameraGrantedCount,
    notificationsGrantedCount,
    clipboardGrantedCount,
    photoUploadedCount,
    photoWithGpsCount,
    highRiskPublicCount,
    simSwapVulnerableCount,
    reusedPasswordsCount,
    withoutApp2faCount,
  };
}

export function getTelemetrySnapshot(): TelemetrySnapshot {
  const records = readAllRecordsNewestFirst();
  return {
    records,
    stats: computeStats(records),
    workshop: getWorkshopState(),
  };
}

/**
 * Registra un participante nuevo (o rechaza si el correo ya está registrado).
 */
export function registerParticipantAccount(
  validated: ValidatedRegistrationInput
):
  | { ok: true; record: TelemetryRecord; participantToken: string; total: number }
  | { ok: false; reason: "EMAIL_EXISTS" | "CLOSED" } {
  const workshop = getWorkshopState();
  if (!workshop.acceptingSubmissions) {
    return { ok: false, reason: "CLOSED" };
  }

  const saltHex = randomBytes(16).toString("hex");
  const verifierHex = hashClientDigest(validated.clientAuthDigest, saltHex);
  const participantToken = randomBytes(24).toString("hex");
  const db = getSqliteDb();

  if (db) {
    const existing = db
      .prepare("SELECT id FROM participants WHERE email_key = ?")
      .get(validated.emailKey);

    // Si es un envío legado sin correo único (ej. pruebas automatizadas), permitir id único
    const effectiveEmailKey = existing
      ? validated.clientAuthDigest === "legacy-digest"
        ? `${validated.emailKey}:${validated.record.id}`
        : null
      : validated.emailKey;

    if (!effectiveEmailKey) {
      return { ok: false, reason: "EMAIL_EXISTS" };
    }

    db.prepare(
      `INSERT INTO participants
        (id, email_key, password_salt, password_verifier, participant_token, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      validated.record.id,
      effectiveEmailKey,
      saltHex,
      verifierHex,
      participantToken,
      validated.record.timestamp,
      JSON.stringify(validated.record)
    );

    const snapshot = getTelemetrySnapshot();
    return {
      ok: true,
      record: validated.record,
      participantToken,
      total: snapshot.stats.total,
    };
  }

  const fb = getFallbackState();
  const exists = fb.accounts.some((acc) => acc.emailKey === validated.emailKey);
  if (exists && validated.clientAuthDigest !== "legacy-digest") {
    return { ok: false, reason: "EMAIL_EXISTS" };
  }

  fb.accounts.unshift({
    id: validated.record.id,
    emailKey: exists ? `${validated.emailKey}:${validated.record.id}` : validated.emailKey,
    passwordSalt: saltHex,
    passwordVerifier: verifierHex,
    participantToken,
    createdAt: validated.record.timestamp,
    record: validated.record,
  });
  if (fb.accounts.length > 500) fb.accounts.length = 500;
  persistFallbackState();

  return {
    ok: true,
    record: validated.record,
    participantToken,
    total: fb.accounts.length,
  };
}

/**
 * Autentica un estudiante existente usando su correo y el digest SHA-256 derivado en cliente.
 */
export function authenticateParticipantAccount(
  email: string,
  clientAuthDigest: string
): { record: TelemetryRecord; participantToken: string; workshop: WorkshopState } | null {
  const emailKey = email.trim().toLowerCase();
  if (!emailKey || !clientAuthDigest) return null;

  const db = getSqliteDb();
  if (db) {
    const row = db
      .prepare(
        "SELECT password_salt, password_verifier, participant_token, payload_json FROM participants WHERE email_key = ?"
      )
      .get(emailKey);
    if (!row) return null;

    const ok = verifyClientDigest(
      clientAuthDigest,
      String(row.password_salt),
      String(row.password_verifier)
    );
    if (!ok) return null;

    const parsed = JSON.parse(String(row.payload_json)) as Partial<TelemetryRecord>;
    return {
      record: normalizeStoredRecord(parsed),
      participantToken: String(row.participant_token),
      workshop: getWorkshopState(),
    };
  }

  const fb = getFallbackState();
  const found = fb.accounts.find((acc) => acc.emailKey === emailKey);
  if (!found) return null;
  if (!verifyClientDigest(clientAuthDigest, found.passwordSalt, found.passwordVerifier)) {
    return null;
  }

  return {
    record: normalizeStoredRecord(found.record),
    participantToken: found.participantToken,
    workshop: getWorkshopState(),
  };
}

export interface ParticipantProfileUpdate {
  perfilCompletado?: boolean;
  encuesta?: SurveyAnswers;
  fotoExif?: PhotoExifDetailed;
  perfilPublico?: PublicProfileRiskSummary;
}

function applyParticipantUpdates(
  target: TelemetryRecord,
  updatedPermissions?: Partial<PermissionSummary>,
  profileUpdate?: ParticipantProfileUpdate
): TelemetryRecord {
  const next = { ...target };

  if (updatedPermissions) {
    next.permisos = {
      gps: updatedPermissions.gps
        ? sanitizePermissionOutcome(updatedPermissions.gps)
        : next.permisos.gps,
      camara: updatedPermissions.camara
        ? sanitizePermissionOutcome(updatedPermissions.camara)
        : next.permisos.camara,
      notificaciones: updatedPermissions.notificaciones
        ? sanitizePermissionOutcome(updatedPermissions.notificaciones)
        : next.permisos.notificaciones,
      portapapeles: updatedPermissions.portapapeles
        ? sanitizePermissionOutcome(updatedPermissions.portapapeles)
        : next.permisos.portapapeles,
    };
  }

  if (profileUpdate) {
    const validatedPatch = validateTelemetryPayload({
      ...next,
      perfilCompletado: profileUpdate.perfilCompletado ?? next.perfilCompletado,
      encuesta: profileUpdate.encuesta ?? next.encuesta,
      fotoExif: profileUpdate.fotoExif ?? next.fotoExif,
      perfilPublico: profileUpdate.perfilPublico ?? next.perfilPublico,
    });
    if (validatedPatch) {
      next.perfilCompletado = validatedPatch.record.perfilCompletado;
      next.encuesta = validatedPatch.record.encuesta;
      next.fotoExif = validatedPatch.record.fotoExif;
      next.perfilPublico = validatedPatch.record.perfilPublico;
    }
  }

  return next;
}

export function getOrUpdateParticipantSession(
  participantId: string,
  participantToken: string,
  updatedPermissions?: Partial<PermissionSummary>,
  profileUpdate?: ParticipantProfileUpdate
): { record: TelemetryRecord; workshop: WorkshopState } | null {
  if (!participantId || !participantToken) return null;

  const db = getSqliteDb();
  if (db) {
    const row = db
      .prepare("SELECT participant_token, payload_json FROM participants WHERE id = ?")
      .get(participantId);
    if (!row || String(row.participant_token) !== participantToken) {
      return null;
    }

    let current = normalizeStoredRecord(
      JSON.parse(String(row.payload_json)) as Partial<TelemetryRecord>
    );

    if (updatedPermissions || profileUpdate) {
      current = applyParticipantUpdates(current, updatedPermissions, profileUpdate);
      db.prepare("UPDATE participants SET payload_json = ? WHERE id = ?").run(
        JSON.stringify(current),
        participantId
      );
    }

    return { record: current, workshop: getWorkshopState() };
  }

  const fb = getFallbackState();
  const found = fb.accounts.find(
    (acc) => acc.id === participantId && acc.participantToken === participantToken
  );
  if (!found) return null;

  if (updatedPermissions || profileUpdate) {
    found.record = applyParticipantUpdates(
      normalizeStoredRecord(found.record),
      updatedPermissions,
      profileUpdate
    );
    persistFallbackState();
  }

  return { record: normalizeStoredRecord(found.record), workshop: getWorkshopState() };
}

export function clearTelemetryRecords(): TelemetrySnapshot {
  const db = getSqliteDb();
  if (db) {
    db.exec(
      "DELETE FROM participants; UPDATE workshop_config SET value = 'false' WHERE key IN ('reveal_active', 'panic_active');"
    );
    return getTelemetrySnapshot();
  }

  const fb = getFallbackState();
  fb.accounts = [];
  fb.revealActive = false;
  fb.panicActive = false;
  persistFallbackState();
  return getTelemetrySnapshot();
}
