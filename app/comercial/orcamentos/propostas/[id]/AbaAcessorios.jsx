"use client";
import { useState, useRef } from "react";
import {
  Plus, Trash2, Loader2, X, Sparkles, Upload, Edit3, Check,
} from "lucide-react";

const CATEGORIAS = [
  { value: "TELHA", label: "Telha" },
  { value: "CALHA", label: "Calha" },
  { value: "RUFO", label: "Rufo" },
  { value: "GRADE_PISO", label: "Grade de Piso" },
  { value: "GALVANIZACAO", label: "Galvanizacao" },
  { value: "STEEL_DECK", label: "Steel Deck" },
  { value: "POLICARBONATO", label: "Policarbonato" },
  { value: "ISOLAMENTO", label: "Isolamento" },
  { value: "OUTRO", label: "Outro" },
];

const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Modal para adicionar item manualmente ──
function NovoAcessorioModal({ onClose, onSalvar }) {
  const [categoria, setCategoria] = useState("OUTRO");
  const [descricao, setDescricao] = useState("");
  const [especificacao, setEspecificacao] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [quantidade, setQuantidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao e obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        categoria,
        descricao: descricao.trim(),
        especificacao: especificacao.trim() || undefined,
        unidade: unidade.trim() || "un",
        quantidade: quantidade ? parseFloat(quantidade) : 0,
        custoUnitario: custoUnitario ? parseFloat(custoUnitario) : undefined,
        observacao: observacao.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Novo Acessorio</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Categoria</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Unidade</label>
              <input
                type="text"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="un, m, m2, kg..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">
              Descricao <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Telha trapezoidal TP40, Calha 333mm..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Especificacao</label>
            <input
              type="text"
              value={especificacao}
              onChange={(e) => setEspecificacao(e.target.value)}
              placeholder="Ex: Esp. 0,50mm, Galvalume, Cor RAL 7016..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Quantidade</label>
              <input
                type="number"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Valor unitario (R$)</label>
              <input
                type="number"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
                placeholder="0,00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Observacao</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
          </div>

          {erro && (
            <p className="text-sm text-red-600">{erro}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || !descricao.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de resultado da IA ──
function ResultadoIAModal({ resultado, onClose, onConfirmar, salvando }) {
  const [selecionados, setSelecionados] = useState(
    new Set(resultado.itens.map((_, i) => i))
  );

  const toggleItem = (idx) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === resultado.itens.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(resultado.itens.map((_, i) => i)));
    }
  };

  const handleConfirmar = () => {
    const itensSel = resultado.itens.filter((_, i) => selecionados.has(i));
    onConfirmar(itensSel);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-torg-dark">Acessorios identificados pela IA</h2>
            <p className="text-sm text-torg-gray mt-0.5">
              {resultado.itens.length} itens encontrados
              {resultado.docsAnalisados?.length > 0 && (
                <span> em {resultado.docsAnalisados.length} documento(s)</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray border-b border-gray-100 whitespace-nowrap">
                <th className="pb-2 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={selecionados.size === resultado.itens.length}
                    onChange={toggleTodos}
                    className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30"
                  />
                </th>
                <th className="pb-2 px-2">Categoria</th>
                <th className="pb-2 px-2">Descricao</th>
                <th className="pb-2 px-2">Especificacao</th>
                <th className="pb-2 px-2">Unid.</th>
                <th className="pb-2 px-2 text-right">Qtd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resultado.itens.map((item, idx) => (
                <tr
                  key={idx}
                  className={`${selecionados.has(idx) ? "bg-torg-blue/5" : ""} hover:bg-gray-50/50 transition-colors`}
                >
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selecionados.has(idx)}
                      onChange={() => toggleItem(idx)}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30"
                    />
                  </td>
                  <td className="py-2 px-2 text-xs">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-torg-dark">
                      {CAT_LABEL[item.categoria] || item.categoria || "Outro"}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                  <td className="py-2 px-2 text-torg-gray">{item.especificacao || "—"}</td>
                  <td className="py-2 px-2 text-torg-gray">{item.unidade || "un"}</td>
                  <td className="py-2 px-2 text-right font-medium">{fmtNum(item.quantidade, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {resultado.observacoes && (
            <p className="text-xs text-torg-gray mt-4 italic">{resultado.observacoes}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <span className="text-sm text-torg-gray">
            <strong className="text-torg-dark">{selecionados.size}</strong> de {resultado.itens.length} selecionados
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={selecionados.size === 0 || salvando}
              className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {salvando ? "Salvando..." : `Adicionar ${selecionados.size} itens`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──
export default function AbaAcessorios({ estudo, estudoId }) {
  const [itens, setItens] = useState(estudo.itensAcessorio || []);
  const [showModal, setShowModal] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [toast, setToast] = useState(null);
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [resultadoIA, setResultadoIA] = useState(null);
  const [salvandoIA, setSalvandoIA] = useState(false);
  const fileRef = useRef(null);
  const [importando, setImportando] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Totais por categoria
  const totaisPorCat = {};
  for (const item of itens) {
    const cat = item.categoria || "OUTRO";
    if (!totaisPorCat[cat]) totaisPorCat[cat] = 0;
    totaisPorCat[cat]++;
  }

  // ── Adicionar item manualmente ──
  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/acessorios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
  };

  // ── Excluir item ──
  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/acessorios?itemId=${itemId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((i) => i.id !== itemId));
      showToast("Item removido");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // ── Editar inline ──
  const startEdit = (item) => {
    setEditandoId(item.id);
    setEditValores({
      categoria: item.categoria || "OUTRO",
      descricao: item.descricao,
      especificacao: item.especificacao || "",
      unidade: item.unidade || "un",
      quantidade: item.quantidade || 0,
      custoUnitario: item.custoUnitario || "",
      observacao: item.observacao || "",
    });
  };

  const cancelEdit = () => {
    setEditandoId(null);
    setEditValores({});
  };

  const saveEdit = async () => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/acessorios`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: editandoId, ...editValores }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((i) => (i.id === editandoId ? json.data : i)));
      setEditandoId(null);
      setEditValores({});
      showToast("Item atualizado");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  // ── IA: analisar documentos ──
  const handleAnalisarIA = async () => {
    setAnalisandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/analisar-acessorios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      if (!json.data.itens?.length) {
        showToast("Nenhum acessorio identificado nos documentos");
        return;
      }

      setResultadoIA(json.data);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setAnalisandoIA(false);
    }
  };

  // ── Confirmar itens da IA ──
  const handleConfirmarIA = async (itensSelecionados) => {
    setSalvandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/acessorios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itensSelecionados),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      setResultadoIA(null);
      showToast(`${itensSelecionados.length} acessorios adicionados`);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setSalvandoIA(false);
    }
  };

  // ── Importar planilha ──
  const handleImportarPlanilha = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/comercial/estudo/${estudoId}/importar-acessorios`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      showToast(`${json.importados} itens importados da planilha`);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const docsDisponiveis = (estudo.documentos || []).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-torg-dark">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
          </h3>
          {Object.keys(totaisPorCat).length > 0 && (
            <span className="text-xs text-torg-gray">
              ({Object.entries(totaisPorCat).map(([cat, n]) => `${CAT_LABEL[cat] || cat}: ${n}`).join(", ")})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Analisar com IA */}
          <button
            onClick={handleAnalisarIA}
            disabled={analisandoIA || docsDisponiveis === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={docsDisponiveis === 0 ? "Nenhum documento disponivel para analise" : "Analisar documentos com IA"}
          >
            {analisandoIA ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {analisandoIA ? "Analisando..." : "Analisar com IA"}
          </button>

          {/* Importar planilha */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importando}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {importando ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            {importando ? "Importando..." : "Importar"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportarPlanilha}
            className="hidden"
          />

          {/* Adicionar manual */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors"
          >
            <Plus size={14} />
            Adicionar
          </button>
        </div>
      </div>

      {/* Tabela */}
      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-torg-gray mb-1">Nenhum acessorio cadastrado</p>
          <p className="text-xs text-gray-400">
            Use &quot;Analisar com IA&quot; para extrair automaticamente dos documentos, importe uma planilha, ou adicione manualmente.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100 whitespace-nowrap">
                <th className="py-2.5 px-2 w-8">#</th>
                <th className="py-2.5 px-2">Categoria</th>
                <th className="py-2.5 px-2">Descricao</th>
                <th className="py-2.5 px-2">Especificacao</th>
                <th className="py-2.5 px-2">Unid.</th>
                <th className="py-2.5 px-2 text-right">Qtd</th>
                <th className="py-2.5 px-2 text-right">Valor Unit.</th>
                <th className="py-2.5 px-2 text-right">Subtotal</th>
                <th className="py-2.5 px-2">Obs.</th>
                <th className="py-2.5 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((item, idx) => {
                const subtotal = (item.custoUnitario || 0) * (item.quantidade || 0);
                return (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  {editandoId === item.id ? (
                    <>
                      <td className="py-1.5 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <select
                          value={editValores.categoria}
                          onChange={(e) => setEditValores((v) => ({ ...v, categoria: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        >
                          {CATEGORIAS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editValores.descricao}
                          onChange={(e) => setEditValores((v) => ({ ...v, descricao: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editValores.especificacao}
                          onChange={(e) => setEditValores((v) => ({ ...v, especificacao: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editValores.unidade}
                          onChange={(e) => setEditValores((v) => ({ ...v, unidade: e.target.value }))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.quantidade}
                          onChange={(e) => setEditValores((v) => ({ ...v, quantidade: parseFloat(e.target.value) || 0 }))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.custoUnitario}
                          onChange={(e) => setEditValores((v) => ({ ...v, custoUnitario: parseFloat(e.target.value) || 0 }))}
                          placeholder="0,00"
                          min="0"
                          step="0.01"
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs text-torg-gray tabular-nums">
                        {(editValores.quantidade && editValores.custoUnitario)
                          ? fmtMoeda(editValores.quantidade * editValores.custoUnitario)
                          : "—"}
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editValores.observacao}
                          onChange={(e) => setEditValores((v) => ({ ...v, observacao: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1">
                          <button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                            <Check size={14} />
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-torg-dark">
                          {CAT_LABEL[item.categoria] || "Outro"}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                      <td className="py-2 px-2 text-torg-gray text-xs">{item.especificacao || "—"}</td>
                      <td className="py-2 px-2 text-torg-gray">{item.unidade || "un"}</td>
                      <td className="py-2 px-2 text-right font-medium">{fmtNum(item.quantidade, item.quantidade % 1 === 0 ? 0 : 2)}</td>
                      <td className="py-2 px-2 text-right text-sm tabular-nums">
                        {item.custoUnitario ? fmtMoeda(item.custoUnitario) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right text-sm font-medium tabular-nums text-torg-dark">
                        {item.custoUnitario && item.quantidade
                          ? fmtMoeda(item.custoUnitario * item.quantidade)
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 px-2 text-xs text-torg-gray truncate max-w-[120px]" title={item.observacao || ""}>
                        {item.observacao || "—"}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleExcluir(item.id)}
                            disabled={excluindoId === item.id}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            {excluindoId === item.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
                );
              })}
              {/* Total */}
              {itens.some((i) => i.custoUnitario > 0) && (
                <tr className="bg-gray-50/60 border-t border-gray-200">
                  <td className="py-2.5 px-2" colSpan={6}></td>
                  <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark uppercase">Total</td>
                  <td className="py-2.5 px-2 text-right text-sm font-bold text-torg-dark tabular-nums">
                    {fmtMoeda(itens.reduce((s, i) => s + (i.custoUnitario || 0) * (i.quantidade || 0), 0))}
                  </td>
                  <td className="py-2.5 px-2" colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}

      {/* Modais */}
      {showModal && (
        <NovoAcessorioModal
          onClose={() => setShowModal(false)}
          onSalvar={handleAdicionarItem}
        />
      )}

      {resultadoIA && (
        <ResultadoIAModal
          resultado={resultadoIA}
          onClose={() => setResultadoIA(null)}
          onConfirmar={handleConfirmarIA}
          salvando={salvandoIA}
        />
      )}
    </div>
  );
}
