import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 60;

const SETORES_ORDEM = ["Corte", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

/**
 * GET /api/producao/controle-op
 *
 * Sem params → lista de obras com resumo (pra dropdown inicial)
 * ?obra=T83 → detalhes da obra: itens agrupados com status por setor
 * ?obra=T83&setor=Corte → filtra por setor
 * ?obra=T83&status=pendente → filtra por status (pendente | finalizado | todos)
 * ?obra=T83&grupo=A → filtra por grupo/letra (ex: T83A, T83B)
 * ?obra=T83&busca=EIXO → busca textual no item/descItem
 */
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const obra = searchParams.get("obra");

  // ── Sem obra: retorna lista de obras com resumo ──
  if (!obra) {
    const obrasRaw = await prisma.mesOrdem.groupBy({
      by: ["obra"],
      _count: true,
      _sum: { pesoPlanejado: true, pesoProduzido: true },
      orderBy: { obra: "asc" },
    });

    // Buscar OPs para vincular nome/cliente
    const opNums = obrasRaw.map((o) => {
      const m = o.obra.match(/^T(\d+)/i);
      return m ? String(parseInt(m[1])).padStart(3, "0") : null;
    }).filter(Boolean);

    const ops = await prisma.oP.findMany({
      where: { numero: { in: opNums } },
      select: { numero: true, cliente: true, obra: true, status: true },
    });
    const opMap = Object.fromEntries(ops.map((o) => [o.numero, o]));

    const obras = obrasRaw.map((o) => {
      const m = o.obra.match(/^T(\d+)/i);
      const num = m ? String(parseInt(m[1])).padStart(3, "0") : null;
      const op = num ? opMap[num] : null;
      const planejado = o._sum.pesoPlanejado || 0;
      const produzido = o._sum.pesoProduzido || 0;
      return {
        obra: o.obra,
        registros: o._count,
        planejadoKg: planejado,
        produzidoKg: produzido,
        pct: planejado > 0 ? Math.round((produzido / planejado) * 100) : 0,
        op: op ? { numero: op.numero, cliente: op.cliente, obra: op.obra, status: op.status } : null,
      };
    });

    return NextResponse.json({ obras });
  }

  // ── Com obra: detalhes completos ──
  const setor = searchParams.get("setor");
  const statusFiltro = searchParams.get("status") || "todos"; // pendente | finalizado | todos
  const grupo = searchParams.get("grupo");
  const busca = searchParams.get("busca");

  const where = { obra, setor: { not: "Preparação" } };
  if (setor) where.setor = setor;

  const registros = await prisma.mesOrdem.findMany({
    where,
    select: {
      item: true,
      setor: true,
      descItem: true,
      maquina: true,
      planejadoUn: true,
      produzidoUn: true,
      rejeitadoUn: true,
      saldoUn: true,
      pesoPlanejado: true,
      pesoProduzido: true,
      saldoRestante: true,
      status: true,
      dataInicio: true,
      dataFim: true,
    },
    orderBy: [{ item: "asc" }, { setor: "asc" }],
  });

  // ── Agrupar por item ──
  const itemMap = new Map();
  for (const r of registros) {
    if (!itemMap.has(r.item)) {
      itemMap.set(r.item, {
        item: r.item,
        descItem: r.descItem,
        setores: {},
        grupo: null,
      });
    }
    const entry = itemMap.get(r.item);
    entry.setores[r.setor] = {
      status: r.status,
      planejadoUn: r.planejadoUn,
      produzidoUn: r.produzidoUn,
      rejeitadoUn: r.rejeitadoUn,
      saldoUn: r.saldoUn,
      pesoPlanejado: r.pesoPlanejado,
      pesoProduzido: r.pesoProduzido,
      saldoRestante: r.saldoRestante,
      maquina: r.maquina,
      dataInicio: r.dataInicio,
      dataFim: r.dataFim,
    };
  }

  // Detectar grupo (letra) de cada item
  for (const [, entry] of itemMap) {
    const m = entry.item.match(new RegExp(obra.replace(/[^a-z0-9]/gi, "") + "([A-Z])", "i"));
    entry.grupo = m ? m[1].toUpperCase() : null;
  }

  let items = Array.from(itemMap.values());

  // ── Filtros ──
  if (grupo) {
    items = items.filter((i) => i.grupo === grupo.toUpperCase());
  }
  if (busca) {
    const b = busca.toLowerCase();
    items = items.filter((i) =>
      i.item.toLowerCase().includes(b) ||
      (i.descItem && i.descItem.toLowerCase().includes(b))
    );
  }

  // Filtro por status: pendente = tem algum setor não finalizado
  if (statusFiltro === "pendente") {
    items = items.filter((i) => {
      return Object.values(i.setores).some(
        (s) => !s.status?.includes("Finalizado")
      );
    });
  } else if (statusFiltro === "finalizado") {
    items = items.filter((i) => {
      return Object.values(i.setores).every(
        (s) => s.status?.includes("Finalizado")
      );
    });
  }

  // ── Resumo por setor ──
  const resumoSetores = {};
  for (const s of SETORES_ORDEM) {
    resumoSetores[s] = { planejado: 0, produzido: 0, finalizados: 0, total: 0, pendentes: 0 };
  }
  for (const r of registros) {
    if (!r.setor || !resumoSetores[r.setor]) continue;
    // Aplicar filtro de grupo ao resumo também
    if (grupo) {
      const m = r.item.match(new RegExp(obra.replace(/[^a-z0-9]/gi, "") + "([A-Z])", "i"));
      const g = m ? m[1].toUpperCase() : null;
      if (g !== grupo.toUpperCase()) continue;
    }
    const rs = resumoSetores[r.setor];
    rs.planejado += r.pesoPlanejado || 0;
    rs.produzido += r.pesoProduzido || 0;
    rs.total++;
    if (r.status?.includes("Finalizado")) {
      rs.finalizados++;
    } else {
      rs.pendentes++;
    }
  }

  // Calcular pct por setor
  const setoresResumo = SETORES_ORDEM.map((s) => {
    const rs = resumoSetores[s];
    return {
      setor: s,
      ...rs,
      pct: rs.planejado > 0 ? Math.round((rs.produzido / rs.planejado) * 100) : 0,
    };
  }).filter((s) => s.total > 0);

  // ── Grupos disponíveis ──
  const gruposSet = new Set();
  for (const [, entry] of itemMap) {
    if (entry.grupo) gruposSet.add(entry.grupo);
  }
  const grupos = Array.from(gruposSet).sort();

  // ── KPIs globais ──
  // Usar dados do Corte como peso base (pra não inflar com múltiplos setores)
  const corteRecs = registros.filter((r) => r.setor === "Corte");
  const pesoTotal = corteRecs.reduce((s, r) => s + (r.pesoPlanejado || 0), 0);
  const pesoProduzido = corteRecs.reduce((s, r) => s + (r.pesoProduzido || 0), 0);
  const itensUnicos = new Set(registros.map((r) => r.item)).size;

  return NextResponse.json({
    obra,
    kpis: {
      pesoTotalKg: pesoTotal,
      pesoProduzidoKg: pesoProduzido,
      pesoFaltanteKg: pesoTotal - pesoProduzido,
      pctGeral: pesoTotal > 0 ? Math.round((pesoProduzido / pesoTotal) * 100) : 0,
      itensUnicos,
      totalRegistros: registros.length,
    },
    setoresResumo,
    grupos,
    items,
    setoresOrdem: SETORES_ORDEM,
  });
}
