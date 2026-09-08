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

  const campo = "w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-torg-blue focus:ring-1 focus:ring-torg-blue";
  const rotulo = "mb-1.5 block text-xs font-semibold text-torg-dark";
  const sel = ops.find(o => o.numero === opSelecionada);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="novo-cronograma-titulo" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h3 id="novo-cronograma-titulo" className="flex items-center gap-2 text-lg font-semibold text-torg-dark"><GanttChart size={19} className="text-torg-blue"/> Novo cronograma</h3>
            <p className="mt-1 text-sm text-torg-gray">Defina a obra, o período e a estrutura inicial.</p>
          </div>
          <button aria-label="Fechar criação de cronograma" disabled={saving} onClick={onClose} className="rounded-lg p-1 text-torg-gray hover:bg-slate-100 disabled:opacity-50"><X size={19}/></button>
        </div>

        <fieldset disabled={saving} className="min-w-0 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-4" aria-labelledby="novo-identificacao">
            <h4 id="novo-identificacao" className="text-sm font-semibold text-torg-dark">Identificação da obra</h4>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-3">
              <div>
                <label htmlFor="nova-op" className={rotulo}>Ordem de produção *</label>
                {loadingOps ? <div className="flex items-center gap-2 py-2.5 text-sm text-torg-gray"><Loader2 size={14} className="animate-spin"/> Carregando OPs…</div> : ops.length > 0 ? <select id="nova-op" value={opSelecionada} onChange={e => handleSelectOP(e.target.value)} className={campo}>
                  <option value="">Selecione uma OP</option>
                  {ops.map(op => <option key={op.id} value={op.numero}>{op.numero} — {op.cliente} {op.obra ? `(${op.obra})` : ""}{op.cronogramasExistentes > 0 ? ` · ${op.cronogramasExistentes} cronograma(s)` : ""}</option>)}
                </select> : <input id="nova-op" value={opManual} onChange={e => setOpManual(e.target.value)} placeholder="Ex.: T001" className={campo}/>}
              </div>
              {!!ops.length && <div>
                <label htmlFor="nova-op-manual" className={rotulo}>Ou informe a OP</label>
                <input id="nova-op-manual" value={opManual} onChange={e => {setOpManual(e.target.value);setOpSelecionada("");}} placeholder="Ex.: T001" className={campo}/>
              </div>}
            </div>
            {sel?.cronogramasExistentes > 0 && <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>Esta OP já tem {sel.cronogramasExistentes} cronograma(s). Use um título que diferencie a frente ou a nova solicitação.</p>}
            <div>
              <label htmlFor="nova-obra" className={rotulo}>Título / nome da obra *</label>
              <input id="nova-obra" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Galpão industrial — estrutura principal" className={campo}/>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5" aria-labelledby="novo-periodo">
            <div className="flex items-baseline justify-between gap-3"><h4 id="novo-periodo" className="text-sm font-semibold text-torg-dark">Período previsto</h4><span className="text-xs text-torg-gray">Opcional</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label htmlFor="novo-inicio" className={rotulo}>Início</label><input id="novo-inicio" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={campo}/></div>
              <div><label htmlFor="novo-fim" className={rotulo}>Término previsto</label><input id="novo-fim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={campo}/></div>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5" aria-labelledby="nova-estrutura">
            <h4 id="nova-estrutura" className="text-sm font-semibold text-torg-dark">Estrutura das atividades</h4>
            <div>
              <label htmlFor="novas-areas" className={rotulo}>Áreas da obra <span className="font-normal text-torg-gray">(opcional)</span></label>
              <input id="novas-areas" value={areasTexto} onChange={e => setAreasTexto(e.target.value)} placeholder="Ex.: Galpão 1, Mezanino, Cobertura" className={campo}/>
              <p className="mt-1.5 text-xs leading-relaxed text-torg-gray">Separe por vírgula. As áreas ficam disponíveis para organizar as tarefas de todos os setores.</p>
            </div>
            <div className={`rounded-lg border p-4 ${usarTemplate ? "border-torg-blue/30 bg-torg-blue-50/40" : "border-gray-200 bg-slate-50/60"}`}>
              <label htmlFor="usar-template" className="flex cursor-pointer items-start gap-3">
                <input id="usar-template" type="checkbox" checked={usarTemplate} onChange={e => setUsarTemplate(e.target.checked)} className="mt-1 accent-torg-blue"/>
                <span><span className="text-sm font-semibold text-torg-dark">Começar com o modelo padrão Torg</span><span className="mt-1 block text-xs leading-relaxed text-torg-gray">Cria as atividades por área, com a sequência já vinculada. Você poderá editar tarefas e durações depois.</span></span>
              </label>
              <details className="ml-6 mt-2 text-xs text-torg-gray"><summary className="cursor-pointer text-torg-blue">Ver atividades do modelo</summary><p className="mt-2 leading-relaxed">Ordem de compra · Modelo · Detalhamento · Diagrama de montagem · Aprovação · Preparação · Montagem · Solda · Pintura · Expedição.</p><p className="mt-2 leading-relaxed">Depois de criar, informe o início e use “Gerar datas” para programar a sequência.</p></details>
            </div>
          </section>
          {erro && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"><AlertCircle size={15}/>{erro}</div>}
        </fieldset>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-slate-50/60 px-6 py-4">
          <button disabled={saving} onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-torg-gray hover:bg-slate-50">Cancelar</button>
          <button onClick={criar} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-torg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-torg-dark disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin"/> : <Plus size={15}/>} {saving ? "Criando…" : "Criar cronograma"}</button>
        </div>
      </div>
    </div>
  );
}
