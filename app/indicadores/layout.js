import SidebarIndicadores from "@/components/SidebarIndicadores";

export const metadata = {
  title: "Indicadores — Workspace Torg",
  description: "KPIs de Compras: Scorecard, Savings e OTIF.",
};

export default function IndicadoresLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarIndicadores />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
