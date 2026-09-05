// POST /api/qualidade/data-books/secao/[secaoId]/popular-material
// Vincula de uma vez TODOS os certificados de material (categoria MATERIAL) da OP
// do data book à seção — usado na Seção 04 (Certificados de usina / rastreabilidade).
// Idempotente: createMany com skipDuplicates (pula os já vinculados). Marca a seção
// como ANEXADO quando há certificados. Escrita em massa num único statement.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";
import { classificarMaterial, gruposDaSecao } from "@/lib/databook-secoes";
import { enriquecerComFicha } from "@/lib/databook-ficha-r";
import { consumiveisDaOP, abrasivosDaOP } from "@/lib/consumivel-solda";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  // 🚫 DATA BOOK FECHADO NÃO SE MEXE — a trava vale em TODA rota que altera seção, não só numa.
  // Vitor (19/08/2026): "os data books emitidos não mexa em nada, é um documento". Uma rota
  // esquecida vira a porta dos fundos: o livro continua dizendo R00 enquanto o conteúdo mudou.
  // A checagem e a mensagem vêm de lib/databook-revisao pra que todas respondam igual.
  {
    const _bookSec = await prisma.dataBookSecao.findUnique({
      where: { id: params.secaoId },
      select: { dataBook: { select: { status: true, emitidoEm: true, revisao: true } } },
    });
    if (_bookSec && estaFechado(_bookSec.dataBook)) {
      return NextResponse.json(erroPrecisaRevisao(_bookSec.dataBook), { status: 409 });
    }
  }

  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true, dataBook: { select: { opNumero: true, opId: true } } },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });

  const opNumero = secao.dataBook?.opNumero;
  if (!opNumero) return NextResponse.json({ success: false, error: "Data book sem OP vinculada" }, { status: 400 });

  // Certificados de material da OP (rastreabilidade importada do CMR), filtrados pelo
  // grupo da seção: seção 04 aço estrutural, seção 05 fixadores, seção 15 tintas. Outras seções: todos.
  const grupos = gruposDaSecao(secao.numero);
  const daOp = await prisma.documentoQualidade.findMany({
    where: { ativo: true, categoria: "MATERIAL", opNumero },
    select: { id: true, nome: true },
  });

  // ── O AÇO QUE ENTROU POR OUTRA OBRA ─────────────────────────────────────────────────────────
  //
  // Vitor (05/09/2026), fechando a OP-085: "possa ser que eu comprei material em nome de outro
  // cliente e o recebimento não fica sabendo". Quando alguém declara na Conferência de
  // Rastreabilidade que aquele perfil veio do R tal — um R lançado sob OUTRA obra — a §02 passa a
  // carimbar esse R na peça. Só que esta rota buscava certificado por `opNumero`, então o
  // certificado DESSE R nunca entrava na seção: o livro citaria um R cujo certificado não está nele.
  //
  // Puxar o R declarado é a mesma regra já usada na §06 (arame) e na granalha da §15: o que entra é
  // o lote que o motor de rastreio efetivamente aponta para esta obra, não o que a coluna OBRA diz.
  const rsDeclarados = [...new Set(
    (await prisma.trocaRastreabilidade.findMany({ where: { opNumero }, select: { rUsado: true } }))
      .map((t) => t.rUsado).filter(Boolean)
  )];
  const declarados = rsDeclarados.length
    ? await prisma.documentoQualidade.findMany({
        where: { ativo: true, categoria: "MATERIAL", importRef: { in: rsDeclarados } },
        select: { id: true, nome: true },
      })
    : [];
  const idsDaOp = new Set(daOp.map((d) => d.id));
  const todos = [...daOp, ...declarados.filter((d) => !idsDaOp.has(d.id))];
  // ── seção 06 NÃO SE RESOLVE POR OP ───────────────────────────────────────────────────────────────
  //
  // O arame entra no CMR SEM OP (é estoque geral, não é comprado por obra). A busca acima, que
  // filtra por `opNumero`, volta vazia — era por isso que a seção 06 nunca trazia nada. E puxar as 17
  // entradas do CMR colocaria no livro lotes que nunca encostaram nesta obra.
  //
  // Vitor (20/08/2026): "precisamos ter certeza desses certificados de acordo com o que está
  // marcado nos croquis, conforme alinhamos na página do PCP". Então a seção 06 traz os lotes que o
  // MESMO cálculo do carimbo do desenho aponta: para cada conjunto, o arame vigente na data em que
  // ele foi soldado.
  let docs;
  if (secao.numero === "06") {
    const opId = secao.dataBook?.opId || (await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } }))?.id;
    const usados = await consumiveisDaOP(opId);
    if (!usados.length) {
      return NextResponse.json({ success: true, vinculados: 0, total: 0, semDocs: true });
    }
    const rs = usados.map((u) => u.rastreio);
    docs = await prisma.documentoQualidade.findMany({
      where: { ativo: true, categoria: "MATERIAL", importRef: { in: rs } },
      select: { id: true, nome: true },
    });
  } else {
    // ⚠ classifica pela FICHA DO CMR, não pelo nome do vínculo. Certificado anexado se chama só
    // "R 260527" — sem o material, `classificarMaterial` cai no padrão ESTRUTURAL e a tinta vai
    // parar na seção 04. Ver lib/databook-ficha-r.js.
    const enriquecidos = await enriquecerComFicha(todos, opNumero);
    docs = grupos.length ? enriquecidos.filter((d) => grupos.includes(classificarMaterial(d.nome))) : enriquecidos;

    // ⚠⚠ A GRANALHA ENTRA NA §15 JUNTO DAS TINTAS (Vitor, 28/08/2026), e ela NÃO se resolve por OP:
    // como o arame, é comprada para estoque e entra no CMR sem obra. O que vale aqui é o lote
    // vigente nos dias em que ESTA obra foi jateada — mesma regra da §06.
    if (grupos.includes("ABRASIVO")) {
      const opId = secao.dataBook?.opId || (await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } }))?.id;
      const usados = await abrasivosDaOP(opId);
      if (usados.length) {
        const abrasivos = await prisma.documentoQualidade.findMany({
          where: { ativo: true, categoria: "MATERIAL", importRef: { in: usados.map((u) => u.rastreio) } },
          select: { id: true, nome: true },
        });
        const jaTem = new Set(docs.map((d) => d.id));
        docs = [...docs, ...abrasivos.filter((a) => !jaTem.has(a.id))];
      }
    }
  }
  if (!docs.length) {
    return NextResponse.json({ success: true, vinculados: 0, total: 0, semDocs: true });
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: docs.map((d) => ({ secaoId: params.secaoId, documentoId: d.id })),
    skipDuplicates: true,
  });

  // tem certificados agora → marca a seção como anexada (a trava de vencido continua valendo)
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "POPULAR_SECAO_MATERIAL_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { opNumero, novos: res.count, totalMaterial: docs.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, total: docs.length });
}
