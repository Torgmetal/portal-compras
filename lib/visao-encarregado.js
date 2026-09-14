import { montarFilaOperador, temPrioridade } from "./fila-operador";

const MOTIVOS_PROGRAMACAO = new Set([
  "Aguardando programação do PCP",
  "Data não definida",
]);
const selecionar = (lote, itens, sufixo) => ({
  ...lote,
  id: `${lote.id}:${sufixo}`,
  itens,
  saldo: itens.reduce((s, i) => s + i.saldo, 0),
  saldoPrioritario: itens
    .filter(temPrioridade)
    .reduce((s, i) => s + i.saldo, 0),
});

/** Organiza a mesma fila do Gantt; não libera peças nem deduz disponibilidade de material. */
export function montarVisaoEncarregado(
  lotes,
  setor,
  recurso,
  hoje,
  recursos = [],
) {
  const fila = montarFilaOperador(lotes, setor, recurso, hoje);
  const aguardandoProgramacao = [],
    pendencias = [];
  for (const lote of fila.aguardando) {
    const programar = lote.itens.filter((i) =>
      MOTIVOS_PROGRAMACAO.has(i.motivo),
    );
    const bloqueadas = lote.itens.filter(
      (i) => !MOTIVOS_PROGRAMACAO.has(i.motivo),
    );
    if (programar.length)
      aguardandoProgramacao.push(selecionar(lote, programar, "programar"));
    if (bloqueadas.length)
      pendencias.push(selecionar(lote, bloqueadas, "pendencia"));
  }
  const todosRecursos = [
    ...new Set([
      ...recursos,
      ...Object.values(fila)
        .flat()
        .map((l) => l.recurso)
        .filter(Boolean),
      ...(recurso ? [recurso] : []),
    ]),
  ]
    .filter((r) => !recurso || r === recurso)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const postos = [],
    semTrabalho = [];
  for (const r of todosRecursos) {
    const agora = fila.hoje.filter((l) => l.recurso === r);
    const posto = {
      recurso: r,
      agora,
      proximo: fila.proximos.find((l) => l.recurso === r) || null,
      pendencias: pendencias.filter((l) => l.recurso === r),
      aguardandoProgramacao: aguardandoProgramacao.filter(
        (l) => l.recurso === r,
      ),
    };
    if (agora.length) postos.push(posto);
    else semTrabalho.push(posto);
  }
  // Preserva a ordem de prioridade/datas da fila, sem comparar números entre OPs.
  postos.sort(
    (a, b) => fila.hoje.indexOf(a.agora[0]) - fila.hoje.indexOf(b.agora[0]),
  );
  const limite = /^\d{4}-\d{2}-\d{2}$/.test(hoje)
    ? new Date(`${hoje}T12:00:00Z`)
    : null;
  if (limite) limite.setUTCDate(limite.getUTCDate() + 6);
  const ate = limite ? limite.toISOString().slice(0, 10) : "";
  return {
    postos,
    semTrabalho,
    aguardandoProgramacao,
    pendencias,
    proximos: fila.proximos.filter((l) => l.dia <= ate),
    maisAdiante: fila.proximos.filter((l) => l.dia > ate),
    prioritarias: fila.hoje.reduce((s, l) => s + l.saldoPrioritario, 0),
  };
}
