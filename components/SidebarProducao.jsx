"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity, ClipboardList, FileText, Package, Factory, Map,
  PackageSearch, Zap, ChevronDown, Wrench, Flame, Sparkles,
  Wind, Paintbrush, Truck, Settings2,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/producao", label: "Painel de Produção", icon: Activity, exact: true },
  { href: "/producao/mapa", label: "Mapa da Produção", icon: Map },
  {
    href: "/producao/programacao",
    label: "Programação",
    icon: Settings2,
    sub: [
      { href: "/producao/programacao/corte", label: "Corte", icon: Zap },
      { href: "/producao/programacao/montagem", label: "Montagem", icon: Wrench },
      { href: "/producao/programacao/solda", label: "Solda", icon: Flame },
      { href: "/producao/programacao/acabamento", label: "Acabamento", icon: Sparkles },
      { href: "/producao/programacao/jato", label: "Jato", icon: Wind },
      { href: "/producao/programacao/pintura", label: "Pintura", icon: Paintbrush },
      { href: "/producao/programacao/expedicao", label: "Expedição", icon: Truck },
    ],
  },
  { href: "/producao/controle", label: "Controle de Produção", icon: ClipboardList },
  { href: "/producao/controle-op", label: "Produção por OP", icon: Package },
  { href: "/producao/consulta-estoque", label: "Estoque", icon: PackageSearch },
  { href: "/producao/romaneios", label: "Romaneios", icon: FileText },
  { href: "/producao/mes", label: "Rastreabilidade Syneco", icon: Factory },
];

export default function SidebarProducao() {
  const pathname = usePathname();

  // Abre submenu automaticamente se estiver em rota filha
  const [openSub, setOpenSub] = useState(() =>
    pathname.startsWith("/producao/programacao") ? "/producao/programacao" : null
  );

  const toggleSub = (href) => setOpenSub((prev) => (prev === href ? null : href));

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal de Produção" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menu.map((m) => {
          const Icon = m.icon;
          const hasSub = m.sub && m.sub.length > 0;
          const active = m.exact
            ? pathname === m.href
            : !hasSub && pathname.startsWith(m.href);
          const activeGroup = hasSub && pathname.startsWith(m.href);
          const isOpen = openSub === m.href;

          return (
            <div key={m.href}>
              <div className="flex items-center">
                <Link
                  href={hasSub ? m.sub[0].href : m.href}
                  onClick={() => hasSub && !isOpen && setOpenSub(m.href)}
                  className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active || (activeGroup && !isOpen)
                      ? "bg-torg-blue text-white font-semibold shadow-sm"
                      : activeGroup
                        ? "bg-torg-blue-50 text-torg-blue font-semibold"
                        : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"
                  }`}
                >
                  <Icon size={18} />
                  {m.label}
                </Link>
                {hasSub && (
                  <button
                    onClick={() => toggleSub(m.href)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      active || activeGroup
                        ? "text-torg-blue hover:bg-torg-blue-50"
                        : "text-torg-gray hover:bg-gray-100"
                    }`}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>

              {/* Sub-items */}
              {hasSub && isOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l-2 border-torg-blue-100 pl-3">
                  {m.sub.map((s) => {
                    const SubIcon = s.icon;
                    const subActive = pathname === s.href || pathname.startsWith(s.href + "/");
                    return (
                      <Link
                        key={s.href}
                        href={s.href}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          subActive
                            ? "bg-torg-blue text-white font-semibold shadow-sm"
                            : "text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue"
                        }`}
                      >
                        <SubIcon size={15} />
                        {s.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
