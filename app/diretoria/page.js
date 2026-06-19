import Link from "next/link";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria, ehDonoDiretoria } from "@/lib/diretoria";
import DiretoriaClient from "./DiretoriaClient";

export const metadata = { title: "Workspace Torg — Diretoria" };
export const dynamic = "force-dynamic";

export default async function DiretoriaPage() {
  const user = await requireUser();

  // Gate por allowlist — nem ADMIN entra sem estar liberado. Tela limpa de "sem
  // acesso" (não vaza nada) em vez de erro 500.
  if (!(await temAcessoDiretoria(user.email))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-torg-blue-50/30 p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Lock size={22} className="text-torg-gray" />
          </div>
          <h1 className="text-lg font-bold text-torg-dark">Área restrita</h1>
          <p className="text-sm text-torg-gray mt-2">
            Este módulo é de acesso controlado pela direção. Se você precisa entrar, peça a liberação ao Vitor.
          </p>
          <Link href="/" className="inline-block mt-5 text-sm text-torg-blue hover:underline">← Voltar ao portal</Link>
        </div>
      </div>
    );
  }

  return <DiretoriaClient isDono={ehDonoDiretoria(user.email)} userNome={user.name} />;
}
