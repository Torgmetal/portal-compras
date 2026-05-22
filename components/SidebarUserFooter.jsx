"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Settings } from "lucide-react";

export default function SidebarUserFooter() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";

  return (
    <div className="px-5 py-4 border-t border-torg-blue-100 text-xs">
      {session?.user && (
        <div className="mb-3">
          <p className="text-torg-dark font-medium truncate">
            {session.user.name}
          </p>
          <p className="text-torg-gray truncate">{session.user.email}</p>
          <p className="text-[10px] text-torg-gray uppercase tracking-wide mt-0.5">
            {role}
          </p>
        </div>
      )}
      <div className="flex items-center gap-1">
        {isAdmin && (
          <Link
            href="/admin/usuarios"
            title="Configurações"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-torg-gray hover:bg-gray-50 hover:text-torg-dark transition-colors"
          >
            <Settings size={14} />
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/entrar" })}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-torg-gray hover:bg-gray-50 hover:text-torg-dark transition-colors"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  );
}
