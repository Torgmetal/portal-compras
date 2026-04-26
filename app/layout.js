import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Toast from "@/components/Toast";

export const metadata = {
  title: "Torg Metal — Portal",
  description: "Soluções em estruturas metálicas industriais e residenciais.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-torg-blue-50/30">
        <StoreProvider>
          {children}
          <Toast />
        </StoreProvider>
      </body>
    </html>
  );
}
