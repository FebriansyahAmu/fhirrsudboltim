"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle } from "react-icons/lu";

// ─────────────────────────────────────────────
// Modal shell — portal + backdrop blur + transisi + Esc + lock scroll
// ─────────────────────────────────────────────
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  /** Lebar maksimum panel (kelas Tailwind). Default max-w-md. */
  maxWidth?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = "max-w-md",
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-[8vh] transition-opacity duration-200 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${maxWidth} origin-top rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 transition-all duration-200 ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          {icon && (
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────
// Confirm dialog — untuk aksi konfirmasi (hapus / ubah role)
// ─────────────────────────────────────────────
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Konfirmasi",
  tone = "primary",
  loading = false,
}: ConfirmDialogProps) {
  const danger = tone === "danger";
  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      icon={
        danger ? (
          <LuTriangleAlert className="h-5 w-5" />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="text-sm leading-relaxed text-slate-600">{message}</div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-70 ${
              danger
                ? "bg-red-600 hover:bg-red-700 shadow-red-200"
                : "bg-teal-600 hover:bg-teal-700 shadow-teal-200"
            }`}
          >
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
