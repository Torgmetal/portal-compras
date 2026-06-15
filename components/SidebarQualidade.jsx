"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileCheck2, BookCheck, ScrollText } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/qualidade", label: "Controle de Documentos", icon: FileCheck2, exact: true },
  { href: "/qualidade/rastreabilidade", label: "Rastreabilidade", icon: ScrollText },
  { href: "/qualidade/data-books", label: "Data Books", icon: BookCheck },
];

export default function SidebarQualidade() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0 print:hidden">
      <SidebarModuleSwitcher moduloAtual="Portal da Qualidade" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menu.map((m) => {
          const Icon = m.icon;
          const active = m.exact ? pathname === m.href : pathname.startsWith(m.href);
          if (m.breve) {
            return (
              <div
                key={m.href}
                title="Em breve (próxima fase)"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 cursor-not-allowed"
              >
                <Icon size={18} /> {m.label}
                <span className="ml-auto text-[9px] font-semibold text-gray-300 border border-gray-200 rounded px-1 py-0.5">em breve</span>
              </div>
            );
          }
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
