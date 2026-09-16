// GET /api/expedicao/conferencia/[id]/relatorio?formato=pdf|xlsx
//
// O documento de uma conferência — a listagem de peças conferidas que a expedição leva junto com o
// romaneio. Matheus (16/09/2026).
//
// ⚠⚠ UMA ROTA PARA OS DOIS FORMATOS, E NO SERVIDOR. A conferência é usada no CELULAR, no pátio: um
// link que o navegador baixa vale mais que uma geração no cliente, que exigiria a tela ter todos os
// dados carregados. E é isto que deixa o botão existir tanto no cartão da lista quanto dentro da
// sessão, sem duplicar a montagem em dois lugares.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saldosDaOP, STATUS } from "@/lib/conferencia-peca";
import { montarRelatorio, nomeDoArquivo } from "@/lib/conferencia-relatorio";
import { dispArquivo } from "@/lib/arquivo-http";
import { log } from "@/lib/log";

const registro = log("api/expedicao/conferencia/relatorio");

// Os mesmos perfis da tela e da API da conferência — quem pode conferir pode levar o papel.
const PERFIS = ["ADMIN", "EXPEDICAO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(req, { params }) {
  try {
    await requireRole(PERFIS);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const formato = (new URL(req.url).searchParams.get("formato") || "pdf").toLowerCase();
  if (!TIPOS[formato]) {
    return NextResponse.json({ success: false, error: "Formato inválido — use pdf ou xlsx." }, { status: 400 });
  }

  const sessao = await prisma.conferenciaPeca.findUnique({
    where: { id: params.id },
    select: {
      id: true, opId: true, opNumero: true, status: true, observacao: true,
      iniciadaEm: true, iniciadaPorNome: true, finalizadaEm: true, finalizadaPorNome: true,
    },
  });
  if (!sessao) return NextResponse.json({ success: false, error: "Conferência não encontrada." }, { status: 404 });

  // ⚠⚠ SESSÃO CANCELADA NÃO VIRA DOCUMENTO. Ela é o desfazer de quem abriu por engano — e um papel
  // com cabeçalho da Torg dizendo "conferência" daria ar de registro ao que foi anulado de
  // propósito. A ABERTA sai: é o relatório parcial de quem quer conferir o que falta no meio do
  // turno, e o documento diz "EM ANDAMENTO" no lugar de "finalizada em".
  if (sessao.status === STATUS.CANCELADA) {
    return NextResponse.json({ success: false, error: "Esta conferência foi cancelada — não há documento a emitir." }, { status: 409 });
  }

  try {
    const saldos = await saldosDaOP(prisma, sessao.opId);
    if (!saldos) return NextResponse.json({ success: false, error: "OP sem Lista de Expedição." }, { status: 404 });

    const lancamentos = await prisma.conferenciaPecaItem.findMany({
      where: { conferenciaId: sessao.id },
      orderBy: { criadoEm: "desc" },
      select: { id: true, marca: true, qte: true, observacao: true, criadoEm: true, criadoPorNome: true },
    });

    const rel = montarRelatorio({ sessao, op: saldos.op, marcas: saldos.marcas, lancamentos });
    const buf = formato === "pdf"
      ? await (await import("@/lib/conferencia-peca-pdf")).gerarConferenciaPDF(rel)
      : await (await import("@/lib/conferencia-peca-excel")).gerarConferenciaExcel(rel);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": TIPOS[formato],
        "Content-Disposition": dispArquivo(nomeDoArquivo(rel, formato), "attachment"),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // ⚠ A mensagem crua fica no log; quem clicou num botão de download não precisa (nem deve) ver
    // nome de tabela na tela.
    registro.erro("falha ao gerar:", formato, e?.message);
    return NextResponse.json({ success: false, error: "Não consegui gerar o documento." }, { status: 500 });
  }
}
