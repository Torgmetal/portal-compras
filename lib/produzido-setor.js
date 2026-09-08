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
export async function lerProduzidoPorSetor(pecas, setores) {
  const alvos = (setores?.length ? setores : Object.keys(SETOR_SYNECO))
    .map((s) => SETOR_SYNECO[s]).filter(Boolean);
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
  return (peca, setor) => {
    const s = SETOR_SYNECO[setor];
    if (!s || !peca?.opId) return 0;
    const syneco = mapa.get(chave(peca.opId, peca.marca, s)) || 0;
    const portal = doPortal.get(`${peca.opId}|${String(peca.marca).trim().toUpperCase()}|${setor}`) || 0;
    return Math.round(Math.max(syneco, portal));
  };
}
