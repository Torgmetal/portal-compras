"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Gauge, PlusCircle, FolderKanban, Building2, Boxes, Layers, Truck, RailSymbol, ShoppingCart, Forklift, Hammer, Star, PackageCheck
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

// matchPainel: o detalhe da RM (/compras/rm/[id]) é compartilhado entre os
// painéis — o link de origem passa ?painel=aluguel|montagem para o menu
// manter o item certo ativo (sem o parâmetro, vale RMs Materiais).
const menu = [
  { href: "/compras/painel-ops", label: "Painel de OPs", icon: FolderKanban },
  // ⚠ ENTRA NO MENU JUNTO COM A TELA. A auditoria de 23/08 encontrou 11 páginas órfãs — tela sem
  // link é tela que ninguém usa, e a lista dos itens que não casaram com o CMR existia calculada
  // e jogada fora justamente por não ter para onde aparecer.
  { href: "/compras/recebimento-cmr", label: "Recebimento (CMR)", icon: PackageCheck, modulos: ["COMPRAS", "ALMOXARIFADO"] },
  { href: "/compras", label: "RMs Materiais", icon: RailSymbol, exact: true, matchAlso: "/compras/rm/" },
  { href: "/compras/consumiveis", label: "RMs Consumíveis", icon: ShoppingCart },
  { href: "/compras/aluguel", label: "Aluguel de Equipamentos", icon: Forklift, matchPainel: "aluguel" },
  { href: "/compras/montagem", label: "Medição de Montagem", icon: Hammer, matchPainel: "montagem" },
  { href: "/compras/nova-rm", label: "Nova RM", icon: PlusCircle },
  { href: "/compras/cronograma", label: "Entregas", icon: Truck },
  { href: "/compras/estoque", label: "Estoque", icon: Boxes },
  { href: "/compras/materiais", label: "Materiais por OP", icon: Layers },
  { href: "/compras/vendorlist", label: "Vendor List", icon: Building2 },
  { href: "/compras/indicadores/fornecedores", label: "Avaliação Fornecedores (IQF)", icon: Star },
  { href: "/compras/indicadores", label: "Indicadores", icon: Gauge, exact: true },
];

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const ehDetalheRM = pathname.startsWith("/compras/rm/");
  const painel = searchParams.get("painel"); // contexto de origem do detalhe da RM

  // Visibilidade por módulo: itens sem `modulos` são do Compras (default). ADMIN e quem tem o
  // módulo COMPRAS vê tudo; quem só tem ALMOXARIFADO (lança CMR) vê apenas os itens liberados.
  const isAdmin = session?.user?.tipo === "ADMIN";
  const mods = session?.user?.modulos ?? [];
  const podeVer = (m) => {
    if (m.masterOnly && !isAdmin) return false;
    if (isAdmin) return true;
    const req = m.modulos || ["COMPRAS"];
    return req.some((x) => mods.includes(x));
  };

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {menu.filter(podeVer).map((m) => {
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
