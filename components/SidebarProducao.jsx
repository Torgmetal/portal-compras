"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, ClipboardList, FileText, Package, Boxes, Factory, Map,
  PackageSearch, Wrench, Flame, Sparkles, Wind, Paintbrush, Truck, ListOrdered,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

// Abas do fluxo de produção soltas no topo (mesmo padrão do PCP). As telas são
// as mesmas dos dois portais, mas a navegação fica sempre dentro da Produção.
const menu = [
  { href: "/producao", label: "Painel de Produção", icon: Activity, exact: true },
  { href: "/producao/mapa", label: "Mapa da Produção", icon: Map },
  { href: "/producao/programacao/corte", label: "Programação", icon: Package, exact: true },
  { href: "/producao/programacao/fila-corte", label: "Corte", icon: ListOrdered },
  { href: "/producao/programacao/montagem", label: "Montagem", icon: Wrench },
  { href: "/producao/programacao/solda", label: "Solda", icon: Flame },
  { href: "/producao/programacao/acabamento", label: "Acabamento", icon: Sparkles },
  { href: "/producao/programacao/jato", label: "Jato", icon: Wind },
  { href: "/producao/programacao/pintura", label: "Pintura", icon: Paintbrush },
  { href: "/producao/programacao/expedicao", label: "Expedição", icon: Truck },
  { href: "/producao/controle", label: "Controle de Produção", icon: ClipboardList },
  { href: "/producao/controle-op", label: "Produção por OP", icon: Boxes },
  { href: "/producao/consulta-estoque", label: "Estoque", icon: PackageSearch },
  { href: "/producao/romaneios", label: "Romaneios", icon: FileText },
  { href: "/producao/mes", label: "Rastreabilidade Syneco", icon: Factory },
];

export default function SidebarProducao() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal de Produção" />

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
