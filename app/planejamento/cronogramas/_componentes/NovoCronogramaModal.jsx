"use client";
import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, GanttChart, Loader2, Plus, X } from "lucide-react";

export function NovoCronogramaModal({ onClose, onCreated }) {
  const [ops, setOps] = useState([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [opSelecionada, setOpSelecionada] = useState("");
  const [titulo, setTitulo] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [usarTemplate, setUsarTemplate] = useState(false);
  const [opManual, setOpManual] = useState("");
  const [areasTexto, setAreasTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/planejamento/cronogramas/manual")
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar OPs");
        return r.json();
      })
      .then((d) => setOps(d.ops || []))
      .catch(() => setOps([]))
      .finally(() => setLoadingOps(false));
  }, []);

  const opNum = opSelecionada || opManual.trim().toUpperCase();

  const criar = async () => {
    if (!opNum) return setErro("Selecione ou digite o número da OP");
    if (!titulo.trim()) return setErro("Informe o título / nome da obra");
    setSaving(true);
    setErro("");
    try {
      const body = {
        opNumero: opNum.startsWith("T") ? opNum : `T${opNum}`,
        titulo: titulo.trim(),
        usarTemplate,
      };
      if (dataInicio) body.dataInicio = new Date(dataInicio + "T12:00:00Z").toISOString();
      if (dataFim) body.dataFim = new Date(dataFim + "T12:00:00Z").toISOString();
      const areasLista = areasTexto.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
      if (areasLista.length) body.areas = areasLista;

      const res = await fetch("/api/planejamento/cronogramas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar");
      onCreated(data.cronograma.id);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Auto-preencher título quando seleciona OP
  const handleSelectOP = (val) => {
    setOpSelecionada(val);
    setOpManual("");
    if (val) {
      const op = ops.find((o) => o.numero === val);
      if (op && !titulo) setTitulo(op.obra || op.cliente || "");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GanttChart size={18} className="text-torg-blue" />
            <h3 className="text-sm font-bold text-torg-dark">Novo Cronograma</h3>
          </div>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* OP */}
          <div>
            <label className="text-xs font-medium text-torg-dark mb-1 block">Ordem de Produção *</label>
            {loadingOps ? (
              <div className="flex items-center gap-2 text-xs text-torg-gray py-2">
                <Loader2 size={12} className="animate-spin" /> Carregando OPs...
              </div>
            ) : ops.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={opSelecionada}
                  onChange={(e) => handleSelectOP(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:border-torg-blue focus:ring-1 focus:ring-torg-blue outline-none"
                >
                  <option value="">Selecione uma OP...</option>
                  {ops.map((op) => (
                    <option key={op.id} value={op.numero}>
                      {op.numero} — {op.cliente} {op.obra ? `(${op.obra})` : ""}
                      {op.cronogramasExistentes > 0 ? ` · já tem ${op.cronogramasExistentes} cronograma${op.cronogramasExistentes > 1 ? "s" : ""}` : ""}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-torg-gray">ou digite:</span>
                  <input
                    value={opManual}
                    onChange={(e) => { setOpManual(e.target.value); setOpSelecionada(""); }}
                    placeholder="Ex: T001 ou 001"
                    className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded"
                  />
                </div>
              </div>
            ) : (
              <input
                value={opManual}
                onChange={(e) => setOpManual(e.target.value)}
                placeholder="Número da OP (ex: T001 ou 001)"
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg"
              />
            )}
          </div>

          {(() => {
            const sel = ops.find((o) => o.numero === opSelecionada);
            return sel && sel.cronogramasExistentes > 0 ? (
              <p className="text-[10px] text-amber-600 -mt-2 flex items-start gap-1">
                <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                Esta OP já tem {sel.cronogramasExistentes} cronograma{sel.cronogramasExistentes > 1 ? "s" : ""}. Você vai criar outro — use um título que diferencie (ex.: prédio, frente ou nova solicitação).
              </p>
            ) : null;
          })()}

          {/* Título */}
          <div>
            <label className="text-xs font-medium text-torg-dark mb-1 block">Título / Nome da Obra *</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Galpão Industrial ABC Ltda"
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:border-torg-blue focus:ring-1 focus:ring-torg-blue outline-none"
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-torg-dark mb-1 block">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-torg-dark mb-1 block">Data Fim Prevista</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>

          {/* Áreas da obra */}
          <div>
            <label className="text-xs font-medium text-torg-dark mb-1 block">Áreas da obra <span className="text-gray-400">(opcional)</span></label>
            <input
              type="text"
              value={areasTexto}
              onChange={(e) => setAreasTexto(e.target.value)}
              placeholder="Ex.: A, B, C  ou  Galpão 1, Mezanino…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
            <p className="text-[10px] text-torg-gray mt-1">Separe por vírgula. Cada área ganha uma <b>cor fixa</b> e fica disponível pra classificar as tarefas de <b>qualquer setor</b>.</p>
          </div>

          {/* Template */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
            <input
              type="checkbox"
              checked={usarTemplate}
              onChange={(e) => setUsarTemplate(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
              id="usar-template"
            />
            <label htmlFor="usar-template" className="cursor-pointer">
              <span className="text-xs font-medium text-torg-dark">Usar modelo padrão Torg</span>
              <p className="text-[10px] text-torg-gray mt-0.5">
                Gera, <b>para cada área</b> informada acima, a sequência: Ordem de compra · Modelo · Detalhamento · Diagrama de Montagem · Aprovação · Preparação · Montagem · Solda · Pintura · Expedição — já <b>encadeadas na ordem</b> (é só pôr a data de início e "Gerar datas"). Durações e tarefas são editáveis depois.
              </p>
            </label>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5">
              <AlertCircle size={12} /> {erro}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs text-torg-gray hover:text-torg-dark font-medium">
            Cancelar
          </button>
          <button
            onClick={criar}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {saving ? "Criando..." : "Criar Cronograma"}
          </button>
        </div>
      </div>
    </div>
  );
}
