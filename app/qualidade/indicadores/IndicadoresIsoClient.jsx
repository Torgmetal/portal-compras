"use client";
import { useState, useEffect, useMemo } from "react";
import { Gauge, Loader2, Lock, Info, TrendingUp } from "lucide-react";
import { PROCESSOS, PROCESSO_LABEL, farol, FAROL_COR, metaTexto } from "@/lib/indicadores-iso";

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

export default function IndicadoresIsoClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const hoje = new Date();
  const [ano] = useState(hoje.getUTCFullYear());
  const [mes, setMes] = useState(null); // null = deixa a API escolher (mês atual)

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ ano: String(ano) });
    if (mes != null) q.set("mes", String(mes));
    fetch(`/api/qualidade/indicadores?${q}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!j) return setErro("Erro ao carregar"); setData(j); if (mes == null) setMes(j.mes); })
      .catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [ano, mes]);

  const resumo = useMemo(() => {
    if (!data) return null;
    const r = { verde: 0, amarelo: 0, vermelho: 0, pendente: 0 };
    for (const ind of data.indicadores) {
      if (ind.fonte === "pendente") { r.pendente++; continue; }
      const f = farol(ind.atual, ind.meta);
      if (f) r[f]++;
    }
    return r;
  }, [data]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2.5"><Gauge className="text-torg-blue" size={28} /> Indicadores da Qualidade</h2>
          <p className="text-sm text-torg-gray mt-1">Acompanhamento ISO 9001 — cada indicador é calculado do dado real do portal, sem digitação manual.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={mes ?? ""} onChange={(e) => setMes(parseInt(e.target.value, 10))} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
            {MESES.map((m, i) => <option key={i} value={i} disabled={data && i > data.mesFim}>{m} / {ano}</option>)}
          </select>
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
        <div className="space-y-7">
          {PROCESSOS.map((proc) => {
            const lista = data.indicadores.filter((i) => i.processo === proc);
            if (!lista.length) return null;
            return (
              <div key={proc}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-[13px] font-bold text-torg-dark uppercase tracking-wide">{PROCESSO_LABEL[proc]}</h3>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {lista.map((ind) => <Card key={ind.id} ind={ind} mesFim={data.mesFim} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ n, l, cor, bg }) {
  return <div className="rounded-xl px-4 py-2 flex items-center gap-2.5" style={{ background: bg }}><span className="text-2xl font-extrabold tabular-nums" style={{ color: cor }}>{n}</span><span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: cor }}>{l}</span></div>;
}

function Card({ ind, mesFim }) {
  const pendente = ind.fonte === "pendente";
  const f = pendente ? null : farol(ind.atual, ind.meta);
  const cor = f ? FAROL_COR[f] : null;
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2.5 ${pendente ? "border-dashed border-gray-300 bg-gray-50/60" : "bg-white border-gray-200"}`}>
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
              <span className="text-[26px] font-extrabold tabular-nums leading-none" style={{ color: cor?.fg || "#0d2135" }}>{fmtVal(ind.atual, ind.meta.unidade)}</span>
              {ind.atual != null && ind.meta.unidade !== "%" && <span className="text-[12px] text-torg-gray ml-1">{ind.meta.unidade}</span>}
              <div className="text-[11px] text-torg-gray mt-1">Meta: <b className="text-torg-dark/80">{metaTexto(ind.meta)}</b> · {ind.freq}</div>
            </div>
            <Spark serie={ind.serie} meta={ind.meta} mesFim={mesFim} />
          </div>
          {ind.fonte === "parcial" && ind.nota && <div className="text-[10.5px] text-amber-700 bg-amber-50 rounded px-2 py-1 inline-flex items-start gap-1"><Info size={11} className="mt-0.5 shrink-0" /> {ind.nota}</div>}
          {ind.atual == null && <div className="text-[10.5px] text-torg-gray inline-flex items-center gap-1"><TrendingUp size={11} /> Sem dado no mês selecionado.</div>}
        </>
      )}
    </div>
  );
}
