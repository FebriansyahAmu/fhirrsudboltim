"use client";

import { useState } from "react";
import {
  LuKeyRound,
  LuLock,
  LuEye,
  LuEyeOff,
  LuCircleAlert,
  LuLoaderCircle,
} from "react-icons/lu";
import { Dialog } from "./Dialog";

const inputCls =
  "w-full rounded-xl border bg-slate-50/70 py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 transition-all duration-150 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/15 focus:border-teal-500";

export default function ResetPasswordDialog({
  open,
  onClose,
  userId,
  username,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  username: string | null;
  onDone: (username: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordOk = password.length >= 8;
  const confirmOk = confirm === password && confirm.length > 0;
  const canSubmit = passwordOk && confirmOk && !submitting && !!userId;

  const close = () => {
    if (submitting) return;
    setPassword("");
    setConfirm("");
    setShowPw(false);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Gagal mereset password");
        return;
      }
      setPassword("");
      setConfirm("");
      onDone(username ?? "");
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Reset Password"
      subtitle={username ? `Untuk akun @${username}` : undefined}
      icon={<LuKeyRound className="h-5 w-5" />}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-slate-600">
            Password Baru
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
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              aria-label={showPw ? "Sembunyikan" : "Tampilkan"}
            >
              {showPw ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
            </button>
          </div>
        </div>

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
              placeholder="Ulangi password baru"
              autoComplete="new-password"
              className={`${inputCls} ${
                confirm && !confirmOk
                  ? "border-red-300 focus:border-red-400 focus:ring-red-500/15"
                  : "border-slate-200"
              }`}
            />
          </div>
          {confirm && !confirmOk && (
            <p className="text-[11px] text-red-500">Password tidak cocok.</p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={close}
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
              "Simpan Password"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
