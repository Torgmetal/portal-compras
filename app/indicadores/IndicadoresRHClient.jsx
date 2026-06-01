"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, RefreshCw, Calendar, ChevronDown,
  Users, TrendingDown, Clock, Shield, BookOpen, DollarSign,
  Activity, Heart, AlertTriangle, Briefcase, UserPlus, UserMinus,
  Target, Award, HardHat, Gauge,
} from "lucide-react";

// ─── HELPERS ─────────────────────────────────────────────────
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtMoeda = (v) => v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

const TIPO_DESLIGAMENTO = {
  VOLUNTARIO: "Voluntário",
  INVOLUNTARIO: "Involuntário",
  ACORDO: "Acordo",
};

const NATUREZA_AFASTAMENTO = {
  FISICO: "Físico",
  MENTAL: "Mental",
  ACIDENTE_TRABALHO: "Ac. Trabalho",
  ACIDENTE_TRAJETO: "Ac. Trajeto",
  MATERNIDADE: "Maternidade",
  PATERNIDADE: "Paternidade",
};

const GRAVIDADE_LABELS = {
  LEVE: "Leve",
  MODERADO: "Moderado",
  GRAVE: "Grave",
  FATAL: "Fatal",
};

const GRAVIDADE_CORES = {
  LEVE: "bg-emerald-500",
  MODERADO: "bg-amber-500",
  GRAVE: "bg-orange-600",
  FATAL: "bg-red-600",
};

const TIPO_TREINAMENTO = {
  NR_OBRIGATORIO: "NR Obrigatório",
  TECNICO: "Técnico",
  COMPORTAMENTAL: "Comportamental",
  INTEGRACAO: "Integração",
  SST: "SST",
};

const TIPO_TREINAMENTO_CORES = {
  NR_OBRIGATORIO: "bg-red-500",
  TECNICO: "bg-torg-blue",
  COMPORTAMENTAL: "bg-purple-500",
  INTEGRACAO: "bg-emerald-500",
  SST: "bg-amber-500",
};

// ─── HOOK DE DADOS ───────────────────────────────────────────
function useIndicadoresRH() {
  const now = new Date();
  const [anoSel, setAnoSel] = useState(now.getFullYear());
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/rh/indicadores?ano=${anoSel}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Erro ao carregar indicadores");
      setDados(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [anoSel]);

  useEffect(() => { carregar(); }, [carregar]);

  return { anoSel, setAnoSel, dados, loading, erro, recarregar: carregar };
}

// ─── COMPONENTES COMPARTILHADOS ──────────────────────────────

function AnoSelector({ anoSel, setAnoSel, onRecarregar }) {
  const now = new Date();
  const anos = [];
  for (let a = 2024; a <= now.getFullYear() + 1; a++) anos.push(a);

  return (
    <div className="flex items-center gap-2">
      <Calendar size={16} className="text-torg-gray" />
      <div className="relative">
        <select
          value={anoSel}
          onChange={(e) => setAnoSel(Number(e.target.value))}
          className="appearance-none pl-3 pr-7 py-2 border border-gray-200 rounded-lg text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-torg-blue/30"
        >
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      <button
        onClick={onRecarregar}
        className="p-2 text-gray-400 hover:text-torg-blue rounded-lg hover:bg-gray-50 transition"
        title="Atualizar"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-[60vh] text-gray-400 gap-2">
      <Loader2 className="animate-spin" size={20} />
      <span>Carregando indicadores...</span>
    </div>
  );
}

function ErroState({ erro, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 gap-3">
      <AlertCircle size={32} />
      <p>{erro}</p>
      <button onClick={onRetry} className="text-torg-blue hover:underline flex items-center gap-1">
        <RefreshCw size={14} /> Tentar novamente
      </button>
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-torg-dark flex items-center gap-2">
          <Icon size={16} className="text-torg-blue" />
          {title}
        </h3>
        {subtitle && <p className="text-xs text-torg-gray mt-0.5 ml-6">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function CardResumo({ icon: Icon, label, valor, sub, cor, meta }) {
  const cores = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-torg-blue",
  };
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cores[cor] || cores.blue}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-torg-dark truncate">{valor}</p>
          <p className="text-xs text-gray-400">{sub}</p>
          {meta && <p className="text-[10px] text-torg-gray/70">Meta: {meta}</p>}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, valor, cor }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-3 flex items-center gap-2.5">
      <div className={`${cor} w-2 h-10 rounded-full flex-shrink-0`} />
      <div className="min-w-0">
        <p className="text-[10px] text-torg-gray uppercase tracking-wide truncate">{label}</p>
        <p className="text-lg font-extrabold text-torg-dark tabular-nums truncate">{valor}</p>
      </div>
    </div>
  );
}

function PercentageBar({ label, valor, pct, cor }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-torg-dark">{label}</span>
        <span className="text-xs text-torg-gray tabular-nums">
          {valor != null ? valor : ""}{pct != null ? ` (${fmtPct(pct)})` : ""}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${cor || "bg-torg-blue"} rounded-full transition-all`}
          style={{ width: `${Math.max(pct || 0, 1)}%` }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 1. DASHBOARD RH (/indicadores/rh)
// ═══════════════════════════════════════════════════════════════
export function RHDashboardClient() {
  const { anoSel, setAnoSel, dados, loading, erro, recarregar } = useIndicadoresRH();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { turnover, absenteismo, acidentes, tempoContratacao, treinamento, evolucaoMensal } = dados;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Dashboard RH</h1>
          <p className="text-sm text-gray-500 mt-0.5">Indicadores de Recursos Humanos — {anoSel}</p>
        </div>
        <AnoSelector anoSel={anoSel} setAnoSel={setAnoSel} onRecarregar={recarregar} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <CardResumo
          icon={TrendingDown}
          label="Turnover"
          valor={fmtPct(turnover?.taxa)}
          sub={`${turnover?.demissoes ?? 0} desligamentos`}
          cor={turnover?.taxa != null && turnover.taxa < 5 ? "emerald" : turnover?.taxa != null && turnover.taxa < 10 ? "amber" : "red"}
          meta="< 5%"
        />
        <CardResumo
          icon={Heart}
          label="Absentísmo"
          valor={fmtPct(absenteismo?.taxa)}
          sub={`${absenteismo?.diasTotais ?? 0} dias de afastamento`}
          cor={absenteismo?.taxa != null && absenteismo.taxa < 3 ? "emerald" : absenteismo?.taxa != null && absenteismo.taxa < 5 ? "amber" : "red"}
          meta="< 3%"
        />
        <CardResumo
          icon={Shield}
          label="Acidentes"
          valor={acidentes?.totalAcidentes ?? 0}
          sub={`${acidentes?.comAfastamento ?? 0} com afastamento`}
          cor={acidentes?.totalAcidentes === 0 ? "emerald" : acidentes?.totalAcidentes <= 2 ? "amber" : "red"}
          meta="0"
        />
        <CardResumo
          icon={Clock}
          label="Tempo Contratação"
          valor={`${tempoContratacao?.media ?? "—"} dias`}
          sub={`${tempoContratacao?.vagasPreenchidas ?? 0} vagas preenchidas`}
          cor={tempoContratacao?.media != null && tempoContratacao.media < 30 ? "emerald" : tempoContratacao?.media != null && tempoContratacao.media < 45 ? "amber" : "red"}
          meta="< 30 dias"
        />
        <CardResumo
          icon={BookOpen}
          label="Horas Treinamento"
          valor={`${treinamento?.horasPerCapita ?? "—"} h/capita`}
          sub={`${treinamento?.horasTotais ?? 0}h totais`}
          cor="blue"
        />
        <CardResumo
          icon={DollarSign}
          label="Investimento Treinamento"
          valor={fmtMoeda(treinamento?.investimento)}
          sub={`${treinamento?.totalTreinamentos ?? 0} treinamentos`}
          cor="blue"
        />
      </div>

      {/* Quick-view links */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: "/indicadores/rh/turnover", label: "Turnover", icon: TrendingDown },
          { href: "/indicadores/rh/absenteismo", label: "Absentísmo", icon: Heart },
          { href: "/indicadores/rh/acidentes", label: "Acidentes", icon: Shield },
          { href: "/indicadores/rh/treinamento", label: "Treinamento", icon: BookOpen },
          { href: "/indicadores/rh/contratacao", label: "Contratação", icon: Briefcase },
        ].map(({ href, label, icon: Ic }) => (
          <Link
            key={href}
            href={href}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-torg-blue/30 hover:shadow-md transition"
          >
            <Ic size={18} className="text-torg-blue" />
            <span className="text-sm font-medium text-torg-dark">{label}</span>
            <span className="ml-auto text-xs text-torg-blue">→</span>
          </Link>
        ))}
      </div>

      {/* Evolução Mensal */}
      <Section icon={Activity} title="Evolução Mensal" subtitle={`Movimentações de pessoal — ${anoSel}`}>
        {evolucaoMensal && evolucaoMensal.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Mês</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Admissões</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Demissões</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Afastamentos</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Acidentes</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Treinamentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {evolucaoMensal.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-torg-dark font-medium">{MESES[i]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-medium">{m.admissoes ?? 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600 font-medium">{m.demissoes ?? 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{m.afastamentos ?? 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-500">{m.acidentes ?? 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-torg-blue">{m.treinamentos ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum dado mensal disponível.</p>
        )}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 2. TURNOVER (/indicadores/rh/turnover)
// ═══════════════════════════════════════════════════════════════
export function TurnoverClient() {
  const { anoSel, setAnoSel, dados, loading, erro, recarregar } = useIndicadoresRH();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { turnover, evolucaoMensal } = dados;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Turnover</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rotatividade de pessoal — Meta: &lt; 5%</p>
        </div>
        <AnoSelector anoSel={anoSel} setAnoSel={setAnoSel} onRecarregar={recarregar} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardResumo
          icon={TrendingDown}
          label="Taxa"
          valor={fmtPct(turnover?.taxa)}
          sub="turnover anual"
          cor={turnover?.taxa != null && turnover.taxa < 5 ? "emerald" : turnover?.taxa != null && turnover.taxa < 10 ? "amber" : "red"}
        />
        <CardResumo
          icon={UserPlus}
          label="Admissões"
          valor={turnover?.admissoes ?? 0}
          sub="no período"
          cor="emerald"
        />
        <CardResumo
          icon={UserMinus}
          label="Demissões"
          valor={turnover?.demissoes ?? 0}
          sub="no período"
          cor="red"
        />
        <CardResumo
          icon={Users}
          label="Headcount Médio"
          valor={turnover?.headcountMedio ?? "—"}
          sub="colaboradores"
          cor="blue"
        />
      </div>

      {/* Breakdown por tipo de desligamento */}
      <Section icon={TrendingDown} title="Por Tipo de Desligamento" subtitle="Distribuição dos desligamentos">
        {turnover?.tipoDesligamento && turnover.tipoDesligamento.length > 0 ? (
          <div className="space-y-3">
            {turnover.tipoDesligamento.map((t) => {
              const total = turnover.demissoes || 1;
              const pct = (t.count / total) * 100;
              return (
                <PercentageBar
                  key={t.tipo}
                  label={TIPO_DESLIGAMENTO[t.tipo] || t.tipo}
                  valor={t.count}
                  pct={pct}
                  cor={t.tipo === "VOLUNTARIO" ? "bg-amber-500" : t.tipo === "INVOLUNTARIO" ? "bg-red-500" : "bg-torg-blue"}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum desligamento registrado.</p>
        )}
      </Section>

      {/* Breakdown por categoria de desligamento */}
      {turnover?.categoriaDesligamento && turnover.categoriaDesligamento.length > 0 && (
        <Section icon={Activity} title="Por Categoria" subtitle="Motivos de desligamento">
          <div className="space-y-3">
            {turnover.categoriaDesligamento.map((c) => {
              const total = turnover.demissoes || 1;
              const pct = (c.count / total) * 100;
              return (
                <PercentageBar
                  key={c.categoria}
                  label={c.categoria}
                  valor={c.count}
                  pct={pct}
                  cor="bg-torg-blue"
                />
              );
            })}
          </div>
        </Section>
      )}

      {/* Evolução mensal */}
      <Section icon={Activity} title="Evolução Mensal" subtitle="Admissões e demissões por mês">
        {evolucaoMensal && evolucaoMensal.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Mês</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Admissões</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Demissões</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {evolucaoMensal.map((m, i) => {
                  const saldo = (m.admissoes ?? 0) - (m.demissoes ?? 0);
                  return (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-torg-dark font-medium">{MESES[i]}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-medium">{m.admissoes ?? 0}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600 font-medium">{m.demissoes ?? 0}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {saldo >= 0 ? `+${saldo}` : saldo}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum dado mensal disponível.</p>
        )}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 3. ABSENTEISMO (/indicadores/rh/absenteismo)
// ═══════════════════════════════════════════════════════════════
export function AbsenteismoClient() {
  const { anoSel, setAnoSel, dados, loading, erro, recarregar } = useIndicadoresRH();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { absenteismo, evolucaoMensal } = dados;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Absentísmo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Afastamentos e ausências — Meta: &lt; 3%</p>
        </div>
        <AnoSelector anoSel={anoSel} setAnoSel={setAnoSel} onRecarregar={recarregar} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardResumo
          icon={Heart}
          label="Taxa"
          valor={fmtPct(absenteismo?.taxa)}
          sub="absentísmo"
          cor={absenteismo?.taxa != null && absenteismo.taxa < 3 ? "emerald" : absenteismo?.taxa != null && absenteismo.taxa < 5 ? "amber" : "red"}
        />
        <CardResumo
          icon={Calendar}
          label="Dias Totais"
          valor={absenteismo?.diasTotais ?? 0}
          sub="dias de afastamento"
          cor="amber"
        />
        <CardResumo
          icon={Activity}
          label="Em Andamento"
          valor={absenteismo?.emAndamento ?? 0}
          sub="afastamentos ativos"
          cor={absenteismo?.emAndamento > 0 ? "amber" : "emerald"}
        />
        <CardResumo
          icon={Users}
          label="Total Afastamentos"
          valor={absenteismo?.totalAfastamentos ?? 0}
          sub="no período"
          cor="blue"
        />
      </div>

      {/* Breakdown por natureza */}
      <Section icon={Heart} title="Por Natureza" subtitle="Distribuição dos afastamentos">
        {absenteismo?.porNatureza && absenteismo.porNatureza.length > 0 ? (
          <div className="space-y-3">
            {absenteismo.porNatureza.map((n) => {
              const total = absenteismo.totalAfastamentos || 1;
              const pct = (n.count / total) * 100;
              const corMap = {
                FISICO: "bg-blue-500",
                MENTAL: "bg-purple-500",
                ACIDENTE_TRABALHO: "bg-red-500",
                ACIDENTE_TRAJETO: "bg-orange-500",
                MATERNIDADE: "bg-pink-500",
                PATERNIDADE: "bg-torg-blue",
              };
              return (
                <PercentageBar
                  key={n.natureza}
                  label={NATUREZA_AFASTAMENTO[n.natureza] || n.natureza}
                  valor={n.count}
                  pct={pct}
                  cor={corMap[n.natureza] || "bg-gray-400"}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum afastamento registrado.</p>
        )}
      </Section>

      {/* Evolução mensal */}
      <Section icon={Activity} title="Evolução Mensal" subtitle="Afastamentos por mês">
        {evolucaoMensal && evolucaoMensal.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Mês</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Afastamentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {evolucaoMensal.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-torg-dark font-medium">{MESES[i]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-600 font-medium">{m.afastamentos ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum dado mensal disponível.</p>
        )}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 4. ACIDENTES (/indicadores/rh/acidentes)
// ═══════════════════════════════════════════════════════════════
export function AcidentesIndicadorClient() {
  const { anoSel, setAnoSel, dados, loading, erro, recarregar } = useIndicadoresRH();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { acidentes, evolucaoMensal } = dados;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Acidentes de Trabalho</h1>
          <p className="text-sm text-gray-500 mt-0.5">Segurança do trabalho — Meta: 0 acidentes</p>
        </div>
        <AnoSelector anoSel={anoSel} setAnoSel={setAnoSel} onRecarregar={recarregar} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardResumo
          icon={Shield}
          label="Total"
          valor={acidentes?.totalAcidentes ?? 0}
          sub="acidentes registrados"
          cor={acidentes?.totalAcidentes === 0 ? "emerald" : acidentes?.totalAcidentes <= 2 ? "amber" : "red"}
        />
        <CardResumo
          icon={AlertTriangle}
          label="Com Afastamento"
          valor={acidentes?.comAfastamento ?? 0}
          sub="acidentes com afastamento"
          cor={acidentes?.comAfastamento === 0 ? "emerald" : "red"}
        />
        <CardResumo
          icon={Calendar}
          label="Dias Perdidos"
          valor={acidentes?.diasPerdidos ?? 0}
          sub="dias de afastamento"
          cor={acidentes?.diasPerdidos === 0 ? "emerald" : "amber"}
        />
        <CardResumo
          icon={Gauge}
          label="Taxa de Frequência"
          valor={acidentes?.taxaFrequencia != null ? acidentes.taxaFrequencia.toFixed(2) : "—"}
          sub="por milhão HHT"
          cor={acidentes?.taxaFrequencia === 0 ? "emerald" : "amber"}
        />
      </div>

      {/* Breakdown por gravidade */}
      <Section icon={Shield} title="Por Gravidade" subtitle="Classificação dos acidentes">
        {acidentes?.porGravidade && acidentes.porGravidade.length > 0 ? (
          <div className="space-y-3">
            {acidentes.porGravidade.map((g) => {
              const total = acidentes.totalAcidentes || 1;
              const pct = (g.count / total) * 100;
              return (
                <PercentageBar
                  key={g.gravidade}
                  label={GRAVIDADE_LABELS[g.gravidade] || g.gravidade}
                  valor={g.count}
                  pct={pct}
                  cor={GRAVIDADE_CORES[g.gravidade] || "bg-gray-400"}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Shield size={40} className="mx-auto text-emerald-300 mb-3" />
            <p className="text-torg-gray">Nenhum acidente registrado no período.</p>
          </div>
        )}
      </Section>

      {/* Taxas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section icon={Gauge} title="Taxa de Frequência" subtitle="Acidentes por milhão de HHT">
          <div className="flex flex-col items-center justify-center py-6">
            <p className={`text-4xl font-black tabular-nums ${
              acidentes?.taxaFrequencia === 0 ? "text-emerald-600"
              : acidentes?.taxaFrequencia != null && acidentes.taxaFrequencia < 10 ? "text-amber-600"
              : "text-red-600"
            }`}>
              {acidentes?.taxaFrequencia != null ? acidentes.taxaFrequencia.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-torg-gray mt-2">acidentes / 1.000.000 HHT</p>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mt-4 max-w-xs">
              <div
                className={`h-full rounded-full transition-all ${
                  acidentes?.taxaFrequencia === 0 ? "bg-emerald-500"
                  : acidentes?.taxaFrequencia != null && acidentes.taxaFrequencia < 10 ? "bg-amber-500"
                  : "bg-red-500"
                }`}
                style={{ width: `${Math.min((acidentes?.taxaFrequencia || 0) / 20 * 100, 100)}%` }}
              />
            </div>
          </div>
        </Section>

        <Section icon={Gauge} title="Taxa de Gravidade" subtitle="Dias perdidos por milhão de HHT">
          <div className="flex flex-col items-center justify-center py-6">
            <p className={`text-4xl font-black tabular-nums ${
              acidentes?.taxaGravidade === 0 ? "text-emerald-600"
              : acidentes?.taxaGravidade != null && acidentes.taxaGravidade < 50 ? "text-amber-600"
              : "text-red-600"
            }`}>
              {acidentes?.taxaGravidade != null ? acidentes.taxaGravidade.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-torg-gray mt-2">dias perdidos / 1.000.000 HHT</p>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mt-4 max-w-xs">
              <div
                className={`h-full rounded-full transition-all ${
                  acidentes?.taxaGravidade === 0 ? "bg-emerald-500"
                  : acidentes?.taxaGravidade != null && acidentes.taxaGravidade < 50 ? "bg-amber-500"
                  : "bg-red-500"
                }`}
                style={{ width: `${Math.min((acidentes?.taxaGravidade || 0) / 100 * 100, 100)}%` }}
              />
            </div>
          </div>
        </Section>
      </div>

      {/* Evolução mensal */}
      <Section icon={Activity} title="Evolução Mensal" subtitle="Acidentes por mês">
        {evolucaoMensal && evolucaoMensal.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Mês</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Acidentes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {evolucaoMensal.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-torg-dark font-medium">{MESES[i]}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${(m.acidentes ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {m.acidentes ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum dado mensal disponível.</p>
        )}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 5. TREINAMENTO (/indicadores/rh/treinamento)
// ═══════════════════════════════════════════════════════════════
export function TreinamentoIndicadorClient() {
  const { anoSel, setAnoSel, dados, loading, erro, recarregar } = useIndicadoresRH();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { treinamento } = dados;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Treinamento</h1>
          <p className="text-sm text-gray-500 mt-0.5">Capacitação e desenvolvimento</p>
        </div>
        <AnoSelector anoSel={anoSel} setAnoSel={setAnoSel} onRecarregar={recarregar} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardResumo
          icon={BookOpen}
          label="Total Treinamentos"
          valor={treinamento?.totalTreinamentos ?? 0}
          sub="realizados"
          cor="blue"
        />
        <CardResumo
          icon={Clock}
          label="Horas Totais"
          valor={`${treinamento?.horasTotais ?? 0}h`}
          sub="de capacitação"
          cor="blue"
        />
        <CardResumo
          icon={Users}
          label="Horas per Capita"
          valor={`${treinamento?.horasPerCapita ?? "—"} h`}
          sub="por colaborador"
          cor="emerald"
        />
        <CardResumo
          icon={DollarSign}
          label="Investimento"
          valor={fmtMoeda(treinamento?.investimento)}
          sub="total investido"
          cor="amber"
        />
      </div>

      {/* Breakdown por tipo */}
      <Section icon={BookOpen} title="Por Tipo de Treinamento" subtitle="Distribuição por categoria">
        {treinamento?.porTipo && treinamento.porTipo.length > 0 ? (
          <div className="space-y-3">
            {treinamento.porTipo.map((t) => {
              const total = treinamento.totalTreinamentos || 1;
              const pct = (t.count / total) * 100;
              return (
                <PercentageBar
                  key={t.tipo}
                  label={TIPO_TREINAMENTO[t.tipo] || t.tipo}
                  valor={t.count}
                  pct={pct}
                  cor={TIPO_TREINAMENTO_CORES[t.tipo] || "bg-gray-400"}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum treinamento registrado.</p>
        )}
      </Section>

      {/* Investimento per capita */}
      <Section icon={DollarSign} title="Investimento per Capita" subtitle="Investimento médio por colaborador">
        <div className="flex flex-col items-center justify-center py-6">
          <p className="text-4xl font-black text-torg-dark tabular-nums">
            {treinamento?.investimentoPerCapita != null ? fmtMoeda(treinamento.investimentoPerCapita) : "—"}
          </p>
          <p className="text-xs text-torg-gray mt-2">por colaborador</p>
          <div className="grid grid-cols-2 gap-6 mt-6">
            <div className="text-center">
              <p className="text-xl font-bold text-torg-dark tabular-nums">{fmtMoeda(treinamento?.investimento)}</p>
              <p className="text-[10px] text-torg-gray">Investimento total</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-torg-dark tabular-nums">{treinamento?.totalTreinamentos ?? 0}</p>
              <p className="text-[10px] text-torg-gray">Treinamentos realizados</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 6. CONTRATACAO (/indicadores/rh/contratacao)
// ═══════════════════════════════════════════════════════════════
export function ContratacaoClient() {
  const { anoSel, setAnoSel, dados, loading, erro, recarregar } = useIndicadoresRH();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { tempoContratacao, custoRecrutamento } = dados;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Contratação</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tempo e custo de recrutamento — Meta: &lt; 30 dias</p>
        </div>
        <AnoSelector anoSel={anoSel} setAnoSel={setAnoSel} onRecarregar={recarregar} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardResumo
          icon={Clock}
          label="Tempo Médio"
          valor={`${tempoContratacao?.media ?? "—"} dias`}
          sub="para preenchimento"
          cor={tempoContratacao?.media != null && tempoContratacao.media < 30 ? "emerald" : tempoContratacao?.media != null && tempoContratacao.media < 45 ? "amber" : "red"}
        />
        <CardResumo
          icon={UserPlus}
          label="Vagas Preenchidas"
          valor={tempoContratacao?.vagasPreenchidas ?? 0}
          sub="no período"
          cor="emerald"
        />
        <CardResumo
          icon={Briefcase}
          label="Vagas Abertas"
          valor={tempoContratacao?.vagasAbertas ?? 0}
          sub="em andamento"
          cor={tempoContratacao?.vagasAbertas > 0 ? "amber" : "emerald"}
        />
        <CardResumo
          icon={DollarSign}
          label="Custo Médio"
          valor={fmtMoeda(custoRecrutamento?.custoMedio)}
          sub="por contratação"
          cor="blue"
        />
      </div>

      {/* Tabela de vagas preenchidas */}
      <Section icon={Briefcase} title="Vagas Preenchidas" subtitle="Detalhamento por vaga">
        {tempoContratacao?.vagas && tempoContratacao.vagas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Setor</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Dias</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tempoContratacao.vagas.map((v, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-torg-dark font-medium">{v.titulo}</td>
                    <td className="px-4 py-2.5 text-torg-gray text-xs">{v.setor || "—"}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      v.dias < 30 ? "text-emerald-600" : v.dias < 45 ? "text-amber-600" : "text-red-600"
                    }`}>
                      {v.dias}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(v.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Briefcase size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-torg-gray">Nenhuma vaga preenchida no período.</p>
          </div>
        )}
      </Section>

      {/* Breakdown por setor */}
      <Section icon={Target} title="Tempo Médio por Setor" subtitle="Média de dias para preenchimento por setor">
        {tempoContratacao?.porSetor && tempoContratacao.porSetor.length > 0 ? (
          <div className="space-y-3">
            {tempoContratacao.porSetor.map((s) => {
              const maxDias = Math.max(...tempoContratacao.porSetor.map((x) => x.mediaDias || 0), 1);
              const pct = ((s.mediaDias || 0) / maxDias) * 100;
              return (
                <div key={s.setor}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-torg-dark">{s.setor}</span>
                    <span className="text-xs text-torg-gray tabular-nums">
                      {s.mediaDias} dias ({s.count} vaga{s.count !== 1 ? "s" : ""})
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        s.mediaDias < 30 ? "bg-emerald-500" : s.mediaDias < 45 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-torg-gray text-center py-6">Nenhum dado por setor disponível.</p>
        )}
      </Section>
    </div>
  );
}
