// ─── O QUE PODE SER RECOMENDADO ──────────────────────────────────────────────
//
// Recebe as regras (do catálogo, que vem do código) e as decisões (do registro, que vem da
// contabilidade) e responde uma coisa só: **esta regra pode orientar uma emissão agora?**
//
// ⚠ Puro de propósito: nada de Prisma aqui dentro. Quem lê o banco é `validacao-regras.js`; quem
// decide é isto, e é isto que o teste cobre.

/** ⚠ Ninguém termina uma ressalva com ponto. Sem isto a frase saía "…CONFAZ Enquanto isso…". */
const frase = (t) => `${String(t).trim().replace(/[.;,\s]+$/, "")}.`;

export const SITUACAO = {
  /** Ninguém da contabilidade conferiu ainda. ⚠ É o estado de TODAS as regras hoje. */
  PENDENTE: "PENDENTE",
  VALIDADA: "VALIDADA",
  /** Foi validada, e o conteúdo mudou depois. A conferência antiga não vale para o texto novo. */
  ALTERADA: "ALTERADA",
  /** ⚠⚠ A contabilidade disse que está errada. Bloqueia. */
  CONTESTADA: "CONTESTADA",
  /** ⚠⚠ Não deu para ler o registro. Bloqueia — ver o comentário abaixo. */
  INDISPONIVEL: "INDISPONIVEL",
};

/**
 * ⚠⚠ PENDENTE **NÃO** BLOQUEIA, E ISSO É UMA DECISÃO, NÃO UM DESCUIDO. Hoje as 26+ regras estão
 * todas sem conferência: bloquear o pendente desligaria o módulo inteiro no dia em que subisse, e
 * o portal deixaria de ajudar justamente quem ele existe para ajudar. O que muda é a HONESTIDADE —
 * o pendente passa a aparecer na tela como "não conferida pela contabilidade", em vez de ser um
 * `validado: false` que só o código sabia.
 *
 * ⚠⚠ CONTESTADA BLOQUEIA MESMO COM O CONTEÚDO ALTERADO (parecer do Codex, 23/09/2026). Se editar o
 * texto transformasse uma contestação em "pendente utilizável", qualquer ajuste de vírgula
 * apagaria o alerta de quem disse que a regra está errada. A contestação só sai por decisão
 * explícita sobre a versão nova.
 *
 * ⚠⚠ E FALHA DE LEITURA BLOQUEIA. É o inverso do que fiz o dia todo ("erro não é ausência"), e
 * aqui o inverso é que protege: não conseguir ler se algo foi CONTESTADO e recomendar assim mesmo
 * é arriscar repetir uma orientação que alguém já marcou como errada. A tela diz que está
 * suspenso, não que está tudo bem.
 */
export function situacaoDaRegra(regra, decisao, { disponivel = true } = {}) {
  // ⚠ O TÍTULO VIAJA JUNTO porque é ele que aparece no alerta. Sem ele, a mensagem começava com o
  // id interno ("cfop:5101: A contabilidade contestou…") — identificador de banco na cara de quem
  // só quer saber qual operação parou.
  const base = { id: regra.id, titulo: regra.titulo ?? regra.id };
  if (!disponivel) {
    return { ...base, situacao: SITUACAO.INDISPONIVEL, bloqueada: true,
      motivo: "Não foi possível ler o registro de validação das regras — a orientação está suspensa até a verificação voltar." };
  }
  if (!decisao) {
    return { ...base, situacao: SITUACAO.PENDENTE, bloqueada: false,
      motivo: "Este verbete ainda não foi conferido pela contabilidade contra a fonte oficial." };
  }
  if (decisao.estado === SITUACAO.CONTESTADA) {
    return { ...base, situacao: SITUACAO.CONTESTADA, bloqueada: true,
      por: decisao.porNome ?? null, em: decisao.em ?? null, ressalva: decisao.ressalva ?? null,
      motivo: `A contabilidade contestou este verbete${decisao.ressalva ? `: ${frase(decisao.ressalva)}` : "."} Enquanto isso não for resolvido, o portal não orienta por ele.` };
  }
  if (decisao.impressao !== regra.impressao) {
    return { ...base, situacao: SITUACAO.ALTERADA, bloqueada: false,
      por: decisao.porNome ?? null, em: decisao.em ?? null,
      motivo: `Conferido por ${decisao.porNome ?? "—"}, mas o conteúdo do verbete mudou depois — a conferência antiga não vale para o texto atual.` };
  }
  return { ...base, situacao: SITUACAO.VALIDADA, bloqueada: false,
    por: decisao.porNome ?? null, em: decisao.em ?? null, fonte: decisao.fonte ?? null, ressalva: decisao.ressalva ?? null,
    motivo: `Conferido por ${decisao.porNome ?? "—"}${decisao.fonte ? ` contra ${decisao.fonte}` : ""}.` };
}

/**
 * A situação de um CONJUNTO de regras — é assim que os consumidores perguntam.
 *
 * ⚠⚠ APROVAR O CFOP NÃO APROVA O CST NEM A CADEIA (parecer do Codex). Um resultado do simulador
 * depende de VÁRIAS regras: o verbete do CFOP, o cenário de CST da família, às vezes a etapa da
 * cadeia. Basta UMA bloqueada para o resultado não poder ser copiado — e o motivo tem que dizer
 * QUAL delas, senão quem lê não sabe o que resolver.
 */
export function situacaoDoConjunto(situacoes) {
  const lista = situacoes.filter(Boolean);
  const bloqueiam = lista.filter((s) => s.bloqueada);
  return {
    regras: lista,
    bloqueada: bloqueiam.length > 0,
    bloqueiam,
    motivo: bloqueiam.length ? bloqueiam.map((s) => `${s.titulo ?? s.id} — ${s.motivo}`).join(" ") : null,
    // ⚠ "Tudo conferido" só quando TODAS estão validadas — uma pendente no meio já derruba a frase.
    todasValidadas: lista.length > 0 && lista.every((s) => s.situacao === SITUACAO.VALIDADA),
    pendentes: lista.filter((s) => s.situacao === SITUACAO.PENDENTE).length,
    alteradas: lista.filter((s) => s.situacao === SITUACAO.ALTERADA).length,
  };
}
