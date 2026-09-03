"use client";
// ─── PROGRAMADO PELO PLANEJAMENTO: O QUE DESCE E O QUE SAI ─────────────────────
//
// Vitor (03/09/2026), sobre a Larissa: "ela está perdida para conseguir descer os desenhos para os
// setores". E, sobre a primeira versão desta tela: "não ficou nada bom, ficou pior do que antes; eu
// não faço nem ideia de como está a programação" — mais: "era para mostrar apenas o que foi
// programado pelo planejamento, não todas as obras".
//
// ⚠⚠ SÓ O QUE FOI PROGRAMADO. Peça sem dia não entra: a fila do PCP é montada pelo Planejamento, e
// mostrar o resto da fábrica ao lado transforma a decisão do dia numa lista de compras.
//
// ⚠⚠ UMA TABELA COM FILTRO DE COLUNA, NÃO SETAS DE DIA. Vitor (03/09/2026): "vamos tirar essa
// seleção de data, traga os filtros tipo excel para as abas". As setas obrigavam a adivinhar em que
// dia havia trabalho; agora o dia é coluna e o funil mostra quais dias existem. A coluna "situação"
// carrega o que antes eram duas tabelas separadas — filtrar por ela devolve a lista de antes, e sem
// ela dá para ver a programação inteira de uma vez.
//
// ⚠ TIRAR DA PROGRAMAÇÃO NÃO APAGA PEÇA. Vitor (03/09/2026): "deixe uma forma para eu poder tirar da
// programação coisa que estiverem erradas lá". A marca continua na LPC — o que sai é o dia. E o
// servidor recusa tirar o que o Syneco já apontou (ver a rota).
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, CalendarX } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import ProntoParaMontar from "./ProntoParaMontar";
import FaltaPreparar from "./FaltaPreparar";

const SETORES = [
  { key: "PREPARACAO", nome: "Preparação" },
  { key: "MONTAGEM", nome: "Montagem" },
];
const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmtKg = (n) => `${fmtN(n)} kg`;
const fmtDiaCurto = (d) => {
  if (!d) return "sem dia";
  const dt = new Date(`${d}T00:00:00Z`);
  const sem = dt.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${sem} ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};
const somaKg = (a) => a.reduce((s, x) => s + (x.kg || 0), 0);

export default function DescerDesenhos({ onDescer, ocupado, setor, onSetor }) {
  // ⚠⚠ AS ABAS DEPENDEM DO SETOR. Vitor (03/09/2026): "quando estamos na aba de planejamento não
  // precisa mostrar pronto para montar, pois aí que fica confuso; já quando aperto a tela da
  // montagem, aí sim você tem que mostrar uma aba onde está escrito falta descer vira falta
  // preparar, e o outro botão que hoje é pronto para montar você vai manter assim".
  const [aba, setAba] = useState("PROGRAMADO");
  const [nProntos, setNProntos] = useState(null);
  const [d, setD] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [sel, setSel] = useState(() => new Set());
  const [aberta, setAberta] = useState(null);
  const [tirando, setTirando] = useState(false);
  const [erro, setErro] = useState("");

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
    setD(null); setSel(new Set());
    fetch(`/api/pcp/descer?setor=${setor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setD(j?.prontos ? j : { prontos: [], travados: [] }))
      .catch(() => vivo && setD({ prontos: [], travados: [] }));
    return () => { vivo = false; };
  }, [setor, recarga]);

  const abas = [
    { k: "PROGRAMADO", rot: "Programado planejamento", n: null },
    { k: "PREPARAR", rot: "Falta preparar", n: null },
    ...(setor === "MONTAGEM" ? [{ k: "MONTAR", rot: "Pronto para montar", n: nProntos }] : []),
  ];
  // ⚠ trocar para a preparação com "Pronto para montar" aberta deixaria a tela em branco sem dizer
  // por quê; volta para a aba que existe nos dois setores.
  useEffect(() => {
    if (!abas.some((t) => t.k === aba)) setAba("PROGRAMADO");
  }, [setor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠ UMA LISTA SÓ. "Pode descer" virou valor da coluna situação em vez de tabela à parte: com
  // filtro de coluna, duas tabelas seriam dois filtros para a mesma pergunta.
  const linhas = useMemo(() => {
    const p = (d?.prontos || []).map((x) => ({ ...x, ok: true, situacao: "Pode descer" }));
    const t = (d?.travados || []).map((x) => ({ ...x, ok: false, situacao: x.porque || x.motivo || "travado" }));
    return [...p, ...t];
  }, [d]);
  // ⚠ o filtro de coluna é o mesmo componente da lista de obras logo abaixo e da expedição
  // (components/FiltroColuna) — Vitor já usa esse funil, e uma segunda versão dele nesta tela seria
  // um segundo jeito de fazer a mesma coisa a dois cliques de distância.
  const COLS = useMemo(() => [
    { key: "dia", label: "dia", valor: (l) => fmtDiaCurto(l.dia) },
    { key: "op", label: "OP", valor: (l) => fmtOP(l.opNumero) },
    { key: "marca", label: "marca", valor: (l) => l.marca || "" },
    { key: "bancada", label: "bancada", valor: (l) => l.bancada || "sem bancada" },
    { key: "situacao", label: "situação", valor: (l) => l.situacao || "" },
  ], []);
  const { filtros, setFiltros, filtradas: vis, opcoesDaColuna, ativos, limpar } = useFiltroColunas(linhas, COLS);
  const cab = { filtros, setFiltros, opcoesDaColuna, aberta, setAberta };

  const escolhidos = vis.filter((l) => sel.has(l.id));
  // ⚠ sem seleção o botão vale para TUDO que está à vista: filtrar por dia e mandar descer é o
  // gesto da manhã, e obrigar a marcar 60 linhas antes seria trabalho à toa.
  const alvoDescer = (escolhidos.length ? escolhidos : vis).filter((l) => l.ok);
  const todosVis = vis.length > 0 && vis.every((l) => sel.has(l.id));

  function alternar(id) { setSel((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; }); }

  async function descer() {
    // ⚠ agrupa por OBRA porque a emissão é por OP (a rota do lote recebe `opNumero`).
    const porOp = new Map();
    for (const p of alvoDescer) {
      if (!p.opNumero) continue;
      const l = porOp.get(p.opNumero) || [];
      l.push(p.marca); porOp.set(p.opNumero, l);
    }
    await onDescer?.({ setor, porObra: [...porOp.entries()].map(([opNumero, marcas]) => ({ opNumero, marcas })) });
    setRecarga((v) => v + 1);
  }

  async function tirar() {
    if (!escolhidos.length) return;
    if (!confirm(`Tirar ${escolhidos.length} item(ns) da programação?\n\n`
      + "A marca continua na lista da obra — o que sai é o dia. O que o Syneco já apontou não sai.")) return;
    setTirando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/descer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor, ids: escolhidos.map((x) => x.id) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao tirar da programação");
      if (j.comProducao > 0) setErro(`${j.comProducao} ficaram: o Syneco já apontou produção nelas.`);
      setSel(new Set());
      setRecarga((v) => v + 1);
    } catch (e) { setErro(e.message); } finally { setTirando(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden mb-4">
      <div className="flex items-end gap-1 px-4 pt-2 border-b border-gray-100 bg-gray-50/60">
        {abas.map((t) => (
          <button key={t.k} onClick={() => setAba(t.k)}
            className={`text-[12.5px] px-3 py-2 -mb-px border-b-2 inline-flex items-center gap-1.5 ${
              aba === t.k ? "border-torg-blue text-torg-blue font-semibold" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            {t.rot}
            {t.n > 0 && (
              <span className={`text-[10.5px] rounded-full px-1.5 py-0.5 ${aba === t.k ? "bg-torg-blue text-white" : "bg-gray-200 text-torg-gray"}`}>{t.n}</span>
            )}
          </button>
        ))}
        {/* ⚠ o setor sobe para o topo porque agora ele MANDA nas abas: "Pronto para montar" só faz
            sentido na montagem, e escondê-lo atrás da aba deixaria a pessoa sem como voltar. */}
        <div className="ml-auto flex items-center gap-1 pb-1.5">
          {SETORES.map((s) => (
            <button key={s.key} onClick={() => onSetor(s.key)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
                setor === s.key ? "bg-torg-blue text-white border-torg-blue"
                  : "bg-white border-gray-200 text-torg-gray hover:border-torg-blue-300 hover:text-torg-blue"}`}>
              {s.nome}
            </button>
          ))}
        </div>
      </div>

      {aba === "MONTAR" ? (
        <ProntoParaMontar onProgramado={() => setRecarga((v) => v + 1)} />
      ) : aba === "PREPARAR" ? (
        <FaltaPreparar setor={setor} />
      ) : !d ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> vendo a programação…
        </p>
      ) : !linhas.length ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray">
          O Planejamento não tem nada programado {setor === "MONTAGEM" ? "para a montagem" : "para a preparação"}.
          {d.jaDesceram > 0 && <span className="text-torg-gray-light"> ({fmtN(d.jaDesceram)} já {d.jaDesceram === 1 ? "desceu" : "desceram"})</span>}
        </p>
      ) : (
        <div className="px-4 pt-3 pb-3">
          <p className="text-[12.5px] text-torg-gray mb-2">
            <b className="text-torg-dark">{fmtN(vis.length)}</b> {ativos ? `de ${fmtN(linhas.length)} programados` : "programados"} ·
            {" "}<b className="text-emerald-700">{fmtN(vis.filter((l) => l.ok).length)}</b> {vis.filter((l) => l.ok).length === 1 ? "pode descer" : "podem descer"} ·
            {" "}{fmtKg(somaKg(vis))}
            {d.jaDesceram > 0 && <span className="text-torg-gray-light"> · {fmtN(d.jaDesceram)} já {d.jaDesceram === 1 ? "desceu" : "desceram"}</span>}
            {ativos > 0 && <button onClick={limpar} className="ml-2 text-[11px] text-torg-blue hover:underline">limpar filtro</button>}
          </p>

          <div className="border border-gray-100 rounded-lg overflow-auto max-h-[430px]">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-torg-gray-light sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={todosVis}
                      onChange={() => setSel(todosVis ? new Set() : new Set(vis.map((l) => l.id)))}
                      className="rounded border-gray-300" />
                  </th>
                  <ThFiltro col="dia" label="dia" larg="w-[104px]" className="py-2 font-semibold" {...cab} />
                  <ThFiltro col="op" label="OP" larg="w-[86px]" className="py-2 font-semibold" {...cab} />
                  <ThFiltro col="marca" label="marca" larg="w-[116px]" className="py-2 font-semibold" {...cab} />
                  <th className="py-2 font-semibold">descrição</th>
                  {setor === "MONTAGEM" && (
                    <ThFiltro col="bancada" label="bancada" larg="w-[112px]" className="py-2 font-semibold" {...cab} />
                  )}
                  <th className="py-2 font-semibold text-right w-[52px]">qtd</th>
                  <th className="py-2 font-semibold text-right w-[80px]">kg</th>
                  <ThFiltro col="situacao" label="situação" larg="w-[190px]" className="px-3 py-2 font-semibold" {...cab} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vis.map((p) => (
                  <tr key={p.id} onClick={() => alternar(p.id)}
                    className={`cursor-pointer ${sel.has(p.id) ? "bg-torg-blue/5" : "hover:bg-gray-50/70"}`}>
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} className="rounded border-gray-300" />
                    </td>
                    <td className="py-1.5 text-torg-gray whitespace-nowrap">{fmtDiaCurto(p.dia)}</td>
                    <td className="py-1.5 font-mono text-torg-blue whitespace-nowrap">{fmtOP(p.opNumero)}</td>
                    <td className="py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap">{p.marca}</td>
                    <td className="py-1.5 text-torg-gray truncate">{p.descricao || "—"}</td>
                    {setor === "MONTAGEM" && (
                      <td className="py-1.5 text-torg-gray-light whitespace-nowrap">{p.bancada || "sem bancada"}</td>
                    )}
                    <td className="py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(p.qte)}</td>
                    <td className="py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(p.kg)}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap truncate ${p.ok ? "text-emerald-700" : "text-amber-800"}`}>{p.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erro && <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{erro}</p>}

          <div className="flex items-center gap-2.5 flex-wrap mt-2.5">
            <button onClick={descer} disabled={ocupado || !alvoDescer.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
              {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
              Descer {fmtN(alvoDescer.length)}
            </button>
            <button onClick={tirar} disabled={tirando || !escolhidos.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-200 text-torg-gray hover:border-amber-300 hover:text-amber-800 disabled:opacity-40">
              {tirando ? <Loader2 size={13} className="animate-spin" /> : <CalendarX size={13} />}
              Tirar da programação{escolhidos.length ? ` (${fmtN(escolhidos.length)})` : ""}
            </button>
            <span className="text-[11px] text-torg-gray-light">
              {escolhidos.length ? "vale para o que está marcado" : "sem marcar nada, descer vale para tudo que está à vista"} ·
              {" "}imprime carimbado e registra a GRD
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
