import "server-only";

// ─── O TETO DO PLANEJADO ─────────────────────────────────────────────────────
//
// Saiu de `lib/mes/sessao.js` quando ele passou de 350 linhas. A regra não mudou: o teto é da
// MARCA (obra + marca), não da sessão nem do posto — e é por isso que o lançamento trava as duas
// chaves (`lib/mes/trava.js`).

/**
 * QUANTAS PEÇAS BOAS AINDA CABEM NO PLANEJADO DESTA MARCA.
 *
 * ⚠⚠ O TETO É DA MARCA, NÃO DA SESSÃO. Matheus (11/09/2026): "quando lançar é importante que ele
 * trave a quantidade que dá para lançar comparando na quantidade planejada". `planejadoQtd` é uma
 * CÓPIA feita na abertura — se a sessão de ontem fez 5 das 7 peças, a de hoje abriria achando que
 * tem 7 inteiras pela frente e o lançamento passaria o dobro sem ninguém ver. Mesma lição da
 * Conferência de Peça: lá o teto é da OBRA, não da sessão, e pelo mesmo motivo.
 *
 * ⚠⚠ SÓ AS BOAS CONSOMEM O SALDO (decisão do Matheus, 11/09/2026). Rejeitada e retrabalho são
 * PERDA: a peça passou pela máquina e continua faltando. Se descontassem do planejado, uma refugação
 * alta trancaria a marca antes de ela ficar pronta — o operador ficaria sem como registrar as peças
 * que ainda tem de fazer.
 *
 * ⚠ PLANEJADO ZERO É "SEM TETO", não "não pode nada". É o caso da marca bipada à mão, fora da
 * programação do Gantt — que é o caso comum, não a exceção (ver o vazio da tela de escolha).
 * Tratar 0 como teto faria a trava proibir todo apontamento não programado.
 */
export async function saldoDaMarca(tx, sessao) {
  const planejado = Number(sessao?.planejadoQtd) || 0;
  const semTeto = { planejado: 0, boas: 0, saldo: null, semTeto: true };
  if (planejado <= 0 || !sessao?.marca) return semTeto;

  // A mesma marca pode ter sido produzida em outras sessões (outro turno, outro posto do setor).
  // Sem `opId` a obra vem pelo número — é o que existe quando a marca foi bipada à mão.
  const daObra = sessao.opId ? { opId: sessao.opId } : { opNumero: sessao.opNumero };
  // ⚠⚠ O AMBIENTE ENTRA AQUI, E SEM ELE O ISOLAMENTO NÃO EXISTE (achado do Codex, 21/09/2026).
  // Esta busca casa por obra+MARCA, que são strings — não por `recursoId`. Então o raciocínio "a
  // chave estrangeira já carrega o mundo" falha justamente aqui: uma simulação lançando 10 peças
  // de T89A10 consumiria o saldo real da T89A10, e o operador de verdade ouviria "já foram
  // lançadas" por causa de um teste.
  const irmas = await tx.mesSessao.findMany({
    where: { marca: sessao.marca, ...daObra, ambiente: sessao.ambiente },
    select: { id: true },
  });
  const soma = await tx.mesApontamentoQtd.aggregate({
    where: { sessaoId: { in: irmas.map((s) => s.id) } },
    _sum: { boas: true },
  });
  const boas = soma?._sum?.boas || 0;
  return { planejado, boas, saldo: Math.max(0, planejado - boas), semTeto: false };
}

/**
 * A recusa por estourar o planejado — ou `null` quando o lançamento cabe.
 *
 * ⚠ "FALTAM 0" NÃO É FRASE. Quando o planejado já foi cumprido, o que o operador precisa saber é
 * que a marca acabou (e que quem muda o planejado é o PCP), não uma subtração que deu zero.
 *
 * @returns {string|null}
 */
export function recusaPorSaldo(conta, boasPedidas, marca) {
  const boas = Number(boasPedidas) || 0;
  if (conta.semTeto || boas <= conta.saldo) return null;
  if (conta.saldo === 0) return `As ${conta.planejado} peças planejadas de ${marca} já foram lançadas.`;
  return `Planejado ${conta.planejado} pç · já lançadas ${conta.boas} · faltam ${conta.saldo}. Não dá para lançar ${boas}.`;
}
