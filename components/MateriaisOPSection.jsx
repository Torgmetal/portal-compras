"use client";
import { useState, useEffect } from "react";
import {
  Loader2, Package, AlertCircle, CheckCircle2, Truck, Clock,
  Archive, XCircle, ShoppingCart, Filter, ChevronDown, ChevronUp, Download,
} from "lucide-react";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Status derivado de cada item baseado em RMItem.status + PedidoOmie.statusEntrega
const STATUS_CONFIG = {
  RECEBIDO: {
    label: "Recebido",
    icon: CheckCircle2,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  COMPRADO: {
    label: "Aguardando entrega",
    icon: Truck,
    color: "text-torg-blue",
    bg: "bg-torg-blue-50",
    border: "border-torg-blue/20",
  },
  ESTOQUE: {
    label: "Atendido por estoque",
    icon: Archive,
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  EM_COTACAO: {
    label: "Em cotação",
    icon: Clock,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  NAO_COMPRADO: {
    label: "Não comprado",
    icon: ShoppingCart,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
  },
  CANCELADO: {
    label: "Cancelado",
    icon: XCircle,
    color: "text-gray-400",
    bg: "bg-gray-50",
    border: "border-gray-200",
  },
};

function derivarStatus(item) {
  if (item.status === "CANCELADO") return "CANCELADO";
  if (item.status === "ATENDIDO_ESTOQUE") return "ESTOQUE";
  if (item.status === "PEDIDO_GERADO") {
    return item.pedidoRecebido ? "RECEBIDO" : "COMPRADO";
  }
  if (item.status === "EM_COTACAO" || item.status === "COTADO") return "EM_COTACAO";
  return "NAO_COMPRADO";
}

/**
 * Painel de materiais da OP — lista todos os itens de todas as RMs
 * com status derivado e resumo por categoria.
 *
 * Props:
 *   opId: string — ID da OP
 */
export default function MateriaisOPSection({ opId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("TODOS");
  const [expandido, setExpandido] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [exportErro, setExportErro] = useState("");

  useEffect(() => {
    setLoading(true);
    setErro("");
    fetch(`/api/op/${opId}/materiais`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error(json.error || "Erro");
        return json.data;
      })
      .then(setData)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [opId]);

  // Exporta os materiais no layout padrao Torg (ISO 9001), igual aos demais
  // relatorios (lib/excel-relatorio). Respeita o filtro de status ativo.
  async function exportarExcel() {
    if (!data || exportando) return;
    setExportando(true);
    setExportErro("");
    try {
      const xl = await import("@/lib/excel-relatorio");
      const { itens, resumo, numero } = data;
      const filtrados = filtro === "TODOS" ? itens : itens.filter((it) => derivarStatus(it) === filtro);
      const hoje = new Date().toISOString().split("T")[0];

      const FILL = {
        RECEBIDO: xl.CORES.LIGHT_GREEN, COMPRADO: xl.CORES.LIGHT_BLUE, ESTOQUE: "F3E8FF",
        EM_COTACAO: xl.CORES.LIGHT_ORANGE, NAO_COMPRADO: "FDECEC", CANCELADO: "F1F5F9",
      };
      const FONT = {
        RECEBIDO: "16A34A", COMPRADO: "006EAB", ESTOQUE: "7C3AED",
        EM_COTACAO: "B45309", NAO_COMPRADO: "DC2626", CANCELADO: "94A3B8",
      };

      const headers = ["RM", "Material", "Descrição", "Qtd", "Un", "Status", "Fornecedor", "Pedido", "NF", "Recebido em"];
      const pesoKg = filtrados.reduce((s, it) => s + (it.unidade === "KG" ? Number(it.quantidade || 0) : 0), 0);
      const { workbook, sheet: ws, linhaInicio } = await xl.criarRelatorioTorg({
        titulo: `Materiais da OP ${numero || ""} — Compras`,
        subtitulo: `Situacao de compra por item${filtro !== "TODOS" ? ` · filtro: ${STATUS_CONFIG[filtro]?.label}` : " · todos os status"}`,
        kpis: [
          `Recebido: ${resumo.RECEBIDO}  |  Aguardando entrega: ${resumo.COMPRADO}  |  Atendido por estoque: ${resumo.ESTOQUE}  |  Em cotacao: ${resumo.EM_COTACAO}  |  Nao comprado: ${resumo.NAO_COMPRADO}  |  Cancelado: ${resumo.CANCELADO}`,
          `${filtrados.length} itens${pesoKg > 0 ? `  |  Peso total (kg): ${pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}` : ""}`,
        ],
        totalColunas: headers.length,
        nomePlanilha: `Materiais OP ${numero || ""}`.slice(0, 31),
        codigoDoc: "REL-CMP-001",
      });
      ws.columns = [{ width: 12 }, { width: 14 }, { width: 42 }, { width: 11 }, { width: 6 }, { width: 20 }, { width: 20 }, { width: 10 }, { width: 12 }, { width: 14 }];
      let row = linhaInicio;
      xl.adicionarHeaderTabela(ws, row, headers); row++;
      for (const it of filtrados) {
        const st = derivarStatus(it);
        xl.adicionarLinhaTabela(ws, row, [
          it.rmNumero, it.material || "—", it.descricao,
          Number(it.quantidade || 0), it.unidade || "",
          STATUS_CONFIG[st].label, it.fornecedor || "—",
          it.pedidoNumero ? `#${it.pedidoNumero}` : "—",
          it.nfNumero || "—",
          st === "RECEBIDO" && it.recebidoEm ? fmtData(it.recebidoEm) : "—",
        ], {
          fillColor: FILL[st], fontColors: { 5: FONT[st] },
          alinhamento: { 3: "right", 4: "center", 5: "center", 7: "center", 8: "center", 9: "center" },
        });
        row++;
      }
      row += 1;
      xl.adicionarLegenda(ws, row, [
        { cor: xl.CORES.LIGHT_GREEN, label: "Verde = recebido" },
        { cor: xl.CORES.LIGHT_BLUE, label: "Azul = aguardando entrega" },
        { cor: "F3E8FF", label: "Roxo = estoque" },
        { cor: xl.CORES.LIGHT_ORANGE, label: "Laranja = em cotacao" },
      ], headers.length);
      await xl.downloadWorkbook(workbook, `Torg_Materiais_OP-${numero || "s-n"}_${hoje}.xlsx`);
    } catch (e) {
      setExportErro("Erro ao exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
        <p className="text-sm text-torg-gray">Carregando materiais...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <div className="flex items-start gap-2 text-red-600 text-sm">
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <p className="font-medium">Erro ao carregar materiais</p>
            <p className="text-xs mt-1">{erro}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.itens.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <Package size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhum material solicitado nesta OP.</p>
      </div>
    );
  }

  const { itens, resumo } = data;

  // Aplica filtro
  const itensFiltrados = filtro === "TODOS"
    ? itens
    : itens.filter((it) => derivarStatus(it) === filtro);

  const totalItens = itens.length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div
        className="px-6 py-4 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-50/50"
        onClick={() => setExpandido((v) => !v)}
      >
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
          <Package size={18} className="text-torg-blue" />
          Materiais da OP
          <span className="text-sm font-normal text-torg-gray">({totalItens} itens)</span>
        </h3>
        <div className="flex items-center gap-2">
          {exportErro && <span className="text-xs text-red-600">{exportErro}</span>}
          <button
            onClick={(e) => { e.stopPropagation(); exportarExcel(); }}
            disabled={exportando || !totalItens}
            title="Exportar materiais para Excel (layout Torg)"
            className="text-sm font-semibold text-torg-blue border border-torg-blue/30 hover:bg-torg-blue-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exportar
          </button>
          {expandido ? <ChevronUp size={18} className="text-torg-gray" /> : <ChevronDown size={18} className="text-torg-gray" />}
        </div>
      </div>

      {expandido && (
        <>
          {/* Resumo — cards de status */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-6 py-4 border-b border-gray-100">
            <StatusCard
              cfg={STATUS_CONFIG.RECEBIDO}
              count={resumo.RECEBIDO}
              total={totalItens}
              ativo={filtro === "RECEBIDO"}
              onClick={() => setFiltro(filtro === "RECEBIDO" ? "TODOS" : "RECEBIDO")}
            />
            <StatusCard
              cfg={STATUS_CONFIG.COMPRADO}
              count={resumo.COMPRADO}
              total={totalItens}
              ativo={filtro === "COMPRADO"}
              onClick={() => setFiltro(filtro === "COMPRADO" ? "TODOS" : "COMPRADO")}
            />
            <StatusCard
              cfg={STATUS_CONFIG.ESTOQUE}
              count={resumo.ESTOQUE}
              total={totalItens}
              ativo={filtro === "ESTOQUE"}
              onClick={() => setFiltro(filtro === "ESTOQUE" ? "TODOS" : "ESTOQUE")}
            />
            <StatusCard
              cfg={STATUS_CONFIG.EM_COTACAO}
              count={resumo.EM_COTACAO}
              total={totalItens}
              ativo={filtro === "EM_COTACAO"}
              onClick={() => setFiltro(filtro === "EM_COTACAO" ? "TODOS" : "EM_COTACAO")}
            />
            <StatusCard
              cfg={STATUS_CONFIG.NAO_COMPRADO}
              count={resumo.NAO_COMPRADO}
              total={totalItens}
              ativo={filtro === "NAO_COMPRADO"}
              onClick={() => setFiltro(filtro === "NAO_COMPRADO" ? "TODOS" : "NAO_COMPRADO")}
            />
            <StatusCard
              cfg={STATUS_CONFIG.CANCELADO}
              count={resumo.CANCELADO}
              total={totalItens}
              ativo={filtro === "CANCELADO"}
              onClick={() => setFiltro(filtro === "CANCELADO" ? "TODOS" : "CANCELADO")}
            />
          </div>

          {/* Barra de filtro ativo */}
          {filtro !== "TODOS" && (
            <div className="px-6 py-2 bg-gray-50/60 flex items-center gap-2 text-xs">
              <Filter size={12} className="text-torg-gray" />
              <span className="text-torg-gray">
                Filtrando: <strong className="text-torg-dark">{STATUS_CONFIG[filtro]?.label}</strong>
                {" "}({itensFiltrados.length} de {totalItens})
              </span>
              <button onClick={() => setFiltro("TODOS")} className="ml-auto text-torg-blue hover:underline">
                Limpar filtro
              </button>
            </div>
          )}

          {/* Tabela de itens */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">RM</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itensFiltrados.map((item) => {
                  const st = derivarStatus(item);
                  const cfg = STATUS_CONFIG[st];
                  const Icon = cfg.icon;
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${st === "CANCELADO" ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2 font-mono text-xs text-torg-blue whitespace-nowrap">
                        {item.rmNumero}
                      </td>
                      <td className="px-4 py-2 text-xs text-torg-gray whitespace-nowrap">
                        {item.material || "—"}
                      </td>
                      <td className="px-4 py-2 text-torg-dark max-w-xs truncate" title={item.descricao}>
                        {item.descricao}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                        {Number(item.quantidade).toLocaleString("pt-BR")} {item.unidade}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                          <Icon size={11} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-torg-dark truncate max-w-[150px]" title={item.fornecedor || ""}>
                        {item.fornecedor || "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-torg-gray whitespace-nowrap">
                        {(st === "RECEBIDO" || st === "COMPRADO") && (item.pedidoNumero || item.nfNumero) && (
                          <span>
                            {item.pedidoNumero ? `Pedido #${item.pedidoNumero}` : ""}
                            {st === "RECEBIDO" && item.nfNumero ? `${item.pedidoNumero ? " • " : ""}NF ${item.nfNumero}` : ""}
                            {st === "RECEBIDO" && item.recebidoEm ? ` • ${fmtData(item.recebidoEm)}` : ""}
                          </span>
                        )}
                        {st === "ESTOQUE" && (
                          <span>
                            {item.estoquePreco > 0 ? fmtMoeda(item.estoquePreco) + "/un" : ""}
                            {item.estoqueData ? ` • ${fmtData(item.estoqueData)}` : ""}
                          </span>
                        )}
                        {st === "CANCELADO" && item.canceladoEm && (
                          <span>{fmtData(item.canceladoEm)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {itensFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-torg-gray">
                      Nenhum item com este status.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de progresso geral */}
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40">
            <div className="flex items-center gap-4 text-xs text-torg-gray">
              <span className="font-medium text-torg-dark">Progresso:</span>
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden flex">
                {resumo.RECEBIDO > 0 && (
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${(resumo.RECEBIDO / totalItens) * 100}%` }}
                    title={`Recebido: ${resumo.RECEBIDO}`}
                  />
                )}
                {resumo.COMPRADO > 0 && (
                  <div
                    className="bg-torg-blue h-full"
                    style={{ width: `${(resumo.COMPRADO / totalItens) * 100}%` }}
                    title={`Aguardando: ${resumo.COMPRADO}`}
                  />
                )}
                {resumo.ESTOQUE > 0 && (
                  <div
                    className="bg-violet-500 h-full"
                    style={{ width: `${(resumo.ESTOQUE / totalItens) * 100}%` }}
                    title={`Estoque: ${resumo.ESTOQUE}`}
                  />
                )}
                {resumo.EM_COTACAO > 0 && (
                  <div
                    className="bg-amber-400 h-full"
                    style={{ width: `${(resumo.EM_COTACAO / totalItens) * 100}%` }}
                    title={`Em cotação: ${resumo.EM_COTACAO}`}
                  />
                )}
                {(resumo.NAO_COMPRADO + resumo.CANCELADO) > 0 && (
                  <div
                    className="bg-gray-300 h-full"
                    style={{ width: `${((resumo.NAO_COMPRADO + resumo.CANCELADO) / totalItens) * 100}%` }}
                    title={`Pendente/Cancelado: ${resumo.NAO_COMPRADO + resumo.CANCELADO}`}
                  />
                )}
              </div>
              <span className="tabular-nums font-medium text-torg-dark">
                {Math.round(((resumo.RECEBIDO + resumo.ESTOQUE) / totalItens) * 100)}% concluído
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusCard({ cfg, count, total, ativo, onClick }) {
  const Icon = cfg.icon;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-2 text-left transition-all hover:shadow-sm ${
        ativo ? `${cfg.border} ${cfg.bg} ring-1 ring-offset-1 ${cfg.border}` : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={11} className={cfg.color} />
        <span className={`text-[9px] uppercase font-medium tracking-wide ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      <p className={`text-lg font-extrabold tabular-nums ${count > 0 ? cfg.color : "text-gray-300"}`}>
        {count}
      </p>
      <p className="text-[9px] text-torg-gray">{pct}%</p>
    </button>
  );
}
