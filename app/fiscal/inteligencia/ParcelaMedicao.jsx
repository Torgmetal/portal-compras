"use client";
// ─── A PARCELA DA MEDIÇÃO ────────────────────────────────────────────────────
//
// Matheus (26/09/2026): *"selecionar as medições/medições parciais para ver como deveria ser cada
// imposto seguindo a regra do NCM da medição e o CFOP"*. Parcial = parte da medição: marcar os itens
// e as quantidades que vão nesta nota. O servidor recalcula tudo (lib/fiscal/parcela.js) — a tela só
// mostra o valor da parcela para quem está marcando.
//
// ⚠ `itens` são os da medição INTEIRA (guardados na primeira auditoria): auditar uma parcela não pode
// encolher a lista de onde se escolhe a próxima.
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (v) => (v == null ? "—" : `${String(v).replace(".", ",")}%`);
const qtdTxt = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));
const numero = (s) => Number(String(s ?? "").replace(/\./g, "").replace(",", "."));

export default function ParcelaMedicao({ itens, carregando, onAuditar, esperados, totais }) {
  const [sel, setSel] = useState({});
  useEffect(() => {
    setSel(Object.fromEntries((itens ?? []).map((i) => [i.item, { marcado: true, qtd: String(i.quantidade ?? "") }])));
  }, [itens]);

  const linhas = useMemo(() => (itens ?? []).map((i) => {
    const s = sel[i.item] ?? { marcado: false, qtd: "" };
    const q = numero(s.qtd);
    const valida = s.marcado ? q > 0 && q <= (i.quantidade ?? 0) : true;
    const valorParcela = s.marcado && q > 0 && i.quantidade ? (i.valor * q) / i.quantidade : null;
    return { ...i, marcado: s.marcado, qtd: s.qtd, q, valida, valorParcela };
  }), [itens, sel]);

  const marcadas = linhas.filter((l) => l.marcado);
  const invalida = marcadas.length === 0 || marcadas.some((l) => !l.valida);
  const totalParcela = marcadas.reduce((s, l) => s + (l.valorParcela ?? 0), 0);
  const troca = (item, parte) => setSel((m) => ({ ...m, [item]: { ...m[item], ...parte } }));

  return (
    <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Parcela — marque os itens e as quantidades desta nota</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/60 text-torg-gray">
            <tr><th className="px-2 py-2" /><th className="px-2 py-2 text-left">Item</th><th className="px-2 py-2 text-left">NCM</th>
              <th className="px-2 py-2 text-left">CFOP</th><th className="px-2 py-2 text-right">No pedido</th>
              <th className="px-2 py-2 text-right">Nesta parcela</th><th className="px-2 py-2 text-right">Valor da parcela</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((l) => (
              <tr key={l.item} className={l.marcado ? undefined : "text-gray-400"}>
                <td className="px-2 py-2"><input type="checkbox" aria-label={`Incluir item ${l.item}`} checked={l.marcado} onChange={(e) => troca(l.item, { marcado: e.target.checked })} /></td>
                <td className="px-2 py-2">{l.item}. {l.descricao}</td>
                <td className="px-2 py-2 font-mono">{l.ncm || l.ncmDaDescricao || "—"}</td>
                <td className="px-2 py-2 font-mono">{l.cfop || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{qtdTxt(l.quantidade)}</td>
                <td className="px-2 py-2 text-right">
                  <input aria-label={`Quantidade do item ${l.item}`} disabled={!l.marcado} value={l.qtd}
                    onChange={(e) => troca(l.item, { qtd: e.target.value })}
                    className={`w-24 rounded border px-2 py-1 text-right tabular-nums ${l.valida ? "border-gray-200" : "border-red-400 bg-red-50"}`} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{brl(l.valorParcela)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold text-torg-dark"><td colSpan={6} className="px-2 py-2">Total da parcela</td>
            <td className="px-2 py-2 text-right tabular-nums">{brl(totalParcela)}</td></tr></tfoot>
        </table>
      </div>
      {marcadas.some((l) => !l.valida) && (
        <p role="alert" className="text-xs text-red-600">Quantidade precisa ser maior que zero e no máximo a do pedido.</p>
      )}
      <button type="button" disabled={invalida || carregando}
        onClick={() => onAuditar(marcadas.map((l) => ({ item: l.item, quantidade: l.q })))}
        className="flex items-center gap-1.5 rounded-lg bg-torg-blue px-4 py-2 text-sm font-medium text-white hover:bg-torg-blue/90 disabled:opacity-50">
        {carregando && <Loader2 size={14} className="animate-spin" />} Auditar parcela
      </button>

      {esperados && <ComoDeveriaSer esperados={esperados} totais={totais} itens={itens} />}
    </div>
  );
}

/** Por item: o que a regra diz × o que está no pedido. ⚠ IPI e ICMS são os únicos que o pedido traz. */
function ComoDeveriaSer({ esperados, totais, itens }) {
  const noPedido = (e, tributo) => {
    const g = tributo === "IPI" ? e.noPedido?.ipi : tributo === "ICMS" ? e.noPedido?.icms : undefined;
    return g === undefined ? null : g ? pct(g.aliquota) : "—";
  };
  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-torg-gray">Como cada imposto deveria sair</p>
      {esperados.map((e) => {
        const it = (itens ?? []).find((i) => i.item === e.item);
        return (
          <div key={e.item} className="overflow-x-auto rounded-lg border border-gray-100">
            <p className="bg-gray-50/60 px-3 py-1.5 text-xs font-medium text-torg-dark">
              Item {e.item}{it ? ` · ${it.descricao ?? ""}` : ""}{e.receitaCasada ? ` · receita da obra: ${e.receitaCasada}` : " · sem linha de receita da obra com este CFOP"}
            </p>
            <table className="w-full text-xs">
              <thead className="text-torg-gray"><tr><th className="px-3 py-1.5 text-left">Tributo</th>
                <th className="px-3 py-1.5 text-right">Deveria ser</th><th className="px-3 py-1.5 text-right">No pedido</th>
                <th className="px-3 py-1.5 text-right">Valor</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {e.linhas.map((l) => {
                  const deveria = l.regra ?? l.cadastrado;
                  const ped = noPedido(e, l.tributo);
                  const diverge = l.divergente || (ped != null && ped !== "—" && deveria != null && ped !== pct(deveria));
                  return (
                    <tr key={l.tributo} className={diverge ? "bg-amber-50" : undefined}>
                      <td className="px-3 py-1.5 font-medium text-torg-dark">
                        {l.tributo}{diverge && <AlertTriangle size={11} className="ml-1 inline text-amber-600" aria-label="diverge" />}
                        {l.nota && <span className="block font-normal text-torg-gray">{l.nota}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pct(deveria)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{ped ?? ""}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{brl(l.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {totais && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-torg-dark">
          <span className="font-semibold">Total da parcela por tributo: </span>
          {totais.map((t) => `${t.tributo} ${brl(t.valor)}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
