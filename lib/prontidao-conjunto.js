import { SO_FABRICACAO } from "@/lib/lista-pecas";

// ─── A PRONTIDÃO DO CONJUNTO PARA A MONTAGEM ──────────────────────────────────
// Regra do Vitor (12/06/2026), extraída de MontagemClient para lib em 01/09/2026, quando a tela de
// programação da montagem passou a precisar da MESMA conta no servidor. Duas cópias da regra que
// decide se um conjunto pode ser montado é o tipo de divergência que ninguém percebe até a fábrica
// receber ordem de montar o que não está cortado.
//
//   PRONTO    = todos os croquis 100% cortados
//   LIBERAVEL = todos os croquis com PELO MENOS METADE cortada — a montagem pode começar antes de
//               terminar todos os cortes
//   PARCIAL   = tem corte feito, mas algum croqui abaixo da metade
//   PENDENTE  = nada cortado
//
// ⚠ `podeLiberar` (PRONTO ou LIBERAVEL) é a regra da metade, do fluxo da fábrica. Para PROGRAMAR a
// data de montagem o critério é outro e mais duro — `pronto` —, porque Vitor (01/09/2026) pediu
// "por conjunto que tenha todas as sub peças prontas para iniciar a montagem". São perguntas
// diferentes: uma é "dá para começar?", a outra é "dá para marcar o dia?".

const cmpNatural = (a, b) =>
  String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

export function calcularProntidao(conjunto) {
  const croquis = conjunto?.conjuntoCroquis || [];
  if (croquis.length === 0) {
    return { pronto: false, liberavel: false, podeLiberar: false, total: 0, atendidos: 0, pct: 0, itens: [], categoria: "PENDENTE" };
  }

  let total = 0, atendidos = 0, comMetade = 0, comAlgo = 0;
  const itens = [];

  for (const rel of croquis) {
    const c = rel.croqui;
    if (!c) continue;
    const necessario = c.qte || 1;
    const produzido = c.qteProduzida || 0;
    const ok = produzido >= necessario;
    const metade = produzido >= necessario / 2;
    total++;
    if (ok) atendidos++;
    if (metade) comMetade++;
    if (produzido > 0) comAlgo++;
    itens.push({
      marca: c.marca, descricao: c.descricao, material: c.material,
      qte: necessario, qteProduzida: produzido, falta: Math.max(0, necessario - produzido),
      ok, metade, status: c.status, maquina: c.maquina,
      comprimentoMm: c.comprimentoMm, pesoUnitKg: c.pesoUnitKg,
    });
  }

  itens.sort((a, b) => cmpNatural(a.marca, b.marca));
  const pct = total > 0 ? Math.round((atendidos / total) * 100) : 0;
  const pronto = atendidos === total && total > 0;
  const liberavel = !pronto && total > 0 && comMetade === total;
  return { pronto, liberavel, podeLiberar: pronto || liberavel, total, atendidos, pct, itens,
           categoria: pronto ? "PRONTO" : liberavel ? "LIBERAVEL" : comAlgo > 0 ? "PARCIAL" : "PENDENTE" };
}

/**
 * Filtro do Prisma: conjunto que REALMENTE vai para a montagem.
 *
 * ⚠⚠ MARCA SEM SUB-PEÇA NÃO MONTA. Vitor (01/09/2026): "se lembre que peças marca que não possuem
 * sub peças não podem ir para a montagem". A regra já existia no motor do fluxo
 * (`pecaEhComposta` em lib/prioridades-setor exige `croquiCount > 0`), mas as TELAS de montagem
 * consultavam só `tipoPeca: "CONJUNTO"` — e 59 marcas sem croqui nenhum (PILARETE, SE-…, 23,5 t em
 * 5 obras) apareciam na fila da bancada, onde não há o que montar.
 *
 * ⚠ Duas fontes para a mesma pergunta é o erro que mais custa aqui: o fluxo dizia que a peça pula a
 * montagem e a tela mandava montar.
 */
/**
 * ⚠⚠ PRODUÇÃO É LPC. A LE NÃO ENTRA AQUI.
 *
 * Vitor (03/09/2026), pela enésima vez: "novamente você e suas duplicações, já disse várias vezes
 * que produção é LPC" — e antes, sobre o que aparecia pronto: "se estão pronto não é conjunto e sim
 * marca, pois não deve ter subpeças".
 *
 * A LPC é a lista de FABRICAÇÃO; a LE é a de EXPEDIÇÃO. As duas trazem as mesmas marcas, então cada
 * marca vira DOIS registros em `PecaConjunto` — e sem o filtro os dois entravam na montagem.
 *
 * ⚠⚠ E o registro da LE não vinha só duplicado: vinha MENTINDO. Medido na OP-105 em 03/09/2026 —
 * a montagem via 36 conjuntos e dizia que 12 estavam 100% cortados; os 12 eram TODOS da LE, com 1 a
 * 5 croquis grudados por engano (contra 17 a 27 no registro real da LPC). Como esses poucos estavam
 * cortados, apareciam prontos. Da LPC, prontos de verdade: ZERO. A tela mandava montar o que ainda
 * estava na máquina de corte, e um lote desses chegou a descer para o dia 04/09.
 *
 * ⚠ USA `SO_FABRICACAO` (lib/lista-pecas), não um filtro próprio: é o vocabulário que o resto do
 * portal já usa para escolher entre as duas listas, e inventar outro aqui é como a divergência
 * nasce. Ver [torg_listas_le_lpc].
 *
 * ⚠ Contaminação medida em 03/09/2026: 153 conjuntos com croqui fora da LPC, nas OPs 060 (61),
 * 113 (47), 089 (33) e 105 (12). Este filtro os tira das telas; o vínculo errado croqui↔LE segue
 * no banco e é assunto do importador.
 */
export const CONJUNTO_MONTAVEL = { tipoPeca: "CONJUNTO", ...SO_FABRICACAO, conjuntoCroquis: { some: {} } };
