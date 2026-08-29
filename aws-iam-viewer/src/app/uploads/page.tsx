import UploadsPageClient from "./uploads-page-client";

export const metadata = {
  title: "Uploaded Files",
  description: "Manage previously uploaded IAM authorization detail files.",
};

export default function UploadsPage() {
  return <UploadsPageClient />;
}
