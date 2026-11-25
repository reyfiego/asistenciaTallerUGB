import { NextResponse } from "next/server";
import {
  INSTRUCTOR_COOKIE_NAME,
  readCookieFromHeader,
  verifyInstructorSessionToken,
} from "@/lib/auth";
import { checkRateLimit, extractClientIp } from "@/lib/rateLimit";
import {
  clearTelemetryRecords,
  getTelemetrySnapshot,
  registerParticipantAccount,
  validateTelemetryPayload,
} from "@/lib/telemetryStore";

export const dynamic = "force-dynamic";

async function isAuthorizedInstructor(request: Request): Promise<boolean> {
  const token = readCookieFromHeader(
    request.headers.get("cookie"),
    INSTRUCTOR_COOKIE_NAME
  );
  return verifyInstructorSessionToken(token);
}

/**
 * GET /api/telemetria
 * Protegido: únicamente el docente autenticado puede leer la lista y los expedientes.
 */
export async function GET(request: Request) {
  if (!(await isAuthorizedInstructor(request))) {
    return NextResponse.json(
      { error: "Acceso denegado. Inicia sesión como docente." },
      { status: 401 }
    );
  }

  const snapshot = getTelemetrySnapshot();
  return NextResponse.json(snapshot, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * POST /api/telemetria
 * Registra una nueva cuenta de participante en SQLite con metadatos de dispositivo y foto EXIF.
 */
export async function POST(request: Request) {
  const ip = extractClientIp(request);
  // Margen amplio para cubrir un aula completa detrás de la misma IP NAT universitaria
  if (!checkRateLimit("telemetria_post", ip, 150, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes seguidas. Espera unos segundos." },
      { status: 429 }
    );
  }

  try {
    const body: unknown = await request.json();
    const validated = validateTelemetryPayload(body);

    if (!validated) {
      return NextResponse.json(
        { error: "Datos de registro inválidos." },
        { status: 400 }
      );
    }

    const result = registerParticipantAccount(validated);
    if (!result.ok) {
      if (result.reason === "CLOSED") {
        return NextResponse.json(
          { error: "El registro de esta sesión ya fue cerrado por el instructor." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          error:
            "Este correo ya tiene una cuenta registrada. Usa la pestaña 'Iniciar sesión'.",
          code: "EMAIL_EXISTS",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: result.record.id,
        participantToken: result.participantToken,
        record: result.record,
        total: result.total,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar el registro." },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/telemetria
 * Protegido: purga por completo los registros de SQLite y restablece el modo silencioso.
 */
export async function DELETE(request: Request) {
  if (!(await isAuthorizedInstructor(request))) {
    return NextResponse.json(
      { error: "Acceso denegado. Inicia sesión como docente." },
      { status: 401 }
    );
  }

  const snapshot = clearTelemetryRecords();
  return NextResponse.json(
    { ok: true, ...snapshot },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
