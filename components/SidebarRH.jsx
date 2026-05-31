"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Building2, Briefcase, Clock,
  CalendarDays, Heart, Network, Award, FileText,
  UserPlus, ShieldAlert, GraduationCap, BedDouble,
} from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/rh", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/rh/funcionarios", label: "Funcionários", icon: Users },
  { href: "/rh/vagas", label: "Vagas", icon: UserPlus },
  { href: "/rh/setores", label: "Setores", icon: Building2 },
  { href: "/rh/cargos", label: "Cargos", icon: Briefcase },
  { href: "/rh/documentos", label: "Documentos", icon: FileText },
  { href: "/rh/organograma", label: "Organograma", icon: Network },
  { href: "/rh/afastamentos", label: "Afastamentos", icon: BedDouble },
  { href: "/rh/acidentes", label: "Acidentes", icon: ShieldAlert },
  { href: "/rh/treinamentos", label: "Treinamentos", icon: GraduationCap },
  { href: "/rh/ponto", label: "Controle de Ponto", icon: Clock },
  { href: "/rh/ferias", label: "Férias", icon: CalendarDays },
  { href: "/rh/beneficios", label: "Benefícios", icon: Heart },
  { href: "/rh/competencias", label: "Competências", icon: Award },
];

export default function SidebarRH() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col min-h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Recursos Humanos" />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {menu.map((m) => {
          const Icon = m.icon;
          const active = m.exact ? pathname === m.href : pathname.startsWith(m.href);
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
              <Icon size={18} />
              {m.label}
            </Link>
          );
        })}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
