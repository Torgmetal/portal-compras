"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Settings, KeyRound } from "lucide-react";
import { VERSAO_LABEL, BUILD_HASH, BUILD_DATE } from "@/lib/versao";

export default function SidebarUserFooter() {
  const { data: session } = useSession();
  const tipo = session?.user?.tipo;
  const isAdmin = tipo === "ADMIN";

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
        {/* ⚠ trocar a senha estava só numa página solta, sem link de lugar nenhum — existia e
            ninguém achava. Aqui, ao lado do Sair, é onde a pessoa procura a própria conta. */}
        <Link
          href="/trocar-senha"
          title="Trocar minha senha"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-torg-gray hover:bg-gray-50 hover:text-torg-dark transition-colors"
        >
          <KeyRound size={14} />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/entrar" })}
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-torg-gray hover:bg-gray-50 hover:text-torg-dark transition-colors"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
      {/* Carimbo da versão no ar. O número de build sobe a cada commit que vai pro Vercel,
          então dá pra conferir num relance se a pessoa está vendo a atualização mais recente. */}
      {/* A tela de atualizações é só do ADMIN, então só ele recebe o link. Os demais continuam
          vendo o número — é o que a pessoa lê de volta quando o suporte pergunta em que versão
          ela está —, mas sem um link que só levaria ao /sem-acesso. */}
      {isAdmin ? (
        <Link
          href="/versao"
          className="mt-3 block text-[10px] text-torg-gray/70 tabular-nums hover:text-torg-blue transition-colors"
          title={`Commit ${BUILD_HASH} — build de ${BUILD_DATE}. Clique para ver as atualizações.`}
        >
          {VERSAO_LABEL}
        </Link>
      ) : (
        <p
          className="mt-3 text-[10px] text-torg-gray/70 tabular-nums select-text"
          title={`Commit ${BUILD_HASH} — build de ${BUILD_DATE}`}
        >
          {VERSAO_LABEL}
        </p>
      )}
    </div>
  );
}
