import SidebarAdmin from "@/components/SidebarAdmin";
import { requireAdminDoPortal } from "@/lib/session";

export const metadata = {
  title: "Workspace Torg — Administração",
  description: "Gestão de usuários e configurações do portal.",
};

// ⚠ O GATE FICA NO LAYOUT porque nem toda página do painel tinha o seu — /admin/usuarios,
// /admin/contatos e /admin/metas eram componentes de cliente sem checagem no servidor: só as APIs
// barravam. Aqui uma trava cobre o painel inteiro, inclusive as telas que vierem depois.
export default async function AdminLayout({ children }) {
  await requireAdminDoPortal();
  return (
    <div className="flex min-h-screen">
      <SidebarAdmin />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
