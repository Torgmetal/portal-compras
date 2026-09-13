const n = (v) => Math.max(0, Number(v) || 0);
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
      grupos[destino].push({ ...i, saldo, motivo });
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
        } else t.itens.push({ ...i });
      }
    }
    fila[tipo] = [...trabalhos.values()];
  }
  // Mesmo dia conserva a ordem recebida da programação; não inventa prioridade.
  for (const lista of Object.values(fila))
    lista.sort((a, b) =>
      String(a.dia || "9999").localeCompare(String(b.dia || "9999")),
    );
  return fila;
}
