"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Loader2, AlertCircle, RefreshCw, Trophy, TrendingUp, TrendingDown,
  Package, Truck, Star, ChevronDown, ChevronUp, Info, Target, Clock,
  AlertTriangle,
} from "lucide-react";

// ─── HELPERS ─────────────────────────────────────────────────
const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtPct = (v) => (v != null ? `${v.toFixed(1)}%` : "—");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const PERIODOS = [
  { id: "mes", label: "Mês atual" },
  { id: "anterior", label: "Mês anterior" },
  { id: "trimestre", label: "Último trimestre" },
  { id: "semestre", label: "Último semestre" },
  { id: "ano", label: "Ano atual" },
  { id: "tudo", label: "Todo o período" },
];

function calcRange(periodoId) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  switch (periodoId) {
    case "mes":
      return { de: fmt(new Date(ano, mes, 1)), ate: fmt(new Date(ano, mes + 1, 0)) };
    case "anterior":
      return { de: fmt(new Date(ano, mes - 1, 1)), ate: fmt(new Date(ano, mes, 0)) };
    case "trimestre":
      return { de: fmt(new Date(ano, mes - 2, 1)), ate: fmt(hoje) };
    case "semestre":
      return { de: fmt(new Date(ano, mes - 5, 1)), ate: fmt(hoje) };
    case "ano":
      return { de: fmt(new Date(ano, 0, 1)), ate: fmt(hoje) };
    case "tudo":
      return { de: "2020-01-01", ate: fmt(hoje) };
    default:
      return { de: fmt(new Date(ano, mes, 1)), ate: fmt(hoje) };
  }
}
function fmt(d) { return d.toISOString().split("T")[0]; }

function corNota(nota) {
  if (nota == null) return "text-gray-400";
  if (nota >= 80) return "text-emerald-600";
  if (nota >= 60) return "text-amber-500";
  return "text-red-500";
}
function bgNota(nota) {
  if (nota == null) return "bg-gray-100";
  if (nota >= 80) return "bg-emerald-50";
  if (nota >= 60) return "bg-amber-50";
  return "bg-red-50";
}

// ─── HOOK de dados ───────────────────────────────────────────
function useIndicadores() {
  const [periodo, setPeriodo] = useState("tudo");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = async (p) => {
    setLoading(true);
    setErro(null);
    try {
      const range = calcRange(p || periodo);
      const res = await fetch(`/api/compras/indicadores?de=${range.de}&ate=${range.ate}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Erro ao carregar indicadores");
      setDados(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [periodo]);

  return { periodo, setPeriodo, dados, loading, erro, recarregar: () => carregar() };
}

// ─── COMPONENTES COMPARTILHADOS ──────────────────────────────

function PeriodoSelector({ periodo, setPeriodo, onRecarregar }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={periodo}
        onChange={(e) => setPeriodo(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
      >
        {PERIODOS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
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
      <span>Carregando indicadores…</span>
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

function CardResumo({ icon: Icon, label, valor, sub, cor, meta }) {
  const cores = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-torg-blue-50 text-torg-blue",
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
          {meta && <p className="text-[10px] text-gray-400 mt-0.5">{meta}</p>}
        </div>
      </div>
    </div>
  );
}

function MiniCard({ label, valor, cor }) {
  const corTexto = cor === "emerald" ? "text-emerald-600" : cor === "red" ? "text-red-600" : "text-torg-dark";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${corTexto}`}>{valor}</p>
    </div>
  );
}

function StatusBadge({ ok }) {
  return (
    <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold ${
      ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"
    }`}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD (página principal /indicadores)
// ═══════════════════════════════════════════════════════════════
export function DashboardClient() {
  const { periodo, setPeriodo, dados, loading, erro, recarregar } = useIndicadores();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { scorecard, savings, otif, atendimento } = dados;
  const atd = atendimento?.resumo || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Dashboard de Indicadores</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão geral do desempenho de compras</p>
        </div>
        <PeriodoSelector periodo={periodo} setPeriodo={setPeriodo} onRecarregar={recarregar} />
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <CardResumo
          icon={Target}
          label="OTIF"
          valor={fmtPct(otif.resumo.pctOTIF)}
          sub={`${otif.resumo.otif}/${otif.resumo.totalPedidos} pedidos`}
          cor={otif.resumo.pctOTIF >= 90 ? "emerald" : otif.resumo.pctOTIF >= 70 ? "amber" : "red"}
          meta={`Meta: ${otif.resumo.meta}%`}
        />
        <CardResumo
          icon={TrendingUp}
          label="Savings"
          valor={fmtMoeda(savings.resumo.totalSavings)}
          sub={`${fmtPct(savings.resumo.pctSavings)} sobre verba`}
          cor={savings.resumo.totalSavings >= 0 ? "emerald" : "red"}
        />
        <CardResumo
          icon={Truck}
          label="On-Time"
          valor={fmtPct(otif.resumo.pctOnTime)}
          sub={`${otif.resumo.onTime}/${otif.resumo.totalPedidos} no prazo`}
          cor={otif.resumo.pctOnTime >= 90 ? "emerald" : otif.resumo.pctOnTime >= 70 ? "amber" : "red"}
        />
        <CardResumo
          icon={Clock}
          label="Lead Time"
          valor={`${atd.mediaRespPedido || 0} dias`}
          sub={`${fmtPct(atd.pctDentroAlvo)} em ≤ ${atd.alvo || 5}d`}
          cor={atd.mediaRespPedido <= 5 ? "emerald" : atd.mediaRespPedido <= 10 ? "amber" : "red"}
          meta={atd.backlogQtd > 0 ? `${atd.backlogQtd} cotações pendentes` : null}
        />
        <CardResumo
          icon={Trophy}
          label="Fornecedores"
          valor={scorecard.fornecedores.length}
          sub="avaliados no período"
          cor="blue"
        />
      </div>

      {/* Top 5 fornecedores */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-torg-dark text-sm">Top Fornecedores</h3>
          <p className="text-xs text-gray-400 mt-0.5">5 melhores do período</p>
        </div>
        {scorecard.fornecedores.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum fornecedor avaliado no período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Nota</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Resposta</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Entrega</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Preço</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {scorecard.fornecedores.slice(0, 5).map((f, idx) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-600">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-torg-dark">{f.nome}</td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${bgNota(f.notaFinal)} ${corNota(f.notaFinal)}`}>
                        {f.notaFinal !== null ? f.notaFinal.toFixed(1) : "—"}
                      </span>
                    </td>
                    <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.resposta.nota)}`}>
                      {f.resposta.nota !== null ? f.resposta.nota.toFixed(0) : "—"}
                    </td>
                    <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.entrega.nota)}`}>
                      {f.entrega.nota !== null ? f.entrega.nota.toFixed(0) : "—"}
                    </td>
                    <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.preco.nota)}`}>
                      {f.preco.nota !== null ? f.preco.nota.toFixed(0) : "—"}
                    </td>
                    <td className="text-center px-3 py-2.5 text-xs text-gray-500">{f.totalPedidos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OTIF resumo visual */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-torg-dark text-sm mb-4">Performance de Entrega</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ProgressoOTIF label="OTIF" valor={otif.resumo.pctOTIF} meta={otif.resumo.meta} detalhe={`${otif.resumo.otif}/${otif.resumo.totalPedidos}`} />
          <ProgressoOTIF label="On-Time" valor={otif.resumo.pctOnTime} meta={otif.resumo.meta} detalhe={`${otif.resumo.onTime}/${otif.resumo.totalPedidos}`} />
          <ProgressoOTIF label="In-Full" valor={otif.resumo.pctInFull} meta={otif.resumo.meta} detalhe={`${otif.resumo.inFull}/${otif.resumo.totalPedidos}`} />
        </div>
      </div>

      {/* Savings resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard label="Verba Total" valor={fmtMoeda(savings.resumo.totalVerba)} />
        <MiniCard label="Total Gasto" valor={fmtMoeda(savings.resumo.totalGasto)} />
        <MiniCard label="Economia Total" valor={fmtMoeda(savings.resumo.totalSavings)} cor={savings.resumo.totalSavings >= 0 ? "emerald" : "red"} />
        <MiniCard label="% Savings" valor={fmtPct(savings.resumo.pctSavings)} cor={savings.resumo.pctSavings >= 0 ? "emerald" : "red"} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SCORECARD FORNECEDORES (/indicadores/scorecard)
// ═══════════════════════════════════════════════════════════════
export function ScorecardClient() {
  const { periodo, setPeriodo, dados, loading, erro, recarregar } = useIndicadores();
  const [expandido, setExpandido] = useState(null);

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { fornecedores } = dados.scorecard;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Scorecard de Fornecedores</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Nota = Resposta (20%) + Entrega (40%) + Qualidade (25%) + Preço (15%)
          </p>
        </div>
        <PeriodoSelector periodo={periodo} setPeriodo={setPeriodo} onRecarregar={recarregar} />
      </div>

      {fornecedores.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <Trophy size={32} className="mx-auto mb-2" />
          <p className="font-medium">Nenhum fornecedor avaliado</p>
          <p className="text-sm mt-1">Cotações com fornecedor cadastrado no período aparecerão aqui.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">{fornecedores.length} fornecedor(es) avaliado(s)</p>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Info size={12} /> Qualidade sem NC = 100%
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Nota Final</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Resposta (20%)</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Entrega (40%)</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Qualidade (25%)</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Preço (15%)</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fornecedores.map((f, idx) => (
                  <ScorecardRow
                    key={f.id}
                    fornecedor={f}
                    posicao={idx + 1}
                    isExpanded={expandido === f.id}
                    onToggle={() => setExpandido(expandido === f.id ? null : f.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorecardRow({ fornecedor: f, posicao, isExpanded, onToggle }) {
  const medalha = posicao === 1 ? "🥇" : posicao === 2 ? "🥈" : posicao === 3 ? "🥉" : posicao;
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 font-medium text-gray-600">{medalha}</td>
        <td className="px-4 py-2.5 font-medium text-torg-dark">{f.nome}</td>
        <td className="text-center px-3 py-2.5">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${bgNota(f.notaFinal)} ${corNota(f.notaFinal)}`}>
            {f.notaFinal !== null ? f.notaFinal.toFixed(1) : "—"}
          </span>
        </td>
        <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.resposta.nota)}`}>
          {f.resposta.nota !== null ? f.resposta.nota.toFixed(0) : "—"}
        </td>
        <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.entrega.nota)}`}>
          {f.entrega.nota !== null ? f.entrega.nota.toFixed(0) : "—"}
        </td>
        <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.qualidade.nota)}`}>
          {f.qualidade.nota !== null ? f.qualidade.nota.toFixed(0) : "—"}
        </td>
        <td className={`text-center px-3 py-2.5 text-xs font-medium ${corNota(f.preco.nota)}`}>
          {f.preco.nota !== null ? f.preco.nota.toFixed(0) : "—"}
        </td>
        <td className="text-center px-3 py-2.5 text-xs text-gray-500">{f.totalPedidos}</td>
        <td className="px-2 py-2.5 text-gray-400">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="px-4 py-3 bg-gray-50/40">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <CriterioDetalhe titulo="Prazo de Resposta" peso="20%" nota={f.resposta.nota}
                detalhes={[`${f.resposta.respondidas} de ${f.resposta.rfqsEnviadas} RFQs respondidas`, `${f.resposta.noPrazo} dentro do prazo`]} />
              <CriterioDetalhe titulo="Entrega no Prazo" peso="40%" nota={f.entrega.nota}
                detalhes={[`${f.entrega.noPrazo} de ${f.entrega.totalEntregues} entregas no prazo`]} />
              <CriterioDetalhe titulo="Qualidade" peso="25%" nota={f.qualidade.nota}
                detalhes={[f.qualidade.obs]} />
              <CriterioDetalhe titulo="Preço/Competitividade" peso="15%" nota={f.preco.nota}
                detalhes={[`${f.preco.itensComparados} itens comparados`]} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CriterioDetalhe({ titulo, peso, nota, detalhes }) {
  return (
    <div className={`rounded-lg p-3 ${bgNota(nota)}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-gray-700">{titulo}</span>
        <span className="text-[10px] text-gray-400">Peso: {peso}</span>
      </div>
      <p className={`text-xl font-bold ${corNota(nota)}`}>{nota !== null ? nota.toFixed(1) : "—"}</p>
      {detalhes.map((d, i) => <p key={i} className="text-gray-500 mt-0.5">{d}</p>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SAVINGS (/indicadores/savings)
// ═══════════════════════════════════════════════════════════════
export function SavingsClient() {
  const { periodo, setPeriodo, dados, loading, erro, recarregar } = useIndicadores();

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { resumo, porObra } = dados.savings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Savings por Obra</h1>
          <p className="text-sm text-gray-500 mt-0.5">Economia sobre verba aprovada — positivo = sobrou, negativo = estourou</p>
        </div>
        <PeriodoSelector periodo={periodo} setPeriodo={setPeriodo} onRecarregar={recarregar} />
      </div>

      {/* Cards consolidados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard label="Verba Total" valor={fmtMoeda(resumo.totalVerba)} />
        <MiniCard label="Total Gasto" valor={fmtMoeda(resumo.totalGasto)} />
        <MiniCard label="Economia Total" valor={fmtMoeda(resumo.totalSavings)} cor={resumo.totalSavings >= 0 ? "emerald" : "red"} />
        <MiniCard label="% Savings" valor={fmtPct(resumo.pctSavings)} cor={resumo.pctSavings >= 0 ? "emerald" : "red"} />
      </div>

      {porObra.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <TrendingUp size={32} className="mx-auto mb-2" />
          <p className="font-medium">Nenhuma obra com verba cadastrada</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Obra</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Verba</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Gasto</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Savings R$</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">%</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {porObra.map((op) => (
                  <tr key={op.opId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-torg-dark">{op.opNumero}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate">{op.cliente}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-[140px] truncate">{op.obra || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                        op.statusObra === "CONCLUIDA" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      }`}>
                        {op.statusObra === "CONCLUIDA" ? "Concluída" : "Em andamento"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmtMoeda(op.verbaDisponivel)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{fmtMoeda(op.totalRealizado)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${op.savingsR$ >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtMoeda(op.savingsR$)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${op.savingsPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtPct(op.savingsPct)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{op.qtdPedidos}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/60 font-semibold">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs uppercase text-gray-500">Total</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmtMoeda(resumo.totalVerba)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmtMoeda(resumo.totalGasto)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${resumo.totalSavings >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtMoeda(resumo.totalSavings)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${resumo.pctSavings >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtPct(resumo.pctSavings)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{resumo.qtdObras}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OTIF (/indicadores/otif)
// ═══════════════════════════════════════════════════════════════
export function OTIFClient() {
  const { periodo, setPeriodo, dados, loading, erro, recarregar } = useIndicadores();
  const [verTodos, setVerTodos] = useState(false);

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { resumo, detalhe } = dados.otif;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">OTIF — On-Time In-Full</h1>
          <p className="text-sm text-gray-500 mt-0.5">Confiabilidade de entrega dos pedidos de compra</p>
        </div>
        <PeriodoSelector periodo={periodo} setPeriodo={setPeriodo} onRecarregar={recarregar} />
      </div>

      {/* Barras de progresso */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ProgressoOTIF label="OTIF (On-Time In-Full)" valor={resumo.pctOTIF} meta={resumo.meta} detalhe={`${resumo.otif} de ${resumo.totalPedidos} pedidos`} />
          <ProgressoOTIF label="On-Time (prazo)" valor={resumo.pctOnTime} meta={resumo.meta} detalhe={`${resumo.onTime} de ${resumo.totalPedidos} no prazo`} />
          <ProgressoOTIF label="In-Full (quantidade)" valor={resumo.pctInFull} meta={resumo.meta} detalhe={`${resumo.inFull} de ${resumo.totalPedidos} completos`} />
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-500">{resumo.totalPedidos} pedidos entregues</p>
          {detalhe.length > 15 && (
            <button onClick={() => setVerTodos(!verTodos)} className="text-xs text-torg-blue hover:underline flex items-center gap-1">
              {verTodos ? "Mostrar menos" : `Ver todos (${detalhe.length})`}
              {verTodos ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
        {detalhe.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <Package size={24} className="mx-auto mb-2" />
            Nenhum pedido entregue no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Pedido</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Prazo Combinado</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500 uppercase">Entrega Real</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">On-Time</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">In-Full</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">OTIF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(verTodos ? detalhe : detalhe.slice(0, 15)).map((p) => (
                  <tr key={p.pedidoId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-torg-dark">{p.numero}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate">{p.fornecedor}</td>
                    <td className="px-4 py-2 text-center text-gray-500 text-xs">{fmtData(p.prazo)}</td>
                    <td className="px-4 py-2 text-center text-gray-500 text-xs">{fmtData(p.entrega)}</td>
                    <td className="px-3 py-2 text-center"><StatusBadge ok={p.isOnTime} /></td>
                    <td className="px-3 py-2 text-center"><StatusBadge ok={p.isInFull} /></td>
                    <td className="px-3 py-2 text-center"><StatusBadge ok={p.isOTIF} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressoOTIF({ label, valor, meta, detalhe }) {
  const cor = valor >= meta ? "bg-emerald-500" : valor >= 70 ? "bg-amber-400" : "bg-red-400";
  const corTexto = valor >= meta ? "text-emerald-600" : valor >= 70 ? "text-amber-600" : "text-red-600";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className={`text-lg font-bold ${corTexto}`}>{fmtPct(valor)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 relative overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${cor}`} style={{ width: `${Math.min(valor, 100)}%` }} />
        <div className="absolute top-0 bottom-0 border-r-2 border-dashed border-gray-500" style={{ left: `${meta}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-gray-400">{detalhe}</span>
        <span className="text-[10px] text-gray-400">Meta: {meta}%</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ATENDIMENTO INTERNO (/indicadores/atendimento)
// ═══════════════════════════════════════════════════════════════
export function AtendimentoClient() {
  const { periodo, setPeriodo, dados, loading, erro, recarregar } = useIndicadores();
  const [verTodos, setVerTodos] = useState(false);
  const [abaAtd, setAbaAtd] = useState("pipeline"); // pipeline | backlog

  if (loading) return <LoadingState />;
  if (erro) return <ErroState erro={erro} onRetry={recarregar} />;

  const { resumo, faixas, detalhe, backlog } = dados.atendimento;
  const totalFaixas = faixas.ate3 + faixas.ate7 + faixas.ate15 + faixas.acima15;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-torg-dark">Atendimento Interno</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tempo entre a resposta do fornecedor e a geração do pedido de compra
          </p>
        </div>
        <PeriodoSelector periodo={periodo} setPeriodo={setPeriodo} onRecarregar={recarregar} />
      </div>

      {/* Cards de lead time */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MiniCard
          label="Lead Time Médio"
          valor={`${resumo.mediaRespPedido} dias úteis`}
          cor={resumo.mediaRespPedido <= 5 ? "emerald" : resumo.mediaRespPedido <= 10 ? "amber" : "red"}
        />
        <MiniCard label="RM → RFQ" valor={`${resumo.mediaRmRfq} dias úteis`} />
        <MiniCard label="Pipeline Total" valor={`${resumo.mediaRmPedido} dias úteis`} />
        <MiniCard
          label={`Dentro do alvo (≤ ${resumo.alvo}d)`}
          valor={fmtPct(resumo.pctDentroAlvo)}
          cor={resumo.pctDentroAlvo >= 80 ? "emerald" : resumo.pctDentroAlvo >= 60 ? "amber" : "red"}
        />
        <MiniCard
          label="Backlog Pendente"
          valor={`${resumo.backlogQtd} cotações`}
          cor={resumo.backlogQtd === 0 ? "emerald" : resumo.backlogQtd <= 5 ? "amber" : "red"}
        />
      </div>

      {/* Distribuição por faixas */}
      {totalFaixas > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-torg-dark text-sm mb-3">Distribuição por Faixa de Tempo</h3>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {faixas.ate3 > 0 && (
              <div className="bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(faixas.ate3 / totalFaixas) * 100}%` }}>
                ≤3d ({faixas.ate3})
              </div>
            )}
            {faixas.ate7 > 0 && (
              <div className="bg-torg-blue flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(faixas.ate7 / totalFaixas) * 100}%` }}>
                4-7d ({faixas.ate7})
              </div>
            )}
            {faixas.ate15 > 0 && (
              <div className="bg-amber-400 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(faixas.ate15 / totalFaixas) * 100}%` }}>
                8-15d ({faixas.ate15})
              </div>
            )}
            {faixas.acima15 > 0 && (
              <div className="bg-red-400 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(faixas.acima15 / totalFaixas) * 100}%` }}>
                &gt;15d ({faixas.acima15})
              </div>
            )}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-gray-400">
            <span>Rápido</span>
            <span>Total: {totalFaixas} cotações processadas</span>
            <span>Lento</span>
          </div>
        </div>
      )}

      {/* Tabs pipeline vs backlog */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setAbaAtd("pipeline")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            abaAtd === "pipeline" ? "bg-white text-torg-dark shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Pipeline concluído ({detalhe.length})
        </button>
        <button
          onClick={() => setAbaAtd("backlog")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 ${
            abaAtd === "backlog" ? "bg-white text-torg-dark shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Backlog pendente ({backlog.length})
          {backlog.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
        </button>
      </div>

      {/* Tabela pipeline concluído */}
      {abaAtd === "pipeline" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">Cotações processadas — resposta do fornecedor até pedido gerado</p>
            {detalhe.length > 15 && (
              <button onClick={() => setVerTodos(!verTodos)} className="text-xs text-torg-blue hover:underline flex items-center gap-1">
                {verTodos ? "Mostrar menos" : `Ver todos (${detalhe.length})`}
              </button>
            )}
          </div>
          {detalhe.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Clock size={24} className="mx-auto mb-2" />
              Nenhuma cotação processada no período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">RM</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">OP</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">RM Criada</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">RFQ Enviada</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Resposta</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Pedido</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">RM→RFQ</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Resp→Pedido</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(verTodos ? detalhe : detalhe.slice(0, 15)).map((d) => {
                    const corLead = d.diasRespPedido <= 3 ? "text-emerald-600" : d.diasRespPedido <= 7 ? "text-torg-blue" : d.diasRespPedido <= 15 ? "text-amber-600" : "text-red-600";
                    return (
                      <tr key={d.cotacaoId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-torg-dark">{d.rmNumero}</td>
                        <td className="px-4 py-2 text-gray-500">{d.opNumero}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-[160px] truncate">{d.fornecedor}</td>
                        <td className="px-3 py-2 text-center text-gray-400 text-xs">{fmtData(d.rmCriada)}</td>
                        <td className="px-3 py-2 text-center text-gray-400 text-xs">{fmtData(d.rfqEnviada)}</td>
                        <td className="px-3 py-2 text-center text-gray-400 text-xs">{fmtData(d.respostaEm)}</td>
                        <td className="px-3 py-2 text-center text-gray-500 text-xs font-medium">{fmtData(d.pedidoEm)}</td>
                        <td className="px-3 py-2 text-center text-gray-500 text-xs">{d.diasRmRfq}d</td>
                        <td className={`px-3 py-2 text-center text-xs font-bold ${corLead}`}>{d.diasRespPedido}d</td>
                        <td className="px-3 py-2 text-center text-gray-600 text-xs font-medium">{d.diasRmPedido}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabela backlog */}
      {abaAtd === "backlog" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-500">
              Cotações respondidas pelo fornecedor que ainda não viraram pedido
            </p>
          </div>
          {backlog.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Clock size={24} className="mx-auto mb-2" />
              Nenhuma cotação pendente — tudo processado!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">RM</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">OP</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Respondeu em</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 uppercase">Dias esperando</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {backlog.map((b) => {
                    const corDias = b.diasEsperando <= 5 ? "text-emerald-600" : b.diasEsperando <= 10 ? "text-amber-600" : "text-red-600";
                    return (
                      <tr key={b.cotacaoId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-torg-dark">{b.rmNumero}</td>
                        <td className="px-4 py-2 text-gray-500">{b.opNumero}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-[180px] truncate">{b.fornecedor}</td>
                        <td className="px-3 py-2 text-center text-gray-500 text-xs">{fmtData(b.respostaEm)}</td>
                        <td className={`px-3 py-2 text-center font-bold text-xs ${corDias}`}>
                          {b.diasEsperando}d úteis
                          {b.diasEsperando > 10 && <AlertTriangle size={11} className="inline ml-1 text-red-400" />}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600 tabular-nums text-xs">{fmtMoeda(b.valorCotacao)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
