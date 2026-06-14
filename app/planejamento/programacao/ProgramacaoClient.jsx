"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, Plus, X, Trash2, Filter,
  CalendarRange, ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, CheckCircle2,
} from "lucide-react";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { SETORES_SOLICITACAO, SETOR_LABEL_SOLIC, STATUS_SOLIC } from "@/lib/solicitacao-producao-const";

const fmtDiaCurto = (iso) => (iso ? new Date((typeof iso === "string" && iso.length === 10 ? iso + "T12:00:00Z" : iso)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "—");
const SIT_COR = {
  ATRASADO: "text-red-600 font-bold",
  CONCLUIDO: "text-emerald-600",
  EM_ANDAMENTO: "text-blue-600",
  A_INICIAR: "text-torg-gray",
  SEM_DATA: "text-gray-300",
};

const SETORES = ["PRODUCAO", "PINTURA", "EXPEDICAO"];
const SETOR_LABEL = { PRODUCAO: "Producao", PINTURA: "Pintura", EXPEDICAO: "Expedicao" };
const SETOR_COR = {
  PRODUCAO: "border-l-green-500 bg-green-50/30",
  PINTURA: "border-l-purple-500 bg-purple-50/30",
  EXPEDICAO: "border-l-teal-500 bg-teal-50/30",
};
const PRIORIDADE_COR = {
  ALTA: "bg-red-50 text-red-700",
  MEDIA: "bg-amber-50 text-amber-700",
  BAIXA: "bg-gray-50 text-torg-gray",
};
const STATUS_COR = {
  PENDENTE: "text-gray-500",
  EM_ANDAMENTO: "text-amber-600",
  CONCLUIDO: "text-emerald-600",
};

const fmtKg = (v) => {
  if (!v) return "0 kg";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

function getISOWeek(d = new Date()) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  return {
    semana: 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7),
    ano: date.getFullYear(),
  };
}

export default function ProgramacaoClient() {
  const { semana: semanaInit, ano: anoInit } = getISOWeek();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [semana, setSemana] = useState(semanaInit);
  const [ano, setAno] = useState(anoInit);
  const [modalNovo, setModalNovo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [obrasProd, setObrasProd] = useState([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const [res, resObras] = await Promise.all([
        fetch(`/api/planejamento/programacao?semana=${semana}&ano=${ano}`),
        fetch(`/api/planejamento/obras-producao`),
      ]);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setItens(data.itens);
      if (resObras.ok) setObrasProd((await resObras.json()).obras || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [semana, ano]);

  useEffect(() => { carregar(); }, [carregar]);

  const resumoPorSetor = useMemo(() => {
    const r = {};
    for (const s of SETORES) r[s] = { total: 0, pesoTotal: 0, concluido: 0 };
    for (const i of itens) {
      if (!r[i.setor]) continue;
      r[i.setor].total++;
      r[i.setor].pesoTotal += i.pesoKg || 0;
      if (i.status === "CONCLUIDO") r[i.setor].concluido++;
    }
    return r;
  }, [itens]);

  function mudarSemana(delta) {
    let s = semana + delta;
    let a = ano;
    if (s < 1) { s = 52; a--; }
    if (s > 52) { s = 1; a++; }
    setSemana(s);
    setAno(a);
  }

  async function atualizarStatus(id, status) {
    try {
      const res = await fetch(`/api/planejamento/programacao/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erro");
      const { item } = await res.json();
      setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...item } : i)));
    } catch (e) {
      alert("Erro: " + e.message);
    }
  }

  async function deletar(id) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/planejamento/programacao/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro");
      setItens((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  const isSemanaAtual = semana === semanaInit && ano === anoInit;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Programacao Semanal</h2>
          <p className="text-xs text-torg-gray mt-0.5">Necessidades de producao por setor — definidas na reuniao de PCP</p>
        </div>
        <button onClick={() => setModalNovo(true)}
          className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5">
          <Plus size={14} /> Adicionar Item
        </button>
      </div>

      {/* Navegacao de semana */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between">
        <button onClick={() => mudarSemana(-1)} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
        <div className="text-center">
          <p className="text-sm font-semibold text-torg-dark">Semana {semana} / {ano}</p>
          {!isSemanaAtual && (
            <button onClick={() => { setSemana(semanaInit); setAno(anoInit); }}
              className="text-[10px] text-torg-blue hover:underline">
              Ir para semana atual
            </button>
          )}
        </div>
        <button onClick={() => mudarSemana(1)} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
      </div>

      {/* Obras em produção — acompanhamento (datas por setor × apontamento Syneco) */}
      {obrasProd.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <CalendarDays size={15} className="text-torg-blue" />
            <h3 className="text-sm font-bold text-torg-dark">Obras em produção</h3>
            <span className="text-[11px] text-torg-gray">datas necessárias por setor × apontamento do Syneco</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[860px]">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Obra</th>
                  {SETORES_SOLICITACAO.map((s) => (
                    <th key={s} className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">{SETOR_LABEL_SOLIC[s]}</th>
                  ))}
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Entrega</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obrasProd.map((o) => {
                  const stat = STATUS_SOLIC[o.status] || STATUS_SOLIC.SOLICITADA;
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 ${!o.aderente ? "bg-red-50/30" : ""}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono font-bold text-torg-blue">{fmtOP(o.opNumero)}</span>
                        {o.cliente && <span className="text-torg-gray ml-1.5">{o.cliente}</span>}
                        <span className={`ml-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${stat.cor}`}>{stat.label}</span>
                      </td>
                      {o.setores.map((sc) => (
                        <td key={sc.setor} className="px-2 py-2 text-center">
                          <span className={`tabular-nums ${SIT_COR[sc.situacao] || "text-gray-300"}`}
                            title={`${SETOR_LABEL_SOLIC[sc.setor]}: ${sc.situacao.toLowerCase().replace("_", " ")}${sc.data ? ` · necessária ${fmtDiaCurto(sc.data)}` : ""}`}>
                            {sc.data ? fmtDiaCurto(sc.data) : "—"}
                          </span>
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center tabular-nums text-torg-dark">{fmtDiaCurto(o.dataEntrega)}</td>
                      <td className="px-2 py-2 text-center">
                        {o.aderente ? (
                          <span className="text-[10px] font-semibold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={11} /> no prazo</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-red-600 inline-flex items-center gap-1"><AlertTriangle size={11} /> avaliar datas</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-50 flex items-center gap-4 text-[10px] text-torg-gray flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> atrasado (passou da data sem apontar)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600" /> em andamento</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> concluído</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> a iniciar</span>
          </div>
        </div>
      )}

      {/* Resumo por setor */}
      <div className="grid grid-cols-3 gap-3">
        {SETORES.map((s) => (
          <div key={s} className={`rounded-xl p-3 border-l-4 ${SETOR_COR[s]}`}>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-torg-dark">{SETOR_LABEL[s]}</p>
            <p className="text-lg font-bold text-torg-dark mt-0.5">{fmtKg(resumoPorSetor[s].pesoTotal)}</p>
            <p className="text-[10px] text-torg-gray">{resumoPorSetor[s].total} itens · {resumoPorSetor[s].concluido} concluidos</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-torg-blue" size={24} />
        </div>
      ) : erro ? (
        <div className="text-center py-10">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline mt-2">Tentar novamente</button>
        </div>
      ) : itens.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <CalendarRange size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhum item programado para esta semana.</p>
          <button onClick={() => setModalNovo(true)} className="text-sm text-torg-blue hover:underline mt-2">
            Adicionar primeiro item
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Setor</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descricao</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Prioridade</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Obs</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itens.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${item.status === "CONCLUIDO" ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${SETOR_COR[item.setor]}`}>
                        {SETOR_LABEL[item.setor]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-torg-blue font-semibold">{fmtOP(item.opNumero)}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark">{item.descricao || "—"}</td>
                    <td className="px-3 py-2 text-right text-xs font-medium tabular-nums text-torg-dark">{fmtKg(item.pesoKg)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${PRIORIDADE_COR[item.prioridade]}`}>
                        {item.prioridade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select value={item.status} onChange={(e) => atualizarStatus(item.id, e.target.value)}
                        className={`text-[11px] font-medium border border-gray-200 rounded px-1.5 py-1 bg-white ${STATUS_COR[item.status]}`}>
                        <option value="PENDENTE">Pendente</option>
                        <option value="EM_ANDAMENTO">Em Andamento</option>
                        <option value="CONCLUIDO">Concluido</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-torg-gray max-w-[150px] truncate">{item.observacao || ""}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => setConfirmDelete(item)} className="text-gray-300 hover:text-red-500 p-1">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalNovo && (
        <ModalNovoItem semana={semana} ano={ano} onClose={() => setModalNovo(false)}
          onCriado={(item) => { setItens((prev) => [...prev, item]); setModalNovo(false); }} />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deletar(confirmDelete?.id)}
        titulo="Excluir item?"
        mensagem={`O item da ${fmtOP(confirmDelete?.opNumero)} sera removido da programacao.`}
        labelConfirmar="Excluir"
        variant="destrutivo"
        loading={deleting}
      />
    </div>
  );
}

function ModalNovoItem({ semana, ano, onClose, onCriado }) {
  const [form, setForm] = useState({
    opNumero: "", setor: "PRODUCAO", descricao: "", pesoKg: "",
    prioridade: "MEDIA", observacao: "",
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    if (!form.opNumero.trim()) return setErro("OP obrigatoria");
    setSaving(true);
    setErro("");
    try {
      const res = await fetch("/api/planejamento/programacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          pesoKg: parseFloat(form.pesoKg) || 0,
          semanaIso: semana,
          ano,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onCriado(data.item);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={salvar} className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2">
            <Plus size={16} className="text-torg-blue" /> Novo Item — Semana {semana}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          {erro && <p className="text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded">{erro}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">OP *</label>
              <input type="text" value={form.opNumero} onChange={(e) => setForm({ ...form, opNumero: e.target.value.toUpperCase() })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: 64" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Setor</label>
              <select value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Descricao</label>
            <input type="text" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="Ex: Estrutura mezanino" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Peso (kg)</label>
              <input type="number" step="0.1" value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Prioridade</label>
              <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                <option value="ALTA">Alta</option>
                <option value="MEDIA">Media</option>
                <option value="BAIXA">Baixa</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observacao</label>
            <textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" rows={2} />
          </div>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
