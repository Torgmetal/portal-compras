"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, PackageCheck, Factory, ClipboardList, Tag, ClipboardCheck, Menu, X } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

// ⚠⚠ ESTE É O ÚNICO MÓDULO DO PORTAL QUE ABRE NO CELULAR, e há um motivo. Matheus (08/09/2026):
// "a ideia é usar essa tela em um celular em campo ou tablet para ele conferir as peças antes de
// ir para pintura e etiquetagem".
//
// Os outros 15 layouts são `ml-64` com a barra fixa — desenhados para monitor, e no telefone a
// barra come a tela inteira e o conteúdo fica empurrado para fora. Aqui a barra some abaixo de
// `md` e vira uma gaveta atrás do botão de menu. Acima de `md` NADA muda: mesmo `w-64` fixo, mesmo
// espaçamento — quem está no desktop não vê diferença nenhuma.

const menu = [
  { href: "/expedicao", label: "Romaneios", icon: FileText, exact: true },
  { href: "/expedicao/op", label: "Expedição por OP", icon: PackageCheck },
  // O que a OBRA ainda deve, direcionado ou não — a pergunta de quem embarca. (Vitor 19/08.)
  { href: "/expedicao/listas", label: "Listas de Expedição", icon: ClipboardList },
  { href: "/expedicao/terceiros", label: "Terceirizados", icon: Factory },
  // Substitui o BarTender: a etiqueta de 100×50 sai do próprio portal, sem planilha no meio.
  { href: "/expedicao/etiquetas", label: "Etiquetas de Carregamento", icon: Tag },
  // Conferir o lote contra a L.E. antes da pintura/etiquetagem — feita no celular, no pátio.
  { href: "/expedicao/conferencia", label: "Conferência de Peça", icon: ClipboardCheck },
];

function Itens({ pathname, onNavegar }) {
  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {menu.map((m) => {
        const Icon = m.icon;
        const active = m.exact ? pathname === m.href : pathname.startsWith(m.href);
        return (
          <Link key={m.href} href={m.href} onClick={onNavegar}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              active
                ? "bg-torg-blue text-white font-semibold shadow-sm"
                : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"
            }`}>
            <Icon size={18} /> {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SidebarExpedicao() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  // Navegar fecha a gaveta — sem isto, tocar num item no celular troca a página atrás do menu.
  useEffect(() => { setAberto(false); }, [pathname]);

  return (
    <>
      {/* ── desktop: exatamente como era ────────────────────────────────────── */}
      <aside className="w-64 bg-white border-r border-torg-blue-100 hidden md:flex flex-col h-screen fixed left-0 top-0 print:hidden">
        <SidebarModuleSwitcher moduloAtual="Portal de Expedição" />
        <Itens pathname={pathname} />
        <SidebarUserFooter />
      </aside>

      {/* ── celular: barra de topo + gaveta ─────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-torg-blue-100 flex items-center gap-2 px-3 print:hidden">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu"
          className="p-2 -ml-1 text-torg-dark">
          <Menu size={22} />
        </button>
        <span className="font-bold text-torg-dark truncate">Portal de Expedição</span>
      </header>

      {aberto && (
        <div className="md:hidden fixed inset-0 z-50 print:hidden">
          <button aria-label="Fechar menu" onClick={() => setAberto(false)}
            className="absolute inset-0 bg-black/40 w-full h-full" />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white flex flex-col shadow-xl">
            <div className="flex items-center justify-between pr-2">
              <div className="flex-1 min-w-0"><SidebarModuleSwitcher moduloAtual="Portal de Expedição" /></div>
              <button onClick={() => setAberto(false)} aria-label="Fechar menu" className="p-2 text-torg-gray">
                <X size={20} />
              </button>
            </div>
            <Itens pathname={pathname} onNavegar={() => setAberto(false)} />
            <SidebarUserFooter />
          </aside>
        </div>
      )}
    </>
  );
}
