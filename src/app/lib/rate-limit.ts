import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  prefix = "global",
): NextResponse | null {
  const ip = getClientIp(request);
  const key = `${prefix}:${ip}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanup(config.windowMs);

  const entry = store.get(key) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const retryAfter = Math.ceil(
      (entry.timestamps[0] + config.windowMs - now) / 1000,
    );
    return NextResponse.json(
      { error: "Terlalu banyak request. Coba lagi nanti." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.ceil((entry.timestamps[0] + config.windowMs) / 1000),
          ),
        },
      },
    );
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return null;
}

export const RATE_LIMITS = {
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 } as RateLimitConfig,
  api: { maxRequests: 60, windowMs: 60 * 1000 } as RateLimitConfig,
  tools: { maxRequests: 20, windowMs: 60 * 1000 } as RateLimitConfig,
} as const;
