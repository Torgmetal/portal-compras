"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { BarChart3, PlusCircle, FolderKanban, Bell, Building2, Boxes, Layers, Truck, ClipboardList, RailSymbol, ShoppingCart, Forklift, Hammer, Presentation } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

// matchPainel: o detalhe da RM (/compras/rm/[id]) é compartilhado entre os
// painéis — o link de origem passa ?painel=aluguel|montagem para o menu
// manter o item certo ativo (sem o parâmetro, vale RMs Materiais).
const menu = [
  { href: "/compras/painel-ops", label: "Painel de OPs", icon: FolderKanban },
  { href: "/compras", label: "RMs Materiais", icon: RailSymbol, exact: true, matchAlso: "/compras/rm/" },
  { href: "/compras/consumiveis", label: "RMs Consumíveis", icon: ShoppingCart },
  { href: "/compras/aluguel", label: "Aluguel de Equipamentos", icon: Forklift, matchPainel: "aluguel" },
  { href: "/compras/montagem", label: "Medição de Montagem", icon: Hammer, matchPainel: "montagem" },
  { href: "/compras/nova-rm", label: "Nova RM", icon: PlusCircle },
  { href: "/compras/cronograma", label: "Entregas", icon: Truck },
  { href: "/compras/saldo-materiais", label: "Saldo Materiais", icon: ClipboardList },
  { href: "/compras/estoque", label: "Estoque", icon: Boxes },
  { href: "/compras/materiais", label: "Materiais por OP", icon: Layers },
  { href: "/compras/vendorlist", label: "Vendor List", icon: Building2 },
  { href: "/compras/apresentacoes", label: "Apresentação ao Cliente", icon: Presentation },
  { href: "/compras/notificacoes", label: "Notificações", icon: Bell, masterOnly: true },
];

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const ehDetalheRM = pathname.startsWith("/compras/rm/");
  const painel = searchParams.get("painel"); // contexto de origem do detalhe da RM

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {menu.filter((m) => !m.masterOnly || session?.user?.role === "ADMIN").map((m) => {
        const Icon = m.icon;
        let active = m.exact
          ? pathname === m.href || (m.matchAlso && pathname.startsWith(m.matchAlso) && !painel)
          : pathname.startsWith(m.href);
        if (m.matchPainel && ehDetalheRM && painel === m.matchPainel) active = true;
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
            <Icon size={18} />
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal de Compras" />
      <Suspense fallback={<nav className="flex-1 px-3 py-4" />}>
        <SidebarNav />
      </Suspense>
      <SidebarUserFooter />
    </aside>
  );
}
