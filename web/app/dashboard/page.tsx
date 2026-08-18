import PersonalDashboard from "@/components/PersonalDashboard";
import { listBriefings } from "@/lib/firestore";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const briefings = await listBriefings();
  return <PersonalDashboard briefings={briefings} />;
}
