// A célula "Prazo de entrega" da lista de pedidos da OP (Matheus, 02/10/2026): a mesma data e a
// mesma situação de Compras › Prazos das RMs, calculadas em `lib/prazo-do-pedido`.
//
// ⚠ A data chega como "aaaa-mm-dd" e é montada à mão: `new Date("2026-10-15")` é meia-noite UTC, que
// em São Paulo ainda é o dia 14 — a coluna mostraria um dia antes de Prazos das RMs.

const fmtDia = (iso) => {
  const [a, m, d] = String(iso).split("-");
  return `${d}/${m}/${a}`;
};
const dias = (n) => `${n} dia${n === 1 ? "" : "s"}`;

/** A frase curta e a cor de cada situação — as cores são as dos chips de Prazos das RMs. */
function legenda({ situacao, diasAte, porEncerramento }) {
  const atraso = diasAte != null && diasAte < 0 ? -diasAte : null;
  switch (situacao) {
    case "ATRASADO": return { txt: `${dias(atraso)} de atraso`, cls: "text-red-600 font-semibold" };
    case "VENCE_HOJE": return { txt: "vence hoje", cls: "text-orange-600 font-semibold" };
    case "PROXIMO": return { txt: `em ${dias(diasAte)}`, cls: "text-amber-700" };
    case "NO_PRAZO": return { txt: `em ${dias(diasAte)}`, cls: "text-sky-700" };
    case "PARCIAL": return { txt: atraso ? `parcial · ${dias(atraso)} de atraso no restante` : "parcial", cls: "text-violet-700" };
    // ⚠ a mesma procedência que Prazos das RMs escreve: o carimbo veio do comprador, não da NF
    case "CHEGOU": return { txt: porEncerramento ? "chegou · encerrado no Omie" : "chegou", cls: "text-emerald-700" };
    default: return null;
  }
}

export default function PrazoEntregaCelula({ prazo }) {
  if (!prazo?.previsao) return <span className="text-torg-gray">—</span>;
  const l = legenda(prazo);
  return (
    <span className="whitespace-nowrap">
      <span className="tabular-nums text-torg-dark">{fmtDia(prazo.previsao)}</span>
      {l && <span className={`block text-[10px] ${l.cls}`}>{l.txt}</span>}
    </span>
  );
}
