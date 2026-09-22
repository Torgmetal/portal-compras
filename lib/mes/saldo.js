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

// ─── O TETO DA MARCA NAQUELA ETAPA ────────────────────────────────────────────────────────────
//
// ⚠⚠ `planejadoQtd` QUER DIZER COISAS DIFERENTES NOS DOIS CAMINHOS, e foi isso que bloqueou a
// segunda barra do nesting (achados do Codex, 22/09/2026, em três rodadas). No caminho MANUAL o
// número é o total da MARCA; no do NESTING é a quantidade daquela BARRA. Como o saldo soma as
// BOAS de todas as sessões irmãs, tomar o planejado de UMA sessão dava:
//   • barra 1 de 2 peças, produzida e encerrada pela tela;
//   • barra 2 abre sessão NOVA com planejado 2, e o saldo desconta as 2 da barra 1 → zero.
// Duas peças legítimas recusadas, e o mesmo em postos diferentes da mesma etapa.
//
// A saída é DERIVAR o teto, com as unidades do nesting como fonte da verdade e o total digitado
// preservado à parte (`planejadoManual`).

/** As chaves que definem "a mesma marca, na mesma etapa, no mesmo mundo". */
const daMesmaMarca = (s) => ({
  marca: s.marca,
  ...(s.opId ? { opId: s.opId } : { opNumero: s.opNumero }),
  ambiente: s.ambiente,
  operacao: s.operacao ?? null,
});

/** Identidade de grupo, para repartir resultados em lote sem misturar obra/etapa/ambiente. */
const chaveDoGrupo = (s) =>
  [s.ambiente, s.operacao ?? "", s.opId || `n:${s.opNumero || ""}`, s.marca].join("|");

/** O que a leitura precisa saber de cada irmã. */
const CAMPOS_IRMA = {
  id: true, marca: true, opId: true, opNumero: true, ambiente: true, operacao: true,
  planejadoQtd: true, planejadoManual: true, nestingUnidades: true,
};

/**
 * O TETO, COMPOSTO A PARTIR DAS IRMÃS.
 *
 * ⚠⚠ `Math.max` E NÃO SOMA quando existem os dois (parecer do Codex). O número digitado é o total
 * da marca e as barras são um recorte dele; somar inflaria o teto. O `max` significa "o maior
 * planejamento conhecido" — se o nesting trouxer MAIS do que o total digitado, é o nesting que
 * vale, e a divergência é assunto do PCP, não motivo para travar o operador.
 *
 * ⚠⚠ UNIDADE SEM ITEM NÃO É "SEM TETO" (parecer do Codex). Plano apagado, marca renomeada ou
 * reimportação podem fazer a soma voltar zero — e zero, hoje, quer dizer ILIMITADO. Referência
 * quebrada é coisa diferente de ausência de planejamento, e vira recusa, não liberdade.
 *
 * @returns {{planejado:number, semTeto:boolean, referenciaQuebrada:boolean}}
 */
export function comporTeto(irmas, somaDasUnidades) {
  const unidades = [...new Set(irmas.flatMap((i) => i.nestingUnidades || []))];
  // ⚠ Só sessões abertas à MÃO trazem total de marca. Uma sessão manual que DEPOIS recebe uma
  // barra continua contando aqui, porque o número mora em `planejadoManual` e não é tocado pelo
  // nesting — era o furo que o `filter(sem unidades)` deixava (parecer do Codex).
  const manual = Math.max(0, ...irmas.map((i) => Number(i.planejadoManual) || 0));
  if (!unidades.length) {
    return { planejado: manual, semTeto: manual <= 0, referenciaQuebrada: false };
  }
  const doNesting = Number(somaDasUnidades) || 0;
  if (doNesting <= 0) {
    return { planejado: manual, semTeto: false, referenciaQuebrada: manual <= 0 };
  }
  return { planejado: Math.max(manual, doNesting), semTeto: false, referenciaQuebrada: false };
}

/** Quantas peças desta marca as barras do nesting pedem, contando cada barra UMA vez. */
async function pecasDasUnidades(tx, unidades, sessao) {
  if (!unidades.length) return 0;
  // ⚠⚠ A OBRA ENTRA NO FILTRO (parecer do Codex): `MesNestingItem` também tem `opNumero`, e
  // unidade+marca não garante obra única — sem isto, a soma podia trazer item de outra obra.
  const r = await tx.mesNestingItem.aggregate({
    where: {
      unidadeId: { in: unidades }, marca: sessao.marca,
      ...(sessao.opNumero ? { opNumero: sessao.opNumero } : {}),
    },
    _sum: { qtd: true },
  });
  return Number(r?._sum?.qtd) || 0;
}

export async function saldoDaMarca(tx, sessao) {
  const semTeto = { planejado: 0, boas: 0, saldo: null, semTeto: true };
  // ⚠⚠ O ATALHO POR `planejadoQtd <= 0` SAIU (parecer do Codex, 22/09/2026). Uma sessão com zero
  // pode ter IRMÃS com teto válido — e era por esse atalho que a segunda barra escapava da conta.
  if (!sessao?.marca) return semTeto;

  // A mesma marca pode ter sido produzida em outras sessões (outro turno, outro posto do setor).
  // Sem `opId` a obra vem pelo número — é o que existe quando a marca foi bipada à mão. A regra
  // inteira mora em `daMesmaMarca`, para leitura e trava nunca discordarem.
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
  const irmas = await tx.mesSessao.findMany({ where: daMesmaMarca(sessao), select: CAMPOS_IRMA });
  const unidades = [...new Set(irmas.flatMap((i) => i.nestingUnidades || []))];
  const teto = comporTeto(irmas, await pecasDasUnidades(tx, unidades, sessao));
  if (teto.semTeto) return semTeto;

  const soma = await tx.mesApontamentoQtd.aggregate({
    where: { sessaoId: { in: irmas.map((s) => s.id) } },
    _sum: { boas: true },
  });
  const boas = soma?._sum?.boas || 0;
  return {
    planejado: teto.planejado, boas, saldo: Math.max(0, teto.planejado - boas),
    semTeto: false, referenciaQuebrada: teto.referenciaQuebrada,
  };
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
  // ⚠⚠ REFERÊNCIA QUEBRADA NÃO É "SEM TETO" (parecer do Codex, 22/09/2026). A sessão tem barra de
  // nesting, mas a barra não devolve item nenhum — plano apagado, marca renomeada, reimportação.
  // Zero, aqui, quer dizer ILIMITADO: sem esta recusa, o buraco no cadastro viraria licença para
  // lançar qualquer quantidade, e ninguém veria.
  if (conta.referenciaQuebrada) {
    return `Não achei o planejamento de ${marca} no plano de corte desta barra. `
      + "O plano pode ter sido apagado ou reimportado — chame quem cuida do PCP antes de lançar.";
  }
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
  // ⚠⚠ O FILTRO POR `planejadoQtd > 0` SAIU (parecer do Codex, 22/09/2026). Uma sessão com zero
  // pode ter IRMÃS com teto válido — a sessão de nesting, aliás, é sempre assim, porque lá o teto
  // vem das unidades e não do campo.
  const alvo = (sessoes || []).filter((s) => s?.marca);
  for (const s of sessoes || []) contas.set(s.id, semTeto);
  if (!alvo.length) return contas;

  const irmas = await tx.mesSessao.findMany({
    // ⚠ Repete `daMesmaMarca` linha a linha — leitura e trava nunca podem discordar, senão a tela
    // diz que cabe e o servidor recusa.
    where: { OR: alvo.map(daMesmaMarca) },
    select: CAMPOS_IRMA,
  });

  // ⚠⚠ REPARTE POR GRUPO (obra+marca+etapa+ambiente), NÃO POR MARCA (parecer do Codex): agrupar só
  // por marca misturaria contextos, e o teto de uma obra vazaria para a outra.
  const porGrupo = new Map();
  for (const i of irmas) {
    const k = chaveDoGrupo(i);
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k).push(i);
  }

  const unidades = [...new Set(irmas.flatMap((i) => i.nestingUnidades || []))];
  const [somas, itens] = await Promise.all([
    irmas.length
      ? tx.mesApontamentoQtd.groupBy({
          by: ["sessaoId"], where: { sessaoId: { in: irmas.map((i) => i.id) } }, _sum: { boas: true },
        })
      : [],
    // ⚠ UMA consulta para todas as barras de todas as marcas abertas no posto; a repartição é em
    // JS, por unidade, logo abaixo.
    unidades.length
      ? tx.mesNestingItem.groupBy({
          by: ["unidadeId", "marca", "opNumero"], where: { unidadeId: { in: unidades } }, _sum: { qtd: true },
        })
      : [],
  ]);
  const porSessao = new Map(somas.map((x) => [x.sessaoId, x._sum.boas || 0]));

  for (const s of alvo) {
    const grupo = porGrupo.get(chaveDoGrupo(s)) || [];
    const minhas = new Set(grupo.flatMap((i) => i.nestingUnidades || []));
    const doNesting = itens
      .filter((it) => minhas.has(it.unidadeId) && it.marca === s.marca
        && (!s.opNumero || !it.opNumero || it.opNumero === s.opNumero))
      .reduce((t, it) => t + (Number(it._sum.qtd) || 0), 0);
    const teto = comporTeto(grupo, doNesting);
    if (teto.semTeto) { contas.set(s.id, semTeto); continue; }
    const boas = grupo.reduce((t, i) => t + (porSessao.get(i.id) || 0), 0);
    contas.set(s.id, {
      planejado: teto.planejado, boas, saldo: Math.max(0, teto.planejado - boas),
      semTeto: false, referenciaQuebrada: teto.referenciaQuebrada,
    });
  }
  return contas;
}
