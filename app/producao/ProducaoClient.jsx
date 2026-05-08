"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Plus, Loader2, AlertCircle, X, TrendingUp, TrendingDown,
  Calendar, DollarSign, Package, Pencil, Trash2,
} from "lucide-react";
import { fmtSemana } from "@/lib/semana";

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

export default function ProducaoClient({ ops, semanas, semanaAtual, producoes, fluxos, userRole }) {
  const router = useRouter();
  const [modalProd, setModalProd] = useState(null); // null | 'novo' | { ...item }
  const [modalFluxo, setModalFluxo] = useState(null);

  // Agrega producao por semana (todos OPs)
  const producaoPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) map[s.semana] = { ...s, prevKg: 0, realKg: 0, prevR: 0, realR: 0, items: [] };
    for (const p of producoes) {
      const k = p.semana;
      if (!map[k]) continue;
      map[k].prevKg += p.pesoPrevistoKg || 0;
      map[k].realKg += p.pesoRealizadoKg || 0;
      map[k].prevR += p.valorPrevisto || 0;
      map[k].realR += p.valorRealizado || 0;
      map[k].items.push(p);
    }
    return Object.values(map);
  }, [producoes, semanas]);

  // KPIs da semana atual
  const kpiSemana = producaoPorSemana.find((s) => s.semana === semanaAtual) || {
    prevKg: 0, realKg: 0, prevR: 0, realR: 0,
  };
  const aderencia = kpiSemana.prevKg > 0
    ? (kpiSemana.realKg / kpiSemana.prevKg) * 100
    : 0;

  // KPIs do mes atual
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const noMesAtual = (data) => {
    const d = new Date(data);
    return d.getFullYear() === ano && d.getMonth() === mes;
  };
  const kpiMes = useMemo(() => {
    let prevKg = 0, realKg = 0, prevR = 0, realR = 0;
    for (const p of producoes) {
      if (noMesAtual(p.dataInicio)) {
        prevKg += p.pesoPrevistoKg || 0;
        realKg += p.pesoRealizadoKg || 0;
        prevR += p.valorPrevisto || 0;
        realR += p.valorRealizado || 0;
      }
    }
    return { prevKg, realKg, prevR, realR };
  }, [producoes]);

  // Fluxo de caixa: agrega por semana
  const fluxoPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) {
      map[s.semana] = {
        ...s,
        entradasPrev: 0, entradasReal: 0,
        saidasPrev: 0, saidasReal: 0,
        items: [],
      };
    }
    for (const f of fluxos) {
      const dt = new Date(f.data);
      // achar semana
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
      map[achou].items.push(f);
    }
    return Object.values(map);
  }, [fluxos, semanas]);

  // Saldo previsto da semana e mes (entradas - saidas)
  const saldoSemana = useMemo(() => {
    const f = fluxoPorSemana.find((s) => s.semana === semanaAtual);
    if (!f) return 0;
    return (f.entradasPrev + f.entradasReal) - (f.saidasPrev + f.saidasReal);
  }, [fluxoPorSemana, semanaAtual]);

  const saldoMes = useMemo(() => {
    let total = 0;
    for (const f of fluxos) {
      if (noMesAtual(f.data)) {
        total += f.tipo === "ENTRADA" ? f.valor : -f.valor;
      }
    }
    return total;
  }, [fluxos]);

  // Max kg pra escala do grafico
  const maxKg = Math.max(
    ...producaoPorSemana.map((s) => Math.max(s.prevKg, s.realKg)),
    1
  );

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Painel de Produção
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            PCP & Fluxo de Caixa — pesos previstos vs realizados, entradas e saídas estimadas.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModalFluxo("novo")}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <DollarSign size={16} /> + Fluxo de caixa
          </button>
          <button
            onClick={() => setModalProd("novo")}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus size={16} /> Produção semanal
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Peso previsto (semana)"
          value={fmtKg(kpiSemana.prevKg)}
          color="bg-torg-blue-700"
          Icon={Package}
        />
        <KpiCard
          label="Peso realizado (semana)"
          value={fmtKg(kpiSemana.realKg)}
          subtitle={`${aderencia.toFixed(1)}% aderência`}
          color={aderencia >= 90 ? "bg-torg-blue" : aderencia >= 70 ? "bg-torg-orange" : "bg-red-500"}
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

      {/* Gráfico de barras: peso previsto vs realizado por semana */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Pesos previstos × realizados</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Últimas 8 semanas + atual + próximas 4. Barra azul = previsto, laranja = realizado.
          </p>
        </div>
        <div className="px-6 py-5">
          <div className="space-y-3">
            {producaoPorSemana.map((s) => {
              const prevPct = (s.prevKg / maxKg) * 100;
              const realPct = (s.realKg / maxKg) * 100;
              const isAtual = s.semana === semanaAtual;
              return (
                <div key={s.semana} className={`grid grid-cols-12 gap-3 items-center ${isAtual ? "bg-torg-blue-50/30 -mx-6 px-6 py-2" : ""}`}>
                  <div className="col-span-3 sm:col-span-2 text-xs">
                    <p className={`font-semibold ${isAtual ? "text-torg-blue" : "text-torg-dark"} font-mono`}>
                      {s.semana}
                    </p>
                    {isAtual && <p className="text-[10px] text-torg-blue">atual</p>}
                  </div>
                  <div className="col-span-9 sm:col-span-10 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                        <div
                          className="h-full bg-torg-blue-700 transition-all"
                          style={{ width: `${prevPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-torg-gray w-32 text-right tabular-nums">
                        Prev: {fmtKg(s.prevKg)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                        <div
                          className="h-full bg-torg-orange transition-all"
                          style={{ width: `${realPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-torg-gray w-32 text-right tabular-nums">
                        Real: {fmtKg(s.realKg)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabela: entries de produção */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Lançamentos de produção</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Linhas inputadas pelo PCP. Pode ter várias por semana (uma por OP, por exemplo).
          </p>
        </div>
        {producoes.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Nenhum lançamento ainda. Clique em "+ Produção semanal" pra começar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Semana</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prev (kg)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Real (kg)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">% ader.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor prev.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor real.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...producoes].sort((a, b) => (a.semana < b.semana ? 1 : -1)).map((p) => {
                  const ader = p.pesoPrevistoKg > 0 ? (p.pesoRealizadoKg / p.pesoPrevistoKg) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs font-mono text-torg-dark" title={fmtSemana(p.semana)}>{p.semana}</td>
                      <td className="px-4 py-2 text-xs font-mono text-torg-blue">{p.op?.numero || "—"}</td>
                      <td className="px-4 py-2 text-right text-torg-gray tabular-nums">{fmtKg(p.pesoPrevistoKg)}</td>
                      <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtKg(p.pesoRealizadoKg)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"}`}>
                        {ader.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2 text-right text-torg-gray tabular-nums text-xs">{fmtMoeda(p.valorPrevisto)}</td>
                      <td className="px-4 py-2 text-right text-torg-dark tabular-nums text-xs">{fmtMoeda(p.valorRealizado)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setModalProd(p)}
                          className="text-xs text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabela: fluxo de caixa próximas semanas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Fluxo de caixa</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Entradas e saídas previstas. Marque "realizado" quando entrar/sair de fato.
          </p>
        </div>
        {fluxos.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Nenhum lançamento de fluxo. Clique em "+ Fluxo de caixa" pra começar.
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
                        <span className="text-xs px-2 py-0.5 bg-torg-blue text-white rounded-full font-medium">
                          ✓ Sim
                        </span>
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

      {/* Modais */}
      {modalProd && (
        <ModalProducao
          ops={ops}
          semanas={semanas}
          item={modalProd === "novo" ? null : modalProd}
          onClose={() => setModalProd(null)}
          onSaved={() => { setModalProd(null); router.refresh(); }}
        />
      )}
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

function ModalProducao({ ops, semanas, item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    semana: item?.semana || semanas[8]?.semana || "", // default = semana atual
    pesoPrevistoKg: item?.pesoPrevistoKg ?? 0,
    pesoRealizadoKg: item?.pesoRealizadoKg ?? 0,
    valorPrevisto: item?.valorPrevisto ?? 0,
    valorRealizado: item?.valorRealizado ?? 0,
    opId: item?.opId || "",
    observacao: item?.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErro("");
    if (!form.semana) return setErro("Escolha a semana.");
    setSalvando(true);
    try {
      const sel = semanas.find((s) => s.semana === form.semana);
      const payload = {
        semana: form.semana,
        dataInicio: sel?.dataInicio,
        dataFim: sel?.dataFim,
        pesoPrevistoKg: Number(form.pesoPrevistoKg) || 0,
        pesoRealizadoKg: Number(form.pesoRealizadoKg) || 0,
        valorPrevisto: Number(form.valorPrevisto) || 0,
        valorRealizado: Number(form.valorRealizado) || 0,
        opId: form.opId || null,
        observacao: form.observacao || null,
      };
      const res = isEdit
        ? await fetch(`/api/producao/semanal/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pesoPrevistoKg: payload.pesoPrevistoKg, pesoRealizadoKg: payload.pesoRealizadoKg,
              valorPrevisto: payload.valorPrevisto, valorRealizado: payload.valorRealizado,
              opId: payload.opId, observacao: payload.observacao,
            }),
          })
        : await fetch(`/api/producao/semanal`, {
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
      const res = await fetch(`/api/producao/semanal/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setExcluindo(false);
    }
  };

  const ader = Number(form.pesoPrevistoKg) > 0
    ? (Number(form.pesoRealizadoKg) / Number(form.pesoPrevistoKg)) * 100
    : 0;

  return (
    <Modal titulo={isEdit ? "Editar produção semanal" : "Nova produção semanal"} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Semana *</label>
            <select
              value={form.semana} disabled={isEdit}
              onChange={(e) => set("semana", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-torg-blue bg-white disabled:bg-gray-50"
            >
              {semanas.map((s) => (
                <option key={s.semana} value={s.semana}>{fmtSemana(s.semana)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">OP (opcional)</label>
            <select
              value={form.opId}
              onChange={(e) => set("opId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              <option value="">— Sem OP (geral) —</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso previsto (kg)</label>
            <input
              type="number" step="0.01" min="0" value={form.pesoPrevistoKg || ""}
              onChange={(e) => set("pesoPrevistoKg", e.target.value)}
              placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso realizado (kg)</label>
            <input
              type="number" step="0.01" min="0" value={form.pesoRealizadoKg || ""}
              onChange={(e) => set("pesoRealizadoKg", e.target.value)}
              placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        {Number(form.pesoPrevistoKg) > 0 && (
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3 text-sm flex items-center justify-between">
            <span className="text-torg-gray">Aderência:</span>
            <span className={`font-bold tabular-nums ${ader >= 90 ? "text-torg-blue" : ader >= 70 ? "text-torg-orange-700" : "text-red-600"}`}>
              {ader.toFixed(1)}%
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor previsto (R$)</label>
            <input
              type="number" step="0.01" min="0" value={form.valorPrevisto || ""}
              onChange={(e) => set("valorPrevisto", e.target.value)}
              placeholder="R$ 0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor realizado (R$)</label>
            <input
              type="number" step="0.01" min="0" value={form.valorRealizado || ""}
              onChange={(e) => set("valorRealizado", e.target.value)}
              placeholder="R$ 0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
          <textarea
            value={form.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            rows={2}
            placeholder="Opcional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between flex-wrap gap-3">
        {isEdit ? (
          <button onClick={excluir} disabled={excluindo || salvando}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir
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
        ? await fetch(`/api/producao/fluxo/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/producao/fluxo`, {
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
      const res = await fetch(`/api/producao/fluxo/${item.id}`, { method: "DELETE" });
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
          <button
            type="button"
            onClick={() => { set("tipo", "ENTRADA"); set("categoria", "FATURAMENTO_MEDICAO"); }}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
              form.tipo === "ENTRADA"
                ? "border-torg-blue bg-torg-blue-50 text-torg-blue"
                : "border-gray-200 text-torg-gray hover:border-torg-blue-200"
            }`}
          >
            ↗ Entrada
          </button>
          <button
            type="button"
            onClick={() => { set("tipo", "SAIDA"); set("categoria", "COMPRA"); }}
            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium ${
              form.tipo === "SAIDA"
                ? "border-torg-orange bg-torg-orange-50 text-torg-orange-700"
                : "border-gray-200 text-torg-gray hover:border-torg-orange-200"
            }`}
          >
            ↘ Saída
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Categoria *</label>
            <select
              value={form.categoria}
              onChange={(e) => set("categoria", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              {cats.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data prevista *</label>
            <input
              type="date" value={form.data}
              onChange={(e) => set("data", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição *</label>
          <input
            type="text" value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Ex: Medição 02 — março/2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor (R$) *</label>
            <input
              type="number" step="0.01" min="0" value={form.valor || ""}
              onChange={(e) => set("valor", e.target.value)}
              placeholder="R$ 0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">OP (opcional)</label>
            <select
              value={form.opId}
              onChange={(e) => set("opId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue bg-white"
            >
              <option value="">— Sem OP —</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="flex items-center gap-2">
            <input
              type="checkbox" id="realizado" checked={form.realizado}
              onChange={(e) => set("realizado", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="realizado" className="text-sm text-torg-dark">Já realizado / efetivado</label>
          </div>
          {form.realizado && (
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data realizado</label>
              <input
                type="date" value={form.dataRealizado}
                onChange={(e) => set("dataRealizado", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
          <textarea
            value={form.observacao}
            onChange={(e) => set("observacao", e.target.value)}
            rows={2}
            placeholder="Opcional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between flex-wrap gap-3">
        {isEdit ? (
          <button onClick={excluir} disabled={excluindo || salvando}
            className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir
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
