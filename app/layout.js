import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Toast from "@/components/Toast";
import NextAuthProvider from "@/components/SessionProvider";

export const metadata = {
  title: "Workspace Torg",
  description: "Workspace interno da Torg Metal — Comercial, Compras e Requisições.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-torg-blue-50/30">
        <NextAuthProvider>
          <StoreProvider>
            {children}
            <Toast />
          </StoreProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
