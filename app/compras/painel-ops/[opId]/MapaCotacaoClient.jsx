"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CheckCircle2, AlertCircle, Loader2, Truck, Award, Wand2, X, XCircle } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";

const fmtMoeda = (v) =>
  v != null && v > 0 ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export default function MapaCotacaoClient({ op }) {
  const router = useRouter();
  const [loading, setLoading] = useState(null);
  const [erro, setErro] = useState("");
  const [mostrarPedidos, setMostrarPedidos] = useState(false);

  // Constrói matriz: cada linha é um RMItem, cada coluna é uma Cotação RECEBIDA
  const { itens: itensTodos, fornecedores } = useMemo(() => buildMatriz(op), [op]);

  // Filtra: por padrao esconde itens que ja viraram pedido — interface fica focada
  // no que ainda precisa de decisao. Toggle no header pra ver os ja resolvidos.
  const itens = useMemo(() => {
    if (mostrarPedidos) return itensTodos;
    return itensTodos.filter((it) => !it.jaPedido && !it.cancelado);
  }, [itensTodos, mostrarPedidos]);

  const qtdPedido = itensTodos.filter((it) => it.jaPedido).length;
  const qtdCancelado = itensTodos.filter((it) => it.cancelado).length;
  const qtdAtivo = itensTodos.length - qtdPedido - qtdCancelado;

  const marcarVencedor = async (cotacaoItemId, jaVencedor) => {
    setLoading(cotacaoItemId);
    setErro("");
    try {
      const res = await fetch(`/api/cotacao-item/${cotacaoItemId}/vencedor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vencedor: !jaVencedor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(null);
    }
  };

  const [resultadosPedidos, setResultadosPedidos] = useState(null);
  const [modalGerar, setModalGerar] = useState(false);

  // Gera pedidos selecionando quais cotações enviar (1 ou várias).
  // O modal chama com cotacoesIds=[id] pra gerar 1 por vez.
  const gerarPedidos = async ({ categoria, localEstoque, cnpjsPorCotacao, cotacoesIds }) => {
    setErro("");
    const res = await fetch(`/api/op/${op.id}/gerar-pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoria, localEstoque, cnpjsPorCotacao, cotacoesIds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro");
    return data.resultados || [];
  };

  const sugerirVencedoresMenorPreco = async () => {
    setLoading("sugerir");
    setErro("");
    try {
      const res = await fetch(`/api/op/${op.id}/sugerir-vencedores`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(null);
    }
  };

  const marcarTodosDoFornecedor = async (cotacaoId, todosJaVencedores) => {
    setLoading(`forn-${cotacaoId}`);
    setErro("");
    try {
      const res = await fetch(`/api/cotacao/${cotacaoId}/marcar-todos-vencedores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vencedor: !todosJaVencedores }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(null);
    }
  };

  if (fornecedores.length === 0) {
    return (
      <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-6 text-center">
        <BarChart3 size={36} className="mx-auto text-torg-blue/40 mb-2" />
        <p className="text-torg-dark font-medium">Sem cotações recebidas ainda</p>
        <p className="text-xs text-torg-gray mt-1">
          Quando os fornecedores responderem as cotações dessas RMs, o mapa comparativo aparece aqui.
        </p>
      </div>
    );
  }

  // Total por fornecedor (soma dos itens vencidos) + lista de itens vencidos
  // Usa preço líquido (já considera ICMS por dentro + IPI por fora) pra
  // comparação justa entre fornecedores de regimes diferentes.
  const totaisPorFornecedor = {};
  const itensPorFornecedor = {};
  for (const f of fornecedores) {
    totaisPorFornecedor[f.cotacaoId] = 0;
    itensPorFornecedor[f.cotacaoId] = [];
  }
  for (const it of itens) {
    for (const cell of it.celulas) {
      if (cell?.vencedor) {
        const valor = (cell.precoLiquido || cell.precoUnit || 0) * (cell.qtdCotada || 0);
        totaisPorFornecedor[cell.cotacaoId] += valor;
        itensPorFornecedor[cell.cotacaoId].push({
          descricao: it.descricao,
          qtd: cell.qtdCotada,
          unidade: it.unidade,
          precoUnit: cell.precoUnit,
          precoLiquido: cell.precoLiquido,
          icmsPct: cell.icmsPct,
          ipiPct: cell.ipiPct,
          total: valor,
        });
      }
    }
  }
  const totalGeral = Object.values(totaisPorFornecedor).reduce((s, n) => s + n, 0);
  const fornecedoresVencedores = fornecedores.filter((f) => itensPorFornecedor[f.cotacaoId].length > 0);
  const itensSemVencedor = itens.filter((it) => !it.celulas.some((c) => c?.vencedor));

  return (
    <>
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <BarChart3 size={20} className="text-torg-blue" /> Mapa Comparativo
            <span className="text-xs text-torg-gray font-normal ml-1">
              ({qtdAtivo} {qtdAtivo === 1 ? "item ativo" : "itens ativos"}
              {qtdPedido > 0 && <span> · {qtdPedido} já em pedido</span>}
              {qtdCancelado > 0 && <span> · {qtdCancelado} cancelado(s)</span>})
            </span>
          </h3>
          <p className="text-xs text-torg-gray mt-1">
            Click na célula pra escolher vencedor por item, ou no nome do fornecedor pra marcar todos dele.
            Use "Sugerir menor preço" pra preencher rapidamente.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {qtdPedido > 0 && (
            <button
              onClick={() => setMostrarPedidos((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1 ${
                mostrarPedidos
                  ? "bg-torg-blue text-white border-torg-blue"
                  : "bg-white text-torg-gray border-gray-300 hover:bg-gray-50"
              }`}
              title={mostrarPedidos ? "Ocultar itens já pedidos" : `Mostrar os ${qtdPedido} itens que já viraram pedido`}
            >
              {mostrarPedidos ? "Ocultar pedidos" : `Mostrar pedidos (${qtdPedido})`}
            </button>
          )}
          <button
            onClick={sugerirVencedoresMenorPreco}
            disabled={loading === "sugerir"}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-2 disabled:opacity-50"
            title="Marca o menor preço de cada item como vencedor automaticamente"
          >
            {loading === "sugerir" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Sugerir menor preço
          </button>
          <div className="text-right">
            <p className="text-xs text-torg-gray">Total dos vencedores</p>
            <p className="text-xl font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(totalGeral)}</p>
          </div>
        </div>
      </div>

      {erro && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" /> <span>{erro}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">RM</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
              {fornecedores.map((f) => {
                // Conta itens dessa cotação com preço (potenciais vencedores)
                const cellsDoForn = itens
                  .map((it) => it.celulas.find((c) => c?.cotacaoId === f.cotacaoId))
                  .filter((c) => c && c.precoUnit > 0);
                const totalCells = cellsDoForn.length;
                const vencidos = cellsDoForn.filter((c) => c.vencedor).length;
                const todosVencedores = totalCells > 0 && vencidos === totalCells;
                const algunsVencedores = vencidos > 0 && vencidos < totalCells;
                const isLoading = loading === `forn-${f.cotacaoId}`;
                return (
                  <th
                    key={f.cotacaoId}
                    onClick={() => !loading && marcarTodosDoFornecedor(f.cotacaoId, todosVencedores)}
                    className={`px-3 py-2 text-center text-xs font-medium uppercase min-w-[140px] cursor-pointer transition-colors ${
                      todosVencedores
                        ? "bg-torg-orange-100 text-torg-orange-700"
                        : algunsVencedores
                        ? "bg-torg-orange-50/50 text-torg-orange-700"
                        : "text-gray-500 hover:bg-torg-blue-50"
                    }`}
                    title={
                      todosVencedores
                        ? "Click pra desmarcar todos os vencedores deste fornecedor"
                        : "Click pra marcar todos os itens deste fornecedor como vencedores"
                    }
                  >
                    <div className="flex items-center justify-center gap-1">
                      {f.fornecedorNome}
                      {isLoading && <Loader2 size={10} className="animate-spin" />}
                    </div>
                    {totalCells > 0 && (
                      <p className="text-[9px] font-normal mt-0.5 normal-case">
                        {vencidos > 0 ? `${vencidos}/${totalCells} ganhando` : "click pra marcar todos"}
                      </p>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((it) => {
              // Compara pelo líquido pra ser justo entre regimes diferentes.
              // Cai pro bruto quando líquido não calculado (sem ICMS/IPI).
              const liquidos = it.celulas
                .filter(Boolean)
                .map((c) => c.precoLiquido || c.precoUnit)
                .filter((p) => p > 0);
              const menorLiquido = liquidos.length ? Math.min(...liquidos) : null;
              return (
                <tr key={it.rmItemId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs font-mono text-torg-blue sticky left-0 bg-white">{it.rmNumero}</td>
                  <td className="px-3 py-2 text-xs text-torg-gray">
                    {it.categoria ? labelCategoria(it.categoria) : "—"}
                  </td>
                  <td className="px-3 py-2 text-torg-dark font-medium">{it.descricao}</td>
                  <td className="px-3 py-2 text-right text-torg-gray text-xs tabular-nums">
                    {it.qtd} {it.unidade}
                  </td>
                  {fornecedores.map((f) => {
                    const cell = it.celulas.find((c) => c?.cotacaoId === f.cotacaoId);
                    if (!cell || cell.precoUnit <= 0) {
                      return (
                        <td key={f.cotacaoId} className="px-3 py-2 text-center text-torg-gray text-xs">
                          —
                        </td>
                      );
                    }
                    const liquido = cell.precoLiquido || cell.precoUnit;
                    const isMenor = liquido === menorLiquido;
                    const isVencedor = cell.vencedor;
                    const totalLiquido = liquido * cell.qtdCotada;
                    const temImposto = cell.icmsPct > 0 || cell.ipiPct > 0;
                    return (
                      <td
                        key={f.cotacaoId}
                        className={`px-3 py-2 text-center cursor-pointer transition-colors ${
                          isVencedor
                            ? "bg-torg-orange-100 ring-1 ring-inset ring-torg-orange-300"
                            : isMenor
                            ? "bg-torg-orange-50/40 hover:bg-torg-orange-50"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => !loading && marcarVencedor(cell.id, isVencedor)}
                        title={
                          temImposto
                            ? `Bruto ${fmtMoeda(cell.precoUnit)} | ICMS ${cell.icmsPct}% | IPI ${cell.ipiPct}% | Líquido ${fmtMoeda(liquido)}`
                            : `Preço bruto ${fmtMoeda(cell.precoUnit)}`
                        }
                      >
                        <div className={`text-sm font-medium tabular-nums ${isVencedor ? "text-torg-orange-700" : isMenor ? "text-torg-orange-700" : "text-torg-dark"}`}>
                          {fmtMoeda(liquido)}
                        </div>
                        <div className="text-[10px] text-torg-gray tabular-nums leading-tight">
                          {temImposto ? (
                            <>bruto {fmtMoeda(cell.precoUnit)}</>
                          ) : (
                            <>total {fmtMoeda(totalLiquido)}</>
                          )}
                        </div>
                        {temImposto && (
                          <div className="text-[9px] text-torg-gray tabular-nums leading-tight">
                            ICMS {cell.icmsPct}% · IPI {cell.ipiPct}%
                          </div>
                        )}
                        {isVencedor && (
                          <Award size={12} className="inline text-torg-orange-700 mt-0.5" />
                        )}
                        {loading === cell.id && (
                          <Loader2 size={12} className="inline animate-spin text-torg-blue mt-0.5" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-torg-dark">
                Total se vencer:
              </td>
              {fornecedores.map((f) => (
                <td key={f.cotacaoId} className="px-3 py-2 text-center text-sm font-bold text-torg-orange-700 tabular-nums">
                  {fmtMoeda(totaisPorFornecedor[f.cotacaoId])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Resumo dos vencedores */}
      {fornecedoresVencedores.length > 0 && (
        <div className="border-t border-torg-orange-200 bg-torg-orange-50/30">
          <div className="px-6 py-4 border-b border-torg-orange-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-base font-semibold text-torg-orange-700 flex items-center gap-2">
                <Award size={18} /> Resumo dos pedidos a gerar
              </h4>
              <p className="text-xs text-torg-gray mt-0.5">
                Cada fornecedor abaixo vai virar 1 pedido de compra. Click pra expandir os itens.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-torg-gray">Total geral</p>
              <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(totalGeral)}</p>
            </div>
          </div>
          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {fornecedoresVencedores.map((f) => (
              <details key={f.cotacaoId} className="bg-white rounded-lg border border-torg-orange-100 p-4 group">
                <summary className="cursor-pointer list-none flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-torg-dark truncate">{f.fornecedorNome}</p>
                    <p className="text-xs text-torg-gray">
                      {itensPorFornecedor[f.cotacaoId].length} ite{itensPorFornecedor[f.cotacaoId].length === 1 ? "m" : "ns"}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xl font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(totaisPorFornecedor[f.cotacaoId])}</p>
                    <p className="text-[10px] text-torg-gray group-open:hidden">clique pra ver itens</p>
                  </div>
                </summary>
                <div className="mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-torg-gray">
                        <th className="px-1 py-1 text-left font-medium">Item</th>
                        <th className="px-1 py-1 text-right font-medium">Qtd</th>
                        <th className="px-1 py-1 text-right font-medium">Bruto</th>
                        <th className="px-1 py-1 text-right font-medium">ICMS</th>
                        <th className="px-1 py-1 text-right font-medium">IPI</th>
                        <th className="px-1 py-1 text-right font-medium">Líquido</th>
                        <th className="px-1 py-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {itensPorFornecedor[f.cotacaoId].map((it, i) => (
                        <tr key={i}>
                          <td className="px-1 py-1.5 text-torg-dark truncate max-w-[200px]" title={it.descricao}>{it.descricao}</td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap">
                            {it.qtd} {it.unidade}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap">
                            {fmtMoeda(it.precoUnit)}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums">
                            {it.icmsPct > 0 ? `−${it.icmsPct}%` : "—"}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums">
                            {it.ipiPct > 0 ? `+${it.ipiPct}%` : "—"}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-orange-700 font-medium tabular-nums whitespace-nowrap">
                            {fmtMoeda(it.precoLiquido || it.precoUnit)}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-dark font-bold tabular-nums whitespace-nowrap">
                            {fmtMoeda(it.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-torg-gray italic mt-2 px-1">
                    Líquido = Bruto × (1 − ICMS%) × (1 + IPI%) — ICMS recuperado como crédito, IPI somado por fora.
                  </p>
                </div>
              </details>
            ))}
          </div>

          {itensSemVencedor.length > 0 && (
            <div className="mx-6 mb-4 bg-torg-blue-50 border border-torg-blue-200 rounded-lg p-3 text-sm text-torg-dark flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 text-torg-blue flex-shrink-0" />
              <div>
                <p className="font-medium">{itensSemVencedor.length} ite{itensSemVencedor.length === 1 ? "m" : "ns"} sem vencedor</p>
                <p className="text-xs text-torg-gray mt-0.5">
                  Escolha um vencedor pra cada item antes de gerar os pedidos. Itens sem decisão não vão pro pedido.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-torg-gray">
          {itens.length} ite{itens.length === 1 ? "m" : "ns"} cotados · {fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""}
          {fornecedoresVencedores.length > 0 && ` · ${fornecedoresVencedores.length} pedido${fornecedoresVencedores.length !== 1 ? "s" : ""} a gerar`}
        </p>
        <button
          onClick={() => setModalGerar(true)}
          disabled={loading === "gerar" || fornecedoresVencedores.length === 0}
          className="px-4 py-2 bg-torg-orange text-white text-sm font-medium rounded-lg hover:bg-torg-orange-600 inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          title={fornecedoresVencedores.length === 0 ? "Marque vencedores antes de gerar" : "Cria os pedidos no Omie"}
        >
          {loading === "gerar" ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
          {loading === "gerar" ? "Gerando..." : "Gerar Pedidos Omie"}
        </button>
      </div>
    </div>

    {modalGerar && (
      <ModalGerarPedidos
        fornecedoresVencedores={fornecedoresVencedores}
        totaisPorFornecedor={totaisPorFornecedor}
        totalGeral={totalGeral}
        onClose={() => setModalGerar(false)}
        onConfirm={gerarPedidos}
        loading={loading === "gerar"}
      />
    )}
    {resultadosPedidos && (
      <ModalResultados resultados={resultadosPedidos} onClose={() => setResultadosPedidos(null)} />
    )}
    </>
  );
}

// ── Modal de configuração antes de gerar pedidos ─────

function ModalGerarPedidos({ fornecedoresVencedores, totaisPorFornecedor, totalGeral, onClose, onConfirm, loading }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState("");
  const [localEstoque, setLocalEstoque] = useState("");
  const [cnpjPorCotacao, setCnpjPorCotacao] = useState(() =>
    Object.fromEntries(fornecedoresVencedores.map((f) => [f.cotacaoId, f.cnpj || ""]))
  );
  const [statusPorCotacao, setStatusPorCotacao] = useState({});
  const [resultadoPorCotacao, setResultadoPorCotacao] = useState({});
  const [categoriasOpcoes, setCategoriasOpcoes] = useState([]);
  const [locaisOpcoes, setLocaisOpcoes] = useState([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [erroOpcoes, setErroOpcoes] = useState("");
  const [erroGeral, setErroGeral] = useState("");

  useEffect(() => {
    setCarregandoOpcoes(true);
    Promise.all([
      fetch("/api/omie/categorias").then((r) => r.json()).catch((e) => ({ error: e?.message })),
      fetch("/api/omie/locais-estoque").then((r) => r.json()).catch((e) => ({ error: e?.message })),
    ])
      .then(([dc, dl]) => {
        if (dc?.categorias?.length) setCategoriasOpcoes(dc.categorias);
        if (dl?.locais?.length) setLocaisOpcoes(dl.locais);
        const erros = [dc?.error, dl?.error].filter(Boolean);
        if (erros.length) setErroOpcoes(erros.join(" | "));
      })
      .finally(() => setCarregandoOpcoes(false));
  }, []);

  const setCnpj = (cotId, val) => setCnpjPorCotacao((p) => ({ ...p, [cotId]: val }));

  const validarConfig = () => {
    setErroGeral("");
    if (!categoria) { setErroGeral("Selecione a Categoria de Compra."); return false; }
    if (!localEstoque) { setErroGeral("Selecione o Local de Estoque."); return false; }
    return true;
  };

  const gerarUm = async (cotacaoId, fornecedorNome) => {
    if (!validarConfig()) return;
    const cnpjLimpo = (cnpjPorCotacao[cotacaoId] || "").replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) {
      setErroGeral(`Preencha o CNPJ (14 dígitos) de ${fornecedorNome}.`);
      return;
    }
    setErroGeral("");
    setStatusPorCotacao((p) => ({ ...p, [cotacaoId]: "loading" }));
    try {
      const resultados = await onConfirm({
        categoria,
        localEstoque,
        cnpjsPorCotacao: { [cotacaoId]: cnpjLimpo },
        cotacoesIds: [cotacaoId],
      });
      // Pode vir 1 ou 2 resultados (se houver FD separado pra mesma cotacao)
      const sucesso = resultados.every((r) => r.sucesso);
      setResultadoPorCotacao((p) => ({ ...p, [cotacaoId]: resultados }));
      setStatusPorCotacao((p) => ({ ...p, [cotacaoId]: sucesso ? "ok" : "erro" }));
      router.refresh();
    } catch (e) {
      setStatusPorCotacao((p) => ({ ...p, [cotacaoId]: "erro" }));
      setResultadoPorCotacao((p) => ({ ...p, [cotacaoId]: [{ sucesso: false, erro: e.message }] }));
    }
  };

  const algumOk = Object.values(statusPorCotacao).some((s) => s === "ok");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2">
            <Truck size={20} className="text-torg-orange" /> Gerar Pedidos Omie
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={loading}>
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-sm text-torg-dark mb-1">
              <strong>{fornecedoresVencedores.length} pedido{fornecedoresVencedores.length !== 1 ? "s" : ""}</strong> a gerar
            </p>
            <p className="text-xs text-torg-gray mb-3">
              Configure categoria + local abaixo, depois clique em "Gerar" pra cada fornecedor (1 por vez evita rate-limit do Omie).
            </p>
            <ul className="space-y-2">
              {fornecedoresVencedores.map((f) => {
                const status = statusPorCotacao[f.cotacaoId];
                const result = resultadoPorCotacao[f.cotacaoId];
                return (
                  <li key={f.cotacaoId} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-torg-dark truncate">{f.fornecedorNome}</p>
                        <p className="text-xs text-torg-gray tabular-nums">{fmtMoeda(totaisPorFornecedor[f.cotacaoId])}</p>
                      </div>
                      <input
                        type="text"
                        value={cnpjPorCotacao[f.cotacaoId] || ""}
                        onChange={(e) => setCnpj(f.cotacaoId, e.target.value)}
                        placeholder="00.000.000/0001-00"
                        className="w-40 border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-torg-blue disabled:bg-gray-50"
                        disabled={status === "loading" || status === "ok"}
                      />
                      <button
                        type="button"
                        onClick={() => gerarUm(f.cotacaoId, f.fornecedorNome)}
                        disabled={status === "loading" || status === "ok"}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1 disabled:opacity-50 ${
                          status === "ok"
                            ? "bg-torg-orange-100 text-torg-orange-700 cursor-default"
                            : status === "erro"
                            ? "bg-red-100 text-red-700 hover:bg-red-200"
                            : "bg-torg-orange text-white hover:bg-torg-orange-600"
                        }`}
                      >
                        {status === "loading" ? (
                          <><Loader2 size={12} className="animate-spin" /> Gerando...</>
                        ) : status === "ok" ? (
                          <><CheckCircle2 size={12} /> Gerado</>
                        ) : status === "erro" ? (
                          <>↻ Tentar de novo</>
                        ) : (
                          <><Truck size={12} /> Gerar</>
                        )}
                      </button>
                    </div>
                    {result && result.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs space-y-1">
                        {result.map((r, idx) => (
                          <div key={idx} className={r.sucesso ? "text-torg-orange-700" : "text-red-700"}>
                            {r.sucesso ? (
                              <>✓ Pedido {r.numeroPedido || r.codigoPedido}{r.isFD ? " (Fat. Direto)" : ""} criado — {fmtMoeda(r.total)}</>
                            ) : (
                              <>✗ {r.erro}</>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-torg-gray mt-3 text-right">
              Total geral: <strong className="text-torg-orange-700 tabular-nums">{fmtMoeda(totalGeral)}</strong>
            </p>
          </div>

          {erroGeral && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erroGeral}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Categoria de Compra <span className="text-red-500">*</span>
            </label>
            {categoriasOpcoes.length > 0 ? (
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
                disabled={loading}
              >
                <option value="">— Selecionar —</option>
                {categoriasOpcoes.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} — {c.descricao}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder={carregandoOpcoes ? "Carregando categorias do Omie..." : "Ex: 3.1"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                disabled={loading || carregandoOpcoes}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Local de Estoque <span className="text-red-500">*</span>
            </label>
            {locaisOpcoes.length > 0 ? (
              <select
                value={localEstoque}
                onChange={(e) => setLocalEstoque(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
                disabled={loading}
              >
                <option value="">— Selecionar —</option>
                {locaisOpcoes.map((l) => (
                  <option
                    key={l.nCodLocal || l.cCodLocal || l.cDescricao}
                    value={String(l.nCodLocal || l.cCodLocal || "")}
                  >
                    {l.cDescricao} {l.cCodLocal ? `(${l.cCodLocal})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={localEstoque}
                onChange={(e) => setLocalEstoque(e.target.value)}
                placeholder={carregandoOpcoes ? "Carregando locais..." : "Código ou descrição"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
                disabled={loading || carregandoOpcoes}
              />
            )}
          </div>

          <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg p-3 text-xs text-torg-dark">
            <p>
              <strong>Conta Corrente:</strong> Inter (busca automática no Omie)
              <span className="mx-2">·</span>
              <strong>Parcelas:</strong> 1 parcela
              <span className="mx-2">·</span>
              <strong>Previsão de entrega:</strong> hoje
            </p>
          </div>

          {erroOpcoes && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" />
              <span>Não consegui listar opções do Omie ({erroOpcoes}). Você pode digitar manualmente.</span>
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-torg-gray">
            {algumOk
              ? "Pedidos criados aparecem no Omie. Pode fechar a qualquer momento."
              : "Configure categoria e local antes de gerar o primeiro pedido."}
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalResultados({ resultados, onClose }) {
  const sucesso = resultados.filter((r) => r.sucesso);
  const erros = resultados.filter((r) => !r.sucesso);
  const totalSucesso = sucesso.reduce((s, r) => s + r.total, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-torg-dark">Pedidos Omie gerados</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-torg-orange-50 rounded-lg p-3">
              <p className="text-xs text-torg-gray">Sucesso</p>
              <p className="text-xl font-extrabold text-torg-orange-700">{sucesso.length}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-torg-gray">Erro</p>
              <p className="text-xl font-extrabold text-red-700">{erros.length}</p>
            </div>
            <div className="bg-torg-blue-50 rounded-lg p-3">
              <p className="text-xs text-torg-gray">Total enviado</p>
              <p className="text-xl font-extrabold text-torg-blue tabular-nums">{fmtMoeda(totalSucesso)}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {resultados.map((r, i) => (
              <li
                key={i}
                className={`p-3 rounded-lg border ${
                  r.sucesso ? "border-torg-orange-200 bg-torg-orange-50/50" : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  {r.sucesso ? (
                    <CheckCircle2 size={18} className="text-torg-orange-700 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="font-semibold text-torg-dark">
                        {r.fornecedor}
                        {r.isFD && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-torg-orange-100 text-torg-orange-700 font-medium">FAT. DIRETO</span>}
                      </p>
                      <p className="text-sm font-bold tabular-nums">{fmtMoeda(r.total)}</p>
                    </div>
                    <p className="text-xs text-torg-gray mt-0.5">
                      {r.itens} ite{r.itens === 1 ? "m" : "ns"}
                      {r.numeroPedido && ` · pedido #${r.numeroPedido}`}
                      {r.codigoPedido && !r.numeroPedido && ` · cód ${r.codigoPedido}`}
                    </p>
                    {r.erro && (
                      <p className="text-xs text-red-700 mt-1 font-mono break-words">{r.erro}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {erros.length > 0 && (
            <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-lg p-3 text-xs text-torg-dark">
              <p className="font-medium">{erros.length} pedido{erros.length !== 1 ? "s" : ""} com erro</p>
              <p className="text-torg-gray mt-1">
                Os itens dos pedidos com sucesso já foram marcados como Pedido Gerado. Os pedidos com erro
                deixaram os itens disponíveis pra você ajustar e tentar gerar novamente.
              </p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// Constrói matriz: lista de itens (linhas) × fornecedores (colunas)
function buildMatriz(op) {
  const fornMap = new Map(); // cotacaoId -> { cotacaoId, fornecedorNome }
  const itensMap = new Map(); // rmItemId -> { ...item, celulas: [] }

  // Mapa global: rmItemId -> { rmItem, rmNumero, categoria }
  // Necessario pra cotacoes consolidadas onde rm.cotacoes inclui itens
  // que pertencem a outras RMs da mesma OP.
  const itemPorId = new Map();
  for (const rm of op.rms) {
    for (const it of rm.itens) {
      const cat = it.opItem?.categoria || it.aditivoItem?.categoria || null;
      itemPorId.set(it.id, { rmItem: it, rmNumero: rm.numero, categoria: cat });
    }
  }

  for (const rm of op.rms) {
    for (const cot of rm.cotacoes) {
      if (cot.status !== "RECEBIDA") continue;
      if (!fornMap.has(cot.id)) {
        fornMap.set(cot.id, {
          cotacaoId: cot.id,
          fornecedorNome: cot.fornecedorNome,
          cnpj: cot.cnpj || "",
          nCodOmie: cot.nCodOmie || "",
        });
      }

      for (const ci of cot.itens) {
        if (!ci.precoUnit || ci.precoUnit <= 0) continue;
        // Garante que o RMItem está na matriz (lookup global — multi-RM)
        if (!itensMap.has(ci.rmItemId)) {
          const entry = itemPorId.get(ci.rmItemId);
          if (!entry) continue;
          const { rmItem, rmNumero, categoria } = entry;
          itensMap.set(ci.rmItemId, {
            rmItemId: rmItem.id,
            rmNumero,
            descricao: rmItem.descricao,
            qtd: rmItem.peso > 0 ? Number(rmItem.peso).toFixed(2) : rmItem.qtd,
            unidade: rmItem.peso > 0 ? "KG" : rmItem.unidade,
            categoria,
            // Status do RMItem — se ja virou pedido, podemos esconder/destacar
            itemStatus: rmItem.status,
            jaPedido: rmItem.status === "PEDIDO_GERADO",
            cancelado: rmItem.status === "CANCELADO",
            celulas: [],
          });
        }
        const icms = Number(ci.icmsPct) || 0;
        const ipi = Number(ci.ipiPct) || 0;
        // Preço líquido (custo Torg): ICMS por dentro (subtrai) + IPI por fora (soma)
        const precoLiquido = ci.precoUnit * (1 - icms / 100) * (1 + ipi / 100);
        itensMap.get(ci.rmItemId).celulas.push({
          id: ci.id,
          cotacaoId: cot.id,
          precoUnit: ci.precoUnit,
          precoLiquido,
          icmsPct: icms,
          ipiPct: ipi,
          qtdCotada: ci.qtdCotada,
          vencedor: ci.vencedor,
        });
      }
    }
  }

  const fornecedores = Array.from(fornMap.values());
  const itens = Array.from(itensMap.values());
  return { fornecedores, itens };
}
