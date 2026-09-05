"use client";
import { fmtKg, fmtR$ } from "../_lib/formatos";

export const Inp = (p) => <input {...p} className={`border border-gray-200 rounded px-2 py-1 text-[12px] ${p.className || ""}`} />;

/** ⚠ `rotulos` mostra texto de gente sem mexer no VALOR — que é a chave que a planilha compara. */
export const Sel = ({ opcoes, rotulos, ...p }) => (
  <select {...p} className={`border border-gray-200 rounded px-2 py-1 text-[12px] bg-white ${p.className || ""}`}>
    <option value="">—</option>
    {opcoes.map((o) => <option key={o} value={o}>{rotulos?.[o] || o}</option>)}
  </select>
);

export const Bloco = ({ titulo, nota, children }) => (
  <div>
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-torg-blue">{titulo}</p>
      {nota && <p className="text-[10px] text-torg-gray">{nota}</p>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>
  </div>
);

export const Campo = ({ r, ajuda, children }) => (
  <label className="block min-w-0">
    <span className="block text-[11px] font-semibold text-torg-dark mb-1 truncate">{r}</span>
    {children}
    {ajuda && <span className="block text-[10px] text-torg-gray mt-0.5 leading-tight">{ajuda}</span>}
  </label>
);

export const Linha = ({ r, v, forte }) => (
  <div className={`flex justify-between gap-4 ${forte ? "font-bold text-torg-dark border-t border-gray-100 pt-1" : "text-torg-gray"}`}>
    <dt>{r}</dt><dd className="tabular-nums whitespace-nowrap">{v}</dd>
  </div>
);

export function Kpi({ r, v, cor }) {
  return (
    <div className="bg-white p-3 min-w-0">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider truncate">{r}</p>
      <p className={`text-[14px] font-extrabold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis ${cor || "text-torg-dark"}`} title={String(v)}>{v}</p>
    </div>
  );
}

export function Quadro({ titulo, grupo, vazio, precoEditavel }) {
  // ⚠ COM CAMPO EDITÁVEL, A TABELA NÃO PODE SUMIR. Sem preço lançado, `temLinha` era falso e o
  // quadro virava uma frase — justamente escondendo o campo onde o preço deveria ser digitado.
  const temLinha = grupo?.linhas?.some((l) => l.pesoKg > 0 || l.subtotal > 0);
  if (!temLinha && !(precoEditavel && grupo?.linhas?.length)) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
        <p className="text-[12px] font-bold text-torg-dark">{titulo}</p>
        <p className="text-[11px] text-torg-gray mt-1">{vazio || "Sem valor lançado."}</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">{titulo}</p>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Descrição</th><th className="text-left px-2 py-1.5">Espec.</th>
            <th className="text-right px-2 py-1.5">Peso</th><th className="text-right px-2 py-1.5">R$/kg</th>
            <th className="text-right px-2 py-1.5">Subtotal</th><th className="text-right px-2 py-1.5">ICMS</th><th className="text-right px-4 py-1.5">PIS/COFINS</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {grupo.linhas.filter((l) => l.pesoKg > 0 || l.subtotal > 0 || precoEditavel).map((l, i) => (
            <tr key={i}>
              <td className="px-4 py-1">{l.nome}</td><td className="px-2 py-1 text-torg-gray">{l.espec || "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmtKg(l.pesoKg)}</td>
              {precoEditavel && i === 0 ? (
                <td className="px-2 py-1 bg-[#FEF9C3]">
                  <input value={precoEditavel.valor ?? ""} onChange={(ev) => precoEditavel.onChange(ev.target.value)}
                    placeholder="0,00" title="R$/kg dos fixadores desta obra"
                    className="w-24 border border-[#EAB308] bg-white rounded px-2 py-0.5 text-[12px] text-right tabular-nums focus:border-torg-blue focus:ring-1 focus:ring-torg-blue" />
                </td>
              ) : (
                <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmtR$(l.precoKg)}</td>
              )}
              <td className="px-2 py-1 text-right tabular-nums font-semibold whitespace-nowrap">{fmtR$(l.subtotal)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtR$(l.icms)}</td>
              <td className="px-4 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtR$(l.pisCofins)}</td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-bold">
            <td className="px-4 py-1.5" colSpan={4}>Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(grupo.total.subtotal)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(grupo.total.icms)}</td>
            <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(grupo.total.pisCofins)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Uma parcela da composição do preço da área: valor cheio e o R$/kg, que é como o Comercial confere.
export function Comp({ r, v, kg, nota, forte }) {
  return (
    <div title={nota || undefined}>
      <p className={`text-[10px] uppercase tracking-wide ${forte ? "text-torg-dark font-semibold" : "text-torg-gray"}`}>{r}</p>
      <p className={`${forte ? "font-bold text-torg-dark" : "text-torg-dark"}`}>{fmtR$(v)}</p>
      <p className="text-[10px] text-torg-gray">{fmtR$(kg > 0 ? v / kg : 0)}/kg</p>
    </div>
  );
}
