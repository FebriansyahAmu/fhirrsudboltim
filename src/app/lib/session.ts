// lib/session.ts
// JWT session management — sign, verify, set/clear httpOnly cookie
// Menggunakan `jose` agar kompatibel dengan Edge runtime (middleware)

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 jam

export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.SECRET;
  if (!secret) throw new Error("SECRET tidak diset di environment");
  return new TextEncoder().encode(secret);
}

// ─────────────────────────────────────────────
// Sign token — buat JWT baru
// ─────────────────────────────────────────────
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());
}

// ─────────────────────────────────────────────
// Verify token — kembalikan payload atau null jika invalid/expired
// ─────────────────────────────────────────────
export async function verifyToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Set session cookie — dipanggil setelah login berhasil
// ─────────────────────────────────────────────
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

// ─────────────────────────────────────────────
// Clear session cookie — dipanggil saat logout
// ─────────────────────────────────────────────
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ─────────────────────────────────────────────
// Get current session — baca dari cookie aktif
// Kembalikan null jika tidak ada / expired
// ─────────────────────────────────────────────
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { COOKIE_NAME };
