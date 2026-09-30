import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Toast from "@/components/Toast";
import NextAuthProvider from "@/components/SessionProvider";
import TorguinhoChat from "@/components/TorguinhoChat";
import AvisoVideoModal from "@/components/AvisoVideoModal";
import FaixaCampanha from "@/components/FaixaCampanha";
import BannerCampanha from "@/components/BannerCampanha";
import FaixaDemo from "@/components/FaixaDemo";

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
            <FaixaDemo />
            <FaixaCampanha />
            <BannerCampanha />
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
