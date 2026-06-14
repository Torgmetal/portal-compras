"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, RefreshCw, Scissors, Clock, PackageSearch } from "lucide-react";
import { MAQUINA_COR } from "@/lib/maquina-corte";

const fmtKg = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (iso) => (iso ? new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");
const hojeIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default function CargaCorteClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch("/api/pcp/carga-corte");
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setDados(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-torg-gray">
        <Loader2 className="animate-spin mr-3" size={28} /> Carregando carga do corte…
      </div>
    );
  }
  if (erro) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-600 font-medium">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 bg-torg-blue text-white rounded-lg text-sm">Tentar novamente</button>
      </div>
    );
  }

  const maxDias = Math.max(1, ...dados.maquinas.map((m) => m.diasCarga || 0));

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Scissors size={24} className="text-torg-blue" /> Carga do Corte
          </h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Por máquina: o que está comprometido, o que está em andamento e quando há espaço para encaixar.
          </p>
        </div>
        <button onClick={carregar} className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* Aguardando liberação (sem máquina) */}
      {dados.pendentes.pecas > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-2.5 text-sm">
          <PackageSearch size={16} className="text-torg-gray" />
          <span className="text-torg-dark">
            <span className="font-semibold">{dados.pendentes.pecas} peças</span> aguardando liberação ({fmtKg(dados.pendentes.kg)}) — ainda sem máquina definida.
          </span>
        </div>
      )}

      {/* Máquinas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dados.maquinas.map((m) => {
          const cor = MAQUINA_COR[m.maquina] || { bg: "bg-gray-50", text: "text-torg-gray", dot: "bg-gray-400" };
          const livreAgora = !m.diasCarga || m.diasCarga <= 0;
          const slotHoje = m.slotLivre === dados.hoje || livreAgora;
          return (
            <div key={m.maquina} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className={`px-4 py-2.5 flex items-center justify-between ${cor.bg}`}>
                <span className={`text-sm font-bold flex items-center gap-2 ${cor.text}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${cor.dot}`} /> {m.label}
                </span>
                <span className="text-[11px] text-torg-gray">cap. {m.capKgDia ? `${m.capKgDia.toLocaleString("pt-BR")} kg/dia` : "sem base"}</span>
              </div>
              <div className="p-4 space-y-3">
                {/* Carga / dias */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs text-torg-gray">Comprometido</span>
                    <span className="text-sm font-bold text-torg-dark tabular-nums">
                      {m.diasCarga != null ? `${m.diasCarga} dias` : "—"}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.diasCarga > 10 ? "bg-red-500" : m.diasCarga > 4 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, ((m.diasCarga || 0) / maxDias) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-torg-gray mt-1 tabular-nums">
                    {m.backlogPecas} peças · {fmtKg(m.backlogKg)}
                    {m.iniciadas > 0 && <span className="text-amber-600"> · {m.iniciadas} já iniciadas</span>}
                  </p>
                </div>

                {/* Em andamento agora (Syneco) */}
                {m.emAndamentoPecas > 0 && (
                  <p className="text-[11px] text-torg-blue flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-torg-blue animate-pulse" />
                    em corte agora: {m.emAndamentoPecas} un · {fmtKg(m.emAndamentoKg)}
                  </p>
                )}

                {/* Próximo slot livre */}
                <div className="flex items-center gap-1.5 text-xs pt-1 border-t border-gray-50">
                  <Clock size={13} className={slotHoje ? "text-emerald-600" : "text-torg-gray"} />
                  {slotHoje ? (
                    <span className="text-emerald-700 font-semibold">livre para encaixar agora</span>
                  ) : (
                    <span className="text-torg-dark">
                      espaço a partir de <span className="font-semibold tabular-nums">{fmtData(m.slotLivre)}</span>
                      <span className="text-torg-gray"> (~{Math.ceil(m.diasCarga)} dias úteis)</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-torg-gray">
        Dias de carga = peso comprometido ÷ capacidade real da máquina (kg/dia, medida no Syneco nos últimos 30 dias).
        O slot livre assume a fila atual sem furo de prioridade.
      </p>
    </div>
  );
}
