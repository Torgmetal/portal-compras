import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

/**
 * GET /api/planejamento/expedicao-semanal
 *
 * Resumo semanal de peso a expedir por obra.
 * Combina:
 * - PecaConjunto: peso total e peso por status (fila de producao)
 * - ProducaoSemanal (setor=EXPEDICAO): previsao semanal
 * - Romaneio: peso real expedido por semana
 * - Cronograma: datas de expedicao previstas
 *
 * Retorna grade: obras x semanas (8 semanas a partir da atual)
 */
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const numSemanas = Math.min(parseInt(searchParams.get("semanas") || "8"), 16);

  // Gera range de semanas
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diaSemana = hoje.getDay();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - ((diaSemana + 6) % 7)); // recua para segunda

  const semanas = [];
  for (let i = 0; i < numSemanas; i++) {
    const inicio = new Date(segunda);
    inicio.setDate(segunda.getDate() + i * 7);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    fim.setHours(23, 59, 59, 999);
    const isoWeek = getISOWeek(inicio);
    const isoYear = getISOYear(inicio);
    semanas.push({
      semana: `S${isoWeek}/${isoYear}`,
      semanaIso: isoWeek,
      ano: isoYear,
      inicio,
      fim,
      label: `${inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} - ${fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`,
    });
  }

  const inicioRange = semanas[0].inicio;
  const fimRange = semanas[semanas.length - 1].fim;

  // OPs ativas
  const opsAtivas = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO", "ATRASADA"] } },
    select: {
      id: true, numero: true, cliente: true, obra: true, status: true,
      dataFimPrevista: true, dataInicio: true,
      pecasConjunto: {
        select: {
          id: true, pesoTotalKg: true, status: true, qte: true, marca: true, descricao: true, tipoPeca: true, ordemCampo: true,
          entregas: { select: { id: true, destino: true, quantidade: true }, orderBy: { destino: "asc" } },
        },
      },
    },
    orderBy: { dataFimPrevista: "asc" },
  });

  // "Apontada como pintada no Syneco": o setor REAL da peça vem do MesOrdem ao
  // vivo (setor mais avançado com produção > 0), NÃO do status armazenado — que
  // só é auto-avançado até CORTE (pós-corte é lançado manual e costuma ficar
  // atrasado). Mesma regra da tela Status da Obra. EXPEDIDO é fato do portal.
  const SYN_SETOR = { Corte: "CORTE", Montagem: "MONTAGEM", Solda: "SOLDA", Acabamento: "ACABAMENTO", Jato: "JATO", Pintura: "PINTURA" };
  const ORDEM_SYN = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
  const normMarca = (m) => String(m || "").trim().toUpperCase();
  const synRows = opsAtivas.length
    ? await prisma.mesOrdem.groupBy({
        by: ["opId", "item", "setor"],
        where: { opId: { in: opsAtivas.map((o) => o.id) }, produzidoUn: { gt: 0 }, setor: { in: Object.keys(SYN_SETOR) } },
        _sum: { produzidoUn: true },
      })
    : [];
  const synByOp = new Map(); // opId -> Map(marca normalizada -> setor mais avançado do Syneco)
  for (const s of synRows) {
    const st = SYN_SETOR[s.setor];
    if (!st || !s.opId) continue;
    let mm = synByOp.get(s.opId);
    if (!mm) synByOp.set(s.opId, (mm = new Map()));
    const k = normMarca(s.item);
    const cur = mm.get(k);
    if (cur === undefined || ORDEM_SYN.indexOf(st) > ORDEM_SYN.indexOf(cur)) mm.set(k, st);
  }
  // Setor real de uma peça: Syneco ao vivo; status armazenado só como fallback.
  const localSetor = (opId, p) => {
    if (p.status === "EXPEDIDO") return "EXPEDIDO";
    const mm = synByOp.get(opId);
    if (mm) { const st = mm.get(normMarca(p.marca)); if (st) return st; }
    return p.status || "PENDENTE";
  };

  // Romaneios no range (peso real expedido)
  const romaneios = await prisma.romaneio.findMany({
    where: {
      data: { gte: inicioRange, lte: fimRange },
      opId: { in: opsAtivas.map((o) => o.id) },
    },
    select: { opId: true, pesoRealKg: true, data: true, numero: true },
  });

  // ProducaoSemanal (previsao de expedicao)
  const producaoSemanal = await prisma.producaoSemanal.findMany({
    where: {
      opId: { in: opsAtivas.map((o) => o.id) },
      setor: { in: ["EXPEDICAO", "Expedicao", "expedicao"] },
      data: { gte: inicioRange, lte: fimRange },
    },
    select: { opId: true, pesoPrevistoKg: true, pesoRealizadoKg: true, data: true, semana: true },
  });

  // Cronogramas com tarefas de EXPEDICAO
  const cronogramas = await prisma.cronograma.findMany({
    where: {
      opNumero: { in: opsAtivas.map((o) => o.numero) },
      ativo: true,
    },
    select: {
      opNumero: true,
      tarefas: {
        where: { departamento: "EXPEDICAO", isSummary: false },
        select: { nome: true, dataInicioPrevista: true, dataFimPrevista: true, percentualRealizado: true },
      },
    },
  });
  const cronogramaMap = {};
  for (const c of cronogramas) {
    cronogramaMap[c.opNumero] = c.tarefas;
  }

  // Pedido de expedição (handoff Planejamento → Expedição), 1 por obra
  const pedidosExp = await prisma.pedidoExpedicao.findMany({
    where: { opNumero: { in: opsAtivas.map((o) => o.numero) } },
    select: { opNumero: true, status: true, enviadoEm: true },
  });
  const pedidoExpMap = {};
  for (const p of pedidosExp) pedidoExpMap[p.opNumero] = p;

  // Monta grade por obra
  const obras = opsAtivas.map((op) => {
    const pesoTotal = op.pecasConjunto.reduce((s, p) => s + p.pesoTotalKg, 0);
    const pesoExpedido = op.pecasConjunto.filter((p) => p.status === "EXPEDIDO").reduce((s, p) => s + p.pesoTotalKg, 0);
    const pesoPendente = pesoTotal - pesoExpedido;

    // Distribuição por etapa pelo setor REAL do Syneco (não pelo status armazenado):
    // "Pronto p/ expedir" = peças apontadas como pintadas (setor real PINTURA).
    const statusProducao = {};
    for (const p of op.pecasConjunto) {
      const st = localSetor(op.id, p);
      if (!statusProducao[st]) statusProducao[st] = { peso: 0, qte: 0 };
      statusProducao[st].peso += p.pesoTotalKg;
      statusProducao[st].qte += p.qte;
    }

    // Grid semanal
    const semanal = semanas.map((sem) => {
      // Romaneios reais na semana
      const roms = romaneios.filter(
        (r) => r.opId === op.id && new Date(r.data) >= sem.inicio && new Date(r.data) <= sem.fim
      );
      const pesoReal = roms.reduce((s, r) => s + r.pesoRealKg, 0);

      // ProducaoSemanal prevista
      const prevs = producaoSemanal.filter(
        (p) => p.opId === op.id && new Date(p.data) >= sem.inicio && new Date(p.data) <= sem.fim
      );
      const pesoPrevisto = prevs.reduce((s, p) => s + p.pesoPrevistoKg, 0);

      // Tarefas do cronograma na semana
      const tarefasCronograma = (cronogramaMap[op.numero] || []).filter((t) => {
        if (!t.dataFimPrevista) return false;
        const df = new Date(t.dataFimPrevista);
        return df >= sem.inicio && df <= sem.fim;
      });

      return {
        semana: sem.semana,
        pesoPrevisto,
        pesoReal,
        tarefas: tarefasCronograma.length,
        nomesTarefas: tarefasCronograma.map((t) => t.nome),
      };
    });

    // Itens a expedir = conjuntos/avulsas (croqui é sub-peça do corte, não expede)
    // Traz SÓ as peças já apontadas como PINTADAS no Syneco (setor real = PINTURA)
    // ou já expedidas. Fabricação (Corte→Jato) e estoque ficam de fora. A coluna
    // "Situação" usa o setor real do Syneco (não o status armazenado).
    const ORD = { PENDENTE: 0, CORTE: 1, MONTAGEM: 2, SOLDA: 3, ACABAMENTO: 4, JATO: 5, PINTURA: 6, EXPEDIDO: 7 };
    const PRONTAS = new Set(["PINTURA", "EXPEDIDO"]);
    const itens = op.pecasConjunto
      .filter((p) => p.tipoPeca === "CONJUNTO" || p.tipoPeca == null)
      .map((p) => ({
        id: p.id, marca: p.marca, descricao: p.descricao, qte: p.qte, peso: p.pesoTotalKg, status: localSetor(op.id, p),
        ordemCampo: p.ordemCampo ?? null,
        entregas: p.entregas.map((e) => ({ id: e.id, destino: e.destino, quantidade: e.quantidade })),
      }))
      .filter((it) => PRONTAS.has(it.status))
      // ordem de campo (1,2,3…), depois fluxo e marca
      .sort((a, b) =>
        ((a.ordemCampo ?? Infinity) - (b.ordemCampo ?? Infinity)) ||
        ((ORD[a.status] ?? 9) - (ORD[b.status] ?? 9)) ||
        String(a.marca).localeCompare(String(b.marca))
      );

    return {
      opId: op.id,
      numero: op.numero,
      cliente: op.cliente,
      obra: op.obra,
      status: op.status,
      dataFimPrevista: op.dataFimPrevista,
      pesoTotal,
      pesoExpedido,
      pesoPendente,
      progresso: pesoTotal > 0 ? Math.round((pesoExpedido / pesoTotal) * 1000) / 10 : 0,
      statusProducao,
      itens,
      semanal,
      pedidoExpedicao: pedidoExpMap[op.numero]
        ? { status: pedidoExpMap[op.numero].status, enviadoEm: pedidoExpMap[op.numero].enviadoEm }
        : null,
    };
  });

  // Totais por semana
  const totaisSemanal = semanas.map((sem, i) => ({
    semana: sem.semana,
    label: sem.label,
    pesoPrevisto: obras.reduce((s, o) => s + o.semanal[i].pesoPrevisto, 0),
    pesoReal: obras.reduce((s, o) => s + o.semanal[i].pesoReal, 0),
  }));

  return NextResponse.json({
    semanas: semanas.map((s) => ({ semana: s.semana, label: s.label })),
    obras: obras.filter((o) => o.pesoTotal > 0), // so OPs com peso
    totaisSemanal,
    resumo: {
      totalObras: obras.filter((o) => o.pesoTotal > 0).length,
      pesoTotalGeral: obras.reduce((s, o) => s + o.pesoTotal, 0),
      pesoExpedidoGeral: obras.reduce((s, o) => s + o.pesoExpedido, 0),
      pesoPendenteGeral: obras.reduce((s, o) => s + o.pesoPendente, 0),
    },
  });
}

function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getISOYear(d) {
  const date = new Date(d.getTime());
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  return date.getFullYear();
}
