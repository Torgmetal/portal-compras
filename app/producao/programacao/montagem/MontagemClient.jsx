"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench, ChevronDown, ChevronUp, Search, CheckCircle2, Loader2,
  AlertCircle, ArrowRight, X, Package, Undo2, Filter,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { MAQUINA_LABEL, MAQUINA_COR } from "@/lib/maquina-corte";

const fmtKg = (v) => {
  if (v == null) return "—";
  const kg = Number(v);
  if (kg === 0) return "0 kg";
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
};

const fmtMm = (v) => {
  if (v == null || v === 0) return "—";
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mm`;
};

// Verifica se todos os croquis de um conjunto estão atendidos (cortados)
function calcularProntidao(conjunto) {
  const croquis = conjunto.conjuntoCroquis || [];
  if (croquis.length === 0) return { pronto: false, total: 0, atendidos: 0, pct: 0, itens: [] };

  let total = 0;
  let atendidos = 0;
  const itens = [];

  for (const rel of croquis) {
    const c = rel.croqui;
    if (!c) continue;
    const necessario = (c.qte || 1);
    const produzido = c.qteProduzida || 0;
    const ok = produzido >= necessario;
    total++;
    if (ok) atendidos++;
    itens.push({
      marca: c.marca,
      descricao: c.descricao,
      material: c.material,
      qte: necessario,
      qteProduzida: produzido,
      falta: Math.max(0, necessario - produzido),
      ok,
      status: c.status,
      maquina: c.maquina,
      comprimentoMm: c.comprimentoMm,
      pesoUnitKg: c.pesoUnitKg,
    });
  }

  const pct = total > 0 ? Math.round((atendidos / total) * 100) : 0;
  return { pronto: atendidos === total && total > 0, total, atendidos, pct, itens };
}

export default function MontagemClient({ conjuntosIniciais, userRole }) {
  const router = useRouter();
  const [conjuntos, setConjuntos] = useState(conjuntosIniciais);
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("CORTE"); // CORTE = aguardando montagem
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [expandidos, setExpandidos] = useState(new Set());
  const [liberando, setLiberando] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  // OPs disponíveis
  const opsDisponiveis = useMemo(() => {
    const set = new Set(conjuntos.map((c) => c.opNumero));
    return [...set].sort();
  }, [conjuntos]);

  // Enriquecer conjuntos com dados de prontidão
  const conjuntosEnriquecidos = useMemo(() => {
    return conjuntos.map((c) => ({
      ...c,
      prontidao: calcularProntidao(c),
    }));
  }, [conjuntos]);

  // Filtrar
  const filtrados = useMemo(() => {
    return conjuntosEnriquecidos.filter((c) => {
      if (filtroOp && c.opNumero !== filtroOp) return false;
      if (filtroStatus && c.status !== filtroStatus) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (
          !c.marca.toLowerCase().includes(q) &&
          !(c.descricao || "").toLowerCase().includes(q) &&
          !c.opNumero.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [conjuntosEnriquecidos, filtroOp, filtroStatus, busca]);

  // Contadores
  const totalAguardando = useMemo(() => conjuntosEnriquecidos.filter((c) => c.status === "CORTE").length, [conjuntosEnriquecidos]);
  const totalProntos = useMemo(() => conjuntosEnriquecidos.filter((c) => c.status === "CORTE" && c.prontidao.pronto).length, [conjuntosEnriquecidos]);
  const totalEmMontagem = useMemo(() => conjuntosEnriquecidos.filter((c) => c.status === "MONTAGEM").length, [conjuntosEnriquecidos]);

  // Toggle expand
  const toggleExpandido = (id) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Seleção
  const toggleSelecionado = (id) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selecionarTodos = () => {
    const prontos = filtrados.filter((c) => c.prontidao.pronto && c.status === "CORTE");
    if (prontos.every((c) => selecionados.has(c.id))) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(prontos.map((c) => c.id)));
    }
  };

  // Liberar para montagem
  async function liberarSelecionados() {
    if (selecionados.size === 0) return;
    setLiberando(true);
    try {
      const res = await fetch("/api/producao/pecas/liberar-montagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados] }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setConjuntos((prev) =>
        prev.map((c) => (selecionados.has(c.id) && c.status === "CORTE" ? { ...c, status: "MONTAGEM" } : c))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao liberar: " + e.message);
    } finally {
      setLiberando(false);
    }
  }

  // Reverter montagem
  async function reverterSelecionados() {
    if (selecionados.size === 0) return;
    setRevertendo(true);
    try {
      const res = await fetch("/api/producao/pecas/liberar-montagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selecionados], reverter: true }),
      });
      let data;
      try { data = await res.json(); } catch { throw new Error(`Erro ${res.status}`); }
      if (!res.ok) throw new Error(data.error || "Erro");

      setConjuntos((prev) =>
        prev.map((c) => (selecionados.has(c.id) && c.status === "MONTAGEM" ? { ...c, status: "CORTE" } : c))
      );
      setSelecionados(new Set());
    } catch (e) {
      alert("Erro ao reverter: " + e.message);
    } finally {
      setRevertendo(false);
    }
  }

  // Peso total dos conjuntos filtrados
  const pesoFiltrados = useMemo(() => filtrados.reduce((s, c) => s + (c.pesoTotalKg || 0), 0), [filtrados]);

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Wrench size={24} className="text-blue-600" /> Programação de Montagem
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Conjuntos aguardando montagem. Um conjunto só pode ser montado quando todos os seus croquis estiverem cortados.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setFiltroStatus("CORTE")}
          className={`rounded-xl p-3 text-left transition-all bg-orange-50 text-orange-700 ${filtroStatus === "CORTE" ? "ring-2 ring-offset-1 ring-orange-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Aguardando</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalAguardando}</p>
          <p className="text-[10px] opacity-70">conjuntos no corte</p>
        </button>
        <button
          onClick={() => { setFiltroStatus("CORTE"); }}
          className={`rounded-xl p-3 text-left transition-all bg-emerald-50 text-emerald-700`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Prontos p/ montar</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalProntos}</p>
          <p className="text-[10px] opacity-70">croquis 100% cortados</p>
        </button>
        <button
          onClick={() => setFiltroStatus("MONTAGEM")}
          className={`rounded-xl p-3 text-left transition-all bg-blue-50 text-blue-700 ${filtroStatus === "MONTAGEM" ? "ring-2 ring-offset-1 ring-blue-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Em montagem</p>
          <p className="text-2xl font-extrabold tabular-nums">{totalEmMontagem}</p>
          <p className="text-[10px] opacity-70">liberados</p>
        </button>
        <button
          onClick={() => setFiltroStatus("")}
          className={`rounded-xl p-3 text-left transition-all bg-gray-50 text-torg-gray ${filtroStatus === "" ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">Total</p>
          <p className="text-2xl font-extrabold tabular-nums">{conjuntos.length}</p>
          <p className="text-[10px] opacity-70">conjuntos importados</p>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter size={14} className="text-torg-gray" />
          <select
            value={filtroOp}
            onChange={(e) => setFiltroOp(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-torg-dark focus:ring-1 focus:ring-torg-blue"
          >
            <option value="">Todas as OPs</option>
            {opsDisponiveis.map((op) => (
              <option key={op} value={op}>{fmtOP(op)}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar conjunto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-torg-blue w-48"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={12} />
            </button>
          )}
        </div>

        {filtrados.length > 0 && (
          <span className="text-[11px] text-torg-gray">
            {filtrados.length} conjunto{filtrados.length > 1 ? "s" : ""} · {fmtKg(pesoFiltrados)}
          </span>
        )}
      </div>

      {/* Ação: Liberar prontos */}
      {filtroStatus === "CORTE" && selecionados.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
              <Wrench size={16} /> {selecionados.size} conjunto{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Liberar para montagem (status: Corte → Montagem).
            </p>
          </div>
          <button
            onClick={liberarSelecionados}
            disabled={liberando}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2 disabled:opacity-50 shadow-sm"
          >
            {liberando ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Liberar para Montagem
          </button>
        </div>
      )}

      {/* Ação: Reverter */}
      {filtroStatus === "MONTAGEM" && selecionados.size > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {selecionados.size} conjunto{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={reverterSelecionados}
            disabled={revertendo}
            className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {revertendo ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
            Reverter para Corte
          </button>
        </div>
      )}

      {/* Resultado vazio */}
      {filtrados.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">
            {conjuntos.length === 0
              ? "Nenhum conjunto importado. Importe uma LPC na aba de Corte."
              : "Nenhum conjunto no filtro selecionado."}
          </p>
        </div>
      )}

      {/* Lista de conjuntos */}
      {filtrados.length > 0 && (
        <div className="space-y-2">
          {/* Selecionar todos (só prontos) */}
          {filtroStatus === "CORTE" && (
            <div className="flex items-center gap-2 px-1">
              <button
                onClick={selecionarTodos}
                className="text-[11px] text-torg-blue hover:underline font-medium"
              >
                Selecionar todos os prontos ({filtrados.filter((c) => c.prontidao.pronto).length})
              </button>
            </div>
          )}

          {filtrados.map((c) => {
            const { prontidao } = c;
            const isExpanded = expandidos.has(c.id);
            const isSelected = selecionados.has(c.id);
            const pesoTotal = c.pesoTotalKg || 0;
            const podeSelecionar = filtroStatus === "CORTE" ? prontidao.pronto : c.status === "MONTAGEM";

            return (
              <div key={c.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                isSelected ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-100"
              }`}>
                {/* Header do conjunto */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!podeSelecionar}
                    onChange={() => toggleSelecionado(c.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                  />

                  {/* Info principal */}
                  <button onClick={() => toggleExpandido(c.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-torg-dark font-mono">{c.marca}</span>
                        <span className="text-xs text-torg-blue font-mono">{fmtOP(c.opNumero)}</span>
                        {c.op?.cliente && (
                          <span className="text-[10px] text-torg-gray truncate max-w-[150px]">{c.op.cliente}</span>
                        )}
                      </div>
                      {c.descricao && (
                        <p className="text-[11px] text-torg-gray mt-0.5 truncate">{c.descricao}</p>
                      )}
                    </div>

                    {/* Progresso dos croquis */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1.5">
                          {prontidao.pronto ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              <CheckCircle2 size={10} /> Pronto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <AlertCircle size={10} /> {prontidao.atendidos}/{prontidao.total} croquis
                            </span>
                          )}
                          {c.status === "MONTAGEM" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              <Wrench size={10} /> Em montagem
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-torg-gray mt-0.5">
                          {c.qte} pç · {fmtKg(pesoTotal)}
                        </p>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${prontidao.pct === 100 ? "bg-emerald-500" : prontidao.pct > 0 ? "bg-amber-400" : "bg-gray-300"}`}
                          style={{ width: `${prontidao.pct}%` }}
                        />
                      </div>

                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                </div>

                {/* Detalhe dos croquis (expandido) */}
                {isExpanded && prontidao.itens.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50/30">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50/60">
                          <tr>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Croqui</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Material</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Comp.</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Máquina</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Necessário</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Produzido</th>
                            <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Falta</th>
                            <th className="px-4 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {prontidao.itens.map((item, i) => (
                            <tr key={i} className={item.ok ? "bg-emerald-50/30" : ""}>
                              <td className="px-4 py-1.5 font-mono font-semibold text-torg-dark">{item.marca}</td>
                              <td className="px-4 py-1.5 text-torg-gray max-w-[180px] truncate" title={item.descricao}>{item.descricao || "—"}</td>
                              <td className="px-4 py-1.5 text-torg-gray">{item.material || "—"}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-torg-gray">{fmtMm(item.comprimentoMm)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-torg-gray">{fmtKg(item.pesoUnitKg)}</td>
                              <td className="px-4 py-1.5">
                                {item.maquina ? (
                                  <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${MAQUINA_COR[item.maquina]?.bg || "bg-gray-100"} ${MAQUINA_COR[item.maquina]?.text || "text-gray-600"}`}>
                                    {MAQUINA_LABEL[item.maquina] || item.maquina}
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums font-medium text-torg-dark">{item.qte}</td>
                              <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${item.ok ? "text-emerald-600" : item.qteProduzida > 0 ? "text-orange-600" : "text-gray-400"}`}>
                                {item.qteProduzida}
                              </td>
                              <td className={`px-4 py-1.5 text-right tabular-nums font-bold ${item.falta === 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {item.falta === 0 ? "✓" : `-${item.falta}`}
                              </td>
                              <td className="px-4 py-1.5 text-center">
                                {item.ok ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 size={9} /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                    Falta
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
