"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FolderKanban, Inbox, History, FileSpreadsheet, GitBranchPlus, ChevronDown, BarChart3, FilePlus2 } from "lucide-react";
import { useState } from "react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/comercial", label: "OPs", icon: FolderKanban, exact: true },
  {
    href: "/comercial/orcamentos",
    label: "Central de Orçamentos",
    icon: FileSpreadsheet,
    sub: [
      { href: "/comercial/orcamentos/propostas", label: "Propostas", icon: FilePlus2 },
      { href: "/comercial/orcamentos/pipeline", label: "Pipeline", icon: GitBranchPlus },
      { href: "/comercial/orcamentos/kpis", label: "KPIs", icon: BarChart3 },
    ],
  },
  { href: "/comercial/aprovacoes", label: "Aprovações", icon: Inbox, masterOnly: true },
  { href: "/comercial/historico-verbas", label: "Histórico de verbas", icon: History },
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
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col min-h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Portal Comercial" />

      <nav className="flex-1 px-3 py-4 space-y-1">
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
