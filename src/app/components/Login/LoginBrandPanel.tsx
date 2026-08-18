// LoginBrandPanel — panel merek sisi kiri (desktop lg+).
// Server component statis. Palet: slate gelap + aksen teal/emerald (tanpa indigo/violet).

const FEATURES = [
  "Pengiriman resource FHIR: POST · GET · PUT · PATCH",
  "Log pengiriman & audit tersimpan per pengguna",
  "Utilitas DICOM: konversi, patch ACSN, kirim ke router",
] as const;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M4 10.5L8 14.5L16 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginBrandPanel() {
  return (
    <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-slate-950 px-14 py-12 text-white lg:flex">
      {/* Lapisan dekoratif */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-500/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-emerald-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Brand lockup */}
      <div className="relative flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-lg shadow-teal-500/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ehis-logo.svg"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-[0.18em] text-teal-300">
            SATU SEHAT · BOLTIM
          </p>
          <p className="text-xs text-slate-400">
            RSUD Bolaang Mongondow Timur
          </p>
        </div>
      </div>

      {/* Headline */}
      <div className="relative max-w-md">
        <h1 className="text-4xl font-bold leading-[1.15] tracking-tight">
          Integrasi data{" "}
          <span className="bg-linear-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">
            FHIR R4
          </span>{" "}
          ke Satu Sehat, dalam satu dashboard.
        </h1>
        <p className="mt-4 leading-relaxed text-slate-300">
          Kelola pengiriman resource, pantau riwayat, dan jalankan utilitas
          DICOM — aman, tercatat, dan terstandar Kemenkes RI.
        </p>

        <ul className="mt-9 space-y-3.5">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-500/15 text-teal-300 ring-1 ring-teal-400/25">
                <CheckIcon />
              </span>
              <span className="text-sm text-slate-200">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer panel */}
      <div className="relative flex items-center justify-between text-xs text-slate-400">
        <span>© 2026 RSUD Bolaang Mongondow Timur</span>
        <span className="rounded-full border border-white/10 px-3 py-1 font-medium">
          FHIR R4 · Kemenkes RI
        </span>
      </div>
    </aside>
  );
}
