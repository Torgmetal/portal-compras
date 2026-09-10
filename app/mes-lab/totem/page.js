import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Factory, ArrowRight } from "lucide-react";

// A ESCOLHA DO RECURSO — só existe no laboratório.
//
// ⚠ NO CHÃO DE FÁBRICA ESTA TELA NÃO EXISTE. Cada totem fica preso a UMA máquina: o navegador abre
// direto em /mes-lab/totem/<codigo> e o operador nunca escolhe onde está. Deixar escolher seria
// deixar apontar produção da bancada do vizinho — e ninguém descobriria por semanas.

export const metadata = { title: "Totem (laboratório)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EscolherRecurso() {
  const setores = await prisma.mesSetor.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: { recursos: { where: { ativo: true }, orderBy: { nome: "asc" } } },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Factory className="text-torg-blue" size={26} />
        <h1 className="text-2xl font-bold text-torg-dark">Totem — escolher o posto</h1>
      </div>
      <p className="text-torg-gray text-sm mb-6">
        No chão de fábrica cada totem abre direto no seu posto. Esta lista existe só para testar.
      </p>

      {setores.map((setor) => (
        <section key={setor.id} className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-torg-gray mb-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: setor.cor || "#576D7E" }} />
            {setor.nome}
            <span className="font-normal normal-case">({setor.recursos.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {setor.recursos.map((r) => (
              <Link key={r.id} href={`/mes-lab/totem/${encodeURIComponent(r.codigo)}`}
                className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-torg-blue transition flex items-center justify-between gap-2">
                <span>
                  <span className="block font-semibold text-torg-dark leading-tight">{r.nome}</span>
                  <span className="block text-[11px] text-torg-gray">
                    {r.codigo}{r.codigoSyneco ? ` · Syneco ${r.codigoSyneco}` : ""}
                  </span>
                </span>
                <ArrowRight size={16} className="text-torg-gray shrink-0" />
              </Link>
            ))}
            {!setor.recursos.length && (
              <p className="text-sm text-torg-gray col-span-full">Nenhum recurso cadastrado neste setor.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
