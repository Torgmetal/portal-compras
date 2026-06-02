"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign, Plus, Loader2, AlertCircle, X,
  TrendingUp, TrendingDown, Pencil, Trash2, Activity,
  FileText, RefreshCw, Clock, Search,
} from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const CATEGORIAS_FLUXO = [
  { codigo: "FATURAMENTO_MEDICAO", label: "Faturamento de medição",  tipo: "ENTRADA" },
  { codigo: "RECEBIMENTO",         label: "Recebimento de cliente",  tipo: "ENTRADA" },
  { codigo: "OUTRA_RECEITA",       label: "Outra receita",           tipo: "ENTRADA" },
  { codigo: "COMPRA",              label: "Pagamento a fornecedor",  tipo: "SAIDA" },
  { codigo: "SALARIO",             label: "Folha / salários",        tipo: "SAIDA" },
  { codigo: "IMPOSTO",             label: "Imposto",                 tipo: "SAIDA" },
  { codigo: "TRIBUTO",             label: "Tributo",                 tipo: "SAIDA" },
  { codigo: "OUTROS",              label: "Outros",                  tipo: "SAIDA" },
];
const labelCatFluxo = (c) => CATEGORIAS_FLUXO.find((x) => x.codigo === c)?.label || c;

export default function FinanceiroClient({ ops, fluxos, romaneios, semanas, semanaAtual }) {
  const router = useRouter();
  const [modalFluxo, setModalFluxo] = useState(null);

  // Receita gerada por Romaneios (peso real produzido × valorPorKg)
  const receitaPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) map[s.semana] = { ...s, valor: 0, kg: 0 };
    for (const r of romaneios) {
      const dt = new Date(r.data);
      let achou = null;
      for (const s of semanas) {
        if (dt >= new Date(s.dataInicio) && dt <= new Date(s.dataFim)) {
          achou = s.semana; break;
        }
      }
      if (!achou) continue;
      map[achou].valor += r.valorTotal || 0;
      map[achou].kg += r.pesoRealKg || 0;
    }
    return Object.values(map);
  }, [romaneios, semanas]);

  const receitaSemanaAtual = receitaPorSemana.find((s) => s.semana === semanaAtual) || { valor: 0, kg: 0 };

  // Mes atual: receita gerada
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const noMesAtual = (data) => {
    const d = new Date(data);
    return d.getFullYear() === ano && d.getMonth() === mes;
  };
  const receitaMesAtual = useMemo(
    () => romaneios.filter((r) => noMesAtual(r.data)).reduce((s, r) => s + (r.valorTotal || 0), 0),
    [romaneios]
  );
  const kgMesAtual = useMemo(
    () => romaneios.filter((r) => noMesAtual(r.data)).reduce((s, r) => s + (r.pesoRealKg || 0), 0),
    [romaneios]
  );

  // Fluxo de caixa: agrega por semana
  const fluxoPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) {
      map[s.semana] = {
        ...s,
        entradasPrev: 0, entradasReal: 0,
        saidasPrev: 0, saidasReal: 0,
      };
    }
    for (const f of fluxos) {
      const dt = new Date(f.data);
      let achou = null;
      for (const s of semanas) {
        if (dt >= new Date(s.dataInicio) && dt <= new Date(s.dataFim)) {
          achou = s.semana; break;
        }
      }
      if (!achou) continue;
      const isE = f.tipo === "ENTRADA";
      if (f.realizado) {
        if (isE) map[achou].entradasReal += f.valor; else map[achou].saidasReal += f.valor;
      } else {
        if (isE) map[achou].entradasPrev += f.valor; else map[achou].saidasPrev += f.valor;
      }
    }
    return Object.values(map);
  }, [fluxos, semanas]);

  const saldoSemana = useMemo(() => {
    const f = fluxoPorSemana.find((s) => s.semana === semanaAtual);
    if (!f) return 0;
    return (f.entradasPrev + f.entradasReal) - (f.saidasPrev + f.saidasReal);
  }, [fluxoPorSemana, semanaAtual]);

  const saldoMes = useMemo(() => {
    let total = 0;
    for (const f of fluxos) {
      if (noMesAtual(f.data)) total += f.tipo === "ENTRADA" ? f.valor : -f.valor;
    }
    return total;
  }, [fluxos]);

  const maxKg = Math.max(...receitaPorSemana.map((s) => s.kg), 1);
  const maxValor = Math.max(...receitaPorSemana.map((s) => s.valor), 1);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Portal Financeiro</h2>
          <p className="text-sm text-torg-gray mt-1">
            Fluxo de caixa, receita gerada por produção (Romaneios) e validação financeira.
          </p>
        </div>
        <button
          onClick={() => setModalFluxo("novo")}
          className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
        >
          <Plus size={16} /> Lançamento de fluxo
        </button>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Receita gerada (semana)"
          value={fmtMoeda(receitaSemanaAtual.valor)}
          subtitle={fmtKg(receitaSemanaAtual.kg)}
          color="bg-torg-blue"
          Icon={Activity}
        />
        <KpiCard
          label="Receita gerada (mês)"
          value={fmtMoeda(receitaMesAtual)}
          subtitle={fmtKg(kgMesAtual)}
          color="bg-torg-blue-700"
          Icon={Activity}
        />
        <KpiCard
          label="Saldo de caixa (semana)"
          value={fmtMoeda(saldoSemana)}
          subtitle={saldoSemana >= 0 ? "Positivo" : "Negativo"}
          color={saldoSemana >= 0 ? "bg-torg-blue" : "bg-red-500"}
          Icon={saldoSemana >= 0 ? TrendingUp : TrendingDown}
        />
        <KpiCard
          label="Saldo de caixa (mês)"
          value={fmtMoeda(saldoMes)}
          subtitle={saldoMes >= 0 ? "Positivo" : "Negativo"}
          color={saldoMes >= 0 ? "bg-torg-blue" : "bg-red-500"}
          Icon={saldoMes >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Receita gerada por semana (baseada em Romaneios) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Receita gerada por produção</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Calculada a partir dos Romaneios (peso real produzido × R$/kg da OP). Atualiza conforme o PCP emite romaneios.
          </p>
        </div>
        <div className="px-6 py-5">
          <div className="space-y-3">
            {receitaPorSemana.map((s) => {
              const valorPct = (s.valor / maxValor) * 100;
              const isAtual = s.semana === semanaAtual;
              return (
                <div key={s.semana} className={`grid grid-cols-12 gap-3 items-center ${isAtual ? "bg-torg-blue-50/30 -mx-6 px-6 py-2" : ""}`}>
                  <div className="col-span-3 sm:col-span-2 text-xs">
                    <p className={`font-semibold ${isAtual ? "text-torg-blue" : "text-torg-dark"} font-mono`}>
                      {s.semana}
                    </p>
                    {isAtual && <p className="text-[10px] text-torg-blue">atual</p>}
                  </div>
                  <div className="col-span-9 sm:col-span-10">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                        <div
                          className="h-full bg-torg-blue transition-all"
                          style={{ width: `${valorPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-torg-dark w-44 text-right tabular-nums">
                        {fmtMoeda(s.valor)} <span className="text-torg-gray">({fmtKg(s.kg)})</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabela: fluxo de caixa */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Fluxo de caixa</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Entradas e saídas previstas e realizadas. Marque "realizado" quando entrar/sair de fato.
          </p>
        </div>
        {fluxos.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Nenhum lançamento de fluxo. Clique em "+ Lançamento de fluxo" pra começar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Realizado</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...fluxos].sort((a, b) => new Date(a.data) - new Date(b.data)).map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-torg-dark">{fmtData(f.data)}</td>
                    <td className="px-4 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${
                        f.tipo === "ENTRADA"
                          ? "bg-torg-blue-50 text-torg-blue"
                          : "bg-torg-orange-50 text-torg-orange-700"
                      }`}>
                        {f.tipo === "ENTRADA" ? "↗ Entrada" : "↘ Saída"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{labelCatFluxo(f.categoria)}</td>
                    <td className="px-4 py-2 text-torg-dark text-xs max-w-[250px] truncate">{f.descricao}</td>
                    <td className="px-4 py-2 text-xs font-mono text-torg-blue">{f.op?.numero || "—"}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${
                      f.tipo === "ENTRADA" ? "text-torg-blue" : "text-torg-orange-700"
                    }`}>
                      {f.tipo === "ENTRADA" ? "+" : "−"} {fmtMoeda(f.valor)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {f.realizado ? (
                        <span className="text-xs px-2 py-0.5 bg-torg-blue text-white rounded-full font-medium">✓ Sim</span>
                      ) : (
                        <span className="text-xs text-torg-gray">prev.</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => setModalFluxo(f)}
                        className="text-xs text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Faturamento por obra (Omie) — separado, abaixo do Fluxo de Caixa */}
      <PedidosVendaSection />

      {modalFluxo && (
        <ModalFluxo
          ops={ops}
          item={modalFluxo === "novo" ? null : modalFluxo}
          onClose={() => setModalFluxo(null)}
          onSaved={() => { setModalFluxo(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, subtitle, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-torg-gray truncate">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>
        {subtitle && <p className="text-[10px] text-torg-gray truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-torg-dark">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFluxo({ ops, item, onClose, onSaved }) {
  const isEdit = !!item;
  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    data: item?.data ? new Date(item.data).toISOString().slice(0, 10) : hoje,
    tipo: item?.tipo || "ENTRADA",
    categoria: item?.categoria || "FATURAMENTO_MEDICAO",
    descricao: item?.descricao || "",
    valor: item?.valor ?? 0,
    realizado: item?.realizado ?? false,
    dataRealizado: item?.dataRealizado ? new Date(item.dataRealizado).toISOString().slice(0, 10) : "",
    opId: item?.opId || "",
    observacao: item?.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErro("");
    if (!form.descricao.trim()) return setErro("Descrição é obrigatória.");
    if (!Number(form.valor) || Number(form.valor) <= 0) return setErro("Valor deve ser maior que zero.");
    setSalvando(true);
    try {
      const payload = {
        data: form.data,
        tipo: form.tipo,
        categoria: form.categoria,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        realizado: !!form.realizado,
        dataRealizado: form.dataRealizado || null,
        opId: form.opId || null,
        observacao: form.observacao || null,
      };
      const res = isEdit
        ? await fetch(`/api/financeiro/fluxo/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/financeiro/fluxo`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!isEdit || !window.confirm("Excluir este lançamento?")) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/financeiro/fluxo/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setExcluindo(false);
    }
  };

  const cats = CATEGORIAS_FLUXO.filter((c) => c.tipo === form.tipo);

  return (
    <Modal titulo={isEdit ? "Editar fluxo de caixa" : "Novo fluxo de caixa"} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button"
            onClick={() => { set("tipo", "ENTRADA"); set("categoria", "FATURAMENTO_MEDICAO"); }}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
              form.tipo === "ENTRADA" ? "border-torg-blue bg-torg-blue-50 text-torg-blue" : "border-gray-200 text-torg-gray"
            }`}>
            ↗ Entrada
          </button>
          <button type="button"
            onClick={() => { set("tipo", "SAIDA"); set("categoria", "COMPRA"); }}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
              form.tipo === "SAIDA" ? "border-torg-orange bg-torg-orange-50 text-torg-orange-700" : "border-gray-200 text-torg-gray"
            }`}>
            ↘ Saída
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Categoria *</label>
            <select value={form.categoria} onChange={(e) => set("categoria", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              {cats.map((c) => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data prevista *</label>
            <input type="date" value={form.data} onChange={(e) => set("data", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição *</label>
          <input type="text" value={form.descricao} onChange={(e) => set("descricao", e.target.value)}
            placeholder="Ex: Medição 02 — março/2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor (R$) *</label>
            <input type="number" step="0.01" min="0" value={form.valor || ""}
              onChange={(e) => set("valor", e.target.value)}
              placeholder="R$ 0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">OP (opcional)</label>
            <select value={form.opId} onChange={(e) => set("opId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Sem OP —</option>
              {ops.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="realizado" checked={form.realizado}
              onChange={(e) => set("realizado", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300" />
            <label htmlFor="realizado" className="text-sm text-torg-dark">Já realizado / efetivado</label>
          </div>
          {form.realizado && (
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data realizado</label>
              <input type="date" value={form.dataRealizado}
                onChange={(e) => set("dataRealizado", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
          <textarea value={form.observacao} onChange={(e) => set("observacao", e.target.value)}
            rows={2} placeholder="Opcional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between flex-wrap gap-3">
        {isEdit ? (
          <button onClick={excluir} disabled={excluindo || salvando}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir
          </button>
        ) : <span />}
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
          <button onClick={submit} disabled={salvando || excluindo}
            className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Pedidos de Venda por OBRA: faturado vs a faturar (Omie) ────────────────────
function PedidosVendaSection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState("");
  const [busca, setBusca]     = useState("");
  const [soAFaturar, setSoAFaturar] = useState(false);
  const [expandida, setExpandida] = useState(null);

  const carregar = async (forcar = false) => {
    setLoading(true); setErro("");
    try {
      const res = await fetch(`/api/financeiro/pedidos-venda${forcar ? "?forcar=1" : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro");
      setData(d);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { carregar(false); }, []);

  const obras = useMemo(() => {
    if (!data?.obras) return [];
    let base = data.obras;
    if (soAFaturar) base = base.filter((o) => o.aFaturar > 0);
    const t = busca.trim().toLowerCase();
    if (t) base = base.filter((o) => (o.projeto || "").toLowerCase().includes(t));
    return base;
  }, [data, busca, soAFaturar]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2">
            <FileText size={18} className="text-torg-blue" /> Faturamento por obra (Omie)
          </h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Pedidos de venda (medições) por projeto/obra: quanto já foi faturado e quanto falta.
            {data?.atualizadoEm && ` Atualizado ${fmtData(data.atualizadoEm)} ${new Date(data.atualizadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}.`}
          </p>
        </div>
        <button onClick={() => carregar(true)} disabled={loading}
          className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      {data && (
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-4 flex-wrap text-sm">
          <span className="text-torg-gray">Faturado: <strong className="text-green-700">{fmtMoeda(data.totalFaturado)}</strong></span>
          <span className="text-torg-gray">A faturar: <strong className="text-amber-700">{fmtMoeda(data.totalAFaturar)}</strong></span>
          <button onClick={() => setSoAFaturar(v => !v)}
            className={`px-2.5 py-1 rounded-full border text-xs inline-flex items-center gap-1.5 ${soAFaturar ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:opacity-80"}`}>
            Só com a faturar
          </button>
          {data.obrasComAtraso > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1.5">
              <Clock size={12} /> {data.obrasComAtraso} obras com atraso
            </span>
          )}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar obra/projeto…"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
        </div>
      )}

      {erro && (
        <div className="m-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-torg-gray">
          <Loader2 size={20} className="animate-spin" /> <span>Consultando pedidos no Omie… (pode levar ~40s na 1ª vez)</span>
        </div>
      ) : data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra / Projeto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Faturado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">A faturar</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Total</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">% Fat.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {obras.map((o) => (
                <FragmentObra key={o.codProj} obra={o} aberta={expandida === o.codProj}
                  onToggle={() => setExpandida(expandida === o.codProj ? null : o.codProj)} />
              ))}
              {obras.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-torg-gray text-sm">Nenhuma obra encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentObra({ obra, aberta, onToggle }) {
  return (
    <>
      <tr className={`hover:bg-gray-50 cursor-pointer ${obra.atrasado ? "bg-red-50/20" : ""}`} onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`text-gray-400 transition-transform ${aberta ? "rotate-90" : ""}`}>▶</span>
            <span className="text-torg-dark font-medium">{obra.projeto}</span>
            {obra.atrasado && <Clock size={13} className="text-red-500" />}
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-green-700 font-semibold whitespace-nowrap">{fmtMoeda(obra.faturado)}</td>
        <td className={`px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap ${obra.aFaturar > 0 ? "text-amber-700" : "text-gray-400"}`}>{fmtMoeda(obra.aFaturar)}</td>
        <td className="px-4 py-3 text-right tabular-nums text-torg-dark font-bold whitespace-nowrap">{fmtMoeda(obra.total)}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-semibold text-torg-dark">{obra.pctFaturado}%</span>
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${obra.pctFaturado}%` }} />
            </div>
          </div>
        </td>
      </tr>
      {aberta && obra.pedidos.map((ped) => (
        <tr key={ped.numero} className="bg-gray-50/40">
          <td colSpan={5} className="px-4 py-2">
            <div className="pl-6">
              <div className="text-xs font-semibold text-torg-gray mb-1">
                Pedido #{ped.numero} — {ped.parcelas.length} parcela(s) · faturado {fmtMoeda(ped.faturado)} · a faturar {fmtMoeda(ped.aFaturar)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ped.parcelas.map((pc) => {
                  const cor = pc.situacao === "Cancelado" ? "bg-gray-100 text-gray-400 line-through border-gray-200"
                    : pc.situacao === "Faturado" ? "bg-green-50 text-green-700 border-green-200"
                    : pc.atrasado ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-amber-50 text-amber-700 border-amber-200";
                  return (
                    <span key={pc.codigoPedido} className={`text-[11px] px-2 py-0.5 rounded border ${cor}`}
                      title={`Seq ${pc.sequencial} — ${pc.situacao}`}>
                      {ped.numero}/{pc.sequencial} · {fmtMoeda(pc.valor)} · {pc.situacao}
                    </span>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
