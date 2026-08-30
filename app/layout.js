import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Toast from "@/components/Toast";
import NextAuthProvider from "@/components/SessionProvider";
import TorguinhoChat from "@/components/TorguinhoChat";
import AvisoVideoModal from "@/components/AvisoVideoModal";
import FaixaSetembroAmarelo from "@/components/FaixaSetembroAmarelo";

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
            <FaixaSetembroAmarelo />
            {children}
            <Toast />
            <TorguinhoChat />
            <AvisoVideoModal />
          </StoreProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
