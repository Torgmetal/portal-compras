"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import { useStore } from "@/lib/store";
import MontarRomaneio from "./MontarRomaneio";
import {
  PackageCheck, Search, Loader2, AlertCircle, ArrowLeft, RefreshCw, Package,
  CheckCircle2, Clock, FileText, Weight, CloudDownload, Boxes,
  Filter, ArrowUp, ArrowDown, ChevronsUpDown, Check, X,
} from "lucide-react";

// Grupo/prefixo da marca (tira os dígitos finais): T64A1→T64A, T84-AC10→T84-AC, "6"→"#".
const grupoDe = (marca) => {
  const s = String(marca || "").trim();
  const g = s.replace(/[\s-]*\d+$/, "").trim();
  return g || "#";
};

const fmtKg = (v) => (v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const pct = (v) => `${Math.round(v || 0)}%`;

export default function ExpedicaoOpClient({ ops }) {
  const { showToast } = useStore();
  const [opSel, setOpSel] = useState(null);
  const [busca, setBusca] = useState("");

  const opsFiltradas = useMemo(() => {
    if (!busca.trim()) return ops;
    const q = busca.toLowerCase();
    return ops.filter((o) => o.numero?.toLowerCase().includes(q) || o.cliente?.toLowerCase().includes(q) || o.obra?.toLowerCase().includes(q));
  }, [ops, busca]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-3">
          <PackageCheck size={28} className="text-torg-blue" /> Expedição por OP
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Lista de expedição por OP — previsto (Engenharia) × expedido, e geração de romaneios.
        </p>
      </div>

      {!opSel ? (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar OP por número, cliente ou obra..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>
          {opsFiltradas.length === 0 ? (
            <div className="text-center py-12 text-torg-gray">
              <Package size={32} className="mx-auto mb-2 text-gray-300" /> <p className="text-sm">Nenhuma OP encontrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {opsFiltradas.map((op) => (
                <button key={op.id} onClick={() => setOpSel(op)}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:border-torg-blue hover:shadow-md transition-all group">
                  <p className="font-mono text-lg font-bold text-torg-blue group-hover:text-torg-blue-700">{fmtOP(op.numero)}</p>
                  <p className="text-sm text-torg-dark mt-1 truncate">{op.cliente}</p>
                  {op.obra && <p className="text-xs text-torg-gray truncate">{op.obra}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <VisaoOP op={opSel} onVoltar={() => setOpSel(null)} showToast={showToast} />
      )}
    </div>
  );
}

function VisaoOP({ op, onVoltar, showToast }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [aba, setAba] = useState("lista"); // lista | montar
  const [filtro, setFiltro] = useState("todas"); // todas | expedidas | pendentes
  const [q, setQ] = useState("");
  const [sortCol, setSortCol] = useState("marca");
  const [sortDir, setSortDir] = useState("asc");
  const [gruposSel, setGruposSel] = useState(() => new Set()); // vazio = todos
  const [painelGrupo, setPainelGrupo] = useState(false);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };
  const setaSort = (col) => sortCol !== col
    ? <ChevronsUpDown size={13} className="text-torg-gray/70" />
    : sortDir === "asc" ? <ArrowUp size={13} className="text-torg-blue" /> : <ArrowDown size={13} className="text-torg-blue" />;

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const res = await fetch(`/api/expedicao/op/${op.id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [op.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const res = await fetch(`/api/expedicao/op/${op.id}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao sincronizar");
      setDados(j);
      showToast("Lista sincronizada do SharePoint", "success");
    } catch (e) { showToast(e.message, "error"); } finally { setSincronizando(false); }
  }

  // Grupos de marca (prefixos) com contagem, para o filtro estilo Excel.
  const grupos = useMemo(() => {
    const map = new Map();
    for (const m of dados?.marcas || []) { const g = grupoDe(m.marca); map.set(g, (map.get(g) || 0) + 1); }
    return [...map.entries()].map(([grupo, n]) => ({ grupo, n }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo, undefined, { numeric: true, sensitivity: "base" }));
  }, [dados]);

  const marcasFiltradas = useMemo(() => {
    let base = dados?.marcas || [];
    if (filtro === "expedidas") base = base.filter((m) => m.expedido);
    else if (filtro === "pendentes") base = base.filter((m) => !m.expedido);
    if (gruposSel.size) base = base.filter((m) => gruposSel.has(grupoDe(m.marca)));
    if (q.trim()) {
      const s = q.toLowerCase();
      base = base.filter((m) => String(m.marca).toLowerCase().includes(s) || String(m.descricao || "").toLowerCase().includes(s));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = {
      marca: (a, b) => String(a.marca).localeCompare(String(b.marca), undefined, { numeric: true, sensitivity: "base" }),
      qte: (a, b) => (a.qte || 0) - (b.qte || 0),
      peso: (a, b) => (a.pesoTotal || 0) - (b.pesoTotal || 0),
      status: (a, b) => (a.expedido ? 1 : 0) - (b.expedido ? 1 : 0),
      data: (a, b) => new Date(a.dataExpedicao || 0) - new Date(b.dataExpedicao || 0),
    }[sortCol] || (() => 0);
    return [...base].sort((a, b) => dir * cmp(a, b));
  }, [dados, filtro, q, gruposSel, sortCol, sortDir]);

  const toggleGrupo = (g) => setGruposSel((prev) => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  return (
    <div className="space-y-5">
      {/* Header da OP */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onClick={onVoltar} className="text-sm text-torg-blue hover:text-torg-blue-700 flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Voltar às OPs</button>
          <h3 className="text-2xl font-extrabold text-torg-dark tracking-tight">
            <span className="font-mono text-torg-blue">{fmtOP(op.numero)}</span>
            <span className="text-lg font-normal text-torg-gray ml-2">— {op.cliente}</span>
          </h3>
          {op.obra && <p className="text-sm text-torg-gray">{op.obra}</p>}
        </div>
        <button onClick={sincronizar} disabled={sincronizando}
          title="Re-importa a Lista de Expedição da pasta da Engenharia no SharePoint"
          className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
          {sincronizando ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />} Sincronizar SharePoint
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-torg-gray"><Loader2 size={26} className="animate-spin mx-auto mb-2" /> Carregando lista da OP…</div>
      ) : erro ? (
        <div className="text-center py-16">
          <AlertCircle size={26} className="mx-auto text-red-500 mb-2" /><p className="text-red-600 text-sm mb-3">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue inline-flex items-center gap-1"><RefreshCw size={13} /> Tentar novamente</button>
        </div>
      ) : !dados?.temLista ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm text-center py-16 px-6">
          <Boxes size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-torg-dark">Nenhuma Lista de Expedição importada para esta OP</p>
          <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">
            A lista vem de <strong>2. Engenharia / 2.6 Lista de expedição</strong> no SharePoint (arquivo “LE”).
            Clique em <strong>Sincronizar SharePoint</strong> para importar.
          </p>
          <button onClick={sincronizar} disabled={sincronizando}
            className="mt-4 text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {sincronizando ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />} Sincronizar agora
          </button>
        </div>
      ) : (
        <>
          {/* Abas: Lista da OP × Montar romaneio */}
          <div className="flex items-center gap-1 border-b border-gray-200">
            <button onClick={() => setAba("lista")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${aba === "lista" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
              <Boxes size={14} className="inline mr-1.5 -mt-0.5" /> Lista da OP
            </button>
            <button onClick={() => setAba("montar")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${aba === "montar" ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
              <FileText size={14} className="inline mr-1.5 -mt-0.5" /> Montar romaneio
            </button>
          </div>

          {aba === "montar" ? (
            <MontarRomaneio op={op} marcas={dados.marcas} onCriado={carregar} showToast={showToast} />
          ) : (
          <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi Icon={CheckCircle2} cor="bg-emerald-600" label="Marcas expedidas" valor={`${dados.kpis.marcasExpedidas}/${dados.kpis.marcasTotal}`} sub={pct(dados.kpis.pctMarcas)} />
            <Kpi Icon={Clock} cor="bg-amber-500" label="Marcas pendentes" valor={String(dados.kpis.marcasPendentes)} sub="a expedir" />
            <Kpi Icon={Weight} cor="bg-torg-blue" label="Peso expedido" valor={fmtKg(dados.kpis.pesoExpedido)} sub={`${pct(dados.kpis.pctPeso)} de ${fmtKg(dados.kpis.pesoContratado)}`} />
            <Kpi Icon={Package} cor="bg-torg-dark" label="Peso faltante" valor={fmtKg(dados.kpis.pesoFaltante)} sub="restante" />
          </div>

          {/* Barra de progresso */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-torg-dark">Progresso de expedição (peso)</p>
              <p className="text-sm font-bold text-torg-blue">{pct(dados.kpis.pctPeso)}</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="bg-torg-blue h-3 rounded-full transition-all" style={{ width: `${Math.min(dados.kpis.pctPeso, 100)}%` }} />
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {[["todas", "Todas"], ["pendentes", "Pendentes"], ["expedidas", "Expedidas"]].map(([v, label]) => (
                <button key={v} onClick={() => setFiltro(v)}
                  className={`px-3 py-1.5 font-medium ${filtro === v ? "bg-torg-blue text-white" : "text-torg-dark hover:bg-gray-100"}`}>{label}</button>
              ))}
            </div>
            {/* Filtro por grupo de marca (autofilter estilo Excel) */}
            <div className="relative">
              <button onClick={() => setPainelGrupo((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold ${gruposSel.size ? "border-torg-blue text-torg-blue bg-torg-blue-50" : "border-gray-300 text-torg-dark hover:bg-gray-100"}`}>
                <Filter size={14} /> Grupo{gruposSel.size ? ` (${gruposSel.size})` : ""}
              </button>
              {painelGrupo && (
                <PainelGrupos grupos={grupos} gruposSel={gruposSel} onToggle={toggleGrupo}
                  onTodos={() => setGruposSel(new Set())} onFechar={() => setPainelGrupo(false)} />
              )}
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca ou descrição..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent" />
            </div>
            <span className="text-xs text-torg-gray ml-auto">{marcasFiltradas.length} de {dados.marcas.length} marcas</span>
          </div>

          {/* Chips dos grupos selecionados */}
          {gruposSel.size > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap -mt-2">
              <span className="text-[11px] text-torg-gray">Grupos:</span>
              {[...gruposSel].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((g) => (
                <button key={g} onClick={() => toggleGrupo(g)} className="inline-flex items-center gap-1 text-[11px] bg-torg-blue-50 text-torg-blue border border-torg-blue-200 rounded-full px-2 py-0.5 hover:bg-torg-blue-100">
                  {g} <X size={11} />
                </button>
              ))}
              <button onClick={() => setGruposSel(new Set())} className="text-[11px] text-torg-gray hover:text-torg-dark underline">limpar</button>
            </div>
          )}

          {/* Tabela de marcas */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-100 border-b border-gray-200"><tr className="text-torg-dark">
                <th className="px-3 py-2.5 font-semibold text-left">
                  <span className="inline-flex items-center gap-1.5">
                    <button onClick={() => toggleSort("marca")} className="inline-flex items-center gap-1 hover:text-torg-blue">Marca {setaSort("marca")}</button>
                    <button onClick={() => setPainelGrupo((v) => !v)} title="Filtrar por grupo de marca" className={`p-1 rounded border ${gruposSel.size ? "text-torg-blue border-torg-blue bg-torg-blue-50" : "text-torg-gray border-gray-300 hover:bg-white"}`}><Filter size={12} /></button>
                  </span>
                </th>
                <th className="px-3 py-2.5 font-semibold text-left">Descrição</th>
                <th className="px-3 py-2.5 font-semibold text-right"><button onClick={() => toggleSort("qte")} className="inline-flex items-center gap-1 hover:text-torg-blue">Qtd {setaSort("qte")}</button></th>
                <th className="px-3 py-2.5 font-semibold text-right"><button onClick={() => toggleSort("peso")} className="inline-flex items-center gap-1 hover:text-torg-blue">Peso {setaSort("peso")}</button></th>
                <th className="px-3 py-2.5 font-semibold text-center"><button onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 hover:text-torg-blue mx-auto">Status {setaSort("status")}</button></th>
                <th className="px-3 py-2.5 font-semibold text-left">Romaneio</th>
                <th className="px-3 py-2.5 font-semibold text-left"><button onClick={() => toggleSort("data")} className="inline-flex items-center gap-1 hover:text-torg-blue">Data {setaSort("data")}</button></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {marcasFiltradas.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-torg-gray text-sm">Nenhuma marca {filtro !== "todas" ? `(${filtro})` : ""} para o filtro atual.</td></tr>
                ) : marcasFiltradas.map((m) => (
                  <tr key={m.marca} className={`hover:bg-gray-50/50 ${m.expedido ? "bg-emerald-50/20" : ""}`}>
                    <td className="px-3 py-2 font-mono font-semibold text-torg-dark whitespace-nowrap">{m.marca}</td>
                    <td className="px-3 py-2 text-torg-gray max-w-[320px] truncate" title={m.descricao || ""}>{m.descricao || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.qte ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtKg(m.pesoTotal)}</td>
                    <td className="px-3 py-2 text-center">
                      {m.expedido ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> Expedido</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full"><Clock size={11} /> Pendente</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-torg-blue font-medium">{m.romaneio || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-torg-gray">{fmtData(m.dataExpedicao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rodapé: frentes/arquivos importados */}
          {dados.frentes?.length > 0 && (
            <div className="text-[11px] text-torg-gray flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1"><FileText size={12} /> Fonte:</span>
              {dados.frentes.map((f) => (
                <span key={f.frente} title={`Importado ${fmtDataHora(f.importadoEm)}`}>
                  <strong className="text-torg-dark">{f.arquivo}</strong>{f.revisao ? ` (R${f.revisao})` : ""} · {f.marcas} marcas
                </span>
              ))}
            </div>
          )}
          </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ Icon, cor, label, valor, sub }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${cor} p-2.5 rounded-lg flex-shrink-0`}><Icon size={20} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-xs text-torg-gray truncate">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{valor}</p>
        {sub && <p className="text-[10px] text-torg-gray truncate">{sub}</p>}
      </div>
    </div>
  );
}

// Painel autofilter (estilo Excel) para escolher grupos de marca (T64A, T64B…).
function PainelGrupos({ grupos, gruposSel, onToggle, onTodos, onFechar }) {
  const [q, setQ] = useState("");
  const lista = q.trim() ? grupos.filter((g) => g.grupo.toLowerCase().includes(q.toLowerCase())) : grupos;
  return (
    <>
      <button className="fixed inset-0 z-40 cursor-default" onClick={onFechar} aria-hidden tabIndex={-1} />
      <div className="absolute z-50 mt-1 left-0 w-64 bg-white rounded-xl border border-gray-200 shadow-lg p-2">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-[11px] font-semibold text-torg-dark uppercase tracking-wide">Grupo de marca</span>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
        <div className="relative mb-1.5">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo..." autoFocus
            className="w-full pl-8 pr-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-torg-blue outline-none" />
        </div>
        <button onClick={onTodos} className={`w-full text-left text-[12px] px-2 py-1.5 rounded-lg mb-0.5 ${gruposSel.size === 0 ? "bg-torg-blue-50 text-torg-blue font-medium" : "text-torg-gray hover:bg-gray-50"}`}>
          Todos os grupos
        </button>
        <div className="max-h-64 overflow-y-auto">
          {lista.map((g) => {
            const on = gruposSel.has(g.grupo);
            return (
              <button key={g.grupo} onClick={() => onToggle(g.grupo)}
                className={`w-full flex items-center gap-2 text-left text-[12px] px-2 py-1.5 rounded-lg ${on ? "bg-torg-blue-50" : "hover:bg-gray-50"}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>{on && <Check size={11} className="text-white" />}</span>
                <span className="font-mono text-torg-dark flex-1 truncate">{g.grupo}</span>
                <span className="text-[10px] text-torg-gray">{g.n}</span>
              </button>
            );
          })}
          {lista.length === 0 && <p className="text-[11px] text-torg-gray text-center py-3">Nenhum grupo.</p>}
        </div>
      </div>
    </>
  );
}
