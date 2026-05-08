"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, Plus, Loader2, AlertCircle, X,
  Package, Pencil, Trash2, FileText,
} from "lucide-react";
import { fmtSemana } from "@/lib/semana";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function ProducaoClient({ ops, semanas, semanaAtual, producoes, romaneios }) {
  const router = useRouter();
  const [modalProd, setModalProd] = useState(null);
  const [modalRomaneio, setModalRomaneio] = useState(null);

  // Agrega producao por semana
  const producaoPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) map[s.semana] = { ...s, prevKg: 0, realKg: 0, items: [] };
    for (const p of producoes) {
      const k = p.semana;
      if (!map[k]) continue;
      map[k].prevKg += p.pesoPrevistoKg || 0;
      map[k].realKg += p.pesoRealizadoKg || 0;
      map[k].items.push(p);
    }
    return Object.values(map);
  }, [producoes, semanas]);

  // Agrega ROMANEIOS (peso real expedido) por semana
  const romaneiosPorSemana = useMemo(() => {
    const map = {};
    for (const s of semanas) map[s.semana] = { ...s, kg: 0, valor: 0, items: [] };
    for (const r of romaneios) {
      const dt = new Date(r.data);
      let achou = null;
      for (const s of semanas) {
        if (dt >= new Date(s.dataInicio) && dt <= new Date(s.dataFim)) {
          achou = s.semana; break;
        }
      }
      if (!achou) continue;
      map[achou].kg += r.pesoRealKg || 0;
      map[achou].valor += r.valorTotal || 0;
      map[achou].items.push(r);
    }
    return Object.values(map);
  }, [romaneios, semanas]);

  // KPIs da semana atual
  const kpiSemana = producaoPorSemana.find((s) => s.semana === semanaAtual) || { prevKg: 0, realKg: 0 };
  const romSemana = romaneiosPorSemana.find((s) => s.semana === semanaAtual) || { kg: 0, valor: 0 };
  const aderencia = kpiSemana.prevKg > 0 ? (kpiSemana.realKg / kpiSemana.prevKg) * 100 : 0;
  const aderRomaneio = kpiSemana.prevKg > 0 ? (romSemana.kg / kpiSemana.prevKg) * 100 : 0;

  // KPIs do mes
  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const noMesAtual = (data) => {
    const d = new Date(data);
    return d.getFullYear() === ano && d.getMonth() === mes;
  };
  const kpiMes = useMemo(() => {
    let prevKg = 0, realKg = 0;
    for (const p of producoes) {
      if (noMesAtual(p.dataInicio)) {
        prevKg += p.pesoPrevistoKg || 0;
        realKg += p.pesoRealizadoKg || 0;
      }
    }
    let romKg = 0;
    for (const r of romaneios) {
      if (noMesAtual(r.data)) romKg += r.pesoRealKg || 0;
    }
    return { prevKg, realKg, romKg };
  }, [producoes, romaneios]);

  const maxKg = Math.max(
    ...producaoPorSemana.map((s) => Math.max(s.prevKg, s.realKg)),
    ...romaneiosPorSemana.map((s) => s.kg),
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
            PCP — pesos previstos × realizados, validados pelos Romaneios de expedição.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModalRomaneio("novo")}
            className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange-700 font-medium flex items-center gap-2"
          >
            <FileText size={16} /> + Romaneio
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
          subtitle={`${aderencia.toFixed(1)}% aderência (PCP)`}
          color={aderencia >= 90 ? "bg-torg-blue" : aderencia >= 70 ? "bg-torg-orange" : "bg-red-500"}
          Icon={Activity}
        />
        <KpiCard
          label="Romaneios da semana"
          value={fmtKg(romSemana.kg)}
          subtitle={`${aderRomaneio.toFixed(1)}% do previsto`}
          color={aderRomaneio >= 90 ? "bg-torg-blue" : aderRomaneio >= 70 ? "bg-torg-orange" : "bg-red-500"}
          Icon={FileText}
        />
        <KpiCard
          label="Romaneios do mês"
          value={fmtKg(kpiMes.romKg)}
          subtitle={`Previsto: ${fmtKg(kpiMes.prevKg)}`}
          color="bg-torg-dark"
          Icon={FileText}
        />
      </div>

      {/* Gráfico: peso previsto / realizado / romaneio por semana */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Pesos por semana</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            <span className="inline-block w-3 h-2 bg-torg-blue-700 align-middle mr-1" /> Previsto (PCP)
            <span className="inline-block w-3 h-2 bg-torg-orange align-middle ml-3 mr-1" /> Realizado (PCP)
            <span className="inline-block w-3 h-2 bg-torg-dark align-middle ml-3 mr-1" /> Romaneio (real expedido)
          </p>
        </div>
        <div className="px-6 py-5">
          <div className="space-y-4">
            {producaoPorSemana.map((s) => {
              const rom = romaneiosPorSemana.find((r) => r.semana === s.semana) || { kg: 0 };
              const prevPct = (s.prevKg / maxKg) * 100;
              const realPct = (s.realKg / maxKg) * 100;
              const romPct = (rom.kg / maxKg) * 100;
              const isAtual = s.semana === semanaAtual;
              return (
                <div key={s.semana} className={`grid grid-cols-12 gap-3 items-center ${isAtual ? "bg-torg-blue-50/30 -mx-6 px-6 py-2" : ""}`}>
                  <div className="col-span-3 sm:col-span-2 text-xs">
                    <p className={`font-semibold ${isAtual ? "text-torg-blue" : "text-torg-dark"} font-mono`}>{s.semana}</p>
                    {isAtual && <p className="text-[10px] text-torg-blue">atual</p>}
                  </div>
                  <div className="col-span-9 sm:col-span-10 space-y-1">
                    <Bar pct={prevPct} color="bg-torg-blue-700" label={`Prev: ${fmtKg(s.prevKg)}`} />
                    <Bar pct={realPct} color="bg-torg-orange" label={`Real: ${fmtKg(s.realKg)}`} />
                    <Bar pct={romPct} color="bg-torg-dark" label={`Rom: ${fmtKg(rom.kg)}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabela: Lançamentos PCP */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Lançamentos do PCP</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Pesos previstos vs realizados por OP, inputados pelo PCP. Cada linha pode ser editada.
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
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => setModalProd(p)}
                          className="text-xs text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
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

      {/* Tabela: Romaneios */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Romaneios de expedição</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Cada romaneio = peso REAL produzido/expedido. R$/kg gera receita no Portal Financeiro.
          </p>
        </div>
        {romaneios.length === 0 ? (
          <p className="px-6 py-6 text-sm text-torg-gray text-center">
            Nenhum romaneio ainda. Clique em "+ Romaneio" pra registrar uma expedição.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso real</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">R$/kg</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {romaneios.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-torg-dark text-xs">{r.numero}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{fmtData(r.data)}</td>
                    <td className="px-4 py-2 text-xs font-mono text-torg-blue">{r.op?.numero || "—"}</td>
                    <td className="px-4 py-2 text-torg-dark text-xs max-w-[280px] truncate">{r.descricao || "—"}</td>
                    <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtKg(r.pesoRealKg)}</td>
                    <td className="px-4 py-2 text-right text-torg-gray tabular-nums text-xs">
                      {r.valorPorKg ? fmtMoeda(r.valorPorKg) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-torg-blue font-medium tabular-nums">
                      {r.valorTotal ? fmtMoeda(r.valorTotal) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setModalRomaneio(r)}
                        className="text-xs text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
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

      {modalProd && (
        <ModalProducao ops={ops} semanas={semanas}
          item={modalProd === "novo" ? null : modalProd}
          onClose={() => setModalProd(null)}
          onSaved={() => { setModalProd(null); router.refresh(); }} />
      )}
      {modalRomaneio && (
        <ModalRomaneio ops={ops}
          item={modalRomaneio === "novo" ? null : modalRomaneio}
          onClose={() => setModalRomaneio(null)}
          onSaved={() => { setModalRomaneio(null); router.refresh(); }} />
      )}
    </div>
  );
}

function Bar({ pct, color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-torg-gray w-32 text-right tabular-nums">{label}</span>
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalProducao({ ops, semanas, item, onClose, onSaved }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    semana: item?.semana || semanas[8]?.semana || "",
    pesoPrevistoKg: item?.pesoPrevistoKg ?? 0,
    pesoRealizadoKg: item?.pesoRealizadoKg ?? 0,
    opId: item?.opId || "",
    observacao: item?.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErro("");
    setSalvando(true);
    try {
      const sel = semanas.find((s) => s.semana === form.semana);
      const payload = {
        semana: form.semana,
        dataInicio: sel?.dataInicio,
        dataFim: sel?.dataFim,
        pesoPrevistoKg: Number(form.pesoPrevistoKg) || 0,
        pesoRealizadoKg: Number(form.pesoRealizadoKg) || 0,
        valorPrevisto: 0,
        valorRealizado: 0,
        opId: form.opId || null,
        observacao: form.observacao || null,
      };
      const res = isEdit
        ? await fetch(`/api/producao/semanal/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pesoPrevistoKg: payload.pesoPrevistoKg, pesoRealizadoKg: payload.pesoRealizadoKg,
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
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  const excluir = async () => {
    if (!isEdit || !window.confirm("Excluir lançamento?")) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/producao/semanal/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) { setErro(e.message); setExcluindo(false); }
  };

  const ader = Number(form.pesoPrevistoKg) > 0
    ? (Number(form.pesoRealizadoKg) / Number(form.pesoPrevistoKg)) * 100 : 0;

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
            <select value={form.semana} disabled={isEdit} onChange={(e) => set("semana", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white disabled:bg-gray-50">
              {semanas.map((s) => <option key={s.semana} value={s.semana}>{fmtSemana(s.semana)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">OP (opcional)</label>
            <select value={form.opId} onChange={(e) => set("opId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Sem OP (geral) —</option>
              {ops.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso previsto (kg)</label>
            <input type="number" step="0.01" min="0" value={form.pesoPrevistoKg || ""}
              onChange={(e) => set("pesoPrevistoKg", e.target.value)} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso realizado (kg)</label>
            <input type="number" step="0.01" min="0" value={form.pesoRealizadoKg || ""}
              onChange={(e) => set("pesoRealizadoKg", e.target.value)} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
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

function ModalRomaneio({ ops, item, onClose, onSaved }) {
  const isEdit = !!item;
  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    numero: item?.numero || "",
    data: item?.data ? new Date(item.data).toISOString().slice(0, 10) : hoje,
    opId: item?.opId || "",
    pesoRealKg: item?.pesoRealKg ?? 0,
    valorPorKg: item?.valorPorKg ?? "",
    descricao: item?.descricao || "",
    observacao: item?.observacao || "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const peso = Number(form.pesoRealKg) || 0;
  const vpk = Number(form.valorPorKg) || 0;
  const total = peso * vpk;

  const submit = async () => {
    setErro("");
    if (!form.numero.trim()) return setErro("Informe o número do romaneio.");
    if (!peso || peso <= 0) return setErro("Peso real deve ser maior que zero.");
    setSalvando(true);
    try {
      const payload = {
        numero: form.numero.trim(),
        data: form.data,
        opId: form.opId || null,
        pesoRealKg: peso,
        valorPorKg: vpk || null,
        descricao: form.descricao || null,
        observacao: form.observacao || null,
      };
      const res = isEdit
        ? await fetch(`/api/producao/romaneio/${item.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/producao/romaneio`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  const excluir = async () => {
    if (!isEdit || !window.confirm("Excluir esse romaneio?")) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/producao/romaneio/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) { setErro(e.message); setExcluindo(false); }
  };

  return (
    <Modal titulo={isEdit ? "Editar romaneio" : "Novo romaneio"} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Nº romaneio *</label>
            <input type="text" value={form.numero}
              onChange={(e) => set("numero", e.target.value)}
              placeholder="Ex: R-001/2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data *</label>
            <input type="date" value={form.data}
              onChange={(e) => set("data", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">OP</label>
            <select value={form.opId} onChange={(e) => set("opId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— Sem OP —</option>
              {ops.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Peso real (kg) *</label>
            <input type="number" step="0.01" min="0" value={form.pesoRealKg || ""}
              onChange={(e) => set("pesoRealKg", e.target.value)} placeholder="0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor por kg (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valorPorKg || ""}
              onChange={(e) => set("valorPorKg", e.target.value)} placeholder="R$ 0,00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Total (calculado)</label>
            <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-right font-bold tabular-nums text-torg-blue">
              {fmtMoeda(total)}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Descrição</label>
          <input type="text" value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Ex: Estrutura mezanino — etapa 1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
