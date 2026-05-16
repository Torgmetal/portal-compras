"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CheckCircle2, AlertCircle, Loader2, Truck, Award, Wand2, X, XCircle, Mail, Send } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";

const fmtMoeda = (v) =>
  v != null && v > 0 ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

// Copia HTML pro clipboard sincronamente (preserva user gesture pro mailto).
function copyHtmlSync(html, text) {
  let ok = false;
  let container = null;
  let listener = null;
  try {
    listener = (e) => {
      try {
        e.clipboardData.setData("text/html", html);
        e.clipboardData.setData("text/plain", text || html.replace(/<[^>]+>/g, ""));
        e.preventDefault();
      } catch {}
    };
    document.addEventListener("copy", listener);
    container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = "2px";
    container.style.height = "2px";
    container.style.opacity = "0.01";
    container.style.zIndex = "-1";
    container.style.overflow = "hidden";
    document.body.appendChild(container);
    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand("copy");
    sel.removeAllRanges();
  } catch {
    ok = false;
  } finally {
    if (listener) document.removeEventListener("copy", listener);
    if (container && container.parentNode) container.parentNode.removeChild(container);
  }
  return ok;
}

function abrirOutlookMailto(to, subject) {
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`;
  const a = document.createElement("a");
  a.href = mailto;
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function MapaCotacaoClient({ op }) {
  const router = useRouter();
  const [loading, setLoading] = useState(null);
  const [erro, setErro] = useState("");
  const [mostrarPedidos, setMostrarPedidos] = useState(false);
  const [revisaoToast, setRevisaoToast] = useState(null); // { cotacaoId, ok, msg }
  const [emailRevisaoCache, setEmailRevisaoCache] = useState({}); // cotacaoId -> emailData

  // Solicita revisao final ao fornecedor + copia email + abre Outlook
  const solicitarRevisaoFinal = async (cotacaoId, fornecedorNome) => {
    setLoading(`rev-${cotacaoId}`);
    setRevisaoToast(null);
    try {
      // 1. Marca a cotacao como em modo revisao final
      const res1 = await fetch(`/api/cotacao/${cotacaoId}/solicitar-revisao-final`, {
        method: "POST",
      });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error || "Falha ao solicitar revisao");

      // 2. Busca preview-email (vai vir com texto de "revisao final" pq o
      // backend ja sabe que a cotacao foi marcada)
      const res2 = await fetch(`/api/cotacao/${cotacaoId}/preview-email?format=json`);
      if (!res2.ok) {
        const d = await res2.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao montar email");
      }
      const emailData = await res2.json();
      setEmailRevisaoCache((prev) => ({ ...prev, [cotacaoId]: emailData }));

      // 3. Copia HTML pro clipboard (sincrono)
      const copiouHtml = copyHtmlSync(emailData.html, emailData.text);

      // 4. Abre Outlook depois de 300ms
      setTimeout(() => abrirOutlookMailto(emailData.to, emailData.subject), 300);

      setRevisaoToast({
        cotacaoId,
        ok: true,
        msg: copiouHtml
          ? `Revisão solicitada a ${fornecedorNome}. Outlook abrindo + email copiado. Cole no corpo (Ctrl+V) e envie.`
          : `Revisão solicitada. Outlook aberto. Cole o conteúdo manualmente.`,
      });
      router.refresh();
    } catch (e) {
      setRevisaoToast({ cotacaoId, ok: false, msg: e.message });
    } finally {
      setLoading(null);
    }
  };

  const reCopiarEmailRevisao = (cotacaoId) => {
    const data = emailRevisaoCache[cotacaoId];
    if (!data) {
      setRevisaoToast({ cotacaoId, ok: false, msg: "Cache vazio, peca revisao novamente." });
      return;
    }
    const ok = copyHtmlSync(data.html, data.text);
    setRevisaoToast({
      cotacaoId,
      ok,
      msg: ok ? "Email recopiado. Cole no Outlook (Ctrl+V)." : "Falha ao recopiar.",
    });
  };

  // Constrói matriz: cada linha é um RMItem, cada coluna é uma Cotação RECEBIDA
  const { itens: itensTodos, fornecedores: fornecedoresTodos } = useMemo(() => buildMatriz(op), [op]);

  // Filtra: por padrao esconde itens que ja viraram pedido — interface fica focada
  // no que ainda precisa de decisao. Toggle no header pra ver os ja resolvidos.
  const itens = useMemo(() => {
    if (mostrarPedidos) return itensTodos;
    return itensTodos.filter((it) => !it.jaPedido && !it.cancelado);
  }, [itensTodos, mostrarPedidos]);

  // Filtra fornecedores pra mostrar somente os que tem celula nos itens visiveis.
  // Sem isso, um fornecedor que so cotou itens ja pedidos (escondidos) ficava
  // como coluna fantasma com "—" em tudo.
  const fornecedores = useMemo(() => {
    const ids = new Set();
    for (const it of itens) {
      for (const cell of it.celulas) {
        if (cell?.precoUnit > 0) ids.add(cell.cotacaoId);
      }
    }
    return fornecedoresTodos.filter((f) => ids.has(f.cotacaoId));
  }, [itens, fornecedoresTodos]);

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

  // Sobrescreve o total da proposta — usado quando ha pequena divergencia
  // entre o total computado dos itens e o valor da NF que o fornecedor vai
  // emitir. gerar-pedidos vai escalar os precos pra bater com esse valor.
  const ajustarTotalProposta = async (cotacaoId, atual) => {
    const promptMsg = atual
      ? `Total da proposta atual: R$ ${Number(atual).toFixed(2)}\n\nDigite o novo valor (ou apague tudo pra remover):`
      : "Digite o valor total da proposta do fornecedor (do PDF):\n\nEx: 110837.39\n\nO sistema vai ajustar os preços proporcionalmente pra bater com esse total no Omie.";
    const input = window.prompt(promptMsg, atual ? String(atual) : "");
    if (input === null) return;
    const valor = input.trim() === "" ? null : parseFloat(input.replace(",", "."));
    if (valor !== null && (isNaN(valor) || valor < 0)) {
      setErro("Valor inválido");
      return;
    }
    setLoading(`tp-${cotacaoId}`);
    setErro("");
    try {
      const res = await fetch(`/api/cotacao/${cotacaoId}/total-proposta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalProposta: valor }),
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
  // Mostra o VALOR DA NOTA (bruto + IPI) pra bater com o PDF da proposta
  // do fornecedor. ICMS recuperado como credito fica em "Custo liquido" como
  // info secundaria pra acompanhar o custo real Torg.
  // IMPORTANTE: usa itensTodos (nao o filtrado por mostrarPedidos) — totais devem
  // refletir TUDO que foi decidido, incluindo o que ja virou pedido.
  const totaisPorFornecedor = {}; // valor da nota (bruto + IPI)
  const totaisLiquidoPorFornecedor = {}; // custo real Torg apos credito ICMS
  const itensPorFornecedor = {};
  let totalEmPedidos = 0;
  let totalAGerar = 0;
  let totalLiquidoGeral = 0;
  for (const f of fornecedores) {
    totaisPorFornecedor[f.cotacaoId] = 0;
    totaisLiquidoPorFornecedor[f.cotacaoId] = 0;
    itensPorFornecedor[f.cotacaoId] = [];
  }
  for (const it of itensTodos) {
    for (const cell of it.celulas) {
      if (cell?.vencedor) {
        const ipiPct = Number(cell.ipiPct) || 0;
        const qtd = Number(cell.qtdCotada) || 0;
        const precoUnit = Number(cell.precoUnit) || 0;
        // Valor da nota = bruto × (1 + IPI%) — bate com "Preço total" do PDF
        const valorNota = precoUnit * qtd * (1 + ipiPct / 100);
        // Custo efetivo Torg — depende do faturamento:
        // - Fat Direto: igual ao valor da nota (sem credito ICMS)
        // - Fat Torg: liquido (com credito ICMS)
        const custoEfetivo = (cell.precoComparacao || cell.precoLiquido || precoUnit) * qtd;
        totaisPorFornecedor[cell.cotacaoId] += valorNota;
        totaisLiquidoPorFornecedor[cell.cotacaoId] += custoEfetivo;
        if (it.jaPedido) totalEmPedidos += valorNota;
        else if (!it.cancelado) totalAGerar += valorNota;
        totalLiquidoGeral += custoEfetivo;
        if (!it.jaPedido && !it.cancelado) {
          itensPorFornecedor[cell.cotacaoId].push({
            descricao: it.descricao,
            qtd: cell.qtdCotada,
            unidade: it.unidade,
            precoUnit: cell.precoUnit,
            precoLiquido: cell.precoLiquido,
            precoComparacao: cell.precoComparacao,
            faturamentoDireto: cell.faturamentoDireto,
            icmsPct: cell.icmsPct,
            ipiPct: cell.ipiPct,
            total: valorNota,
            totalLiquido: custoEfetivo,
          });
        }
      }
    }
  }
  const totalGeral = Object.values(totaisPorFornecedor).reduce((s, n) => s + n, 0);
  // Totais apenas dos itens que ainda nao viraram pedido — usado em
  // "Resumo dos pedidos a gerar" e no Modal de gerar pedidos.
  // Inclui valor da nota (pra mostrar) e liquido (pra info secundaria).
  const totaisAGerarPorFornecedor = {};
  const totaisAGerarLiquidoPorFornecedor = {};
  for (const f of fornecedores) {
    totaisAGerarPorFornecedor[f.cotacaoId] = itensPorFornecedor[f.cotacaoId].reduce(
      (s, it) => s + (it.total || 0),
      0
    );
    totaisAGerarLiquidoPorFornecedor[f.cotacaoId] = itensPorFornecedor[f.cotacaoId].reduce(
      (s, it) => s + (it.totalLiquido || 0),
      0
    );
  }
  const totalAGerarLiquido = Object.values(totaisAGerarLiquidoPorFornecedor).reduce((s, n) => s + n, 0);
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
            Itens marcados <span className="font-bold text-amber-700">FD</span> (Faturamento Direto) são comparados pelo bruto+IPI — ICMS não vira crédito pra Torg.
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
            <p className="text-xl font-extrabold text-torg-orange-700 tabular-nums" title="Valor da nota fiscal — bruto + IPI">
              {fmtMoeda(totalGeral)}
            </p>
            <p className="text-[10px] text-torg-gray mt-0.5 tabular-nums" title="Custo real Torg apos creditar ICMS">
              Custo líquido: {fmtMoeda(totalLiquidoGeral)}
            </p>
            {totalEmPedidos > 0 && totalAGerar > 0 && (
              <p className="text-[10px] text-torg-gray mt-0.5 tabular-nums">
                {fmtMoeda(totalEmPedidos)} em pedidos · {fmtMoeda(totalAGerar)} a gerar
              </p>
            )}
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
              // Marca o "menor" usando precoComparacao — que ja respeita
              // o faturamento de cada celula (Fat Direto = bruto+IPI;
              // Fat Torg = liquido com credito ICMS).
              const comparacoes = it.celulas
                .filter(Boolean)
                .map((c) => c.precoComparacao || c.precoLiquido || c.precoUnit)
                .filter((p) => p > 0);
              const menorLiquido = comparacoes.length ? Math.min(...comparacoes) : null;
              return (
                <tr key={it.rmItemId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs font-mono text-torg-blue sticky left-0 bg-white">{it.rmNumero}</td>
                  <td className="px-3 py-2 text-xs text-torg-gray">
                    {it.categoria ? labelCategoria(it.categoria) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <p className="text-torg-dark font-medium flex-1">{it.descricao}</p>
                      {it.faturamentoDireto && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold leading-none whitespace-nowrap flex-shrink-0 mt-0.5"
                          title="Faturamento Direto — comparação pelo BRUTO+IPI (ICMS não vira crédito pra Torg)"
                        >
                          FD
                        </span>
                      )}
                    </div>
                    {(it.material || it.comprimento || it.largura || it.tratamento) && (
                      <p className="text-[10px] text-torg-gray mt-0.5">
                        {it.material && <span>{it.material}</span>}
                        {(it.comprimento || it.largura) && (
                          <span className="text-torg-blue-700 font-medium ml-1">
                            {it.material ? "· " : ""}
                            {it.comprimento && it.largura
                              ? `${it.comprimento} × ${it.largura}`
                              : it.comprimento || it.largura}
                          </span>
                        )}
                        {it.tratamento && <span> · {it.tratamento}</span>}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-torg-gray text-xs tabular-nums whitespace-nowrap">
                    <div>{it.qtd} {it.unidade}</div>
                    {it.unidade === "KG" && it.qtdPecas > 0 && it.unidadeOriginal && it.unidadeOriginal !== "KG" && (
                      <div className="text-[10px] text-amber-700 font-semibold" title="Quantidade de peças">
                        {it.qtdPecas} {it.unidadeOriginal}
                      </div>
                    )}
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
                    // Valor de comparacao depende do faturamento do fornecedor:
                    // - Faturamento Direto: bruto+IPI (sem credito ICMS)
                    // - Faturamento Torg: liquido (com credito ICMS)
                    const comparacao = cell.precoComparacao || cell.precoLiquido || cell.precoUnit;
                    const isMenor = comparacao === menorLiquido;
                    const isVencedor = cell.vencedor;
                    const totalLinha = comparacao * cell.qtdCotada;
                    const temImposto = cell.icmsPct > 0 || cell.ipiPct > 0;
                    const fatDireto = cell.faturamentoDireto;
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
                          fatDireto
                            ? `Faturamento Direto — comparação pelo BRUTO+IPI ${fmtMoeda(comparacao)} (ICMS ${cell.icmsPct}% NÃO vira crédito) | bruto ${fmtMoeda(cell.precoUnit)} | IPI ${cell.ipiPct}%`
                            : temImposto
                            ? `Faturamento Torg — comparação pelo LÍQUIDO ${fmtMoeda(comparacao)} | bruto ${fmtMoeda(cell.precoUnit)} | ICMS ${cell.icmsPct}% (crédito) | IPI ${cell.ipiPct}%`
                            : `Preço bruto ${fmtMoeda(cell.precoUnit)}`
                        }
                      >
                        <div className={`text-sm font-medium tabular-nums ${isVencedor ? "text-torg-orange-700" : isMenor ? "text-torg-orange-700" : "text-torg-dark"}`}>
                          {fmtMoeda(comparacao)}
                          {fatDireto && <span className="text-[8px] ml-1 text-amber-700 font-bold">FD</span>}
                        </div>
                        <div className="text-[10px] text-torg-gray tabular-nums leading-tight">
                          {temImposto ? (
                            <>bruto {fmtMoeda(cell.precoUnit)}</>
                          ) : (
                            <>total {fmtMoeda(totalLinha)}</>
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
              <p className="text-xs text-torg-gray">Total a gerar (valor da nota)</p>
              <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums" title="Soma bruto + IPI dos itens vencedores ainda nao em pedido — bate com o PDF do fornecedor">
                {fmtMoeda(totalAGerar)}
              </p>
              <p className="text-[10px] text-torg-gray mt-0.5 tabular-nums" title="Custo real Torg apos creditar ICMS">
                Custo líquido: {fmtMoeda(totalAGerarLiquido)}
              </p>
            </div>
          </div>
          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {fornecedoresVencedores.map((f) => {
              const totalCalculado = totaisAGerarPorFornecedor[f.cotacaoId];
              const totalProposta = f.totalProposta;
              const temProposta = totalProposta != null && totalProposta > 0;
              const diff = temProposta ? Math.abs(totalCalculado - totalProposta) : 0;
              const mostrarAvisoDivergencia = !temProposta || diff > 0.05;
              return (
              <details key={f.cotacaoId} className="bg-white rounded-lg border border-torg-orange-100 p-4 group">
                <summary className="cursor-pointer list-none flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-torg-dark truncate flex items-center gap-2 flex-wrap">
                      {f.fornecedorNome}
                      {(() => {
                        const lista = itensPorFornecedor[f.cotacaoId];
                        const fds = lista.filter((it) => it.faturamentoDireto).length;
                        const todos = lista.length;
                        if (fds === 0) return null;
                        const label = fds === todos
                          ? "FATURAMENTO DIRETO"
                          : `${fds}/${todos} FD`;
                        return (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold whitespace-nowrap" title="Itens em Faturamento Direto — comparação pelo bruto+IPI">
                            {label}
                          </span>
                        );
                      })()}
                    </p>
                    <p className="text-xs text-torg-gray">
                      {itensPorFornecedor[f.cotacaoId].length} ite{itensPorFornecedor[f.cotacaoId].length === 1 ? "m" : "ns"}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xl font-extrabold text-torg-orange-700 tabular-nums">
                      {fmtMoeda(temProposta ? totalProposta : totalCalculado)}
                    </p>
                    {temProposta && diff > 0.05 && (
                      <p className="text-[10px] text-torg-gray tabular-nums" title="Total calculado dos itens">
                        calc: {fmtMoeda(totalCalculado)}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); ajustarTotalProposta(f.cotacaoId, totalProposta); }}
                      disabled={loading === `tp-${f.cotacaoId}`}
                      className="text-[10px] text-torg-blue hover:underline mt-0.5 inline-block disabled:opacity-50"
                      title="Sobrescrever total com valor exato do PDF do fornecedor"
                    >
                      {temProposta ? "✓ Total da proposta fixado · editar" : "Fixar total da proposta (PDF)"}
                    </button>
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
                        <th className="px-1 py-1 text-right font-medium" title="Custo efetivo Torg — varia por linha (FD = Bruto+IPI, Torg = Bruto×(1−ICMS)×(1+IPI))">
                          Custo efetivo
                        </th>
                        <th className="px-1 py-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {itensPorFornecedor[f.cotacaoId].map((it, i) => (
                        <tr key={i}>
                          <td className="px-1 py-1.5 text-torg-dark truncate max-w-[200px]" title={it.descricao}>
                            <div className="flex items-center gap-1">
                              <span className="truncate">{it.descricao}</span>
                              {it.faturamentoDireto && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-amber-200 text-amber-900 font-bold whitespace-nowrap flex-shrink-0" title="Faturamento Direto">FD</span>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap">
                            {it.qtd} {it.unidade}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap">
                            {fmtMoeda(it.precoUnit)}
                          </td>
                          <td className={`px-1 py-1.5 text-right tabular-nums ${it.faturamentoDireto ? "text-gray-300 line-through" : "text-torg-gray"}`} title={it.faturamentoDireto ? "ICMS ignorado em Faturamento Direto (sem crédito)" : ""}>
                            {it.icmsPct > 0 ? `−${it.icmsPct}%` : "—"}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-gray tabular-nums">
                            {it.ipiPct > 0 ? `+${it.ipiPct}%` : "—"}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-orange-700 font-medium tabular-nums whitespace-nowrap">
                            {fmtMoeda(it.precoComparacao || it.precoLiquido || it.precoUnit)}
                          </td>
                          <td className="px-1 py-1.5 text-right text-torg-dark font-bold tabular-nums whitespace-nowrap">
                            {fmtMoeda(it.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-torg-gray italic mt-2 px-1">
                    <strong>FD</strong> = Faturamento Direto (Bruto + IPI; ICMS não vira crédito pra Torg pois a NF vai pro cliente).
                    Demais itens: custo efetivo = Bruto × (1 − ICMS%) × (1 + IPI%) com crédito ICMS pra Torg.
                  </p>

                  {/* Botao: pedir revisao final ao fornecedor */}
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] text-torg-gray italic flex-1">
                      Antes de gerar o pedido, envie ao fornecedor pra que ele revise apenas estes itens vencedores e confirme os valores finais.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); solicitarRevisaoFinal(f.cotacaoId, f.fornecedorNome); }}
                      disabled={loading === `rev-${f.cotacaoId}`}
                      className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                      title="Marca a cotacao em modo revisao final e abre email pro fornecedor confirmar os itens vencedores"
                    >
                      {loading === `rev-${f.cotacaoId}` ? (
                        <><Loader2 size={12} className="animate-spin" /> Preparando...</>
                      ) : (
                        <><Send size={12} /> Pedir revisão final</>
                      )}
                    </button>
                  </div>

                  {/* Toast do resultado da solicitacao */}
                  {revisaoToast?.cotacaoId === f.cotacaoId && (
                    <div className={`mt-2 text-xs rounded px-3 py-2 ${
                      revisaoToast.ok
                        ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                        : "bg-red-50 border border-red-200 text-red-700"
                    }`}>
                      <div>{revisaoToast.ok ? "✓ " : "✗ "}{revisaoToast.msg}</div>
                      {revisaoToast.ok && emailRevisaoCache[f.cotacaoId] && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); reCopiarEmailRevisao(f.cotacaoId); }}
                            className="px-2 py-1 rounded font-medium bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                          >
                            Copiar de novo
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              const d = emailRevisaoCache[f.cotacaoId];
                              if (d) abrirOutlookMailto(d.to, d.subject);
                            }}
                            className="px-2 py-1 rounded font-medium bg-torg-blue text-white hover:bg-torg-blue-700 whitespace-nowrap"
                          >
                            Abrir Outlook
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </details>
              );
            })}
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
        totaisPorFornecedor={totaisAGerarPorFornecedor}
        totalGeral={totalAGerar}
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
                    {r.anexos && (r.anexos.anexados > 0 || r.anexos.erros > 0) && (
                      <p className="text-[11px] mt-1">
                        {r.anexos.anexados > 0 && (
                          <span className="text-emerald-700 font-medium">
                            📎 {r.anexos.anexados} anexo(s) enviado(s)
                          </span>
                        )}
                        {r.anexos.erros > 0 && (
                          <span className="text-red-600 ml-2">
                            · {r.anexos.erros} falha(s)
                          </span>
                        )}
                      </p>
                    )}
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

  // Mapa global: rmItemId -> { rmItem, rmNumero, categoria, faturamentoDireto }
  // Necessario pra cotacoes consolidadas onde rm.cotacoes inclui itens
  // que pertencem a outras RMs da mesma OP.
  const itemPorId = new Map();
  for (const rm of op.rms) {
    for (const it of rm.itens) {
      const cat = it.opItem?.categoria || it.aditivoItem?.categoria || null;
      // Flag de Faturamento Direto: vem do OPItem ou AditivoItem associado.
      // Define o criterio de comparacao da celula (bruto+IPI vs liquido).
      const fatDireto = !!(it.opItem?.faturamentoDireto || it.aditivoItem?.faturamentoDireto);
      itemPorId.set(it.id, { rmItem: it, rmNumero: rm.numero, categoria: cat, faturamentoDireto: fatDireto });
    }
  }

  for (const rm of op.rms) {
    for (const cot of rm.cotacoes) {
      if (cot.status !== "RECEBIDA") continue;

      for (const ci of cot.itens) {
        if (!ci.precoUnit || ci.precoUnit <= 0) continue;

        // Pula itens que nao pertencem a essa OP (ex: cotacao consolidada
        // com itens de outra OP, ou cotacao deslocada por outro motivo).
        // Sem item valido nessa OP, fornecedor nao deve nem aparecer.
        const entry = itemPorId.get(ci.rmItemId);
        if (!entry) continue;

        // So agora registra o fornecedor — apos confirmar que ele tem
        // pelo menos um item com preco DENTRO dessa OP.
        if (!fornMap.has(cot.id)) {
          fornMap.set(cot.id, {
            cotacaoId: cot.id,
            fornecedorNome: cot.fornecedorNome,
            cnpj: cot.cnpj || "",
            nCodOmie: cot.nCodOmie || "",
            totalProposta: cot.totalProposta || null,
          });
        }
        // Garante que o RMItem está na matriz (lookup global — multi-RM)
        if (!itensMap.has(ci.rmItemId)) {
          const { rmItem, rmNumero, categoria, faturamentoDireto: fatDiretoItem } = entry;
          itensMap.set(ci.rmItemId, {
            rmItemId: rmItem.id,
            rmNumero,
            descricao: rmItem.descricao,
            // Dimensoes e material — pra chapas precisam aparecer
            material: rmItem.material || null,
            comprimento: rmItem.comprimento || null,
            largura: rmItem.largura || null,
            tratamento: rmItem.tratamento || null,
            qtdPecas: rmItem.qtd, // qtd em pecas
            unidadeOriginal: rmItem.unidade,
            pesoTotal: Number(rmItem.peso) || 0,
            qtd: rmItem.peso > 0 ? Number(rmItem.peso).toFixed(2) : rmItem.qtd,
            unidade: rmItem.peso > 0 ? "KG" : rmItem.unidade,
            categoria,
            // Flag Faturamento Direto — DO ITEM (OPItem.faturamentoDireto).
            // Determina o criterio de comparacao das celulas dessa linha.
            faturamentoDireto: fatDiretoItem,
            // Status do RMItem — se ja virou pedido, podemos esconder/destacar
            itemStatus: rmItem.status,
            jaPedido: rmItem.status === "PEDIDO_GERADO",
            cancelado: rmItem.status === "CANCELADO",
            celulas: [],
          });
        }
        const icms = Number(ci.icmsPct) || 0;
        const ipi = Number(ci.ipiPct) || 0;
        // Preço líquido (custo Torg c/ credito ICMS): bruto * (1-ICMS) * (1+IPI)
        const precoLiquido = ci.precoUnit * (1 - icms / 100) * (1 + ipi / 100);
        // Valor da nota (bruto + IPI): o que sai do bolso da empresa pagante
        const valorNota = ci.precoUnit * (1 + ipi / 100);
        // PRECO PRA COMPARACAO/DECISAO — depende do ITEM (OPItem.faturamentoDireto):
        // - Faturamento Direto: bruto+IPI, ICMS nao vira credito pra Torg
        // - Faturamento Torg: liquido (com credito ICMS)
        const itemEhFatDireto = entry.faturamentoDireto;
        const precoComparacao = itemEhFatDireto ? valorNota : precoLiquido;
        itensMap.get(ci.rmItemId).celulas.push({
          id: ci.id,
          cotacaoId: cot.id,
          precoUnit: ci.precoUnit,
          precoLiquido,
          valorNota,
          precoComparacao,
          faturamentoDireto: itemEhFatDireto,
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
