import DocumentsManagement from "./DocumentsManagement";

export const metadata = {
  title: "Documents | Admin Console",
  description: "Manage all uploaded documents across users.",
};

export default function AdminDocumentsPage() {
  return <DocumentsManagement />;
}

