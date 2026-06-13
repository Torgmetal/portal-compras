// Conjuntos de um setor + apontamento do Syneco nesse setor e no PRÓXIMO (só
// peças da LPC). A fábrica corre unidades em vários setores ao mesmo tempo,
// então a tela considera:
//  - ADIANTADOS: apontamento > 0 aqui com status (pipeline) ainda anterior;
//  - SAÍDOS: status além do setor, ou apontamento completo + próximo iniciado
//    — ficam fora da lista e contam só no indicador geral (regra do Vitor);
//  - FUROS: mais unidades apontadas aqui do que em algum setor ANTERIOR da
//    cadeia — fisicamente impossível, é lançamento errado/faltando no Syneco.
//    Nesses casos a tela mostra alerta em vez de "adiantado" (regra do Vitor).
import { prisma } from "@/lib/prisma";

const ORDEM = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
// Setores do Syneco na ordem física da fábrica (nomes exatos do MesOrdem)
const CADEIA_SYNECO = ["Montagem", "Solda", "Acabamento", "Jato", "Pintura"];

/**
 * @param {string} setorAtual - status do setor da aba (ex.: "SOLDA")
 * @param {string} setorSyneco - nome do setor no Syneco (ex.: "Solda")
 * @param {string|null} setorSynecoProximo - setor seguinte no Syneco (null se não há, ex.: pós-pintura)
 * @returns {{ pecas, apontamentos, apontamentosProximo, furos }}
 */
export async function buscarConjuntosComApontamento(setorAtual, setorSyneco, setorSynecoProximo) {
  const marcasLpc = (
    await prisma.pecaConjunto.findMany({
      where: { tipoPeca: "CONJUNTO", fonte: "LPC_IMPORT" },
      select: { marca: true },
    })
  ).map((m) => m.marca);

  // A cadeia inteira numa busca só — os setores anteriores são necessários
  // para detectar furo de lançamento.
  const rows = marcasLpc.length
    ? await prisma.mesOrdem.findMany({
        where: { setor: { in: CADEIA_SYNECO }, item: { in: marcasLpc } },
        select: { setor: true, item: true, produzidoUn: true, planejadoUn: true, dataFim: true },
      })
    : [];

  const porSetor = {};
  for (const a of rows) {
    const mapa = (porSetor[a.setor] = porSetor[a.setor] || {});
    const acc = (mapa[a.item] = mapa[a.item] || { produzido: 0, planejado: 0, dataFim: null });
    acc.produzido += a.produzidoUn || 0;
    acc.planejado += a.planejadoUn || 0;
    if (a.dataFim && (!acc.dataFim || a.dataFim > acc.dataFim)) acc.dataFim = a.dataFim;
  }

  const apontamentos = porSetor[setorSyneco] || {};
  const apontamentosProximo = (setorSynecoProximo && porSetor[setorSynecoProximo]) || {};

  // Furo de apontamento (cadeia inteira): uma unidade não chega a um setor sem
  // passar pelos anteriores, então o apontado deve ser não-crescente ao longo
  // da cadeia. Qualquer setor com mais unidades que algum anterior é
  // impossível — lançamento errado/faltando no Syneco. Detectado por conjunto,
  // independente da aba (setor sem registro nenhum = etapa pulada, ignorado).
  const marcasComApont = new Set();
  for (const s of CADEIA_SYNECO) for (const m of Object.keys(porSetor[s] || {})) marcasComApont.add(m);

  const furos = {};
  for (const marca of marcasComApont) {
    const cadeia = {};
    for (const s of CADEIA_SYNECO) cadeia[s] = porSetor[s]?.[marca]?.produzido ?? null;
    // pior violação: setor com valor acima do MENOR upstream que ele excede
    let pior = null;
    for (let j = 0; j < CADEIA_SYNECO.length; j++) {
      const vj = cadeia[CADEIA_SYNECO[j]];
      if (vj == null) continue;
      let menorUp = null, setorUp = null;
      for (let i = 0; i < j; i++) {
        const vi = cadeia[CADEIA_SYNECO[i]];
        if (vi != null && (menorUp == null || vi < menorUp)) { menorUp = vi; setorUp = CADEIA_SYNECO[i]; }
      }
      if (menorUp != null && vj > menorUp && (!pior || vj - menorUp > pior.diff)) {
        pior = { setor: CADEIA_SYNECO[j], valor: vj, setorUp, valorUp: menorUp, diff: vj - menorUp };
      }
    }
    if (pior) {
      furos[marca] = {
        cadeia,
        resumo: `${pior.setor} ${pior.valor} acima de ${pior.setorUp} ${pior.valorUp}`,
      };
    }
  }

  // Do setor em diante: quem já passou conta no "Total geral" da tela.
  const statusList = ORDEM.slice(ORDEM.indexOf(setorAtual));
  const adiantadas = Object.keys(apontamentos).filter((m) => apontamentos[m].produzido > 0);

  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      tipoPeca: "CONJUNTO",
      OR: [
        { status: { in: statusList } },
        ...(adiantadas.length ? [{ marca: { in: adiantadas }, fonte: "LPC_IMPORT" }] : []),
      ],
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    include: { op: { select: { id: true, numero: true, cliente: true, obra: true } } },
    take: 3000,
  });

  return { pecas, apontamentos, apontamentosProximo, furos };
}

/**
 * Lista os conjuntos da LPC com furo de apontamento na cadeia inteira
 * (qualquer setor com mais unidades que algum anterior). Usado no painel da
 * produção para o alerta global. Retorna [{ marca, opNumero, resumo }].
 */
export async function listarFurosApontamento() {
  const conj = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", fonte: "LPC_IMPORT" },
    select: { marca: true, opNumero: true },
  });
  if (!conj.length) return [];

  const opPorMarca = {};
  for (const c of conj) if (!(c.marca in opPorMarca)) opPorMarca[c.marca] = c.opNumero;
  const marcas = Object.keys(opPorMarca);

  const rows = await prisma.mesOrdem.findMany({
    where: { setor: { in: CADEIA_SYNECO }, item: { in: marcas } },
    select: { setor: true, item: true, produzidoUn: true },
  });
  const porSetor = {};
  for (const a of rows) {
    const m = (porSetor[a.setor] = porSetor[a.setor] || {});
    m[a.item] = (m[a.item] || 0) + (a.produzidoUn || 0);
  }

  const furos = [];
  for (const marca of marcas) {
    const cadeia = CADEIA_SYNECO.map((s) => porSetor[s]?.[marca] ?? null);
    let pior = null;
    for (let j = 0; j < cadeia.length; j++) {
      if (cadeia[j] == null) continue;
      let menorUp = null, setorUp = null;
      for (let i = 0; i < j; i++) {
        if (cadeia[i] != null && (menorUp == null || cadeia[i] < menorUp)) { menorUp = cadeia[i]; setorUp = CADEIA_SYNECO[i]; }
      }
      if (menorUp != null && cadeia[j] > menorUp && (!pior || cadeia[j] - menorUp > pior.diff)) {
        pior = { setor: CADEIA_SYNECO[j], valor: cadeia[j], setorUp, valorUp: menorUp, diff: cadeia[j] - menorUp };
      }
    }
    if (pior) furos.push({ marca, opNumero: opPorMarca[marca], resumo: `${pior.setor} ${pior.valor} acima de ${pior.setorUp} ${pior.valorUp}` });
  }
  return furos;
}
