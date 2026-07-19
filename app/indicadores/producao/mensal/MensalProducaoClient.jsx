"use client";
import { useState, useEffect } from "react";
import { CalendarRange, Loader2, RefreshCw, Factory, Info } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const kg = (n) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const corNota = (n) => (n == null ? "text-gray-300" : n >= 80 ? "text-emerald-600" : n >= 60 ? "text-amber-500" : "text-red-500");
const bgNota = (n) => (n == null ? "" : n >= 80 ? "bg-emerald-50" : n >= 60 ? "bg-amber-50" : "bg-red-50");

export default function MensalProducaoClient() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setLoading(true); setErro("");
    fetch(`/api/producao/indicadores/mensal?ano=${ano}`).then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar.")).finally(() => setLoading(false));
  }, [ano]);

  const meses = dados?.meses || [];
  const ac = dados?.acumulado;
  const temDado = meses.some((m) => m.kg);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><CalendarRange className="text-green-600" /> Produção — Evolução Mensal</h1>
          <p className="text-xs text-torg-gray mt-0.5">Produção (preparação / corte) <b>mês a mês</b> e no <b>acumulado do ano</b>, avaliada contra a meta de {kg(dados?.metaDiaKg || 6000)} kg/dia útil.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
            {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setAno((a) => a)} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100" title="Recarregar"><RefreshCw size={16} /></button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-[12px] text-torg-gray bg-torg-blue-50/40 border border-torg-blue-100/60 rounded-lg px-3 py-2">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-torg-blue" />
        <span>O peso é <b>por peça</b>. Como a mesma peça é apontada em Corte, Montagem, Solda, Acabamento, Jato e Pintura, somar os setores contaria o peso várias vezes. A produção física é medida na <b>preparação (corte)</b>, onde cada peça é contada uma única vez — e é a base do ritmo da fábrica.</span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-16 text-center text-red-600 text-sm">{erro}</div>
      ) : !temDado ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-torg-gray"><Factory size={34} className="mx-auto text-gray-300 mb-2" /> Sem apontamentos de corte em {ano}.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50/70 text-torg-gray">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Mês</th>
                  <th className="text-right px-4 py-2.5 font-medium">Preparação (kg)</th>
                  <th className="text-right px-4 py-2.5 font-medium">kg/dia útil</th>
                  <th className="text-right px-4 py-2.5 font-medium">Meta prep.</th>
                  <th className="text-center px-4 py-2.5 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {meses.map((m) => (
                  <tr key={m.mes} className="hover:bg-gray-50/40">
                    <td className="px-4 py-2 font-medium text-torg-dark">{MESES[m.mes - 1]}<span className="text-[10px] text-gray-400 ml-1">{m.diasUteis}du</span></td>
                    <td className="px-4 py-2 text-right text-torg-dark">{kg(m.kg)}</td>
                    <td className="px-4 py-2 text-right text-torg-gray">{kg(m.kgDia)}</td>
                    <td className="px-4 py-2 text-right"><span className={corNota(m.metaPct)}>{m.metaPct != null ? `${Math.round(m.metaPct)}%` : "—"}</span></td>
                    <td className={`px-4 py-2 text-center font-bold ${corNota(m.nota)} ${bgNota(m.nota)}`}>{m.nota ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              {ac && (
                <tfoot>
                  <tr className="bg-torg-blue-50/60 border-t-2 border-torg-blue-100 font-semibold text-torg-dark">
                    <td className="px-4 py-2.5">Acumulado {ano}</td>
                    <td className="px-4 py-2.5 text-right">{kg(ac.kg)}</td>
                    <td className="px-4 py-2.5 text-right">{kg(ac.kgDia)}</td>
                    <td className="px-4 py-2.5 text-right"><span className={corNota(ac.metaPct)}>{ac.metaPct != null ? `${Math.round(ac.metaPct)}%` : "—"}</span></td>
                    <td className={`px-4 py-2.5 text-center font-bold ${corNota(ac.nota)}`}>{ac.nota ?? "—"}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-50">A <b>Preparação</b> é o peso cortado no mês (cada peça uma vez). A <b>Nota</b> é o atingimento da meta ({kg(dados?.metaDiaKg || 6000)} kg/dia útil); no mês corrente, a meta considera só os dias úteis já decorridos.</p>
        </div>
      )}
    </div>
  );
}
