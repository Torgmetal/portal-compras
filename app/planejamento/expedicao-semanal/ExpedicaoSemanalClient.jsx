"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, Truck, Factory, Weight,
  ArrowLeft, ChevronRight, AlertTriangle, CheckCircle2, Clock,
  Package, BarChart3, MapPin, Plus, Trash2, X,
} from "lucide-react";

const fmtKg = (v) => {
  if (!v) return "0 kg";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

const SETOR_LABEL = {
  PENDENTE: "Estoque", CORTE: "Preparação", MONTAGEM: "Montagem",
  SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

export default function ExpedicaoSemanalClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/planejamento/expedicao-semanal?semanas=8");
      if (!res.ok) throw new Error("Erro ao carregar");
      setData(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-torg-blue" size={28} />
        <span className="ml-3 text-torg-gray">Carregando planejamento de expedição...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-2" />
        <p className="text-sm text-red-600 mb-3">{erro}</p>
        <button onClick={carregar} className="text-sm text-torg-blue hover:underline flex items-center gap-1 mx-auto">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  const { semanas, obras, totaisSemanal, resumo } = data;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/planejamento" className="text-torg-gray hover:text-torg-blue">
              <ArrowLeft size={16} />
            </Link>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Expedição Semanal</h2>
          </div>
          <p className="text-xs text-torg-gray mt-0.5">
            Resumo de peso a expedir por obra — planejamento para produção
          </p>
        </div>
        <button onClick={carregar} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Obras Ativas"
          value={resumo.totalObras}
          icon={Factory}
          color="bg-torg-blue-50 text-torg-blue"
        />
        <KpiCard
          label="Peso Total"
          value={fmtKg(resumo.pesoTotalGeral)}
          icon={Weight}
          color="bg-gray-50 text-torg-dark"
        />
        <KpiCard
          label="Expedido"
          value={fmtKg(resumo.pesoExpedidoGeral)}
          subtitle={resumo.pesoTotalGeral > 0 ? `${(resumo.pesoExpedidoGeral / resumo.pesoTotalGeral * 100).toFixed(1)}%` : "0%"}
          icon={Truck}
          color="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          label="Pendente"
          value={fmtKg(resumo.pesoPendenteGeral)}
          icon={AlertTriangle}
          color={resumo.pesoPendenteGeral > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-torg-gray"}
        />
      </div>

      {/* Tabela Grade Semanal */}
      {obras.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Truck size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma obra com peso cadastrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/60">
                  <th className="text-left px-3 py-2.5 font-semibold text-torg-dark sticky left-0 bg-gray-50/60 z-10 min-w-[200px]">
                    Obra / OP
                  </th>
                  <th className="text-right px-2 py-2.5 font-medium text-torg-gray min-w-[80px]">Peso Total</th>
                  <th className="text-right px-2 py-2.5 font-medium text-torg-gray min-w-[80px]">Expedido</th>
                  <th className="text-right px-2 py-2.5 font-medium text-torg-gray min-w-[80px]">Pendente</th>
                  <th className="text-center px-2 py-2.5 font-medium text-torg-gray min-w-[60px]">%</th>
                  {semanas.map((s) => (
                    <th key={s.semana} className="text-center px-1.5 py-2.5 font-medium text-torg-gray min-w-[100px]">
                      <div className="text-[10px] font-semibold text-torg-dark">{s.semana}</div>
                      <div className="text-[9px] text-torg-gray font-normal">{s.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obras.map((obra) => (
                  <ObraRow key={obra.numero} obra={obra} semanas={semanas} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/80 border-t-2 border-gray-200">
                  <td className="px-3 py-2.5 font-bold text-torg-dark sticky left-0 bg-gray-50/80 z-10">TOTAL</td>
                  <td className="px-2 py-2.5 text-right font-bold text-torg-dark">{fmtKg(resumo.pesoTotalGeral)}</td>
                  <td className="px-2 py-2.5 text-right font-bold text-emerald-600">{fmtKg(resumo.pesoExpedidoGeral)}</td>
                  <td className="px-2 py-2.5 text-right font-bold text-amber-600">{fmtKg(resumo.pesoPendenteGeral)}</td>
                  <td className="px-2 py-2.5 text-center font-bold text-torg-blue">
                    {resumo.pesoTotalGeral > 0 ? `${(resumo.pesoExpedidoGeral / resumo.pesoTotalGeral * 100).toFixed(0)}%` : "—"}
                  </td>
                  {totaisSemanal.map((ts) => (
                    <td key={ts.semana} className="px-1.5 py-2.5 text-center">
                      {(ts.pesoPrevisto > 0 || ts.pesoReal > 0) ? (
                        <div>
                          {ts.pesoPrevisto > 0 && (
                            <div className="text-[10px] text-torg-gray">{fmtKg(ts.pesoPrevisto)}</div>
                          )}
                          {ts.pesoReal > 0 && (
                            <div className="text-[10px] font-bold text-emerald-600">{fmtKg(ts.pesoReal)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Cards por obra — visualização detalhada */}
      {obras.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-torg-dark mb-3 uppercase tracking-wide">Detalhamento por Obra</h3>
          <div className="space-y-3">
            {obras.map((obra) => (
              <ObraCard key={obra.numero} obra={obra} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, subtitle, icon: Icon, color }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
        <Icon size={14} className="opacity-50" />
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-tight mt-1">{value}</p>
      {subtitle && <p className="text-[10px] opacity-70 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ObraRow({ obra, semanas }) {
  const isLate = obra.pesoPendente > 0 && obra.status === "ATRASADA";

  return (
    <tr className={`${isLate ? "bg-red-50/30" : ""} hover:bg-gray-50/50`}>
      <td className="px-3 py-2 sticky left-0 bg-white z-10 min-w-[200px]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-torg-blue font-mono whitespace-nowrap shrink-0">{fmtOP(obra.numero)}</span>
          <span className="text-xs text-torg-dark font-medium truncate max-w-[100px]">{obra.cliente}</span>
          {obra.obra && <span className="text-[10px] text-torg-gray truncate max-w-[80px]">({obra.obra})</span>}
        </div>
      </td>
      <td className="px-2 py-2 text-right font-medium text-torg-dark whitespace-nowrap">{fmtKg(obra.pesoTotal)}</td>
      <td className="px-2 py-2 text-right text-emerald-600 font-medium whitespace-nowrap">{fmtKg(obra.pesoExpedido)}</td>
      <td className="px-2 py-2 text-right text-amber-600 font-medium whitespace-nowrap">{fmtKg(obra.pesoPendente)}</td>
      <td className="px-2 py-2 text-center">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          obra.progresso >= 100 ? "bg-emerald-100 text-emerald-700"
          : obra.progresso > 50 ? "bg-torg-blue-50 text-torg-blue"
          : obra.progresso > 0 ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-torg-gray"
        }`}>
          {obra.progresso}%
        </span>
      </td>
      {obra.semanal.map((s) => (
        <td key={s.semana} className="px-1.5 py-2 text-center">
          {(s.pesoPrevisto > 0 || s.pesoReal > 0 || s.tarefas > 0) ? (
            <div>
              {s.pesoPrevisto > 0 && (
                <div className="text-[10px] text-torg-gray">{fmtKg(s.pesoPrevisto)}</div>
              )}
              {s.pesoReal > 0 && (
                <div className="text-[10px] font-bold text-emerald-600">{fmtKg(s.pesoReal)}</div>
              )}
              {s.tarefas > 0 && s.pesoPrevisto === 0 && s.pesoReal === 0 && (
                <div className="text-[10px] text-torg-blue" title={s.nomesTarefas.join(", ")}>
                  📋 {s.tarefas}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-gray-300">—</span>
          )}
        </td>
      ))}
    </tr>
  );
}

function ObraCard({ obra }) {
  const [expanded, setExpanded] = useState(false);
  const [itens, setItens] = useState(obra.itens || []);
  const [salvandoId, setSalvandoId] = useState(null);
  const [modalItem, setModalItem] = useState(null); // conjunto sendo dividido por destino

  useEffect(() => { setItens(obra.itens || []); }, [obra.itens]);

  const parseOrdem = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const ordenarItens = (arr) => [...arr].sort((a, b) => (a.ordemCampo ?? Infinity) - (b.ordemCampo ?? Infinity));

  async function salvarCampo(id, patch, novo) {
    setSalvandoId(id);
    try {
      const res = await fetch(`/api/producao/pecas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setItens((prev) => ordenarItens(prev.map((x) => (x.id === id ? { ...x, ...novo } : x))));
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setSalvandoId(null);
    }
  }

  function onChangeOrdem(id, valor) {
    const n = parseOrdem(valor);
    setItens((prev) => prev.map((x) => (x.id === id ? { ...x, ordemCampo: n } : x)));
  }
  const salvarOrdem = (id, valor) => salvarCampo(id, { ordemCampo: parseOrdem(valor) }, { ordemCampo: parseOrdem(valor) });

  function aplicarEntregas(itemId, entregas) {
    setItens((prev) => prev.map((x) => (x.id === itemId ? { ...x, entregas } : x)));
  }

  // Destinos usados na obra (sugestões) + resumo por destino (unidades + peso proporcional)
  const destinosUsados = [...new Set(itens.flatMap((i) => (i.entregas || []).map((e) => e.destino)).filter(Boolean))].sort();
  const porDestino = {};
  let naoAlocadoUn = 0;
  for (const it of itens) {
    const aloc = (it.entregas || []).reduce((s, e) => s + (e.quantidade || 0), 0);
    naoAlocadoUn += Math.max(0, (it.qte || 0) - aloc);
    for (const e of it.entregas || []) {
      const a = (porDestino[e.destino] = porDestino[e.destino] || { un: 0, kg: 0 });
      a.un += e.quantidade || 0;
      a.kg += (it.qte || 0) > 0 ? (e.quantidade / it.qte) * (it.peso || 0) : 0;
    }
  }

  const diasRestantes = obra.dataFimPrevista
    ? Math.ceil((new Date(obra.dataFimPrevista) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // Status de produção para "pronto para expedir"
  const prontoExpedir = (obra.statusProducao?.PINTURA?.peso || 0);
  const emFabricacao = Object.entries(obra.statusProducao || {})
    .filter(([s]) => !["PENDENTE", "EXPEDIDO"].includes(s))
    .reduce((s, [, v]) => s + v.peso, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight size={14} className={`text-torg-gray transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} />
          <span className="text-sm font-bold text-torg-blue font-mono whitespace-nowrap shrink-0">{fmtOP(obra.numero)}</span>
          <span className="text-sm text-torg-dark font-medium truncate">{obra.cliente}</span>
          {obra.obra && <span className="text-xs text-torg-gray whitespace-nowrap shrink-0">({obra.obra})</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Weight size={12} className="text-torg-gray" />
            <span className="text-xs text-torg-dark font-semibold">{fmtKg(obra.pesoTotal)}</span>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            obra.progresso >= 100 ? "bg-emerald-100 text-emerald-700"
            : obra.progresso > 0 ? "bg-torg-blue-50 text-torg-blue"
            : "bg-gray-100 text-torg-gray"
          }`}>
            {obra.progresso}% expedido
          </span>
          {diasRestantes !== null && diasRestantes < 0 && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded-full">
              {Math.abs(diasRestantes)}d atrasada
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {/* Barra de progresso */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-torg-gray mb-1">
              <span>Progresso de expedição</span>
              <span className="font-semibold text-torg-dark">{fmtKg(obra.pesoExpedido)} / {fmtKg(obra.pesoTotal)}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.min(obra.progresso, 100)}%` }}
              />
            </div>
          </div>

          {/* Resumo rápido */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50 rounded-lg px-3 py-2">
              <p className="text-[9px] text-emerald-700 font-medium uppercase">Pronto p/ expedir</p>
              <p className="text-sm font-bold text-emerald-700">{fmtKg(prontoExpedir)}</p>
              <p className="text-[9px] text-emerald-600">Pintura concluída</p>
            </div>
            <div className="bg-amber-50 rounded-lg px-3 py-2">
              <p className="text-[9px] text-amber-700 font-medium uppercase">Em fabricação</p>
              <p className="text-sm font-bold text-amber-700">{fmtKg(emFabricacao)}</p>
              <p className="text-[9px] text-amber-600">Corte a Pintura</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[9px] text-torg-gray font-medium uppercase">Pendente início</p>
              <p className="text-sm font-bold text-torg-gray">{fmtKg(obra.statusProducao?.PENDENTE?.peso || 0)}</p>
              <p className="text-[9px] text-torg-gray">Em estoque</p>
            </div>
          </div>

          {/* Distribuição por etapa */}
          <div>
            <p className="text-[10px] font-semibold text-torg-dark mb-1.5">Distribuição por etapa</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(obra.statusProducao || {}).map(([status, info]) => (
                <span key={status} className="px-1.5 py-0.5 bg-gray-50 text-[10px] text-torg-gray rounded border border-gray-100">
                  {SETOR_LABEL[status] || status}: <strong>{fmtKg(info.peso)}</strong> ({info.qte} un)
                </span>
              ))}
            </div>
          </div>

          {/* Itens a expedir (conjuntos) */}
          {itens.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-torg-dark mb-1.5">
                Itens a expedir <span className="text-torg-gray font-normal">({itens.length} conjuntos · nº = ordem de envio · entregas = quantidade por local)</span>
              </p>
              {/* Resumo por destino (para a expedição romanear por local) */}
              {(destinosUsados.length > 0 || naoAlocadoUn > 0) && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {Object.entries(porDestino).map(([k, v]) => (
                    <span key={k} className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-torg-blue-50 text-torg-blue inline-flex items-center gap-1">
                      <MapPin size={10} /> {k}: {v.un} un · {fmtKg(v.kg)}
                    </span>
                  ))}
                  {naoAlocadoUn > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                      Sem destino: {naoAlocadoUn} un
                    </span>
                  )}
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-72 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50/60 sticky top-0">
                    <tr>
                      <th className="w-12 px-1 py-1.5 text-center font-medium text-gray-500" title="Ordem de envio a campo">Ordem</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-500">Marca</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-500">Descrição</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-500">Qtd</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-500">Peso</th>
                      <th className="text-center px-2 py-1.5 font-medium text-gray-500">Situação</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-500">Entregas (quantidade por local)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {itens.map((it, i) => {
                      const exp = it.status === "EXPEDIDO";
                      const pronto = it.status === "PINTURA";
                      return (
                        <tr key={`${it.id || it.marca}-${i}`} className={`hover:bg-gray-50/50 ${it.ordemCampo != null ? "bg-amber-50/70" : ""}`}>
                          <td className="px-1 py-1 text-center">
                            <input
                              type="number" min="1" value={it.ordemCampo ?? ""}
                              onChange={(e) => onChangeOrdem(it.id, e.target.value)}
                              onBlur={(e) => salvarOrdem(it.id, e.target.value)}
                              disabled={salvandoId === it.id}
                              placeholder="—"
                              className="w-10 px-1 py-0.5 text-center text-[11px] tabular-nums border border-gray-200 rounded focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30 disabled:opacity-50"
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono font-semibold text-torg-dark whitespace-nowrap">{it.marca}</td>
                          <td className="px-2 py-1.5 text-torg-gray max-w-[220px] truncate" title={it.descricao || ""}>{it.descricao || "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{it.qte}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(it.peso)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                              exp ? "bg-emerald-100 text-emerald-700" : pronto ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-torg-gray"
                            }`}>
                              {exp ? "Expedido" : pronto ? "Pronto p/ expedir" : (SETOR_LABEL[it.status] || it.status)}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            {(() => {
                              const entregas = it.entregas || [];
                              const aloc = entregas.reduce((s, e) => s + (e.quantidade || 0), 0);
                              const resto = Math.max(0, (it.qte || 0) - aloc);
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {entregas.map((e) => (
                                    <span key={e.id || e.destino} className="text-[10px] px-1.5 py-0.5 rounded bg-torg-blue-50 text-torg-blue font-medium whitespace-nowrap">
                                      {e.destino}: <strong className="tabular-nums">{e.quantidade}</strong>
                                    </span>
                                  ))}
                                  {resto > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 whitespace-nowrap">
                                      {entregas.length ? `falta ${resto}` : `${resto} sem destino`}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setModalItem(it)}
                                    className="text-[10px] px-1.5 py-0.5 rounded border border-torg-blue/40 text-torg-blue hover:bg-torg-blue/5 inline-flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <MapPin size={10} /> {entregas.length ? "Editar" : "Definir entregas"}
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {modalItem && (
        <ModalEntregas
          item={modalItem}
          destinosObra={destinosUsados}
          onClose={() => setModalItem(null)}
          onSaved={(entregas) => { aplicarEntregas(modalItem.id, entregas); setModalItem(null); }}
        />
      )}
    </div>
  );
}

/**
 * ModalEntregas — divide as unidades de um conjunto entre vários endereços de
 * entrega, com a quantidade que vai para cada local. Substitui todas as entregas
 * do conjunto via POST /api/producao/pecas/[id]/entregas.
 */
function ModalEntregas({ item, destinosObra, onClose, onSaved }) {
  const [linhas, setLinhas] = useState(
    (item.entregas || []).length
      ? item.entregas.map((e) => ({ destino: e.destino, quantidade: String(e.quantidade) }))
      : [{ destino: "", quantidade: "" }]
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const total = item.qte || 0;
  const alocado = linhas.reduce((s, l) => s + (parseInt(l.quantidade, 10) || 0), 0);
  const resto = total - alocado;

  const setLinha = (i, patch) => setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((prev) => [...prev, { destino: "", quantidade: resto > 0 ? String(resto) : "" }]);
  const removerLinha = (i) => setLinhas((prev) => prev.filter((_, idx) => idx !== i));

  const destinosSugeridos = [...new Set(destinosObra || [])].filter(Boolean);

  async function salvar() {
    setErro("");
    // monta payload: só linhas com destino e quantidade > 0
    const entregas = linhas
      .map((l) => ({ destino: (l.destino || "").trim(), quantidade: parseInt(l.quantidade, 10) || 0 }))
      .filter((e) => e.destino && e.quantidade > 0);

    if (linhas.some((l) => (l.destino || "").trim() && !(parseInt(l.quantidade, 10) > 0))) {
      setErro("Preencha a quantidade de cada destino (mínimo 1)."); return;
    }
    if (linhas.some((l) => !(l.destino || "").trim() && parseInt(l.quantidade, 10) > 0)) {
      setErro("Informe o local de entrega de cada quantidade."); return;
    }
    if (alocado > total) {
      setErro(`Total alocado (${alocado}) maior que a quantidade do conjunto (${total}).`); return;
    }
    // destinos duplicados
    const nomes = entregas.map((e) => e.destino.toLowerCase());
    if (new Set(nomes).size !== nomes.length) {
      setErro("Há destinos repetidos — junte a quantidade num único local."); return;
    }

    setSalvando(true);
    try {
      const res = await fetch(`/api/producao/pecas/${item.id}/entregas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregas }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar entregas");
      onSaved(json.entregas || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5">
              <MapPin size={14} className="text-torg-blue" /> Entregas por local
            </p>
            <p className="text-[11px] text-torg-gray mt-0.5 truncate">
              <span className="font-mono font-semibold text-torg-dark">{item.marca}</span>
              {item.descricao ? ` · ${item.descricao}` : ""} · {total} un
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded hover:bg-gray-100 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 overflow-y-auto space-y-2">
          <datalist id={`destinos-modal-${item.id}`}>
            {destinosSugeridos.map((d) => <option key={d} value={d} />)}
          </datalist>
          {linhas.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                list={`destinos-modal-${item.id}`}
                value={l.destino}
                onChange={(e) => setLinha(i, { destino: e.target.value })}
                placeholder="Local de entrega (ex.: Canteiro A)"
                className="flex-1 min-w-0 px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30"
              />
              <input
                type="number" min="1" max={total}
                value={l.quantidade}
                onChange={(e) => setLinha(i, { quantidade: e.target.value })}
                placeholder="Qtd"
                className="w-20 px-2 py-1.5 text-[12px] text-right tabular-nums border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue/30"
              />
              <button
                type="button"
                onClick={() => removerLinha(i)}
                disabled={linhas.length === 1}
                className="p-1.5 text-torg-gray hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
                title="Remover este destino"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addLinha}
            className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"
          >
            <Plus size={13} /> Adicionar destino
          </button>

          {/* Indicador de alocação */}
          <div className={`mt-1 text-[11px] rounded-lg px-3 py-2 flex items-center justify-between ${
            resto === 0 ? "bg-emerald-50 text-emerald-700"
            : resto < 0 ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-700"
          }`}>
            <span>
              Alocado <strong className="tabular-nums">{alocado}</strong> de <strong className="tabular-nums">{total}</strong> un
            </span>
            <span className="font-semibold">
              {resto === 0 ? "tudo distribuído"
                : resto < 0 ? `${Math.abs(resto)} a mais`
                : `${resto} sem destino`}
            </span>
          </div>

          {erro && (
            <p className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {erro}
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={salvando}
            className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || resto < 0}
            className="px-3 py-1.5 text-[12px] font-semibold text-white bg-torg-blue rounded-lg hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Salvar entregas
          </button>
        </div>
      </div>
    </div>
  );
}
