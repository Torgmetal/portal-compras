"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Loader2, X, Sparkles, Upload, Edit3, Check, Info,
  Percent, Scale, DollarSign,
} from "lucide-react";

const TIPOS = [
  { value: "PARAFUSO", label: "Parafuso" },
  { value: "PORCA", label: "Porca" },
  { value: "ARRUELA", label: "Arruela" },
  { value: "CHUMBADOR", label: "Chumbador" },
  { value: "BARRA_ROSCADA", label: "Barra Roscada" },
  { value: "CONECTOR", label: "Conector" },
  { value: "INSERTO", label: "Inserto" },
  { value: "OUTRO", label: "Outro" },
];

const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v, dec = 0) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Modal novo item ──
function NovoParafusoModal({ onClose, onSalvar }) {
  const [tipo, setTipo] = useState("PARAFUSO");
  const [descricao, setDescricao] = useState("");
  const [especificacao, setEspecificacao] = useState("");
  const [diametro, setDiametro] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao e obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        tipo,
        descricao: descricao.trim(),
        especificacao: especificacao.trim() || undefined,
        diametro: diametro.trim() || undefined,
        comprimento: comprimento.trim() || undefined,
        unidade: "un",
        quantidade: quantidade ? parseFloat(quantidade) : 0,
        estimativa: false,
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Novo Parafuso</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none">
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Diametro</label>
              <input type="text" value={diametro} onChange={(e) => setDiametro(e.target.value)} placeholder='M16, 5/8", 3/4"...' className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Descricao <span className="text-red-400">*</span></label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Parafuso sextavado M16x50 ASTM A325..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Comprimento</label>
              <input type="text" value={comprimento} onChange={(e) => setComprimento(e.target.value)} placeholder='50mm, 2"...' className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Especificacao</label>
              <input type="text" value={especificacao} onChange={(e) => setEspecificacao(e.target.value)} placeholder="ASTM A325, galvanizado..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Quantidade</label>
              <input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="0" min="0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Observacao</label>
              <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ligacao viga-coluna..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando || !descricao.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal resultado IA ──
function ResultadoIAModal({ resultado, onClose, onConfirmar, salvando }) {
  const [selecionados, setSelecionados] = useState(new Set(resultado.itens.map((_, i) => i)));

  const toggleItem = (idx) => setSelecionados((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  const toggleTodos = () => setSelecionados(selecionados.size === resultado.itens.length ? new Set() : new Set(resultado.itens.map((_, i) => i)));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-torg-dark">Parafusos identificados pela IA</h2>
            <p className="text-sm text-torg-gray mt-0.5">
              {resultado.itens.length} itens — {resultado.itens.filter((i) => i.estimativa).length} estimados
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray border-b border-gray-100 whitespace-nowrap">
                <th className="pb-2 pr-2 w-8">
                  <input type="checkbox" checked={selecionados.size === resultado.itens.length} onChange={toggleTodos} className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30" />
                </th>
                <th className="pb-2 px-2">Tipo</th>
                <th className="pb-2 px-2">Descricao</th>
                <th className="pb-2 px-2">Diam.</th>
                <th className="pb-2 px-2">Comp.</th>
                <th className="pb-2 px-2 text-right">Qtd</th>
                <th className="pb-2 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resultado.itens.map((item, idx) => (
                <tr key={idx} className={`${selecionados.has(idx) ? "bg-torg-blue/5" : ""} hover:bg-gray-50/50 transition-colors`}>
                  <td className="py-2 pr-2"><input type="checkbox" checked={selecionados.has(idx)} onChange={() => toggleItem(idx)} className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue/30" /></td>
                  <td className="py-2 px-2 text-xs"><span className="px-1.5 py-0.5 bg-gray-100 rounded">{TIPO_LABEL[item.tipo] || item.tipo}</span></td>
                  <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                  <td className="py-2 px-2 text-torg-gray">{item.diametro || "—"}</td>
                  <td className="py-2 px-2 text-torg-gray">{item.comprimento || "—"}</td>
                  <td className="py-2 px-2 text-right font-medium">{fmtNum(item.quantidade)}</td>
                  <td className="py-2 px-2">{item.estimativa && <span title="Quantidade estimada"><Info size={13} className="text-amber-500" /></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resultado.observacoes && <p className="text-xs text-torg-gray mt-4 italic">{resultado.observacoes}</p>}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <span className="text-sm text-torg-gray"><strong className="text-torg-dark">{selecionados.size}</strong> de {resultado.itens.length} selecionados</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors">Cancelar</button>
            <button onClick={() => onConfirmar(resultado.itens.filter((_, i) => selecionados.has(i)))} disabled={selecionados.size === 0 || salvando} className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50">
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
export default function AbaParafusos({ estudo, estudoId, onEstudoUpdate }) {
  const [itens, setItens] = useState(estudo.itensParafuso || []);
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

  // Percentual sobre peso
  const [percPeso, setPercPeso] = useState(estudo.percPesoParafusos ?? "");
  const [salvandoPerc, setSalvandoPerc] = useState(false);
  const percTimer = useRef(null);

  // Custo R$/kg de parafusos
  const [custoKg, setCustoKg] = useState(estudo.percParafusos ?? "");
  const [salvandoCusto, setSalvandoCusto] = useState(false);
  const custoTimer = useRef(null);

  const pesoTotal = (estudo.itensPerso || []).reduce((s, i) => s + (i.pesoTotal || 0), 0);
  const percNum = parseFloat(String(percPeso).replace(",", ".")) || 0;
  const pesoParafusosEstimado = pesoTotal > 0 && percNum > 0 ? (pesoTotal * percNum) / 100 : 0;
  const custoKgNum = parseFloat(String(custoKg).replace(",", ".")) || 0;
  const custoParafusosTotal = custoKgNum * pesoTotal;

  // Debounce save do percentual
  const salvarPercentual = useCallback(async (valor) => {
    setSalvandoPerc(true);
    try {
      const numVal = parseFloat(String(valor).replace(",", "."));
      const body = { percPesoParafusos: isNaN(numVal) || numVal <= 0 ? null : numVal };
      await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { /* silencioso */ } finally {
      setSalvandoPerc(false);
    }
  }, [estudoId]);

  // Debounce save do custo R$/kg
  const salvarCustoKg = useCallback(async (valor) => {
    setSalvandoCusto(true);
    try {
      const numVal = parseFloat(String(valor).replace(",", ".")) || 0;
      const body = { percParafusos: numVal };
      const res = await fetch(`/api/comercial/estudo/${estudoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) onEstudoUpdate?.({ percParafusos: numVal });
    } catch { /* silencioso */ } finally {
      setSalvandoCusto(false);
    }
  }, [estudoId, onEstudoUpdate]);

  const handlePercChange = (val) => {
    setPercPeso(val);
    if (percTimer.current) clearTimeout(percTimer.current);
    percTimer.current = setTimeout(() => salvarPercentual(val), 800);
  };

  const handleCustoKgChange = (val) => {
    setCustoKg(val);
    if (custoTimer.current) clearTimeout(custoTimer.current);
    custoTimer.current = setTimeout(() => salvarCustoKg(val), 800);
  };

  useEffect(() => {
    return () => {
      if (percTimer.current) clearTimeout(percTimer.current);
      if (custoTimer.current) clearTimeout(custoTimer.current);
    };
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const totaisPorTipo = {};
  for (const item of itens) { const t = item.tipo || "OUTRO"; if (!totaisPorTipo[t]) totaisPorTipo[t] = 0; totaisPorTipo[t]++; }

  const qtdEstimados = itens.filter((i) => i.estimativa).length;

  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/parafusos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
  };

  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/parafusos?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((i) => i.id !== itemId));
      showToast("Item removido");
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setExcluindoId(null); }
  };

  const startEdit = (item) => {
    setEditandoId(item.id);
    setEditValores({ tipo: item.tipo || "PARAFUSO", descricao: item.descricao, especificacao: item.especificacao || "", diametro: item.diametro || "", comprimento: item.comprimento || "", quantidade: item.quantidade || 0, observacao: item.observacao || "" });
  };

  const saveEdit = async () => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/parafusos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: editandoId, ...editValores }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((i) => (i.id === editandoId ? json.data : i)));
      setEditandoId(null);
      showToast("Item atualizado");
    } catch (e) { showToast(`Erro: ${e.message}`); }
  };

  const handleAnalisarIA = async () => {
    setAnalisandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/analisar-parafusos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (!json.data.itens?.length) { showToast("Nenhum parafuso identificado nos documentos"); return; }
      setResultadoIA(json.data);
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setAnalisandoIA(false); }
  };

  const handleConfirmarIA = async (itensSelecionados) => {
    setSalvandoIA(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/parafusos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(itensSelecionados) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      setResultadoIA(null);
      showToast(`${itensSelecionados.length} parafusos adicionados`);
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setSalvandoIA(false); }
  };

  const handleImportarPlanilha = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/comercial/estudo/${estudoId}/importar-parafusos`, { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      showToast(`${json.importados} itens importados`);
    } catch (e) { showToast(`Erro: ${e.message}`); } finally { setImportando(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const docsDisponiveis = (estudo.documentos || []).length;

  return (
    <div className="space-y-4">
      {/* Card estimativa por porcentagem */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Percent size={18} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-torg-dark">Estimativa por percentual do peso</h4>
            <p className="text-xs text-torg-gray mt-0.5 mb-3">
              Quando nao ha lista detalhada de parafusos, informe um percentual sobre o peso total do projeto para estimar.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-torg-dark whitespace-nowrap">Percentual:</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={percPeso}
                    onChange={(e) => handlePercChange(e.target.value)}
                    placeholder="Ex: 3"
                    className="w-20 px-3 py-1.5 border border-amber-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none bg-white"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-amber-600 pointer-events-none">%</span>
                </div>
                {salvandoPerc && <Loader2 size={14} className="animate-spin text-amber-500" />}
              </div>

              <div className="h-8 w-px bg-amber-200" />

              <div className="flex items-center gap-4 text-xs">
                <span className="text-torg-gray">
                  Peso do projeto: <strong className="text-torg-dark">{fmtNum(pesoTotal, 0)} kg</strong>
                </span>
                {percNum > 0 && pesoTotal > 0 && (
                  <>
                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                      <Scale size={12} />
                      Peso estimado parafusos: {fmtNum(pesoParafusosEstimado, 0)} kg
                    </span>
                  </>
                )}
                {pesoTotal === 0 && (
                  <span className="text-gray-400 italic">Cadastre materiais na aba Materiais para calcular</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card custo R$/kg */}
      <div className="bg-gradient-to-r from-torg-blue/5 to-blue-50 border border-torg-blue/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-torg-blue/10 flex items-center justify-center shrink-0">
            <DollarSign size={18} className="text-torg-blue" />
          </div>
          <div className="flex items-center gap-4 flex-wrap flex-1">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-torg-dark whitespace-nowrap">Custo R$/kg:</label>
              <div className="flex items-center bg-white border border-torg-blue/30 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-torg-blue/20 focus-within:border-torg-blue">
                <span className="px-2 py-1.5 bg-gray-50 text-xs text-torg-gray border-r border-gray-200 select-none">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={custoKg}
                  onChange={(e) => handleCustoKgChange(e.target.value)}
                  placeholder="0,00"
                  className="w-20 px-2 py-1.5 text-sm text-right text-torg-dark outline-none bg-transparent"
                />
                <span className="px-2 py-1.5 bg-gray-50 text-xs text-torg-gray border-l border-gray-200 select-none">/kg</span>
              </div>
              {salvandoCusto && <Loader2 size={14} className="animate-spin text-torg-blue" />}
            </div>

            <div className="h-8 w-px bg-torg-blue/20" />

            <div className="flex items-center gap-4 text-xs">
              {custoKgNum > 0 && pesoTotal > 0 && (
                <span className="text-torg-blue font-semibold">
                  Custo total: {fmtMoeda(custoParafusosTotal)}
                </span>
              )}
              {custoKgNum === 0 && (
                <span className="text-gray-400 italic">Informe o custo por kg para calcular na aba Custos</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-torg-dark">{itens.length} {itens.length === 1 ? "item" : "itens"}</h3>
          {qtdEstimados > 0 && <span className="text-xs text-amber-600">({qtdEstimados} estimados)</span>}
          {Object.keys(totaisPorTipo).length > 1 && (
            <span className="text-xs text-torg-gray">({Object.entries(totaisPorTipo).map(([t, n]) => `${TIPO_LABEL[t]}: ${n}`).join(", ")})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleAnalisarIA} disabled={analisandoIA || docsDisponiveis === 0} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title={docsDisponiveis === 0 ? "Nenhum documento disponivel" : "Analisar/estimar parafusos com IA"}>
            {analisandoIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {analisandoIA ? "Analisando..." : "Analisar com IA"}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importando} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50">
            {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importando ? "Importando..." : "Importar"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportarPlanilha} className="hidden" />
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors">
            <Plus size={14} />Adicionar
          </button>
        </div>
      </div>

      {/* Tabela */}
      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-torg-gray mb-1">Nenhum parafuso cadastrado</p>
          <p className="text-xs text-gray-400">Use o percentual acima para estimar, ou &quot;Analisar com IA&quot; para identificar automaticamente.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100 whitespace-nowrap">
                <th className="py-2.5 px-2 w-8">#</th>
                <th className="py-2.5 px-2">Tipo</th>
                <th className="py-2.5 px-2">Descricao</th>
                <th className="py-2.5 px-2">Diam.</th>
                <th className="py-2.5 px-2">Comp.</th>
                <th className="py-2.5 px-2 text-right">Qtd</th>
                <th className="py-2.5 px-2">Obs.</th>
                <th className="py-2.5 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  {editandoId === item.id ? (
                    <>
                      <td className="py-1.5 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <select value={editValores.tipo} onChange={(e) => setEditValores((v) => ({ ...v, tipo: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none">
                          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.descricao} onChange={(e) => setEditValores((v) => ({ ...v, descricao: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.diametro} onChange={(e) => setEditValores((v) => ({ ...v, diametro: e.target.value }))} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.comprimento} onChange={(e) => setEditValores((v) => ({ ...v, comprimento: e.target.value }))} className="w-16 px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="number" value={editValores.quantidade} onChange={(e) => setEditValores((v) => ({ ...v, quantidade: parseFloat(e.target.value) || 0 }))} className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right outline-none" /></td>
                      <td className="py-1.5 px-2"><input type="text" value={editValores.observacao} onChange={(e) => setEditValores((v) => ({ ...v, observacao: e.target.value }))} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none" /></td>
                      <td className="py-1.5 px-2"><div className="flex items-center gap-1"><button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button><button onClick={() => setEditandoId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button></div></td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-2 px-2"><span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-torg-dark">{TIPO_LABEL[item.tipo] || "Outro"}</span></td>
                      <td className="py-2 px-2 font-medium text-torg-dark">
                        {item.descricao}
                        {item.estimativa && <span className="ml-1.5 text-xs text-amber-500" title="Quantidade estimada">~est.</span>}
                      </td>
                      <td className="py-2 px-2 text-torg-gray text-xs">{item.diametro || "—"}</td>
                      <td className="py-2 px-2 text-torg-gray text-xs">{item.comprimento || "—"}</td>
                      <td className="py-2 px-2 text-right font-medium">{fmtNum(item.quantidade)}</td>
                      <td className="py-2 px-2 text-xs text-torg-gray truncate max-w-[120px]" title={item.observacao || ""}>{item.observacao || "—"}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"><Edit3 size={13} /></button>
                          <button onClick={() => handleExcluir(item.id)} disabled={excluindoId === item.id} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                            {excluindoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
      {showModal && <NovoParafusoModal onClose={() => setShowModal(false)} onSalvar={handleAdicionarItem} />}
      {resultadoIA && <ResultadoIAModal resultado={resultadoIA} onClose={() => setResultadoIA(null)} onConfirmar={handleConfirmarIA} salvando={salvandoIA} />}
    </div>
  );
}
