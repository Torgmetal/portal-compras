const n = (v) => Math.max(0, Number(v) || 0);
export const temPrioridade = (i) => Number.isFinite(i.prioridade);
export function montarFilaOperador(lotes, setor, recurso, hoje) {
  const fila = { hoje: [], proximos: [], aguardando: [] };
  for (const l of lotes || []) {
    if (l.setor !== setor || (recurso && l.recurso !== recurso)) continue;
    const grupos = { hoje: [], proximos: [], aguardando: [] };
    for (const i of l.itens || []) {
      const saldo = Math.max(0, n(i.q) - n(i.f));
      if (!saldo) continue;
      const motivo =
        i.impedimento ||
        (l.terceiroPrevisto
          ? "Aguardando retorno do terceiro"
          : l.setor === "MONTAGEM" &&
              !l.terceiroRecebido &&
              i.prontidao?.pronto !== true
            ? i.prontidao?.motivo || "Conferir liberação da montagem"
            : l.fila || !l.recurso
              ? "Aguardando programação do PCP"
              : !l.dia
                ? "Data não definida"
                : null);
      const destino = motivo
        ? "aguardando"
        : l.dia > hoje && !(l.veioDe && l.veioDe <= hoje)
          ? "proximos"
          : "hoje";
      grupos[destino].push({
        ...i,
        saldo,
        motivo,
        faixas: [
          {
            id: i.id,
            inicio: (i.inicioUnidade || 0) + n(i.f),
            quantidade: saldo,
            qTotal: i.qTotal || i.q,
            diaOrigem: l.veioDe || l.dia,
            recursoOrigem: l.recurso,
          },
        ],
      });
    }
    for (const [tipo, itens] of Object.entries(grupos))
      if (itens.length)
        fila[tipo].push({
          ...l,
          id: `${l.id}:${tipo}`,
          itens,
          saldo: itens.reduce((a, i) => a + i.saldo, 0),
        });
  }
  // A tela do operador agrupa as frações de dias vencidos da mesma OP e posto.
  // Não altera a programação: apenas soma faixas disjuntas que o Gantt já expandiu.
  for (const tipo of Object.keys(fila)) {
    const trabalhos = new Map();
    for (const l of fila[tipo]) {
      const chave = [
        l.setor,
        l.recurso || "",
        l.op,
        tipo === "proximos" ? l.dia : "",
      ].join("|");
      if (!trabalhos.has(chave))
        trabalhos.set(chave, { ...l, itens: [], saldo: 0 });
      const t = trabalhos.get(chave);
      t.saldo += l.saldo;
      for (const i of l.itens) {
        const anterior = t.itens.find(
          (p) => p.id === i.id && p.motivo === i.motivo,
        );
        if (anterior) {
          anterior.q = n(anterior.q) + n(i.q);
          anterior.f = n(anterior.f) + n(i.f);
          anterior.saldo += i.saldo;
          anterior.faixas.push(...i.faixas);
        } else t.itens.push({ ...i });
      }
    }
    fila[tipo] = [...trabalhos.values()];
    for (const t of fila[tipo]) {
      t.saldoPrioritario = t.itens
        .filter(temPrioridade)
        .reduce((s, i) => s + i.saldo, 0);
      // O número só é comparável dentro da mesma OP.
      t.itens.sort(
        (a, b) =>
          Number(temPrioridade(b)) - Number(temPrioridade(a)) ||
          (temPrioridade(a) && temPrioridade(b)
            ? a.prioridade - b.prioridade
            : 0),
      );
    }
  }
  for (const [tipo, lista] of Object.entries(fila))
    lista.sort((a, b) => {
      const dia = String(a.dia || "9999").localeCompare(
        String(b.dia || "9999"),
      );
      const prioridade =
        Number(b.saldoPrioritario > 0) - Number(a.saldoPrioritario > 0);
      // Prioridade não antecipa datas futuras nem muda a situação de uma peça.
      return tipo === "proximos" ? dia || prioridade : prioridade || dia;
    });
  return fila;
}

/** Atualização visual após o servidor confirmar; mantém as frações concluídas. */
export function aplicarRemanejoNaFila(lotes, trabalho, recurso, dia) {
  const faixas = trabalho.itens.flatMap((i) => i.faixas);
  const movidos = [];
  const restantes = lotes
    .map((l) => {
      if (l.setor !== trabalho.setor || l.recurso !== trabalho.recurso)
        return l;
      const itens = l.itens.flatMap((i) => {
        const f = faixas.find(
          (f) =>
            f.id === i.id &&
            f.diaOrigem === (l.veioDe || l.dia) &&
            f.inicio === (i.inicioUnidade || 0) + n(i.f) &&
            f.quantidade === n(i.q) - n(i.f),
        );
        if (!f) return [i];
        movidos.push({ ...i, inicioUnidade: f.inicio, q: f.quantidade, f: 0 });
        return n(i.f) ? [{ ...i, q: n(i.f) }] : [];
      });
      return { ...l, itens };
    })
    .filter((l) => l.itens.length);
  return [
    ...restantes,
    {
      id: `remanejo:${trabalho.id}:${recurso}:${dia}`,
      op: trabalho.op,
      opId: trabalho.opId,
      obra: trabalho.obra,
      setor: trabalho.setor,
      recurso,
      dia,
      itens: movidos,
    },
  ];
}
