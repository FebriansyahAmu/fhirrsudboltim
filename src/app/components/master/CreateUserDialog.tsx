"use client";

import { useMemo, useState } from "react";
import {
  LuUserPlus,
  LuUser,
  LuLock,
  LuEye,
  LuEyeOff,
  LuCircleCheck,
  LuCircleAlert,
  LuLoaderCircle,
  LuShieldCheck,
  LuUserRound,
} from "react-icons/lu";
import { Dialog } from "./Dialog";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/;

type Role = "operator" | "admin";

/** Skor kekuatan password 0–4 + label & warna. */
function scorePassword(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { label: "Terlalu pendek", color: "bg-slate-200" },
    { label: "Lemah", color: "bg-red-400" },
    { label: "Sedang", color: "bg-amber-400" },
    { label: "Kuat", color: "bg-teal-400" },
    { label: "Sangat kuat", color: "bg-emerald-500" },
  ];
  return { score: s, ...map[s] };
}

const inputCls =
  "w-full rounded-xl border bg-slate-50/70 py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 transition-all duration-150 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/15 focus:border-teal-500";

export default function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(password), [password]);

  const usernameOk = USERNAME_RE.test(username);
  const passwordOk = password.length >= 8;
  const confirmOk = confirm.length > 0 && confirm === password;
  const canSubmit = usernameOk && passwordOk && confirmOk && !submitting;

  const reset = () => {
    setUsername("");
    setPassword("");
    setConfirm("");
    setRole("operator");
    setShowPw(false);
    setTouched(false);
    setServerError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setServerError(data?.error ?? "Gagal membuat akun");
        return;
      }
      reset();
      onCreated(username);
    } catch {
      setServerError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Buat Akun Baru"
      subtitle="Daftarkan pengguna baru ke sistem"
      icon={<LuUserPlus className="h-5 w-5" />}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Username */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-slate-600">
            Username
          </label>
          <div className="relative">
            <LuUser className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              onBlur={() => setTouched(true)}
              placeholder="mis. budi_operator"
              autoComplete="off"
              className={`${inputCls} font-mono ${
                touched && !usernameOk
                  ? "border-red-300 focus:border-red-400 focus:ring-red-500/15"
                  : "border-slate-200"
              }`}
            />
            {username && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameOk ? (
                  <LuCircleCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <LuCircleAlert className="h-4 w-4 text-red-400" />
                )}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            3–50 karakter — huruf, angka, dan underscore.
          </p>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-slate-600">
            Password
          </label>
          <div className="relative">
            <LuLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              autoComplete="new-password"
              className={`${inputCls} border-slate-200`}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPw ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
            </button>
          </div>
          {/* Strength meter */}
          {password && (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < strength.score ? strength.color : "bg-slate-100"
                    }`}
                  />
                ))}
              </div>
              <span className="w-24 text-right text-[11px] font-medium text-slate-500">
                {strength.label}
              </span>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-slate-600">
            Konfirmasi Password
          </label>
          <div className="relative">
            <LuLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Ulangi password"
              autoComplete="new-password"
              className={`${inputCls} ${
                confirm && !confirmOk
                  ? "border-red-300 focus:border-red-400 focus:ring-red-500/15"
                  : "border-slate-200"
              }`}
            />
            {confirm && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {confirmOk ? (
                  <LuCircleCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <LuCircleAlert className="h-4 w-4 text-red-400" />
                )}
              </span>
            )}
          </div>
          {confirm && !confirmOk && (
            <p className="text-[11px] text-red-500">Password tidak cocok.</p>
          )}
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-slate-600">
            Role / Akses
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  value: "operator" as Role,
                  icon: LuUserRound,
                  title: "Operator",
                  desc: "Kirim & pantau data",
                },
                {
                  value: "admin" as Role,
                  icon: LuShieldCheck,
                  title: "Admin",
                  desc: "Akses penuh + kelola akun",
                },
              ]
            ).map((opt) => {
              const active = role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-teal-400 bg-teal-50/70 ring-2 ring-teal-500/15"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      active ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <opt.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-slate-800">
                      {opt.title}
                    </span>
                    <span className="block text-[11px] leading-snug text-slate-400">
                      {opt.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {serverError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-200 transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <LuLoaderCircle className="h-4 w-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              <>
                <LuUserPlus className="h-4 w-4" />
                Buat Akun
              </>
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
