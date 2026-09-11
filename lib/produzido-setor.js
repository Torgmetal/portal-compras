import "server-only";
import { prisma } from "./prisma";

// ─── QUANTO DESSE CONJUNTO JÁ SAIU, POR SETOR ──────────────────────────────────────────────────
//
// ⚠⚠ EXISTE PORQUE `PecaConjunto.qteProduzida` ENGANA. Aquele campo só é escrito pelo import de
// corte (app/api/producao/importar-syneco-corte e lib/reconciliar-syneco-corte): ele significa
// "quanto o CORTE cortou", nunca "quanto desse conjunto já saiu". Lido em qualquer setor depois do
// corte devolve zero — e zero parece um dado, não uma ausência.
//
// Medido em 05/09/2026, cruzando MesOrdem com PecaConjunto em todas as obras:
//
//   setor        produzido (Syneco)   qteProduzida (portal)   marcas invisíveis
//   Corte             71.776               59.763                  1.126
//   Pintura           22.040                9.875                  3.851
//   Jato              18.234                7.656                  3.865
//   Solda             12.872                   30                  3.507
//   Montagem          12.355                   30                  3.673
//   Acabamento        11.248                1.056                  2.694
//
// O caso que abriu isso: o Gantt do PCP mostrava a OP-097 com "0 de 242 peças feitas" enquanto o
// Syneco tinha metade da obra montada e soldada. Ver [torg_peca_setor_real] na memória do projeto.
//
// ⚠ NÃO SERVE PARA SÉRIE DIÁRIA. O `MesOrdem` é CUMULATIVO — "quanto dessa marca já saiu neste
// setor". Para "quanto a fábrica produziu no dia 12" é `MesApontamento` por `dataInicio`, que é
// outro problema e outra tabela.

/* ⚠⚠ APONTAMENTO NA FRENTE DÁ BAIXA ATRÁS. Vitor (09/09/2026): "sempre se lembre que se existir
   apontamento na frente você deve dar baixa nos setores anteriores". A peça não chega ao jato sem
   ter sido montada e soldada — se há registro adiante, as etapas anteriores estão feitas, tenha
   alguém apontado ou não.

   Medido nos guarda-corpos da OP-067 (09/09/2026): 332 das 575 marcas tinham furo em alguma etapa.
   Pelo apontamento cru faltavam 337 montar e 379 soldar; pela rota, faltavam 31 e 71. A resposta
   muda de "a obra está pela metade" para "a fabricação fechou, falta acabamento". O sinal de que há
   furo é a rota não ser monotônica — jato em 66% com solda em 44% é impossível.

   ⚠ A DEDUÇÃO PROVA QUE PASSOU, NÃO QUANDO. Por isso ela vive AQUI e não em `mesApontamento`: este
   leitor responde "o que falta / onde está a peça", e é cumulativo por natureza (o aviso no topo já
   diz que não serve para série diária). Produtividade por setor e por mês continua saindo do
   apontamento com data — creditar o kg da montagem ao mês em que a peça foi jateada estragaria a
   meta de quem trabalhou.

   ⚠ QUEM PRECISA DO CRU PASSA `deduzirRota:false` — é o caso da planilha de Baixa Syneco
   (lib/baixa-syneco), que existe justamente para regularizar o que NÃO foi apontado: deduzir ali
   esconderia a linha que a planilha veio corrigir. */
const ROTA = ["CORTE", "PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];

/** Setor do portal → nome do setor no Syneco (o MesOrdem grava em title-case). */
export const SETOR_SYNECO = {
  CORTE: "Corte",
  PREPARACAO: "Preparação",
  MONTAGEM: "Montagem",
  SOLDA: "Solda",
  ACABAMENTO: "Acabamento",
  JATO: "Jato",
  PINTURA: "Pintura",
};

const chave = (opId, marca, setorSyneco) =>
  `${opId}|${String(marca).trim().toUpperCase()}|${setorSyneco}`;

/**
 * Lê do Syneco quanto já saiu de cada (peça × setor), numa consulta só.
 *
 * @param {Array<{opId?:string, marca?:string}>} pecas  peças/croquis do portal
 * @param {string[]} [setores]  setores do PORTAL (chaves de SETOR_SYNECO); padrão: todos
 * @returns {Promise<(peca, setor) => number>} quanto saiu daquela marca naquele setor
 */
export async function lerProduzidoPorSetor(pecas, setores, { deduzirRota = true } = {}) {
  const pedidos = setores?.length ? setores : Object.keys(SETOR_SYNECO);
  /* ⚠ com a dedução ligada, a consulta traz a ROTA INTEIRA mesmo que o chamador peça um setor só:
     sem as etapas da frente não há como saber que a peça já passou por esta. */
  const usados = deduzirRota ? Object.keys(SETOR_SYNECO) : pedidos;
  const alvos = usados.map((s) => SETOR_SYNECO[s]).filter(Boolean);
  const opIds = [...new Set(pecas.map((p) => p?.opId).filter(Boolean))];
  const marcas = [...new Set(pecas.map((p) => p?.marca).filter(Boolean))];
  if (!opIds.length || !marcas.length || !alvos.length) return () => 0;

  const ordens = await prisma.mesOrdem.findMany({
    where: { opId: { in: opIds }, item: { in: marcas }, setor: { in: alvos } },
    select: { opId: true, item: true, setor: true, produzidoUn: true },
  });

  /* ⚠⚠ A BAIXA DO PORTAL TAMBÉM CONTA. `PecaConjunto.baixaSetores[setor] = {qtd, em, por}` é a
     regularização feita à mão no portal — 3.709 peças desde agosto — e este leitor a ignorava, então
     o Gantt e as filas seguiam mostrando como pendente o que alguém já tinha baixado. Medido em
     08/09/2026: 430 peças só na OP-067.
     A regra é a MESMA que o painel de Despacho já usava: feito = o MAIOR entre o Syneco e a baixa do
     portal. Máximo e não soma — são duas leituras do mesmo trabalho, não dois trabalhos.
     ⚠ Isto NÃO chega ao cliente: o cronograma lê `mesApontamento` por outro caminho
     (lib/cronograma-syneco.js), então PDF, XML e portal do cliente continuam lastreados no chão de
     fábrica. Aqui é planejamento interno. */
  const baixadas = await prisma.pecaConjunto.findMany({
    where: { opId: { in: opIds }, marca: { in: marcas }, NOT: { baixaSetores: { equals: null } } },
    select: { opId: true, marca: true, baixaSetores: true },
  });

  /* ⚠⚠ O ROMANEIO É A ÚLTIMA ETAPA DA ROTA. Vitor (09/09/2026), sobre a OP-104: "deve ter algum furo
     de apontamento, não temos mais montagem dela". Tinha: os seis guarda-corpos (9 peças) estão sem
     apontamento em setor NENHUM do Syneco — nem montagem, nem solda, nem jato — e por isso a dedução
     pela rota não os alcançava: não havia nada à frente para provar.
     Mas havia no romaneio. As nove embarcaram no R02 em 14/08, quantidade completa. Peça expedida
     foi montada, soldada e pintada — não há outro caminho até o caminhão.
     ⚠ É a prova MAIS FORTE que existe aqui, mais que apontamento: o romaneio é documento conferido
     e assinado, e o apontamento é alguém lembrando de teclar. Por isso entra como etapa depois da
     pintura, e não como mais um setor. */
  const expedidos = deduzirRota
    ? await prisma.romaneioItem.findMany({
      where: { pecaConjunto: { opId: { in: opIds }, marca: { in: marcas } } },
      select: { qtd: true, pecaConjunto: { select: { opId: true, marca: true } } },
    })
    : [];
  const foiExpedido = new Map();
  for (const i of expedidos) {
    const p = i.pecaConjunto; if (!p?.opId) continue;
    const k = `${p.opId}|${String(p.marca).trim().toUpperCase()}`;
    foiExpedido.set(k, (foiExpedido.get(k) || 0) + (Number(i.qtd) || 0));
  }

  // ⚠ SOMA, não máximo: a mesma marca pode aparecer em duas ordens do Syneco (2 casos em 22.628 na
  // medição de 05/09/2026, ambos no corte). Máximo perderia a segunda. Quem chama deve limitar por
  // `qte` — o Syneco às vezes aponta a mais.
  const mapa = new Map();
  for (const o of ordens) {
    const k = chave(o.opId, o.item, o.setor);
    mapa.set(k, (mapa.get(k) || 0) + (o.produzidoUn || 0));
  }
  // baixa do portal, indexada pelo setor do PORTAL (é assim que ela é gravada)
  const doPortal = new Map();
  for (const b of baixadas) {
    const bx = b.baixaSetores && typeof b.baixaSetores === "object" ? b.baixaSetores : {};
    for (const [setor, v] of Object.entries(bx)) {
      const qtd = Number(v?.qtd);
      if (Number.isFinite(qtd) && qtd > 0) doPortal.set(`${b.opId}|${String(b.marca).trim().toUpperCase()}|${setor}`, qtd);
    }
  }
  const cru = (peca, setor) => {
    const s = SETOR_SYNECO[setor];
    if (!s || !peca?.opId) return 0;
    const syneco = mapa.get(chave(peca.opId, peca.marca, s)) || 0;
    const portal = doPortal.get(`${peca.opId}|${String(peca.marca).trim().toUpperCase()}|${setor}`) || 0;
    return Math.max(syneco, portal);
  };
  if (!deduzirRota) return (peca, setor) => Math.round(cru(peca, setor));

  return (peca, setor) => {
    const i = ROTA.indexOf(setor);
    if (i < 0) return Math.round(cru(peca, setor));
    let melhor = cru(peca, setor);
    for (const posterior of ROTA.slice(i + 1)) melhor = Math.max(melhor, cru(peca, posterior));
    // o embarque vale para TODA etapa da rota — é o fim dela
    melhor = Math.max(melhor, foiExpedido.get(`${peca.opId}|${String(peca.marca).trim().toUpperCase()}`) || 0);
    return Math.round(melhor);
  };
}
