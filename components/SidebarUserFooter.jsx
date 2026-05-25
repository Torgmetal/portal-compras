"use client";
import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Settings, ChevronDown, Tag } from "lucide-react";
import { VERSAO_ATUAL, BUILD_HASH, BUILD_DATE, CHANGELOG } from "@/lib/versao";

export default function SidebarUserFooter() {
  const { data: session } = useSession();
  const tipo = session?.user?.tipo;
  const isAdmin = tipo === "ADMIN";
  const [versaoAberta, setVersaoAberta] = useState(false);

  return (
    <div className="px-5 py-4 border-t border-torg-blue-100 text-xs">
      {session?.user && (
        <div className="mb-3">
          <p className="text-torg-dark font-medium truncate">
            {session.user.name}
          </p>
          <p className="text-torg-gray truncate">{session.user.email}</p>
          <p className="text-[10px] text-torg-gray uppercase tracking-wide mt-0.5">
            {tipo === "ADMIN" ? "Administrador" : (session.user.modulos?.[0] ?? tipo)}
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

      {/* Controle de versões */}
      <div className="mt-2 border-t border-torg-blue-50 pt-2 relative">
        <button
          onClick={() => setVersaoAberta((v) => !v)}
          className="flex items-center justify-between w-full px-1 py-1 text-[10px] text-torg-gray hover:text-torg-dark transition-colors rounded"
        >
          <span className="flex items-center gap-1.5">
            <Tag size={10} />
            <span className="font-mono font-semibold">v{VERSAO_ATUAL}</span>
            <span className="font-mono text-torg-gray/50">#{BUILD_HASH}</span>
          </span>
          <span className="text-torg-gray/50">{BUILD_DATE}</span>
          <ChevronDown
            size={10}
            className={`transition-transform ${versaoAberta ? "rotate-180" : ""}`}
          />
        </button>

        {versaoAberta && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-2">
            <p className="px-3 pb-1.5 text-[9px] text-torg-gray/50 uppercase tracking-wider border-b border-gray-100 font-mono">
              build {BUILD_HASH} · {BUILD_DATE}
            </p>
            {CHANGELOG.map((release) => (
              <div key={release.versao} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                <span className="font-mono font-semibold text-[10px] text-torg-dark">v{release.versao}</span>
                <span className="text-[10px] text-torg-gray mx-2 flex-1 truncate">{release.titulo}</span>
                <span className="text-[9px] text-torg-gray/50 shrink-0">{release.data}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
