"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet, CalendarClock, GitBranchPlus, BarChart3 } from "lucide-react";

// Navegação da Central de Orçamentos — agora a ÚNICA, depois que o submenu da barra lateral saiu
// (Vitor 29/08/2026). Renderizada no topo de todas as telas do módulo.
//
// ⚠⚠ AQUI SÓ ENTRA VISÃO, NUNCA CRIADOR. "Propostas Estruturas" e "Propostas Serviço" saíram
// daqui e viraram BOTÃO na tela de Propostas — Vitor: "nos botões de proposta colocar o criar
// proposta estrutura e criar proposta serviço". Aba é para onde se OLHA; botão é o que se FAZ, e
// misturar os dois foi o que encheu a navegação de itens que ninguém sabia distinguir.
const TABS = [
  { href: "/comercial/orcamentos", label: "Propostas", icon: FileSpreadsheet, exact: true },
  { href: "/comercial/orcamentos/acompanhamento", label: "Acompanhamento", icon: CalendarClock },
  { href: "/comercial/orcamentos/pipeline", label: "Pipeline", icon: GitBranchPlus },
  { href: "/comercial/orcamentos/kpis", label: "KPIs de Vendas", icon: BarChart3 },
];

export default function OrcamentosTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b border-gray-200 mb-5">
      <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wider mb-1.5">Central de Orçamentos</p>
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                active ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
              }`}
            >
              <Icon size={15} /> {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
