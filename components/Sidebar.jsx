"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, PlusCircle, Truck } from "lucide-react";

const menu = [
  { href: "/", label: "Painel", icon: BarChart3 },
  { href: "/nova-rm", label: "Nova RM", icon: PlusCircle },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col min-h-screen fixed left-0 top-0">
      <div className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-800">Portal de Compras</h1>
        <p className="text-xs text-gray-400 mt-0.5">Gestão de RMs e Cotações</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {menu.map((m) => {
          const Icon = m.icon;
          const active = pathname === m.href || (m.href === "/" && pathname.startsWith("/rm"));
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={18} />
              {m.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 border-t border-gray-100 text-xs text-gray-400">
        Integração Omie API
        <br />
        v1.0 — Protótipo
      </div>
    </aside>
  );
}
