import DiffPageClient from "./diff-page-client";

export const metadata = {
  title: "Upload Diff",
  description: "Compare two IAM uploads and review resource, trust, and finding changes.",
};

export default function DiffPage() {
  return <DiffPageClient />;
}
