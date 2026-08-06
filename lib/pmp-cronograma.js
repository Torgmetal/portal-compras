// Metas de CORTE do PMP puxadas do CRONOGRAMA (janela de Preparação por OP) — automático:
// a data vem do cronograma MESMO com tarefas de projeto atrasadas (usa a Preparação planejada,
// não é empurrada). Janela da OP = min(início) / max(fim) das Preparações de TODAS as áreas.
// Distribui as peças de corte (croqui + avulsa) pelos dias úteis da janela. OPs com janela mas
// SEM lista (nenhuma PecaConjunto) entram em `semLista` — o PMP mostra em vermelho.
import { diasUteis } from "@/lib/pmp-corte";

const iso = (d) => new Date(d).toISOString().slice(0, 10);
// opNumero canônico p/ casar com o PMP ("T089"/"T89"/"089" → "089").
export const normOpPmp = (n) => { const m = String(n || "").match(/\d+/); return m ? String(parseInt(m[0], 10)).padStart(3, "0") : ""; };

/**
 * @returns { metas:[{data,setor:"CORTE",opNumero,pecas,pesoKg,observacao,origem:"CRONOGRAMA"}],
 *            semLista:{[opNumero]:true}, janela:{[opNumero]:{inicio,fim}} }
 */
export async function metasCorteDoCronograma(prisma) {
  const crons = await prisma.cronograma.findMany({
    where: { ativo: true, opId: { not: null } },
    select: {
      opId: true, op: { select: { numero: true } },
      tarefas: { where: { nome: { contains: "Prepara", mode: "insensitive" }, dataInicioPrevista: { not: null }, dataFimPrevista: { not: null } }, select: { dataInicioPrevista: true, dataFimPrevista: true } },
    },
  });

  const metas = [];
  const semLista = {};
  const janela = {};
  for (const c of crons) {
    if (!c.tarefas.length) continue; // cronograma sem Preparação com data — não puxa
    const opNum = normOpPmp(c.op?.numero);
    if (!opNum) continue;
    const inicio = c.tarefas.map((t) => t.dataInicioPrevista).reduce((a, b) => (b < a ? b : a));
    const fim = c.tarefas.map((t) => t.dataFimPrevista).reduce((a, b) => (b > a ? b : a));
    janela[opNum] = { inicio: iso(inicio), fim: iso(fim) };

    // Peças que passam pelo corte (croqui + avulsa; conjunto é montagem+). Sem peças = sem lista.
    const pcs = await prisma.pecaConjunto.findMany({ where: { opId: c.opId }, select: { tipoPeca: true, qte: true, pesoTotalKg: true } });
    if (!pcs.length) { semLista[opNum] = true; continue; }
    const corte = pcs.filter((p) => p.tipoPeca !== "CONJUNTO");
    const qteTot = corte.reduce((s, p) => s + Math.max(1, Number(p.qte) || 1), 0);
    const pesoTot = corte.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0);

    const dias = diasUteis(inicio, fim);
    if (!dias.length) continue;
    const base = Math.floor(qteTot / dias.length), resto = qteTot % dias.length, pesoDia = pesoTot / dias.length;
    dias.forEach((d, i) => metas.push({
      data: iso(d), setor: "CORTE", opNumero: opNum,
      metaPecas: base + (i < resto ? 1 : 0), metaPesoKg: Math.round(pesoDia),
      observacao: "[auto] Cronograma", origem: "CRONOGRAMA",
    }));
  }
  return { metas, semLista, janela };
}
