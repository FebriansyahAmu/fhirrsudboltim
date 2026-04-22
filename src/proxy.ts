// src/proxy.ts
// Route protection — jalankan sebelum setiap request selesai
// Menggunakan `jose` (Edge-compatible) via verifyToken dari session.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/app/lib/session";

// Route yang membutuhkan autentikasi (prefix match)
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/careplan",
  "/allergy",
  "/clinical-impression",
  "/episode-of-care",
  "/questionnaire-response",
  "/encounter",
  "/location",
  "/service-request",
  "/patient",
  "/practitioner",
  "/organization",
  "/imaging-study",
  "/jpg-to-dcm",
  "/dicom-router",
  "/patch-acsn",
  "/api/fhir",
  "/api/tools",
  "/api/logs",
];

// Route publik — user yang sudah login di-redirect ke dashboard
const PUBLIC_AUTH_ROUTES = ["/", "/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const isPublicAuth = PUBLIC_AUTH_ROUTES.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route),
  );

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  // Belum login, coba akses route protected → redirect ke /
  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Sudah login, coba akses /login → redirect ke /dashboard
  if (isPublicAuth && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Jalankan di semua route kecuali static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
