"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuX,
} from "react-icons/lu";

// ── Helpers tanggal (LOKAL, konsisten dgn encoding refId YYMMDD) ──
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parse(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function labelId(s: string | null): string {
  const d = parse(s);
  if (!d) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface Preset {
  label: string;
  range: () => [string, string];
}

const PRESETS: Preset[] = [
  {
    label: "Hari ini",
    range: () => {
      const t = fmt(new Date());
      return [t, t];
    },
  },
  {
    label: "7 hari",
    range: () => [fmt(addDays(new Date(), -6)), fmt(new Date())],
  },
  {
    label: "30 hari",
    range: () => [fmt(addDays(new Date(), -29)), fmt(new Date())],
  },
  {
    label: "Bulan ini",
    range: () => {
      const n = new Date();
      return [fmt(new Date(n.getFullYear(), n.getMonth(), 1)), fmt(n)];
    },
  },
];

export default function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const anchor = parse(to) ?? parse(from) ?? new Date();
  const [view, setView] = useState<{ y: number; m: number }>({
    y: anchor.getFullYear(),
    m: anchor.getMonth(),
  });

  // Tutup saat klik di luar / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = !!(from || to);
  const buttonLabel = active
    ? from && to
      ? from === to
        ? labelId(from)
        : `${labelId(from)} – ${labelId(to)}`
      : from
        ? `≥ ${labelId(from)}`
        : `≤ ${labelId(to)}`
    : "Semua tanggal";

  const grid = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startPad = first.getDay(); // 0=Min
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const pickDay = (d: Date) => {
    const s = fmt(d);
    if (!from || (from && to)) {
      onChange(s, null); // mulai range baru
    } else if (s < from) {
      onChange(s, null); // klik lebih awal → restart
    } else {
      onChange(from, s); // lengkapi range
    }
  };

  const applyPreset = (p: Preset) => {
    const [f, t] = p.range();
    onChange(f, t);
    const d = parse(t) ?? new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const inRange = (d: Date): "from" | "to" | "mid" | null => {
    const s = fmt(d);
    if (from && s === from) return "from";
    if (to && s === to) return "to";
    if (from && to && s > from && s < to) return "mid";
    return null;
  };

  const todayStr = fmt(new Date());

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
          active
            ? "border-teal-200 bg-teal-50 text-teal-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        <LuCalendarDays className="h-3.5 w-3.5" />
        {buttonLabel}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Hapus filter tanggal"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null, null);
            }}
            className="grid h-4 w-4 place-items-center rounded-full text-teal-500 hover:bg-teal-100"
          >
            <LuX className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          {/* Presets */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-teal-50 hover:text-teal-700"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              Reset
            </button>
          </div>

          {/* Nav bulan */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setView((v) =>
                  v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 },
                )
              }
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <LuChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-slate-700">
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              type="button"
              onClick={() =>
                setView((v) =>
                  v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 },
                )
              }
              className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <LuChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Kalender */}
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-[10px] font-semibold text-slate-400">
                {w}
              </div>
            ))}
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const pos = inRange(d);
              const isToday = fmt(d) === todayStr;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`relative h-8 rounded-lg text-xs font-medium transition-colors ${
                    pos === "from" || pos === "to"
                      ? "bg-teal-600 text-white"
                      : pos === "mid"
                        ? "bg-teal-50 text-teal-700"
                        : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {d.getDate()}
                  {isToday && !pos && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-teal-500" />
                  )}
                </button>
              );
            })}
          </div>

          {from && !to && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Pilih tanggal akhir (atau tutup untuk “sejak {labelId(from)}”)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
