"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fmtOP } from "@/lib/utils";
import {
  FileText, Plus, Loader2, AlertCircle, X, Pencil, Trash2,
  Truck, Package, Activity,
} from "lucide-react";
import RomaneiosSharepoint from "@/components/RomaneiosSharepoint";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function ExpedicaoClient({ ops, romaneios }) {
  const router = useRouter();
  const [modal, setModal] = useState(null);
  const [filtroOp, setFiltroOp] = useState("");

  const hoje = new Date();
  const ano = hoje.getFullYear(), mes = hoje.getMonth();
  const noMesAtual = (data) => {
    const d = new Date(data);
    return d.getFullYear() === ano && d.getMonth() === mes;
  };
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay() + 1); // segunda-feira
  inicioSemana.setHours(0, 0, 0, 0);

  // KPIs
  const kpiSemana = useMemo(() => {
    const r = romaneios.filter((x) => new Date(x.data) >= inicioSemana);
    return {
      qtd: r.length,
      kg: r.reduce((s, x) => s + (x.pesoRealKg || 0), 0),
      valor: r.reduce((s, x) => s + (x.valorTotal || 0), 0),
    };
  }, [romaneios]);

  const kpiMes = useMemo(() => {
    const r = romaneios.filter((x) => noMesAtual(x.data));
    return {
      qtd: r.length,
      kg: r.reduce((s, x) => s + (x.pesoRealKg || 0), 0),
      valor: r.reduce((s, x) => s + (x.valorTotal || 0), 0),
    };
  }, [romaneios]);

  const romaneiosFiltrados = useMemo(() => {
    if (!filtroOp) return romaneios;
    return romaneios.filter((r) => r.opId === filtroOp);
  }, [romaneios, filtroOp]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            Portal de Expedição
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Romaneios de saída — peso real expedido, fonte de validação pra Produção e Financeiro.
          </p>
        </div>
        <button
          onClick={() => setModal("novo")}
          className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
        >
          <Plus size={16} /> Novo Romaneio
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Romaneios (semana)" value={String(kpiSemana.qtd)} subtitle={fmtKg(kpiSemana.kg)} color="bg-torg-blue" Icon={FileText} />
        <KpiCard label="Peso expedido (semana)" value={fmtKg(kpiSemana.kg)} subtitle={fmtMoeda(kpiSemana.valor)} color="bg-torg-blue-700" Icon={Package} />
        <KpiCard label="Romaneios (mês)" value={String(kpiMes.qtd)} subtitle={fmtKg(kpiMes.kg)} color="bg-torg-orange" Icon={Truck} />
        <KpiCard label="Valor expedido (mês)" value={fmtMoeda(kpiMes.valor)} subtitle={fmtKg(kpiMes.kg)} color="bg-torg-dark" Icon={Activity} />
      </div>

      {/* Filtro */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm text-torg-gray">Filtrar por OP:</label>
        <select
          value={filtroOp}
          onChange={(e) => setFiltroOp(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Todas as OPs</option>
          {ops.map((o) => (
            <option key={o.id} value={o.id}>{o.numero} — {o.cliente}</option>
          ))}
        </select>
        {filtroOp && (
          <button
            onClick={() => setFiltroOp("")}
            className="text-xs text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1"
          >
            <X size={12} /> Limpar
          </button>
        )}
        <span className="text-xs text-torg-gray ml-auto">
          {romaneiosFiltrados.length} romaneio{romaneiosFiltrados.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Romaneios emitidos</h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Cada romaneio = 1 expedição (peso real produzido). R$/kg gera receita no Portal Financeiro.
          </p>
        </div>
        {romaneiosFiltrados.length === 0 ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center">
            Nenhum romaneio {filtroOp ? "pra essa OP" : "ainda"}. Clique em "+ Novo Romaneio" pra registrar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nº</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">OP / Cliente</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso real</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">R$/kg</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {romaneiosFiltrados.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-torg-dark text-xs">{r.numero}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{fmtData(r.data)}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.op ? (
                        <>
                          <span className="font-mono text-torg-blue">{fmtOP(r.op.numero)}</span>
                          <span className="text-torg-gray block text-[10px]">{r.op.cliente}</span>
                        </>
                      ) : <span className="text-torg-gray">—</span>}
                    </td>
                    <td className="px-4 py-2 text-torg-dark text-xs max-w-[260px] truncate">{r.descricao || "—"}</td>
                    <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">{fmtKg(r.pesoRealKg)}</td>
                    <td className="px-4 py-2 text-right text-torg-gray tabular-nums text-xs">{r.valorPorKg ? fmtMoeda(r.valorPorKg) : "—"}</td>
                    <td className="px-4 py-2 text-right text-torg-blue font-medium tabular-nums">{r.valorTotal ? fmtMoeda(r.valorTotal) : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => setModal(r)}
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

      {/* Romaneios do SharePoint (marcas e pesos) */}
      <div>
        <h3 className="text-lg font-semibold text-torg-dark mb-3">Romaneios SharePoint (por OP)</h3>
        <p className="text-xs text-torg-gray mb-4">
          Selecione uma OP para visualizar os romaneios com marcas e pesos detalhados.
        </p>
        <RomaneiosSharepoint ops={ops} />
      </div>

      {modal && (
        <ModalRomaneio ops={ops}
          item={modal === "novo" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); router.refresh(); }} />
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
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
