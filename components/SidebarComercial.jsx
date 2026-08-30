"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FolderKanban, Inbox, FileSpreadsheet, ChevronDown, Presentation, Gauge, Rocket, Building2, Wrench } from "lucide-react";
import { useState } from "react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/comercial", label: "OPs", icon: FolderKanban, exact: true },
  // ⚠⚠ NA BARRA SÓ O QUE SE CRIA; NA TELA, O QUE SE CONSULTA. Vitor (30/08/2026): "os botões de
  // criar proposta devem ficar na lateral abaixo da Central de Orçamentos; a Central de Orçamentos
  // seria apenas para trazer todas as propostas que foram criadas, pipeline, KPIs e o
  // acompanhamento".
  //
  // É a divisão que faltava, e explica por que o menu antigo confundia: ele misturava sete itens
  // sem dizer quais eram VISÕES da mesma lista (Propostas, Pipeline, KPIs, Acompanhamento — que
  // agora são abas no topo da tela) e quais eram CAMINHOS PARA COMEÇAR algo novo. Sobram dois aqui,
  // e os dois abrem uma proposta.
  {
    href: "/comercial/orcamentos",
    label: "Central de Orçamentos",
    icon: FileSpreadsheet,
    sub: [
      { href: "/comercial/orcamentos/propostas", label: "Criar Proposta Estrutura", icon: Building2 },
      { href: "/comercial/orcamentos/servicos", label: "Criar Proposta Serviço", icon: Wrench },
    ],
  },
  { href: "/comercial/kickoffs", label: "Kick Offs — Aceites", icon: Rocket },
  { href: "/comercial/apresentacoes", label: "Apresentação ao Cliente", icon: Presentation },
  { href: "/comercial/aprovacoes", label: "Aprovações", icon: Inbox, masterOnly: true },
  { href: "/comercial/indicadores", label: "Indicadores", icon: Gauge },
];

export default function SidebarComercial() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isMaster = role === "ADMIN";

  // Abre o submenu automaticamente quando está numa rota filha
  const [openSub, setOpenSub] = useState(() =>
    pathname.startsWith("/comercial/orcamentos") ? "/comercial/orcamentos" : null
  );

  const toggleSub = (href) => setOpenSub((prev) => (prev === href ? null : href));

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal Comercial" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menu
          .filter((m) => !m.masterOnly || isMaster)
          .map((m) => {
            const Icon = m.icon;
            const hasSub = m.sub && m.sub.length > 0;
            const active = m.exact
              ? pathname === m.href
              : pathname === m.href; // exato para items com sub
            const activeGroup = hasSub && pathname.startsWith(m.href);
            const isOpen = openSub === m.href;

            return (
              <div key={m.href}>
                <div className="flex items-center">
                  <Link
                    href={m.href}
                    onClick={() => hasSub && !isOpen && setOpenSub(m.href)}
                    className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active || (activeGroup && !isOpen)
                        ? "bg-torg-blue text-white font-semibold shadow-sm"
                        : activeGroup
                          ? "bg-torg-blue-50 text-torg-blue font-semibold"
                          : "text-torg-dark hover:bg-torg-blue-50 hover:text-torg-blue"
                    }`}
                  >
                    <Icon size={18} />
                    {m.label}
                  </Link>
                  {hasSub && (
                    <button
                      onClick={() => toggleSub(m.href)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        active || activeGroup
                          ? "text-torg-blue hover:bg-torg-blue-50"
                          : "text-torg-gray hover:bg-gray-100"
                      }`}
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  )}
                </div>

                {/* Sub-items */}
                {hasSub && isOpen && (
                  <div className="ml-5 mt-1 space-y-0.5 border-l-2 border-torg-blue-100 pl-3">
                    {m.sub.map((s) => {
                      const SubIcon = s.icon;
                      const subActive = pathname === s.href;
                      return (
                        <Link
                          key={s.href}
                          href={s.href}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                            subActive
                              ? "bg-torg-blue text-white font-semibold shadow-sm"
                              : "text-torg-gray hover:bg-torg-blue-50 hover:text-torg-blue"
                          }`}
                        >
                          <SubIcon size={15} />
                          {s.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
