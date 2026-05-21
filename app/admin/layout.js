import SidebarAdmin from "@/components/SidebarAdmin";

export const metadata = {
  title: "Workspace Torg — Administração",
  description: "Gestão de usuários e configurações do portal.",
};

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarAdmin />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
