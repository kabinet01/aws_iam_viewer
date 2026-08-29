import RolePageClient from "./role-page-client";

export const metadata = {
  title: "Role Details",
  description: "Review IAM role policies, assumption paths, and attached permissions.",
};

export default function RolePage() {
  return <RolePageClient />;
}
