// GET /api/financeiro/pedidos-venda[?forcar=1]
// Lista os pedidos de venda (Medições) em aberto/atrasado do Omie, com o projeto (obra).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { prismaDirect } from "@/lib/prisma";
import { listarPedidosVendaAbertos } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  try {
    const data = await listarPedidosVendaAbertos(forcar);

    // Soma as NFS-e avulsas de Conchal vinculadas a cada obra (faturado fora do Omie)
    let vinculos = [];
    try {
      vinculos = await prismaDirect.nfseConchalVinculo.findMany({
        select: { codProj: true, projetoNome: true, valor: true },
      });
    } catch { /* tabela pode não existir em ambiente antigo — não fatal */ }

    if (vinculos.length) {
      // Agrega por projeto (codProj)
      const somaDe = new Map(); // codProj(String) → { valor, qtd, nome }
      for (const v of vinculos) {
        const k = String(v.codProj);
        const cur = somaDe.get(k) || { valor: 0, qtd: 0, nome: v.projetoNome || null };
        cur.valor += v.valor || 0; cur.qtd += 1; cur.nome = cur.nome || v.projetoNome;
        somaDe.set(k, cur);
      }

      let totalAvulso = 0;
      const usados = new Set();
      // 1) soma nas obras existentes
      const obras = (data.obras || []).map(o => {
        const k = String(o.codProj);
        const av = somaDe.get(k);
        if (!av) return o;
        usados.add(k);
        totalAvulso += av.valor;
        const faturado = o.faturado + av.valor;
        const total = faturado + o.aFaturar;
        return {
          ...o, faturado, total,
          faturadoAvulso: av.valor, qtdAvulsas: av.qtd,
          pctFaturado: total > 0 ? Math.round((faturado / total) * 100) : 0,
        };
      });
      // 2) cria linha sintética para projetos que só têm nota avulsa (sem pedido/OS no Omie)
      const nomeProj = new Map((data.projetos || []).map(p => [String(p.codProj), p.nome]));
      for (const [k, av] of somaDe) {
        if (usados.has(k)) continue;
        totalAvulso += av.valor;
        obras.push({
          codProj: k, projeto: av.nome || nomeProj.get(k) || `Projeto ${k}`,
          numeroOp: null, tipo: "Avulsa",
          faturado: av.valor, aFaturar: 0, cancelado: 0, total: av.valor,
          pctFaturado: 100, atrasado: false,
          temVenda: false, temServico: false,
          faturadoAvulso: av.valor, qtdAvulsas: av.qtd,
          pedidos: [],
        });
      }

      data.obras = obras.sort((a, b) => b.aFaturar - a.aFaturar);
      data.totalObras = obras.length;
      data.totalFaturado = (data.totalFaturado || 0) + totalAvulso;
      data.totalContratado = (data.totalContratado || 0) + totalAvulso;
      data.totalFaturadoAvulso = totalAvulso;
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: "Falha ao consultar Omie: " + (e?.message || e) }, { status: 502 });
  }
}
