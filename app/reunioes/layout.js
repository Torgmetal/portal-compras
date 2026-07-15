import SidebarReunioes from "@/components/SidebarReunioes";

export const metadata = {
  title: "Workspace Torg — Reuniões",
  description: "Atas de reunião semanal.",
};

export default function ReunioesLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarReunioes />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
