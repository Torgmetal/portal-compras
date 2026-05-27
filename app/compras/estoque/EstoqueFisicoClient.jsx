"use client";
import { useState, useMemo, useEffect } from "react";
import {
  Warehouse, Search, RefreshCw, Loader2, AlertCircle,
  ChevronDown, ChevronRight, X, Layers, Weight,
} from "lucide-react";

const fmtPeso = (kg) => {
  if (!kg && kg !== 0) return "—";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ton`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};
const fmtQtd = (v) => (v != null ? Number(v).toLocaleString("pt-BR") : "—");
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const PERFIL_LABELS = {
  W: "Perfil W", L: "Cantoneira", U: "Perfil U", C: "Perfil C",
  CH: "Chapa", CHX: "Chapa Xadrez", TB: "Tubo", "TBØ": "Tubo Redondo",
  "Ø": "Barra Redonda", "BRØ": "Barra Redonda", BCH: "Barra Chata",
  BRC: "Barra Redonda CA", HP: "Perfil HP", FR: "Ferro", H: "Perfil H",
  UE: "Perfil UE", UL: "Perfil UL", UD: "Perfil UD", UDB: "Perfil UDB",
};

const PERFIL_COLORS = {
  W: "bg-blue-100 text-blue-800",
  L: "bg-emerald-100 text-emerald-800",
  U: "bg-purple-100 text-purple-800",
  C: "bg-purple-100 text-purple-800",
  CH: "bg-amber-100 text-amber-800",
  CHX: "bg-amber-100 text-amber-800",
  TB: "bg-orange-100 text-orange-800",
  "TBØ": "bg-orange-100 text-orange-800",
  "Ø": "bg-cyan-100 text-cyan-800",
  "BRØ": "bg-cyan-100 text-cyan-800",
  BCH: "bg-teal-100 text-teal-800",
  HP: "bg-indigo-100 text-indigo-800",
};

export default function EstoqueFisicoClient() {
  const [materiais, setMateriais] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("");
  const [filtroAco, setFiltroAco] = useState("");
  const [expandidos, setExpandidos] = useState(new Set());

  // ── Carregar dados ────────────────────────────────────────
  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/estoque/fisico");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      setMateriais(data.materiais || []);
      setResumo(data.resumo || null);
      setUltimaSync(data.ultimaSync);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // ── Sync SharePoint ───────────────────────────────────────
  const sincronizar = async () => {
    setSincronizando(true);
    setErro("");
    setInfo("");
    try {
      const res = await fetch("/api/estoque/fisico", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na sincronização");
      setInfo(`${data.importados} itens importados (${fmtPeso(data.pesoTotalKg)})`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSincronizando(false);
    }
  };

  // ── Dados derivados ───────────────────────────────────────
  const perfisDisponiveis = useMemo(() => {
    if (!resumo?.porPerfil) return [];
    return Object.entries(resumo.porPerfil)
      .map(([perfil, d]) => ({ perfil, label: PERFIL_LABELS[perfil] || perfil, ...d }))
      .sort((a, b) => b.peso - a.peso);
  }, [resumo]);

  const acosDisponiveis = useMemo(() => {
    const set = new Set();
    for (const m of materiais) if (m.aco) set.add(m.aco);
    return [...set].sort();
  }, [materiais]);

  const filtrados = useMemo(() => {
    return materiais.filter((m) => {
      if (filtroPerfil && m.perfil !== filtroPerfil) return false;
      if (filtroAco && m.aco !== filtroAco) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hay = `${m.perfil} ${m.bitola} ${m.aco || ""}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [materiais, busca, filtroPerfil, filtroAco]);

  const pesoFiltrado = useMemo(() => filtrados.reduce((s, m) => s + m.pesoTotal, 0), [filtrados]);
  const qtdFiltrada = useMemo(() => filtrados.reduce((s, m) => s + m.qtdTotal, 0), [filtrados]);

  const temFiltro = busca || filtroPerfil || filtroAco;

  const toggleExpand = (key) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Loading state ─────────────────────────────────────────
  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-torg-gray">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando estoque físico…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-torg-gray mt-1">
            Matéria-prima no pátio da fábrica, importada do SharePoint.
            {ultimaSync ? (
              <> Última sync: <strong>{fmtDataHora(ultimaSync)}</strong></>
            ) : (
              <span className="text-amber-700"> Nunca sincronizado — clique em "Sincronizar SharePoint".</span>
            )}
          </p>
        </div>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50"
        >
          {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {sincronizando ? "Importando…" : "Sincronizar SharePoint"}
        </button>
      </div>

      {/* Alertas */}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}
      {info && !erro && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">
          ✓ {info}
        </div>
      )}

      {/* Sem dados */}
      {materiais.length === 0 && !erro && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Warehouse size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">Nenhum item no estoque físico</p>
          <p className="text-xs text-torg-gray mt-2">
            Clique em <strong>"Sincronizar SharePoint"</strong> para importar a planilha de estoque.
          </p>
        </div>
      )}

      {materiais.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-torg-blue/20 p-4">
              <p className="text-xs text-torg-gray">Peso total</p>
              <p className="text-xl font-extrabold text-torg-blue tabular-nums mt-1 leading-tight">
                {fmtPeso(resumo?.pesoTotal || 0)}
              </p>
              <p className="text-[10px] text-torg-gray mt-0.5">
                {temFiltro ? `${fmtPeso(pesoFiltrado)} filtrado` : "no pátio"}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-4">
              <p className="text-xs text-torg-gray">Peças/barras</p>
              <p className="text-xl font-extrabold text-emerald-700 tabular-nums mt-1">
                {fmtQtd(temFiltro ? qtdFiltrada : resumo?.qtdTotal)}
              </p>
              <p className="text-[10px] text-torg-gray mt-0.5">{temFiltro ? "filtrado" : "total"}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
              <p className="text-xs text-torg-gray">Materiais únicos</p>
              <p className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">
                {temFiltro ? filtrados.length : resumo?.totalMateriais || 0}
              </p>
              <p className="text-[10px] text-torg-gray mt-0.5">perfil + bitola + aço</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-torg-gray">Perfis</p>
              <p className="text-xl font-extrabold text-torg-dark tabular-nums mt-1">
                {perfisDisponiveis.length}
              </p>
              <p className="text-[10px] text-torg-gray mt-0.5">tipos diferentes</p>
            </div>
          </div>

          {/* Resumo por perfil (chips clicáveis) */}
          <div className="flex flex-wrap gap-2">
            {perfisDisponiveis.map(({ perfil, label, peso, qtd, itens }) => (
              <button
                key={perfil}
                onClick={() => setFiltroPerfil(filtroPerfil === perfil ? "" : perfil)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filtroPerfil === perfil
                    ? "bg-torg-blue text-white border-torg-blue shadow-sm"
                    : `${PERFIL_COLORS[perfil] || "bg-gray-100 text-gray-700"} border-transparent hover:border-gray-300`
                }`}
              >
                <span className="font-bold">{perfil}</span>
                <span className="ml-1 opacity-75">{itens}</span>
                <span className="ml-1 opacity-60">· {fmtPeso(peso)}</span>
              </button>
            ))}
          </div>

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px] relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar perfil, bitola ou aço…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
                />
              </div>
              <div className="relative">
                <select
                  value={filtroAco}
                  onChange={(e) => setFiltroAco(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">Todos os aços</option>
                  {acosDisponiveis.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
              </div>
              {temFiltro && (
                <button
                  onClick={() => { setBusca(""); setFiltroPerfil(""); setFiltroAco(""); }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  <X size={12} /> Limpar
                </button>
              )}
              <p className="text-xs text-torg-gray ml-auto">
                <strong>{filtrados.length}</strong> materiai{filtrados.length !== 1 ? "s" : ""}
                {temFiltro && <span className="text-torg-blue"> (de {materiais.length})</span>}
                {" · "}{fmtPeso(pesoFiltrado)}
              </p>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-3 w-8" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Perfil</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bitola</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aço</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Compr.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Peso total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lotes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtrados.map((m, idx) => {
                    const key = `${m.perfil}|${m.bitola}|${m.aco}`;
                    const isOpen = expandidos.has(key);
                    return (
                      <>
                        <tr
                          key={key}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => toggleExpand(key)}
                        >
                          <td className="px-3 py-3 text-torg-gray">
                            {m.lotes.length > 1 ? (
                              isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                            ) : <span className="w-3.5 inline-block" />}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${PERFIL_COLORS[m.perfil] || "bg-gray-100 text-gray-700"}`}>
                              {m.perfil}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-torg-dark">{m.bitola}</td>
                          <td className="px-4 py-3 text-torg-gray text-xs">{m.aco || "—"}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtQtd(m.qtdTotal)}</td>
                          <td className="px-4 py-3 text-right text-torg-gray text-xs tabular-nums">
                            {m.comprimento ? `${(m.comprimento / 1000).toFixed(1)}m` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-torg-dark tabular-nums">
                            {fmtPeso(m.pesoTotal)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-torg-gray tabular-nums">
                            {m.lotes.length}
                          </td>
                        </tr>
                        {isOpen && m.lotes.map((lote, li) => (
                          <tr key={`${key}-${li}`} className="bg-gray-50/50">
                            <td />
                            <td className="px-4 py-2 text-[10px] text-torg-gray" colSpan={2}>
                              {lote.sheet === "ESTOQUE_01" ? "Estoque 01" : "Saída Estoque"}
                              {lote.inspCorr && <span className="ml-2 text-torg-gray">Corrida: {lote.inspCorr}</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-torg-gray">
                              {lote.obra && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-torg-blue/10 text-torg-blue text-[10px] font-medium">{lote.obra}</span>}
                              {lote.opReserva && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">OP {lote.opReserva}</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-xs tabular-nums">{fmtQtd(lote.qtd)}</td>
                            <td className="px-4 py-2 text-right text-[10px] text-torg-gray tabular-nums">
                              {lote.comprimento ? `${(lote.comprimento / 1000).toFixed(1)}m` : "—"}
                              {lote.largura ? ` × ${lote.largura}mm` : ""}
                            </td>
                            <td className="px-4 py-2 text-right text-xs tabular-nums text-torg-gray">{fmtPeso(lote.peso)}</td>
                            <td className="px-4 py-2 text-right text-[10px] text-torg-gray">
                              {fmtData(lote.dataLanc)}
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
