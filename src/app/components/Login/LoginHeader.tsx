export default function LoginHeader() {
  return (
    <div className="mb-8">
      {/* Logo lockup — hanya tampil di mobile (panel merek tersembunyi <lg) */}
      <div className="mb-8 flex items-center gap-3 lg:hidden">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ehis-logo.svg"
            alt="Logo Satu Sehat BOLTIM"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-900">Satu Sehat BOLTIM</p>
          <p className="text-xs text-slate-500">Integrasi FHIR RSUD BOLTIM</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Masuk ke sistem
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Gunakan akun operator untuk mengakses dashboard integrasi.
      </p>
    </div>
  );
}
