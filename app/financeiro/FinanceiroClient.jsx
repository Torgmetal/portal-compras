"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign, Plus, Loader2, AlertCircle, X,
  TrendingUp, TrendingDown, Pencil, Trash2, Activity, Download,
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
  const [modalImport, setModalImport] = useState(false);

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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModalImport(true)}
            className="px-4 py-2 bg-white border border-torg-blue text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <Download size={16} /> Importar do Omie
          </button>
          <button
            onClick={() => setModalFluxo("novo")}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Lançamento de fluxo
          </button>
        </div>
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

      {modalFluxo && (
        <ModalFluxo
          ops={ops}
          item={modalFluxo === "novo" ? null : modalFluxo}
          onClose={() => setModalFluxo(null)}
          onSaved={() => { setModalFluxo(null); router.refresh(); }}
        />
      )}

      {modalImport && (
        <ModalImportarOmie
          onClose={() => setModalImport(false)}
          onDone={() => { setModalImport(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ModalImportarOmie({ onClose, onDone }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ini = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [de, setDe] = useState(ini);
  const [ate, setAte] = useState(hoje);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [res, setRes] = useState(null);

  const importar = async () => {
    setLoading(true); setErro(null); setRes(null);
    try {
      const r = await fetch("/api/financeiro/fluxo/importar-omie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de, ate }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar");
      setRes(d);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };

  const t = res?.totais;
  return (
    <Modal titulo="Importar fluxo do Omie (extrato bancário)" onClose={onClose}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-torg-gray">
          Importa o extrato de conta corrente do Omie no período — entradas e saídas,
          realizadas e previstas (transferências entre contas marcadas como "Transferência").
          Reimportar o mesmo período atualiza sem duplicar; lançamentos manuais não são afetados.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-torg-gray">De</span>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="text-torg-gray">Até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>

        {erro && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle size={16} /> {erro}
          </div>
        )}

        {t && (
          <div className="text-sm bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg p-3 space-y-1">
            <p className="font-semibold text-torg-dark">{res.criados} lançamentos importados ({res.contas} contas).</p>
            <p className="text-torg-gray">Entradas: {fmtMoeda(t.entradaRealizada)} realizadas · {fmtMoeda(t.entradaPrevista)} previstas</p>
            <p className="text-torg-gray">Saídas: {fmtMoeda(t.saidaRealizada)} realizadas · {fmtMoeda(t.saidaPrevista)} previstas</p>
            <p className="text-xs text-torg-gray">{t.transferencias} transferências entre contas · {res.apagados} substituídas</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Fechar</button>
          {res ? (
            <button onClick={onDone} className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium">
              Ver no fluxo
            </button>
          ) : (
            <button onClick={importar} disabled={loading}
              className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2 disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {loading ? "Importando..." : "Importar"}
            </button>
          )}
        </div>
      </div>
    </Modal>
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
