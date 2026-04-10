// app/api/auth/logout/route.ts
// POST /api/auth/logout — hapus session cookie

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/app/lib/session";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
