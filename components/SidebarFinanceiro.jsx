"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DollarSign, FileText } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/financeiro", label: "Fluxo de Caixa", icon: DollarSign, exact: true },
  { href: "/financeiro/faturamento", label: "Faturamento por obra", icon: FileText },
  // Futuro: Receita projetada, Tributos, Conciliação, etc.
];

export default function SidebarFinanceiro() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col min-h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal Financeiro" />

      <nav className="flex-1 px-3 py-4 space-y-1">
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
