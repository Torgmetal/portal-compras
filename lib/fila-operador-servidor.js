import "server-only";
import { prisma } from "./prisma";
import { MAQUINA_LABEL } from "./maquina-corte";
import { BANCADAS as MONTAGEM } from "./montagem-capacidade";
import { BANCADAS as SOLDA } from "./solda-capacidade";
import { BANCADAS } from "./fila-setor";
import { lotesProgramados } from "./gantt-pcp";
let cache = null,
  pendente = null;
const IMPEDIMENTOS = {
  AGUARDANDO_MATERIAL: "Aguardando material",
  REVISAO: "Aguardando revisão da Engenharia",
  CANCELADA: "Peça cancelada",
  TERCEIRO: "Material encaminhado a terceiro",
};
export async function carregarFilaOperador() {
  if (cache && Date.now() - cache.em < 30000) return cache.dados;
  if (pendente) return pendente;
  pendente = (async () => {
    const lotes = await lotesProgramados();
    const ids = [
      ...new Set(
        lotes
          .flatMap((l) => (l.itens || []).map((i) => i.id))
          .filter(
            (id) => !id.startsWith("retorno:") && !id.startsWith("previsao:"),
          ),
      ),
    ];
    const [pecas, ops] = await Promise.all([
      ids.length
        ? prisma.pecaConjunto.findMany({
            where: { id: { in: ids } },
            select: { id: true, opId: true, destino: true },
          })
        : [],
      prisma.oP.findMany({ select: { id: true, numero: true } }),
    ]);
    const porId = new Map(pecas.map((p) => [p.id, p]));
    const chave = (v) => String(v).replace(/^0+(?=\d)/, "");
    const porOp = new Map(ops.map((o) => [chave(o.numero), o.id]));
    const recursos = {
      CORTE: Object.keys(MAQUINA_LABEL),
      MONTAGEM,
      SOLDA,
      ...Object.fromEntries(
        Object.entries(BANCADAS).map(([s, b]) => [s, b.map((r) => r.k)]),
      ),
    };
    const dados = {
      recursos,
      geradoEm: new Date().toISOString(),
      hoje: new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }),
      lotes: lotes.map((l) => ({
        ...l,
        opId: porOp.get(chave(l.op)) || null,
        itens: l.itens.map((i) => ({
          ...i,
          impedimento: IMPEDIMENTOS[porId.get(i.id)?.destino] || null,
        })),
      })),
    };
    cache = { em: Date.now(), dados };
    return dados;
  })();
  try {
    return await pendente;
  } finally {
    pendente = null;
  }
}
