import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import Toast from "@/components/Toast";

export const metadata = {
  title: "Torg Metal — Portal de Compras",
  description: "Gestão de RMs, Cotações e Pedidos de Compra",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-torg-blue-50/30">
        <StoreProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-64 p-8 overflow-auto">{children}</main>
          </div>
          <Toast />
        </StoreProvider>
      </body>
    </html>
  );
}
