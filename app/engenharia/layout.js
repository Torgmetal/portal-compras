import SidebarEngenharia from "@/components/SidebarEngenharia";

export const metadata = {
  title: "Workspace Torg — Engenharia",
  description: "Detalhamento, marcas/conjuntos e reconciliação de peso.",
};

export default function EngenhariaLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarEngenharia />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
