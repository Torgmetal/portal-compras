import SidebarRM from "@/components/SidebarRM";

export const metadata = {
  title: "Workspace Torg — Portal de RMs",
  description: "Lançamento de Requisições de Material vinculadas a OPs.",
};

export default function RMLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarRM />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
