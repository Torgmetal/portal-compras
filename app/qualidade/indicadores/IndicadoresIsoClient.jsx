"use client";
import { useState, useEffect, useMemo } from "react";
import { Gauge, Loader2, Lock, Info, TrendingUp, X, FileDown, ClipboardList } from "lucide-react";
import { farol, FAROL_COR, metaTexto } from "@/lib/indicadores-iso";
import PlanoAcaoIndicador from "./PlanoAcaoIndicador";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtVal = (v, unidade) => v == null ? "—" : `${String(Math.round(v * 10) / 10).replace(".", ",")}${unidade === "%" ? "%" : ""}`;

function Spark({ serie, meta, mesFim }) {
  const pts = serie.map((v, i) => ({ i, v })).filter((p) => p.v != null && p.i <= mesFim);
  if (pts.length < 2) return <div className="h-9" />;
  const W = 150, H = 34, pad = 3;
  const vals = pts.map((p) => p.v).concat(meta.valor);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const X = (i) => pad + (i / 11) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const cor = FAROL_COR[farol(last.v, meta)]?.dot || "#94a3b8";
  return (
    <svg width={W} height={H} className="overflow-visible">
      <line x1={pad} x2={W - pad} y1={Y(meta.valor)} y2={Y(meta.valor)} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke={cor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(last.i)} cy={Y(last.v)} r="2.6" fill={cor} />
    </svg>
  );
}

export default function IndicadoresIsoClient({ processo = "QUALIDADE", endpoint = "/api/qualidade/indicadores", titulo = "Indicadores da Qualidade", detalheEndpoint = null, pdfEndpoint = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const hoje = new Date();
  const [ano] = useState(hoje.getUTCFullYear());
  const [mes, setMes] = useState(null); // null = deixa a API escolher (mês atual)
  const [modo, setModo] = useState("mes"); // mes | acumulado (do ano)
  const [plano, setPlano] = useState(null);
  const [detalhe, setDetalhe] = useState(null); // indicador aberto no modal de registros do mês
  const acum = modo === "acumulado";

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ ano: String(ano) });
    if (mes != null) q.set("mes", String(mes));
    fetch(`${endpoint}?${q}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!j) return setErro("Erro ao carregar"); setData(j); if (mes == null) setMes(j.mes); })
      .catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [ano, mes]);

  const resumo = useMemo(() => {
    if (!data) return null;
    const r = { verde: 0, amarelo: 0, vermelho: 0, pendente: 0 };
    for (const ind of data.indicadores) {
      if (ind.processo !== processo) continue; // só os indicadores do processo desta tela
      if (ind.fonte === "pendente") { r.pendente++; continue; }
      const f = farol(acum ? ind.acumulado : ind.atual, ind.meta);
      if (f) r[f]++;
    }
    return r;
  }, [data, acum]);

  const temAcumulado = !!data?.indicadores?.some((i) => i.processo === processo && i.acumulado != null);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2.5"><Gauge className="text-torg-blue" size={28} /> {titulo}</h2>
          <p className="text-sm text-torg-gray mt-1">Acompanhamento ISO 9001 — cada indicador é calculado do dado real do portal, sem digitação manual.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {temAcumulado && (
            <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden text-sm">
              <button onClick={() => setModo("mes")} className={`px-3 py-2 ${!acum ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:text-torg-dark"}`}>Mês</button>
              <button onClick={() => setModo("acumulado")} className={`px-3 py-2 ${acum ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:text-torg-dark"}`}>Acumulado {ano}</button>
            </div>
          )}
          <select value={mes ?? ""} onChange={(e) => setMes(parseInt(e.target.value, 10))} disabled={acum} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:opacity-50">
            {MESES.map((m, i) => <option key={i} value={i} disabled={data && i > data.mesFim}>{m} / {ano}</option>)}
          </select>
          {pdfEndpoint && (
            <a href={`${pdfEndpoint}?ano=${ano}${mes != null ? `&mes=${mes}` : ""}`} target="_blank" rel="noopener noreferrer" className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5"><FileDown size={15} /> PDF</a>
          )}
        </div>
      </div>

      {resumo && (
        <div className="flex gap-2.5 flex-wrap">
          <Chip n={resumo.verde} l="Na meta" cor="#1e9e6a" bg="#e7f5ee" />
          <Chip n={resumo.amarelo} l="Atenção" cor="#b45309" bg="#fff6e6" />
          <Chip n={resumo.vermelho} l="Fora da meta" cor="#b91c1c" bg="#fdeaea" />
          <Chip n={resumo.pendente} l="Aguardando registro" cor="#64748b" bg="#f1f5f9" />
        </div>
      )}

      {loading && !data ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {data.indicadores.filter((i) => i.processo === processo).map((ind) => (
            <Card key={ind.id} ind={ind} mesFim={data.mesFim} acum={acum}
              onAbrir={detalheEndpoint && ind.fonte !== "pendente" ? () => setDetalhe(ind) : null}
              onPlano={() => setPlano(ind)} />
          ))}
        </div>
      )}

      {detalhe && <DetalheModal ind={detalhe} endpoint={detalheEndpoint} ano={ano} mes={acum ? -1 : mes} onClose={() => setDetalhe(null)} />}
      {plano && (
        <PlanoAcaoIndicador ind={plano} processo={processo} ano={ano}
          mes={acum ? null : mes} valor={acum ? plano.acumulado : plano.atual}
          onFechar={() => setPlano(null)} />
      )}
    </div>
  );
}

function DetalheModal({ ind, endpoint, ano, mes, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  useEffect(() => {
    setLoading(true);
    fetch(`${endpoint}?indicador=${encodeURIComponent(ind.id)}&ano=${ano}&mes=${mes}`).then((r) => r.json())
      .then((j) => { if (!j || j.error) return setErro(j?.error || "Sem detalhamento"); setD(j); })
      .catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [ind.id, mes]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark">{ind.nome}</h3>
            <p className="text-[11px] text-torg-gray mt-0.5">{mes < 0 ? `Acumulado ${ano}` : `${MESES[mes]} / ${ano}`} — registros {mes < 0 ? "do ano" : "do mês"} (de onde saiu o número)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="py-14 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin mb-2" /> Carregando…</div>
        ) : erro ? (
          <div className="py-10 text-center text-red-600 text-sm px-5">{erro}</div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            {d.resumo && <p className="text-[12px] text-torg-dark bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg px-3 py-2">{d.resumo}</p>}
            {(!d.linhas || d.linhas.length === 0) ? (
              <p className="text-[13px] text-torg-gray py-6 text-center">Nenhum registro neste mês.</p>
            ) : (
              <div className="overflow-auto max-h-[60vh] border border-gray-100 rounded-lg">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50/60 text-torg-gray sticky top-0"><tr>{d.colunas.map((c, i) => <th key={i} className="px-3 py-2 font-medium text-left whitespace-nowrap">{c}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {d.linhas.map((ln, i) => <tr key={i} className="hover:bg-gray-50/60">{ln.map((cell, j) => <td key={j} className="px-3 py-1.5 text-torg-dark whitespace-nowrap">{cell}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ n, l, cor, bg }) {
  return <div className="rounded-xl px-4 py-2 flex items-center gap-2.5" style={{ background: bg }}><span className="text-2xl font-extrabold tabular-nums" style={{ color: cor }}>{n}</span><span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: cor }}>{l}</span></div>;
}

function Card({ ind, mesFim, onAbrir, acum, onPlano }) {
  const pendente = ind.fonte === "pendente";
  const valor = acum ? ind.acumulado : ind.atual;
  const f = pendente ? null : farol(valor, ind.meta);
  const cor = f ? FAROL_COR[f] : null;
  const clicavel = !!onAbrir;
  return (
    <div onClick={clicavel ? onAbrir : undefined} title={clicavel ? "Ver os registros do mês" : undefined}
      className={`rounded-xl border p-4 flex flex-col gap-2.5 ${pendente ? "border-dashed border-gray-300 bg-gray-50/60" : "bg-white border-gray-200"} ${clicavel ? "cursor-pointer hover:border-torg-blue hover:shadow-sm transition-all" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-torg-dark text-[13.5px] leading-snug">{ind.nome}</div>
          <div className="text-[11px] text-torg-gray mt-0.5">{ind.oQueMede}</div>
        </div>
        {pendente
          ? <span className="shrink-0 text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-1 inline-flex items-center gap-1"><Lock size={10} /> pendente</span>
          : cor && <span className="shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ background: cor.dot }} title={cor.label} />}
      </div>

      {pendente ? (
        <div className="text-[11.5px] text-slate-500 bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> {ind.nota || "Aguardando registro no portal."}</div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <div>
              <span className="text-[26px] font-extrabold tabular-nums leading-none" style={{ color: cor?.fg || "#0d2135" }}>{fmtVal(valor, ind.meta.unidade)}</span>
              {valor != null && ind.meta.unidade !== "%" && <span className="text-[12px] text-torg-gray ml-1">{ind.meta.unidade}</span>}
              <div className="text-[11px] text-torg-gray mt-1">{acum ? "Acumulado · " : ""}Meta: <b className="text-torg-dark/80">{metaTexto(ind.meta)}</b> · {ind.freq}</div>
            </div>
            <Spark serie={ind.serie} meta={ind.meta} mesFim={mesFim} />
          </div>
          {valor == null && <div className="text-[10.5px] text-torg-gray inline-flex items-center gap-1"><TrendingUp size={11} /> Sem dado {acum ? "no ano" : "no mês selecionado"}.</div>}
          <div className="flex items-center gap-3 flex-wrap">
            {clicavel && <div className="text-[10.5px] text-torg-blue font-medium">ver registros {acum ? "do ano" : "do mês"} →</div>}
            {/* ⚠⚠ O BOTÃO SÓ APARECE FORA DA META. Vitor (27/08/2026): "criar um botão para criar
                plano de ação para os meses que estão abaixo da meta". Botão sempre visível vira
                enfeite; aparecendo só no vermelho, ele é a própria leitura do indicador. */}
            {f === "vermelho" && onPlano && (
              <button onClick={(e) => { e.stopPropagation(); onPlano(); }}
                className="text-[10.5px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-100 inline-flex items-center gap-1">
                <ClipboardList size={11} /> plano de ação
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
