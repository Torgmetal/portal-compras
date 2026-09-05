"use client";
import { useState, useEffect, useMemo } from "react";
import { Loader2, Package, AlertCircle, CheckCircle2, Truck, Clock, Archive, XCircle, ShoppingCart, Filter, ChevronDown, ChevronUp, Download, ArrowUpDown } from "lucide-react";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

// "Solicitado" e "Recebido" respeitam a unidade natural do item: aço (peso>0) em
// kg (+ nº de barras); demais na própria unidade.
const solicitadoTxt = (it) => (it.peso > 0 ? `${fmtKg(it.peso)}${it.barras ? ` · ${fmtNum(it.barras)} br` : ""}` : `${fmtNum(it.qtdSolicitada)} ${it.unidadeItem || ""}`.trim());
const recebidoTxt = (it) => (it.qtdRecebida > 0 ? (it.peso > 0 ? fmtKg(it.qtdRecebida) : `${fmtNum(it.qtdRecebida)} ${it.unidadeItem || ""}`.trim()) : null);
const recebidoCompleto = (it) => { const alvo = it.peso > 0 ? it.peso : it.qtdSolicitada; return alvo > 0 && it.qtdRecebida >= alvo * 0.98; };

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
  // ⚠ FILTRO POR COLUNA (Vitor, 30/08/2026: "deixar as informações como se fosse planilha e com
  // filtro em cada coluna"). Os cartões de cima continuam sendo o filtro por STATUS — eles são
  // úteis e já funcionam; aqui entram as colunas que eles não cobrem.
  const [fRM, setFRM] = useState("");
  const [fMat, setFMat] = useState("");
  const [fPed, setFPed] = useState("");
  const [fForn, setFForn] = useState("");
  const [ordem, setOrdem] = useState({ campo: null, dir: "asc" });
  const [expandido, setExpandido] = useState(true);
  const [exportando, setExportando] = useState(false);
  // a RM só é "isolada" quando o filtro casa EXATAMENTE com um número — digitar "04" filtra a tela
  // mas não é uma RM, e o arquivo não pode sair com nome de RM nesse caso
  const rmIsolada = useMemo(() => {
    const v = String(fRM || "").trim();
    if (!v) return "";
    return (data?.itens || []).some((it) => it.rmNumero === v) ? v : "";
  }, [fRM, data]);
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

      const headers = ["RM", "Material", "Descrição", "Peso solic. (kg)", "Barras solic.", "Qtd solic.", "Un", "Recebido", "Status", "Fornecedor", "Pedido", "NF", "Recebido em"];
      const pesoKg = filtrados.reduce((s, it) => s + (Number(it.peso) || 0), 0);
      const pesoRecebido = filtrados.reduce((s, it) => s + (it.peso > 0 ? Number(it.qtdRecebida) || 0 : 0), 0);
      const { workbook, sheet: ws, linhaInicio } = await xl.criarRelatorioTorg({
        titulo: `Materiais da OP ${numero || ""} — Compras`,
        subtitulo: `Situacao de compra por item${filtro !== "TODOS" ? ` · filtro: ${STATUS_CONFIG[filtro]?.label}` : " · todos os status"}`,
        kpis: [
          `Recebido: ${resumo.RECEBIDO}  |  Aguardando entrega: ${resumo.COMPRADO}  |  Atendido por estoque: ${resumo.ESTOQUE}  |  Em cotacao: ${resumo.EM_COTACAO}  |  Nao comprado: ${resumo.NAO_COMPRADO}  |  Cancelado: ${resumo.CANCELADO}`,
          `${rmIsolada ? `${rmIsolada}  |  ` : ""}${filtrados.length} itens${pesoKg > 0 ? `  |  Peso solicitado (kg): ${pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}  |  Peso recebido (kg): ${pesoRecebido.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : ""}`,
        ],
        totalColunas: headers.length,
        nomePlanilha: (rmIsolada ? `${rmIsolada} - OP ${numero || ""}` : `Materiais OP ${numero || ""}`).slice(0, 31),
        codigoDoc: "REL-CMP-001",
      });
      ws.columns = [{ width: 12 }, { width: 14 }, { width: 40 }, { width: 14 }, { width: 12 }, { width: 11 }, { width: 6 }, { width: 12 }, { width: 20 }, { width: 20 }, { width: 10 }, { width: 12 }, { width: 14 }];
      let row = linhaInicio;
      xl.adicionarHeaderTabela(ws, row, headers); row++;
      for (const it of filtrados) {
        const st = derivarStatus(it);
        xl.adicionarLinhaTabela(ws, row, [
          it.rmNumero, it.material || "—", it.descricao,
          it.peso > 0 ? Number(it.peso) : "", it.barras || "",
          Number(it.qtdSolicitada || 0), it.unidadeItem || "",
          it.qtdRecebida > 0 ? Number(it.qtdRecebida) : "",
          STATUS_CONFIG[st].label, it.fornecedor || "—",
          it.pedidoNumero ? `#${it.pedidoNumero}` : "—",
          it.nfNumero || "—",
          st === "RECEBIDO" && it.recebidoEm ? fmtData(it.recebidoEm) : "—",
        ], {
          fillColor: FILL[st], fontColors: { 8: FONT[st] },
          alinhamento: { 3: "right", 4: "right", 5: "right", 6: "center", 7: "right", 8: "center", 10: "center", 11: "center", 12: "center" },
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
      await xl.downloadWorkbook(
        workbook,
        rmIsolada
          ? `Torg_${String(rmIsolada).replace(/[^\w-]+/g, "-")}_OP-${numero || "s-n"}_${hoje}.xlsx`
          : `Torg_Materiais_OP-${numero || "s-n"}_${hoje}.xlsx`
      );
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
  const contem = (v, q) => !q || String(v ?? "").toLowerCase().includes(q.toLowerCase().trim());
  const inpCls = "w-full border border-gray-200 rounded px-2 py-1 text-[11px] bg-white focus:ring-1 focus:ring-torg-blue focus:border-torg-blue";
  const Th = ({ campo, children, align = "text-left", titulo }) => (
    <th className={`px-3 py-2 ${align} text-xs font-medium text-gray-500 uppercase`} title={titulo}>
      <button
        onClick={() => setOrdem((o) => ({ campo, dir: o.campo === campo && o.dir === "asc" ? "desc" : "asc" }))}
        className="inline-flex items-center gap-1 hover:text-torg-blue uppercase"
      >
        {children}
        <ArrowUpDown size={10} className={ordem.campo === campo ? "text-torg-blue" : "text-gray-300"} />
      </button>
    </th>
  );
  const itensFiltrados = (() => {
    let l = filtro === "TODOS" ? itens : itens.filter((it) => derivarStatus(it) === filtro);
    if (fRM)   l = l.filter((it) => contem(it.rmNumero, fRM));
    if (fMat)  l = l.filter((it) => contem(it.descricao, fMat) || contem(it.material, fMat));
    if (fPed)  l = l.filter((it) => contem(it.pedidoNumero, fPed) || contem(it.nfNumero, fPed));
    if (fForn) l = l.filter((it) => contem(it.fornecedor, fForn));
    if (!ordem.campo) return l;
    // ⚠ cópia antes de ordenar: `l` pode ser o próprio `itens` quando nada está filtrado.
    const val = (it) => {
      switch (ordem.campo) {
        case "rm": return String(it.rmNumero || "").toLowerCase();
        case "material": return String(it.descricao || "").toLowerCase();
        case "solicitado": return Number(it.peso) > 0 ? Number(it.peso) : Number(it.qtdSolicitada) || 0;
        case "fornecedor": return String(it.fornecedor || "").toLowerCase();
        default: return String(derivarStatus(it));
      }
    };
    return [...l].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb) : (va === vb ? 0 : va < vb ? -1 : 1);
      return ordem.dir === "asc" ? c : -c;
    });
  })();

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
            title={rmIsolada ? `Exportar só a ${rmIsolada} para Excel (layout Torg)` : "Exportar materiais para Excel (layout Torg)"}
            className="text-sm font-semibold text-torg-blue border border-torg-blue/30 hover:bg-torg-blue-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-2 disabled:opacity-50"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {rmIsolada ? `Exportar ${rmIsolada}` : "Exportar"}
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
                  <Th campo="rm">RM</Th>
                  <Th campo="material">Material</Th>
                  <Th campo="solicitado" align="text-right" titulo="Peso e nº de barras solicitados">Solicitado</Th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Pedido</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">NF</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase" title="Quantidade real recebida">Recebido</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <Th campo="fornecedor">Fornecedor</Th>
                </tr>
                {/* ⚠ linha de filtros por coluna — o "como se fosse planilha" que o Vitor pediu.
                    Os cartões de cima continuam filtrando por STATUS; aqui entram as colunas que
                    eles não cobrem. Pedido e NF dividem uma caixa só: quem procura "#1863" ou uma
                    NF está atrás do mesmo pedido. */}
                <tr className="bg-white">
                  <td className="px-2 py-1.5"><input value={fRM} onChange={(e) => setFRM(e.target.value)} placeholder="RM" className={inpCls} /></td>
                  <td className="px-2 py-1.5"><input value={fMat} onChange={(e) => setFMat(e.target.value)} placeholder="material ou bitola" className={inpCls} /></td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5" colSpan={2}><input value={fPed} onChange={(e) => setFPed(e.target.value)} placeholder="pedido / NF" className={inpCls} /></td>
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5"><input value={fForn} onChange={(e) => setFForn(e.target.value)} placeholder="fornecedor" className={inpCls} /></td>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {itensFiltrados.map((item) => {
                  const st = derivarStatus(item);
                  const cfg = STATUS_CONFIG[st];
                  const Icon = cfg.icon;
                  const receb = recebidoTxt(item);
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${st === "CANCELADO" ? "opacity-50" : ""}`} title={st === "CANCELADO" && item.canceladoMotivo ? `Cancelado: ${item.canceladoMotivo}` : undefined}>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap align-top">
                        {/* ⚠ Vitor: "veja se é possível extrair a RM ao clicar nesse chip para
                            poder comparar com o que foi comprado". Um clique isola a RM na tabela
                            — e, como o Excel exporta o que está FILTRADO, o mesmo clique define o
                            que sai na planilha. Clicar de novo devolve a lista inteira. */}
                        <button
                          type="button"
                          onClick={() => setFRM(fRM === item.rmNumero ? "" : item.rmNumero)}
                          title={fRM === item.rmNumero ? "Mostrar todas as RMs" : `Ver só a ${item.rmNumero} (e exportar só ela)`}
                          className={`rounded px-1.5 py-0.5 font-mono text-xs hover:underline ${
                            fRM === item.rmNumero
                              ? "bg-torg-blue text-white hover:bg-torg-blue/90"
                              : "text-torg-blue hover:bg-torg-blue-50"
                          }`}
                        >
                          {item.rmNumero}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-top w-[300px] max-w-[300px]">
                        {(() => {
                          const d = String(item.descricao || "");
                          // ⚠ A BITOLA VEM NA FRENTE. "PERFIL H ACO CARBONO LAMINADO A 572 GR.50 DN.
                          // W150 X 37,1KG/M" ocupava três linhas e o que o comprador procura — o
                          // W150 x 37,1 — ficava no fim, justamente onde o corte esconderia. Aqui a
                          // parte distintiva sobe para a primeira linha e o resto vira legenda.
                          const m = d.match(/\bDN\.?\s*(.+)$/i);
                          const destaque = m ? m[1].trim() : d;
                          const resto = m ? d.slice(0, m.index).trim() : "";
                          return (
                            <div title={d}>
                              <div className="text-torg-dark text-xs font-semibold truncate">{destaque}</div>
                              {resto && <div className="text-[11px] text-torg-gray truncate">{resto}</div>}
                              {item.material && (
                                <span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-torg-gray">
                                  {item.material}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap align-top text-torg-dark text-xs">
                        {solicitadoTxt(item)}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap align-top">
                        {item.pedidoNumero ? <span className="font-mono text-xs text-torg-dark">#{item.pedidoNumero}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap align-top">
                        {item.nfNumero ? <span className="font-mono text-xs text-torg-dark">{item.nfNumero}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap align-top text-xs" title={item.recebidoEm ? `Recebido em ${fmtData(item.recebidoEm)}` : undefined}>
                        {receb ? <span className={`font-semibold ${recebidoCompleto(item) ? "text-emerald-700" : "text-amber-700"}`}>{receb}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap align-top">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>
                          <Icon size={11} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-torg-dark truncate max-w-[150px] align-top" title={item.fornecedor || ""}>
                        {item.fornecedor || "—"}
                      </td>
                    </tr>
                  );
                })}
                {itensFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-torg-gray">
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
