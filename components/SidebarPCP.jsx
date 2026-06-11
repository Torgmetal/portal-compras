"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Cpu, Wrench, Flame,
  Wind, Paintbrush, Package, Target, ListOrdered,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/pcp",              label: "Dashboard",        icon: LayoutDashboard, exact: true },
  { href: "/pcp/pmp",          label: "PMP",              icon: Target },
  { href: "/producao/programacao/corte", label: "Peças / Corte", icon: Package },
  { href: "/pcp/fila-corte",   label: "Fila de Corte",    icon: ListOrdered },
  { href: "/pcp/maquinas",     label: "Máquinas",         icon: Cpu },
  { href: "/pcp/montagem",     label: "Montagem",         icon: Wrench },
  { href: "/pcp/solda",        label: "Solda",            icon: Flame },
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
