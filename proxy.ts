import { NextRequest, NextResponse } from "next/server";
import {
  INSTRUCTOR_COOKIE_NAME,
  verifyInstructorSessionToken,
} from "@/lib/auth";

const PUBLIC_PATHS = [
  "/",
  "/registro",
  "/acceso",
  "/api/auth",
  "/api/telemetria",
  "/api/taller",
  "/api/participante",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.filter((p) => p !== "/").some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Protege el centro de mando, consola, extractor EXIF, dossier y recursos OSINT
 * para que únicamente el docente autenticado pueda acceder a ellos.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(INSTRUCTOR_COOKIE_NAME)?.value;
  const isAuthenticated = await verifyInstructorSessionToken(sessionToken);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/acceso";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
