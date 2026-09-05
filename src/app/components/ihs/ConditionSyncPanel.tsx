"use client";

import { useState } from "react";
import { LuLayers } from "react-icons/lu";
import ModuleSyncPanel from "./ModuleSyncPanel";

// Satu resource Condition, beberapa jenis (tabel SIMGOS berbeda). Semua butuh
// Encounter untuk dikirim → panel-nya menandai "Menunggu Encounter".
const TABS: { key: string; label: string; icon: string; hint: string }[] = [
  { key: "condition", label: "Diagnosis", icon: "🩺", hint: "Diagnosis kunjungan" },
  { key: "condition-anamnesis", label: "Anamnesis", icon: "🗒️", hint: "Riwayat keluhan" },
  {
    key: "condition-riwayat",
    label: "Riwayat Penyakit Dahulu",
    icon: "📜",
    hint: "Riwayat penyakit dahulu",
  },
  { key: "condition-hasil-pa", label: "Hasil PA", icon: "🔬", hint: "Hasil patologi anatomi" },
  {
    key: "condition-penilaian-tumor",
    label: "Penilaian Tumor",
    icon: "🎗️",
    hint: "Staging tumor",
  },
];

export default function ConditionSyncPanel({
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
          <LuLayers className="h-3.5 w-3.5 text-blue-500" />
          Jenis Condition — pilih yang ingin dikirim
        </p>
        <div
          role="tablist"
          aria-label="Jenis Condition"
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
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 motion-reduce:transition-none ${
                  on
                    ? "bg-blue-600 text-white shadow-sm"
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
        title={`Condition · ${active.label}`}
        onUsePayload={onUsePayload}
        enableQueue
        defaultOpen
      />
    </div>
  );
}
