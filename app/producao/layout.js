import { requireUser } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import SidebarComercial from "@/components/SidebarComercial";
import SidebarRM from "@/components/SidebarRM";

export const metadata = {
  title: "Workspace Torg — Produção",
  description: "PCP, fluxo de caixa e produção semanal.",
};

export default async function ProducaoLayout({ children }) {
  const user = await requireUser();

  // Mostra o sidebar do portal de origem do usuario, mantendo
  // a navegacao consistente
  let SidebarComp = Sidebar; // default = Compras
  if (user.role === "ADMIN" || user.role === "COMERCIAL") SidebarComp = SidebarComercial;
  else if (user.role === "ENGENHARIA" || user.role === "ALMOXARIFADO") SidebarComp = SidebarRM;
  // COMPRAS usa o Sidebar padrao

  return (
    <div className="flex min-h-screen">
      <SidebarComp />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
