// POST /api/qualidade/data-books/secao/[secaoId]/popular-procedimentos
// Vincula à seção os procedimentos da Torg (SISTEMA / tipo "Procedimento") aplicáveis
// ao processo dela — casamento pelo nome via SECAO_PROCEDIMENTOS. Ex.: §14 puxa o
// PO-05 (pintura)/POI 05; §12 puxa PO-06/PO-15/PI-QUA. Idempotente (skipDuplicates).
import { sincronizarProcedimentosDataBook } from "@/lib/databook-procedimentos";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";
import { secaoUsaProcedimentos } from "@/lib/databook-secoes";

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
    select: { id: true, numero: true, dataBookId: true },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  if (!secaoUsaProcedimentos(secao.numero)) {
    return NextResponse.json({ success: false, error: "Esta seção não possui procedimentos associados." }, { status: 400 });
  }

  try {
    const resultado = await sincronizarProcedimentosDataBook(secao.dataBookId, { userId: user.id });
    return NextResponse.json({ success: true, vinculados: resultado.alterados });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 409 }); }

}
