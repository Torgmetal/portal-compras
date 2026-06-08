// GET /api/financeiro/contas-pagar?de=YYYY-MM-DD&ate=YYYY-MM-DD
// Lê as Contas a Pagar da tabela local (espelho do Omie), filtrando por
// vencimento. Instantâneo. O sync incremental (cron + botão) mantém atualizado.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prismaDirect } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const sp = new URL(req.url).searchParams;
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const de  = sp.get("de")  ? new Date(sp.get("de")  + "T00:00:00.000-03:00") : null;
  const ate = sp.get("ate") ? new Date(sp.get("ate") + "T23:59:59.999-03:00") : null;
  const incluirPagas = sp.get("pagas") === "1"; // por padrão, esconde pagas/canceladas

  const where = {};
  if (de || ate) {
    where.dataVencimento = {};
    if (de)  where.dataVencimento.gte = de;
    if (ate) where.dataVencimento.lte = ate;
  }
  if (!incluirPagas) where.status = { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] };

  const [rows, estado] = await Promise.all([
    prismaDirect.contaPagar.findMany({ where, orderBy: { dataVencimento: "asc" }, take: 3000 }),
    prismaDirect.omieSyncState.findUnique({ where: { id: "contapagar" } }),
  ]);

  const contas = rows.map((c) => {
    const aberta = c.status && !["PAGO", "CANCELADO", "LIQUIDADO"].includes(c.status);
    const venc = c.dataVencimento;
    let situacao = c.status || "—";
    let diasAtraso = 0;
    if (aberta && venc) {
      if (venc < hoje0) { situacao = "VENCIDA"; diasAtraso = Math.floor((hoje0 - venc) / 86400000); }
      else situacao = "A VENCER";
    } else if (c.status === "PAGO" || c.status === "LIQUIDADO") situacao = "PAGA";
    else if (c.status === "CANCELADO") situacao = "CANCELADA";

    return {
      id: c.id,
      fornecedor: c.fornecedorNome || (c.fornecedorCodigo ? `Cód. ${c.fornecedorCodigo}` : "—"),
      valor: c.valor,
      valorPago: c.valorPago,
      vencimento: venc ? venc.toISOString() : null,
      emissao: c.dataEmissao ? c.dataEmissao.toISOString() : null,
      previsao: c.dataPrevisao ? c.dataPrevisao.toISOString() : null,
      numeroDocumento: c.numeroDocumento,
      nf: c.numeroDocFiscal,
      parcela: c.numeroParcela,
      pedidoCompra: c.numeroPedidoCompra,
      categoria: c.categoriaNome,
      tipoDocumento: c.tipoDocumento,
      observacao: c.observacao,
      situacao, diasAtraso, aberta,
    };
  });

  return NextResponse.json({
    contas,
    periodo: { de: de ? de.toISOString().slice(0, 10) : null, ate: ate ? ate.toISOString().slice(0, 10) : null },
    ultimoSync: estado?.ultimoSync ? estado.ultimoSync.toISOString() : null,
    totalRegistros: estado?.totalRegistros ?? null,
  });
}
