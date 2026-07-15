"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet, Building2, Wrench } from "lucide-react";

// Índice da Central de Orçamentos: 3 tipos de proposta. Renderizado no topo das
// três telas; navega entre elas destacando a ativa pela URL.
const TABS = [
  { href: "/comercial/orcamentos", label: "Propostas", icon: FileSpreadsheet, exact: true },
  { href: "/comercial/orcamentos/propostas", label: "Propostas Estruturas", icon: Building2 },
  { href: "/comercial/orcamentos/servicos", label: "Propostas Serviço", icon: Wrench },
];

export default function OrcamentosTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b border-gray-200 mb-5">
      <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wider mb-1.5">Central de Orçamentos</p>
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                active ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"
              }`}
            >
              <Icon size={15} /> {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
