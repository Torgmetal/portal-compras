import { moverFaixa } from "./gantt-distribuicao";

function faixasProduzidas(partes, feito) {
  let saldo = feito;
  return [...partes]
    .sort(
      (a, b) =>
        (a.dia || "9999").localeCompare(b.dia || "9999") || a.inicio - b.inicio,
    )
    .flatMap((p) => {
      const quantidade = Math.min(saldo, p.quantidade);
      saldo -= quantidade;
      return quantidade ? [{ ...p, quantidade }] : [];
    });
}
const sobrepoe = (a, b) =>
  a.inicio < b.inicio + b.quantidade && b.inicio < a.inicio + a.quantidade;
/** Conferido novamente dentro da transação, usando a produção e programação atuais. */
export function conferirRemanejoSaldo(partes, feito, faixas, destino, total) {
  const produzidas = faixasProduzidas(partes, feito);
  let novas = partes;
  for (const [i, f] of faixas.entries()) {
    if (f.qTotal !== total)
      throw new Error("Quantidade da peça alterada. Atualize a fila.");
    if (faixas.slice(0, i).some((a) => sobrepoe(a, f)))
      throw new Error("Faixas repetidas na seleção.");
    if (produzidas.some((p) => sobrepoe(p, f)))
      throw new Error("A seleção contém peças já produzidas. Atualize a fila.");
    const cobertura = partes
      .filter((p) => p.dia === f.diaOrigem && p.recurso === f.recursoOrigem)
      .reduce(
        (s, p) =>
          s +
          Math.max(
            0,
            Math.min(p.inicio + p.quantidade, f.inicio + f.quantidade) -
              Math.max(p.inicio, f.inicio),
          ),
        0,
      );
    if (cobertura !== f.quantidade)
      throw new Error(
        "A programação mudou desde que você abriu a fila. Atualize e confira a bancada.",
      );
    novas = moverFaixa(novas, { ...f, ...destino }, total);
  }
  const assinatura = (lista) =>
    JSON.stringify(
      lista
        .sort((a, b) => a.inicio - b.inicio)
        .map((p) => [p.inicio, p.quantidade, p.dia, p.recurso]),
    );
  if (assinatura(produzidas) !== assinatura(faixasProduzidas(novas, feito)))
    throw new Error(
      "Essa data alteraria o histórico do que já foi produzido. Escolha uma data posterior.",
    );
}
