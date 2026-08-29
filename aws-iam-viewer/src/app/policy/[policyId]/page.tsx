import PolicyPageClient from "./policy-page-client";

export const metadata = {
  title: "Policy Details",
  description: "Review IAM policy document, privilege-escalation signals, and attachments.",
};

export default function PolicyPage() {
  return <PolicyPageClient />;
}
