"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BarChart3, PlusCircle, Package, FolderKanban, Bell, Building2, Boxes, Layers, CalendarClock, ClipboardList, Wrench, ShoppingCart } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/compras/painel-ops", label: "Painel de OPs", icon: FolderKanban },
  { href: "/compras", label: "RMs Materiais", icon: Wrench, exact: true, matchAlso: "/compras/rm/" },
  { href: "/compras/consumiveis", label: "RMs Consumíveis", icon: ShoppingCart },
  { href: "/compras/nova-rm", label: "Nova RM", icon: PlusCircle },
  { href: "/compras/cronograma", label: "Entregas", icon: CalendarClock },
  { href: "/compras/saldo-materiais", label: "Saldo Materiais", icon: ClipboardList },
  { href: "/compras/estoque", label: "Estoque", icon: Boxes },
  { href: "/compras/materiais", label: "Materiais por OP", icon: Layers },
  { href: "/compras/vendorlist", label: "Vendor List", icon: Building2 },
  { href: "/compras/catalogo", label: "Catálogo", icon: Package },
  { href: "/compras/notificacoes", label: "Notificações", icon: Bell, masterOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col min-h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal de Compras" />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {menu.filter((m) => !m.masterOnly || session?.user?.role === "ADMIN").map((m) => {
          const Icon = m.icon;
          const active = m.exact
            ? pathname === m.href || (m.matchAlso && pathname.startsWith(m.matchAlso))
            : pathname.startsWith(m.href);
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

      <SidebarUserFooter />
    </aside>
  );
}
