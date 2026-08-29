import DashboardPageClient from "./dashboard-page-client";

export const metadata = {
  title: "IAM Dashboard",
  description: "Summary view of users, roles, policies, and findings from the selected IAM upload.",
};

export default function DashboardPage() {
  return <DashboardPageClient />;
}
