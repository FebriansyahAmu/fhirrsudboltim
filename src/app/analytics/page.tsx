import DashboardLayout from "@/app/components/layout/DashboardLayout";
import AnalyticsDashboard from "@/app/components/analytics/AnalyticsDashboard";
import { getSession } from "@/app/lib/session";
import {
  getAnalytics,
  getNotesSummary,
  type AnalyticsData,
  type NotesSummary,
} from "@/app/lib/dal/analytics.dal";

const EMPTY: AnalyticsData = {
  rangeDays: 30,
  generatedAt: new Date(0).toISOString(),
  totals: {
    total: 0,
    success: 0,
    error: 0,
    successRate: 0,
    avgMs: null,
    windowTotal: 0,
    prevWindowTotal: 0,
    growthPct: null,
    activeResources: 0,
    lastActivityAt: null,
  },
  series: [],
  resources: [],
  methods: [],
};

const EMPTY_NOTES: NotesSummary = {
  total: 0,
  byMark: { merah: 0, kuning: 0, hijau: 0, biru: 0, tanpa: 0 },
  byModule: [],
};

export default async function AnalyticsPage() {
  const session = await getSession();
  const [data, notes] = session
    ? await Promise.all([getAnalytics(session.userId, 30), getNotesSummary()])
    : [EMPTY, EMPTY_NOTES];

  return (
    <DashboardLayout
      title="Dashboard Analitik"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Analitik" },
      ]}
    >
      <AnalyticsDashboard initial={data} notes={notes} />
    </DashboardLayout>
  );
}
