import SidebarExpedicao from "@/components/SidebarExpedicao";

export const metadata = {
  title: "Workspace Torg — Portal de Expedição",
  description: "Romaneios, expedição e logística de saída.",
};

export default function ExpedicaoLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarExpedicao />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
