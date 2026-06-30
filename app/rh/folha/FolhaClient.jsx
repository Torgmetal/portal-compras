"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wallet, Loader2, AlertCircle, RefreshCw, Inbox, Play, Save, Download,
  Lock, LockOpen, Table2, PieChart,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { calcDerivados, resumo as calcResumo } from "@/lib/folha-calc";

const fmt = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const extenso = (c) => {
  if (!c) return "";
  const [a, m] = c.split("-");
  const N = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${N[Number(m)] || m}/${a}`;
};

// Colunas digitáveis (CLT e PJ). PJ desabilita os campos de imposto.
const EDIT = [
  { k: "salarioBase", label: "Salário" },
  { k: "horasExtras", label: "H. Extras" },
  { k: "adicionais", label: "Adicionais" },
  { k: "inss", label: "INSS", clt: true },
  { k: "irrf", label: "IRRF", clt: true },
  { k: "descontos", label: "Descontos" },
  { k: "liquido", label: "Líquido" },
  { k: "vr", label: "VR" },
  { k: "ifood", label: "iFOOD" },
  { k: "kr", label: "KR" },
];

export default function FolhaClient() {
  const { showToast } = useStore();
  const [competencia, setCompetencia] = useState(mesAtual());
  const [competencias, setCompetencias] = useState([]);
  const [folha, setFolha] = useState(null);
  const [itens, setItens] = useState([]);
  const [dirty, setDirty] = useState(new Set());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [aba, setAba] = useState("folha");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(""); setDirty(new Set());
    try {
      const r = await fetch(`/api/rh/folha?competencia=${competencia}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setCompetencias(d.competencias || []);
      setFolha(d.folha || null);
      setItens(d.folha?.itens || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const iniciar = async () => {
    setIniciando(true);
    try {
      const r = await fetch("/api/rh/folha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competencia }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao iniciar");
      showToast(d.jaExiste ? "Folha já existia" : `Folha iniciada com ${d.itens} funcionários`, "success");
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setIniciando(false);
    }
  };

  const editar = (id, campo, valor) => {
    const v = valor === "" ? 0 : Number(valor);
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, [campo]: v } : it)));
    setDirty((prev) => new Set(prev).add(id));
  };

  const salvar = async () => {
    if (dirty.size === 0) return;
    setSalvando(true);
    try {
      const payload = itens.filter((it) => dirty.has(it.id)).map((it) => ({
        id: it.id, salarioBase: it.salarioBase, horasExtras: it.horasExtras, adicionais: it.adicionais,
        descontos: it.descontos, inss: it.inss, irrf: it.irrf, liquido: it.liquido, vr: it.vr, ifood: it.ifood, kr: it.kr, rescisao: it.rescisao,
      }));
      const r = await fetch(`/api/rh/folha/${folha.id}/itens`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: payload }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setDirty(new Set());
      showToast(`${payload.length} linhas salvas`, "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const mudarStatus = async (status) => {
    if (status === "FECHADA" && dirty.size > 0) { showToast("Salve as alterações antes de fechar", "error"); return; }
    try {
      const r = await fetch(`/api/rh/folha/${folha.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      setFolha((f) => ({ ...f, status }));
      showToast(status === "FECHADA" ? "Competência fechada" : "Competência reaberta", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const fechada = folha?.status === "FECHADA";
  const resumo = useMemo(() => calcResumo(itens), [itens]);

  return (
    <div className="space-y-6 max-w-[1600px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Wallet className="text-torg-blue" /> Folha de Pagamento
          </h2>
          <p className="text-sm text-torg-gray mt-1">Preencha a folha por competência. O portal calcula Base INSS, FGTS, INSS Patronal e Base IRRF; o RH digita os demais.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-torg-gray">Competência</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
        </div>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : !folha ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <Inbox size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray mb-1">Nenhuma folha para <strong>{extenso(competencia)}</strong>.</p>
          <p className="text-xs text-torg-gray mb-4">Iniciar cria a folha com todos os funcionários ativos (snapshot do cadastro).</p>
          <button onClick={iniciar} disabled={iniciando}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {iniciando ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Iniciar folha de {extenso(competencia)}
          </button>
          {competencias.length > 0 && (
            <div className="mt-6 text-xs text-torg-gray">
              Histórico: {competencias.map((c) => (
                <button key={c.competencia} onClick={() => setCompetencia(c.competencia)} className="underline hover:text-torg-blue mx-1">{c.competencia}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Barra de ações */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-torg-dark">{extenso(folha.competencia)}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${fechada ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"}`}>{folha.status}</span>
              <span className="text-xs text-torg-gray">{itens.length} funcionários</span>
              {dirty.size > 0 && <span className="text-xs text-amber-600">{dirty.size} não salvos</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => setAba("folha")} className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${aba === "folha" ? "bg-torg-blue text-white" : "text-torg-gray"}`}><Table2 size={13} /> Folha</button>
                <button onClick={() => setAba("resumo")} className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${aba === "resumo" ? "bg-torg-blue text-white" : "text-torg-gray"}`}><PieChart size={13} /> Resumo</button>
              </div>
              <a href={`/api/rh/folha/${folha.id}/export`} className="px-3 py-2 text-xs text-torg-dark border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><Download size={14} /> Exportar</a>
              {fechada ? (
                <button onClick={() => mudarStatus("ABERTA")} className="px-3 py-2 text-xs text-torg-blue border border-torg-blue-200 rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5"><LockOpen size={14} /> Reabrir</button>
              ) : (
                <button onClick={() => mudarStatus("FECHADA")} className="px-3 py-2 text-xs text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><Lock size={14} /> Fechar</button>
              )}
              <button onClick={salvar} disabled={salvando || dirty.size === 0 || fechada}
                className="px-4 py-2 bg-torg-orange text-white text-xs rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
              </button>
            </div>
          </div>

          {aba === "folha" ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Funcionário</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Emp.</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">CC</th>
                      {EDIT.map((c) => <th key={c.k} className="px-2 py-2 text-right font-medium text-gray-500 uppercase">{c.label}</th>)}
                      <th className="px-2 py-2 text-right font-medium text-torg-blue uppercase">Base INSS</th>
                      <th className="px-2 py-2 text-right font-medium text-torg-blue uppercase">INSS Patr.</th>
                      <th className="px-2 py-2 text-right font-medium text-torg-blue uppercase">Base IRRF</th>
                      <th className="px-2 py-2 text-right font-medium text-torg-blue uppercase">FGTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {itens.map((it) => {
                      const d = calcDerivados(it);
                      const pj = it.tipoContrato === "PJ";
                      return (
                        <tr key={it.id} className="hover:bg-gray-50/50">
                          <td className="px-2 py-1 sticky left-0 bg-white">
                            <div className="font-medium text-torg-dark max-w-[180px] truncate" title={it.nome}>{it.nome}</div>
                          </td>
                          <td className="px-2 py-1 text-torg-gray">{it.empresa || "—"}</td>
                          <td className="px-2 py-1 text-torg-gray">{it.centroCusto || "—"}</td>
                          {EDIT.map((c) => (
                            <td key={c.k} className="px-1 py-1 text-right">
                              <input type="number" step="0.01" value={it[c.k] ?? 0}
                                disabled={fechada || (c.clt && pj)}
                                onChange={(e) => editar(it.id, c.k, e.target.value)}
                                className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums focus:ring-1 focus:ring-torg-blue disabled:bg-gray-50 disabled:text-gray-300" />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{pj ? "—" : fmt(d.baseInss)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{pj ? "—" : fmt(d.inssPatronal)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{pj ? "—" : fmt(d.baseIrrf)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-torg-gray">{pj ? "—" : fmt(d.fgts)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50/60">
                  <tr>
                    {["Empresa", "Centro de Custo", "Tipo", "Qtd", "Salário", "Horas Extras", "Adicionais", "Descontos", "Líquido (a pagar)", "FGTS", "INSS Patr."].map((h) => (
                      <th key={h} className={`px-3 py-2 font-medium text-gray-500 uppercase ${["Empresa", "Centro de Custo", "Tipo"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {resumo.grupos.map((g, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-torg-dark">{g.empresa}</td>
                      <td className="px-3 py-2 text-torg-gray">{g.centroCusto}</td>
                      <td className="px-3 py-2 text-torg-gray">{g.tipoContrato}</td>
                      <td className="px-3 py-2 text-right">{g.qtd}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(g.salarioBase)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(g.horasExtras)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(g.adicionais)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(g.descontos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-torg-dark">{fmt(g.liquido)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(g.fgts)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(g.inssPatronal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-torg-blue-50/40 border-t-2 border-torg-blue-100 font-semibold text-torg-dark">
                    <td className="px-3 py-2" colSpan={4}>TOTAL</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.salarioBase)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.horasExtras)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.adicionais)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.descontos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.liquido)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.fgts)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resumo.total.inssPatronal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
