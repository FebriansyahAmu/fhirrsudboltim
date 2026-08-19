// lib/dal/token.dal.ts
// Manajemen OAuth2 access token ke Satu Sehat
//
// Flow:
//   1. Cek cache in-memory (paling cepat)
//   2. Cek database (persist lintas restart)
//   3. Fetch baru dari Satu Sehat jika expired / tidak ada
//   4. Simpan ke DB + update cache

import { prisma } from "@/app/lib/db/prisma";

interface CachedToken {
  token: string;
  expiresAt: Date;
}

// Cache in-memory — di-reset saat server restart
let memoryCache: CachedToken | null = null;

const BUFFER_SECONDS = 60; // refresh 60 detik sebelum expired

// Single-flight: gabungkan permintaan token yang datang bersamaan menjadi
// SATU panggilan ke endpoint token (cegah "thundering herd" → 429).
let tokenInFlight: Promise<string> | null = null;

// Cooldown saat throttled (429): jangan pukul ulang endpoint token sampai
// jendela ini lewat — mencegah lingkaran throttle yang memperpanjang 429.
let throttledUntil = 0;
const DEFAULT_THROTTLE_COOLDOWN_MS = 60_000;

// ─────────────────────────────────────────────
// Get valid token — ambil token aktif atau refresh otomatis
// ─────────────────────────────────────────────
export async function getValidToken(): Promise<string> {
  const now = new Date();
  const bufferMs = BUFFER_SECONDS * 1000;

  // 1. Cek memory cache
  if (
    memoryCache &&
    memoryCache.expiresAt.getTime() - bufferMs > now.getTime()
  ) {
    return memoryCache.token;
  }

  // 2. Cek database
  const stored = await prisma.satu_sehat_tokens.findFirst({ where: { id: 1 } });
  if (stored && stored.expires_at.getTime() - bufferMs > now.getTime()) {
    memoryCache = { token: stored.token, expiresAt: stored.expires_at };
    return stored.token;
  }

  // 3. Perlu token baru — hormati cooldown throttle agar tidak memukul ulang.
  if (Date.now() < throttledUntil) {
    const waitS = Math.ceil((throttledUntil - Date.now()) / 1000);
    throw new Error(
      `Endpoint token Satu Sehat sedang throttled (429). Tunggu ~${waitS} detik lalu coba lagi.`,
    );
  }

  // 4. Single-flight: satukan permintaan token yang bersamaan.
  if (!tokenInFlight) {
    tokenInFlight = refreshAndStoreToken().finally(() => {
      tokenInFlight = null;
    });
  }
  return tokenInFlight;
}

// Fetch token baru → simpan ke DB (upsert id=1) → update memory cache.
async function refreshAndStoreToken(): Promise<string> {
  const fresh = await fetchNewToken();
  await prisma.satu_sehat_tokens.upsert({
    where: { id: 1 },
    create: { id: 1, token: fresh.token, expires_at: fresh.expiresAt },
    update: { token: fresh.token, expires_at: fresh.expiresAt },
  });
  memoryCache = { token: fresh.token, expiresAt: fresh.expiresAt };
  return fresh.token;
}

// ─────────────────────────────────────────────
// Fetch token baru dari Satu Sehat (client_credentials)
// ─────────────────────────────────────────────
async function fetchNewToken(): Promise<CachedToken> {
  const clientId = process.env.SATU_SEHAT_CLIENT_ID;
  const clientSecret = process.env.SATU_SEHAT_CLIENT_SECRET;
  const authUrl = process.env.SATU_SEHAT_AUTH_URL;

  if (!clientId || !clientSecret || !authUrl) {
    throw new Error(
      "Env SATU_SEHAT_CLIENT_ID / SATU_SEHAT_CLIENT_SECRET / SATU_SEHAT_AUTH_URL belum diset",
    );
  }

  // Satu Sehat: grant_type dikirim sebagai query param di URL (sudah ada di SATU_SEHAT_AUTH_URL),
  // bukan di body. Body hanya berisi client_id dan client_secret.
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });

  // Pastikan URL sudah mengandung path /accesstoken?grant_type=client_credentials.
  // Jika env hanya berisi base URL (tanpa path), append otomatis.
  const normalizedBase = authUrl.replace(/\/+$/, "");
  const fullAuthUrl = normalizedBase.includes("/accesstoken")
    ? normalizedBase
    : `${normalizedBase}/accesstoken?grant_type=client_credentials`;

  const response = await fetch(fullAuthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    credentials: "omit",
    redirect: "follow",
  });

  const text = await response.text();

  if (!response.ok) {
    // 429 throttled → pasang cooldown supaya request berikutnya tidak
    // langsung memukul endpoint token lagi (memperpanjang throttle).
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const cooldownMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : DEFAULT_THROTTLE_COOLDOWN_MS;
      throttledUntil = Date.now() + cooldownMs;
      throw new Error(
        `Endpoint token Satu Sehat throttled (429). Dibatasi rate-limit; tunggu ~${Math.ceil(
          cooldownMs / 1000,
        )} detik lalu coba lagi.`,
      );
    }
    throw new Error(
      `Gagal fetch token Satu Sehat: ${response.status} — ${text.slice(0, 200)}`,
    );
  }

  // Satu Sehat mengembalikan response dalam format URL-encoded atau JSON.
  // Coba JSON terlebih dulu, fallback ke URLSearchParams.
  let data: Record<string, string>;
  try {
    data = JSON.parse(text) as Record<string, string>;
  } catch {
    const params = new URLSearchParams(text);
    data = Object.fromEntries(params.entries());
  }

  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in);

  if (!accessToken || isNaN(expiresIn) || expiresIn <= 0) {
    throw new Error(
      `Response token Satu Sehat tidak valid — raw: ${text.slice(0, 200)}`,
    );
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  return { token: accessToken, expiresAt };
}

// ─────────────────────────────────────────────
// Invalidate cache — paksa refresh token berikutnya
// ─────────────────────────────────────────────
export function invalidateTokenCache(): void {
  memoryCache = null;
}
