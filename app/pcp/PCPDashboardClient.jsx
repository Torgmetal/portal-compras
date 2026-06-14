"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, RefreshCw, Target, Scissors, Pencil, Check, X,
  Package, ListOrdered, CalendarRange, TrendingUp, Boxes, Factory,
  AlertTriangle, ChevronRight, Cpu,
} from "lucide-react";
import { fmtOP, fmtKg } from "@/lib/utils";
import { MAQUINA_LABEL } from "@/lib/maquina-corte";

const fmtHora = (d) => (d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

const ESTOQUE_LABEL = {
  DISPONIVEL: { label: "Disponível", cor: "text-emerald-700 bg-emerald-50" },
  PARCIAL: { label: "Parcial", cor: "text-amber-700 bg-amber-50" },
  INDISPONIVEL: { label: "Indisponível", cor: "text-red-700 bg-red-50" },
  NAO_CONFERIDO: { label: "Não conferido", cor: "text-gray-600 bg-gray-100" },
};

export default function PCPDashboardClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  // edição da meta (em kg)
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaKgInput, setMetaKgInput] = useState("");
  const [salvandoMeta, setSalvandoMeta] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/pcp/painel-corte");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setData(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarMeta = async () => {
    const kg = Number(String(metaKgInput).replace(/\./g, "").replace(",", "."));
    if (!(kg > 0)) return;
    setSalvandoMeta(true);
    try {
      const res = await fetch("/api/pcp/painel-corte", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaKg: Math.round(kg) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar meta");
      setData((prev) => prev && {
        ...prev,
        meta: { kgMes: json.metaKg },
        mes: { ...prev.mes, pctMeta: json.metaKg > 0 ? Math.round((prev.mes.cortadoKg / json.metaKg) * 100) : 0 },
      });
      setEditandoMeta(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setSalvandoMeta(false);
    }
  };

  // ── Syneco filtrado por obra ──────────────────────────────────
  const obrasSyneco = useMemo(() => {
    if (!data) return [];
    const s = new Set([
      ...data.syneco.emCorteAgora.map((a) => a.obra),
      ...data.syneco.cortadoHoje.map((a) => a.obra),
    ].filter(Boolean));
    return [...s].sort();
  }, [data]);
  const agoraFiltrado = useMemo(
    () => (data ? data.syneco.emCorteAgora.filter((a) => !filtroObra || a.obra === filtroObra) : []),
    [data, filtroObra]
  );
  const hojeFiltrado = useMemo(
    () => (data ? data.syneco.cortadoHoje.filter((a) => !filtroObra || a.obra === filtroObra) : []),
    [data, filtroObra]
  );
  const hojeTotais = useMemo(() => {
    const porMaq = new Map();
    for (const a of hojeFiltrado) {
      const acc = porMaq.get(a.maquina) || { un: 0, kg: 0 };
      acc.un += a.un; acc.kg += a.kg;
      porMaq.set(a.maquina, acc);
    }
    return {
      un: hojeFiltrado.reduce((s, a) => s + a.un, 0),
      kg: hojeFiltrado.reduce((s, a) => s + a.kg, 0),
      porMaquina: [...porMaq.entries()].sort((a, b) => b[1].kg - a[1].kg),
    };
  }, [hojeFiltrado]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-torg-blue" />
        <span className="ml-3 text-sm text-torg-gray">Carregando painel do corte...</span>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle size={24} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-600">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 text-sm bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50">
          Tentar novamente
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { meta, mes, carteira, cargaMaquinas, semMaquina, obras } = data;
  const projetaAcima = mes.projecaoKg >= meta.kgMes;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Scissors size={26} className="text-torg-blue" /> Painel PCP
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Meta × necessidade × produzido · estoque pra liberação · fila de prioridades · carga por máquina · Syneco ao vivo.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/pcp/pecas-corte" className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50">
            Liberar peças
          </Link>
          <Link href="/pcp/fila-corte" className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 inline-flex items-center gap-1">
            <ListOrdered size={13} /> Fila de Corte
          </Link>
          <button onClick={carregar} className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5">
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {/* ── 1. O mês: meta × cortado × projeção × carteira ─────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Meta (editável) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-torg-gray uppercase tracking-wider flex items-center gap-1"><Target size={11} /> Meta do mês</p>
            {!editandoMeta && (
              <button onClick={() => { setMetaKgInput(String(Math.round(meta.kgMes))); setEditandoMeta(true); }}
                className="p-1 text-gray-300 hover:text-torg-blue rounded" title="Editar meta">
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editandoMeta ? (
            <div className="flex items-center gap-1 mt-1">
              <input type="number" value={metaKgInput} onChange={(e) => setMetaKgInput(e.target.value)} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") salvarMeta(); if (e.key === "Escape") setEditandoMeta(false); }}
                className="w-28 px-2 py-1 text-sm border border-torg-blue rounded-lg tabular-nums" />
              <span className="text-xs text-torg-gray">kg</span>
              <button onClick={salvarMeta} disabled={salvandoMeta} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                {salvandoMeta ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button onClick={() => setEditandoMeta(false)} className="p-1 text-torg-gray hover:bg-gray-100 rounded"><X size={14} /></button>
            </div>
          ) : (
            <p className="text-2xl font-extrabold text-torg-dark mt-0.5">{fmtKg(meta.kgMes)}</p>
          )}
          <p className="text-[10px] text-torg-gray mt-0.5">por mês</p>
        </div>

        {/* Cortado no mês */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-[10px] text-torg-gray uppercase tracking-wider flex items-center gap-1"><Scissors size={11} /> Cortado no mês</p>
          <p className="text-2xl font-extrabold text-torg-dark mt-0.5">{fmtKg(mes.cortadoKg)}</p>
          <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${mes.pctMeta >= 100 ? "bg-emerald-500" : "bg-torg-blue"}`}
              style={{ width: `${Math.min(100, mes.pctMeta)}%` }} />
          </div>
          <p className="text-[10px] text-torg-gray mt-1"><strong className="text-torg-dark">{mes.pctMeta}%</strong> da meta · dia {mes.diaHoje}/{mes.diasNoMes}</p>
        </div>

        {/* Projeção */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-[10px] text-torg-gray uppercase tracking-wider flex items-center gap-1"><TrendingUp size={11} /> Projeção do mês</p>
          <p className={`text-2xl font-extrabold mt-0.5 ${projetaAcima ? "text-emerald-600" : "text-red-600"}`}>{fmtKg(mes.projecaoKg)}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">
            no ritmo atual — {projetaAcima ? "bate a meta" : `faltariam ${fmtKg(meta.kgMes - mes.projecaoKg)}`}
          </p>
        </div>

        {/* Carteira */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-[10px] text-torg-gray uppercase tracking-wider flex items-center gap-1"><Package size={11} /> Carteira a cortar</p>
          <p className="text-2xl font-extrabold text-torg-dark mt-0.5">{fmtKg(carteira.total.kg)}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">{carteira.total.pecas} peças subidas e ainda não cortadas</p>
        </div>
      </div>

      {/* ── 2. Funil: liberação → fila → programado → em corte ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs font-bold text-torg-dark uppercase tracking-wide mb-3">Fluxo do corte</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <EtapaFunil
            titulo="Aguardando liberação" icon={Boxes} href="/pcp/pecas-corte"
            pecas={carteira.pendente.pecas} kg={carteira.pendente.kg}
            extra={
              carteira.pendente.porEstoque.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {carteira.pendente.porEstoque.map((e) => (
                    <span key={e.statusEstoque} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${ESTOQUE_LABEL[e.statusEstoque].cor}`}>
                      {ESTOQUE_LABEL[e.statusEstoque].label}: {e.pecas}
                    </span>
                  ))}
                </div>
              )
            }
          />
          <EtapaFunil titulo="Na fila (sem programação)" icon={ListOrdered} href="/pcp/fila-corte"
            pecas={carteira.fila.semProgramacao.pecas} kg={carteira.fila.semProgramacao.kg} />
          <EtapaFunil titulo="Programado" icon={CalendarRange} href="/pcp/fila-corte"
            pecas={carteira.fila.programadas.pecas} kg={carteira.fila.programadas.kg} />
          <EtapaFunil titulo="Em corte" icon={Scissors} href="/pcp/fila-corte"
            pecas={carteira.fila.emCorte.pecas} kg={carteira.fila.emCorte.kg}
            extra={
              carteira.fila.atrasadas.pecas > 0 && (
                <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">
                  <AlertTriangle size={9} /> {carteira.fila.atrasadas.pecas} atrasada(s) vs meta
                </span>
              )
            }
          />
        </div>
      </div>

      {/* ── 3. Carga por máquina ─────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Cpu size={15} className="text-torg-blue" />
          <h3 className="text-sm font-bold text-torg-dark">Carga por máquina</h3>
          <span className="text-[10px] text-torg-gray ml-auto">backlog na fila ÷ capacidade média dos últimos 30 dias</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50/60">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Backlog</th>
                <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Capacidade média</th>
                <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase w-[34%]">Carga (dias de trabalho)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cargaMaquinas.length === 0 && semMaquina.pecas === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-torg-gray">Fila de corte vazia.</td></tr>
              )}
              {cargaMaquinas.map((m) => {
                const cor = m.diasCarga == null ? "bg-gray-300" : m.diasCarga <= 3 ? "bg-emerald-500" : m.diasCarga <= 7 ? "bg-amber-500" : "bg-red-500";
                const pct = m.diasCarga == null ? 0 : Math.min(100, (m.diasCarga / 10) * 100);
                return (
                  <tr key={m.maquina} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-torg-dark">{MAQUINA_LABEL[m.maquina] || m.maquina}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-torg-dark">
                      {m.backlogPecas} pç · <strong>{fmtKg(m.backlogKg)}</strong>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-torg-gray">
                      {m.capacidadeKgDia ? `${fmtKg(m.capacidadeKgDia)}/dia` : <span className="text-[10px] italic">sem histórico 30d</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-bold tabular-nums text-torg-dark w-14 text-right">
                          {m.diasCarga != null ? `${m.diasCarga.toLocaleString("pt-BR")} d` : "—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {semMaquina.pecas > 0 && (
          <div className="px-5 py-2.5 border-t border-amber-100 bg-amber-50/60 flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle size={13} className="shrink-0" />
            <span>
              <strong>{semMaquina.pecas} peça(s) · {fmtKg(semMaquina.kg)}</strong> na fila <strong>sem máquina definida</strong> — atribua um laser na tela{" "}
              <Link href="/pcp/pecas-corte" className="underline hover:text-amber-900">Peças / Corte</Link> pra entrar na carga, ou marque como <strong>conjunto</strong> (não corta, vai pra montagem).
            </span>
          </div>
        )}
      </div>

      {/* ── 4. Necessidade por obra + 5. Syneco ao vivo ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        {/* Necessidade por obra */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <Factory size={15} className="text-torg-blue" />
            <h3 className="text-sm font-bold text-torg-dark">Necessidade por obra</h3>
            <span className="text-[10px] text-torg-gray ml-auto">kg que ainda falta cortar de cada obra</span>
          </div>
          {obras.length === 0 ? (
            <p className="px-5 py-8 text-sm text-torg-gray text-center">Nenhuma obra com peças em aberto.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {obras.map((o) => (
                <div key={o.opNumero} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-torg-dark font-mono">{fmtOP(o.opNumero)}
                      {o.cliente && <span className="font-sans font-normal text-xs text-torg-gray ml-2">{o.cliente}</span>}
                      {!o.cliente && <span className="font-sans font-normal text-[10px] text-amber-600 ml-2" title="Obra sem OP cadastrada no portal">sem cadastro</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[180px]">
                        <div className="h-full rounded-full bg-torg-blue" style={{ width: `${o.pctAvancado}%` }} />
                      </div>
                      <span className="text-[10px] text-torg-gray tabular-nums">{o.pctAvancado}% avançado</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-torg-dark tabular-nums">{fmtKg(o.kgAberto)}</p>
                    <p className="text-[10px] text-torg-gray tabular-nums">{o.pecasAbertas} pç em aberto</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Syneco ao vivo (corte) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h3 className="text-sm font-bold text-torg-dark">Syneco · Corte</h3>
            <div className="ml-auto flex items-center gap-2">
              <select value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg bg-white">
                <option value="">Todas as obras</option>
                {obrasSyneco.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <Link href="/pcp/corte" className="text-[10px] text-torg-blue hover:underline inline-flex items-center">
                detalhes <ChevronRight size={11} />
              </Link>
            </div>
          </div>

          {/* Em corte agora */}
          <div className="px-5 py-2.5 bg-green-50/40 border-b border-green-100">
            <p className="text-[10px] font-bold text-torg-gray uppercase tracking-wider mb-1.5">Em corte agora ({agoraFiltrado.length})</p>
            {agoraFiltrado.length === 0 ? (
              <p className="text-xs text-torg-gray italic pb-1">Nenhuma máquina produzindo{filtroObra ? ` na obra ${filtroObra}` : ""} neste momento.</p>
            ) : (
              <div className="space-y-1 pb-1">
                {agoraFiltrado.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-torg-blue whitespace-nowrap">{a.maquina}</span>
                    <span className="text-torg-dark truncate flex-1" title={a.peca}>{a.peca}</span>
                    <span className="text-torg-gray whitespace-nowrap">{a.obra}</span>
                    <span className="text-torg-gray tabular-nums whitespace-nowrap">{a.produzidoUn}/{a.planejadoUn} un</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cortado hoje */}
          <div className="px-5 py-2.5">
            <p className="text-[10px] font-bold text-torg-gray uppercase tracking-wider mb-1.5">
              Cortado hoje — <span className="text-torg-dark">{hojeTotais.un.toLocaleString("pt-BR")} un · {fmtKg(hojeTotais.kg)}</span>
            </p>
            {hojeTotais.porMaquina.length === 0 ? (
              <p className="text-xs text-torg-gray italic">Nada finalizado hoje{filtroObra ? ` na obra ${filtroObra}` : ""} até agora.</p>
            ) : (
              <div className="space-y-1">
                {hojeTotais.porMaquina.map(([maq, v]) => (
                  <div key={maq || "—"} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-torg-dark w-40 truncate">{maq || "—"}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-torg-blue"
                        style={{ width: `${hojeTotais.kg > 0 ? Math.max(3, (v.kg / hojeTotais.kg) * 100) : 0}%` }} />
                    </div>
                    <span className="text-torg-gray tabular-nums whitespace-nowrap">{v.un} un · {fmtKg(v.kg)}</span>
                  </div>
                ))}
              </div>
            )}
            {hojeFiltrado.length > 0 && (
              <details className="mt-2">
                <summary className="text-[10px] text-torg-blue cursor-pointer hover:underline">
                  ver os {hojeFiltrado.length} apontamentos de hoje
                </summary>
                <div className="mt-1.5 max-h-56 overflow-y-auto space-y-0.5">
                  {hojeFiltrado.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[11px] py-0.5 border-b border-gray-50 last:border-0">
                      <span className="text-torg-gray tabular-nums">{fmtHora(a.hora)}</span>
                      <span className="font-mono text-torg-gray whitespace-nowrap">{a.maquina}</span>
                      <span className="text-torg-dark truncate flex-1" title={a.peca}>{a.peca}</span>
                      <span className="text-torg-gray">{a.obra}</span>
                      <span className="text-torg-gray tabular-nums whitespace-nowrap">{a.un} un · {fmtKg(a.kg)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EtapaFunil({ titulo, icon: Icon, href, pecas, kg, extra }) {
  return (
    <Link href={href} className="border border-gray-100 rounded-lg p-3 hover:border-torg-blue-200 hover:shadow-sm transition-all block">
      <p className="text-[10px] text-torg-gray uppercase tracking-wider flex items-center gap-1">
        <Icon size={11} /> {titulo}
      </p>
      <p className="text-lg font-extrabold text-torg-dark mt-1 tabular-nums">
        {pecas} <span className="text-xs font-semibold text-torg-gray">pç</span>
        <span className="text-sm font-bold text-torg-gray ml-2">{fmtKg(kg)}</span>
      </p>
      {extra}
    </Link>
  );
}
