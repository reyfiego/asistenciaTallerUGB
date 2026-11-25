import { NextResponse } from "next/server";
import {
  INSTRUCTOR_COOKIE_NAME,
  readCookieFromHeader,
  verifyInstructorSessionToken,
} from "@/lib/auth";
import { getWorkshopState, updateWorkshopState } from "@/lib/telemetryStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/taller
 * Devuelve el estado público del taller (si la revelación está activa o si recibe envíos).
 */
export async function GET() {
  return NextResponse.json(
    { workshop: getWorkshopState() },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

/**
 * PATCH /api/taller
 * Protegido para el docente: activa/oculta la revelación en todos los móviles o cierra registros.
 */
export async function PATCH(request: Request) {
  const token = readCookieFromHeader(
    request.headers.get("cookie"),
    INSTRUCTOR_COOKIE_NAME
  );
  if (!(await verifyInstructorSessionToken(token))) {
    return NextResponse.json(
      { error: "Acceso denegado. Inicia sesión como docente." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      revealActive?: unknown;
      panicActive?: unknown;
      acceptingSubmissions?: unknown;
    };

    const nextState = updateWorkshopState({
      revealActive:
        typeof body.revealActive === "boolean" ? body.revealActive : undefined,
      panicActive:
        typeof body.panicActive === "boolean" ? body.panicActive : undefined,
      acceptingSubmissions:
        typeof body.acceptingSubmissions === "boolean"
          ? body.acceptingSubmissions
          : undefined,
    });

    return NextResponse.json({ ok: true, workshop: nextState }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de configuración inválido." },
      { status: 400 }
    );
  }
}
