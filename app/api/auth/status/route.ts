import { NextResponse } from "next/server";
import {
  INSTRUCTOR_COOKIE_NAME,
  isServerAuthConfigured,
  readCookieFromHeader,
  verifyInstructorSessionToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const configured = isServerAuthConfigured();
  const token = readCookieFromHeader(
    request.headers.get("cookie"),
    INSTRUCTOR_COOKIE_NAME
  );
  const authenticated = configured ? await verifyInstructorSessionToken(token) : false;

  return NextResponse.json(
    { configured, authenticated },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
