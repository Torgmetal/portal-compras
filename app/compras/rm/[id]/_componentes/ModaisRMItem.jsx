"use client";
import { useState } from "react";
import { Loader2, AlertCircle, Plus } from "lucide-react";
import { numeroBR } from "@/lib/numero-br";
import { Modal } from "./Modal";

// Modal de edicao dos dados do item da RM. Permite ajustar descricao, qtd,
// peso, unidade, codigo, material, comprimento, largura, tratamento. Bloqueado
// pra itens em PEDIDO_GERADO / CANCELADO.
export function ModalAdicionarItem({ rmId, onClose, onSaved }) {
  const [form, setForm] = useState({ descricao: "", unidade: "", qtd: "", codigoOmie: "", material: "", comprimento: "", largura: "", peso: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // ⚠⚠ `numeroBR(s, NaN)` e não `numeroBR(s)`. O padrão da função é 0, e com ele o `isNaN` abaixo
  // vira código morto: campo em branco ou ilegível passaria como ZERO em vez de null, e peso não
  // informado seria gravado como 0 kg — indistinguível de peso realmente zero. Regressão que a
  // troca do parseFloat introduziu; o parâmetro `padrao` existe exatamente para isto.
  const parseNum = (s) => { const n = numeroBR(s, NaN); return Number.isFinite(n) ? n : null; };

  const submit = async () => {
    setErro("");
    if (!form.descricao.trim()) return setErro("Descrição é obrigatória.");
    if (!form.unidade.trim()) return setErro("Unidade é obrigatória.");
    const qtd = parseNum(form.qtd);
    if (!qtd || qtd <= 0) return setErro("Quantidade tem que ser maior que zero.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao.trim(),
          unidade: form.unidade.trim(),
          qtd,
          codigoOmie: form.codigoOmie.trim() || null,
          material: form.material.trim() || null,
          comprimento: form.comprimento.trim() || null,
          largura: form.largura.trim() || null,
          peso: parseNum(form.peso),
          observacao: form.observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao adicionar item");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue";

  return (
    <Modal titulo="Adicionar item à RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="bg-torg-blue-50/60 border border-torg-blue-100 text-torg-dark text-xs rounded px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-torg-blue" />
          <span>O item entra automaticamente nas <strong>cotações abertas</strong> desta RM (preço 0) pro fornecedor cotar. Depois use <strong>&quot;Reenviar email&quot;</strong> na cotação pra avisar quem já tinha recebido.</span>
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição *</label>
          <input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className={inputCls} placeholder="Ex: CHAPA ACO CARBONO A-36 ESP 6,30MM" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Quantidade *</label>
            <input value={form.qtd} onChange={(e) => set("qtd", e.target.value)} className={`${inputCls} tabular-nums`} placeholder="Ex: 10" inputMode="decimal" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Unidade *</label>
            <input value={form.unidade} onChange={(e) => set("unidade", e.target.value)} className={inputCls} placeholder="KG, PÇ, barra(s), M…" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Código Omie do produto</label>
          <input value={form.codigoOmie} onChange={(e) => set("codigoOmie", e.target.value)} className={`${inputCls} tabular-nums`} placeholder="Código do produto no Omie — necessário pra gerar o pedido" />
          <p className="text-[10px] text-torg-gray mt-1">Sem ele, o pedido não reconhece o produto no Omie e cai na busca por descrição.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Material</label>
            <input value={form.material} onChange={(e) => set("material", e.target.value)} className={inputCls} placeholder="Ex: A36, A572-GR.50 (opcional)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso (kg)</label>
            <input value={form.peso} onChange={(e) => set("peso", e.target.value)} className={`${inputCls} tabular-nums`} placeholder="opcional" inputMode="decimal" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Comprimento</label>
            <input value={form.comprimento} onChange={(e) => set("comprimento", e.target.value)} className={inputCls} placeholder="opcional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Largura</label>
            <input value={form.largura} onChange={(e) => set("largura", e.target.value)} className={inputCls} placeholder="opcional" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
          <input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} placeholder="opcional" />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
        <button onClick={submit} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar item
        </button>
      </div>
    </Modal>
  );
}

export function ModalEditarRMItem({ item, rmId, onClose, onSaved }) {
  const [form, setForm] = useState({
    descricao: item.descricao || "",
    unidade: item.unidade || "",
    qtd: item.qtd != null ? String(item.qtd) : "",
    codigo: item.codigo || "",
    material: item.material || "",
    comprimento: item.comprimento || "",
    largura: item.largura || "",
    tratamento: item.tratamento || "",
    peso: item.peso != null ? String(item.peso) : "",
    pesoLinear: item.pesoLinear != null ? String(item.pesoLinear) : "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const parseNum = (s) => {
    const n = numeroBR(s);
    return isNaN(n) ? null : n;
  };

  const submit = async () => {
    setErro("");
    if (!form.descricao.trim()) return setErro("Descrição é obrigatória.");
    if (!form.unidade.trim()) return setErro("Unidade é obrigatória.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao.trim(),
          unidade: form.unidade.trim(),
          qtd: parseNum(form.qtd) ?? 0,
          codigo: form.codigo.trim() || null,
          codigoOmieEstoque: form.codigo.trim() || null,
          material: form.material.trim() || null,
          comprimento: form.comprimento.trim() || null,
          largura: form.largura.trim() || null,
          tratamento: form.tratamento.trim() || null,
          peso: parseNum(form.peso),
          pesoLinear: parseNum(form.pesoLinear),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Editar item da RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        {(item.status === "PEDIDO_GERADO" || item.status === "CANCELADO" || item.status === "ATENDIDO_ESTOQUE") && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Item em status <strong>{item.status}</strong>. Ajustes aqui são pra
              correção de dados (material, descrição, etc) e <strong>não alteram
              o pedido já criado no Omie</strong>. Se precisar mudar quantidade
              ou preço efetivo, edite direto no Omie.
            </span>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição *</label>
          <input
            type="text" value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Quantidade *</label>
            <input
              type="number" step="0.01" min="0" value={form.qtd}
              onChange={(e) => set("qtd", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Unidade *</label>
            <input
              type="text" value={form.unidade}
              onChange={(e) => set("unidade", e.target.value.toUpperCase())}
              placeholder="UN / KG / M / PÇ"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Código Omie</label>
            <input
              type="text" value={form.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              placeholder="Código do produto no Omie (pra gerar o pedido)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Material</label>
            <input
              type="text" value={form.material}
              onChange={(e) => set("material", e.target.value)}
              placeholder="Ex: NBR 5590"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Tratamento</label>
            <input
              type="text" value={form.tratamento}
              onChange={(e) => set("tratamento", e.target.value)}
              placeholder="Ex: Galvanizado"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Comprimento</label>
            <input
              type="text" value={form.comprimento}
              onChange={(e) => set("comprimento", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Largura</label>
            <input
              type="text" value={form.largura}
              onChange={(e) => set("largura", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso (kg)</label>
            <input
              type="number" step="0.01" min="0" value={form.peso}
              onChange={(e) => set("peso", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso linear (kg/m)</label>
            <input
              type="number" step="0.001" min="0" value={form.pesoLinear}
              onChange={(e) => set("pesoLinear", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </Modal>
  );
}
