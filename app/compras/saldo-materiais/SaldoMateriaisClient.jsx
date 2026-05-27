"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2, AlertCircle, Package, CheckCircle2, Clock,
  AlertTriangle, ChevronDown, ChevronRight, Filter,
  RefreshCw, Layers, Truck, ShoppingCart, ClipboardCheck, X,
} from "lucide-react";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v, un) => {
  const n = Number(v || 0);
  return `${n % 1 === 0 ? n.toLocaleString("pt-BR") : n.toFixed(2)} ${un || ""}`.trim();
};
const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtDataCurta = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

export default function SaldoMateriaisClient() {
  const [tipoRM, setTipoRM] = useState("ENGENHARIA"); // "ENGENHARIA" | "INTERNA"
  const [materiais, setMateriais] = useState([]);
  const [pesoTotais, setPesoTotais] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroOP, setFiltroOP] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState("");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [modalRecebimento, setModalRecebimento] = useState(null); // { rmItemId, descricao, qtd, unidade, jaRecebido }

  const fetchData = async (tipo) => {
    const t = tipo || tipoRM;
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/compras/saldo-materiais?tipoRM=${t}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar");
      setMateriais(data.data || []);
      setPesoTotais(data.pesoTotais || null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  const trocarTipo = (t) => {
    setTipoRM(t);
    setFiltroOP("");
    setFiltroFornecedor("");
    setFiltroSituacao("");
    setBusca("");
    setExpandido(null);
    fetchData(t);
  };

  useEffect(() => { fetchData(); }, []);

  // Listas unicas para filtros
  const ops = useMemo(() => {
    const set = new Set();
    for (const m of materiais) for (const op of m.ops) set.add(op);
    return Array.from(set).sort();
  }, [materiais]);

  const fornecedores = useMemo(() => {
    const set = new Set();
    for (const m of materiais) for (const f of m.fornecedores) set.add(f);
    return Array.from(set).sort();
  }, [materiais]);

  // Filtro
  const filtrados = useMemo(() => {
    let lista = materiais;
    if (busca) {
      const b = busca.toLowerCase();
      lista = lista.filter((m) =>
        m.descricao.toLowerCase().includes(b) ||
        (m.material || "").toLowerCase().includes(b)
      );
    }
    if (filtroOP) {
      lista = lista.filter((m) => m.ops.includes(filtroOP));
    }
    if (filtroFornecedor) {
      lista = lista.filter((m) => m.fornecedores.includes(filtroFornecedor));
    }
    if (filtroSituacao === "SEM_PEDIDO") {
      lista = lista.filter((m) => m.qtdSemPedido > 0);
    } else if (filtroSituacao === "PENDENTE") {
      lista = lista.filter((m) => m.saldoPendente > 0);
    } else if (filtroSituacao === "COMPLETO") {
      lista = lista.filter((m) => m.qtdPedida > 0 && m.saldoPendente === 0 && m.qtdSemPedido === 0);
    }
    return lista;
  }, [materiais, busca, filtroOP, filtroFornecedor, filtroSituacao]);

  // KPIs
  const kpis = useMemo(() => {
    const total = materiais.length;
    const semPedido = materiais.filter((m) => m.qtdSemPedido > 0).length;
    const pendente = materiais.filter((m) => m.saldoPendente > 0).length;
    const completo = materiais.filter((m) => m.qtdPedida > 0 && m.saldoPendente === 0 && m.qtdSemPedido === 0).length;
    const valorTotal = materiais.reduce((s, m) => s + m.valorTotal, 0);
    return { total, semPedido, pendente, completo, valorTotal };
  }, [materiais]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-torg-gray">
        <Loader2 size={24} className="animate-spin" />
        <span>Carregando materiais...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-700 font-medium">{erro}</p>
        <button onClick={fetchData} className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Abas: Materiais de Obra vs Consumíveis */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => trocarTipo("ENGENHARIA")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tipoRM === "ENGENHARIA"
              ? "bg-white text-torg-dark shadow-sm"
              : "text-torg-gray hover:text-torg-dark"
          }`}
        >
          Materiais de Obra
        </button>
        <button
          onClick={() => trocarTipo("INTERNA")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tipoRM === "INTERNA"
              ? "bg-white text-torg-dark shadow-sm"
              : "text-torg-gray hover:text-torg-dark"
          }`}
        >
          Consumíveis / Serviços
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Materiais distintos" value={kpis.total} Icon={Layers} color="torg-blue"
          onClick={() => setFiltroSituacao("")} active={!filtroSituacao} />
        <KPI label="Sem pedido" value={kpis.semPedido} Icon={AlertTriangle} color="red"
          highlight={kpis.semPedido > 0}
          onClick={() => setFiltroSituacao(filtroSituacao === "SEM_PEDIDO" ? "" : "SEM_PEDIDO")}
          active={filtroSituacao === "SEM_PEDIDO"} />
        <KPI label="Aguardando entrega" value={kpis.pendente} Icon={Truck} color="amber"
          onClick={() => setFiltroSituacao(filtroSituacao === "PENDENTE" ? "" : "PENDENTE")}
          active={filtroSituacao === "PENDENTE"} />
        <KPI label="Recebido completo" value={kpis.completo} Icon={CheckCircle2} color="emerald"
          onClick={() => setFiltroSituacao(filtroSituacao === "COMPLETO" ? "" : "COMPLETO")}
          active={filtroSituacao === "COMPLETO"} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-torg-gray">
          <Filter size={16} />
          <span className="font-medium">Filtros:</span>
        </div>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar material..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue w-52"
        />
        <select value={filtroOP} onChange={(e) => setFiltroOP(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue">
          <option value="">Todas as OPs</option>
          {ops.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
        <select value={filtroFornecedor} onChange={(e) => setFiltroFornecedor(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-torg-blue">
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        {(busca || filtroOP || filtroFornecedor || filtroSituacao) && (
          <button
            onClick={() => { setBusca(""); setFiltroOP(""); setFiltroFornecedor(""); setFiltroSituacao(""); }}
            className="text-xs text-torg-gray hover:text-red-600 underline"
          >
            Limpar filtros
          </button>
        )}

        <button onClick={fetchData}
          className="ml-auto px-3 py-1.5 text-sm text-torg-blue hover:bg-sky-50 rounded-lg flex items-center gap-1.5">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhum material encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-torg-gray">
              {filtrados.length} materia{filtrados.length !== 1 ? "is" : "l"} &mdash; Valor total: {fmtMoeda(filtrados.reduce((s, m) => s + m.valorTotal, 0))}
            </span>
            {pesoTotais && (
              <div className="flex items-center gap-4 text-xs">
                <span className="text-torg-gray">
                  Solicitado: <strong className="text-torg-dark">{Number(pesoTotais.solicitado).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</strong>
                </span>
                <span className="text-torg-gray">
                  Comprado: <strong className="text-torg-blue">{Number(pesoTotais.pedido).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</strong>
                </span>
                <span className="text-torg-gray">
                  A comprar: <strong className={pesoTotais.aComprar > 0 ? "text-red-600" : "text-emerald-700"}>{Number(pesoTotais.aComprar).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</strong>
                </span>
                <span className="text-torg-gray">
                  Recebido: <strong className="text-emerald-700">{Number(pesoTotais.recebido).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</strong>
                </span>
                <span className="text-torg-gray">
                  Saldo: <strong className={pesoTotais.saldo > 0 ? "text-amber-600" : "text-emerald-700"}>{Number(pesoTotais.saldo).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</strong>
                </span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider">Material</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[80px]">OPs</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[100px]">Solicitado</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[100px]">Pedido</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[100px]">Recebido</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[110px]">Situacao</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider w-[100px]">Previsao</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-torg-gray uppercase tracking-wider">Fornecedor</th>
                  <th className="px-3 py-2.5 w-[30px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((mat) => (
                  <MaterialRow
                    key={mat.descricao}
                    mat={mat}
                    isExpanded={expandido === mat.descricao}
                    onToggle={() => setExpandido(expandido === mat.descricao ? null : mat.descricao)}
                    onRegistrar={(item) => setModalRecebimento(item)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Recebimento */}
      {modalRecebimento && (
        <ModalRecebimento
          item={modalRecebimento}
          onClose={() => setModalRecebimento(null)}
          onSuccess={() => {
            setModalRecebimento(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

/* ─── Subcomponents ─── */

function MaterialRow({ mat, isExpanded, onToggle, onRegistrar }) {
  // Situacao
  let situacao, situacaoCls;
  if (mat.qtdSemPedido > 0 && mat.qtdPedida === 0) {
    situacao = "Sem pedido";
    situacaoCls = "bg-red-100 text-red-700";
  } else if (mat.qtdSemPedido > 0) {
    situacao = "Parcial";
    situacaoCls = "bg-amber-100 text-amber-700";
  } else if (mat.saldoPendente > 0) {
    situacao = "Aguardando";
    situacaoCls = "bg-sky-100 text-sky-700";
  } else if (mat.qtdRecebida > 0) {
    situacao = "Recebido";
    situacaoCls = "bg-emerald-100 text-emerald-700";
  } else {
    situacao = "Pedido";
    situacaoCls = "bg-gray-100 text-gray-600";
  }

  // Barra de progresso
  const pctRecebido = mat.qtdPedida > 0 ? Math.round((mat.qtdRecebida / mat.qtdPedida) * 100) : 0;

  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer transition-colors ${isExpanded ? "bg-sky-50/50" : "hover:bg-gray-50/80"}`}>
        {/* Material */}
        <td className="px-3 py-2.5">
          <p className="text-sm font-medium text-torg-dark">{mat.descricao}</p>
          {mat.material && <p className="text-[10px] text-torg-gray mt-0.5">{mat.material}</p>}
        </td>

        {/* OPs */}
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {mat.ops.slice(0, 3).map((op) => (
              <span key={op} className="text-[10px] font-mono text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded">{op.replace("OP ", "")}</span>
            ))}
            {mat.ops.length > 3 && <span className="text-[10px] text-gray-400">+{mat.ops.length - 3}</span>}
          </div>
        </td>

        {/* Solicitado */}
        <td className="px-3 py-2.5 text-right">
          <span className="text-sm tabular-nums text-torg-dark">{fmtQtd(mat.qtdSolicitada, mat.unidade)}</span>
        </td>

        {/* Pedido */}
        <td className="px-3 py-2.5 text-right">
          <span className={`text-sm tabular-nums ${mat.qtdPedida > 0 ? "text-torg-dark" : "text-gray-400"}`}>
            {mat.qtdPedida > 0 ? fmtQtd(mat.qtdPedida, mat.unidade) : "—"}
          </span>
        </td>

        {/* Recebido */}
        <td className="px-3 py-2.5 text-right">
          <span className={`text-sm tabular-nums ${mat.qtdRecebida > 0 ? "text-emerald-700 font-medium" : "text-gray-400"}`}>
            {mat.qtdRecebida > 0 ? fmtQtd(mat.qtdRecebida, mat.unidade) : "—"}
          </span>
        </td>

        {/* Situacao */}
        <td className="px-3 py-2.5 text-center">
          <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${situacaoCls}`}>
            {situacao}
          </span>
          {mat.qtdPedida > 0 && (
            <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden mx-2">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctRecebido}%` }} />
            </div>
          )}
        </td>

        {/* Previsao */}
        <td className="px-3 py-2.5">
          {mat.proxEntrega ? (
            <span className="text-sm tabular-nums text-torg-dark">{fmtDataCurta(mat.proxEntrega)}</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>

        {/* Fornecedor */}
        <td className="px-3 py-2.5">
          <span className="text-sm text-torg-dark">{mat.fornecedores.join(", ") || "—"}</span>
        </td>

        {/* Expand */}
        <td className="px-2 py-2.5 text-center">
          {isExpanded ? <ChevronDown size={14} className="text-torg-blue" /> : <ChevronRight size={14} className="text-gray-400" />}
        </td>
      </tr>

      {/* Detalhes expandidos */}
      {isExpanded && (
        <tr className="bg-sky-50/30">
          <td colSpan={9} className="px-4 py-3">
            <p className="text-[10px] text-torg-gray uppercase tracking-wide font-semibold mb-2">
              Detalhamento por RM ({mat.detalhes.length} linha{mat.detalhes.length !== 1 ? "s" : ""})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-sky-200">
                    <th className="px-2 py-1.5 text-left text-torg-gray font-semibold">RM</th>
                    <th className="px-2 py-1.5 text-left text-torg-gray font-semibold">OP / Cliente</th>
                    <th className="px-2 py-1.5 text-right text-torg-gray font-semibold">Qtd</th>
                    <th className="px-2 py-1.5 text-right text-torg-gray font-semibold">Recebido</th>
                    <th className="px-2 py-1.5 text-left text-torg-gray font-semibold">Status</th>
                    <th className="px-2 py-1.5 text-left text-torg-gray font-semibold">Fornecedor</th>
                    <th className="px-2 py-1.5 text-left text-torg-gray font-semibold">Previsao</th>
                    <th className="px-2 py-1.5 text-left text-torg-gray font-semibold">NF</th>
                    <th className="px-2 py-1.5 text-right text-torg-gray font-semibold">Valor</th>
                    <th className="px-2 py-1.5 text-center text-torg-gray font-semibold w-[80px]">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100">
                  {mat.detalhes.map((d) => (
                    <tr key={d.rmItemId}>
                      <td className="px-2 py-1.5 font-mono text-torg-gray">{d.rmNumero}</td>
                      <td className="px-2 py-1.5">
                        {d.opNumero ? (
                          <>
                            <span className="font-medium text-torg-dark">OP {d.opNumero}</span>
                            <span className="text-torg-gray ml-1">— {d.opCliente}</span>
                          </>
                        ) : (
                          <span className="text-xs text-torg-gray">Interna</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtQtd(d.qtd, mat.unidade)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {d.qtdRecebida > 0 ? (
                          <span className="text-emerald-700 font-medium">{fmtQtd(d.qtdRecebida, mat.unidade)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <StatusBadge status={d.status} temPedido={d.temPedido} recebido={d.recebido} recebidoParcial={d.recebidoParcial} />
                      </td>
                      <td className="px-2 py-1.5 text-torg-dark">{d.fornecedor || "—"}</td>
                      <td className="px-2 py-1.5 tabular-nums text-torg-dark">{fmtData(d.prazoEntrega)}</td>
                      <td className="px-2 py-1.5 text-torg-gray">{d.nfNumero || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium text-torg-dark">
                        {d.valorLinha > 0 ? fmtMoeda(d.valorLinha) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {d.temPedido && !d.recebido && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRegistrar({
                                rmItemId: d.rmItemId,
                                descricao: mat.descricao,
                                qtd: d.qtd,
                                unidade: mat.unidade,
                                jaRecebido: d.qtdRecebida || 0,
                                rmNumero: d.rmNumero,
                                opNumero: d.opNumero,
                                fornecedor: d.fornecedor,
                              });
                            }}
                            className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-semibold hover:bg-emerald-100 transition-colors whitespace-nowrap"
                          >
                            <ClipboardCheck size={10} className="inline mr-0.5" />
                            Receber
                          </button>
                        )}
                        {d.recebido && (
                          <span className="text-emerald-600">
                            <CheckCircle2 size={14} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ status, temPedido, recebido, recebidoParcial }) {
  if (recebido) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Recebido</span>;
  if (recebidoParcial) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700">Parcial</span>;
  if (temPedido) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">Pedido</span>;
  if (status === "COTADO") return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Cotado</span>;
  if (status === "EM_COTACAO") return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">Em cotacao</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">Pendente</span>;
}

function KPI({ label, value, Icon, color, highlight = false, onClick, active = false }) {
  const bgClass = highlight
    ? "bg-red-50 border-red-300 ring-1 ring-red-200"
    : active
    ? "bg-white border-torg-blue ring-1 ring-torg-blue/30"
    : "bg-white border-gray-100 hover:border-gray-200";

  return (
    <div onClick={onClick} className={`rounded-xl shadow-sm border p-3 flex items-center gap-2.5 cursor-pointer transition-all ${bgClass}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
        color === "red" ? "bg-red-100 text-red-600" :
        color === "amber" ? "bg-amber-100 text-amber-600" :
        color === "emerald" ? "bg-emerald-100 text-emerald-600" :
        "bg-sky-100 text-torg-blue"
      }`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xl font-bold text-torg-dark leading-none">{value}</p>
        <p className="text-[10px] text-torg-gray mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ─── Modal de Registro de Recebimento ─── */

function ModalRecebimento({ item, onClose, onSuccess }) {
  const [qtd, setQtd] = useState("");
  const [nfNumero, setNfNumero] = useState("");
  const [nfChave, setNfChave] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const falta = item.qtd - item.jaRecebido;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro("");

    const qtdNum = Number(qtd.replace(",", "."));
    if (!qtdNum || qtdNum <= 0) {
      setErro("Informe uma quantidade valida");
      return;
    }
    if (qtdNum > falta * 1.1) {
      setErro(`Quantidade excede o saldo pendente (${falta.toFixed(2)} ${item.unidade})`);
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/compras/saldo-materiais/registrar-recebimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmItemId: item.rmItemId,
          qtdRecebida: qtdNum,
          dataRecebimento: dataRecebimento || undefined,
          nfNumero: nfNumero || null,
          nfChave: nfChave || null,
          observacao: observacao || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar");
      onSuccess();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-50">
          <div>
            <h3 className="text-base font-bold text-torg-dark flex items-center gap-2">
              <ClipboardCheck size={18} className="text-emerald-600" />
              Registrar Recebimento
            </h3>
            <p className="text-xs text-torg-gray mt-0.5">RM {item.rmNumero} &bull; OP {item.opNumero}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Info do material */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-torg-dark">{item.descricao}</p>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-torg-gray">
              <span>Solicitado: <strong>{fmtQtd(item.qtd, item.unidade)}</strong></span>
              <span>Ja recebido: <strong className="text-emerald-700">{fmtQtd(item.jaRecebido, item.unidade)}</strong></span>
              <span>Falta: <strong className="text-amber-700">{fmtQtd(falta, item.unidade)}</strong></span>
            </div>
            {item.fornecedor && <p className="text-xs text-torg-gray mt-1">Fornecedor: {item.fornecedor}</p>}
          </div>

          {/* Quantidade */}
          <div>
            <label className="text-xs font-semibold text-torg-gray block mb-1">
              Quantidade recebida ({item.unidade}) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              placeholder={`Ex: ${falta.toFixed(2)}`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              autoFocus
            />
          </div>

          {/* Data */}
          <div>
            <label className="text-xs font-semibold text-torg-gray block mb-1">
              Data do recebimento
            </label>
            <input
              type="date"
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
            />
          </div>

          {/* NF */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-torg-gray block mb-1">
                NF numero
              </label>
              <input
                type="text"
                value={nfNumero}
                onChange={(e) => setNfNumero(e.target.value)}
                placeholder="Ex: 12345"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-torg-gray block mb-1">
                Chave de acesso
              </label>
              <input
                type="text"
                value={nfChave}
                onChange={(e) => setNfChave(e.target.value)}
                placeholder="44 digitos"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>
          </div>

          {/* Observacao */}
          <div>
            <label className="text-xs font-semibold text-torg-gray block mb-1">
              Observacao (opcional)
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Entrega parcial, conferido peso"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
            />
          </div>

          {/* Erro */}
          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle size={14} />
              {erro}
            </div>
          )}

          {/* Acoes */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {salvando ? "Salvando..." : "Confirmar recebimento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
