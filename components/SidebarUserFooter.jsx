"use client";
import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Settings, ChevronDown, Tag, Clock } from "lucide-react";
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
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-3 space-y-3 max-h-72 overflow-y-auto">
            <div className="px-3 pb-2 border-b border-gray-100">
              <p className="text-[10px] text-torg-gray uppercase tracking-wider font-semibold mb-1">
                Histórico de versões
              </p>
              <p className="text-[9px] text-torg-gray/60 font-mono">
                build {BUILD_HASH} · {BUILD_DATE}
              </p>
            </div>
            {CHANGELOG.map((release) => (
              <div key={release.versao} className="px-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono font-bold text-torg-dark text-[10px]">
                    v{release.versao}
                  </span>
                  <span className="flex items-center gap-1 text-[9px] text-torg-gray/70">
                    <Clock size={8} />
                    {release.data}
                  </span>
                </div>
                <p className="text-[10px] font-medium text-torg-blue mb-0.5">
                  {release.titulo}
                </p>
                <ul className="space-y-0.5">
                  {release.itens.map((item, i) => (
                    <li
                      key={i}
                      className="text-[10px] text-torg-gray leading-tight flex gap-1"
                    >
                      <span className="text-torg-gray/40 flex-shrink-0">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
