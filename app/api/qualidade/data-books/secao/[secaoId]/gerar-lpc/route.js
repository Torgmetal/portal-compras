// POST /api/qualidade/data-books/secao/[secaoId]/gerar-lpc
// Gera o conteúdo da §02 (Desenhos as-built) a partir da LPC + certificados de
// material: por conjunto, as posições (croquis) com material, qtd no conjunto,
// rastreabilidade (corrida) e nº do certificado. Salva em
// DataBookSecao.conteudoJson (tipo "lpc") e marca a seção como ANEXADO.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";
import { montarSecaoLpc } from "@/lib/databook-lpc";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req, { params }) {
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
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true, dataBook: { select: { opNumero: true } } },
  });
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  const opNumero = secao.dataBook?.opNumero;
  if (!opNumero) return NextResponse.json({ success: false, error: "Data book sem OP vinculada" }, { status: 400 });

  const conteudo = await montarSecaoLpc(opNumero);
  if (!conteudo.conjuntos.length) {
    return NextResponse.json({ success: true, semLpc: true, totalPosicoes: 0, conjuntosCount: 0 });
  }

  await prisma.dataBookSecao.update({
    where: { id: params.secaoId },
    data: { conteudoJson: { tipo: "lpc", ...conteudo }, estado: "ANEXADO" },
  });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "GERAR_LPC_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { opNumero, conjuntos: conteudo.conjuntos.length, posicoes: conteudo.totalPosicoes, semCertificado: conteudo.semCertificado } } })
    .catch(() => {});

  return NextResponse.json({ success: true, conjuntosCount: conteudo.conjuntos.length, totalPosicoes: conteudo.totalPosicoes, semCertificado: conteudo.semCertificado });
}
