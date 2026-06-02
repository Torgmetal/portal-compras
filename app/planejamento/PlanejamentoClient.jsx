"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import {
  Loader2, AlertCircle, RefreshCw, Clock, CheckCircle2, AlertTriangle,
  ArrowRight, Factory, Paintbrush, Truck, ListTodo, CalendarRange,
} from "lucide-react";

const SETOR_LABEL = {
  PENDENTE: "Estoque", CORTE: "Preparacao", MONTAGEM: "Montagem",
  SOLDA: "Solda", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedido",
};

const fmtKg = (v) => {
  if (!v) return "0 kg";
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

const fmtData = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
};

export default function PlanejamentoClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/planejamento/dashboard");
      if (!res.ok) throw new Error("Erro ao carregar");
      setData(await res.json());
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-torg-blue" size={28} />
        <span className="ml-3 text-torg-gray">Carregando painel...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={32} className="mx-auto text-red-400 mb-2" />
        <p className="text-sm text-red-600 mb-3">{erro}</p>
        <button onClick={carregar} className="text-sm text-torg-blue hover:underline flex items-center gap-1 mx-auto">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  const { ops, semanaAtual, anoAtual, tarefasSemana } = data;
  const tarefasPendentes = tarefasSemana.find((t) => t.status === "PENDENTE")?.count || 0;
  const tarefasAndamento = tarefasSemana.find((t) => t.status === "EM_ANDAMENTO")?.count || 0;
  const tarefasConcluidas = tarefasSemana.find((t) => t.status === "CONCLUIDA")?.count || 0;
  const opsAtrasadas = ops.filter((o) => o.atrasada).length;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight">Planejamento</h2>
          <p className="text-xs text-torg-gray mt-0.5">
            Semana {semanaAtual}/{anoAtual} — Cronogramas, tarefas e programacao da producao
          </p>
        </div>
        <button onClick={carregar} className="p-2 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="OPs em Andamento" value={ops.length} icon={Factory} color="bg-torg-blue-50 text-torg-blue" />
        <KpiCard label="OPs Atrasadas" value={opsAtrasadas} icon={AlertTriangle} color={opsAtrasadas > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-torg-gray"} />
        <KpiCard label="Tarefas da Semana" value={tarefasPendentes + tarefasAndamento} subtitle={`${tarefasConcluidas} concluidas`} icon={ListTodo} color="bg-amber-50 text-amber-700" />
        <Link href="/planejamento/programacao" className="block">
          <KpiCard label="Programacao Semanal" value="Ver" icon={CalendarRange} color="bg-emerald-50 text-emerald-700" clickable />
        </Link>
      </div>

      {/* Atalhos */}
      <div className="flex gap-2">
        <Link href="/planejamento/programacao" className="px-4 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5">
          <CalendarRange size={14} /> Programacao Semanal
        </Link>
        <Link href="/planejamento/tarefas" className="px-4 py-2 bg-white text-torg-dark text-xs rounded-lg border border-gray-200 hover:bg-gray-50 font-medium flex items-center gap-1.5">
          <ListTodo size={14} /> Gerenciar Tarefas
        </Link>
      </div>

      {/* Cronogramas */}
      <div>
        <h3 className="text-sm font-semibold text-torg-dark mb-3 uppercase tracking-wide">Cronogramas em Andamento</h3>
        {ops.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <Factory size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-torg-gray">Nenhuma OP ativa no momento.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ops.map((op) => (
              <OPCard key={op.id} op={op} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, subtitle, icon: Icon, color, clickable }) {
  return (
    <div className={`rounded-xl p-3 ${color} ${clickable ? "hover:opacity-80 cursor-pointer" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
        <Icon size={14} className="opacity-50" />
      </div>
      <p className="text-2xl font-extrabold tabular-nums leading-tight mt-1">{value}</p>
      {subtitle && <p className="text-[10px] opacity-70 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function OPCard({ op }) {
  const diasRestantes = op.dataFimPrevista
    ? Math.ceil((new Date(op.dataFimPrevista) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className={`bg-white rounded-xl border ${op.atrasada ? "border-red-200" : "border-gray-100"} shadow-sm p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-torg-blue font-mono">{fmtOP(op.numero)}</span>
          <span className="text-sm text-torg-dark font-medium">{op.cliente}</span>
          {op.obra && <span className="text-xs text-torg-gray">({op.obra})</span>}
        </div>
        <div className="flex items-center gap-2">
          {op.atrasada && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> ATRASADA
            </span>
          )}
          {diasRestantes !== null && (
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full flex items-center gap-1 ${
              diasRestantes < 0 ? "bg-red-50 text-red-600"
              : diasRestantes <= 14 ? "bg-amber-50 text-amber-700"
              : "bg-gray-100 text-torg-gray"
            }`}>
              <Clock size={10} />
              {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasada` : `${diasRestantes}d restantes`}
            </span>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] text-torg-gray mb-1">
          <span>{fmtData(op.dataInicio)} — {fmtData(op.dataFimPrevista)}</span>
          <span className="font-semibold text-torg-dark">{op.progresso}% expedido</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${op.atrasada ? "bg-red-400" : "bg-emerald-400"}`}
            style={{ width: `${Math.min(op.progresso, 100)}%` }}
          />
        </div>
      </div>

      {/* Distribuicao por setor */}
      <div className="flex items-center gap-1 flex-wrap">
        {Object.entries(op.porSetor).map(([setor, info]) => (
          <span key={setor} className="px-1.5 py-0.5 bg-gray-50 text-[10px] text-torg-gray rounded">
            {SETOR_LABEL[setor] || setor}: <strong>{info.qte}</strong> ({fmtKg(info.peso)})
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-torg-gray">
        <span>{op.totalQte} pecas · {fmtKg(op.pesoTotal)}</span>
        <span>{op.qteExpedida} expedidas · {fmtKg(op.pesoExpedido)}</span>
      </div>
    </div>
  );
}
