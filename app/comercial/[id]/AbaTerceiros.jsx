"use client";
// Aba "Terceiros" do painel da OP — histórico do material enviado a terceiros (romaneios RT-##
// desta OP): o que foi, quando, quanto, data de retorno prevista, status e retornos. Lê
// /api/expedicao/terceiros?opId=... (RomaneioTerceiro filtrado pela OP).
import { useState, useEffect } from "react";
import { Truck, Loader2, FileSpreadsheet, AlertCircle, PackageCheck, CalendarClock, ChevronRight, ChevronDown, ExternalLink } from "lucide-react";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const RT = (n) => `RT-${String(n).padStart(3, "0")}`;
const STATUS = {
  ENVIADO: { l: "Em terceiro", c: "bg-indigo-100 text-indigo-800" },
  PARCIAL: { l: "Retorno parcial", c: "bg-amber-100 text-amber-800" },
  RETORNADO: { l: "Retornado", c: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { l: "Cancelado", c: "bg-gray-100 text-gray-500" },
};

function Kpi({ label, value }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide">{label}</p>
      <p className="text-base font-extrabold text-torg-dark tabular-nums">{value}</p>
    </div>
  );
}

export default function AbaTerceiros({ opId }) {
  const [romaneios, setRomaneios] = useState(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(() => new Set());

  useEffect(() => {
    setRomaneios(null); setErro("");
    fetch(`/api/expedicao/terceiros?opId=${opId}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setRomaneios(j.romaneios || []); else setErro(j.error || "Erro"); })
      .catch(() => setErro("Não foi possível carregar."));
  }, [opId]);

  const toggle = (id) => setAberto((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const lista = romaneios || [];
  const pesoEnv = lista.reduce((s, r) => s + (r.pesoEnviadoKg || 0), 0);
  const pesoRet = lista.reduce((s, r) => s + (r.pesoRetornadoKg || 0), 0);
  const emTerceiro = lista.filter((r) => r.status === "ENVIADO" || r.status === "PARCIAL").length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-indigo-600" /> Terceiros</h3>
        <a href="/expedicao/terceiros" className="text-xs text-torg-blue hover:underline">Ver todos em Expedição ›</a>
      </div>
      <p className="text-sm text-torg-gray mb-4">Material enviado a terceiros (galvanização, usinagem, corte…): o que foi, quando, quanto e o retorno. Romaneios RT à parte dos de obra.</p>

      {romaneios === null && !erro ? (
        <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : erro ? (
        <p className="text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>
      ) : lista.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center">
          <Truck size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Nenhum envio a terceiro nesta OP</p>
          <p className="text-xs text-torg-gray mt-1">Envie peças pelo painel de prioridades (selecione as peças → opção "Terceiro").</p>
        </div>
      ) : (<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-4">
          <Kpi label="Romaneios" value={lista.length} />
          <Kpi label="Em terceiro" value={emTerceiro} />
          <Kpi label="Peso enviado" value={fmtKg(pesoEnv)} />
          <Kpi label="Peso retornado" value={fmtKg(pesoRet)} />
        </div>
        <div className="space-y-2">
          {lista.map((r) => {
            const itens = Array.isArray(r.itens) ? r.itens : [];
            const st = STATUS[r.status] || STATUS.ENVIADO;
            const op = aberto.has(r.id);
            const atrasado = r.status !== "RETORNADO" && r.dataPrevRetorno && new Date(r.dataPrevRetorno) < new Date();
            return (
              <div key={r.id} className="border border-gray-100 rounded-lg">
                <button onClick={() => toggle(r.id)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50">
                  {op ? <ChevronDown size={15} className="text-torg-gray shrink-0" /> : <ChevronRight size={15} className="text-torg-gray shrink-0" />}
                  <span className="font-mono font-bold text-torg-dark shrink-0">{RT(r.numero)}</span>
                  <span className="font-semibold text-torg-dark truncate">{r.terceiroNome}</span>
                  {r.servico && <span className="text-[11px] text-torg-gray bg-gray-100 rounded px-1.5 py-0.5 shrink-0">{r.servico}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${st.c}`}>{st.l}</span>
                  <span className="ml-auto text-[12px] text-torg-gray shrink-0 tabular-nums">{fmtN(itens.length)} itens · {fmtKg(r.pesoEnviadoKg)}</span>
                </button>
                <div className="flex items-center gap-4 flex-wrap px-4 pb-2.5 text-[11px] text-torg-gray">
                  <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> Enviado {fmtData(r.dataEnvio || r.createdAt)}</span>
                  {r.dataPrevRetorno && <span className={`inline-flex items-center gap-1 ${atrasado ? "text-red-600 font-semibold" : ""}`}><PackageCheck size={12} /> Retorno previsto {fmtData(r.dataPrevRetorno)}{atrasado ? " · atrasado" : ""}</span>}
                  {r.pesoRetornadoKg > 0 && <span className="text-emerald-700">Retornado: {fmtKg(r.pesoRetornadoKg)}</span>}
                  {r.observacao && <span className="italic truncate max-w-[320px]">{r.observacao}</span>}
                  <a href={`/api/expedicao/terceiros/${r.id}/romaneio`} className="text-torg-blue hover:underline inline-flex items-center gap-1"><FileSpreadsheet size={12} /> Peças</a>
                  {Array.isArray(r.materiais) && r.materiais.length > 0 && <a href={`/api/expedicao/terceiros/${r.id}/material`} className="text-indigo-600 hover:underline inline-flex items-center gap-1"><FileSpreadsheet size={12} /> Material</a>}
                  {r.arquivoUrl && <a href={r.arquivoUrl} target="_blank" rel="noopener noreferrer" className="text-torg-gray hover:underline inline-flex items-center gap-1"><ExternalLink size={12} /> SharePoint</a>}
                </div>
                {op && (
                  <div className="px-4 pb-3 pt-1 border-t border-gray-50 overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[420px]">
                      <thead><tr className="text-[10px] uppercase text-torg-gray"><th className="text-left py-1">Marca</th><th className="text-left py-1">Descrição</th><th className="text-right py-1">Qtd</th><th className="text-right py-1">Peso</th></tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {itens.map((it, i) => (
                          <tr key={i}><td className="py-1 font-mono text-torg-dark whitespace-nowrap">{it.marca}</td><td className="py-1 text-torg-gray truncate max-w-[280px]">{it.descricao || "—"}</td><td className="py-1 text-right tabular-nums">{fmtN(it.qte)}</td><td className="py-1 text-right tabular-nums whitespace-nowrap">{fmtKg(it.pesoTotal || (Number(it.qte) || 0) * (Number(it.pesoUn) || 0))}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {Array.isArray(r.materiais) && r.materiais.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase font-semibold text-indigo-700 mb-1">Material a mandar (barras/chapas — p/ NF de retorno)</p>
                        <table className="w-full text-[12px] min-w-[520px]">
                          <thead><tr className="text-[10px] uppercase text-torg-gray"><th className="text-left py-1">Cód. Omie</th><th className="text-left py-1">Perfil</th><th className="text-left py-1">Descrição / unidade</th><th className="text-right py-1">Qtd</th><th className="text-right py-1">Peso</th></tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {r.materiais.map((m, i) => (
                              <tr key={i}>
                                <td className="py-1 font-mono text-[11px] whitespace-nowrap">{m.codigoOmie || <span className="text-gray-300">—</span>}</td>
                                <td className="py-1 font-mono text-torg-dark whitespace-nowrap">{m.perfil}</td>
                                <td className="py-1 text-torg-gray truncate max-w-[280px]" title={m.descricaoOmie || m.descricao || ""}>{[m.descricaoOmie || m.descricao, m.unidade].filter(Boolean).join(" · ") || "—"}</td>
                                <td className="py-1 text-right tabular-nums font-semibold">{fmtN(m.qtd)}</td>
                                <td className="py-1 text-right tabular-nums whitespace-nowrap">{fmtKg(m.pesoKg)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {Array.isArray(r.retornos) && r.retornos.length > 0 && (
                      <div className="mt-2 text-[11px] text-torg-gray"><b className="text-emerald-700">Retornos:</b> {r.retornos.map((rt, i) => <span key={i} className="mr-2 whitespace-nowrap">{fmtData(rt.data)} · {fmtKg(rt.pesoKg)}</span>)}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );
}
