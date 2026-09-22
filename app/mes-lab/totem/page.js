import Link from "next/link";
import { mesPrisma as prisma } from "@/lib/mes/prisma";
import { Factory, ArrowRight, Monitor } from "lucide-react";

// A ESCOLHA DO RECURSO — só existe no laboratório.
//
// ⚠⚠ NO CHÃO DE FÁBRICA ESTA TELA NÃO EXISTE. Ela lista a fábrica INTEIRA: aberta no PC da montagem,
// deixaria alguém apontar produção no laser, e ninguém descobriria por semanas. O que vai no
// navegador de cada PC é o totem DO SETOR (`/mes-lab/totem/setor/<codigo>`), pedido pelo Matheus em
// 11/09/2026 — "um link apenas para o totem da montagem com as bancadas da montagem". O link de
// cada setor está ao lado do nome dele, para copiar.

export const metadata = { title: "Totem (laboratório)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EscolherRecurso({ searchParams }) {
  // ⚠⚠ A LISTA É DE UM MUNDO SÓ (achado do Codex, 22/09/2026). Sem o filtro, o mesmo "SOLDA 5"
  // aparecia duas vezes com rótulo idêntico — um de PROD, um de DEMO — e o link levava sempre ao
  // de PROD, porque só carregava o código. Escolher o posto de teste apontava na máquina de
  // verdade: o acidente que separar os dois mundos existia para impedir.
  const pedido = String(searchParams?.ambiente || "").trim().toUpperCase();
  const ambiente = pedido === "DEMO" ? "DEMO" : "PROD";
  const setores = await prisma.mesSetor.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: { recursos: { where: { ativo: true, ambiente }, orderBy: { nome: "asc" } } },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Factory className="text-torg-blue" size={26} />
        <h1 className="text-2xl font-bold text-torg-dark">Totem — escolher o posto</h1>
      </div>
      <p className="text-torg-gray text-sm mb-4">
        Esta lista mostra a fábrica inteira e existe só para testar. No chão de fábrica, cada PC abre
        o <b>totem do seu setor</b> — o link de cada um está ao lado do nome, abaixo.
      </p>

      {/* ⚠⚠ O SELETOR DE AMBIENTE SAIU DA TELA (Matheus, 22/09/2026): *"não sei se compensa ter
          DEMO e produção no MES, se ele já está fora de tudo eu posso ir testando em produção e
          depois zerar tudo"*. Ele tem razão — o MES já está fora de tudo (schema próprio, cliente
          próprio, ADMIN-only, fora do menu, sem UMA escrita em tabela do portal), então não há
          dado real para o DEMO proteger enquanto a fábrica está no Syneco.

          ⚠⚠ E O CUSTO FOI MEDIDO: das cinco falhas da 2ª rodada de revisão, DUAS eram do
          `ambiente` — o isolamento que não chegava às telas e os planos de nesting disputando dez
          posições na lista. Complexidade guardando casa vazia, e que erra enquanto guarda.

          ⚠ A MAQUINARIA FICA: a coluna `ambiente`, os índices `@@unique([codigo, ambiente])` e
          `@@unique([cracha, ambiente])` (provados no banco em 21/09) e os filtros das rotas. Tudo
          inerte com um mundo só, e sem custo. O dia em que houver produção de verdade no MES e
          alguém quiser um laboratório ao lado, é recolocar estes dois links — não reconstruir.

          ⚠ Para recomeçar do zero enquanto isso: `node scripts/mes-zerar.mjs --confirmo`. */}

      {setores.map((setor) => (
        <section key={setor.id} className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-torg-gray mb-2 flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: setor.cor || "#576D7E" }} />
            {setor.nome}
            <span className="font-normal normal-case">({setor.recursos.length})</span>
            {/* ⚠ É ESTE O LINK QUE VAI NO PC DO SETOR — ver o comentário no topo do arquivo. */}
            <Link href={`/mes-lab/totem/setor/${encodeURIComponent(setor.codigo)}?ambiente=${ambiente}`}
                  className="normal-case font-semibold text-torg-blue hover:underline flex items-center gap-1">
              <Monitor size={13} /> abrir o totem deste setor
            </Link>
            <code className="normal-case font-normal text-[11px] text-torg-gray bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
              /mes-lab/totem/setor/{setor.codigo}?ambiente={ambiente}
            </code>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {setor.recursos.map((r) => (
              <Link key={r.id} href={`/mes-lab/totem/${encodeURIComponent(r.codigo)}?ambiente=${ambiente}`}
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
