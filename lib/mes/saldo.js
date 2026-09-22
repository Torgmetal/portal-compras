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
  // ⚠⚠ A OPERAÇÃO ENTRA NA CONTA, E SEM ELA UMA ETAPA COME O SALDO DA SEGUINTE (achado do Codex,
  // 22/09/2026). `MesSessao.operacao` guarda o setor da vez e a rota já a grava
  // (`recurso.setor.codigo`) — mas ela não participava de nada. Cortar as 10 peças de uma marca na
  // PREPARAÇÃO fazia a MONTAGEM e a SOLDA enxergarem as mesmas 10 como já produzidas e recusarem o
  // primeiro apontamento delas. Cada etapa tem o seu próprio teto para a mesma marca.
  //
  // ⚠ Continua somando entre POSTOS da mesma etapa: dois operadores do Acabamento na mesma marca
  // dividem um teto só, que é o que a peça física permite.
  const irmas = await tx.mesSessao.findMany({
    where: { marca: sessao.marca, ...daObra, ambiente: sessao.ambiente, operacao: sessao.operacao ?? null },
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

/**
 * OS SALDOS DE VÁRIAS MARCAS ABERTAS, EM DUAS CONSULTAS — não em duas POR MARCA.
 *
 * ⚠⚠ O GET DO TOTEM CUSTAVA `4 + 3N` (levantado em 20/09/2026). Desde que o nesting abre a barra
 * inteira, um posto tem várias marcas abertas ao mesmo tempo, e cada uma disparava um `aggregate`
 * e as duas consultas de `saldoDaMarca`. A conta do regime que o Matheus pediu — ~30 terminais o
 * dia todo — é o que torna isso proibitivo, não o custo de uma tela.
 *
 * ⚠⚠ ISTO É PARA A LEITURA, NÃO PARA A GRAVAÇÃO. `saldoDaMarca` continua existindo e continua
 * sendo o que a trava do lançamento usa, DENTRO da transação com o advisory lock: lá a pergunta é
 * "cabe este lançamento agora", e ela tem de ser feita sobre o estado travado, uma marca por vez.
 * Aqui a pergunta é "o que mostro na tela", e um retrato de todas juntas serve.
 *
 * ⚠ O casamento das irmãs repete a regra de `saldoDaMarca` LINHA A LINHA (obra por `opId` quando
 * existe, senão por `opNumero`; mesmo `ambiente`) — em JS, sobre o que as duas consultas
 * trouxeram. Reescrever a regra em SQL daria duas definições de "a mesma marca da mesma obra", e a
 * que estivesse errada seria justamente a que o operador vê.
 *
 * @returns {Promise<Map<string, {planejado:number, boas:number, saldo:number|null, semTeto:boolean}>>}
 */
export async function saldosDasMarcas(tx, sessoes) {
  const contas = new Map();
  const semTeto = { planejado: 0, boas: 0, saldo: null, semTeto: true };
  const comTeto = (sessoes || []).filter((s) => (Number(s?.planejadoQtd) || 0) > 0 && s?.marca);
  for (const s of sessoes || []) contas.set(s.id, semTeto);
  if (!comTeto.length) return contas;

  const irmas = await tx.mesSessao.findMany({
    // ⚠ `operacao` aqui também — esta função repete a regra de `saldoDaMarca` linha a linha, e uma
    // divergência entre as duas viraria "a tela diz que cabe e a trava recusa".
    where: { OR: comTeto.map((s) => ({
      marca: s.marca, ambiente: s.ambiente, operacao: s.operacao ?? null,
      ...(s.opId ? { opId: s.opId } : { opNumero: s.opNumero }),
    })) },
    select: { id: true, marca: true, opId: true, opNumero: true, ambiente: true, operacao: true },
  });
  const somas = irmas.length
    ? await tx.mesApontamentoQtd.groupBy({
        by: ["sessaoId"], where: { sessaoId: { in: irmas.map((i) => i.id) } }, _sum: { boas: true },
      })
    : [];
  const porSessao = new Map(somas.map((x) => [x.sessaoId, x._sum.boas || 0]));

  for (const s of comTeto) {
    const planejado = Number(s.planejadoQtd) || 0;
    const boas = irmas
      .filter((i) => i.marca === s.marca && i.ambiente === s.ambiente
        && (i.operacao ?? null) === (s.operacao ?? null)
        && (s.opId ? i.opId === s.opId : i.opNumero === s.opNumero))
      .reduce((t, i) => t + (porSessao.get(i.id) || 0), 0);
    contas.set(s.id, { planejado, boas, saldo: Math.max(0, planejado - boas), semTeto: false });
  }
  return contas;
}
