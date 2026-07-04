"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Activity, RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle, Clock,
  Play, Plug,
} from "lucide-react";
import { useStore } from "@/lib/store";

const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "nunca");
const fmtDur = (ms) => (ms == null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const SIT = {
  OK: { label: "OK", cor: "bg-green-100 text-green-700", Icon: CheckCircle2 },
  ATRASADO: { label: "Atrasado", cor: "bg-amber-100 text-amber-700", Icon: Clock },
  FALHOU: { label: "Falhou", cor: "bg-red-100 text-red-700", Icon: XCircle },
  NUNCA: { label: "Nunca rodou", cor: "bg-gray-100 text-gray-500", Icon: AlertCircle },
};

export default function SincronizacoesClient() {
  const { showToast } = useStore();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [forcando, setForcando] = useState(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/admin/sincronizacoes");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setDados(d);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  // Auto-refresh leve a cada 30s
  useEffect(() => {
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [carregar]);

  const forcar = (job) => {
    setForcando(job);
    // Dispara sem bloquear a UI; acompanha pelo heartbeat.
    fetch("/api/admin/sincronizacoes/forcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }) })
      .then((r) => r.json())
      .then((d) => { if (d && d.success === false) showToast(d.error || "Falha ao forçar", "error"); })
      .catch(() => {});
    showToast("Sincronização disparada — o status atualiza em instantes", "success");
    setTimeout(() => { setForcando(null); carregar(); }, 8000);
  };

  if (carregando && !dados) {
    return <div className="flex items-center justify-center py-20 text-torg-gray"><Loader2 size={20} className="animate-spin mr-2" /> Carregando…</div>;
  }
  if (erro && !dados) {
    return (
      <div className="max-w-[1200px]">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={16} /> {erro}
          <button onClick={carregar} className="ml-auto px-3 py-1 bg-torg-blue text-white rounded-lg text-xs inline-flex items-center gap-1"><RefreshCw size={12} /> Tentar de novo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1300px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Activity className="text-torg-blue" /> Sincronizações
          </h2>
          <p className="text-sm text-torg-gray mt-1">Status de todas as sincronizações agendadas e integrações do portal.</p>
        </div>
        <div className="flex items-center gap-3">
          {dados && (
            <span className="text-xs text-torg-gray">
              <strong className="text-green-700">{dados.resumo.ok}</strong> ok · <strong className={dados.resumo.problemas ? "text-red-600" : "text-torg-gray"}>{dados.resumo.problemas}</strong> com problema
            </span>
          )}
          <button onClick={carregar} className="px-3 py-2 text-sm text-torg-dark border border-gray-200 rounded-lg hover:bg-gray-50 inline-flex items-center gap-2">
            <RefreshCw size={15} className={carregando ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </div>

      {/* Sincronizações agendadas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100"><h3 className="text-sm font-bold text-torg-dark">Sincronizações agendadas (crons)</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sincronização</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Situação</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Última execução</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Último sucesso</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Duração</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Forçar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dados?.crons.map((c) => {
                const s = SIT[c.situacao] || SIT.NUNCA;
                return (
                  <tr key={c.job} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-torg-dark">{c.label}</div>
                      {c.mensagem && <div className="text-[10px] text-torg-gray max-w-[360px] truncate" title={c.mensagem}>{c.mensagem}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cor}`}>
                        <s.Icon size={12} /> {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-torg-gray tabular-nums">{fmtDataHora(c.lastRunAt)}</td>
                    <td className="px-4 py-2.5 text-xs text-torg-gray tabular-nums">{fmtDataHora(c.lastOkAt)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-torg-gray tabular-nums">{fmtDur(c.duracaoMs)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => forcar(c.job)} disabled={forcando === c.job}
                        className="px-2.5 py-1.5 text-xs text-torg-blue border border-torg-blue-200 rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-1.5 disabled:opacity-50">
                        {forcando === c.job ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Forçar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Saúde das integrações */}
      <div>
        <h3 className="text-sm font-bold text-torg-dark mb-3 flex items-center gap-2"><Plug size={16} className="text-torg-blue" /> Integrações externas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dados?.integracoes.map((i) => {
            const cor = !i.configurada ? "bg-gray-100 text-gray-500" : i.sucesso === false ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700";
            const label = !i.configurada ? "Não configurada" : i.sucesso === false ? "Com erro" : "Conectada";
            return (
              <div key={i.nome} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-torg-dark text-sm">{i.nome}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cor}`}>{label}</span>
                </div>
                <p className="text-[11px] text-torg-gray">{i.detalhe}</p>
                {i.ultimaSync && <p className="text-[10px] text-torg-gray mt-1">Última: {fmtDataHora(i.ultimaSync)}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
