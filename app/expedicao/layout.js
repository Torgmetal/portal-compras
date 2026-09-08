import SidebarExpedicao from "@/components/SidebarExpedicao";

export const metadata = {
  title: "Workspace Torg — Portal de Expedição",
  description: "Romaneios, expedição e logística de saída.",
};

// ⚠ `md:ml-64` e não `ml-64`: no celular a barra vira gaveta (ver SidebarExpedicao) e o conteúdo
// ocupa a tela inteira, com o `pt-14` reservando a altura da barra de topo. Acima de `md` o
// resultado é idêntico ao que era — mesmo recuo, mesmo padding.
export default function ExpedicaoLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarExpedicao />
      <main className="flex-1 md:ml-64 p-4 pt-[4.5rem] md:p-8 md:pt-8 overflow-auto print:ml-0 print:p-0">
        {children}
      </main>
    </div>
  );
}
