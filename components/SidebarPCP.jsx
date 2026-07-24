"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Wrench, Flame,
  Wind, Paintbrush, Package, Target, ListOrdered, Sparkles, Gauge, FileText, Truck, Tv,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  // O acompanhamento ao vivo do corte (Syneco) vive dentro do Painel —
  // a página /pcp/corte segue existindo, linkada por lá ("detalhes").
  { href: "/pcp",              label: "Painel",           icon: LayoutDashboard, exact: true },
  { href: "/pcp/pmp",          label: "PMP",              icon: Target },
  { href: "/pcp/pecas-corte",  label: "Programação",      icon: Package },
  { href: "/pcp/fila-corte",   label: "Corte",            icon: ListOrdered },
  { href: "/pcp/terceirizados", label: "Terceirizados",   icon: Truck },
  { href: "/pcp/carga-corte",  label: "Carga do Corte",   icon: Gauge },
  { href: "/pcp/relatorio-corte", label: "Relatório de Produção", icon: FileText },
  { href: "/pcp/dashboard-prioridades", label: "Prioridades (TV)", icon: Tv },
  { href: "/pcp/montagem",     label: "Montagem",         icon: Wrench },
  { href: "/pcp/solda",        label: "Solda",            icon: Flame },
  { href: "/pcp/acabamento",   label: "Acabamento",       icon: Sparkles },
  { href: "/pcp/jato",         label: "Jato",             icon: Wind },
  { href: "/pcp/pintura",      label: "Pintura",          icon: Paintbrush },
];

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
