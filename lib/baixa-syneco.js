import "server-only";
import { prisma } from "./prisma";
import { lerProduzidoPorSetor } from "./produzido-setor";

/* PLANILHA PARA DAR BAIXA NO SYNECO.
 *
 * ⚠⚠ POR QUE ESTA É A FORMA CERTA. Vitor (08/09/2026) precisava regularizar programação antiga e
 * perguntou: "preciso de uma forma de dar baixa manual em algumas programações, mas como temos o
 * Syneco, como podemos fazer isso para ficar correto?". Eu ia propor baixa dentro do portal — e
 * ele veio com a ideia melhor: "criar um botão ao lado do reimprimir, Baixa Syneco, será exportada
 * uma planilha para poder dar baixa no Syneco das marcas selecionadas".
 *
 * A diferença importa. Baixa gravada no portal cria uma SEGUNDA verdade: o portal passa a afirmar
 * produção que o chão de fábrica não registrou, e o cronograma do cliente (que lê o Syneco direto)
 * continua discordando. Já existe esse caso hoje — `baixaSetores` tem 3.709 peças baixadas em
 * agosto que o Gantt nem enxerga, 486 delas só na OP-067. Dando baixa NO SYNECO, o número volta
 * pelo sync e todo mundo — quadro, cronograma, PDF, portal do cliente — passa a ver o mesmo.
 *
 * ⚠ ESTA LIB NÃO ESCREVE NADA. Ela monta a lista; quem lança é a pessoa, no Syneco.
 *
 * ⚠ A OBRA VAI NO CÓDIGO SKA (`PecaConjunto.opNumero` = "T67B"), não no número da OP do portal
 * ("067"). É por esse código que o Syneco conhece a obra [[torg_pecaconjunto_opnumero]] — mandar
 * "067" faria a pessoa procurar uma obra que lá não existe.
 *
 * ⚠ O QUE SE BAIXA É O SALDO, não a quantidade da marca: parte já pode estar apontada. A coluna
 * "A baixar" já vem descontada, para ninguém lançar em dobro.
 */

/** Setor do portal → nome do setor no Syneco (o que a pessoa vai procurar na tela de lá). */
const SETOR_SYNECO_NOME = {
  CORTE: "Corte", PREPARACAO: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura",
};

/**
 * @param {string} opNumero número da OP no portal ("067")
 * @param {string} setor setor do portal ("CORTE")
 * @param {string[]} ids ids de PecaConjunto selecionados na barra
 */
export async function listaBaixaSyneco(opNumero, setor, ids) {
  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true, numero: true, obra: true, cliente: true } });
  if (!op) throw new Error(`OP ${opNumero} não encontrada.`);
  if (!SETOR_SYNECO_NOME[setor]) throw new Error(`Setor sem correspondente no Syneco: ${setor}`);
  if (!ids?.length) throw new Error("Selecione as marcas.");

  const pecas = await prisma.pecaConjunto.findMany({
    where: { id: { in: ids }, opId: op.id },
    select: { id: true, opId: true, opNumero: true, marca: true, descricao: true, perfil: true,
              qte: true, pesoUnitKg: true, pesoTotalKg: true, tipoPeca: true },
    orderBy: { marca: "asc" },
  });
  const feito = await lerProduzidoPorSetor(pecas.map((p) => ({ opId: p.opId, marca: p.marca })), [setor]);

  const linhas = pecas.map((p) => {
    const qte = Math.max(1, p.qte || 1);
    const jaTem = Math.min(feito({ opId: p.opId, marca: p.marca }, setor), qte);
    return {
      obraSyneco: p.opNumero || null, marca: p.marca, descricao: p.descricao || null,
      perfil: p.perfil || null, tipo: p.tipoPeca || null,
      qte, jaApontado: jaTem, aBaixar: qte - jaTem,
      pesoUnitKg: p.pesoUnitKg || 0,
      // ⚠ o peso a baixar acompanha a QUANTIDADE que falta, não o peso total da marca
      pesoABaixarKg: Math.round((p.pesoUnitKg || 0) * (qte - jaTem) * 100) / 100,
    };
  });

  const aBaixar = linhas.filter((l) => l.aBaixar > 0);
  return {
    op: { numero: op.numero, obra: op.obra, cliente: op.cliente },
    setor, setorSyneco: SETOR_SYNECO_NOME[setor],
    obrasSyneco: [...new Set(linhas.map((l) => l.obraSyneco).filter(Boolean))],
    linhas,
    total: {
      marcas: linhas.length,
      marcasABaixar: aBaixar.length,
      pecas: aBaixar.reduce((s, l) => s + l.aBaixar, 0),
      kg: Math.round(aBaixar.reduce((s, l) => s + l.pesoABaixarKg, 0)),
      jaApontadas: linhas.filter((l) => l.aBaixar === 0).length,
    },
  };
}
