"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box, Search, CalendarDays, Layers, ClipboardCheck,
  Activity, FileText, Package, Factory, Map,
  PackageSearch, Wrench, Flame, Sparkles, Wind, Paintbrush, Truck, ListOrdered, Gauge,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

// Abas do fluxo de produção soltas no topo (mesmo padrão do PCP). As telas são
// as mesmas dos dois portais, mas a navegação fica sempre dentro da Produção.
const menu = [
  { href: "/producao", label: "Carteira de OPs", icon: Layers, exact: true },
  { href: "/producao/ordens", label: "Peças e execução", icon: Factory },
  { href: "/producao/materiais", label: "Materiais e rastreabilidade", icon: PackageSearch },
  { href: "/producao/qualidade", label: "Inspeções", icon: ClipboardCheck },
  { href: "/producao/romaneios", label: "Romaneios", icon: Truck },
  { href: "/producao/semana", label: "Carga da preparação", icon: CalendarDays },
  { href: "/producao/agenda", label: "Programação e recursos", icon: CalendarDays },
  { href: "/producao/modelo", label: "Obra em 3D", icon: Box },
];

export default function SidebarProducao() {
  const pathname = usePathname();
  const [busca, setBusca] = useState("");
  const norm = v => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const grupos = [{ nome: "Operação da fábrica", itens: menu.slice(0,7) }, { nome: "Consulta", itens: menu.slice(7) }];

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal de Produção" />

      <div className="px-3 pt-3">
        <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 bg-gray-50">
          <Search size={15} className="text-torg-gray shrink-0" />
          <input aria-label="Buscar na Produção" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar ferramenta…" className="w-full min-w-0 bg-transparent py-3 text-sm outline-none" />
        </label>
      </div>
      <nav aria-label="Navegação da Produção" className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {grupos.map(grupo => {
          const itens = grupo.itens.filter(m => norm(m.label).includes(norm(busca)));
          if (!itens.length) return null;
          return <div key={grupo.nome}>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-torg-gray px-3 mb-2">{grupo.nome}</p>
            <div className="space-y-1">{itens.map(m => {
              const Icon = m.icon;
              const active = m.exact ? pathname === m.href : pathname.startsWith(m.href);
              return <Link key={m.href} href={m.href} aria-current={active ? "page" : undefined}
                className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? "bg-torg-blue text-white font-semibold shadow-sm" : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"}`}>
                <Icon size={18} className="shrink-0" />{m.label}
              </Link>;
            })}</div>
          </div>;
        })}
        {!menu.some(m => norm(m.label).includes(norm(busca))) && <p className="px-3 text-sm text-torg-gray">Nenhuma ferramenta encontrada.</p>}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
