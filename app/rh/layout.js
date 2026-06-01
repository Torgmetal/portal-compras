import SidebarRH from "@/components/SidebarRH";

export const metadata = {
  title: "Workspace Torg — Recursos Humanos",
  description: "Gestão de pessoas, ponto, férias e benefícios.",
};

export default function RHLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarRH />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
