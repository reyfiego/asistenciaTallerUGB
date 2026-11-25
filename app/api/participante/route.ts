import { NextResponse } from "next/server";
import { checkRateLimit, extractClientIp } from "@/lib/rateLimit";
import {
  authenticateParticipantAccount,
  getOrUpdateParticipantSession,
  type ParticipantProfileUpdate,
  type PermissionSummary,
} from "@/lib/telemetryStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = extractClientIp(request);
  // Cada celular sondea cada 2.5 s (~24 req/min); un salón entero comparte la IP del WiFi.
  if (!checkRateLimit("participante_api", ip, 3000, 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Intenta de nuevo en unos segundos." },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      action?: unknown;
      email?: unknown;
      clientAuthDigest?: unknown;
      participantId?: unknown;
      participantToken?: unknown;
      permissions?: unknown;
      profileUpdate?: unknown;
    };

    if (body.action === "login") {
      const email = typeof body.email === "string" ? body.email : "";
      const digest =
        typeof body.clientAuthDigest === "string" ? body.clientAuthDigest : "";

      const authResult = authenticateParticipantAccount(email, digest);
      if (!authResult) {
        return NextResponse.json(
          { error: "Correo o contraseña incorrectos." },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          participantToken: authResult.participantToken,
          record: authResult.record,
          workshop: authResult.workshop,
        },
        { status: 200 }
      );
    }

    if (body.action === "sync") {
      const participantId =
        typeof body.participantId === "string" ? body.participantId : "";
      const participantToken =
        typeof body.participantToken === "string" ? body.participantToken : "";
      const permissions =
        body.permissions && typeof body.permissions === "object"
          ? (body.permissions as Partial<PermissionSummary>)
          : undefined;
      const profileUpdate =
        body.profileUpdate && typeof body.profileUpdate === "object"
          ? (body.profileUpdate as ParticipantProfileUpdate)
          : undefined;

      const synced = getOrUpdateParticipantSession(
        participantId,
        participantToken,
        permissions,
        profileUpdate
      );

      if (!synced) {
        return NextResponse.json(
          { error: "Sesión expirada o eliminada." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          record: synced.record,
          workshop: synced.workshop,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Acción no reconocida." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida." },
      { status: 400 }
    );
  }
}
