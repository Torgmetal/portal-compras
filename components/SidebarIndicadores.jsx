"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Trophy, TrendingUp, Package, Clock, ShoppingCart,
  BarChart3, ChevronDown, ChevronRight, Target, DollarSign, Zap, Users, Briefcase,
  UserMinus, BedDouble, ShieldAlert, GraduationCap, Timer, CalendarRange,
} from "lucide-react";
import { useState, useEffect } from "react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const setores = [
  {
    id: "compras",
    label: "Compras",
    icon: ShoppingCart,
    base: "/indicadores/compras",
    sub: [
      { href: "/indicadores/compras", label: "Dashboard", icon: Activity, exact: true },
      { href: "/indicadores/compras/mensal", label: "Evolução Mensal", icon: CalendarRange },
      { href: "/indicadores/compras/scorecard", label: "Scorecard Fornecedores", icon: Trophy },
      { href: "/indicadores/compras/savings", label: "Savings por Obra", icon: TrendingUp },
      { href: "/indicadores/compras/otif", label: "OTIF", icon: Package },
      { href: "/indicadores/compras/atendimento", label: "Atendimento Interno", icon: Clock },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    icon: Briefcase,
    base: "/indicadores/comercial",
    sub: [
      { href: "/indicadores/comercial", label: "Dashboard", icon: Activity, exact: true },
      { href: "/indicadores/comercial/win-rate", label: "Win Rate", icon: Target },
      { href: "/indicadores/comercial/margem", label: "Margem Bruta", icon: DollarSign },
      { href: "/indicadores/comercial/pipeline", label: "Pipeline", icon: TrendingUp },
      { href: "/indicadores/comercial/tempo-resposta", label: "Tempo Resposta", icon: Zap },
      { href: "/indicadores/comercial/concentracao", label: "Concentração", icon: Users },
    ],
  },
  {
    id: "rh",
    label: "Recursos Humanos",
    icon: Users,
    base: "/indicadores/rh",
    sub: [
      { href: "/indicadores/rh", label: "Dashboard", icon: Activity, exact: true },
      { href: "/indicadores/rh/turnover", label: "Turnover", icon: UserMinus },
      { href: "/indicadores/rh/absenteismo", label: "Absenteísmo", icon: BedDouble },
      { href: "/indicadores/rh/acidentes", label: "Acidentes", icon: ShieldAlert },
      { href: "/indicadores/rh/treinamento", label: "Treinamento", icon: GraduationCap },
      { href: "/indicadores/rh/contratacao", label: "Contratação", icon: Timer },
    ],
  },
  // Futuros setores:
  // { id: "producao", label: "Produção", icon: Factory, base: "/indicadores/producao", sub: [...] },
];

export default function SidebarIndicadores() {
  const pathname = usePathname();

  // Expande automaticamente o setor ativo
  const setorAtivo = setores.find((s) => pathname.startsWith(s.base));
  const [expandidos, setExpandidos] = useState(
    setorAtivo ? [setorAtivo.id] : setores.map((s) => s.id)
  );

  useEffect(() => {
    const ativo = setores.find((s) => pathname.startsWith(s.base));
    if (ativo && !expandidos.includes(ativo.id)) {
      setExpandidos((prev) => [...prev, ativo.id]);
    }
  }, [pathname]);

  const toggleSetor = (id) => {
    setExpandidos((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Indicadores" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Link Visão Geral */}
        <Link
          href="/indicadores"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname === "/indicadores"
              ? "bg-torg-blue text-white font-semibold shadow-sm"
              : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"
          }`}
        >
          <BarChart3 size={18} />
          Visão Geral
        </Link>

        <div className="pt-2">
          {setores.map((setor) => {
            const Icon = setor.icon;
            const isExpanded = expandidos.includes(setor.id);
            const isSetorAtivo = pathname.startsWith(setor.base);

            return (
              <div key={setor.id} className="mb-1">
                {/* Header do setor */}
                <button
                  onClick={() => toggleSetor(setor.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${
                    isSetorAtivo
                      ? "text-torg-blue bg-torg-blue-50/50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={14} />
                    {setor.label}
                  </span>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>

                {/* Sub-itens */}
                {isExpanded && (
                  <div className="ml-2 mt-0.5 space-y-0.5">
                    {setor.sub.map((m) => {
                      const SubIcon = m.icon;
                      const active = m.exact
                        ? pathname === m.href
                        : pathname.startsWith(m.href);
                      return (
                        <Link
                          key={m.href}
                          href={m.href}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            active
                              ? "bg-torg-blue text-white font-semibold shadow-sm"
                              : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"
                          }`}
                        >
                          <SubIcon size={16} />
                          {m.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
