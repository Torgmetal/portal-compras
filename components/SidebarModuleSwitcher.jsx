"use client";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FolderKanban,
  ShoppingCart,
  RailSymbol,
  Factory,
  DollarSign,
  Truck,
  Settings,
  ChevronDown,
  LayoutGrid,
  Users,
  Activity,
  ClipboardList,
  Cog,
} from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

/* ─── Módulos do portal ─────────────────────────────────────────── */

const MODULOS = [
  {
    href: "/comercial",
    label: "Comercial",
    desc: "OPs, contratos e medições",
    icon: FolderKanban,
    cor: "bg-blue-100 text-blue-700",
    modulos: ["COMERCIAL"], // null = liberado pra todos; array = requer um desses módulos ou ADMIN
  },
  {
    href: "/compras",
    label: "Compras",
    desc: "RMs, cotações e pedidos",
    icon: ShoppingCart,
    cor: "bg-orange-100 text-orange-700",
    modulos: ["COMPRAS"],
  },
  {
    href: "/rm",
    label: "Requisições",
    desc: "Criar e acompanhar RMs",
    icon: RailSymbol,
    cor: "bg-cyan-100 text-cyan-700",
    modulos: ["ENGENHARIA", "ALMOXARIFADO"],
  },
  {
    href: "/producao",
    label: "Produção",
    desc: "Controle e romaneios",
    icon: Factory,
    cor: "bg-green-100 text-green-700",
    modulos: ["PRODUCAO", "ALMOXARIFADO"],
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    desc: "Fluxo de caixa e KPIs",
    icon: DollarSign,
    cor: "bg-pink-100 text-pink-700",
    modulos: ["FINANCEIRO"],
  },
  {
    href: "/expedicao",
    label: "Expedição",
    desc: "Romaneios de saída",
    icon: Truck,
    cor: "bg-teal-100 text-teal-700",
    modulos: ["EXPEDICAO"],
  },
  {
    href: "/indicadores",
    label: "Indicadores",
    desc: "Scorecard, Savings e OTIF",
    icon: Activity,
    cor: "bg-indigo-100 text-indigo-700",
    modulos: ["COMPRAS"],
  },
  {
    href: "/rh",
    label: "RH",
    desc: "Funcionários e gestão de pessoas",
    icon: Users,
    cor: "bg-rose-100 text-rose-700",
    modulos: ["RH"],
  },
  {
    href: "/planejamento",
    label: "Planejamento",
    desc: "Cronogramas e programação semanal",
    icon: ClipboardList,
    cor: "bg-amber-100 text-amber-700",
    modulos: ["PLANEJAMENTO", "PRODUCAO"],
  },
  {
    href: "/pcp",
    label: "PCP",
    desc: "Máquinas, setores e aproveitamento",
    icon: Cog,
    cor: "bg-emerald-100 text-emerald-700",
    modulos: ["PCP", "PLANEJAMENTO", "PRODUCAO"],
  },
  {
    href: "/admin/usuarios",
    label: "Administração",
    desc: "Usuários e configurações",
    icon: Settings,
    cor: "bg-purple-100 text-purple-700",
    modulos: [], // apenas ADMIN (array vazio = nenhum módulo de usuário acessa)
    apenasAdmin: true,
  },
];

/* ─── Componente ────────────────────────────────────────────────── */

export default function SidebarModuleSwitcher({ moduloAtual }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  const isAdmin = session?.user?.tipo === "ADMIN";
  const userModulos = session?.user?.modulos ?? [];

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setAberto(false);
      }
    }
    if (aberto) {
      document.addEventListener("mousedown", handleClickFora);
      return () => document.removeEventListener("mousedown", handleClickFora);
    }
  }, [aberto]);

  // Fechar com ESC
  useEffect(() => {
    function handleEsc(e) {
      if (e.key === "Escape") setAberto(false);
    }
    if (aberto) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [aberto]);

  // Filtrar módulos acessíveis por tipo/modulos
  const modulosVisiveis = MODULOS.filter((m) => {
    if (!session?.user) return false;
    if (m.apenasAdmin) return isAdmin;
    if (m.modulos === null) return true; // liberado pra todos os logados
    if (isAdmin) return true;
    return m.modulos.some(mod => userModulos.includes(mod));
  });

  // Só mostra o switcher se tem mais de 1 módulo acessível
  const temMultiplos = modulosVisiveis.length > 1;

  return (
    <div ref={ref} className="relative px-5 py-5 border-b border-torg-blue-100">
      <button
        onClick={() => temMultiplos && setAberto((v) => !v)}
        className={`flex items-center gap-2 w-full group ${
          temMultiplos ? "cursor-pointer" : "cursor-default"
        }`}
        title={temMultiplos ? "Trocar de módulo" : undefined}
      >
        <TorgLogo size="sm" />
        {temMultiplos && (
          <ChevronDown
            size={14}
            className={`text-torg-gray group-hover:text-torg-blue transition-all ${
              aberto ? "rotate-180" : ""
            }`}
          />
        )}
      </button>
      <p className="text-[10px] text-torg-gray mt-1 tracking-wider uppercase">
        {moduloAtual}
      </p>

      {/* Dropdown de módulos */}
      {aberto && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-2 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[75vh] overflow-y-auto">
          <div className="px-3 py-1.5 mb-1">
            <p className="text-[10px] text-torg-gray uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <LayoutGrid size={11} />
              Módulos disponíveis
            </p>
          </div>
          {modulosVisiveis.map((m) => {
            const Icon = m.icon;
            const ativo = pathname.startsWith(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setAberto(false)}
                className={`flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-sm transition-colors ${
                  ativo
                    ? "bg-torg-blue-50 text-torg-blue font-semibold"
                    : "text-torg-dark hover:bg-gray-50"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-8 h-8 rounded-lg ${m.cor}`}
                >
                  <Icon size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-tight">{m.label}</p>
                  <p className="text-[11px] text-torg-gray leading-tight truncate">
                    {m.desc}
                  </p>
                </div>
                {ativo && (
                  <span className="w-1.5 h-1.5 rounded-full bg-torg-blue flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
