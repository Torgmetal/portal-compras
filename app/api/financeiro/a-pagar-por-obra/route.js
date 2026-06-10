// GET /api/financeiro/a-pagar-por-obra
// "A pagar por obra" das compras de fornecedor (não-diretas), por obra e mês.
// Junta DUAS fontes, disjuntas (sem dupla contagem):
//  1) RECEBIDO/faturado → contas a pagar reais (ContaPagar, espelho do Omie),
//     filtradas por numeroPedidoCompra (vieram de pedido de compra).
//  2) AGUARDANDO recebimento → pedidos de compra PENDENTES no Omie (ainda não
//     receberam, então não viraram conta a pagar) — inclui pedidos feitos
//     direto no Omie. Via PesquisarPedCompra (cacheado).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prismaDirect } from "@/lib/prisma";
import { getProjetosInfo } from "@/lib/omie-pedidos-abertos";
import { listarComprasPendentes } from "@/lib/omie-compras-pendentes";
import { diaBRT } from "@/lib/data-br";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesInfo(date) {
  const dia = diaBRT(date);
  if (!dia) return null;
  const [ano, mes] = dia.split("-");
  return { chave: `${ano}-${mes}`, label: `${MESES_PT[Number(mes) - 1]}/${ano}` };
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);

  const [rows, estado, projetos, pendentes] = await Promise.all([
    prismaDirect.contaPagar.findMany({
      where: {
        numeroPedidoCompra: { not: null },
        dataVencimento: { not: null },
        status: { notIn: ["PAGO", "CANCELADO", "LIQUIDADO"] },
      },
      orderBy: { dataVencimento: "asc" },
      take: 5000,
    }),
    prismaDirect.omieSyncState.findUnique({ where: { id: "contapagar" } }),
    getProjetosInfo().catch(() => new Map()),
    listarComprasPendentes(forcar).catch((e) => ({ pedidos: [], erro: e?.message || "falha" })),
  ]);

  const obrasMap = new Map();
  function getObra(codProjRaw) {
    const codProj = codProjRaw ? String(codProjRaw) : null;
    const chave = codProj || "__sem__";
    if (!obrasMap.has(chave)) {
      const info = codProj ? projetos.get(codProj) : null;
      obrasMap.set(chave, {
        codProj,
        projeto: codProj ? (info?.nome || `Projeto ${codProj}`) : "(sem obra vinculada)",
        numeroOp: info?.numeroOp || null,
        recebido: 0, previsto: 0, vencido: 0,
        qtdContas: 0, qtdPedidos: 0,
        meses: new Map(),
        titulos: [],
      });
    }
    return obrasMap.get(chave);
  }
  function addMes(obra, venc, valor) {
    const mi = mesInfo(venc);
    if (!mi) return null;
    if (!obra.meses.has(mi.chave)) obra.meses.set(mi.chave, { chave: mi.chave, label: mi.label, total: 0 });
    obra.meses.get(mi.chave).total += valor;
    return mi.chave;
  }

  // 1) Contas a pagar reais (já faturado/recebido)
  for (const c of rows) {
    const o = getObra(c.projetoCodigo);
    const valor = c.valor || 0;
    const venc = c.dataVencimento;
    const vencida = venc && venc < hoje0;
    o.recebido += valor;
    if (vencida) o.vencido += valor;
    o.qtdContas += 1;
    const mes = addMes(o, venc, valor);
    o.titulos.push({
      id: c.id, origem: "recebido",
      fornecedor: c.fornecedorNome || (c.fornecedorCodigo ? `Cód. ${c.fornecedorCodigo}` : "—"),
      valor, vencimento: venc ? venc.toISOString() : null, mes,
      pedido: c.numeroPedidoCompra, nf: c.numeroDocFiscal, parcela: c.numeroParcela,
      situacao: vencida ? "VENCIDA" : "A VENCER",
      diasAtraso: vencida ? Math.floor((hoje0 - venc) / 86400000) : 0,
    });
  }

  // 2) Pedidos de compra pendentes (aguardando recebimento → ainda sem conta)
  for (const ped of (pendentes.pedidos || [])) {
    const o = getObra(ped.codProj);
    o.qtdPedidos += 1;
    for (const p of ped.parcelas) {
      const valor = p.valor || 0;
      const venc = p.venc ? new Date(p.venc) : null;
      o.previsto += valor;
      const mes = addMes(o, venc, valor);
      o.titulos.push({
        id: `ped-${ped.nCodPed}-${venc ? venc.getTime() : Math.random()}`,
        origem: "pedido",
        fornecedor: ped.fornecedor,
        valor, vencimento: venc ? venc.toISOString() : null, mes,
        pedido: ped.numero, nf: null, parcela: null,
        situacao: "AGUARDANDO RECEBIMENTO", diasAtraso: 0,
      });
    }
  }

  const obras = [...obrasMap.values()]
    .map((o) => ({
      ...o,
      total: o.recebido + o.previsto,
      meses: [...o.meses.values()].sort((a, b) => a.chave.localeCompare(b.chave)),
      titulos: o.titulos.sort((a, b) => String(a.vencimento || "").localeCompare(String(b.vencimento || ""))),
    }))
    // Só obras reais da Torg (exclui OP-000 "GERAL", "OP-X" e "(sem obra)").
    .filter((o) => o.numeroOp && parseInt(o.numeroOp, 10) > 0)
    .sort((a, b) => b.total - a.total);

  const totais = {
    total: obras.reduce((s, o) => s + o.total, 0),
    recebido: obras.reduce((s, o) => s + o.recebido, 0),
    previsto: obras.reduce((s, o) => s + o.previsto, 0),
    vencido: obras.reduce((s, o) => s + o.vencido, 0),
    obras: obras.length,
  };

  return NextResponse.json({
    obras,
    totais,
    pendentesOmie: { ok: !pendentes.erro, erro: pendentes.erro || null, geradoEm: pendentes.geradoEm || null },
    ultimoSync: estado?.ultimoSync ? estado.ultimoSync.toISOString() : null,
  });
}
