// GET   /api/pcp/painel-corte — painel único do PCP focado em corte:
//   meta do mês × cortado (Syneco) × carteira (o que subiu e falta cortar),
//   funil liberação → fila → programado → em corte, carga por máquina
//   (backlog ÷ capacidade média 30d) e o ao-vivo do Syneco (agora / hoje).
// PATCH /api/pcp/painel-corte — atualiza a meta mensal { metaKg }
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const maxDuration = 30;

const META_CHAVE = "meta_corte_kg_mes";
const META_DEFAULT_KG = 250000; // 250 t/mês

const somar = (arr, campo) => arr.reduce((s, p) => s + (Number(p[campo]) || 0), 0);

export async function GET() {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  try {
    // "Hoje"/mês no dia-calendário do Syneco. Datas do Syneco são UTC-naïve
    // (relógio BRT escrito como UTC) → início em 00:00Z, NÃO 03:00Z (o offset
    // jogava o corte da madrugada 00:00–03:00 pro dia/mês anterior).
    const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const hojeBRT = new Date(hojeIso + "T00:00:00Z");
    const inicioMes = new Date(hojeIso.slice(0, 7) + "-01T00:00:00Z");
    const [ano, mesNum, diaHoje] = hojeIso.split("-").map(Number);
    const diasNoMes = new Date(ano, mesNum, 0).getDate();

    const [metaRow, cortadoMesAgg, pendentes, naFilaCorte, capacidadeRaw, emProducaoRaw, hojeRaw, carteiraPorOp, totalPorOp] =
      await Promise.all([
        prisma.pcpParametro.findUnique({ where: { chave: META_CHAVE } }),

        // Cortado no mês (Syneco — MesOrdem, setor Corte)
        prisma.mesOrdem.aggregate({
          where: { setor: { contains: "Corte", mode: "insensitive" }, pesoProduzido: { gt: 0 }, dataInicio: { gte: inicioMes } },
          _sum: { pesoProduzido: true, produzidoUn: true },
        }),

        // Aguardando liberação, por situação de estoque
        prisma.pecaConjunto.groupBy({
          by: ["statusEstoque"],
          where: { status: "PENDENTE" },
          _count: { id: true },
          _sum: { pesoTotalKg: true },
        }),

        // Tudo que está no corte e não foi concluído no kanban (a baixa do
        // Syneco — qteProduzida >= qte — é filtrada em JS: Prisma não compara
        // coluna com coluna no where)
        prisma.pecaConjunto.findMany({
          where: { status: "CORTE", corteConcluidoEm: null },
          select: {
            maquina: true, qte: true, qteProduzida: true, pesoTotalKg: true, opNumero: true,
            corteDataMetaInicio: true, corteDataMetaFim: true, corteIniciadoEm: true,
          },
        }),

        // Capacidade média por máquina — kg/dia trabalhado nos últimos 30 dias
        prisma.$queryRaw`
          SELECT maquina, COUNT(DISTINCT DATE("dataInicio"))::int as dias, SUM("pesoProduzido") as kg
          FROM "MesOrdem"
          WHERE setor ILIKE '%corte%' AND "pesoProduzido" > 0
            AND "dataInicio" >= NOW() - INTERVAL '30 days'
            AND maquina IS NOT NULL AND maquina != '' AND maquina != '---'
          GROUP BY maquina
        `,

        // Syneco: em corte AGORA
        prisma.mesOrdem.findMany({
          where: { setor: { contains: "Corte", mode: "insensitive" }, status: "Produzindo" },
          select: {
            id: true, obra: true, op: true, descItem: true, maquina: true, operador: true,
            planejadoUn: true, produzidoUn: true, saldoUn: true, dataInicio: true,
          },
          orderBy: [{ maquina: "asc" }, { dataInicio: "desc" }],
          take: 60,
        }),

        // Syneco: cortado HOJE
        prisma.mesOrdem.findMany({
          where: { setor: { contains: "Corte", mode: "insensitive" }, dataFim: { gte: hojeBRT }, pesoProduzido: { gt: 0 } },
          select: {
            id: true, obra: true, op: true, descItem: true, maquina: true, operador: true,
            status: true, produzidoUn: true, pesoProduzido: true, dataFim: true,
          },
          orderBy: { dataFim: "desc" },
          take: 400,
        }),

        // Pendentes (aguardando liberação) por obra — a parte da fila entra em JS
        prisma.pecaConjunto.groupBy({
          by: ["opNumero"],
          where: { status: "PENDENTE" },
          _count: { id: true },
          _sum: { pesoTotalKg: true },
        }),

        // Peso total por obra (todas as peças) — pra % já cortado/avançado
        prisma.pecaConjunto.groupBy({
          by: ["opNumero"],
          _sum: { pesoTotalKg: true },
        }),
      ]);

    const metaKg = Number(metaRow?.valor) || META_DEFAULT_KG;

    // ── Mês: cortado + projeção no ritmo atual ──────────────────
    const cortadoKg = cortadoMesAgg._sum.pesoProduzido || 0;
    const projecaoKg = diaHoje > 0 ? (cortadoKg / diaHoje) * diasNoMes : 0;

    // ── Funil ────────────────────────────────────────────────────
    const ESTOQUE_ORDEM = ["DISPONIVEL", "PARCIAL", "INDISPONIVEL", null];
    const pendentePorEstoque = ESTOQUE_ORDEM.map((st) => {
      const row = pendentes.find((p) => (p.statusEstoque || null) === st);
      return {
        statusEstoque: st || "NAO_CONFERIDO",
        pecas: row?._count.id || 0,
        kg: row?._sum.pesoTotalKg || 0,
      };
    }).filter((r) => r.pecas > 0);
    const pendenteTotal = {
      pecas: pendentes.reduce((s, p) => s + p._count.id, 0),
      kg: pendentes.reduce((s, p) => s + (p._sum.pesoTotalKg || 0), 0),
    };

    // Peça com baixa total no Syneco conta como cortada — sai da fila/carteira
    const filaAberta = naFilaCorte.filter((p) => !(Number(p.qte) > 0 && Number(p.qteProduzida) >= Number(p.qte)));

    const hojeUTC = Date.UTC(ano, mesNum - 1, diaHoje);
    const fimMeta = (p) => (p.corteDataMetaFim ? new Date(p.corteDataMetaFim).getTime() : null);
    const grupo = (filtro) => {
      const arr = filaAberta.filter(filtro);
      return { pecas: arr.length, kg: somar(arr, "pesoTotalKg") };
    };
    const funilFila = {
      semProgramacao: grupo((p) => !p.corteDataMetaInicio && !p.corteIniciadoEm && !(Number(p.qteProduzida) > 0)),
      programadas: grupo((p) => p.corteDataMetaInicio && !p.corteIniciadoEm && !(Number(p.qteProduzida) > 0)),
      emCorte: grupo((p) => p.corteIniciadoEm || Number(p.qteProduzida) > 0),
      atrasadas: grupo((p) => fimMeta(p) != null && fimMeta(p) < hojeUTC),
    };
    const carteiraTotal = {
      pecas: pendenteTotal.pecas + filaAberta.length,
      kg: pendenteTotal.kg + somar(filaAberta, "pesoTotalKg"),
    };

    // ── Carga por máquina: backlog ÷ capacidade média ───────────
    const capPorNome = new Map(
      capacidadeRaw.map((c) => [c.maquina, { kgDia: Number(c.kg) / Math.max(1, Number(c.dias)), dias: Number(c.dias) }])
    );
    const backlogPorMaquina = new Map();
    for (const p of filaAberta) {
      const key = p.maquina || "SEM_MAQUINA";
      const acc = backlogPorMaquina.get(key) || { pecas: 0, kg: 0 };
      acc.pecas += 1;
      acc.kg += Number(p.pesoTotalKg) || 0;
      backlogPorMaquina.set(key, acc);
    }
    const nomesMaquinas = new Set([
      ...[...backlogPorMaquina.keys()].filter((m) => m !== "SEM_MAQUINA"),
    ]);
    const cargaMaquinas = [...nomesMaquinas].map((enumMaq) => {
      const nomeSyneco = enumMaq.replace(/_/g, " ");
      const cap = capPorNome.get(nomeSyneco);
      const backlog = backlogPorMaquina.get(enumMaq) || { pecas: 0, kg: 0 };
      return {
        maquina: enumMaq,
        backlogPecas: backlog.pecas,
        backlogKg: backlog.kg,
        capacidadeKgDia: cap ? Math.round(cap.kgDia) : null,
        diasCarga: cap && cap.kgDia > 0 ? Math.round((backlog.kg / cap.kgDia) * 10) / 10 : null,
      };
    }).sort((a, b) => b.backlogKg - a.backlogKg);
    const semMaquina = backlogPorMaquina.get("SEM_MAQUINA") || { pecas: 0, kg: 0 };

    // ── Carteira por obra (top kg não cortado) — pendentes + fila aberta ──
    const abertoPorObra = new Map();
    for (const c of carteiraPorOp) {
      abertoPorObra.set(c.opNumero, { pecas: c._count.id, kg: c._sum.pesoTotalKg || 0 });
    }
    for (const p of filaAberta) {
      const acc = abertoPorObra.get(p.opNumero) || { pecas: 0, kg: 0 };
      acc.pecas += 1;
      acc.kg += Number(p.pesoTotalKg) || 0;
      abertoPorObra.set(p.opNumero, acc);
    }
    const totalObraMap = new Map(totalPorOp.map((t) => [t.opNumero, t._sum.pesoTotalKg || 0]));
    // Obras "baixadas" da carteira (ADM marcou como finalizadas) — saem da visão.
    const baixadasRows = await prisma.pcpCarteiraObraBaixa.findMany({ select: { opNumero: true } });
    const baixadasSet = new Set(baixadasRows.map((b) => b.opNumero));
    const todasObras = [...abertoPorObra.entries()]
      .map(([opNumero, aberto]) => {
        const total = totalObraMap.get(opNumero) || 0;
        return {
          opNumero,
          pecasAbertas: aberto.pecas,
          kgAberto: aberto.kg,
          kgTotal: total,
          pctAvancado: total > 0 ? Math.round(((total - aberto.kg) / total) * 100) : 0,
          baixada: baixadasSet.has(opNumero),
        };
      })
      .sort((a, b) => b.kgAberto - a.kgAberto);
    const obras = todasObras.filter((o) => !o.baixada).slice(0, 12);
    const baixadas = todasObras.filter((o) => o.baixada);
    // cliente das obras (best-effort — obra pode não estar cadastrada como OP)
    const opsInfo = await prisma.oP.findMany({
      where: { numero: { in: [...obras, ...baixadas].map((o) => o.opNumero) } },
      select: { numero: true, cliente: true },
    });
    const clienteMap = new Map(opsInfo.map((o) => [o.numero, o.cliente]));
    for (const o of obras) o.cliente = clienteMap.get(o.opNumero) || null;
    for (const o of baixadas) o.cliente = clienteMap.get(o.opNumero) || null;

    // Carimbo da baixa automática (cron) — "última baixa" no painel.
    const ultBaixa = await prisma.auditLog.findFirst({
      where: { action: "RECONCILIAR_SYNECO_AUTO" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, diff: true },
    });

    return NextResponse.json({
      hoje: hojeIso,
      ultimaBaixa: ultBaixa ? { em: ultBaixa.createdAt, atualizadas: ultBaixa.diff?.atualizadas ?? null } : null,
      meta: { kgMes: metaKg },
      mes: {
        cortadoKg,
        cortadoUn: cortadoMesAgg._sum.produzidoUn || 0,
        diaHoje,
        diasNoMes,
        projecaoKg: Math.round(projecaoKg),
        pctMeta: metaKg > 0 ? Math.round((cortadoKg / metaKg) * 100) : 0,
      },
      carteira: { total: carteiraTotal, pendente: { ...pendenteTotal, porEstoque: pendentePorEstoque }, fila: funilFila },
      cargaMaquinas,
      semMaquina,
      obras,
      baixadas,
      syneco: {
        emCorteAgora: emProducaoRaw.map((a) => ({
          id: a.id, obra: a.obra, op: a.op, peca: a.descItem, maquina: a.maquina,
          operador: a.operador, produzidoUn: a.produzidoUn || 0, planejadoUn: a.planejadoUn || 0,
          saldoUn: a.saldoUn || 0, desde: a.dataInicio,
        })),
        cortadoHoje: hojeRaw.map((a) => ({
          id: a.id, obra: a.obra, op: a.op, peca: a.descItem, maquina: a.maquina,
          operador: a.operador, status: a.status, un: a.produzidoUn || 0, kg: a.pesoProduzido || 0, hora: a.dataFim,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro interno" }, { status: 500 });
  }
}

const patchSchema = z.object({
  metaKg: z.number().min(1, "Meta deve ser maior que zero").max(10_000_000, "Meta inválida"),
});

export async function PATCH(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = patchSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const antes = await prisma.pcpParametro.findUnique({ where: { chave: META_CHAVE } });
  await prisma.pcpParametro.upsert({
    where: { chave: META_CHAVE },
    create: { chave: META_CHAVE, valor: String(body.metaKg) },
    update: { valor: String(body.metaKg) },
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PCP_META_CORTE",
        entity: "PcpParametro",
        entityId: META_CHAVE,
        diff: { antes: antes?.valor ? Number(antes.valor) : META_DEFAULT_KG, depois: body.metaKg },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, metaKg: body.metaKg });
}
