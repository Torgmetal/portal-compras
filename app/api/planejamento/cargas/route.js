// GET /api/planejamento/cargas — todas as cargas programadas, para a lista.
//
// Vitor (25/08/2026): "nessa página quero que mude a forma de visualizar... para podermos ver apenas
// as que estão programadas, não ficando em botões por OP onde fica difícil de enxergar... pensei até
// mesmo em formato de planilha, igual fizemos na planilha de rastreabilidade, com filtros".
//
// ⚠ ENXUTA DE PROPÓSITO. Já existe /api/expedicao/programacao-cargas, que devolve o mesmo e MAIS:
// ela carrega `pecasConjunto` de TODAS as OPs ativas para calcular prontidão e peças esquecidas —
// na OP-067 sozinha são 5.700 peças. Serve àquela tela; para abrir uma lista de cargas seria pagar
// a conta inteira por três linhas de tabela.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO", "PCP", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cargas = await prisma.planejamentoCarga.findMany({
    orderBy: { dataPrevista: "asc" },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true, refCliente: true } },
      romaneio: { select: { numero: true, data: true, pesoRealKg: true } },
      itens: { select: { status: true, qtdPlanejada: true, qtdCarregada: true, pesoEstimadoKg: true } },
    },
  });

  // ⚠ o dia de HOJE em horário de Brasília, zerado: o servidor roda em UTC, e comparar com `new
  // Date()` cru faria a carga de hoje virar "atrasada" durante as três primeiras horas do dia.
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  hoje.setHours(0, 0, 0, 0);

  const linhas = cargas.map((c) => {
    const itens = c.itens || [];
    const pesoPlan = itens.reduce((s, i) => s + (Number(i.pesoEstimadoKg) || 0), 0);
    const carregados = itens.filter((i) => i.status === "CARREGADO").length;
    const naoEnviados = itens.filter((i) => i.status === "NAO_ENVIADO").length;
    const prevista = new Date(c.dataPrevista);

    // ⚠ ORDEM IMPORTA. Romaneio emitido é o fato mais forte: a carga saiu, e nada depois disso a
    // torna "atrasada". Cancelada vem antes de atrasada pelo mesmo motivo — não se cobra o que foi
    // cancelado. "Atrasada" é o que sobra: passou da data e ninguém tratou.
    const situacao =
      c.situacao === "CANCELADA" ? "CANCELADA"
      : c.romaneioId ? "EMBARCADA"
      : c.situacao === "CONFIRMADA" ? "CONFIRMADA"
      : prevista < hoje ? "ATRASADA"
      : "PROGRAMADA";

    return {
      id: c.id, opId: c.op.id, opNumero: c.op.numero,
      cliente: c.op.cliente || "", obra: c.op.obra || "", refCliente: c.op.refCliente || "",
      dataPrevista: c.dataPrevista.toISOString(),
      // ⚠ a data ORIGINAL só interessa quando mudou: é a prova de que a carga foi remarcada, e é
      // isso que separa "atrasou" de "foi empurrada".
      remarcadaDe: c.dataOriginal && +c.dataOriginal !== +c.dataPrevista ? c.dataOriginal.toISOString() : null,
      diasAtraso: situacao === "ATRASADA" ? Math.floor((hoje - prevista) / 86400000) : 0,
      descricao: c.descricao || "",
      situacao,
      itens: itens.length, carregados, naoEnviados,
      pesoPlanejadoKg: Math.round(pesoPlan),
      romaneio: c.romaneio ? { numero: c.romaneio.numero, data: c.romaneio.data, pesoRealKg: c.romaneio.pesoRealKg } : null,
      criadaEm: c.createdAt.toISOString(),
    };
  });

  const conta = (s) => linhas.filter((l) => l.situacao === s).length;
  return NextResponse.json({
    cargas: linhas,
    totais: {
      total: linhas.length,
      programadas: conta("PROGRAMADA"), atrasadas: conta("ATRASADA"),
      confirmadas: conta("CONFIRMADA"), embarcadas: conta("EMBARCADA"), canceladas: conta("CANCELADA"),
      pesoAberto: linhas.filter((l) => ["PROGRAMADA", "ATRASADA", "CONFIRMADA"].includes(l.situacao))
        .reduce((s, l) => s + l.pesoPlanejadoKg, 0),
    },
    geradoEm: new Date().toISOString(),
  });
}
