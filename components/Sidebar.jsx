"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, PlusCircle, Truck, Package, FolderKanban } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

const menu = [
  { href: "/compras/painel-ops", label: "Painel de OPs", icon: FolderKanban },
  { href: "/compras", label: "Painel de Compras", icon: BarChart3 },
  { href: "/compras/nova-rm", label: "Nova RM", icon: PlusCircle },
  { href: "/compras/catalogo", label: "Catálogo", icon: Package },
  { href: "/compras/fornecedores", label: "Fornecedores", icon: Truck },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col min-h-screen fixed left-0 top-0">
      <div className="px-5 py-5 border-b border-torg-blue-100">
        <TorgLogo size="md" />
        <p className="text-[10px] text-torg-gray mt-1 tracking-wider uppercase">
          Portal de Compras
        </p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menu.map((m) => {
          const Icon = m.icon;
          const active =
            pathname === m.href ||
            (m.href === "/compras" && pathname.startsWith("/compras/rm")) ||
            (m.href !== "/compras" && pathname.startsWith(m.href));
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
      <div className="px-5 py-4 border-t border-torg-blue-100 text-xs text-torg-gray">
        <div className="flex items-center justify-between">
          <span>Integração Omie</span>
          <span className="px-2 py-0.5 bg-torg-blue-50 text-torg-blue rounded-full text-[10px] font-semibold">
            v1.2
          </span>
        </div>
      </div>
    </aside>
  );
}
