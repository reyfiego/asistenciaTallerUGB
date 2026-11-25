import { NextResponse } from "next/server";
import {
  INSTRUCTOR_COOKIE_NAME,
  readCookieFromHeader,
  verifyInstructorSessionToken,
} from "@/lib/auth";
import { runLiveOsintLookup } from "@/lib/osintLookup";

export const dynamic = "force-dynamic";

/**
 * POST /api/osint
 * Protegido: únicamente el docente autenticado puede lanzar consultas OSINT en vivo.
 */
export async function POST(request: Request) {
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
      handle?: unknown;
      email?: unknown;
    };

    const handle = typeof body.handle === "string" ? body.handle : "";
    const email = typeof body.email === "string" ? body.email : "";

    if (!handle.trim() && !email.trim()) {
      return NextResponse.json(
        { error: "Debes indicar un @usuario o correo para analizar." },
        { status: 400 }
      );
    }

    const report = await runLiveOsintLookup({ handle, email });
    return NextResponse.json({ ok: true, report }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar el escaneo OSINT." },
      { status: 500 }
    );
  }
}
