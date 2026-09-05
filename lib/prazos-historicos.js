import "server-only";
import { prisma } from "./prisma";

// ─── O RITMO REAL DA CASA ─────────────────────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "temos que ter um tempo médio para engenharia, compras, produção".
//
// ⚠⚠ MÉDIO DE ONDE. Chutar 30/45/60 dias seria inventar — e o estudo é onde a Torg assume prazo
// com o cliente. O portal já guarda os três marcos, obra por obra, e é deles que sai a referência:
//
//   engenharia → da abertura da OP até a PRIMEIRA lista de fabricação (LPC) importada
//   compras    → da primeira RM da obra até o primeiro recebimento
//   produção   → do primeiro ao último apontamento no Syneco
//
// ⚠ MEDIANA, NÃO MÉDIA. A OP-067 levou 259 dias de engenharia e a 099 levou 6: uma média junta as
// duas num número que não descreve obra nenhuma. A mediana ignora o extremo e responde "a obra do
// meio".
//
// ⚠ E RITMO, NÃO DURAÇÃO. Obra de 300 t não leva o mesmo tempo que a de 20 t. Por isso engenharia e
// produção saem em kg por dia útil — o que multiplica pelo peso do estudo. Compras é o único que
// sai em dias: prazo de fornecedor não depende do tamanho do nosso escopo.
//
// ⚠ O QUE ESTA MEDIDA NÃO É: promessa. É a referência que a tela pré-carrega, e cada número é
// editável no estudo. Vem com a amostra (quantas obras) para quem lê saber o peso do número.

const DIA = 86_400_000;
const TTL_MS = 6 * 60 * 60 * 1000; // muda com obra terminando, não com o minuto
let cache = null;

const mediana = (arr) => {
  const v = arr.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

export async function mediasDePrazo({ forcar = false } = {}) {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.dados;

  const ops = await prisma.oP.findMany({ select: { id: true, numero: true, createdAt: true, dataInicio: true } });

  const [pecas, ordens, rms, recebimentos] = await Promise.all([
    prisma.pecaConjunto.groupBy({
      by: ["opId"], where: { fonte: "LPC_IMPORT" },
      _min: { criadoEm: true }, _sum: { pesoTotalKg: true },
    }),
    prisma.mesOrdem.groupBy({
      by: ["opId"], where: { produzidoUn: { gt: 0 } },
      _min: { dataInicio: true }, _max: { dataInicio: true },
    }),
    prisma.rM.groupBy({ by: ["opId"], _min: { createdAt: true } }),
    // primeiro recebimento de cada obra: passa pela RM, então junta aqui
    prisma.rMItem.findMany({
      where: { recebimentos: { some: {} } },
      select: { rm: { select: { opId: true } }, recebimentos: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    }),
  ]);

  const porOp = (lista, chave = "opId") => new Map(lista.filter((x) => x[chave]).map((x) => [x[chave], x]));
  const mPecas = porOp(pecas), mOrdens = porOp(ordens), mRms = porOp(rms);
  const primeiroReceb = new Map();
  for (const it of recebimentos) {
    const op = it.rm?.opId; const d = it.recebimentos[0]?.createdAt;
    if (!op || !d) continue;
    const atual = primeiroReceb.get(op);
    if (!atual || d < atual) primeiroReceb.set(op, d);
  }

  const eng = [], compras = [], prod = [];
  let obrasComAlgo = 0;
  for (const o of ops) {
    const abertura = o.dataInicio || o.createdAt;
    const pc = mPecas.get(o.id), mo = mOrdens.get(o.id), rm = mRms.get(o.id);
    const kg = Number(pc?._sum?.pesoTotalKg) || 0;
    let contou = false;

    const lpc = pc?._min?.criadoEm;
    if (abertura && lpc && +lpc > +abertura && kg > 0) {
      const uteis = ((+lpc - +abertura) / DIA) * 5 / 7;
      if (uteis >= 1) { eng.push(Math.round(kg / uteis)); contou = true; }
    }
    const rec = primeiroReceb.get(o.id);
    if (rm?._min?.createdAt && rec && +rec > +rm._min.createdAt) {
      compras.push(Math.round((+rec - +rm._min.createdAt) / DIA)); contou = true;
    }
    const c0 = mo?._min?.dataInicio, c1 = mo?._max?.dataInicio;
    if (c0 && c1 && +c1 > +c0 && kg > 0) {
      const uteis = ((+c1 - +c0) / DIA) * 5 / 7;
      if (uteis >= 1) { prod.push(Math.round(kg / uteis)); contou = true; }
    }
    if (contou) obrasComAlgo++;
  }

  const dados = {
    engenhariaKgDiaUtil: mediana(eng),
    comprasDias: mediana(compras),
    producaoKgDiaUtil: mediana(prod),
    amostras: { engenharia: eng.length, compras: compras.length, producao: prod.length },
    obras: obrasComAlgo,
    medidoEm: new Date().toISOString(),
  };
  cache = { em: Date.now(), dados };
  return dados;
}
