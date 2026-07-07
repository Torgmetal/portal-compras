import SidebarRelatorios from "@/components/SidebarRelatorios";

export const metadata = {
  title: "Workspace Torg — Relatórios",
  description: "Geração de relatórios (status com fotos) no padrão Torg.",
};

export default function RelatoriosLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarRelatorios />
      <main className="flex-1 ml-64 p-8 overflow-auto print:ml-0 print:p-0">{children}</main>
    </div>
  );
}
