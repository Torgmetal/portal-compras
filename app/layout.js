import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import Toast from "@/components/Toast";

export const metadata = {
  title: "Portal de Compras",
  description: "Gestão de Requisições de Material e Cotações",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50">
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
