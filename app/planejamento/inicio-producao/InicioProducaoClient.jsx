"use client";
import { useState, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import { SETORES_SOLICITACAO, SETOR_LABEL_SOLIC, STATUS_SOLIC } from "@/lib/solicitacao-producao-const";
import {
  Search, Send, Loader2, CalendarClock, Wand2, CheckCircle2, AlertTriangle, Gauge,
} from "lucide-react";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const hojeIso = () => new Date().toISOString().slice(0, 10);

export default function InicioProducaoClient({ obrasIniciais }) {
  const [obras, setObras] = useState(obrasIniciais);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(null);
  const [toast, setToast] = useState(null);
  const [rascunhos, setRascunhos] = useState(() => {
    const r = {};
    for (const o of obrasIniciais) {
      const s = o.solicitacao;
      r[o.opNumero] = {
        datasSetor: { ...(s?.datasSetor || {}) },
        dataEntrega: s?.dataEntrega ? toInput(s.dataEntrega) : toInput(o.expFim),
        prioridade: s?.prioridade || "MEDIA",
        observacao: s?.observacao || "",
      };
    }
    return r;
  });

  const showToast = (msg, tipo = "sucesso") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4000);
  };

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim();
    if (!q) return obras;
    return obras.filter(
      (o) =>
        o.opNumero.toLowerCase().includes(q) ||
        (o.cliente || "").toLowerCase().includes(q) ||
        (o.titulo || "").toLowerCase().includes(q)
    );
  }, [obras, busca]);

  const enviadas = obras.filter((o) => o.solicitacao).length;

  function setCampo(op, campo, valor) {
    setRascunhos((prev) => ({ ...prev, [op]: { ...prev[op], [campo]: valor } }));
  }
  function setSetorData(op, setor, valor) {
    setRascunhos((prev) => ({
      ...prev,
      [op]: { ...prev[op], datasSetor: { ...prev[op].datasSetor, [setor]: valor || undefined } },
    }));
  }
  function preencherDoCronograma(o) {
    const ds = { ...rascunhos[o.opNumero].datasSetor };
    if (o.fabInicio) ds.CORTE = toInput(o.fabInicio);
    if (o.fabFim) ds.PINTURA = toInput(o.fabFim);
    if (o.expFim || o.fabFim) ds.EXPEDICAO = toInput(o.expFim || o.fabFim);
    setRascunhos((prev) => ({ ...prev, [o.opNumero]: { ...prev[o.opNumero], datasSetor: ds } }));
  }

  async function enviar(o) {
    setSalvando(o.opNumero);
    try {
      const d = rascunhos[o.opNumero];
      const datasSetor = {};
      for (const s of SETORES_SOLICITACAO) if (d.datasSetor[s]) datasSetor[s] = d.datasSetor[s];
      if (Object.keys(datasSetor).length === 0 && !d.dataEntrega) {
        throw new Error("Informe ao menos uma data (setor ou entrega).");
      }
      const res = await fetch("/api/planejamento/solicitacao-producao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opNumero: o.opNumero, opId: o.opId, cronogramaId: o.cronogramaId,
          dataEntrega: d.dataEntrega || null, datasSetor,
          prioridade: d.prioridade, observacao: d.observacao || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      setObras((prev) => prev.map((x) => (x.opNumero === o.opNumero ? { ...x, solicitacao: data.solicitacao } : x)));
      showToast(`Solicitação da ${fmtOP(o.opNumero)} enviada ao PCP e à Produção`);
    } catch (e) {
      showToast(e.message, "erro");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <CalendarClock size={24} className="text-torg-blue" /> Início de Produção
          </h2>
          <p className="text-xs text-torg-gray mt-0.5 max-w-2xl">
            A partir da janela de fabricação do cronograma (necessidade do cliente), defina a data necessária
            de cada setor. Ao enviar, vira uma solicitação que aparece no PMP e no painel da Produção.
          </p>
        </div>
        <span className="text-[11px] text-torg-gray bg-white border border-gray-100 rounded-lg px-3 py-1.5 shadow-sm">
          {enviadas}/{obras.length} obras com solicitação
        </span>
      </div>

      {/* Busca */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2.5 flex items-center gap-2">
        <Search size={14} className="text-torg-gray ml-1" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar OP, cliente ou obra..."
          className="flex-1 px-1 py-1 text-sm border-0 focus:ring-0 focus:outline-none"
        />
      </div>

      {filtradas.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-10 text-sm text-torg-gray">
          Nenhuma obra com a LPC subida ainda. Suba a lista na Programação do PCP para a obra aparecer aqui.
        </div>
      )}

      {/* Cards por obra */}
      {filtradas.map((o) => {
        const d = rascunhos[o.opNumero];
        const st = o.solicitacao ? STATUS_SOLIC[o.solicitacao.status] || STATUS_SOLIC.SOLICITADA : null;
        const salvandoEsta = salvando === o.opNumero;
        return (
          <div key={o.opNumero} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Cabeçalho do card */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-torg-blue">{fmtOP(o.opNumero)}</span>
                  {st && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cor}`}>{st.label}</span>
                  )}
                </div>
                <p className="text-xs text-torg-gray mt-0.5">{o.cliente || o.titulo || "—"}{o.obra ? ` · ${o.obra}` : ""}</p>
              </div>
              {/* Referência do cronograma */}
              <div className="text-[11px] text-torg-gray text-right space-y-0.5">
                <p>Fabricação (cronograma): <span className="font-medium text-torg-dark">{fmtData(o.fabInicio)} → {fmtData(o.fabFim)}</span></p>
                <p>Expedição / entrega: <span className="font-medium text-torg-dark">{fmtData(o.expFim || o.cronoFim)}</span></p>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Validação de prazo */}
              <div className={`rounded-lg border p-3 ${
                o.prazo.cabe === false ? "bg-red-50 border-red-200"
                  : o.prazo.cabe === true ? "bg-emerald-50 border-emerald-200"
                  : "bg-gray-50 border-gray-200"
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] font-semibold text-torg-dark uppercase tracking-wide flex items-center gap-1.5">
                    <Gauge size={13} className="text-torg-blue" /> Validação de prazo
                  </span>
                  {o.prazo.cabe === true && <span className="text-[11px] font-semibold text-emerald-700">✓ cabe na janela do cronograma</span>}
                  {o.prazo.cabe === false && <span className="text-[11px] font-semibold text-red-700">⚠ não cabe — faltam {o.prazo.faltamDias} dias úteis</span>}
                  {o.prazo.cabe == null && <span className="text-[11px] text-torg-gray">sem cronograma para comparar</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
                  <div>
                    <span className="text-torg-gray">Peso ({o.conjuntos} conj.)</span><br />
                    <span className="font-medium text-torg-dark tabular-nums">{Math.round(o.pesoKg).toLocaleString("pt-BR")} kg</span>
                  </div>
                  <div>
                    <span className="text-torg-gray">Esforço {o.prazo.fonteThroughput === "comercial" ? `(${o.hhPorTon} HH/t)` : "(benchmark)"}</span><br />
                    <span className="font-medium text-torg-dark tabular-nums">{o.prazo.throughputDias != null ? `${o.prazo.throughputDias} d` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-torg-gray">Lead-time (fluxo)</span><br />
                    <span className="font-medium text-torg-dark tabular-nums">{o.prazo.leadChain} d</span>
                  </div>
                  <div>
                    <span className="text-torg-gray">Estimado {o.prazo.janelaDiasUteis != null ? "/ janela" : ""}</span><br />
                    <span className="font-medium text-torg-dark tabular-nums">
                      {o.prazo.estimadoDias} d{o.prazo.janelaDiasUteis != null ? ` / ${o.prazo.janelaDiasUteis} d` : ""}
                    </span>
                  </div>
                </div>
                {o.prazo.fonteThroughput === "benchmark" && (
                  <p className="text-[10px] text-torg-gray mt-1.5">
                    Sem HH/ton do comercial nesta obra — esforço estimado pela capacidade real do Syneco; lead-time = medianas medidas por setor (abertura → próximo).
                  </p>
                )}
              </div>

              {/* Datas por setor */}
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-torg-dark uppercase tracking-wide">Data necessária por setor</p>
                <button
                  onClick={() => preencherDoCronograma(o)}
                  className="text-[11px] text-torg-blue hover:underline font-medium flex items-center gap-1"
                  title="Sugere corte no início da fabricação e pintura/expedição no fim"
                >
                  <Wand2 size={12} /> preencher do cronograma
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {SETORES_SOLICITACAO.map((s) => {
                  const val = d.datasSetor[s] || "";
                  const atrasada = val && val < hojeIso();
                  return (
                    <label key={s} className="text-[11px]">
                      <span className="block text-torg-gray mb-0.5">{SETOR_LABEL_SOLIC[s]}</span>
                      <input
                        type="date"
                        value={val}
                        onChange={(e) => setSetorData(o.opNumero, s, e.target.value)}
                        className={`w-full px-1.5 py-1 border rounded-lg tabular-nums ${
                          atrasada ? "border-red-300 text-red-600 bg-red-50" : "border-gray-300"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>

              {/* Entrega + prioridade + observação */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                <label className="text-[11px]">
                  <span className="block text-torg-gray mb-0.5">Entrega ao cliente</span>
                  <input type="date" value={d.dataEntrega} onChange={(e) => setCampo(o.opNumero, "dataEntrega", e.target.value)}
                    className="w-full px-1.5 py-1 border border-gray-300 rounded-lg tabular-nums" />
                </label>
                <label className="text-[11px]">
                  <span className="block text-torg-gray mb-0.5">Prioridade</span>
                  <select value={d.prioridade} onChange={(e) => setCampo(o.opNumero, "prioridade", e.target.value)}
                    className="w-full px-1.5 py-1 border border-gray-300 rounded-lg bg-white">
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Média</option>
                    <option value="BAIXA">Baixa</option>
                  </select>
                </label>
                <label className="text-[11px] sm:col-span-2">
                  <span className="block text-torg-gray mb-0.5">Observação</span>
                  <input type="text" value={d.observacao} onChange={(e) => setCampo(o.opNumero, "observacao", e.target.value)}
                    placeholder="ex.: liberação do cliente pendente"
                    className="w-full px-1.5 py-1 border border-gray-300 rounded-lg" />
                </label>
              </div>

              {/* Ação */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {o.solicitacao && (
                  <span className="text-[11px] text-torg-gray flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" /> já enviada — atualizar reenvia ao PCP/Produção
                  </span>
                )}
                <button
                  onClick={() => enviar(o)}
                  disabled={salvandoEsta}
                  className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {salvandoEsta ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {o.solicitacao ? "Atualizar solicitação" : "Enviar solicitação"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.tipo === "erro" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`}>
          {toast.tipo === "erro" ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
