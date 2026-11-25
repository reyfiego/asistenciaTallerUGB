import { NextResponse } from "next/server";
import {
  createInstructorSessionToken,
  INSTRUCTOR_COOKIE_NAME,
  isHttpsRequest,
  isServerAuthConfigured,
  verifyInstructorAccessKey,
} from "@/lib/auth";
import { ES_TEXTS } from "@/lib/i18n/es";
import { checkRateLimit, extractClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = extractClientIp(request);
  if (!checkRateLimit("instructor_login", ip, 20, 5 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  if (!isServerAuthConfigured()) {
    return NextResponse.json(
      { error: ES_TEXTS.auth.notConfiguredBody, configured: false },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as { accessKey?: unknown };
    const candidate = typeof body.accessKey === "string" ? body.accessKey : "";

    const isValid = await verifyInstructorAccessKey(candidate);
    if (!isValid) {
      return NextResponse.json(
        { error: ES_TEXTS.auth.invalidKeyError },
        { status: 401 }
      );
    }

    const token = await createInstructorSessionToken();
    if (!token) {
      return NextResponse.json(
        { error: ES_TEXTS.auth.notConfiguredBody },
        { status: 503 }
      );
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set(INSTRUCTOR_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttpsRequest(request),
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: ES_TEXTS.auth.invalidKeyError },
      { status: 400 }
    );
  }
}
