import SidebarFinanceiro from "@/components/SidebarFinanceiro";

export const metadata = {
  title: "Workspace Torg — Portal Financeiro",
  description: "Fluxo de caixa, receita projetada e validação de produção.",
};

export default function FinanceiroLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarFinanceiro />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
