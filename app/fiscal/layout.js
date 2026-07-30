import SidebarFiscal from "@/components/SidebarFiscal";

export const metadata = {
  title: "Workspace Torg — Fiscal",
  description: "Romaneios emitidos aguardando emissão de NF.",
};

export default function FiscalLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarFiscal />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
