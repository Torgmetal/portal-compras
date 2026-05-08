import SidebarProducao from "@/components/SidebarProducao";

export const metadata = {
  title: "Workspace Torg — Portal de Produção",
  description: "PCP, fluxo de caixa e produção semanal.",
};

export default function ProducaoLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarProducao />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
