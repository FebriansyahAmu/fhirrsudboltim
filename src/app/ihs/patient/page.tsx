import Link from "next/link";
import {
  LuUsers,
  LuCircleCheck,
  LuClock,
  LuSend,
  LuShieldCheck,
  LuTriangleAlert,
  LuRefreshCw,
  LuDatabase,
  LuChevronLeft,
  LuChevronRight,
} from "react-icons/lu";
import DashboardLayout from "@/app/components/layout/DashboardLayout";
import {
  getPatientSyncSummary,
  getPatientSyncRows,
  type PatientSyncFilter,
  type PatientSyncRow,
  type PatientSyncSummary,
} from "@/app/lib/ihs/patient.sync";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const FILTERS: { key: PatientSyncFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "terkirim", label: "Sudah Terkirim" },
  { key: "belum", label: "Belum Dikirim" },
];

function normalizeFilter(v: string | undefined): PatientSyncFilter {
  return v === "terkirim" || v === "belum" || v === "siap" ? v : "semua";
}

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function buildHref(filter: PatientSyncFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "semua") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/ihs/patient?${qs}` : "/ihs/patient";
}

function countForFilter(s: PatientSyncSummary, f: PatientSyncFilter): number {
  if (f === "terkirim") return s.terkirim;
  if (f === "belum") return s.belum;
  if (f === "siap") return s.siap;
  return s.total;
}

export default async function IhsPatientPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = normalizeFilter(sp.filter);
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let summary: PatientSyncSummary | null = null;
  let rows: PatientSyncRow[] = [];
  let error: string | null = null;

  // Halaman efektif (di-clamp setelah tahu jumlah), dihitung sekali summary siap.
  let page = requestedPage;
  let totalRows = 0;
  let totalPages = 1;

  try {
    summary = await getPatientSyncSummary();
    totalRows = countForFilter(summary, filter);
    totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    page = Math.min(requestedPage, totalPages);
    rows = await getPatientSyncRows(filter, page, PAGE_SIZE);
  } catch (e) {
    error = e instanceof Error ? e.message : "Gagal terhubung ke SIMGOS";
  }

  const pct =
    summary && summary.total > 0
      ? Math.round((summary.terkirim / summary.total) * 100)
      : 0;

  const rangeStart = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = totalRows === 0 ? 0 : rangeStart + rows.length - 1;

  const cards = summary
    ? [
        {
          label: "Total Patient",
          value: fmt(summary.total),
          icon: LuUsers,
          iconBg: "bg-slate-100",
          iconColor: "text-slate-600",
          sub: undefined as string | undefined,
        },
        {
          label: "Sudah Terkirim",
          value: fmt(summary.terkirim),
          sub: `${pct}% dari total`,
          icon: LuCircleCheck,
          iconBg: "bg-emerald-50",
          iconColor: "text-emerald-600",
        },
        {
          label: "Belum Dikirim",
          value: fmt(summary.belum),
          sub: undefined,
          icon: LuClock,
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
        },
        {
          label: "Siap Kirim",
          value: fmt(summary.siap),
          sub: "statusRequest = 1",
          icon: LuSend,
          iconBg: "bg-teal-50",
          iconColor: "text-teal-600",
        },
      ]
    : [];

  return (
    <DashboardLayout
      title="Monitor SIMGOS · Patient"
      breadcrumbs={[{ label: "Monitor SIMGOS" }, { label: "Patient" }]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Patient — Status Sinkronisasi
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Daftar data pasien yang sudah &amp; belum terkirim ke Satu Sehat,
              berdasarkan kolom <code className="font-mono text-xs">id</code> pada{" "}
              <code className="font-mono text-xs">kemkes-ihs.patient</code>.
            </p>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700">
            <LuShieldCheck className="h-4 w-4" />
            Read-only · kemkes-ihs
          </span>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
            <LuTriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">
                Gagal membaca data SIMGOS
              </p>
              <p className="mt-1 break-words text-xs text-red-700">{error}</p>
              <Link
                href="/ihs/patient"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-100"
              >
                <LuRefreshCw className="h-3.5 w-3.5" />
                Coba lagi
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Ringkasan */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {cards.map((c) => (
                <div
                  key={c.label}
                  className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-xl ${c.iconBg}`}
                    >
                      <c.icon className={`h-4.5 w-4.5 ${c.iconColor}`} />
                    </span>
                    {c.sub && (
                      <span className="max-w-24 text-right text-[10px] font-medium leading-tight text-slate-400">
                        {c.sub}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
                    {c.value}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    {c.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {summary && summary.total > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Progres pengiriman</span>
                  <span className="tabular-nums">
                    {fmt(summary.terkirim)} / {fmt(summary.total)} · {pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-teal-500 to-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Filter + tabel */}
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                  {FILTERS.map((f) => {
                    const active = f.key === filter;
                    const n = summary ? countForFilter(summary, f.key) : 0;
                    return (
                      <Link
                        key={f.key}
                        href={buildHref(f.key, 1)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "bg-white text-teal-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {f.label}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                            active
                              ? "bg-teal-50 text-teal-700"
                              : "bg-slate-200/70 text-slate-500"
                          }`}
                        >
                          {fmt(n)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <span className="text-xs text-slate-400">
                  {totalRows === 0
                    ? "Tidak ada data"
                    : `Menampilkan ${fmt(rangeStart)}–${fmt(rangeEnd)} dari ${fmt(totalRows)}`}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 font-semibold">NORM</th>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-4 py-3 font-semibold">NIK</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Mode</th>
                      <th className="px-4 py-3 font-semibold">Diperbarui</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-12 text-center text-sm text-slate-400"
                        >
                          <LuDatabase className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                          Tidak ada data untuk filter ini.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr
                          key={r.refId}
                          className="transition-colors hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">
                            {r.refId}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {r.nama ?? <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">
                            {r.nikMasked ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {r.terkirim ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                  <LuCircleCheck className="h-3 w-3" />
                                  Terkirim
                                </span>
                                <span
                                  className="max-w-[8rem] truncate font-mono text-[10px] text-slate-400"
                                  title={r.satuSehatId ?? undefined}
                                >
                                  {r.satuSehatId}
                                </span>
                              </span>
                            ) : r.siap ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                                <LuSend className="h-3 w-3" />
                                Siap kirim
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                                <LuClock className="h-3 w-3" />
                                Belum dikirim
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {r.httpRequest ? (
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                                {r.httpRequest}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {fmtDate(r.updatedAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                  <span className="text-xs text-slate-400">
                    Halaman <span className="font-semibold text-slate-600">{page}</span> dari{" "}
                    {fmt(totalPages)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {page > 1 ? (
                      <Link
                        href={buildHref(filter, page - 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                      >
                        <LuChevronLeft className="h-3.5 w-3.5" />
                        Sebelumnya
                      </Link>
                    ) : (
                      <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-300">
                        <LuChevronLeft className="h-3.5 w-3.5" />
                        Sebelumnya
                      </span>
                    )}
                    {page < totalPages ? (
                      <Link
                        href={buildHref(filter, page + 1)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                      >
                        Berikutnya
                        <LuChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-300">
                        Berikutnya
                        <LuChevronRight className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Catatan read-only */}
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <LuShieldCheck className="h-3.5 w-3.5" />
              Halaman ini hanya membaca dari SIMGOS (SELECT). NIK dimask sebagian.
              Belum ada pengiriman data.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
