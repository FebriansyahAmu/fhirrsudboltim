"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuUsersRound,
  LuShieldCheck,
  LuUserRound,
  LuUserPlus,
  LuSearch,
  LuKeyRound,
  LuTrash2,
  LuShieldPlus,
  LuShieldMinus,
  LuRefreshCw,
  LuInbox,
  LuCircleCheck,
  LuCircleAlert,
  LuActivity,
} from "react-icons/lu";
import CreateUserDialog from "./CreateUserDialog";
import ResetPasswordDialog from "./ResetPasswordDialog";
import { ConfirmDialog } from "./Dialog";

interface ApiUser {
  id: string;
  username: string;
  role: string;
  created_at: string;
  updated_at: string;
  activityCount: number;
  deliveryCount: number;
}

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_.-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

// ─────────────────────────────────────────────
// Toast stack (portal)
// ─────────────────────────────────────────────
function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-5 right-5 z-[110] flex w-[min(92vw,22rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg shadow-slate-900/5 animate-[slideIn_.2s_ease-out] ${
            t.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-700"
          }`}
        >
          {t.type === "success" ? (
            <LuCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className="leading-snug">{t.message}</span>
        </div>
      ))}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(1rem)}to{opacity:1;transform:none}}`}</style>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "teal" | "slate" | "violet";
}) {
  const tones = {
    teal: "from-teal-500 to-emerald-500",
    slate: "from-slate-500 to-slate-600",
    violet: "from-violet-500 to-fuchsia-500",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br text-white shadow-sm ${tones[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-slate-800">{value}</p>
        <p className="mt-1 truncate text-xs font-medium text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Role badge
// ─────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const admin = role === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        admin ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {admin ? (
        <LuShieldCheck className="h-3 w-3" />
      ) : (
        <LuUserRound className="h-3 w-3" />
      )}
      {admin ? "Admin" : "Operator"}
    </span>
  );
}

// ─────────────────────────────────────────────
// Action icon button
// ─────────────────────────────────────────────
function IconBtn({
  onClick,
  title,
  disabled,
  tone = "slate",
  children,
}: {
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  tone?: "slate" | "teal" | "red";
  children: React.ReactNode;
}) {
  const tones = {
    slate: "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
    teal: "text-slate-500 hover:bg-teal-50 hover:text-teal-600",
    red: "text-slate-500 hover:bg-red-50 hover:text-red-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────
export default function UserManagementPanel() {
  const [users, setUsers] = useState<ApiUser[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<ApiUser | null>(null);
  const [roleTarget, setRoleTarget] = useState<ApiUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { credentials: "same-origin" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(data?.error ?? "Gagal memuat daftar pengguna");
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
      setCurrentUserId(data.currentUserId ?? "");
      setLoadError(null);
    } catch {
      setLoadError("Terjadi kesalahan jaringan saat memuat pengguna");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = users ?? [];
    return {
      total: list.length,
      admins: list.filter((u) => u.role === "admin").length,
      operators: list.filter((u) => u.role !== "admin").length,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter((u) => u.username.toLowerCase().includes(q));
  }, [users, search]);

  const doRoleToggle = async () => {
    if (!roleTarget) return;
    const next = roleTarget.role === "admin" ? "operator" : "admin";
    setActionLoading(true);
    try {
      const res = await fetch(`/api/users/${roleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        pushToast("error", data?.error ?? "Gagal mengubah role");
        return;
      }
      pushToast(
        "success",
        `@${roleTarget.username} kini ${next === "admin" ? "Admin" : "Operator"}.`,
      );
      setRoleTarget(null);
      await load();
    } catch {
      pushToast("error", "Terjadi kesalahan jaringan.");
    } finally {
      setActionLoading(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        pushToast("error", data?.error ?? "Gagal menghapus pengguna");
        return;
      }
      pushToast("success", `Akun @${deleteTarget.username} dihapus.`);
      setDeleteTarget(null);
      await load();
    } catch {
      pushToast("error", "Terjadi kesalahan jaringan.");
    } finally {
      setActionLoading(false);
    }
  };

  const loading = users === null;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<LuUsersRound className="h-5 w-5" />}
          label="Total Pengguna"
          value={stats.total}
          tone="teal"
        />
        <StatCard
          icon={<LuShieldCheck className="h-5 w-5" />}
          label="Administrator"
          value={stats.admins}
          tone="violet"
        />
        <StatCard
          icon={<LuUserRound className="h-5 w-5" />}
          label="Operator"
          value={stats.operators}
          tone="slate"
        />
      </div>

      {/* Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:max-w-xs sm:flex-1">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari username…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder-slate-400 transition-all focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-500/15"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              title="Muat ulang"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <LuRefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-200 transition-colors hover:bg-teal-700"
            >
              <LuUserPlus className="h-4 w-4" />
              Tambah Pengguna
            </button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="divide-y divide-slate-50">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                  <div className="h-2.5 w-20 animate-pulse rounded bg-slate-50" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <LuCircleAlert className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-slate-700">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="mt-1 text-sm font-medium text-teal-600 hover:text-teal-700"
            >
              Coba lagi
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-300">
              <LuInbox className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-slate-700">
              {search ? "Tidak ada yang cocok" : "Belum ada pengguna"}
            </p>
            <p className="text-xs text-slate-400">
              {search
                ? `Tidak ditemukan username mengandung “${search}”.`
                : "Tambahkan akun pertama dengan tombol di atas."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 font-semibold">Pengguna</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Aktivitas</th>
                  <th className="px-4 py-3 font-semibold">Dibuat</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((u) => {
                  const self = u.id === currentUserId;
                  const admin = u.role === "admin";
                  const canDelete = !self && u.activityCount === 0;
                  return (
                    <tr
                      key={u.id}
                      className="group transition-colors hover:bg-slate-50/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-teal-500 to-emerald-500 text-xs font-bold text-white shadow-sm">
                            {initials(u.username)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-slate-800">
                                {u.username}
                              </span>
                              {self && (
                                <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-600">
                                  Anda
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-slate-400">
                              {u.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <LuActivity className="h-3.5 w-3.5 text-slate-300" />
                          <span className="text-[13px]">
                            {u.deliveryCount.toLocaleString("id-ID")} kirim
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-500">
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconBtn
                            title="Reset password"
                            tone="teal"
                            onClick={() => setResetTarget(u)}
                          >
                            <LuKeyRound className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title={
                              self
                                ? "Tidak dapat mengubah role sendiri"
                                : admin
                                  ? "Turunkan ke Operator"
                                  : "Jadikan Admin"
                            }
                            tone="teal"
                            disabled={self}
                            onClick={() => setRoleTarget(u)}
                          >
                            {admin ? (
                              <LuShieldMinus className="h-4 w-4" />
                            ) : (
                              <LuShieldPlus className="h-4 w-4" />
                            )}
                          </IconBtn>
                          <IconBtn
                            title={
                              self
                                ? "Tidak dapat menghapus akun sendiri"
                                : u.activityCount > 0
                                  ? "Punya riwayat aktivitas — tidak dapat dihapus"
                                  : "Hapus pengguna"
                            }
                            tone="red"
                            disabled={!canDelete}
                            onClick={() => setDeleteTarget(u)}
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(username) => {
          setCreateOpen(false);
          pushToast("success", `Akun @${username} berhasil dibuat.`);
          load();
        }}
      />

      <ResetPasswordDialog
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userId={resetTarget?.id ?? null}
        username={resetTarget?.username ?? null}
        onDone={(username) => {
          setResetTarget(null);
          pushToast("success", `Password @${username} diperbarui.`);
        }}
      />

      <ConfirmDialog
        open={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        onConfirm={doRoleToggle}
        loading={actionLoading}
        title={
          roleTarget?.role === "admin" ? "Turunkan ke Operator" : "Jadikan Admin"
        }
        confirmLabel={roleTarget?.role === "admin" ? "Turunkan" : "Jadikan Admin"}
        message={
          roleTarget?.role === "admin" ? (
            <>
              Cabut akses admin dari <b>@{roleTarget?.username}</b>? Mereka tak lagi
              bisa mengelola akun atau melihat menu Master.
            </>
          ) : (
            <>
              Beri akses <b>Admin</b> penuh ke <b>@{roleTarget?.username}</b>?
              Termasuk mengelola akun pengguna lain.
            </>
          )
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        loading={actionLoading}
        tone="danger"
        title="Hapus Pengguna"
        confirmLabel="Hapus Permanen"
        message={
          <>
            Hapus akun <b>@{deleteTarget?.username}</b> secara permanen? Tindakan
            ini tidak dapat dibatalkan.
          </>
        }
      />

      <ToastStack toasts={toasts} />
    </div>
  );
}
