import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

// SEM ACESSO — a resposta certa para "você está logado, mas este módulo não é seu".
//
// Antes disso, faltar módulo devolvia `false` no `authorized` do middleware, e o NextAuth mandava
// a pessoa pro /entrar. Quem estava logado lia aquilo como "o sistema me deslogou" — foi a queixa
// da Pamela e da Eduarda em 21/08/2026, e o motivo era esse, não a sessão.

export const metadata = { title: "Sem acesso · Portal Torg" };

export default function SemAcesso({ searchParams }) {
  const de = typeof searchParams?.de === "string" ? searchParams.de : null;
  const modulo = typeof searchParams?.modulo === "string" ? searchParams.modulo : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm max-w-md w-full p-7 text-center">
        <div className="w-11 h-11 rounded-full bg-amber-50 text-amber-600 inline-flex items-center justify-center mb-3">
          <Lock size={20} />
        </div>
        <h1 className="text-lg font-bold text-torg-dark">Esta área não está liberada para você</h1>
        <p className="text-[13px] text-torg-gray mt-2 leading-relaxed">
          Sua sessão continua ativa — você <strong>não</strong> foi desconectado.
          {modulo ? <> O acesso a esta página depende do módulo <strong>{modulo}</strong>.</> : null}
        </p>
        {de && <p className="text-[11px] text-torg-gray mt-2 font-mono break-all">{de}</p>}
        <p className="text-[12px] text-torg-gray mt-4">
          Se precisa entrar aqui, peça a liberação ao administrador do portal.
        </p>
        <Link href="/" className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-torg-blue hover:text-torg-dark">
          <ArrowLeft size={14} /> Voltar ao início
        </Link>
      </div>
    </div>
  );
}
