"use client";
// ─── O DIA DO SETOR: O QUE ESTÁ PROGRAMADO E O QUE DESCE ───────────────────────
//
// Vitor (03/09/2026), sobre a Larissa: "ela está perdida para conseguir descer os desenhos para os
// setores". E, sobre a primeira versão desta tela: "não ficou nada bom, ficou pior do que antes; eu
// não faço nem ideia de como está a programação" — mais: "era para mostrar apenas o que foi
// programado pelo planejamento, não todas as obras".
//
// ⚠⚠ O DIA É O ASSUNTO. A primeira versão listava tudo que faltava descer, por obra, sem dia: virou
// um inventário de mil itens que não responde "o que é para hoje". Quem abre o PCP de manhã tem UMA
// pergunta — o que o Planejamento marcou para hoje e o que dá para soltar.
//
// ⚠⚠ SÓ O QUE FOI PROGRAMADO. Peça sem dia não entra: a fila do PCP é montada pelo Planejamento, e
// mostrar o resto da fábrica ao lado transforma a decisão do dia numa lista de compras.
//
// ⚠ DUAS LISTAS, NÃO UMA TABELA COM COLUNA DE STATUS. O que desce é acionável; o que não desce é
// informação de para quem ligar. Misturar as duas obriga a pessoa a filtrar antes de agir.
import { useEffect, useState } from "react";
import { Loader2, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import ProntoParaMontar from "./ProntoParaMontar";

const SETORES = [
  { key: "PREPARACAO", nome: "Preparação" },
  { key: "MONTAGEM", nome: "Montagem" },
];
const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmtKg = (n) => `${fmtN(n)} kg`;
const hojeIso = () => new Date().toISOString().slice(0, 10);
const fmtDia = (d) => {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00Z`);
  const s = dt.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  return `${s.replace(".", "")}, ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};
const somaKg = (a) => a.reduce((s, x) => s + (x.kg || 0), 0);

export default function DescerDesenhos({ onDescer, ocupado }) {
  // ⚠⚠ DUAS ABAS, o desenho que o Vitor aprovou (03/09/2026): "uma abinha logo ao lado (…) onde
  // iria mostrar o que temos de conjuntos disponíveis para montar". São dois momentos do dia —
  // programar a bancada (o que a preparação terminou) e soltar o desenho (o que está programado) —
  // e ele pediu os dois no mesmo lugar, não em telas separadas.
  const [aba, setAba] = useState("DESCER");
  const [nProntos, setNProntos] = useState(null);
  const [setor, setSetor] = useState("PREPARACAO");
  const [dia, setDia] = useState(hojeIso);
  const [d, setD] = useState(null);
  const [recarga, setRecarga] = useState(0);

  // ⚠ só a CONTAGEM, para o número da aba existir antes de alguém clicar nela — quem não abre a
  // aba precisa saber que há trabalho ali.
  useEffect(() => {
    let vivo = true;
    fetch("/api/pcp/prontos-montar", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setNProntos((j?.conjuntos || []).length))
      .catch(() => vivo && setNProntos(0));
    return () => { vivo = false; };
  }, [recarga]);

  useEffect(() => {
    let vivo = true;
    setD(null);
    fetch(`/api/pcp/descer?setor=${setor}&dia=${dia}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setD(j?.prontos ? j : { prontos: [], travados: [], diasComAlgo: [] }))
      .catch(() => vivo && setD({ prontos: [], travados: [], diasComAlgo: [] }));
    return () => { vivo = false; };
  }, [setor, dia, recarga]);

  const prontos = d?.prontos || [];
  const travados = d?.travados || [];
  const previsto = prontos.length + travados.length;
  // ⚠ as setas andam só onde HÁ trabalho: num calendário puro ela clicaria dias vazios até achar.
  const dias = d?.diasComAlgo || [];
  const anterior = [...dias].reverse().find((x) => x < dia) || null;
  const proximo = dias.find((x) => x > dia) || null;

  async function descer() {
    // ⚠ agrupa por OBRA porque a emissão é por OP (a rota do lote recebe `opNumero`). Ela escolheu
    // "descer o que está pronto hoje" — quem separa por obra é o portal, não ela.
    const porOp = new Map();
    for (const p of prontos) {
      if (!p.opNumero) continue;
      const l = porOp.get(p.opNumero) || [];
      l.push(p.marca); porOp.set(p.opNumero, l);
    }
    await onDescer?.({ setor, porObra: [...porOp.entries()].map(([opNumero, marcas]) => ({ opNumero, marcas })) });
    setRecarga((v) => v + 1);
  }

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden mb-4">
      <div className="flex items-end gap-1 px-4 pt-2 border-b border-gray-100 bg-gray-50/60">
        {[
          { k: "DESCER", rot: "Falta descer", n: null },
          { k: "MONTAR", rot: "Pronto para montar", n: nProntos },
        ].map((t) => (
          <button key={t.k} onClick={() => setAba(t.k)}
            className={`text-[12.5px] px-3 py-2 -mb-px border-b-2 inline-flex items-center gap-1.5 ${
              aba === t.k ? "border-torg-blue text-torg-blue font-semibold" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            {t.rot}
            {t.n > 0 && (
              <span className={`text-[10.5px] rounded-full px-1.5 py-0.5 ${aba === t.k ? "bg-torg-blue text-white" : "bg-gray-200 text-torg-gray"}`}>{t.n}</span>
            )}
          </button>
        ))}
      </div>

      {aba === "MONTAR" ? (
        <ProntoParaMontar onProgramado={() => setRecarga((v) => v + 1)} />
      ) : (
      <>
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-1">
          <button onClick={() => anterior && setDia(anterior)} disabled={!anterior}
            title={anterior ? `ir para ${fmtDia(anterior)}` : "nada programado antes"}
            className="p-1 rounded-md text-torg-gray hover:bg-white disabled:opacity-25"><ChevronLeft size={15} /></button>
          <span className="text-[13px] font-bold text-torg-dark capitalize min-w-[150px]">{fmtDia(dia)}</span>
          <button onClick={() => proximo && setDia(proximo)} disabled={!proximo}
            title={proximo ? `ir para ${fmtDia(proximo)}` : "nada programado depois"}
            className="p-1 rounded-md text-torg-gray hover:bg-white disabled:opacity-25"><ChevronRight size={15} /></button>
          {dia !== hojeIso() && (
            <button onClick={() => setDia(hojeIso())} className="ml-1 text-[11px] text-torg-blue hover:underline">hoje</button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {SETORES.map((s) => (
            <button key={s.key} onClick={() => setSetor(s.key)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
                setor === s.key ? "bg-torg-blue text-white border-torg-blue"
                  : "border-gray-200 text-torg-gray hover:border-torg-blue-300 hover:text-torg-blue"}`}>
              {s.nome}
            </button>
          ))}
        </div>
      </div>

      {!d ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> vendo o dia…
        </p>
      ) : !previsto ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray">
          O Planejamento não marcou nada para este dia
          {dias.length > 0 && <> — o próximo dia com programação é <b>{fmtDia(proximo || dias[0])}</b>.</>}
          {!dias.length && <> neste setor.</>}
        </p>
      ) : (
        <>
          <p className="px-4 pt-3 text-[12.5px] text-torg-gray">
            O Planejamento marcou <b className="text-torg-dark">{fmtN(previsto)}</b> para hoje.
            {prontos.length > 0
              ? <> <b className="text-emerald-700">{fmtN(prontos.length)}</b> {prontos.length === 1 ? "está liberado" : "estão liberados"} de fato.</>
              : <> Nenhum está liberado ainda.</>}
            {d.jaDesceram > 0 && <span className="text-torg-gray-light"> ({fmtN(d.jaDesceram)} já {d.jaDesceram === 1 ? "desceu" : "desceram"})</span>}
          </p>

          {prontos.length > 0 && (
            <div className="px-4 pt-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span className="text-[12.5px] font-semibold text-torg-dark">
                  Pode descer — {fmtN(prontos.length)} · {fmtKg(somaKg(prontos))}
                </span>
              </div>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-[12px]">
                  <tbody className="divide-y divide-gray-50">
                    {prontos.slice(0, 40).map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-1.5 font-mono text-torg-blue whitespace-nowrap w-[86px]">{fmtOP(p.opNumero)}</td>
                        <td className="py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap w-[110px]">{p.marca}</td>
                        <td className="py-1.5 text-torg-gray truncate">{p.descricao || "—"}</td>
                        {setor === "MONTAGEM" && (
                          <td className="py-1.5 text-torg-gray-light whitespace-nowrap w-[110px]">{p.bancada || "sem bancada"}</td>
                        )}
                        <td className="py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap w-[52px]">{fmtN(p.qte)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap w-[86px]">{fmtKg(p.kg)}</td>
                      </tr>
                    ))}
                    {prontos.length > 40 && (
                      <tr><td colSpan={6} className="px-3 py-1.5 text-[11px] text-torg-gray-light">+ {fmtN(prontos.length - 40)} — todos entram ao descer</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2.5 flex-wrap mt-2.5 mb-1">
                <button onClick={descer} disabled={ocupado}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
                  {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                  Descer {fmtN(prontos.length)}
                </button>
                <span className="text-[11px] text-torg-gray-light">imprime carimbado e registra a GRD</span>
              </div>
            </div>
          )}

          {travados.length > 0 && (
            <div className="px-4 pt-3 pb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[12.5px] font-semibold text-torg-dark">
                  Não desce — {fmtN(travados.length)} · {fmtKg(somaKg(travados))}
                </span>
              </div>
              <div className="border border-amber-100 bg-amber-50/40 rounded-lg overflow-hidden">
                <table className="w-full text-[12px]">
                  <tbody className="divide-y divide-amber-100/60">
                    {travados.slice(0, 20).map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-1.5 font-mono text-torg-blue whitespace-nowrap w-[86px]">{fmtOP(p.opNumero)}</td>
                        <td className="py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap w-[110px]">{p.marca}</td>
                        <td className="py-1.5 text-torg-gray truncate">{p.descricao || "—"}</td>
                        <td className="px-3 py-1.5 text-amber-800 whitespace-nowrap">{p.porque}</td>
                      </tr>
                    ))}
                    {travados.length > 20 && (
                      <tr><td colSpan={4} className="px-3 py-1.5 text-[11px] text-amber-700">+ {fmtN(travados.length - 20)}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
