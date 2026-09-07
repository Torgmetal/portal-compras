// GET /api/pcp/relatorio-corte?setor=&obra=&de=&ate=
// Relatório de produção por setor: peças PROGRAMADAS e PRODUZIDAS no setor —
// dados reais do Syneco (MesOrdem): planejado × produzido, situação, data/máquina/operador.
//   - setor: CORTE (padrão) | MONTAGEM | SOLDA | ACABAMENTO | JATO | PINTURA
//   - sem obra → resumo das obras com apontamento no setor
//   - com obra → detalhe por peça
// Baixas administrativas não substituem apontamentos. OPs encerradas ou com todas
// as etapas da LPC concluídas ficam fora da listagem e das exportações.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { carregarResumoProducao } from "@/lib/relatorio-producao-data";
import { numeroOpRelatorio } from "@/lib/relatorio-producao-resumo";
import { whereSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 30;

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
// Particípio de "concluído no setor" usado na situação da peça.
const VERBO_SETOR = { CORTE: "Cortada", MONTAGEM: "Montada", SOLDA: "Soldada", ACABAMENTO: "Acabada", JATO: "Jateada", PINTURA: "Pintada" };
const LABEL_ESTADO = { PARCIAL: "Parcial", PENDENTE: "Pendente" };

const limpo = (v) => (!v || v === "---" ? "—" : v);
function estadoDe(prog, prod) {
  if (prog > 0 && prod >= prog) return "FEITO";
  if (prod > 0) return "PARCIAL";
  return "PENDENTE";
}

const FIELDS = { obra: true, op: true, item: true, descItem: true, planejadoUn: true, produzidoUn: true, saldoUn: true, pesoProduzido: true, dataInicio: true, dataFim: true, maquina: true, operador: true };
const mapItem = (r, verbo) => {
  const planj = r.planejadoUn || 0;
  const prod = Math.max(0, r.produzidoUn || 0);
  const estado = estadoDe(planj, prod);
  return {
    obra: limpo(r.obra),
    peca: limpo(r.item || r.op),
    descricao: limpo(r.descItem),
    programado: planj,
    cortado: prod, // produzido no setor (nome mantido p/ o client)
    saldo: Math.max(0, planj - prod),
    estado,
    situacao: estado === "FEITO" ? verbo : LABEL_ESTADO[estado],
    data: r.dataFim,
    maquina: limpo(r.maquina),
    operador: limpo(r.operador),
  };
};

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const url = new URL(req.url);
  const setorParam = (url.searchParams.get("setor") || "CORTE").toUpperCase();
  const setor = SETORES.includes(setorParam) ? setorParam : "CORTE";
  const verbo = VERBO_SETOR[setor];
  const obra = url.searchParams.get("obra");
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");
  const todas = url.searchParams.get("todas"); // extrai TODAS as peças de todas as OPs (flat)

  const {finalizadas,finalizadasIds} = await carregarResumoProducao();
  const ativa = nome => !finalizadas.has(numeroOpRelatorio(nome));
  const base = {...whereSetorSyneco(setor),AND:[{OR:[{opId:null},{opId:{notIn:finalizadasIds}}]}]};
  if (de || ate) {
    base.dataFim = {};
    // Datas do Syneco são UTC-naïve → janela em 00:00Z/23:59Z (explícito p/ não
    // depender do fuso do servidor).
    if (de) base.dataFim.gte = new Date(`${de}T00:00:00.000Z`);
    if (ate) base.dataFim.lte = new Date(`${ate}T23:59:59.999Z`);
  }

  // Obras marcadas como concluídas (baixa manual) neste setor.
  const concluidasRows = await prisma.relatorioObraConcluida.findMany({ where: { setor }, select: { obra: true } });
  const concluidas = new Set(concluidasRows.map((o) => o.obra));

  // TODAS as peças de todas as OPs, em uma lista só (para extração geral)
  if (todas) {
    const rows = await prisma.mesOrdem.findMany({
      where: base, select: FIELDS, take: 20001,
      orderBy: [{ obra: "asc" }, { dataFim: "desc" }],
    });
    if(rows.length>20000)return NextResponse.json({error:"O relatório excede 20.000 ordens. Selecione um período menor para exportar todas as linhas sem truncamento."},{status:400});
    return NextResponse.json({ todas: true, setor, total: rows.filter(r=>ativa(r.obra)).length, itens: rows.filter(r=>ativa(r.obra)).map((r) => mapItem(r, verbo)) });
  }

  // Resumo por OP/frente — TODAS as obras que têm apontamento no setor
  if (!obra) {
    const [grupos, ocultasRows, prioridadesRows] = await Promise.all([
      prisma.mesOrdem.groupBy({
        by: ["obra"], where: base,
        _sum: { planejadoUn: true, produzidoUn: true, pesoProduzido: true },
        _count: { _all: true }, _max: { dataFim: true },
      }),
      prisma.relatorioCorteObraOculta.findMany({ where: { setor }, select: { obra: true } }),
      prisma.producaoPrioridade.findMany({ where: { setor }, select: { obra: true, ordem: true, dataEstimada: true, obraInteira: true, pecas: true } }),
    ]);
    const ocultas = new Set(ocultasRows.map((o) => o.obra));
    const prioMap = new Map(prioridadesRows.map((p) => [p.obra, p]));
    const obras = grupos.filter((g) => g.obra && ativa(g.obra)).map((g) => {
      const concl = concluidas.has(g.obra);
      const prog = g._sum.planejadoUn || 0;
      const cort = Math.max(0, g._sum.produzidoUn || 0);
      const prio = prioMap.get(g.obra);
      return { obra: g.obra, pecas: g._count._all, programadoUn: Math.round(prog), cortadoUn: Math.round(cort), pesoCortado: Math.round(g._sum.pesoProduzido || 0), pct: prog > 0 ? Math.min(100, Math.round((cort / prog) * 100)) : 0, ultima: g._max.dataFim, oculto: ocultas.has(g.obra), concluida: concl, prioridade: prio ? prio.ordem : null, dataEstimada: prio ? prio.dataEstimada : null, obraInteira: prio ? prio.obraInteira : true, pecasPrioridade: prio ? prio.pecas : [] };
    });
    // Ordem numérica da obra, da maior para a menor (T95, T90, T88… ; "1000" no topo).
    const numObra = (s) => { const m = String(s || "").match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
    obras.sort((a, b) => numObra(b.obra) - numObra(a.obra) || String(a.obra).localeCompare(String(b.obra), undefined, { numeric: true }));
    return NextResponse.json({ setor, obras });
  }

  // Detalhe de uma OP — exata; senão obra-pai (T82A → obra T82, op T82A*)
  let rows = await prisma.mesOrdem.findMany({ where: { ...base, obra }, select: FIELDS });
  if (!rows.length) {
    const pai = obra.replace(/[A-Za-z]+$/, "");
    if (pai && pai !== obra) rows = await prisma.mesOrdem.findMany({ where: { ...base, obra: pai, op: { startsWith: obra } }, select: FIELDS });
  }
  rows.sort((a, b) => {
    const da = a.dataFim ? +new Date(a.dataFim) : -1, db = b.dataFim ? +new Date(b.dataFim) : -1;
    return db - da || String(a.op).localeCompare(String(b.op));
  });
  const itens = rows.filter(r=>ativa(r.obra)).map((r) => mapItem(r, verbo));
  const prioridade = await prisma.producaoPrioridade.findUnique({
    where: { obra_setor: { obra, setor } },
    select: { ordem: true, dataEstimada: true, obraInteira: true, pecas: true },
  });
  return NextResponse.json({
    setor,
    obra,
    concluida: concluidas.has(obra),
    prioridade, // null se não priorizada; senão { ordem, dataEstimada, obraInteira, pecas }
    total: itens.length,
    cortadas: itens.filter((i) => i.estado === "FEITO").length,
    parciais: itens.filter((i) => i.estado === "PARCIAL").length,
    pendentes: itens.filter((i) => i.estado === "PENDENTE").length,
    programadoUn: itens.reduce((s, i) => s + i.programado, 0),
    cortadoUn: itens.reduce((s, i) => s + i.cortado, 0),
    itens,
  });
}
