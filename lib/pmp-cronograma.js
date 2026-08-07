// Datas de produção do PMP puxadas do CRONOGRAMA (por OP e por SETOR) — automático: a data vem
// da fase planejada MESMO com tarefas de projeto atrasadas (usa a fase, não é empurrada). Por
// OP, a janela de cada setor = min(início)/max(fim) das tarefas daquela fase em TODAS as áreas.
// Também gera as metas-dia de CORTE (distribui as peças de corte pelos dias úteis) e marca as
// OPs com janela mas SEM lista (nenhuma PecaConjunto) — o PMP mostra em vermelho.
import { diasUteis } from "@/lib/pmp-corte";

const iso = (d) => new Date(d).toISOString().slice(0, 10);
// opNumero canônico p/ casar com o PMP ("T089"/"T89"/"089" → "089").
export const normOpPmp = (n) => { const m = String(n || "").match(/\d+/); return m ? String(parseInt(m[0], 10)).padStart(3, "0") : ""; };
// Nome da tarefa (fase) → setor. Preparação = CORTE.
const norm = (s) => (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const SETOR_DA_FASE = (nome) => {
  const n = norm(nome);
  if (n.startsWith("prepara") || n.startsWith("corte")) return "CORTE";
  if (n.startsWith("montag")) return "MONTAGEM";
  if (n.startsWith("solda")) return "SOLDA";
  if (n.startsWith("acabamento")) return "ACABAMENTO";
  if (n.startsWith("jato")) return "JATO";
  if (n.startsWith("pintura")) return "PINTURA";
  if (n.startsWith("expedi")) return "EXPEDICAO";
  return null;
};
export const SETORES_PMP = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

/**
 * @returns {
 *   metas:[{data,setor:"CORTE",opNumero,metaPecas,metaPesoKg,observacao,origem}],
 *   semLista:{[opNumero]:true},
 *   janela:{[opNumero]:{inicio,fim}},               // janela de CORTE (retrocompat)
 *   datasSetor:{[opNumero]:{[setor]:{inicio,fim}}},  // janela de CADA setor, por OP
 * }
 */
export async function metasCorteDoCronograma(prisma) {
  const crons = await prisma.cronograma.findMany({
    where: { ativo: true, opId: { not: null } },
    select: {
      opId: true, op: { select: { numero: true, obra: true, cliente: true } },
      tarefas: { where: { isSummary: false, dataInicioPrevista: { not: null }, dataFimPrevista: { not: null } }, select: { nome: true, dataInicioPrevista: true, dataFimPrevista: true } },
    },
  });

  const metas = [];
  const semLista = {};
  const janela = {};
  const datasSetor = {};
  for (const c of crons) {
    const opNum = normOpPmp(c.op?.numero);
    if (!opNum) continue;

    // Janela de cada setor = min início / max fim das tarefas daquela fase (todas as áreas).
    const porSetor = {};
    for (const t of c.tarefas) {
      const setor = SETOR_DA_FASE(t.nome);
      if (!setor) continue;
      const e = (porSetor[setor] = porSetor[setor] || { inicio: t.dataInicioPrevista, fim: t.dataFimPrevista });
      if (t.dataInicioPrevista < e.inicio) e.inicio = t.dataInicioPrevista;
      if (t.dataFimPrevista > e.fim) e.fim = t.dataFimPrevista;
    }
    if (!Object.keys(porSetor).length) continue; // cronograma sem fases de produção com data
    datasSetor[opNum] = Object.fromEntries(Object.entries(porSetor).map(([s, v]) => [s, { inicio: iso(v.inicio), fim: iso(v.fim) }]));

    // Metas-dia de CORTE (distribui as peças de corte pela janela de Preparação). Sem lista = vermelho.
    const corteJanela = porSetor.CORTE;
    if (!corteJanela) continue;
    janela[opNum] = { inicio: iso(corteJanela.inicio), fim: iso(corteJanela.fim) };
    const pcs = await prisma.pecaConjunto.findMany({ where: { opId: c.opId }, select: { tipoPeca: true, qte: true, pesoTotalKg: true } });
    if (!pcs.length) { semLista[opNum] = true; continue; }
    const corte = pcs.filter((p) => p.tipoPeca !== "CONJUNTO");
    const qteTot = corte.reduce((s, p) => s + Math.max(1, Number(p.qte) || 1), 0);
    const pesoTot = corte.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);
    const dias = diasUteis(corteJanela.inicio, corteJanela.fim);
    if (!dias.length) continue;
    const base = Math.floor(qteTot / dias.length), resto = qteTot % dias.length, pesoDia = pesoTot / dias.length;
    dias.forEach((d, i) => metas.push({
      data: iso(d), setor: "CORTE", opNumero: opNum,
      metaPecas: base + (i < resto ? 1 : 0), metaPesoKg: Math.round(pesoDia),
      observacao: "[auto] Cronograma", origem: "CRONOGRAMA",
    }));
  }
  return { metas, semLista, janela, datasSetor };
}
