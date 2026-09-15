import "server-only";

// ─── A TRILHA DA PASSAGEM DE POSTO ───────────────────────────────────────────
//
// ⚠⚠ O `motivoFim` DA PRESENÇA NÃO BASTA (achado do Codex, 14/09/2026). Ele guarda o nome de quem
// ASSUMIU — não diz quem mandou render, nem por qual dos dois caminhos, nem qual vínculo morreu.
// Sem autoria estruturada, "quem passou o posto do Jurandir às 14h30" não tem resposta: as
// presenças respondem quem estava REGISTRADO no posto, e só isso.
//
// ⚠ NÃO É EVENTO DE PRODUÇÃO. Passar o posto não muda o que a máquina está fazendo, e gravar um
// `MesEvento` aqui inventaria uma transição que ninguém viveu. Auditoria é o lugar certo.

/**
 * O que fica gravado da passagem.
 *
 * ⚠ `JSON.parse(JSON.stringify())` some com os `undefined` num golpe só — a alternativa era uma
 * fileira de `|| null` que não diz nada e ainda estoura o teto de complexidade.
 */
const diffDaPassagem = (r, { modo, recurso, de, para }) => JSON.parse(JSON.stringify({
  modo,
  recurso: recurso?.codigo,
  deOperadorId: de?.id,
  paraOperadorId: para?.id,
  saiu: r.saiu,
  assumiu: r.assumiu,
  vinculoEncerrado: r.vinculoEncerrado,
  vinculoAtivo: r.presenca?.id,
  marcasQueSeguemAbertas: r.marcasQueSeguemAbertas,
}));

/**
 * Grava o carimbo DENTRO da transação da passagem.
 *
 * ⚠⚠ AQUI A AUDITORIA É FATAL, AO CONTRÁRIO DO RESTO DO MES — e a inversão é deliberada (achado do
 * Codex, 14/09/2026). A primeira versão gravava depois da transação, com `.catch(() => {})`: a
 * passagem podia acontecer sem deixar rastro, e o reenvio (`jaEstava`) não recuperava o carimbo
 * perdido. Como a passagem é um ato de RESPONSABILIDADE — quem responde pelo posto a partir de
 * agora —, passagem sem trilha derrota o motivo deste módulo existir.
 *
 * ⚠ O CLAUDE.md manda o oposto para bookkeeping ("falha de log nunca aborta a escrita de verdade"),
 * e aquilo continua valendo onde nasceu: escrita EM MASSA, onde o log é volumoso e a compute do
 * Neon satura. Isto é UM insert pequeno numa operação pontual. Se ele falhar, a transação volta
 * atrás e o operador toca de novo — barato, e melhor que um posto trocado sem dono registrado.
 */
export async function carimbarNaTx(tx, resultado, contexto) {
  if (!contexto || resultado?.erro || resultado?.jaEstava) return resultado;
  const { usuario, recurso } = contexto;
  await tx.auditLog.create({
    data: {
      userId: usuario?.id ?? null,
      action: "MES_PASSAR_POSTO",
      entity: "MesPresenca",
      entityId: resultado.vinculoEncerrado ?? recurso?.id ?? "—",
      diff: diffDaPassagem(resultado, contexto),
    },
  });
  return resultado;
}
