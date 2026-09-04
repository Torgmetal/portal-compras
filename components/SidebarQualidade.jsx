"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { FileCheck2, BookCheck, PackageCheck, ClipboardCheck, ClipboardList, Gauge, AlertOctagon, FolderTree, Ruler, Camera } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/qualidade", label: "Controle de Documentos", icon: FileCheck2, exact: true },
  { href: "/qualidade/calibracao", label: "Calibração", icon: Ruler },
  { href: "/qualidade/sgq", label: "Documentos do SGQ", icon: FolderTree },
  // ⚠ Vitor (30/08/2026): "precisamos tirar a Rastreabilidade do portal da Qualidade (…) o ideal
  // seria trazer um espelho dessa Recebimentos CMR, pois essa nova ficou muito boa". A conferência
  // de certificados não sumiu — virou a segunda aba dessa tela.
  { href: "/qualidade/recebimento-cmr", label: "Recebimento CMR", icon: PackageCheck },
  { href: "/qualidade/inspecoes", label: "Inspeções", icon: Camera },
  { href: "/qualidade/data-books", label: "Data Books", icon: BookCheck },
  // ⚠ Vitor (27/08/2026): "na auditoria internas deixar como Auditorias, e a auditoria externa
  // deixar como Homologações". Só o RÓTULO muda — a rota segue a mesma, senão link salvo, PDF e
  // tudo que aponta para cá quebra junto.
  { href: "/qualidade/auditorias-internas", label: "Auditorias", icon: ClipboardList },
  { href: "/qualidade/auditorias", label: "Homologações", icon: ClipboardCheck },
  { href: "/qualidade/rnc", label: "RNC", icon: AlertOctagon },
  { href: "/qualidade/indicadores", label: "Indicadores", icon: Gauge },
];

export default function SidebarQualidade() {
  const pathname = usePathname();
  // ⚠ O INSPETOR SÓ TEM INSPEÇÕES AQUI. Ele entra no Portal da Qualidade para preencher o
  // relatório no computador (Vitor, 04/09/2026), mas o resto do menu — data book, controle de
  // documentos, auditorias, calibração, CMR — é do módulo QUALIDADE e o middleware barra. Mostrar
  // o link seria oferecer uma porta que bate na cara de quem clica.
  const { data: session } = useSession();
  const mods = session?.user?.modulos || [];
  const soCampo = session?.user?.tipo !== "ADMIN" && !mods.includes("QUALIDADE") && mods.includes("QUALIDADE_CAMPO");
  const itens = soCampo ? menu.filter((m) => m.href === "/qualidade/inspecoes") : menu;

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0 print:hidden">
      <SidebarModuleSwitcher moduloAtual="Portal da Qualidade" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {itens.map((m) => {
          const Icon = m.icon;
          // Casa por SEGMENTO (href exato ou href + "/") — senão "/qualidade/auditorias"
          // acenderia junto em "/qualidade/auditorias-internas" (prefixo compartilhado).
          const active = m.exact ? pathname === m.href : (pathname === m.href || pathname.startsWith(m.href + "/"));
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
