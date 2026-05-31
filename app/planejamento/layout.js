import SidebarPlanejamento from "@/components/SidebarPlanejamento";

export const metadata = {
  title: "Workspace Torg — Planejamento",
  description: "PCP, cronogramas e programação semanal.",
};

export default function PlanejamentoLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarPlanejamento />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
