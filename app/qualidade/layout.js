import SidebarQualidade from "@/components/SidebarQualidade";

export const metadata = {
  title: "Workspace Torg — Portal da Qualidade",
  description: "Controle de documentos (NBR 16775) e data books por OP.",
};

export default function QualidadeLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <SidebarQualidade />
      <main className="flex-1 ml-64 p-8 overflow-auto print:ml-0 print:p-0">{children}</main>
    </div>
  );
}
