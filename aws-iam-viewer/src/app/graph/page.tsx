import GraphPageClient from "./graph-page-client";

export const metadata = {
  title: "IAM Relationship Graph",
  description: "Visualize relationships between users, roles, groups, and policies.",
};

export default function GraphPage() {
  return <GraphPageClient />;
}
