"use client";

import { useState } from "react";
import { LuLayers } from "react-icons/lu";
import ModuleSyncPanel from "./ModuleSyncPanel";

// Satu resource ClinicalImpression, dua jenis (tabel SIMGOS berbeda). Keduanya
// dikirim dalam konteks kunjungan → panel menandai "Menunggu Encounter".
const TABS: { key: string; label: string; icon: string; hint: string }[] = [
  {
    key: "clinicalimpression-anamnesis",
    label: "Anamnesis",
    icon: "💬",
    hint: "Kesan klinis — riwayat keluhan",
  },
  {
    key: "clinicalimpression-diagnosa",
    label: "Diagnosa",
    icon: "🧠",
    hint: "Kesan klinis — rasional/diagnosa",
  },
];

export default function ClinicalImpressionSyncPanel({
  onUsePayload,
}: {
  onUsePayload?: (payload: unknown, resourceType: string) => void;
}) {
  const [kind, setKind] = useState(TABS[0].key);
  const active = TABS.find((t) => t.key === kind) ?? TABS[0];

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <LuLayers className="h-3.5 w-3.5 text-indigo-500" />
          Jenis ClinicalImpression — pilih yang ingin dikirim
        </p>
        <div
          role="tablist"
          aria-label="Jenis ClinicalImpression"
          className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm"
        >
          {TABS.map((t) => {
            const on = t.key === kind;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                title={t.hint}
                onClick={() => setKind(t.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 motion-reduce:transition-none ${
                  on
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Remount saat ganti tab (key) → state panel bersih & terbuka per jenis. */}
      <ModuleSyncPanel
        key={kind}
        module={kind}
        title={`ClinicalImpression · ${active.label}`}
        onUsePayload={onUsePayload}
        defaultOpen
      />
    </div>
  );
}
