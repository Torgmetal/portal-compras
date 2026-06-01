import SidebarPCP from "@/components/SidebarPCP";

export const metadata = {
  title: "Workspace Torg — PCP",
  description: "Planejamento e Controle de Produção.",
};

export default function PCPLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarPCP />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
