import Sidebar from "@/components/Sidebar";

export const metadata = {
  title: "Torg Metal — Portal de Compras",
  description: "Gestão de RMs, Cotações e Pedidos de Compra.",
};

export default function ComprasLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
    </div>
  );
}
