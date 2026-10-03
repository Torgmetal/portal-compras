"use client";
// ─── PRODUÇÃO › CORTE E MONTAGEM — A CONSULTA DOS GERENTES DE SETOR ─────────
//
// Matheus (03/10/2026): "uma aba simplificada para os setores corte e montagem — os gerentes
// selecionam a OBRA e depois o setor e verificam o status igual temos nessa lista, somente com
// informações relevantes: o status da peça, os croquis, quantos já foram cortados, quantos faltam
// pro corte; e deixe bom para ver no celular".
//
// ⚠⚠ OS NÚMEROS SÃO OS DO PCP, DA MESMA ROTA (`/api/pcp/despacho`) E DA MESMA REGRA
// (`lib/status-setor.js`). Uma segunda conta faria o gerente e o PCP discutirem dois números para a
// mesma peça. Esta tela só CONSULTA: liberar, baixar e programar continuam no PCP.
//
// ⚠ CARTÃO, NÃO TABELA: é lida no celular de pé, no pátio. Tabela de 9 colunas em 390 px vira
// "ini…", "fin…" (foi o que motivou o pedido).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, RefreshCw, Search, Scissors, Wrench, PackageOpen } from "lucide-react";
import { situacaoDaPeca, feitoDaPeca, resumoDoSetor, SIT } from "@/lib/status-setor";
import { CroquisChip, CroquisFaltando } from "@/app/pcp/producao/CroquisConjunto";

const SETORES = [
  { id: "CORTE", rotulo: "Corte", Icone: Scissors },
  { id: "MONTAGEM", rotulo: "Montagem", Icone: Wrench },
];
// o que ainda está andando primeiro; o que acabou, por último
const ORDEM = { PARCIAL: 0, NAO_INICIADO: 1, FINALIZADO: 2, EXPEDIDA: 3 };
const LEMBRAR = "producao-corte-montagem";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const lerLembrado = () => { try { return JSON.parse(localStorage.getItem(LEMBRAR) || "{}"); } catch { return {}; } };
const lembrar = (v) => { try { localStorage.setItem(LEMBRAR, JSON.stringify(v)); } catch { /* sem armazenamento: só não lembra */ } };

async function lerJson(r) {
  let j = null;
  try { j = await r.json(); } catch { /* corpo que não é JSON */ }
  if (!r.ok) throw new Error(j?.error || `Erro ${r.status} do servidor.`);
  return j;
}

export default function CorteMontagemClient() {
  const [ops, setOps] = useState(null);
  const [erroOps, setErroOps] = useState(null);
  const [opId, setOpId] = useState("");
  const [setor, setSetor] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [soFalta, setSoFalta] = useState(false);
  const [abertos, setAbertos] = useState(() => new Set());

  const carregarOps = useCallback(async () => {
    setErroOps(null);
    try {
      const j = await lerJson(await fetch("/api/pcp/producao", { cache: "no-store" }));
      setOps(j.ops || []);
      const l = lerLembrado();
      if (l.opId && (j.ops || []).some((o) => o.opId === l.opId)) { setOpId(l.opId); setSetor(l.setor || ""); }
    } catch (e) { setErroOps(e.message); }
  }, []);
  useEffect(() => { carregarOps(); }, [carregarOps]);

  const carregar = useCallback(async () => {
    if (!opId || !setor) return;
    setCarregando(true); setErro(null); setAbertos(new Set());
    try {
      const qs = new URLSearchParams({ opId, setor });
      setDados(await lerJson(await fetch(`/api/pcp/despacho?${qs}`, { cache: "no-store" })));
      lembrar({ opId, setor });
    } catch (e) { setErro(e.message); setDados(null); }
    finally { setCarregando(false); }
  }, [opId, setor]);
  useEffect(() => { carregar(); }, [carregar]);

  const pecas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.pecas || [])
      .filter((p) => !q || String(p.marca).toLowerCase().includes(q) || String(p.descricao || "").toLowerCase().includes(q))
      .filter((p) => !soFalta || !["FINALIZADO", "EXPEDIDA"].includes(situacaoDaPeca(p)))
      .sort((a, b) => (ORDEM[situacaoDaPeca(a)] - ORDEM[situacaoDaPeca(b)])
        || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));
  }, [dados, busca, soFalta]);
  const resumo = useMemo(() => resumoDoSetor(dados?.pecas || []), [dados]);
  const alternar = (id) => setAbertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-torg-dark">Corte e montagem</h1>
        <p className="mt-1 text-sm text-torg-gray">Escolha a obra e o setor para ver em que pé está cada peça.</p>
      </header>

      <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-torg-gray">Obra</span>
          {erroOps ? (
            <span role="alert" className="flex items-center gap-2 text-sm text-red-600">
              {erroOps}
              <button type="button" onClick={carregarOps} className="font-semibold underline">Tentar novamente</button>
            </span>
          ) : (
            <select aria-label="Obra" value={opId} disabled={!ops} onChange={(e) => { setOpId(e.target.value); setDados(null); }}
              className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base focus:border-torg-blue focus:outline-none">
              <option value="">{ops ? "— escolha a obra —" : "carregando obras…"}</option>
              {(ops || []).map((o) => (
                <option key={o.opId} value={o.opId}>OP-{o.opNumero} · {o.cliente}{o.obra ? ` — ${o.obra}` : ""}</option>
              ))}
            </select>
          )}
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-torg-gray">Setor</span>
          <div className="grid grid-cols-2 gap-2">
            {SETORES.map(({ id, rotulo, Icone }) => (
              <button key={id} type="button" aria-pressed={setor === id} disabled={!opId}
                onClick={() => { setSetor(id); setDados(null); }}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 text-base font-semibold disabled:opacity-40 ${
                  setor === id ? "border-torg-blue bg-torg-blue text-white" : "border-gray-200 bg-white text-torg-dark"}`}>
                <Icone size={18} /> {rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {carregando && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-torg-gray"><Loader2 size={16} className="animate-spin" /> Carregando as peças…</p>
      )}
      {erro && !carregando && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} /> <span className="flex-1">Não foi possível carregar: {erro}</span>
          <button type="button" onClick={carregar} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={13} /> Tentar novamente</button>
        </div>
      )}

      {dados && !carregando && (
        <>
          <Resumo resumo={resumo} setor={setor} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
              <input aria-label="Buscar marca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca ou descrição"
                className="w-full rounded-xl border-2 border-gray-200 py-2.5 pl-9 pr-3 text-base focus:border-torg-blue focus:outline-none" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-torg-dark">
              <input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} className="h-5 w-5 accent-torg-blue" />
              Só o que falta
            </label>
          </div>
          {pecas.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-torg-gray">
              <PackageOpen size={28} className="mx-auto mb-2 text-gray-300" />
              {dados.pecas?.length ? "Nenhuma peça com esse filtro." : "Nenhuma peça desta obra passa por este setor."}
            </div>
          ) : (
            <ul className="space-y-2">
              {pecas.map((p) => (
                <Cartao key={p.id} p={p} setor={setor} aberto={abertos.has(p.id)} onAlternar={() => alternar(p.id)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** O topo: quanto está parado, andando e pronto — e, na montagem, o que já pode montar. */
function Resumo({ resumo: r, setor }) {
  const itens = [
    { n: r.naoIniciado, rotulo: "não iniciadas", cls: "text-gray-700" },
    { n: r.emProducao, rotulo: "em produção", cls: "text-sky-700" },
    { n: r.prontas, rotulo: setor === "CORTE" ? "cortadas" : "prontas", cls: "text-emerald-700" },
  ];
  return (
    <section aria-label="Resumo do setor" className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        {itens.map((i) => (
          <div key={i.rotulo}>
            <div className={`text-2xl font-bold tabular-nums ${i.cls}`}>{i.n}</div>
            <div className="text-xs text-torg-gray">{i.rotulo}</div>
          </div>
        ))}
      </div>
      {setor === "MONTAGEM" && (r.conjuntosProntosParaMontar > 0 || r.conjuntosAguardandoCorte > 0) && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-torg-dark">
          <b className="text-emerald-700">{r.conjuntosProntosParaMontar} {r.conjuntosProntosParaMontar === 1 ? "pronto" : "prontos"} para montar</b> (todos os croquis cortados)
          {" · "}<b className="text-amber-700">{r.conjuntosAguardandoCorte}</b> aguardando o corte
        </p>
      )}
    </section>
  );
}

function Cartao({ p, setor, aberto, onAlternar }) {
  const s = SIT[situacaoDaPeca(p)];
  const feito = feitoDaPeca(p);
  const qtd = Number(p.qte) || 0;
  const falta = Math.max(0, qtd - feito);
  return (
    <li className={`rounded-xl border border-gray-100 border-l-4 bg-white p-3 shadow-sm ${s.barra}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-base font-bold text-torg-dark">{p.marca}</p>
          {p.descricao && <p className="text-sm text-torg-gray">{p.descricao}</p>}
        </div>
        <span title={s.dica} className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.txt}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {setor === "CORTE" ? (
          <span className="tabular-nums text-torg-dark">
            cortado <b>{fmtN(feito)}</b> de {fmtN(qtd)}
            {falta > 0 && <b className="ml-2 text-amber-700">faltam {fmtN(falta)}</b>}
          </span>
        ) : (
          <>
            <span className="tabular-nums text-torg-dark">montado <b>{fmtN(feito)}</b> de {fmtN(qtd)}</span>
            <span className="flex items-center gap-1 text-torg-gray">croquis <CroquisChip peca={p} aberto={aberto} onAlternar={onAlternar} /></span>
          </>
        )}
      </div>
      {setor === "MONTAGEM" && aberto && p.faltamCroquis?.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50/60 p-2"><CroquisFaltando faltam={p.faltamCroquis} presa={false} /></div>
      )}
    </li>
  );
}
