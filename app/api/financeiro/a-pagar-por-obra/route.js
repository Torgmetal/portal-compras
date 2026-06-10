// GET /api/financeiro/a-pagar-por-obra
// "Previsão de pagamentos das compras, por obra" — lê as Contas a Pagar (espelho
// local do Omie) que vieram de PEDIDO DE COMPRA (numeroPedidoCompra preenchido =
// compra de fornecedor; faturamento direto nunca gera conta a pagar) e ainda em
// aberto, agrupando por OBRA (projetoCodigo → nome/OP) e por mês de vencimento.
// Read-only e instantâneo; o sync incremental (cron + botão) mantém atualizado.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prismaDirect } from "@/lib/prisma";
import { getProjetosInfo } from "@/lib/omie-pedidos-abertos";
import { diaBRT } from "@/lib/data-br";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesInfo(date) {
  const dia = diaBRT(date); // "YYYY-MM-DD" no fuso BRT
  if (!dia) return null;
  const [ano, mes] = dia.split("-");
  return { chave: `${ano}-${mes}`, label: `${MESES_PT[Number(mes) - 1]}/${ano}` };
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);

  // Contas de COMPRA (vieram de pedido de compra) ainda em aberto, com vencimento.
  const [rows, estado, projetos] = await Promise.all([
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
    // Mapa projeto→{nome,OP}. Best-effort: se o Omie falhar, cai no fallback "Projeto X".
    getProjetosInfo().catch(() => new Map()),
  ]);

  // Agrupa por obra (projetoCodigo). Sem projeto → balde "(sem obra vinculada)".
  const SEM_OBRA = "__sem_obra__";
  const obrasMap = new Map();

  for (const c of rows) {
    const codProj = c.projetoCodigo ? String(c.projetoCodigo) : SEM_OBRA;
    if (!obrasMap.has(codProj)) {
      const info = codProj !== SEM_OBRA ? projetos.get(codProj) : null;
      obrasMap.set(codProj, {
        codProj: codProj === SEM_OBRA ? null : codProj,
        projeto: codProj === SEM_OBRA ? "(sem obra vinculada)" : (info?.nome || `Projeto ${codProj}`),
        numeroOp: info?.numeroOp || null,
        total: 0,
        vencido: 0,
        qtd: 0,
        meses: new Map(),
        titulos: [],
      });
    }
    const o = obrasMap.get(codProj);
    const valor = c.valor || 0;
    const venc = c.dataVencimento;
    const vencida = venc && venc < hoje0;
    o.total += valor;
    if (vencida) o.vencido += valor;
    o.qtd += 1;

    const mi = mesInfo(venc);
    if (mi) {
      if (!o.meses.has(mi.chave)) o.meses.set(mi.chave, { chave: mi.chave, label: mi.label, total: 0, qtd: 0 });
      const m = o.meses.get(mi.chave);
      m.total += valor;
      m.qtd += 1;
    }

    o.titulos.push({
      id: c.id,
      fornecedor: c.fornecedorNome || (c.fornecedorCodigo ? `Cód. ${c.fornecedorCodigo}` : "—"),
      valor,
      vencimento: venc ? venc.toISOString() : null,
      mes: mi?.chave || null,
      parcela: c.numeroParcela,
      nf: c.numeroDocFiscal,
      pedidoCompra: c.numeroPedidoCompra,
      categoria: c.categoriaNome,
      situacao: vencida ? "VENCIDA" : "A VENCER",
      diasAtraso: vencida ? Math.floor((hoje0 - venc) / 86400000) : 0,
    });
  }

  const obras = [...obrasMap.values()]
    .map((o) => ({
      ...o,
      meses: [...o.meses.values()].sort((a, b) => a.chave.localeCompare(b.chave)),
    }))
    .sort((a, b) => {
      // "(sem obra)" sempre por último; resto por maior valor a pagar
      if (a.codProj === null) return 1;
      if (b.codProj === null) return -1;
      return b.total - a.total;
    });

  const totais = {
    total: obras.reduce((s, o) => s + o.total, 0),
    vencido: obras.reduce((s, o) => s + o.vencido, 0),
    qtd: rows.length,
    obras: obras.filter((o) => o.codProj !== null).length,
  };

  return NextResponse.json({
    obras,
    totais,
    ultimoSync: estado?.ultimoSync ? estado.ultimoSync.toISOString() : null,
  });
}
