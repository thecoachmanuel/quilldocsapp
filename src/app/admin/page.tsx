import AdminOverviewClient from "./AdminOverviewClient";

export const metadata = {
  title: "Admin Console | QuillDocs",
  description: "Manage users, roles, subscriptions, plans, documents, and support inquiries.",
};

export default function AdminOverviewPage() {
  return <AdminOverviewClient />;
}

