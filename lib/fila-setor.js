import "server-only";
import { prisma } from "./prisma";
import { lerProduzidoPorSetor } from "./produzido-setor";
import { OP_VIVA } from "./op-viva";
import { SO_FABRICACAO } from "./lista-pecas";
import { ehItemComprado } from "./item-comprado";
import { META_KG_DIA_ACABAMENTO, META_KG_DIA_JATO } from "./capacidade-acabamento";

// ─── A FILA DE ENTRADA DE UM SETOR ─────────────────────
//
// ⚠⚠ A CASCATA. Vitor (06/09/2026): "o que for ficando pronto da solda já deve aparecer para a fila
// do acabamento e o que for ficando pronto do acabamento aparecer na fila do jato — igual fizemos
// na solda". Não há liberação a fazer: terminar o setor anterior É a entrada no seguinte.
//
// Espelha app/pcp/fila-solda (que faz o mesmo para "montado e não soldado"), com uma diferença: lá
// o custo é peça por faixa de peso, aqui é KG contra a capacidade do setor — acabamento e jato não
// têm régua por faixa, têm uma esteira só.
//
// ⚠ PRONTO É O SYNECO, não o status da peça. `PecaConjunto.status` só avança até o corte; depois
// disso ele mente. Quem responde "terminou no setor X" é o apontamento — ver lib/produzido-setor.js.
//
// ⚠ ITEM COMPRADO FICA DE FORA: borracha, pino e cilindro não passam por jato nem acabamento, e
// somá-los cria fila que ninguém vai executar.
//
// ⚠⚠ O QUE ESTA LIB NÃO CONSEGUE FILTRAR, e vai aparecer na tela: obra ACABADA que continua com
// status ABERTA. O `OP_VIVA` corta ENCERRADA e CANCELADA, e nada mais — medido em 06/09/2026, das
// 26 OPs "abertas" só 5 estavam de fato em produção. Enquanto isso não for arrumado, as filas
// mostram trabalho morto das obras antigas (067, 084, 083, 060 lideram as duas).

// ⚠⚠ PINTURA É A PORTA DE SAÍDA DO PCP. Vitor (06/09/2026): "após passar pela pintura essas peças
// não devem nem aparecer em fila alguma mais, isso já cai para fora da tela do portal do PCP".
//
// Não é hipótese: os setores do Syneco NÃO são estritamente sequenciais. Peça pode ter pintura
// apontada sem ter acabamento — porque aquele acabamento não era necessário, ou porque ninguém
// apontou e ela seguiu. Medido em 06/09/2026, antes deste filtro: das 257 peças na fila do
// acabamento, 114 (29.375 kg — mais da METADE do peso) já estavam pintadas. No jato, 22 de 212.
//
// Sem esta regra o PCP programa trabalho que já saiu da fábrica.
const SAIDA = "PINTURA";

/** Setor anterior na cadeia — é dele que a fila de cada um se alimenta. */
export const ANTERIOR = { ACABAMENTO: "SOLDA", JATO: "ACABAMENTO", PINTURA: "JATO" };

/** Capacidade diária do setor, em kg (a meta, não o medido). */
export const CAPACIDADE = { ACABAMENTO: META_KG_DIA_ACABAMENTO, JATO: META_KG_DIA_JATO };

/** Campos de gravação do setor no PecaConjunto. */
export const CAMPOS = {
  ACABAMENTO: { dia: "acabamentoDiaProgramado", bancada: "acabamentoBancada" },
  JATO: { dia: "jatoDiaProgramado", bancada: "jatoBancada" },
};

/** As bancadas de cada setor. Acabamento tem uma; o jato tem turbina e manual. */
export const BANCADAS = {
  ACABAMENTO: [{ k: "ACABAMENTO", nome: "Acabamento" }],
  JATO: [{ k: "JATO_TURBINA", nome: "Jato Turbina" }, { k: "JATO_MANUAL", nome: "Jato Manual" }],
};

/**
 * O que terminou o setor anterior e ainda não terminou este.
 * @param {"ACABAMENTO"|"JATO"} setor
 */
export async function filaDoSetor(setor) {
  const ant = ANTERIOR[setor];
  const campos = CAMPOS[setor];
  if (!ant || !campos) throw new Error(`Setor sem fila definida: ${setor}`);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA },
    select: {
      id: true, opId: true, marca: true, descricao: true, perfil: true, qte: true,
      pesoTotalKg: true, tipoPeca: true, status: true,
      [campos.dia]: true, [campos.bancada]: true,
      op: { select: { numero: true, obra: true, cliente: true } },
    },
    take: 8000,
  });

  const chaves = pecas.map((p) => ({ opId: p.opId, marca: p.marca }));
  const [feitoAnt, feitoAqui, feitoSaida] = await Promise.all([
    lerProduzidoPorSetor(chaves, [ant]),
    lerProduzidoPorSetor(chaves, [setor]),
    lerProduzidoPorSetor(chaves, [SAIDA]),
  ]);

  const pronto = (p, s, fn) => fn({ opId: p.opId, marca: p.marca }, s) >= Math.max(1, p.qte || 1);

  const fila = pecas
    .filter((p) => !ehItemComprado(p))
    // ⚠ pintada = fora do PCP, mesmo que o setor deste quadro não tenha sido apontado
    .filter((p) => !pronto(p, SAIDA, feitoSaida))
    .filter((p) => pronto(p, ant, feitoAnt) && !pronto(p, setor, feitoAqui))
    .map((p) => ({
      id: p.id, marca: p.marca, descricao: p.descricao, perfil: p.perfil,
      qte: Math.max(1, p.qte || 1), kg: Math.round(p.pesoTotalKg || 0),
      tipoPeca: p.tipoPeca,
      opNumero: p.op?.numero || null, obra: p.op?.obra || null, cliente: p.op?.cliente || null,
      dia: p[campos.dia] ? p[campos.dia].toISOString().slice(0, 10) : null,
      bancada: p[campos.bancada] || null,
      feitoAqui: Math.round(feitoAqui({ opId: p.opId, marca: p.marca }, setor)),
    }))
    .sort((a, b) => String(a.opNumero).localeCompare(String(b.opNumero)) || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));

  // resumo por OP: é assim que o PCP escolhe o que atacar
  const porOp = new Map();
  for (const f of fila) {
    const a = porOp.get(f.opNumero) || { opNumero: f.opNumero, obra: f.obra, pecas: 0, kg: 0, semBancada: 0 };
    a.pecas += 1; a.kg += f.kg; if (!f.bancada) a.semBancada += 1;
    porOp.set(f.opNumero, a);
  }
  const cap = CAPACIDADE[setor] || 0;
  const obras = [...porOp.values()]
    .map((o) => ({ ...o, dias: cap ? Math.round((o.kg / cap) * 10) / 10 : null }))
    .sort((a, b) => b.kg - a.kg);

  const kg = fila.reduce((s, f) => s + f.kg, 0);
  return {
    setor, anterior: ant, bancadas: BANCADAS[setor], capacidadeKgDia: cap,
    total: { pecas: fila.length, kg, dias: cap ? Math.round((kg / cap) * 10) / 10 : null },
    obras, fila,
  };
}
