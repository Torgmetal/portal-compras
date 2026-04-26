"use client";
import { useState, useMemo, useEffect } from "react";
import { X, FileSpreadsheet, Download, AlertCircle, Send, Loader2 } from "lucide-react";

export default function ExportOmieModal({
  open,
  onClose,
  pedidosPorFornecedor,
  onConfirm,
  loading,
}) {
  const [categoria, setCategoria] = useState("");
  const [localEstoque, setLocalEstoque] = useState("");
  const [locaisOpcoes, setLocaisOpcoes] = useState([]);
  const [categoriasOpcoes, setCategoriasOpcoes] = useState([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);
  const [erroOpcoes, setErroOpcoes] = useState("");
  const [erro, setErro] = useState("");
  const [acaoEmCurso, setAcaoEmCurso] = useState(null); // "xlsx" | "api"

  // Busca locais de estoque + categorias no Omie quando o modal abre
  useEffect(() => {
    if (!open) return;
    if (locaisOpcoes.length > 0 && categoriasOpcoes.length > 0) return; // cache da sessão
    setCarregandoOpcoes(true);
    setErroOpcoes("");
    Promise.all([
      fetch("/api/omie/locais-estoque").then((r) => r.json()).catch((e) => ({ error: e?.message })),
      fetch("/api/omie/categorias").then((r) => r.json()).catch((e) => ({ error: e?.message })),
    ])
      .then(([dl, dc]) => {
        if (dl?.locais?.length) setLocaisOpcoes(dl.locais);
        if (dc?.categorias?.length) setCategoriasOpcoes(dc.categorias);
        const erros = [dl?.error, dc?.error].filter(Boolean);
        if (erros.length) setErroOpcoes(erros.join(" | "));
      })
      .finally(() => setCarregandoOpcoes(false));
  }, [open, locaisOpcoes.length, categoriasOpcoes.length]);

  const grupos = useMemo(
    () => Object.values(pedidosPorFornecedor || {}),
    [pedidosPorFornecedor]
  );

  if (!open) return null;

  const validar = () => {
    setErro("");
    if (!categoria.trim()) {
      setErro("Informe a Categoria de Compra.");
      return false;
    }
    if (!localEstoque.trim()) {
      setErro("Informe o Local de Estoque.");
      return false;
    }
    return true;
  };

  const acao = async (tipo) => {
    if (!validar()) return;
    setAcaoEmCurso(tipo);
    try {
      await onConfirm({
        tipo,
        categoria: categoria.trim(),
        localEstoque: localEstoque.trim(),
      });
    } catch (e) {
      setErro(e.message || "Erro ao processar");
    } finally {
      setAcaoEmCurso(null);
    }
  };

  const ocupado = loading || !!acaoEmCurso;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-torg-blue" />
            Gerar Pedidos Omie
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={ocupado}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            <strong>1 pedido por fornecedor vencedor.</strong> Você pode baixar como
            planilha (.xlsx pra importar manualmente) ou enviar direto via API do Omie.
          </p>

          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-500 mb-2">Serão criados {grupos.length} pedido(s):</p>
            <ul className="space-y-1">
              {grupos.map((g) => (
                <li key={g.fornecedor} className="flex justify-between text-gray-700">
                  <span>{g.fornecedor}</span>
                  <span className="text-gray-500">
                    {g.itens.length} item{g.itens.length !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoria de Compra <span className="text-red-500">*</span>
            </label>
            {categoriasOpcoes.length > 0 ? (
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent bg-white"
                disabled={ocupado}
              >
                <option value="">— Selecionar —</option>
                {categoriasOpcoes.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} — {c.descricao}
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  placeholder={carregandoOpcoes ? "Carregando categorias..." : "Ex: 3.1 ou 2.01.02"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
                  disabled={ocupado || carregandoOpcoes}
                />
                {carregandoOpcoes && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Buscando categorias do Omie...
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Local de Estoque <span className="text-red-500">*</span>
            </label>
            {locaisOpcoes.length > 0 ? (
              <select
                value={localEstoque}
                onChange={(e) => setLocalEstoque(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent bg-white"
                disabled={ocupado}
              >
                <option value="">— Selecionar —</option>
                {locaisOpcoes.map((l) => (
                  <option
                    key={l.nCodLocal || l.cCodLocal || l.cDescricao}
                    value={l.cCodLocal || l.cDescricao}
                  >
                    {l.cDescricao}
                    {l.cCodLocal ? ` (${l.cCodLocal})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <input
                  type="text"
                  value={localEstoque}
                  onChange={(e) => setLocalEstoque(e.target.value)}
                  placeholder={carregandoOpcoes ? "Carregando locais do Omie..." : "Código ou descrição"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
                  disabled={ocupado || carregandoOpcoes}
                />
              </div>
            )}
          </div>

          <div className="bg-torg-blue-50 border border-torg-blue-200 rounded-lg p-3 text-xs text-torg-dark space-y-1">
            <p>
              <strong>Conta Corrente:</strong> Inter
              <span className="mx-2">·</span>
              <strong>Previsão de Entrega:</strong> hoje
              <span className="mx-2">·</span>
              <strong>Parcelas:</strong> do cadastro do fornecedor
            </p>
            <p className="text-torg-blue-700/80">
              ℹ️ <strong>Local de estoque</strong>: a API do Omie usa o local default da conta no pedido. Sua escolha aqui vai pra observação interna do pedido — você ajusta no Omie se precisar.
            </p>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}
          {erroOpcoes && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>Não consegui listar opções do Omie ({erroOpcoes}). Você pode preencher manualmente.</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
            disabled={ocupado}
          >
            Cancelar
          </button>
          <button
            onClick={() => acao("xlsx")}
            className="px-5 py-2 bg-white border-2 border-torg-blue text-torg-blue rounded-lg hover:bg-torg-blue-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            disabled={ocupado}
            title="Gera arquivos .xlsx no layout do Omie pra você importar manualmente"
          >
            {acaoEmCurso === "xlsx" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {acaoEmCurso === "xlsx" ? "Gerando..." : "Baixar planilhas"}
          </button>
          <button
            onClick={() => acao("api")}
            className="px-5 py-2 bg-torg-orange text-white rounded-lg hover:bg-torg-orange-600 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            disabled={ocupado}
            title="Cria os pedidos automaticamente no Omie via API (recomendado)"
          >
            {acaoEmCurso === "api" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {acaoEmCurso === "api" ? "Enviando..." : "Criar via API Omie"}
          </button>
        </div>
      </div>
    </div>
  );
}
