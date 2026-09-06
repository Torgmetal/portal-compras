"use client";
import { signOut } from "next-auth/react";
import TorgLogo from "@/components/TorgLogo";
import { emSetembroAmarelo, LACO } from "@/lib/campanha";
import { usarPrevia } from "@/lib/campanha-previa";

export default function WorkspaceAcesso({ children, logado = false }) {
  const previa = usarPrevia();
  return <div className="min-h-screen flex flex-col bg-slate-50 text-torg-dark">
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8 py-3">
      <div className="flex items-center gap-3">
        <TorgLogo size="sm" />
        <span className="text-[11px] tracking-[0.15em] text-torg-gray border-l border-slate-200 pl-3">WORKSPACE</span>
        {(emSetembroAmarelo() || previa) && <img src={LACO} alt="Setembro Amarelo" className="h-7 w-7 shrink-0" />}
      </div>
      {logado && <button type="button" onClick={() => signOut({ callbackUrl: "/entrar" })} className="text-sm text-torg-blue hover:underline py-2">Sair</button>}
    </header>
    <main className="flex-1 flex items-center justify-center px-5 py-10 sm:py-12">{children}</main>
    <footer className="text-center text-xs text-torg-gray px-5 pb-5">Torg Metal · Workspace</footer>
  </div>;
}
