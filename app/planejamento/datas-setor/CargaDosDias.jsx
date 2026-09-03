"use client";
// ─── A CARGA JÁ PROGRAMADA, POR DIA ───────────────────────────────────────────
//
// Vitor (03/09/2026): "não precisa ser apenas de uma OP, mostre tudo que foi para aquele dia" e
// "deixe isso travado logo acima do seletor de OP, não para aparecer quando clicarmos na OP".
//
// ⚠⚠ ISTO NÃO É DADO DA OBRA, É DA FÁBRICA — e por isso vive ACIMA do seletor, sempre à vista.
// A meta é do SETOR: a máquina é uma só. Enquanto o painel morava dentro da obra escolhida, ele
// respondia "quanto ESTA obra colocou no dia", que é a pergunta errada — medido em 03/09: o corte
// de 02/09 tinha 3.358 kg de duas obras (OP-105 e OP-113) e a tela mostrava 1.856.
//
// ⚠ A BARRA VEM ANTES DO NÚMERO porque a pergunta é "cabe no dia?". Faixa escura é a obra aberta
// (quando há uma), clara são as outras, e o traço é a meta.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// ⚠⚠ SÓ OS DOIS QUE SE PROGRAMAM AQUI. Vitor (03/09/2026): "esses setores pode tirar" (solda,
// acabamento, jato e pintura) — nenhum deles recebe liberação por esta tela, então cada botão era
// um clique que só podia dar lista vazia.
//
// ⚠ E CORTE É PREPARAÇÃO. Vitor, na mesma mensagem: "corte e preparação são a mesma coisa — usar
// preparação como nome e unificar os dois". O banco grava CORTE desde sempre; o nome que a fábrica
// fala é preparação. A rota trata os dois como um só (ver /api/planejamento/liberacao/carga), então
// aqui fica só o nome certo, sem mexer em registro nenhum.
const SETORES = [
  { key: "PREPARACAO", nome: "Preparação" },
  { key: "MONTAGEM", nome: "Montagem" },
];
const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmtKg = (n) => `${fmtN(n)} kg`;
const fmtD = (iso) => { try { const [a, m, d] = iso.split("-"); return `${d}/${m}`; } catch { return iso; } };

export default function CargaDosDias({ opId, recarga }) {
  const [setor, setSetor] = useState("PREPARACAO");
  const [metaKg, setMetaKg] = useState(12000);
  const [carga, setCarga] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCarga(null);
    const q = new URLSearchParams({ setor });
    if (opId) q.set("opId", opId);
    fetch(`/api/planejamento/liberacao/carga?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setCarga(j?.dias ? j : { dias: [] }))
      .catch(() => vivo && setCarga({ dias: [] }));
    return () => { vivo = false; };
  }, [setor, opId, recarga]);

  const dias = carga?.dias || [];
  const meta = Number(metaKg) || 0;
  const teto = Math.max(meta, ...dias.map((x) => x.kg || 0)) || 1;
  const larg = (v) => `${Math.min(100, Math.round((v / teto) * 100))}%`;
  const totalKg = dias.reduce((a, x) => a + (x.kg || 0), 0);
  const totalPc = dias.reduce((a, x) => a + (x.pecas || 0), 0);
  const orfas = dias.reduce((a, x) => a + (x.orfas || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-[11px] uppercase tracking-wide text-torg-gray-light font-bold">Carga já programada</span>
        <span className="text-[11.5px] text-torg-gray">a fábrica inteira</span>

        {/* ⚠ o setor é escolha da tela: somar corte com montagem misturaria esteiras com metas
            diferentes, e a barra deixaria de significar alguma coisa. */}
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          {SETORES.map((s) => (
            <button key={s.key} onClick={() => setSetor(s.key)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
                setor === s.key ? "bg-torg-blue text-white border-torg-blue" : "border-gray-200 text-torg-gray hover:border-torg-blue-300 hover:text-torg-blue"}`}>
              {s.nome}
            </button>
          ))}
          <label className="ml-2 text-[11px] text-torg-gray inline-flex items-center gap-1.5">
            meta
            <input type="number" value={metaKg} onChange={(e) => setMetaKg(e.target.value)}
              className="w-[86px] border border-gray-200 rounded-md px-2 py-1 text-[11.5px] text-right tabular-nums outline-none focus:border-torg-blue" />
            kg/dia
          </label>
        </div>
      </div>

      {!carga ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> lendo o que já desceu…
        </p>
      ) : !dias.length ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray">Nada programado neste setor.</p>
      ) : (
        <>
          <table className="w-full text-[12px]">
            <tbody>
              {dias.map((x) => {
                const pct = meta > 0 ? Math.round((x.kg / meta) * 100) : null;
                const passou = meta > 0 && x.kg > meta;
                return (
                  <tr key={x.dia || "sem"} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-1.5 whitespace-nowrap font-bold">
                      {x.dia ? fmtD(x.dia) : <span className="text-torg-gray-light font-normal">sem data</span>}
                    </td>
                    <td className="py-1.5 w-full">
                      <div className="relative h-4 rounded bg-gray-100 overflow-hidden min-w-[160px]"
                        title={x.obras.map((o) => `${o.obra}: ${fmtKg(o.kg)}`).join(" · ")}>
                        <span className={`absolute inset-y-0 left-0 ${passou ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: larg(x.minhaKg) }} />
                        <span className={`absolute inset-y-0 ${passou ? "bg-amber-300" : "bg-emerald-300"}`}
                          style={{ left: larg(x.minhaKg), width: larg(Math.max(0, x.kg - x.minhaKg)) }} />
                        {meta > 0 && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-torg-gray-light" style={{ left: larg(meta) }} />}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums whitespace-nowrap">{fmtKg(x.kg)}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums text-torg-gray-light whitespace-nowrap w-12">{pct == null ? "—" : `${pct}%`}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(x.pecas)} pç</td>
                    <td className="px-4 py-1.5 text-torg-gray-light whitespace-nowrap max-w-[240px] truncate">
                      {x.obras.map((o) => o.obra).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center gap-4 flex-wrap px-4 py-2 border-t border-gray-100 text-[11.5px] text-torg-gray">
            <span><b className="text-torg-dark">{fmtKg(totalKg)}</b> programados · {fmtN(totalPc)} peças</span>
            {meta > 0 && <span>{fmtN(Math.round((totalKg / meta) * 10) / 10)} dias de meta</span>}
            {opId && <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" /> obra aberta</span>}
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" /> {opId ? "outras obras" : "todas as obras"}</span>
          </div>

          {orfas > 0 && (
            <div className="px-4 py-2 border-t border-amber-200 bg-amber-50 text-[11.5px] text-amber-800">
              <b>{fmtN(orfas)} peça(s) perderam a programação</b> — a lista foi reimportada depois da
              liberação e elas voltaram para "a fazer".
              {" "}({dias.filter((x) => x.orfas > 0).map((x) => `${x.dia ? fmtD(x.dia) : "sem data"}: ${fmtN(x.orfas)}`).join(" · ")})
            </div>
          )}
        </>
      )}
    </div>
  );
}
