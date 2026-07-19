"use client";
import { useState, useEffect } from "react";
import { CalendarRange, Loader2, RefreshCw, Briefcase } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const n0 = (v) => (v == null ? "—" : (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const brl = (v) => {
  const n = v || 0;
  if (Math.abs(n) >= 1e6) return `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1e3) return `R$ ${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};
const corNota = (n) => (n == null ? "text-gray-300" : n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-500" : "text-red-500");
const bgNota = (n) => (n == null ? "" : n >= 80 ? "bg-emerald-50" : n >= 60 ? "bg-amber-50" : "bg-red-50");
const corWR = (v) => (v == null ? "text-gray-400" : v >= 40 ? "text-emerald-600" : v >= 25 ? "text-amber-500" : "text-red-500");
const corPrazo = (v) => (v == null ? "text-gray-400" : v >= 90 ? "text-emerald-600" : v >= 70 ? "text-amber-500" : "text-red-500");

export default function MensalComercialClient() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setLoading(true); setErro("");
    fetch(`/api/comercial/indicadores/mensal?ano=${ano}`).then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar.")).finally(() => setLoading(false));
  }, [ano]);

  const meses = dados?.meses || [];
  const ac = dados?.acumulado;
  const temDado = meses.some((m) => m.rfqs || m.enviadas || m.ganhas || m.perdidas);

  const linha = (m, isAc) => (
    <tr key={isAc ? "ac" : m.mes} className={isAc ? "bg-torg-blue-50/60 border-t-2 border-torg-blue-100 font-semibold text-torg-dark" : "hover:bg-gray-50/40"}>
      <td className={`px-3 ${isAc ? "py-2.5" : "py-2 font-medium text-torg-dark"} whitespace-nowrap`}>{isAc ? `Acumulado ${ano}` : MESES[m.mes - 1]}</td>
      <td className="px-3 py-2 text-right text-torg-dark">{n0(m.rfqs)}</td>
      <td className="px-3 py-2 text-right text-torg-gray whitespace-nowrap">{m.rfqs ? brl(m.valorRfq) : "—"}</td>
      <td className="px-3 py-2 text-right text-torg-dark">{n0(m.enviadas)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{m.enviadas ? <span className="text-torg-gray">{m.tempoMedio}d · <span className={corPrazo(m.dentroPrazoPct)}>{n0(m.dentroPrazoPct)}%</span></span> : "—"}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{m.ganhas ? <span className="text-emerald-700">{n0(m.ganhas)} · {brl(m.valorGanho)}</span> : "—"}</td>
      <td className="px-3 py-2 text-right"><span className={m.perdidas > 0 ? "text-red-500" : "text-torg-gray"}>{m.perdidas ? n0(m.perdidas) : "—"}</span></td>
      <td className={`px-3 py-2 text-right font-medium ${corWR(m.winRate)}`}>{m.winRate == null ? "—" : `${m.winRate}%`}</td>
      <td className={`px-3 py-2 text-center font-bold ${corNota(m.nota)} ${isAc ? "" : bgNota(m.nota)}`}>{m.nota ?? "—"}</td>
    </tr>
  );

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><CalendarRange className="text-torg-blue" /> Comercial — Evolução Mensal</h1>
          <p className="text-xs text-torg-gray mt-0.5">Indicadores comerciais <b>mês a mês</b> e no <b>acumulado do ano</b>. Ganhas/perdidas contam pelo mês de fechamento.</p>
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
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-torg-gray"><Briefcase size={34} className="mx-auto text-gray-300 mb-2" /> Sem movimentação comercial em {ano}.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50/70 text-torg-gray">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold">Mês</th>
                  <th className="text-right px-3 py-2.5 font-medium">RFQs</th>
                  <th className="text-right px-3 py-2.5 font-medium">Valor solic.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Enviadas</th>
                  <th className="text-right px-3 py-2.5 font-medium">Tempo · prazo</th>
                  <th className="text-right px-3 py-2.5 font-medium">Ganhas</th>
                  <th className="text-right px-3 py-2.5 font-medium">Perd.</th>
                  <th className="text-right px-3 py-2.5 font-medium">Win rate</th>
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
            A <b>Nota</b> usa os indicadores que traduzem bem para o mês (win rate 60%, tempo de resposta 40%; prazo-alvo {dados?.prazoAlvo || 7} dias). Margem por contrato, pipeline e concentração de clientes são cumulativos — ficam no dashboard anual. <b>RFQs</b> e <b>valor solicitado</b> contam pelo mês da solicitação; <b>ganhas/perdidas</b> pelo mês de fechamento.
          </p>
        </div>
      )}
    </div>
  );
}
