"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ListOrdered, FileText, Truck, FolderKanban, Printer, Factory, Gauge, Flame,
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
  { href: "/pcp/pecas-corte",  label: "Programação",      icon: Package },
  { href: "/pcp/terceirizados", label: "Terceiros",       icon: Truck },
  // Controle de liberação de desenhos: quem levou qual desenho, quando e com qual R carimbado.
  { href: "/pcp/grd",          label: "GRD",              icon: Printer },
  { href: "/pcp/fila-corte",   label: "Corte",            icon: ListOrdered },
  // ⚠ a fila da solda vem DEPOIS do corte no menu porque é depois no fluxo: corte → montagem →
  // solda. Entra na fila quem já teve a montagem apontada como concluída no Syneco.
  { href: "/pcp/fila-solda",   label: "Fila de Solda",    icon: Flame },
  // ⚠ o indicador ISO do setor mora no menu do setor, como nos outros — quem responde por ele é
  // quem opera, não a Qualidade.
  { href: "/pcp/indicadores",  label: "Indicadores",      icon: Gauge },
];

// FORA DO MENU DO PCP (Vitor 26/08/2026) — as PÁGINAS continuam no ar, só saíram daqui:
//   /pcp/pmp · /pcp/carga-corte
//     "vamos remover o PMP da pagina do PCP" e "pode tirar o botão de carga de corte não faz
//     sentido". A carga do corte media dias de fila pela meta de 6.000 kg/dia da preparação; agora
//     quem diz o que desce e em que dia é a programação do Planejamento, lote a lote.
//   /pcp/dashboard-prioridades
//     "Prioridades TV não faz mais sentido" — mesma decisão que ele já tinha tomado no menu do
//     Planejamento. Quem opera entra em Produção; a régua da fila agora é a data programada.
//
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
