import HomePageClient from "./home-page-client";

export const metadata = {
  title: "Upload IAM Data",
  description: "Upload and analyze account-authorization-details.json files locally.",
};

export default function HomePage() {
  return <HomePageClient />;
}
