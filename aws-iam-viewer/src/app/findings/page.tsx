import FindingsPageClient from "./findings-page-client";

export const metadata = {
  title: "Security Findings",
  description: "Review local IAM findings, attack paths, and exportable evidence.",
};

export default function FindingsPage() {
  return <FindingsPageClient />;
}
