"use client";

import { useEffect, useState } from "react";

export interface CurrentUser {
  username: string;
  role: string;
}

// Cache tingkat-modul: sesi user jarang berubah dalam satu tab, jadi cukup
// di-fetch sekali dan dibagikan ke semua komponen (Sidebar, halaman Master, …).
let cached: CurrentUser | null = null;
let inflight: Promise<CurrentUser | null> | null = null;

async function fetchMe(): Promise<CurrentUser | null> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CurrentUser | null) => {
        if (data && typeof data.username === "string") cached = data;
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Sesi user yang sedang login (username + role), di-cache tingkat-modul.
 * `loading` true sampai fetch pertama selesai. `isAdmin` shortcut.
 */
export function useCurrentUser(): {
  user: CurrentUser | null;
  loading: boolean;
  isAdmin: boolean;
} {
  const [user, setUser] = useState<CurrentUser | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    // State awal sudah mencerminkan cache (lihat useState di atas); bila sudah
    // ada cache tak perlu fetch/set ulang.
    if (cached) return;
    let active = true;
    // setState di dalam callback async (bukan sinkron di body effect) — aman.
    fetchMe().then((u) => {
      if (!active) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { user, loading, isAdmin: user?.role === "admin" };
}
