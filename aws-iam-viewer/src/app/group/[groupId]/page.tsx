import GroupPageClient from "./group-page-client";

export const metadata = {
  title: "Group Details",
  description: "Inspect IAM group details, members, and policies.",
};

export default function GroupPage() {
  return <GroupPageClient />;
}
