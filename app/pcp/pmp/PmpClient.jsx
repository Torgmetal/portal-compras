"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, AlertCircle,
  Target, RefreshCw, Scissors, TrendingUp,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";

// ── helpers de data/format ───────────────────────────────────────
function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().split("T")[0];
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}
const fmtDia = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fmtTon = (kg) => `${((Number(kg) || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ton`;
const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");
// Peso compacto pra célula: >= 1 ton mostra em ton, senão em kg
const fmtPesoCell = (kg) =>
  kg >= 1000
    ? `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ton`
    : `${Math.round(kg).toLocaleString("pt-BR")} kg`;

// Normaliza código de obra pra casar Syneco × portal: "T60B"→"60B", "085"→"85"
const normObra = (s) => String(s || "").toUpperCase().trim().replace(/^T/, "").replace(/^0+/, "") || "0";

// Seg–Sáb: a fábrica corta aos sábados — domingo fica de fora
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function PmpClient() {
  const [semana, setSemana] = useState(() => getMonday(new Date()));
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/pcp/pmp?semana=${semana}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setDados(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [semana]);

  useEffect(() => { carregar(); }, [carregar]);

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dias = useMemo(
    () => DIAS_SEMANA.map((label, i) => ({ label, data: addDays(semana, i) })),
    [semana]
  );

  // ── Monta o quadro: obras = metas de CORTE da semana ∪ realizado Syneco ──
  const quadro = useMemo(() => {
    if (!dados) return { linhas: [], totalDia: [], resumo: { metaPc: 0, metaKg: 0, realPc: 0, realKg: 0 } };

    const porObra = new Map(); // norm → { obra, metaDia: {iso: pc}, metaKg, ... }
    const garantir = (norm, nomeObra) => {
      if (!porObra.has(norm)) porObra.set(norm, { obra: nomeObra, metaDia: {}, metaKgDia: {}, metaPc: 0, metaKg: 0 });
      return porObra.get(norm);
    };

    for (const m of dados.metas || []) {
      if (m.setor !== "CORTE") continue;
      const o = garantir(normObra(m.opNumero), m.opNumero);
      const dia = m.data.split("T")[0];
      o.metaDia[dia] = (o.metaDia[dia] || 0) + m.metaPecas;
      o.metaKgDia[dia] = (o.metaKgDia[dia] || 0) + (m.metaPesoKg || 0);
      o.metaPc += m.metaPecas;
      o.metaKg += m.metaPesoKg || 0;
    }
    for (const [norm, nomeObra] of Object.entries(dados.realizadoCorteObras || {})) {
      garantir(norm, nomeObra);
    }

    const getReal = (norm, dia) => dados.realizadoCorteDia?.[`${dia}|${norm}`] || { pecas: 0, pesoKg: 0 };

    const linhas = [...porObra.entries()].map(([norm, o]) => {
      const celulas = dias.map(({ data }) => ({
        dia: data,
        metaKg: o.metaKgDia[data] || 0,
        metaPc: o.metaDia[data] || 0,
        realKg: getReal(norm, data).pesoKg,
        realPc: getReal(norm, data).pecas,
      }));
      const realPc = celulas.reduce((s, c) => s + c.realPc, 0);
      const realKg = celulas.reduce((s, c) => s + c.realKg, 0);
      return { norm, obra: o.obra, celulas, metaPc: o.metaPc, metaKg: o.metaKg, realPc, realKg };
    }).sort((a, b) => (b.metaKg + b.realKg) - (a.metaKg + a.realKg));

    const totalDia = dias.map(({ data }, i) => ({
      dia: data,
      metaKg: linhas.reduce((s, l) => s + l.celulas[i].metaKg, 0),
      realKg: linhas.reduce((s, l) => s + l.celulas[i].realKg, 0),
      realPc: linhas.reduce((s, l) => s + l.celulas[i].realPc, 0),
    }));
    const resumo = {
      metaPc: linhas.reduce((s, l) => s + l.metaPc, 0),
      metaKg: linhas.reduce((s, l) => s + l.metaKg, 0),
      realPc: linhas.reduce((s, l) => s + l.realPc, 0),
      realKg: linhas.reduce((s, l) => s + l.realKg, 0),
    };
    return { linhas, totalDia, resumo };
  }, [dados, dias]);

  const pctSemana = quadro.resumo.metaKg > 0 ? Math.round((quadro.resumo.realKg / quadro.resumo.metaKg) * 100) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-torg-blue" size={32} />
        <span className="ml-3 text-torg-gray">Carregando PMP...</span>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-600 font-medium">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 bg-torg-blue text-white rounded-lg text-sm">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Target size={24} className="text-torg-blue" /> PMP — Corte
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            As metas nascem da programação da <Link href="/pcp/fila-corte" className="text-torg-blue hover:underline font-medium">Fila de Corte</Link>;
            o realizado vem dos apontamentos do Syneco.
          </p>
        </div>
        <button onClick={carregar} className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* Navegação da semana + resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between">
          <button onClick={() => setSemana(addDays(semana, -7))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5 justify-center">
              <CalendarDays size={15} className="text-torg-blue" /> {fmtDia(semana)} – {fmtDia(addDays(semana, 5))}
            </p>
            <button onClick={() => setSemana(getMonday(new Date()))} className="text-[10px] text-torg-blue hover:underline">
              ir para a semana atual
            </button>
          </div>
          <button onClick={() => setSemana(addDays(semana, 7))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3">
          <div className="bg-torg-blue p-2 rounded-lg"><Target size={18} className="text-white" /></div>
          <div>
            <p className="text-[10px] text-torg-gray uppercase tracking-wider">Meta da semana</p>
            <p className="text-lg font-extrabold text-torg-dark leading-tight">{fmtTon(quadro.resumo.metaKg)}</p>
            <p className="text-[10px] text-torg-gray">{fmtNum(quadro.resumo.metaPc)} peças programadas</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3.5 flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-lg"><Scissors size={18} className="text-white" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-torg-gray uppercase tracking-wider">Realizado (Syneco)</p>
            <p className="text-lg font-extrabold text-torg-dark leading-tight">
              {fmtTon(quadro.resumo.realKg)}
              {pctSemana != null && (
                <span className={`ml-2 text-xs font-bold ${pctSemana >= 100 ? "text-emerald-600" : pctSemana >= 60 ? "text-amber-600" : "text-red-600"}`}>
                  {pctSemana}% da meta
                </span>
              )}
            </p>
            <p className="text-[10px] text-torg-gray">{fmtNum(quadro.resumo.realPc)} peças cortadas</p>
          </div>
        </div>
      </div>

      {/* Quadro meta × realizado */}
      {quadro.linhas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-14">
          <TrendingUp size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nada programado nem cortado nesta semana.</p>
          <p className="text-xs text-gray-400 mt-1">
            Programe peças na <Link href="/pcp/fila-corte" className="text-torg-blue hover:underline">Fila de Corte</Link> — as metas aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase">Obra</th>
                  {dias.map((d) => (
                    <th key={d.data} className={`px-2 py-2 text-center text-[10px] font-medium uppercase w-[88px] ${d.data === hojeIso ? "bg-torg-blue-50/60 text-torg-blue rounded-t" : "text-gray-500"}`}>
                      <div>{d.label}</div>
                      <div className="text-[9px] font-normal opacity-70">{fmtDia(d.data)}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase bg-gray-50 w-28">Semana</th>
                </tr>
                <tr className="border-b border-gray-100">
                  <th></th>
                  {dias.map((d) => (
                    <th key={d.data} className={`pb-1.5 text-center text-[8px] font-medium uppercase tracking-wider text-gray-400 ${d.data === hojeIso ? "bg-torg-blue-50/60" : ""}`}>
                      meta · real
                    </th>
                  ))}
                  <th className="pb-1.5 text-center text-[8px] font-medium uppercase tracking-wider text-gray-400 bg-gray-50">real / meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quadro.linhas.map((l) => {
                  const pct = l.metaKg > 0 ? Math.round((l.realKg / l.metaKg) * 100) : null;
                  return (
                    <tr key={l.norm} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-bold text-torg-blue">{fmtOP(l.obra)}</span>
                      </td>
                      {l.celulas.map((c) => (
                        <td key={c.dia} className={`px-2 py-2 text-center ${c.dia === hojeIso ? "bg-torg-blue-50/40" : ""}`}>
                          <CelulaDia metaKg={c.metaKg} realKg={c.realKg} realPc={c.realPc} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center bg-gray-50/50">
                        <p className="text-sm font-extrabold tabular-nums text-torg-dark whitespace-nowrap">
                          {fmtTon(l.realKg)}<span className="text-torg-gray font-semibold text-xs"> / {fmtTon(l.metaKg)}</span>
                        </p>
                        {pct != null ? (
                          <span className={`inline-block mt-0.5 px-1.5 py-px rounded text-[10px] font-bold ${
                            pct >= 100 ? "bg-emerald-50 text-emerald-700" : pct >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                          }`}>{pct}%</span>
                        ) : (
                          <span className="inline-block mt-0.5 px-1.5 py-px rounded text-[10px] font-medium bg-gray-100 text-torg-gray" title="Sem meta programada — programe na Fila de Corte">sem meta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/70">
                  <td className="px-4 py-2.5 text-xs font-bold text-torg-dark uppercase">Total do dia</td>
                  {quadro.totalDia.map((t) => (
                    <td key={t.dia} className={`px-2 py-2 text-center ${t.dia === hojeIso ? "bg-torg-blue-50/60" : ""}`}>
                      <CelulaDia metaKg={t.metaKg} realKg={t.realKg} realPc={t.realPc} forte />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center bg-gray-100/80">
                    <p className="text-sm font-extrabold tabular-nums text-torg-dark whitespace-nowrap">
                      {fmtTon(quadro.resumo.realKg)}<span className="text-torg-gray font-semibold text-xs"> / {fmtTon(quadro.resumo.metaKg)}</span>
                    </p>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Célula do dia em PESO: meta em cima (discreta), realizado embaixo
// (protagonista, colorido pela aderência). Peças ficam no tooltip.
function CelulaDia({ metaKg, realKg, realPc, forte }) {
  if (!metaKg && !realKg) return <span className="text-gray-300">—</span>;
  const corReal = !realKg
    ? "text-gray-300"
    : metaKg > 0
      ? realKg >= metaKg * 0.999 ? "text-emerald-600" : "text-amber-600"
      : "text-torg-dark";
  return (
    <div title={realPc > 0 ? `${fmtNum(realPc)} peça(s) cortada(s)` : undefined}>
      <p className={`text-[10px] tabular-nums whitespace-nowrap ${metaKg > 0 ? "text-torg-gray" : "text-gray-300"}`}>
        {metaKg > 0 ? fmtPesoCell(metaKg) : "—"}
      </p>
      <p className={`${forte ? "text-sm" : "text-xs"} font-extrabold tabular-nums leading-tight whitespace-nowrap ${corReal}`}>
        {realKg > 0 ? fmtPesoCell(realKg) : "—"}
      </p>
    </div>
  );
}
