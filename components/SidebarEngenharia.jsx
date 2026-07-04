"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, GitCompareArrows, RotateCcw, Upload, BarChart3 } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

// Itens ativos (Fase 1). Os demais aparecem como "em breve" pra comunicar o
// roadmap dentro do próprio produto (viram links conforme forem construídos).
const ITENS = [{ href: "/engenharia", label: "Visão Geral", icon: LayoutDashboard, exact: true }];
const EM_BREVE = [
  { label: "Detalhamento por OP", icon: FileText, hint: "abre clicando numa OP da carteira" },
  { label: "Reconciliação de Peso", icon: GitCompareArrows },
  { label: "Revisões & Retrabalho", icon: RotateCcw },
  { label: "Importar do Tekla", icon: Upload },
  { label: "Indicadores", icon: BarChart3 },
];

export default function SidebarEngenharia() {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal de Engenharia" />
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {ITENS.map((m) => {
          const Icon = m.icon;
          const active = m.exact ? pathname === m.href : pathname.startsWith(m.href);
          return (
            <Link key={m.href} href={m.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? "bg-torg-blue text-white font-semibold shadow-sm" : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"}`}>
              <Icon size={18} /> {m.label}
            </Link>
          );
        })}
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold px-3 pt-4 pb-1">Em breve</p>
        {EM_BREVE.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} title={m.hint || "Em desenvolvimento"}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 cursor-default select-none">
              <Icon size={18} /><span className="flex-1">{m.label}</span>
              <span className="text-[9px] font-bold border border-gray-200 rounded px-1 py-0.5">em breve</span>
            </div>
          );
        })}
      </nav>
      <SidebarUserFooter />
    </aside>
  );
}
