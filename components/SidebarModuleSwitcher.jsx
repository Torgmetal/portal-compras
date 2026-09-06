"use client";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FolderKanban,
  PencilRuler,
  ShoppingCart,
  RailSymbol,
  Factory,
  DollarSign,
  Truck,
  Settings,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Users,
  Activity,
  ClipboardList,
  Cog,
  ShieldCheck,
  Lock,
  FileBarChart2,
  NotebookPen,
  ReceiptText,
} from "lucide-react";
import TorgLogo from "@/components/TorgLogo";
import ToggleSidebar from "@/components/ToggleSidebar";
import { emSetembroAmarelo, LACO } from "@/lib/campanha";
import { usarPrevia } from "@/lib/campanha-previa";
import { ehAdminDoPortal } from "@/lib/admin-portal";

/* ─── Módulos do portal ─────────────────────────────────────────── */

const MODULOS = [
  {
    href: "/comercial",
    label: "OPs",
    desc: "Ordens de produção",
    icon: FolderKanban,
    // Aberto a TODOS os setores (Vitor, 24/07): cada um vê as abas do seu
    // escopo; o financeiro é blindado. Antes era só ["COMERCIAL"].
    modulos: null,
  },
  {
    href: "/engenharia",
    label: "Engenharia",
    desc: "Detalhamento e marcas",
    icon: PencilRuler,
    modulos: ["ENGENHARIA"],
  },
  {
    href: "/compras",
    label: "Compras",
    desc: "RMs, cotações e pedidos",
    icon: ShoppingCart,
    modulos: ["COMPRAS"],
  },
  {
    href: "/rm",
    label: "Requisições",
    desc: "Criar e acompanhar RMs",
    icon: RailSymbol,
    modulos: ["REQUISICOES", "ENGENHARIA", "ALMOXARIFADO", "COMPRAS"],
  },
  {
    href: "/producao",
    label: "Produção",
    desc: "Controle e romaneios",
    icon: Factory,
    modulos: ["PRODUCAO", "ALMOXARIFADO"],
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    desc: "Fluxo de caixa e KPIs",
    icon: DollarSign,
    modulos: ["FINANCEIRO"],
  },
  {
    href: "/expedicao",
    label: "Expedição",
    desc: "Romaneios de saída",
    icon: Truck,
    modulos: ["EXPEDICAO"],
  },
  {
    href: "/fiscal",
    label: "Fiscal",
    desc: "Romaneios aguardando NF",
    icon: ReceiptText,
    modulos: ["FISCAL", "FINANCEIRO"],
  },
  {
    href: "/qualidade",
    label: "Qualidade",
    desc: "Documentos e data books",
    icon: ShieldCheck,
    // ⚠ o inspetor de campo entra para preencher o relatório no computador (Vitor, 04/09/2026) —
    // e lá dentro a Sidebar da Qualidade mostra só Inspeções, que é o que o middleware libera.
    modulos: ["QUALIDADE", "QUALIDADE_CAMPO"],
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    desc: "Status e fotos da obra",
    icon: FileBarChart2,
    modulos: ["COMERCIAL", "PRODUCAO", "ENGENHARIA", "PCP", "QUALIDADE"],
  },
  {
    href: "/indicadores",
    label: "Indicadores",
    desc: "Desempenho e resultados",
    icon: Activity,
    modulos: ["COMPRAS", "COMERCIAL", "RH", "PRODUCAO", "PCP", "PLANEJAMENTO", "EXPEDICAO", "QUALIDADE"],
  },
  {
    href: "/rh",
    label: "RH",
    desc: "Gestão de pessoas",
    icon: Users,
    modulos: ["RH"],
  },
  {
    href: "/planejamento",
    label: "Planejamento",
    desc: "Cronogramas e programação",
    icon: ClipboardList,
    modulos: ["PLANEJAMENTO", "PRODUCAO"],
  },
  {
    href: "/pcp",
    label: "PCP",
    desc: "Máquinas e aproveitamento",
    icon: Cog,
    modulos: ["PCP", "PLANEJAMENTO", "PRODUCAO"],
  },
  {
    href: "/reunioes",
    label: "Reuniões",
    desc: "Atas de reunião semanal",
    icon: NotebookPen,
    // Liberado pra todos os logados: os envolvidos precisam voltar na ata pra
    // responder as atividades. Criar/editar/enviar continua só ADMIN/PLANEJAMENTO.
    modulos: null,
  },
  {
    href: "/diretoria",
    label: "Diretoria",
    desc: "Acesso restrito",
    icon: Lock,
    apenasDiretoria: true, // visível só p/ quem está na allowlist (nem ADMIN burla)
  },
  {
    href: "/admin/usuarios",
    label: "Administração",
    desc: "Usuários e configurações",
    icon: Settings,
    modulos: [], // ninguém entra por módulo
    // ⚠ allowlist própria, igual à Diretoria — nem ADMIN burla. Vitor (05/09/2026): Caio, Guilherme
    // e Fabrine seguem com acesso full ao portal, sem o painel de administração. Ver lib/admin-portal.
    apenasAdminPortal: true,
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

  // ⚠ quem tem só o perfil de campo entra na Qualidade PELAS INSPEÇÕES: /qualidade (controle de
  // documentos) é do módulo inteiro e o middleware barra — o card levaria direto ao "sem acesso".
  const soCampoQualidade = !isAdmin && !userModulos.includes("QUALIDADE") && userModulos.includes("QUALIDADE_CAMPO");

  // Filtrar módulos acessíveis por tipo/modulos
  const modulosVisiveis = MODULOS.filter((m) => {
    if (!session?.user) return false;
    if (m.apenasDiretoria) return !!session.user.diretoria; // allowlist própria — nem ADMIN burla
    if (m.apenasAdminPortal) return ehAdminDoPortal(session.user.email);
    if (m.modulos === null) return true; // liberado pra todos os logados
    if (isAdmin) return true;
    return m.modulos.some(mod => userModulos.includes(mod));
  }).map((m) => (
    soCampoQualidade && m.href === "/qualidade"
      ? { ...m, href: "/qualidade/inspecoes", desc: "Relatórios de inspeção" }
      : m
  ));

  // Só mostra o switcher se tem mais de 1 módulo acessível
  const mostrarLaco = emSetembroAmarelo() || usarPrevia();
  const temMultiplos = modulosVisiveis.length > 1;

  return (
    <div ref={ref} className="relative px-5 py-5 border-b border-torg-blue-100">
      <div className="absolute top-2 right-2 z-10"><ToggleSidebar /></div>
      <button
        onClick={() => temMultiplos && setAberto((v) => !v)}
        className={`flex items-center gap-2 w-full group ${
          temMultiplos ? "cursor-pointer" : "cursor-default"
        }`}
        title={temMultiplos ? "Trocar de módulo" : undefined}
        aria-expanded={temMultiplos ? aberto : undefined}
      >
        <TorgLogo size="sm" />
        {/* ⚠ O LAÇO AO LADO DA MARCA, o mês inteiro. Vitor pediu no login e a recomendação foi
            estender aqui: este cabeçalho é compartilhado por 17 sidebars, então é o mesmo canto
            superior de TODA tela do portal — o login a pessoa vê uma vez por dia, este ela vê o
            dia inteiro. Fica DEPOIS do logo e antes da seta, para não separar a marca do controle
            de troca de módulo. */}
        {mostrarLaco ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={LACO} alt="Setembro Amarelo" title="Setembro Amarelo — a Torg Metal apoia a valorização da vida"
            // ⚠ `-ml-4`: o SVG do logo tem folga interna à direita, e com o gap normal o laço
            // ficava solto, parecendo outro elemento em vez de par da marca.
            className="-ml-4 h-7 w-7 shrink-0" />
        ) : null}
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
        <div className="absolute left-3 top-full mt-1 w-[308px] max-w-[calc(100vw-24px)] bg-white rounded-[14px] border border-slate-200 shadow-[0_8px_24px_rgba(0,41,69,0.08)] z-50 p-2 animate-in fade-in slide-in-from-top-1 duration-150 max-h-[min(75vh,calc(100dvh-120px))] overflow-y-auto overscroll-contain">
          <div className="px-3 pt-2 pb-3">
            <p className="text-[10px] text-torg-gray uppercase tracking-[0.12em] font-semibold flex items-center gap-2">
              <LayoutGrid size={13} strokeWidth={1.7} />
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
                aria-current={ativo ? "page" : undefined}
                className={`relative flex items-center gap-3 min-h-[62px] px-3 py-2.5 rounded-[9px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-torg-blue ${
                  ativo
                    ? "bg-torg-blue-50 text-torg-blue-600"
                    : "text-torg-dark hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center w-9 h-9 rounded-lg text-torg-blue ${ativo ? "bg-white" : "bg-torg-blue-50/60"}`}
                >
                  <Icon size={20} strokeWidth={1.7} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight">{m.label}</p>
                  <p className="mt-0.5 text-[12px] text-torg-gray leading-snug">
                    {m.desc}
                  </p>
                </div>
                {ativo && (
                  <>
                    <span aria-hidden="true" className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-full bg-torg-orange" />
                    <ChevronRight aria-hidden="true" size={15} className="shrink-0 text-torg-blue" />
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
