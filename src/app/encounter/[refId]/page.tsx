/**
 * app/encounter/[refId]/page.tsx
 *
 * Halaman "Detail Encounter": rincian seluruh resource klinis anak
 * (Condition, Observation, Procedure, MedicationRequest, dst.) untuk
 * satu kunjungan, di-fetch dari SIMGOS berdasarkan No. Pendaftaran.
 * 🔒 Read-only.
 */

"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/app/components/layout/DashboardLayout";
import EncounterDetailView from "@/app/components/ihs/EncounterDetailView";

export default function EncounterDetailPage() {
  const params = useParams<{ refId: string }>();
  const refId = params?.refId ?? "";

  return (
    <DashboardLayout
      title="Detail Encounter"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Encounter", href: "/encounter" },
        { label: refId || "Detail" },
      ]}
    >
      <EncounterDetailView refId={refId} />
    </DashboardLayout>
  );
}
