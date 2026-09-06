import {
  FolderKanban,
  PencilRuler,
  ShoppingCart,
  RailSymbol,
  Factory,
  DollarSign,
  Truck,
  Settings,
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
import { ehAdminDoPortal } from "./admin-portal";

export const MODULOS = [
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
    modulos: ["PRODUCAO"],
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
    modulos: [],
    apenasAdmin: true,
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

export function modulosPermitidos(user) {
  if (!user || !["ADMIN", "USUARIO"].includes(user.tipo)) return [];
  const admin = user.tipo === "ADMIN";
  const acessos = (user.modulos ?? []).map(m => typeof m === "string" ? m : m.modulo);
  const campo = !admin && !acessos.includes("QUALIDADE") && acessos.includes("QUALIDADE_CAMPO");
  return MODULOS.filter(m => {
    if (m.apenasDiretoria) return !!user.diretoria;
    if (m.apenasAdminPortal) return ehAdminDoPortal(user.email);
    if (m.apenasAdmin) return admin;
    return admin || m.modulos === null || m.modulos.some(mod => acessos.includes(mod));
  }).map(m => campo && m.href === "/qualidade"
    ? { ...m, href: "/qualidade/inspecoes", desc: "Relatórios de inspeção" } : m);
}
