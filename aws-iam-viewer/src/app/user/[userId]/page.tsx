import UserPageClient from "./user-page-client";

export const metadata = {
  title: "User Details",
  description: "Review IAM user permissions, groups, policies, and risk signals.",
};

export default function UserPage() {
  return <UserPageClient />;
}
