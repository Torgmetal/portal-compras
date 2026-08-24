"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Target, ListOrdered, Gauge, FileText, Truck, Tv, FolderKanban, Printer, Factory,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  // Ordem definida pelo Vitor (30/07). "OPs" é atalho pro módulo comercial.
  // O acompanhamento ao vivo do corte (Syneco) vive dentro do Painel —
  // a página /pcp/corte segue existindo, linkada por lá ("detalhes").
  { href: "/comercial",        label: "OPs",              icon: FolderKanban },
  { href: "/pcp",              label: "Painel",           icon: LayoutDashboard, exact: true },
  // ⚠ "Produção" é a tela de TRABALHO; "Prioridades" é a TV da parede. Vitor (24/08/2026): "da
  // forma que está como painel não está funcionando" — as duas convivem, mas quem opera entra
  // aqui: lista de OPs, peças, o que o programador lançou e o botão de imprimir/liberar em lote.
  { href: "/pcp/producao",     label: "Produção",         icon: Factory },
  { href: "/pcp/relatorio-corte", label: "Relatório de Produção", icon: FileText },
  { href: "/pcp/pmp",          label: "PMP",              icon: Target },
  { href: "/pcp/dashboard-prioridades", label: "Prioridades (TV)", icon: Tv },
  { href: "/pcp/pecas-corte",  label: "Programação",      icon: Package },
  { href: "/pcp/terceirizados", label: "Terceirizados",   icon: Truck },
  // Controle de liberação de desenhos: quem levou qual desenho, quando e com qual R carimbado.
  { href: "/pcp/grd",          label: "GRD",              icon: Printer },
  { href: "/pcp/carga-corte",  label: "Carga do Corte",   icon: Gauge },
  { href: "/pcp/fila-corte",   label: "Corte",            icon: ListOrdered },
];

// FORA DO MENU DO PCP (Vitor 19/08/2026) — as PÁGINAS continuam no ar, só saíram daqui:
//   /pcp/montagem · /pcp/solda · /pcp/acabamento · /pcp/jato · /pcp/pintura
//     São invólucros das mesmas telas da Produção (importam os Clients de
//     /producao/programacao/…) e continuam no menu de lá. O PCP fica com o que é dele:
//     programação, PMP, prioridades e corte.
//   /pcp/romaneios-antigos
//     Ferramenta de migração — trouxe os romaneios da pasta da OP pro portal. Cumprida a
//     migração, vira ruído no menu do dia a dia.

export default function SidebarPCP() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="PCP" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menu.map((m) => {
          const Icon = m.icon;
          const active = m.exact ? pathname === m.href : pathname.startsWith(m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-torg-blue text-white font-semibold shadow-sm"
                  : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"
              }`}
            >
              <Icon size={18} /> {m.label}
            </Link>
          );
        })}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
