"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo, GanttChart, Truck, ClipboardCheck, Mail, Tv, CalendarClock, PackageCheck, ClipboardList } from "lucide-react";
import SidebarModuleSwitcher from "@/components/SidebarModuleSwitcher";
import SidebarUserFooter from "@/components/SidebarUserFooter";

const menu = [
  { href: "/planejamento/cronogramas", label: "Cronogramas", icon: GanttChart },
  { href: "/planejamento/datas-setor", label: "Datas por setor", icon: CalendarClock },
  { href: "/planejamento/comunicacao", label: "Matriz de comunicação", icon: Mail },
  { href: "/planejamento/expedicao-semanal", label: "Expedição Semanal", icon: Truck },
  { href: "/planejamento/programacao-cargas", label: "Programação de Cargas", icon: PackageCheck },
  // ⚠ vizinho da Programação de Cargas de propósito: são os dois passos da mesma conversa —
  // a carga é o que vai viajar, o romaneio prévio é a relação que a Expedição confere e emite.
  { href: "/planejamento/romaneios-previos", label: "Romaneios prévios", icon: ClipboardList },
  { href: "/planejamento/tarefas", label: "Tarefas", icon: ListTodo },
  { href: "/planejamento/prioridades", label: "Prioridades (TV)", icon: Tv },
  { href: "/planejamento/compromissos", label: "Meus Compromissos", icon: ClipboardCheck },
];

export default function SidebarPlanejamento() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col h-screen fixed left-0 top-0">
      <SidebarModuleSwitcher moduloAtual="Planejamento" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
              <Icon size={18} /> {m.label}
            </Link>
          );
        })}
      </nav>

      <SidebarUserFooter />
    </aside>
  );
}
