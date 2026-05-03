import SidebarComercial from "@/components/SidebarComercial";

export const metadata = {
  title: "Workspace Torg — Portal Comercial",
  description: "Gestão de Ordens de Produção, revisões e aditivos.",
};

export default function ComercialLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarComercial />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
