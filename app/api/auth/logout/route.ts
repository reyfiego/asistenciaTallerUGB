import { NextResponse } from "next/server";
import { INSTRUCTOR_COOKIE_NAME, isHttpsRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(INSTRUCTOR_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
