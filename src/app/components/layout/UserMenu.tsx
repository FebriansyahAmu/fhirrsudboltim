"use client";

import { useEffect, useRef, useState } from "react";
import { LuChevronDown, LuLogOut, LuUserRound, LuShieldCheck } from "react-icons/lu";

interface SessionUser {
  username: string;
  role: string;
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s_.-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data && typeof data.username === "string") setUser(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // abaikan — tetap arahkan ke login
    }
    window.location.href = "/";
  };

  const name = user?.username ?? "Pengguna";
  const role = user?.role ?? "operator";
  const isAdmin = role === "admin";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2.5 rounded-xl border py-1.5 pl-1.5 pr-2 transition-all duration-150 ${
          open
            ? "border-teal-200 bg-teal-50/60"
            : "border-transparent hover:border-slate-200 hover:bg-slate-50"
        }`}
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-teal-500 to-emerald-500 text-xs font-bold text-white shadow-sm">
          {initials(name)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[10rem] truncate text-[13px] font-semibold leading-tight text-slate-800">
            {name}
          </span>
          <span className="block text-[11px] capitalize leading-tight text-slate-400">
            {role}
          </span>
        </span>
        <LuChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      <div
        role="menu"
        className={`absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/5 transition-all duration-150 ${
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-teal-500 to-emerald-500 text-sm font-bold text-white">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isAdmin
                  ? "bg-teal-100 text-teal-700"
                  : "bg-slate-200/70 text-slate-600"
              }`}
            >
              {isAdmin ? (
                <LuShieldCheck className="h-3 w-3" />
              ) : (
                <LuUserRound className="h-3 w-3" />
              )}
              {isAdmin ? "Administrator" : "Operator"}
            </span>
          </div>
        </div>

        <div className="my-1.5 h-px bg-slate-100" />

        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
        >
          <LuLogOut className="h-4 w-4" />
          {loggingOut ? "Keluar…" : "Keluar dari sistem"}
        </button>
      </div>
    </div>
  );
}
