"use client";
import { useState, useEffect } from "react";
import { CalendarRange, Loader2, RefreshCw, Users } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const n0 = (v) => (v == null ? "—" : (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const pct = (v) => (v == null ? "—" : `${(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const corNota = (n) => (n == null ? "text-gray-300" : n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-500" : "text-red-500");
const bgNota = (n) => (n == null ? "" : n >= 80 ? "bg-emerald-50" : n >= 60 ? "bg-amber-50" : "bg-red-50");
const corTurn = (v) => (v == null ? "text-gray-400" : v <= 3 ? "text-emerald-600" : v <= 6 ? "text-amber-500" : "text-red-500");
const corAbs = (v) => (v == null ? "text-gray-400" : v < 2 ? "text-emerald-600" : v < 4 ? "text-amber-500" : "text-red-500");

export default function MensalRHClient() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setLoading(true); setErro("");
    fetch(`/api/rh/indicadores/mensal?ano=${ano}`).then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar.")).finally(() => setLoading(false));
  }, [ano]);

  const meses = dados?.meses || [];
  const ac = dados?.acumulado;
  const temDado = meses.some((m) => m.admissoes || m.demissoes || m.afastamentos || m.acidentes || m.treinamentos || m.contratacoes);

  const linha = (m, isAc) => (
    <tr key={isAc ? "ac" : m.mes} className={isAc ? "bg-torg-blue-50/60 border-t-2 border-torg-blue-100 font-semibold text-torg-dark" : "hover:bg-gray-50/40"}>
      <td className={`px-3 py-2 ${isAc ? "py-2.5" : "font-medium text-torg-dark"} whitespace-nowrap`}>{isAc ? `Acumulado ${ano}` : MESES[m.mes - 1]}</td>
      <td className="px-3 py-2 text-right text-torg-dark">{n0(m.admissoes)}</td>
      <td className="px-3 py-2 text-right text-torg-dark">{n0(m.demissoes)}</td>
      <td className={`px-3 py-2 text-right font-medium ${corTurn(m.turnoverPct)}`}>{pct(m.turnoverPct)}</td>
      <td className="px-3 py-2 text-right text-torg-gray">{m.afastamentos ? `${n0(m.afastamentos)} · ${n0(m.diasAfastamento)}d` : "—"}</td>
      <td className={`px-3 py-2 text-right font-medium ${corAbs(m.absenteismoPct)}`}>{pct(m.absenteismoPct)}</td>
      <td className="px-3 py-2 text-right"><span className={m.acidentesComAfast > 0 ? "text-red-500 font-semibold" : "text-torg-gray"}>{m.acidentes ? n0(m.acidentes) : "—"}</span></td>
      <td className="px-3 py-2 text-right text-torg-gray">{m.treinamentos ? `${n0(m.treinamentos)} · ${n0(m.horasTreinamento)}h` : "—"}</td>
      <td className="px-3 py-2 text-right text-torg-gray">{m.contratacoes ? `${n0(m.contratacoes)} · ${m.tempoMedioContratacao ?? "—"}d` : "—"}</td>
      <td className={`px-3 py-2 text-center font-bold ${corNota(m.nota)} ${isAc ? "" : bgNota(m.nota)}`}>{m.nota ?? "—"}</td>
    </tr>
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><CalendarRange className="text-torg-blue" /> RH — Evolução Mensal</h1>
          <p className="text-xs text-torg-gray mt-0.5">Indicadores de RH <b>mês a mês</b> e no <b>acumulado do ano</b>. Headcount médio de referência: <b>{n0(dados?.headcountMedio)}</b> pessoas.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
            {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setAno((a) => a)} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100" title="Recarregar"><RefreshCw size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-16 text-center text-red-600 text-sm">{erro}</div>
      ) : !temDado ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-torg-gray"><Users size={34} className="mx-auto text-gray-300 mb-2" /> Sem movimentação de RH em {ano}.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50/70 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Mês</th>
                  <th className="text-right px-3 py-2.5 font-medium">Admis.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Demis.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Turnover</th>
                  <th className="text-right px-3 py-2.5 font-medium">Afast. · dias</th>
                  <th className="text-right px-3 py-2.5 font-medium">Absent.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Acid.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Trein. · h</th>
                  <th className="text-right px-3 py-2.5 font-medium">Contrat. · tempo</th>
                  <th className="text-center px-3 py-2.5 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {meses.map((m) => linha(m, false))}
              </tbody>
              {ac && <tfoot>{linha(ac, true)}</tfoot>}
            </table>
          </div>
          <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-50 leading-relaxed">
            A <b>Nota</b> avalia os indicadores que traduzem bem para o mês (turnover 40%, absenteísmo 32%, acidentes 28%). Treinamento e custo de recrutamento têm meta anual — aparecem como número, sem entrar na nota mensal. Os dias de afastamento são atribuídos ao mês de início do afastamento; no mês corrente, o absenteísmo considera só os dias úteis decorridos.
          </p>
        </div>
      )}
    </div>
  );
}
