// POST /api/qualidade/data-books/secao/[secaoId]/popular-procedimentos
// Vincula à seção os procedimentos da Torg (SISTEMA / tipo "Procedimento") aplicáveis
// ao processo dela — casamento pelo nome via SECAO_PROCEDIMENTOS. Ex.: §14 puxa o
// PO-05 (pintura)/POI 05; §12 puxa PO-06/PO-15/PI-QUA. Idempotente (skipDuplicates).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";
import { secaoUsaProcedimentos, procedimentoCasaSecao, whereProcedimentos } from "@/lib/databook-secoes";

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
    select: { id: true, numero: true },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  if (!secaoUsaProcedimentos(secao.numero)) {
    return NextResponse.json({ success: false, error: "Esta seção não possui procedimentos associados." }, { status: 400 });
  }

  const procs = await prisma.documentoQualidade.findMany({
    where: whereProcedimentos(),
    select: { id: true, nome: true },
  });
  const aplicaveis = procs.filter((p) => procedimentoCasaSecao(p.nome, secao.numero));
  if (!aplicaveis.length) {
    // ⚠ DIZER POR QUE não veio nada. Vitor (19/08): "esses botões estão totalmente fora de
    // funcionamento, não trazem nada de informação". O botão não estava quebrado — a ORIGEM está
    // vazia: procura `categoria SISTEMA` com `tipo` contendo "Procedimento", e não existe nenhum
    // documento assim cadastrado (os 6 SISTEMA de hoje são CERTIFICAÇÃO ISO e EPS-RQPS 01..05,
    // todos sem `tipo`). Devolver "0 vinculados" calado faz parecer defeito do botão.
    return NextResponse.json({
      success: true, vinculados: 0, total: 0, semDocs: true,
      motivo: procs.length === 0
        ? "Nenhum procedimento cadastrado no Controle de Documentos. Cadastre com categoria SISTEMA e tipo começando por \"Procedimento\" — aí eles passam a aparecer aqui."
        : `Há ${procs.length} procedimento(s) cadastrado(s), mas nenhum casa com esta seção pelo nome.`,
    });
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: aplicaveis.map((d) => ({ secaoId: params.secaoId, documentoId: d.id })),
    skipDuplicates: true,
  });
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "POPULAR_SECAO_PROCEDIMENTOS_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { numero: secao.numero, novos: res.count, aplicaveis: aplicaveis.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, total: aplicaveis.length });
}
