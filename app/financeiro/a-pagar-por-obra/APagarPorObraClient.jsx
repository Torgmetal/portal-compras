"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowDownCircle, Loader2, RefreshCw, AlertCircle, ChevronRight,
  Building2, Clock, Wallet, AlertTriangle, Inbox, CheckCircle2,
} from "lucide-react";

const fmtMoeda = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

function KpiCard({ icon: Icon, label, valor, cor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <Icon size={22} className={cor} />
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-extrabold tabular-nums truncate ${cor}`}>{valor}</p>
      </div>
    </div>
  );
}

function ObraCard({ obra, aberto, onToggle }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <ChevronRight size={16} className={`text-torg-gray transition-transform shrink-0 ${aberto ? "rotate-90" : ""}`} />
        <Building2 size={18} className="text-torg-blue shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-torg-dark truncate">{obra.projeto}</p>
          <p className="text-xs text-torg-gray">
            {obra.numeroOp ? `OP-${obra.numeroOp} · ` : ""}
            {obra.recebido > 0 && <span>{fmtMoeda(obra.recebido)} faturado</span>}
            {obra.recebido > 0 && obra.previsto > 0 && " · "}
            {obra.previsto > 0 && <span className="text-torg-orange">{fmtMoeda(obra.previsto)} aguardando</span>}
          </p>
        </div>
        {obra.vencido > 0 && (
          <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full whitespace-nowrap">
            {fmtMoeda(obra.vencido)} vencido
          </span>
        )}
        <span className="text-base font-extrabold text-torg-dark tabular-nums whitespace-nowrap">
          {fmtMoeda(obra.total)}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-gray-100">
          {obra.meses.length > 0 && (
            <div className="px-4 py-3 bg-gray-50/60 flex flex-wrap gap-2">
              {obra.meses.map((m) => (
                <div key={m.chave} className="bg-white border border-gray-100 rounded-lg px-3 py-1.5">
                  <span className="text-[10px] text-torg-gray uppercase">{m.label}</span>
                  <span className="ml-2 text-sm font-bold text-torg-dark tabular-nums">{fmtMoeda(m.total)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60">
                <tr className="text-left text-torg-gray">
                  <th className="px-4 py-2 font-medium">Vencimento</th>
                  <th className="px-4 py-2 font-medium">Fornecedor</th>
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2 font-medium">NF</th>
                  <th className="px-4 py-2 font-medium text-right">Valor</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obra.titulos.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-1.5 tabular-nums whitespace-nowrap text-torg-dark">{fmtData(t.vencimento)}</td>
                    <td className="px-4 py-1.5 text-torg-dark max-w-[220px] truncate" title={t.fornecedor}>{t.fornecedor}</td>
                    <td className="px-4 py-1.5 font-mono text-torg-gray">{t.pedido || "—"}</td>
                    <td className="px-4 py-1.5 font-mono text-torg-gray">{t.nf || "—"}</td>
                    <td className="px-4 py-1.5 text-right font-semibold tabular-nums text-torg-dark">{fmtMoeda(t.valor)}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {t.origem === "pedido" ? (
                        <span className="text-[10px] font-semibold text-torg-orange bg-orange-50 px-1.5 py-0.5 rounded-full">Aguardando receb.</span>
                      ) : t.situacao === "VENCIDA" ? (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                          Vencida {t.diasAtraso ? `${t.diasAtraso}d` : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">A vencer</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function APagarPorObraClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [abertos, setAbertos] = useState({});

  const carregar = useCallback(async (forcar = false) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/financeiro/a-pagar-por-obra${forcar ? "?forcar=1" : ""}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Erro ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setErro(e.message || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(false); }, [carregar]);

  const toggle = (k) => setAbertos((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark flex items-center gap-2">
            <ArrowDownCircle size={24} className="text-torg-orange" />
            A pagar por obra
          </h1>
          <p className="text-sm text-torg-gray mt-0.5">
            Compras de fornecedor por obra — o que já foi faturado (conta a pagar) e o que está em pedido aguardando recebimento.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.ultimoSync && (
            <span className="text-xs text-torg-gray">
              Contas: {new Date(data.ultimoSync).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => carregar(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm font-medium text-torg-blue hover:text-torg-dark transition-colors px-3 py-1.5 rounded-lg hover:bg-torg-blue-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </div>

      {/* Aviso se o pull de pendentes do Omie falhar */}
      {data?.pendentesOmie && !data.pendentesOmie.ok && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-torg-dark flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          Não foi possível buscar os pedidos pendentes do Omie agora ({data.pendentesOmie.erro}). Mostrando só o que já foi faturado. Tente "Atualizar".
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Wallet} label="Total a pagar" valor={fmtMoeda(data.totais.total)} cor="text-torg-dark" />
          <KpiCard icon={CheckCircle2} label="Já faturado" valor={fmtMoeda(data.totais.recebido)} cor="text-torg-blue" />
          <KpiCard icon={Clock} label="Aguardando receb." valor={fmtMoeda(data.totais.previsto)} cor="text-torg-orange" />
          <KpiCard icon={AlertTriangle} label="Vencido" valor={fmtMoeda(data.totais.vencido)} cor={data.totais.vencido > 0 ? "text-red-600" : "text-torg-gray"} />
        </div>
      )}

      {loading && !data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex items-center justify-center gap-3 text-torg-gray">
          <Loader2 size={18} className="animate-spin" /> Carregando compras por obra…
        </div>
      )}

      {erro && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6 flex flex-col items-center gap-3 text-center">
          <AlertCircle size={28} className="text-red-500" />
          <p className="text-sm text-torg-dark">{erro}</p>
          <button onClick={() => carregar(false)} className="text-sm font-medium text-torg-blue hover:underline">Tentar novamente</button>
        </div>
      )}

      {data && !loading && data.obras.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-3 text-center text-torg-gray">
          <Inbox size={32} className="text-gray-300" />
          <p className="text-sm">Nenhuma compra a pagar por obra no momento.</p>
        </div>
      )}

      {data && data.obras.length > 0 && (
        <div className="space-y-2.5">
          {data.obras.map((obra) => {
            const k = obra.codProj || "sem-obra";
            return <ObraCard key={k} obra={obra} aberto={!!abertos[k]} onToggle={() => toggle(k)} />;
          })}
        </div>
      )}

      <p className="text-[11px] text-torg-gray text-center pt-2">
        <span className="text-torg-blue font-medium">Faturado</span>: contas a pagar reais do Omie (já recebido). <span className="text-torg-orange font-medium">Aguardando recebimento</span>: pedidos de compra ainda não recebidos (estimativa pelas parcelas do pedido). Visão informativa — não altera o saldo do Fluxo de Caixa.
      </p>
    </div>
  );
}
