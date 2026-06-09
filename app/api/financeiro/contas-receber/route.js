// GET /api/financeiro/contas-receber?de=YYYY-MM-DD&ate=YYYY-MM-DD
// Lê as Contas a Receber da tabela local (espelho do Omie), filtrando por
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
  const incluirRecebidas = sp.get("recebidas") === "1"; // por padrão, esconde os sem saldo (já recebidos)

  const where = {};
  if (de || ate) {
    where.dataVencimento = {};
    if (de)  where.dataVencimento.gte = de;
    if (ate) where.dataVencimento.lte = ate;
  }
  // "Aberta" = ainda tem saldo a receber (saldo > 0). Capta os recebidos
  // parcialmente (status RECEBIDO no Omie mas com saldo). Cancelados fora.
  if (!incluirRecebidas) { where.saldo = { gt: 0 }; where.status = { not: "CANCELADO" }; }

  const [rows, estado] = await Promise.all([
    prismaDirect.contaReceber.findMany({ where, orderBy: { dataVencimento: "asc" }, take: 3000 }),
    prismaDirect.omieSyncState.findUnique({ where: { id: "contareceber" } }),
  ]);

  const contas = rows.map((c) => {
    const cancelada = c.status === "CANCELADO";
    const aberta = !cancelada && (c.saldo || 0) > 0.01;
    const venc = c.dataVencimento;
    const pctRecebido = c.valor > 0 ? Math.round((c.valorRecebido / c.valor) * 100) : 0;
    let situacao = "—";
    let diasAtraso = 0;
    if (cancelada) situacao = "CANCELADA";
    else if (!aberta) situacao = "RECEBIDA";
    else if (venc && venc < hoje0) { situacao = "VENCIDA"; diasAtraso = Math.floor((hoje0 - venc) / 86400000); }
    else situacao = "A VENCER";

    return {
      id: c.id,
      cliente: c.clienteNome || (c.clienteCodigo ? `Cód. ${c.clienteCodigo}` : "—"),
      valor: c.valor,
      valorRecebido: c.valorRecebido,
      saldo: c.saldo,
      pctRecebido,
      parcial: aberta && c.valorRecebido > 0.01,
      vencimento: venc ? venc.toISOString() : null,
      emissao: c.dataEmissao ? c.dataEmissao.toISOString() : null,
      previsao: c.dataPrevisao ? c.dataPrevisao.toISOString() : null,
      numeroDocumento: c.numeroDocumento,
      nf: c.numeroDocFiscal,
      chaveNfe: c.chaveNfe || null,
      parcela: c.numeroParcela,
      os: c.numeroOS,
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
