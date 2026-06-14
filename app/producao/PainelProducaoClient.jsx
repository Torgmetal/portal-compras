"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw, AlertTriangle, Clock, ChevronDown, ChevronUp, ArrowRight,
  Scissors, Wrench, Flame, Sparkles, Wind, Paintbrush, Truck, CalendarClock,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { SETORES_SOLICITACAO, SETOR_LABEL_SOLIC, STATUS_SOLIC } from "@/lib/solicitacao-producao-const";

const fmtKg = (v) => {
  const kg = Number(v) || 0;
  return `${Math.round(kg).toLocaleString("pt-BR")} kg`;
};
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// Etapas do fluxo (status do pipeline → rota da aba + ícone/cor)
const FLUXO = [
  { status: "CORTE", label: "Corte", href: "/producao/programacao/fila-corte", icon: Scissors, cor: "text-sky-600" },
  { status: "MONTAGEM", label: "Montagem", href: "/producao/programacao/montagem", icon: Wrench, cor: "text-amber-600" },
  { status: "SOLDA", label: "Solda", href: "/producao/programacao/solda", icon: Flame, cor: "text-orange-600" },
  { status: "ACABAMENTO", label: "Acabamento", href: "/producao/programacao/acabamento", icon: Sparkles, cor: "text-purple-600" },
  { status: "JATO", label: "Jato", href: "/producao/programacao/jato", icon: Wind, cor: "text-cyan-600" },
  { status: "PINTURA", label: "Pintura", href: "/producao/programacao/pintura", icon: Paintbrush, cor: "text-pink-600" },
  { status: "EXPEDIDO", label: "Expedido", href: "/producao/programacao/expedicao", icon: Truck, cor: "text-emerald-600" },
];

export default function PainelProducaoClient({ hoje, dia, diasNoMes, pipe, setores, semanas, furos, paradas, solicitacoes = [] }) {
  const router = useRouter();
  const [verFuros, setVerFuros] = useState(false);

  // Total apontado hoje (usado no rótulo da seção de apontamento por setor)
  const apontHoje = useMemo(() => {
    return setores.reduce((a, s) => ({ kg: a.kg + s.hojeKg, un: a.un + s.hojeUn }), { kg: 0, un: 0 });
  }, [setores]);

  const maxHoje = Math.max(1, ...setores.map((s) => s.hojeKg));
  const maxSem = Math.max(1, ...semanas.map((s) => s.kg));
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Painel de Produção</h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Pulso da fábrica ao vivo (Syneco) · pipeline das peças · metas do mês — atualizado {dataHora}
          </p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Pipeline da fábrica */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-torg-dark mb-3">Pipeline da fábrica</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {FLUXO.map((f) => {
            const Icon = f.icon;
            const d = pipe[f.status];
            return (
              <Link key={f.status} href={f.href}
                className="group rounded-lg border border-gray-100 p-3 hover:border-torg-blue-300 hover:bg-torg-blue-50/40 transition-colors">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon size={15} className={f.cor} />
                  <span className="text-[11px] font-semibold text-torg-dark">{f.label}</span>
                </div>
                <p className="text-xl font-extrabold tabular-nums text-torg-dark leading-none">{d.pecas}</p>
                <p className="text-[10px] text-torg-gray mt-0.5">{fmtKg(d.kg)}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Solicitações de produção (Planejamento) */}
      {solicitacoes.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <CalendarClock size={15} className="text-torg-blue" />
            <h3 className="text-sm font-bold text-torg-dark">Solicitações de produção</h3>
            <span className="text-[11px] text-torg-gray">datas necessárias definidas pelo Planejamento</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Obra</th>
                  {SETORES_SOLICITACAO.map((s) => (
                    <th key={s} className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">{SETOR_LABEL_SOLIC[s]}</th>
                  ))}
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Entrega</th>
                  <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {solicitacoes.map((sol) => {
                  const st = STATUS_SOLIC[sol.status] || STATUS_SOLIC.SOLICITADA;
                  const ds = sol.datasSetor || {};
                  return (
                    <tr key={sol.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="font-mono font-bold text-torg-blue">{fmtOP(sol.opNumero)}</span>
                        {sol.cliente && <span className="text-torg-gray ml-1.5">{sol.cliente}</span>}
                      </td>
                      {SETORES_SOLICITACAO.map((s) => {
                        const v = ds[s];
                        const atrasada = v && v < hoje;
                        return (
                          <td key={s} className={`px-2 py-2 text-center tabular-nums ${atrasada ? "text-red-600 font-semibold" : v ? "text-torg-dark" : "text-gray-300"}`}>
                            {v ? new Date(v + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center tabular-nums text-torg-dark">
                        {sol.dataEntrega ? new Date(sol.dataEntrega).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.cor}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Alertas */}
      {(furos.length > 0 || paradas > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {furos.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <button onClick={() => setVerFuros((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold text-red-800">
                  <AlertTriangle size={16} className="text-red-600" />
                  {furos.length} furo{furos.length > 1 ? "s" : ""} de apontamento no Syneco
                </span>
                {verFuros ? <ChevronUp size={16} className="text-red-600" /> : <ChevronDown size={16} className="text-red-600" />}
              </button>
              {verFuros && (
                <div className="mt-2 space-y-1 text-xs text-red-800">
                  {furos.map((f) => (
                    <p key={f.marca} className="tabular-nums">
                      <span className="font-mono font-bold">{f.marca}</span> (OP {f.opNumero}) — {f.resumo}
                    </p>
                  ))}
                  <p className="text-red-600 pt-1">Corrija os lançamentos no Syneco; exporte o relatório nas abas de setor.</p>
                </div>
              )}
            </div>
          )}
          {paradas > 0 && (
            <Link href="/producao/mapa"
              className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-2 hover:bg-amber-100/60 transition-colors">
              <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Clock size={16} className="text-amber-600" />
                {paradas} peça{paradas > 1 ? "s" : ""} parada{paradas > 1 ? "s" : ""} há mais de 1 dia
              </span>
              <span className="text-xs text-amber-700 flex items-center gap-1">ver no mapa <ArrowRight size={13} /></span>
            </Link>
          )}
        </div>
      )}

      {/* Apontamento Syneco hoje por setor */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-torg-dark mb-3">Apontamento de hoje por setor (Syneco)</h3>
        <div className="space-y-2">
          {setores.map((s) => (
            <div key={s.setor} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-torg-gray font-medium">{s.setor}</span>
              <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                <div className="h-full bg-torg-blue" style={{ width: `${pct(s.hojeKg, maxHoje)}%` }} />
              </div>
              <span className="w-32 shrink-0 text-right tabular-nums text-torg-dark">
                {fmtKg(s.hojeKg)} {s.hojeUn > 0 && <span className="text-torg-gray">· {s.hojeUn} un</span>}
              </span>
            </div>
          ))}
          {apontHoje.kg === 0 && <p className="text-xs text-torg-gray text-center py-2">Nenhum apontamento registrado hoje ainda.</p>}
        </div>
      </section>

      {/* Meta × realizado por setor (mês) */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-bold text-torg-dark">Meta × realizado no mês (Syneco)</h3>
          <span className="text-[11px] text-torg-gray">dia {dia} de {diasNoMes}</span>
        </div>
        <div className="space-y-3">
          {setores.map((s) => {
            const p = pct(s.mesKg, s.metaKg);
            const corBar = p >= 90 ? "bg-emerald-500" : p >= 50 ? "bg-torg-blue" : "bg-amber-500";
            return (
              <div key={s.setor} className="text-xs">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-medium text-torg-dark">{s.setor}</span>
                  <span className="tabular-nums text-torg-gray">
                    {fmtKg(s.mesKg)} / {s.metaKg > 0 ? fmtKg(s.metaKg) : "—"}
                    {s.metaKg > 0 && <span className={`ml-1.5 font-semibold ${p >= 90 ? "text-emerald-600" : p >= 50 ? "text-torg-blue" : "text-amber-600"}`}>{p}%</span>}
                  </span>
                </div>
                <div className="bg-gray-100 rounded h-2.5 overflow-hidden">
                  <div className={`h-full ${corBar}`} style={{ width: `${Math.min(100, p)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Evolução semanal (Syneco) */}
      {semanas.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-torg-dark mb-3">Produção apontada por semana (todos os setores)</h3>
          <div className="flex items-end gap-1.5 h-40">
            {semanas.map((s) => (
              <div key={s.semana} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                <span className="text-[9px] tabular-nums text-torg-gray opacity-0 group-hover:opacity-100 transition-opacity">{fmtKg(s.kg)}</span>
                <div className="w-full bg-torg-blue/80 rounded-t hover:bg-torg-blue transition-colors" style={{ height: `${pct(s.kg, maxSem)}%` }} />
                <span className="text-[9px] text-torg-gray">{s.semana.slice(-3)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

