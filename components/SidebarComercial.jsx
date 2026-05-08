"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { FolderKanban, PlusCircle, Inbox, LogOut, Activity } from "lucide-react";
import TorgLogo from "@/components/TorgLogo";

const menu = [
  { href: "/comercial", label: "OPs", icon: FolderKanban, exact: true },
  { href: "/comercial/nova", label: "Nova OP", icon: PlusCircle },
  { href: "/producao", label: "Produção", icon: Activity },
  { href: "/comercial/aprovacoes", label: "Aprovações", icon: Inbox, masterOnly: true },
];

export default function SidebarComercial() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isMaster = role === "ADMIN";

  return (
    <aside className="w-64 bg-white border-r border-torg-blue-100 flex flex-col min-h-screen fixed left-0 top-0">
      <div className="px-5 py-5 border-b border-torg-blue-100">
        <TorgLogo size="sm" />
        <p className="text-[10px] text-torg-gray mt-1 tracking-wider uppercase">
          Portal Comercial
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {menu
          .filter((m) => !m.masterOnly || isMaster)
          .map((m) => {
            const Icon = m.icon;
            const active = m.exact
              ? pathname === m.href
              : pathname.startsWith(m.href);
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

      <div className="px-5 py-4 border-t border-torg-blue-100 text-xs">
        {session?.user && (
          <div className="mb-3">
            <p className="text-torg-dark font-medium truncate">{session.user.name}</p>
            <p className="text-torg-gray truncate">{session.user.email}</p>
            <p className="text-[10px] text-torg-gray uppercase tracking-wide mt-0.5">
              {role}
            </p>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/entrar" })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-torg-gray hover:bg-gray-50 hover:text-torg-dark transition-colors"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
    </aside>
  );
}
