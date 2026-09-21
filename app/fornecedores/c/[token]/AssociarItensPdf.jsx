"use client";

/**
 * OS ITENS LIDOS DO PDF QUE NÃO ACHARAM LINHA — para o fornecedor APONTAR qual é qual.
 *
 * ⚠⚠ NASCEU DE UM CASO REAL (SOUFER, RM T122-001, 21/09/2026). O PDF foi lido certo — 9 itens,
 * preços, ICMS 12%, IPI 0% — e o casamento automático acertou ZERO de 9: o fornecedor escreve
 * "FERRO CANT. 2 X 3/16 6MT." e a RM diz "CANTONEIRA ACO CARBONO LAMINADA A-36 DN. 3/16 X 2POL".
 * Palavras diferentes para a mesma peça. O portal então mandava redigitar 27 campos, com os 9
 * preços já na memória. Ele anexou o PDF e foi embora; a cotação ficou "Aguardando" para sempre.
 *
 * ⚠⚠ QUEM APONTA É O FORNECEDOR, E ISSO É A SEGURANÇA DA TELA. Casar sozinho com pouca evidência
 * põe preço errado no item errado do pedido — e isso ninguém percebe, ao contrário de não casar.
 * Ele sabe o que cotou; o portal, não.
 *
 * ⚠ Uma linha da RM só aparece nas opções enquanto estiver LIVRE (sem preço e sem "Não tenho").
 * Oferecer uma linha já preenchida convidaria a sobrescrever em silêncio o que ele acabou de
 * digitar.
 *
 * @param {{ sobras: object[], linhas: object[], onAssociar: (itPdf:object, linhaId:string) => void }} props
 */
export default function AssociarItensPdf({ sobras, linhas, onAssociar }) {
  if (!sobras?.length) return null;

  const livres = linhas.filter((l) => !l.semEstoque && !String(l.precoUnit ?? "").trim());
  const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        Lemos {sobras.length} {sobras.length === 1 ? "item" : "itens"} no seu PDF que não conseguimos
        encaixar sozinhos
      </p>
      <p className="text-[11px] text-amber-800 mt-0.5">
        Os valores já estão aqui — escolha a que item da lista cada um corresponde e o preço entra
        sozinho. Se algum não fizer parte desta cotação, é só deixar sem escolher.
      </p>

      {livres.length === 0 ? (
        <p className="text-xs text-amber-900 mt-2">
          Todas as linhas já estão preenchidas. Se algum valor ficou no item errado, corrija direto
          na tabela abaixo.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sobras.map((it, i) => (
            <li key={`${it.descricao}-${i}`} className="flex flex-wrap items-center gap-2 bg-white rounded border border-amber-200 px-2.5 py-2">
              <span className="min-w-0 flex-1 text-xs text-torg-dark">
                <strong className="font-semibold">{it.descricao || "Item sem descrição"}</strong>
                <span className="block text-[11px] text-torg-gray">
                  {moeda(it.precoUnit)}
                  {it.qtd ? ` · ${it.qtd} ${it.unidade || ""}`.trimEnd() : ""}
                  {it.icmsPct != null ? ` · ICMS ${it.icmsPct}%` : ""}
                  {it.ipiPct != null ? ` · IPI ${it.ipiPct}%` : ""}
                </span>
              </span>
              <select
                defaultValue=""
                aria-label={`Item da lista para ${it.descricao || "este item do PDF"}`}
                onChange={(e) => onAssociar(it, e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs max-w-[22rem] focus:ring-2 focus:ring-torg-blue"
              >
                <option value="">Escolha o item da lista…</option>
                {livres.map((l, idx) => (
                  <option key={l.id} value={l.id}>
                    {idx + 1}. {l.descricao}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
