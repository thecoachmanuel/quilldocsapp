import UsersManagement from "./UsersManagement";

export const metadata = {
  title: "Users & Subscriptions | Admin Console",
  description: "Manage users, Kinde RBAC roles, and subscriptions.",
};

export default function AdminUsersPage() {
  return <UsersManagement />;
}

