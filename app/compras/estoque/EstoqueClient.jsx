"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Search, RefreshCw, Loader2, AlertCircle, Settings, ExternalLink, TrendingUp, TrendingDown, Microscope } from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtQtd = (v, unidade = "") =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidade}`.trim() : "—";
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function EstoqueClient({ itensIniciais, configInicial, isAdmin }) {
  const router = useRouter();
  const [itens, setItens] = useState(itensIniciais || []);
  const [config, setConfig] = useState(configInicial);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState(null);
  // 3 estados: null = todos | "torg" = apenas Estoque Torg | "outros" = apenas nao-Estoque-Torg
  const [filtroTorg, setFiltroTorg] = useState("torg");
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [modalConfig, setModalConfig] = useState(false);
  const [diagnostico, setDiagnostico] = useState(null);
  const [carregandoDiag, setCarregandoDiag] = useState(false);

  // Categorias unicas presentes nos items
  const categorias = useMemo(() => {
    const set = new Map();
    for (const i of itens) {
      if (i.categoriaOmie) set.set(i.categoriaOmie, i.categoriaLabel || i.categoriaOmie);
    }
    return Array.from(set.entries()).map(([cod, lbl]) => ({ codigo: cod, label: lbl }));
  }, [itens]);

  const totalTorg = useMemo(() => itens.filter((i) => i.estoqueTorg).length, [itens]);

  const filtrados = useMemo(() => {
    return itens.filter((i) => {
      if (filtroTorg === "torg" && !i.estoqueTorg) return false;
      if (filtroTorg === "outros" && i.estoqueTorg) return false;
      if (filtroCat && i.categoriaOmie !== filtroCat) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hay = `${i.descricao} ${i.codigoOmie} ${i.categoriaLabel || ""}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [itens, busca, filtroCat, filtroTorg]);

  // KPIs
  const valorTotalEstoque = useMemo(() => {
    return filtrados.reduce((s, i) => s + (Number(i.cmc) || 0) * (Number(i.qtdAtual) || 0), 0);
  }, [filtrados]);
  const qtdItensComEstoque = useMemo(() => filtrados.filter((i) => i.qtdAtual > 0).length, [filtrados]);
  const qtdItensSemEstoque = useMemo(() => filtrados.filter((i) => i.qtdAtual <= 0).length, [filtrados]);

  const rodarDiagnostico = async () => {
    setCarregandoDiag(true);
    setErro("");
    try {
      const res = await fetch("/api/estoque/diagnostico");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setDiagnostico(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregandoDiag(false);
    }
  };

  const sincronizar = async () => {
    setSincronizando(true);
    setErro("");
    setInfo("");
    try {
      const res = await fetch("/api/estoque/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtos: true, movimentacoes: true, diasAtras: 7 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      const partes = [];
      if (data.produtos) {
        if (data.produtos.error) partes.push(`Produtos: ${data.produtos.error}`);
        else {
          let txt = `${data.produtos.criados} criados, ${data.produtos.atualizados} atualizados`;
          if (data.produtos.estoqueTorgMarcados !== undefined) {
            txt += ` (${data.produtos.estoqueTorgMarcados} marcados como Estoque Torg)`;
          }
          partes.push(txt);
        }
      }
      if (data.movimentacoes) {
        if (data.movimentacoes.error) partes.push(`Movs: ${data.movimentacoes.error}`);
        else partes.push(`${data.movimentacoes.entradas} entradas, ${data.movimentacoes.saidas} saídas`);
      }
      setInfo(partes.join(" · "));
      router.refresh();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <Package size={26} className="text-torg-blue" /> Estoque Torg
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Materiais sincronizados do Omie via ListarPosEstoque.
            {(config?.palavrasChave || []).length > 0 ? (
              <> Palavras-chave: <strong>{(config.palavrasChave || []).join(", ")}</strong>.</>
            ) : (
              <> <span className="text-amber-700">Configure palavras-chave pra marcar produtos como Estoque Torg.</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={rodarDiagnostico}
            disabled={carregandoDiag}
            className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50"
            title="Inspeciona a 1a pagina de produtos do Omie pra descobrir nomes/codigos das categorias"
          >
            {carregandoDiag ? <Loader2 size={14} className="animate-spin" /> : <Microscope size={14} />}
            Diagnóstico
          </button>
          {isAdmin && (
            <button
              onClick={() => setModalConfig(true)}
              className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2"
            >
              <Settings size={14} /> Configurar
            </button>
          )}
          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
          >
            {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sincronizar agora
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
        </div>
      )}
      {info && !erro && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">
          ✓ {info}
        </div>
      )}

      {diagnostico && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
              <Microscope size={14} /> Diagnóstico do Omie
            </p>
            <button
              onClick={() => setDiagnostico(null)}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium"
            >
              Fechar
            </button>
          </div>

          {/* 1) Famílias — sempre mostra status, mesmo vazio */}
          <div>
            {diagnostico.familiasErro ? (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                ✗ <strong>ListarFamilias:</strong> {diagnostico.familiasErro}
              </div>
            ) : diagnostico.familias && diagnostico.familias.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-emerald-700 mb-1">
                  ✓ ListarFamilias — {diagnostico.totalFamilias || diagnostico.familias.length} famílias no Omie
                </p>
                <div className="bg-white border border-amber-200 rounded p-2 max-h-[280px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-amber-800">
                        <th className="text-left pb-1">Código</th>
                        <th className="text-left pb-1">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostico.familias.filter((f) => !f.inativa).map((f, i) => (
                        <tr key={i} className="border-t border-amber-100">
                          <td className="py-1 font-mono text-torg-blue font-semibold pr-3">{f.codigo || "—"}</td>
                          <td className="py-1 text-torg-dark">{f.descricao || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-amber-700 mt-1 italic">
                  💡 Encontre a categoria "Matéria Prima" (ou equivalente), copie o <strong>código exato</strong> e cole em Configurar.
                </p>
              </>
            ) : diagnostico.familias ? (
              <div className="bg-amber-100 border border-amber-300 rounded p-2 text-xs text-amber-800">
                ⚠️ ListarFamilias retornou vazio (0 famílias cadastradas no Omie).
              </div>
            ) : (
              <div className="text-xs text-torg-gray italic">ListarFamilias não testado.</div>
            )}
          </div>

          {/* 2) ListarProdutos COM filtro por família — o teste decisivo */}
          {diagnostico.testesComFiltro && diagnostico.testesComFiltro.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-900">
                Teste com filtro por categoria configurada ({(diagnostico.categoriasConfig || []).join(", ")}):
              </p>
              {diagnostico.testesComFiltro.map((t, i) => (
                <div key={i} className={`rounded p-2 text-xs ${
                  t.ok
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                  {t.ok ? (
                    <>
                      ✓ <strong>ListarProdutos (familia {t.categoria}):</strong>{" "}
                      {t.totalRegistros ?? "?"} produtos em {t.totalPaginas ?? "?"} páginas
                      {t.exemplo && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-emerald-700">Exemplo do 1º produto</summary>
                          <pre className="text-[10px] bg-white border border-emerald-200 rounded p-2 mt-1 overflow-x-auto">
                            {JSON.stringify(t.exemplo, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      ✗ <strong>ListarProdutos (familia {t.categoria}):</strong> {t.erro}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 3) ListarProdutosResumido (sem filtro) */}
          {diagnostico.produtosResumido && (
            <div className={`text-xs rounded p-2 ${
              diagnostico.produtosResumido.ok
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {diagnostico.produtosResumido.ok ? (
                <>✓ <strong>ListarProdutosResumido (sem filtro):</strong> {diagnostico.produtosResumido.totalRegistros ?? "?"} produtos em {diagnostico.produtosResumido.totalPaginas ?? "?"} páginas</>
              ) : (
                <>✗ <strong>ListarProdutosResumido (sem filtro):</strong> {diagnostico.produtosResumido.erro}</>
              )}
            </div>
          )}

          {/* 4) ListarProdutos completo SEM filtro */}
          {diagnostico.produtosCompleto && (
            <div className={`text-xs rounded p-2 ${
              diagnostico.produtosCompleto.ok
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {diagnostico.produtosCompleto.ok ? (
                <>✓ <strong>ListarProdutos (sem filtro):</strong> {diagnostico.produtosCompleto.totalPaginas ?? "?"} páginas</>
              ) : (
                <>✗ <strong>ListarProdutos (sem filtro):</strong> {diagnostico.produtosCompleto.erro}</>
              )}
            </div>
          )}

          {/* 5) ListarPosEstoque — endpoint alternativo (sem passar pelo cadastro de produtos) */}
          {diagnostico.posEstoque && (
            <div className={`rounded p-2 text-xs ${
              diagnostico.posEstoque.ok
                ? "bg-emerald-50 border border-emerald-300 text-emerald-900"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {diagnostico.posEstoque.ok ? (
                <>
                  <p className="font-semibold">
                    ✓ <strong>ListarPosEstoque (endpoint alternativo):</strong>{" "}
                    {diagnostico.posEstoque.totalRegistros ?? "?"} produtos com estoque ({diagnostico.posEstoque.totalPaginas ?? "?"} páginas)
                  </p>
                  <p className="mt-1 text-[11px]">
                    🎯 <strong>Salvação:</strong> esse endpoint funciona! A sync pode usar ele pra puxar produtos.
                  </p>
                  {diagnostico.posEstoque.exemplo && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-emerald-700 text-[11px]">Ver exemplo de produto retornado</summary>
                      <pre className="text-[10px] bg-white border border-emerald-200 rounded p-2 mt-1 overflow-x-auto">
                        {JSON.stringify(diagnostico.posEstoque.exemplo, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              ) : (
                <>✗ <strong>ListarPosEstoque:</strong> {diagnostico.posEstoque.erro}</>
              )}
            </div>
          )}

          {/* 6) ListarMovEstoque */}
          {diagnostico.movEstoque && (
            <div className={`rounded p-2 text-xs ${
              diagnostico.movEstoque.ok
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {diagnostico.movEstoque.ok ? (
                <>
                  ✓ <strong>ListarMovEstoque:</strong> {diagnostico.movEstoque.totalNaPagina} movimentações na 1ª página
                  ({diagnostico.movEstoque.totalPaginas ?? "?"} páginas)
                </>
              ) : (
                <>✗ <strong>ListarMovEstoque:</strong> {diagnostico.movEstoque.erro}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4">
          <p className="text-xs text-torg-gray">Valor total em estoque</p>
          <p className="text-2xl font-extrabold text-torg-blue tabular-nums mt-1">{fmtMoeda(valorTotalEstoque)}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">Σ (CMC × qtd)</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-4">
          <p className="text-xs text-torg-gray">Itens em estoque</p>
          <p className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">{qtdItensComEstoque}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">com qtd &gt; 0</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
          <p className="text-xs text-torg-gray">Itens sem estoque</p>
          <p className="text-2xl font-extrabold text-amber-700 tabular-nums mt-1">{qtdItensSemEstoque}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">precisam de reposição</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou código..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          <button
            onClick={() => setFiltroTorg("torg")}
            className={`px-3 py-2 ${filtroTorg === "torg" ? "bg-emerald-600 text-white" : "bg-white text-torg-gray hover:bg-gray-50"}`}
          >
            Estoque Torg ({totalTorg})
          </button>
          <button
            onClick={() => setFiltroTorg("outros")}
            className={`px-3 py-2 border-l border-gray-300 ${filtroTorg === "outros" ? "bg-gray-700 text-white" : "bg-white text-torg-gray hover:bg-gray-50"}`}
          >
            Outros ({itens.length - totalTorg})
          </button>
          <button
            onClick={() => setFiltroTorg(null)}
            className={`px-3 py-2 border-l border-gray-300 ${filtroTorg === null ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"}`}
          >
            Todos ({itens.length})
          </button>
        </div>
        {categorias.length > 1 && (
          <select
            value={filtroCat || ""}
            onChange={(e) => setFiltroCat(e.target.value || null)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue"
          >
            <option value="">Todas categorias</option>
            {categorias.map((c) => (
              <option key={c.codigo} value={c.codigo}>{c.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {itens.length === 0 ? "Nenhum item sincronizado ainda" : "Nenhum item encontrado"}
          </p>
          {itens.length === 0 && (
            <p className="text-xs text-torg-gray mt-2">
              Clique em <strong>"Sincronizar agora"</strong> pra puxar os produtos do Omie.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Torg</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Qtd</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">CMC</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Valor total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Última sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((i) => {
                  const valorTotal = (Number(i.cmc) || 0) * (Number(i.qtdAtual) || 0);
                  const semEstoque = i.qtdAtual <= 0;
                  return (
                    <tr key={i.id} className={`hover:bg-gray-50 ${semEstoque ? "bg-amber-50/20" : ""}`}>
                      <td className="px-3 py-3 text-center">
                        {isAdmin ? (
                          <ToggleEstoqueTorg
                            itemId={i.id}
                            initial={i.estoqueTorg}
                            onChanged={(novoValor) => {
                              setItens((prev) => prev.map((x) => x.id === i.id ? { ...x, estoqueTorg: novoValor } : x));
                            }}
                          />
                        ) : (
                          i.estoqueTorg ? (
                            <span title="Estoque Torg" className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
                          ) : (
                            <span title="Não" className="inline-block w-3 h-3 rounded-full bg-gray-200" />
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-torg-gray whitespace-nowrap">{i.codigoOmie}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/compras/estoque/${i.id}`}
                          className="text-torg-dark font-medium hover:text-torg-blue hover:underline"
                        >
                          {i.descricao}
                        </Link>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium ${
                        semEstoque ? "text-amber-700" : "text-torg-dark"
                      }`}>
                        {fmtQtd(i.qtdAtual, i.unidade)}
                      </td>
                      <td className="px-4 py-3 text-right text-torg-gray text-xs tabular-nums whitespace-nowrap">
                        {fmtMoeda(i.cmc)}
                      </td>
                      <td className="px-4 py-3 text-right text-torg-dark font-semibold tabular-nums whitespace-nowrap">
                        {fmtMoeda(valorTotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-[10px] text-torg-gray whitespace-nowrap">
                        {fmtDataHora(i.ultimaSincOmie)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status sync no rodape */}
      <div className="text-xs text-torg-gray flex items-center gap-4 flex-wrap">
        <span>Última sync produtos: <strong>{fmtDataHora(config?.ultimaSincProd)}</strong></span>
        <span>Última sync movimentações: <strong>{fmtDataHora(config?.ultimaSincMov)}</strong></span>
        <span className="text-[10px]">Cron automático: produtos 1x/hora, movimentações 1x/hora</span>
      </div>

      {modalConfig && (
        <ModalConfig
          config={config}
          onClose={() => setModalConfig(false)}
          onSaved={(c) => { setConfig(c); setModalConfig(false); }}
        />
      )}
    </div>
  );
}

// Botao toggle pra marcar/desmarcar item como Estoque Torg (apenas admin).
function ToggleEstoqueTorg({ itemId, initial, onChanged }) {
  const [valor, setValor] = useState(!!initial);
  const [salvando, setSalvando] = useState(false);

  const toggle = async () => {
    if (salvando) return;
    const novo = !valor;
    setSalvando(true);
    setValor(novo); // optimistic
    try {
      const res = await fetch(`/api/estoque/item/${itemId}/torg`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estoqueTorg: novo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro");
      }
      onChanged?.(novo);
    } catch (e) {
      setValor(!novo); // reverte
      alert("Falhou: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={salvando}
      className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${
        valor ? "bg-emerald-500" : "bg-gray-300"
      } ${salvando ? "opacity-50" : "hover:opacity-80"}`}
      title={valor ? "É Estoque Torg — clique para desmarcar" : "Não é Estoque Torg — clique para marcar"}
    >
      <span className={`inline-block w-4 h-4 transform bg-white rounded-full shadow transition-transform ${
        valor ? "translate-x-4" : "translate-x-0.5"
      }`} />
    </button>
  );
}

function ModalConfig({ config, onClose, onSaved }) {
  const [categorias, setCategorias] = useState(config?.categoriasOmie || ["3.1"]);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [palavras, setPalavras] = useState(config?.palavrasChave || []);
  const [novaPalavra, setNovaPalavra] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const adicionarCat = () => {
    const c = novaCategoria.trim();
    if (!c) return;
    if (categorias.includes(c)) {
      setErro(`Categoria "${c}" já está na lista`);
      return;
    }
    setCategorias([...categorias, c]);
    setNovaCategoria("");
    setErro("");
  };
  const removerCat = (c) => setCategorias(categorias.filter((x) => x !== c));

  const adicionarPalavra = () => {
    const p = novaPalavra.trim().toUpperCase();
    if (!p) return;
    if (palavras.includes(p)) {
      setErro(`Palavra "${p}" já está na lista`);
      return;
    }
    setPalavras([...palavras, p]);
    setNovaPalavra("");
    setErro("");
  };
  const removerPalavra = (p) => setPalavras(palavras.filter((x) => x !== p));

  const salvar = async () => {
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch("/api/estoque/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoriasOmie: categorias, palavrasChave: palavras }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved(data.config);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <Settings size={18} /> Configurações do Estoque
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-6">
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
            </div>
          )}

          {/* PALAVRAS-CHAVE — destaque, é a principal */}
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">
              Palavras-chave para "Estoque Torg" ⭐
            </label>
            <p className="text-xs text-torg-gray mb-3">
              Produtos cuja descrição <strong>contém</strong> alguma dessas palavras serão marcados como Estoque Torg (matéria-prima central).
              Match não diferencia maiúsculas/minúsculas. Ex: <code>AÇO</code>, <code>CHAPA</code>, <code>TUBO</code>, <code>PERFIL</code>.
            </p>
            <div className="space-y-2">
              {palavras.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  ⚠️ Nenhuma palavra-chave. Sem isso, nenhum produto entra no Estoque Torg.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {palavras.map((p) => (
                    <div key={p} className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-300 rounded-full text-sm">
                      <span className="font-mono text-emerald-800 font-semibold">{p}</span>
                      <button
                        onClick={() => removerPalavra(p)}
                        className="text-emerald-600 hover:text-red-600 leading-none text-lg"
                        title="Remover"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={novaPalavra}
                onChange={(e) => setNovaPalavra(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarPalavra())}
                placeholder="Ex: AÇO"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
              <button
                onClick={adicionarPalavra}
                className="px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
              >
                + Adicionar
              </button>
            </div>
          </div>

          {/* CATEGORIAS — secundário */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Categorias do Omie (opcional)
            </label>
            <p className="text-xs text-torg-gray mb-3">
              Códigos de família do Omie. Atualmente seu Omie não tem famílias estruturadas, então esse filtro é opcional.
              Se vazio, o sistema usa só as palavras-chave acima.
            </p>
            <div className="space-y-2">
              {categorias.map((c) => (
                <div key={c} className="flex items-center justify-between gap-2 px-3 py-2 bg-torg-blue-50 border border-torg-blue-200 rounded-lg">
                  <span className="font-mono text-sm text-torg-blue font-semibold">{c}</span>
                  <button
                    onClick={() => removerCat(c)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarCat())}
                placeholder="Ex: 3.1"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
              />
              <button
                onClick={adicionarCat}
                className="px-3 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700"
              >
                + Adicionar
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
