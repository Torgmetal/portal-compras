"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package, Search, RefreshCw, Loader2, AlertCircle, ExternalLink,
  Microscope, ChevronDown, X,
} from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtQtd = (v, unidade = "") =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`.trim() : "—";
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function EstoqueClient({ itensIniciais, configInicial, isAdmin }) {
  const router = useRouter();
  const [itens, setItens] = useState(itensIniciais || []);
  const [config, setConfig] = useState(configInicial);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [busca, setBusca] = useState("");
  const [filtroFamilia, setFiltroFamilia] = useState("");  // codigo da familia
  const [filtroEstoque, setFiltroEstoque] = useState("");  // "" | "com" | "sem"
  const [filtroTorg, setFiltroTorg] = useState("");        // "" | "torg" | "outros"

  // ── Estados de UI ──────────────────────────────────────────────────────────
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [diagnostico, setDiagnostico] = useState(null);
  const [carregandoDiag, setCarregandoDiag] = useState(false);

  // ── Dados derivados ────────────────────────────────────────────────────────

  // Famílias únicas presentes nos itens (código → label)
  const familias = useMemo(() => {
    const map = new Map();
    for (const i of itens) {
      if (i.categoriaOmie) {
        map.set(i.categoriaOmie, i.categoriaLabel || i.categoriaOmie);
      }
    }
    return Array.from(map.entries())
      .map(([codigo, label]) => ({ codigo, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [itens]);

  const totalTorg   = useMemo(() => itens.filter((i) => i.estoqueTorg).length, [itens]);
  const totalComEst = useMemo(() => itens.filter((i) => i.qtdAtual > 0).length,  [itens]);

  const filtrados = useMemo(() => {
    return itens.filter((i) => {
      if (filtroFamilia && i.categoriaOmie !== filtroFamilia) return false;
      if (filtroEstoque === "com"  && !(i.qtdAtual > 0))  return false;
      if (filtroEstoque === "sem"  &&   i.qtdAtual > 0)   return false;
      if (filtroTorg    === "torg" && !i.estoqueTorg)      return false;
      if (filtroTorg    === "outros" &&  i.estoqueTorg)    return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hay = `${i.descricao} ${i.codigoOmie} ${i.categoriaLabel || ""}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [itens, busca, filtroFamilia, filtroEstoque, filtroTorg]);

  const temFiltroAtivo = busca || filtroFamilia || filtroEstoque || filtroTorg;

  // KPIs dos itens filtrados
  const valorTotal       = useMemo(() => filtrados.reduce((s, i) => s + (Number(i.cmc) || 0) * (Number(i.qtdAtual) || 0), 0), [filtrados]);
  const filtComEstoque   = useMemo(() => filtrados.filter((i) => i.qtdAtual > 0).length, [filtrados]);
  const filtSemEstoque   = useMemo(() => filtrados.filter((i) => !(i.qtdAtual > 0)).length, [filtrados]);

  // ── Ações ──────────────────────────────────────────────────────────────────
  const limparFiltros = () => {
    setBusca("");
    setFiltroFamilia("");
    setFiltroEstoque("");
    setFiltroTorg("");
  };

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
        if (data.produtos.error) {
          partes.push(`Produtos: ${data.produtos.error}`);
        } else {
          let txt = `${data.produtos.total ?? "?"} produtos`;
          if (data.produtos.fonteUsada)  txt += ` via ${data.produtos.fonteUsada}`;
          if (data.produtos.criados)     txt += `, ${data.produtos.criados} novos`;
          if (data.produtos.desativados) txt += `, ${data.produtos.desativados} desativados`;
          if (data.produtos.enriquecidos) txt += `, ${data.produtos.enriquecidos} famílias`;
          if (data.produtos.erros?.length) txt += ` ⚠ ${data.produtos.erros[0]}`;
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <Package size={26} className="text-torg-blue" /> Catálogo Omie
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Todos os produtos ativos sincronizados do Omie ERP.
            {config?.ultimaSincProd ? (
              <> Última sync: <strong>{fmtDataHora(config.ultimaSincProd)}</strong>.</>
            ) : (
              <> <span className="text-amber-700">Sem sincronização. Clique em "Sincronizar agora".</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={rodarDiagnostico}
            disabled={carregandoDiag}
            title="Testa endpoints do Omie para diagnóstico"
            className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50"
          >
            {carregandoDiag ? <Loader2 size={14} className="animate-spin" /> : <Microscope size={14} />}
            Diagnóstico
          </button>
          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50"
          >
            {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
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

      {/* Diagnóstico */}
      {diagnostico && (
        <DiagnosticoPanel diagnostico={diagnostico} onClose={() => setDiagnostico(null)} />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4">
          <p className="text-xs text-torg-gray">Valor em estoque</p>
          <p className="text-xl font-extrabold text-torg-blue tabular-nums mt-1 leading-tight">{fmtMoeda(valorTotal)}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">Σ (CMC × qtd) — filtrado</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-4">
          <p className="text-xs text-torg-gray">Com estoque</p>
          <p className="text-xl font-extrabold text-emerald-700 tabular-nums mt-1">{filtComEstoque}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">de {filtrados.length} filtrados</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
          <p className="text-xs text-torg-gray">Sem estoque</p>
          <p className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">{filtSemEstoque}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">qtd = 0</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-torg-gray">Total no catálogo</p>
          <p className="text-xl font-extrabold text-torg-dark tabular-nums mt-1">{itens.length}</p>
          <p className="text-[10px] text-torg-gray mt-0.5">{totalTorg} Matéria Prima · {totalComEst} com qtd</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Busca texto */}
          <div className="flex-1 min-w-[220px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição, código ou família…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue"
            />
          </div>

          {/* Família */}
          <div className="relative">
            <select
              value={filtroFamilia}
              onChange={(e) => setFiltroFamilia(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue bg-white"
            >
              <option value="">Todas as famílias</option>
              {familias.map((f) => (
                <option key={f.codigo} value={f.codigo}>{f.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>

          {/* Estoque */}
          <div className="relative">
            <select
              value={filtroEstoque}
              onChange={(e) => setFiltroEstoque(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue bg-white"
            >
              <option value="">Qualquer estoque</option>
              <option value="com">Com estoque (qtd &gt; 0)</option>
              <option value="sem">Sem estoque (qtd = 0)</option>
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
          </div>

          {/* Tipo Torg */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {[
              { val: "",       label: `Todos (${itens.length})` },
              { val: "torg",   label: `Matéria Prima (${totalTorg})` },
              { val: "outros", label: `Outros (${itens.length - totalTorg})` },
            ].map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setFiltroTorg(val)}
                className={`px-3 py-2 transition-colors ${
                  filtroTorg === val
                    ? val === "" ? "bg-torg-blue text-white"
                      : val === "torg" ? "bg-emerald-600 text-white"
                      : "bg-gray-600 text-white"
                    : "bg-white text-torg-gray hover:bg-gray-50"
                } ${val !== "" ? "border-l border-gray-200" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Limpar filtros */}
          {temFiltroAtivo && (
            <button
              onClick={limparFiltros}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-torg-gray">
            <strong className="text-torg-dark">{filtrados.length}</strong> produto{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
            {temFiltroAtivo && <span className="text-torg-blue"> (de {itens.length} no catálogo)</span>}
          </p>
        </div>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg font-medium">
            {itens.length === 0 ? "Nenhum produto sincronizado ainda" : "Nenhum produto encontrado"}
          </p>
          {itens.length === 0 ? (
            <p className="text-xs text-torg-gray mt-2">
              Clique em <strong>"Sincronizar agora"</strong> para puxar o catálogo do Omie.
            </p>
          ) : (
            <button onClick={limparFiltros} className="mt-3 text-sm text-torg-blue hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap w-10">
                    Torg
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Código
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Descrição
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Família
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Qtd
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    CMC
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Valor total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                    Última sync
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((i) => {
                  const valorLinha = (Number(i.cmc) || 0) * (Number(i.qtdAtual) || 0);
                  const semEstoque = !(i.qtdAtual > 0);
                  return (
                    <tr key={i.id} className={`hover:bg-gray-50 transition-colors ${semEstoque ? "opacity-60" : ""}`}>
                      {/* Toggle Torg */}
                      <td className="px-3 py-3 text-center">
                        {isAdmin ? (
                          <ToggleEstoqueTorg
                            itemId={i.id}
                            initial={i.estoqueTorg}
                            onChanged={(v) =>
                              setItens((prev) =>
                                prev.map((x) => (x.id === i.id ? { ...x, estoqueTorg: v } : x))
                              )
                            }
                          />
                        ) : (
                          <span
                            title={i.estoqueTorg ? "Matéria Prima" : "Outro"}
                            className={`inline-block w-3 h-3 rounded-full ${i.estoqueTorg ? "bg-emerald-500" : "bg-gray-200"}`}
                          />
                        )}
                      </td>
                      {/* Código */}
                      <td className="px-4 py-3 font-mono text-xs text-torg-gray whitespace-nowrap">
                        {i.codigoOmie}
                      </td>
                      {/* Descrição */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/compras/estoque/${i.id}`}
                          className="text-torg-dark font-medium hover:text-torg-blue hover:underline"
                        >
                          {i.descricao}
                        </Link>
                      </td>
                      {/* Família */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {i.categoriaLabel ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-torg-blue-50 text-torg-blue font-medium">
                            {i.categoriaLabel}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      {/* Qtd */}
                      <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium ${semEstoque ? "text-gray-400" : "text-torg-dark"}`}>
                        {fmtQtd(i.qtdAtual, i.unidade)}
                      </td>
                      {/* CMC */}
                      <td className="px-4 py-3 text-right text-torg-gray text-xs tabular-nums whitespace-nowrap">
                        {fmtMoeda(i.cmc)}
                      </td>
                      {/* Valor total */}
                      <td className="px-4 py-3 text-right text-torg-dark font-semibold tabular-nums whitespace-nowrap">
                        {valorLinha > 0 ? fmtMoeda(valorLinha) : <span className="text-gray-300">—</span>}
                      </td>
                      {/* Última sync */}
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

      {/* Rodapé */}
      <div className="text-xs text-torg-gray flex items-center gap-4 flex-wrap">
        <span>Última sync produtos: <strong>{fmtDataHora(config?.ultimaSincProd)}</strong></span>
        <span>Última sync movimentações: <strong>{fmtDataHora(config?.ultimaSincMov)}</strong></span>
        <span className="text-[10px] text-gray-400">Cron automático: diariamente às 06:00 (produtos) e 06:30 (movimentações)</span>
      </div>
    </div>
  );
}

// ── Toggle Estoque Torg (admin) ────────────────────────────────────────────────
function ToggleEstoqueTorg({ itemId, initial, onChanged }) {
  const [valor, setValor] = useState(!!initial);
  const [salvando, setSalvando] = useState(false);

  const toggle = async () => {
    if (salvando) return;
    const novo = !valor;
    setSalvando(true);
    setValor(novo);
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
      setValor(!novo);
      alert("Falhou: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={salvando}
      title={valor ? "Matéria Prima — clique para desmarcar" : "Outro — clique para marcar como Matéria Prima"}
      className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${
        valor ? "bg-emerald-500" : "bg-gray-300"
      } ${salvando ? "opacity-50" : "hover:opacity-80"}`}
    >
      <span className={`inline-block w-4 h-4 transform bg-white rounded-full shadow transition-transform ${
        valor ? "translate-x-4" : "translate-x-0.5"
      }`} />
    </button>
  );
}

// ── Painel de diagnóstico ──────────────────────────────────────────────────────
function DiagnosticoPanel({ diagnostico, onClose }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-900 inline-flex items-center gap-2">
          <Microscope size={14} /> Diagnóstico do Omie
        </p>
        <button onClick={onClose} className="text-xs text-amber-700 hover:text-amber-900 font-medium">
          Fechar
        </button>
      </div>

      {/* Famílias */}
      {diagnostico.familiasErro ? (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
          ✗ <strong>ListarFamilias:</strong> {diagnostico.familiasErro}
        </div>
      ) : diagnostico.familias?.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-emerald-700 mb-1">
            ✓ ListarFamilias — {diagnostico.totalFamilias || diagnostico.familias.length} famílias
          </p>
          <div className="bg-white border border-amber-200 rounded p-2 max-h-48 overflow-y-auto">
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
        </div>
      ) : (
        <div className="bg-amber-100 border border-amber-300 rounded p-2 text-xs text-amber-800">
          ⚠️ ListarFamilias retornou vazio — as famílias vêm diretamente do ListarProdutos.
        </div>
      )}

      {/* Testes com filtro */}
      {diagnostico.testesComFiltro?.map((t, i) => (
        <div key={i} className={`rounded p-2 text-xs ${t.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {t.ok
            ? <>✓ <strong>ListarProdutos (familia {t.categoria}):</strong> {t.totalRegistros ?? "?"} produtos em {t.totalPaginas ?? "?"} páginas</>
            : <>✗ <strong>ListarProdutos (familia {t.categoria}):</strong> {t.erro}</>}
        </div>
      ))}

      {/* ListarPosEstoque */}
      {diagnostico.posEstoque && (
        <div className={`rounded p-2 text-xs ${diagnostico.posEstoque.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {diagnostico.posEstoque.ok
            ? <>✓ <strong>ListarPosEstoque:</strong> {diagnostico.posEstoque.totalRegistros ?? "?"} produtos ({diagnostico.posEstoque.totalPaginas ?? "?"} páginas)</>
            : <>✗ <strong>ListarPosEstoque:</strong> {diagnostico.posEstoque.erro}</>}
        </div>
      )}

      {/* ListarMovEstoque */}
      {diagnostico.movEstoque && (
        <div className={`rounded p-2 text-xs ${diagnostico.movEstoque.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {diagnostico.movEstoque.ok
            ? <>✓ <strong>ListarMovEstoque:</strong> {diagnostico.movEstoque.totalNaPagina} movimentações na 1ª página</>
            : <>✗ <strong>ListarMovEstoque:</strong> {diagnostico.movEstoque.erro}</>}
        </div>
      )}
    </div>
  );
}
