// As escritas de um PATCH de tarefa de cronograma, montadas como uma lista de
// operações para uma transação só.
//
// ⚠ POR QUE É UMA LISTA, e não três `await` seguidos: a tarefa, o AuditLog, o
// registro da justificativa e a revisão do baseline têm de entrar ou não entrar
// JUNTOS. Uma tarefa que muda sem a revisão correspondente é um cronograma com
// baseline que ninguém consegue auditar depois.
//
// ⚠ A REVISÃO SÓ EXISTE COM BASELINE. Antes de `dataBase`, o cronograma ainda está
// sendo montado — registrar "fim alterado" a cada ajuste do rascunho encheria o
// histórico de ruído e esconderia a primeira mudança que de fato importa.

/**
 * @param {object} prisma  o client, injetado — é o que deixa testar sem banco
 * @returns {Array} operações prontas pro `prisma.$transaction`
 */
export function montarOperacoesDoPatch(prisma, { id, data, diffAntes, diffDepois, tarefa, userId, justificativa }) {
  const ops = [
    prisma.cronogramaTarefa.update({ where: { id }, data }),
    prisma.auditLog.create({
      data: {
        userId: userId,
        action: "UPDATE_CRONOGRAMA_TAREFA",
        entity: "CronogramaTarefa",
        entityId: id,
        diff: { antes: { percentualRealizado: tarefa.percentualRealizado, observacao: tarefa.observacao }, depois: data },
      },
    }),
  ];

  if (justificativa) {
    ops.push(
      prisma.cronogramaRegistro.create({
        data: {
          tarefaId: id,
          descricao: justificativa,
          createdById: userId,
        },
      })
    );
  }

  // Se cronograma tem baseline e houve alteracao de datas/progresso, gera revisao
  if (tarefa.cronograma.dataBase && Object.keys(diffDepois).length > 0) {
    const partes = [];
    if (diffDepois.percentualRealizado !== undefined) {
      partes.push(`progresso ${diffAntes.percentualRealizado}% → ${diffDepois.percentualRealizado}%`);
    }
    if (diffDepois.dataInicioPrevista !== undefined) {
      partes.push(`início alterado`);
    }
    if (diffDepois.dataFimPrevista !== undefined) {
      partes.push(`fim alterado`);
    }
    if (diffDepois.antecessoraIds !== undefined) {
      partes.push(`antecessoras alteradas`);
    }

    if (partes.length > 0) {
      // Usa tipo DATA_ALTERADA quando datas mudaram, senao TAREFA_ALTERADA
      const tipoRevisao = (diffDepois.dataInicioPrevista !== undefined || diffDepois.dataFimPrevista !== undefined)
        ? "DATA_ALTERADA"
        : "TAREFA_ALTERADA";
      const descJust = justificativa ? ` — Motivo: ${justificativa}` : "";
      ops.push(
        prisma.cronogramaRevisao.create({
          data: {
            cronogramaId: tarefa.cronograma.id,
            tipo: tipoRevisao,
            descricao: `${tarefa.nome}: ${partes.join(", ")}${descJust}`,
            diff: { tarefa: tarefa.nome, antes: diffAntes, depois: diffDepois, justificativa: justificativa || null },
            createdById: userId,
          },
        })
      );
    }
  }

  return ops;
}
