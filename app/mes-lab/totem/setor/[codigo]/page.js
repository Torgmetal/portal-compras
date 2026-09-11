import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { User } from "lucide-react";
import { visualDo } from "../../[codigo]/estado-visual";

// ─── AS BANCADAS DE UM SETOR — a home do PC daquele setor ─────────────────────
//
// Matheus (11/09/2026): "precisamos dividir o link dos setores para eu conseguir colocar em cada PC
// apenas o setor dele, exemplo um link apenas para o totem da montagem com as bancadas da montagem
// disponível para eles abrir".
//
// ⚠⚠ É ESTE LINK QUE VAI NO NAVEGADOR DA FÁBRICA, e a divisão por setor é a trava. A lista completa
// (`/mes-lab/totem`) mostra a fábrica inteira: no PC da montagem, ela deixaria alguém apontar
// produção no laser. O portão não é permissão — é não existir caminho até o posto do vizinho.
//
// ⚠ ESCURA E GRANDE, como o totem, e não clara como a tela de laboratório: é a mesma pessoa, com
// luva, no mesmo monitor. Trocar de estilo no meio do caminho faria parecer outro sistema.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const setor = await prisma.mesSetor.findUnique({ where: { codigo: decodeURIComponent(params.codigo) } });
  return { title: setor ? `Totem — ${setor.nome}` : "Totem", robots: { index: false, follow: false } };
}

export default async function BancadasDoSetor({ params }) {
  const codigo = decodeURIComponent(params.codigo);
  const setor = await prisma.mesSetor.findUnique({
    where: { codigo },
    include: { recursos: { where: { ativo: true }, orderBy: { nome: "asc" } } },
  });
  if (!setor) notFound();

  const ids = setor.recursos.map((r) => r.id);
  // ⚠ QUEM JÁ ESTÁ NA BANCADA APARECE AQUI. Sem isso, dois operadores abrem o mesmo posto e o
  // segundo entra na sessão do primeiro sem entender por que a tela já tem marca e quantidade.
  const [abertas, eventos] = await Promise.all([
    prisma.mesSessao.findMany({
      where: { recursoId: { in: ids }, status: "ABERTA" },
      select: { recursoId: true, marca: true, operadorId: true },
    }),
    prisma.mesEvento.findMany({
      where: { recursoId: { in: ids } },
      orderBy: { ocorridoEm: "desc" },
      distinct: ["recursoId"],
      select: { recursoId: true, tipo: true },
    }),
  ]);
  const operadores = await prisma.mesOperador.findMany({
    where: { id: { in: abertas.map((s) => s.operadorId).filter(Boolean) } },
    select: { id: true, nome: true },
  });

  const nomeDo = new Map(operadores.map((o) => [o.id, o.nome.trim().split(/\s+/)[0]]));
  const sessaoDo = new Map(abertas.map((s) => [s.recursoId, s]));
  const estadoDo = new Map(eventos.map((e) => [e.recursoId, e.tipo]));

  return (
    <div className="min-h-screen bg-torg-dark text-white p-6 md:p-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/45">Torg MES</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{setor.nome}</h1>
        <p className="text-white/50 text-lg mt-1">Toque na sua bancada para começar.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl">
        {setor.recursos.map((r) => {
          const sessao = sessaoDo.get(r.id);
          const { rotulo, fundo } = visualDo(estadoDo.get(r.id));
          return (
            <Link key={r.id} href={`/mes-lab/totem/${encodeURIComponent(r.codigo)}`}
                  className="bg-white/8 border border-white/12 hover:bg-white/16 rounded-2xl px-6 py-6 transition block">
              <span className="flex items-center justify-between gap-3 mb-2">
                <span className="text-2xl font-bold leading-tight truncate">{r.nome}</span>
                <span className={`${fundo} text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 shrink-0`}>
                  {rotulo}
                </span>
              </span>
              {sessao ? (
                <span className="block text-white/70">
                  <span className="flex items-center gap-1.5 text-sm">
                    <User size={15} /> {nomeDo.get(sessao.operadorId) || "em uso"}
                  </span>
                  <span className="block text-lg font-semibold text-white/90">{sessao.marca || "sem marca"}</span>
                </span>
              ) : (
                <span className="block text-white/40">livre</span>
              )}
            </Link>
          );
        })}
        {!setor.recursos.length && (
          <p className="text-white/50 text-lg col-span-full">Nenhuma bancada cadastrada neste setor.</p>
        )}
      </div>
    </div>
  );
}
