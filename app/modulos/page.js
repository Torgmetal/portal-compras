import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { modulosPermitidos } from "@/lib/modulos-portal";
import { destinoLogin } from "@/lib/destino-login";
import WorkspaceAcesso from "@/components/WorkspaceAcesso";

export default async function ModulosPage() {
  const session = await getSession();
  if (!session?.user) redirect("/entrar");
  const destino = destinoLogin(session.user);
  if (destino !== "/modulos") redirect(destino);
  const modulos = modulosPermitidos(session.user);
  if (modulos.length === 1) redirect(modulos[0].href);
  return <WorkspaceAcesso logado>
    <section className="w-full max-w-4xl">
      <p className="text-xs uppercase tracking-widest text-torg-blue mb-3">Workspace Torg</p>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Seus módulos</h1>
      <p className="text-sm text-torg-gray">{modulos.length ? "Escolha por onde começar." : "Nenhum módulo disponível. Fale com o administrador."}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-7">
        {modulos.map(({ href, label, desc, icon: Icon }) => <Link key={href} href={href} className="group relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 hover:border-torg-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torg-blue">
          <span aria-hidden="true" className="absolute left-0 top-5 bottom-5 w-[3px] rounded-full bg-torg-orange opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-torg-blue-50/60 text-torg-blue"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
          <span className="flex-1 min-w-0"><span className="block text-base font-semibold mb-1">{label}</span><span className="block text-xs text-torg-gray">{desc}</span></span>
          <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-torg-blue" />
        </Link>)}
      </div>
    </section>
  </WorkspaceAcesso>;
}
