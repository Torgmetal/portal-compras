"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Truck, Loader2, AlertCircle, RefreshCw, Package, Calendar,
  CheckCircle2, Clock, AlertTriangle, Search,
  Weight, Ban, Eye,
} from "lucide-react";
import { fmtOP, fmtKg, fmtPesoCompacto, fmtData, fmtPct } from "@/lib/utils";

const STATUS_COR = {
  PLANEJADO: { bg: "bg-blue-100", text: "text-blue-700", label: "Planejado" },
  EM_CARGA: { bg: "bg-amber-100", text: "text-amber-700", label: "Em carga" },
  CONCLUIDO: { bg: "bg-green-100", text: "text-green-700", label: "Concluido" },
  CANCELADO: { bg: "bg-red-100", text: "text-red-700", label: "Cancelado" },
};

export default function ProgramacaoCargasClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState("cargas"); // cargas | ops
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch("/api/expedicao/programacao-cargas");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Erro ao carregar");
      setData(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-torg-blue" />
        <span className="ml-3 text-sm text-torg-gray">Carregando programacao de cargas...</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle size={24} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-600">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 text-sm bg-white border border-red-200 rounded-lg text-red-600 hover:bg-red-50">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { cargas, progressoOPs, alertas } = data;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Truck size={28} className="text-torg-blue" />
            Programacao de Cargas
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Gerencie cargas programadas e garanta que todos os itens sejam enviados para obra.
          </p>
        </div>
        <button
          onClick={carregar}
          className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          icon={Calendar}
          label="Cargas pendentes"
          value={String(alertas.cargasPendentes)}
          cor="bg-torg-blue"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cargas concluidas"
          value={String(alertas.cargasConcluidas)}
          cor="bg-emerald-600"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Pecas esquecidas"
          value={String(alertas.totalEsquecidas)}
          cor={alertas.totalEsquecidas > 0 ? "bg-red-500" : "bg-gray-400"}
        />
        <KpiCard
          icon={Clock}
          label="Cargas vencidas"
          value={String(alertas.cargasVencidas)}
          cor={alertas.cargasVencidas > 0 ? "bg-amber-500" : "bg-gray-400"}
        />
      </div>

      {/* Alertas de pecas esquecidas */}
      {alertas.totalEsquecidas > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <div className="flex items-start gap-3">
            <Ban size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-700">
                {alertas.totalEsquecidas} {alertas.totalEsquecidas === 1 ? "peca pronta" : "pecas prontas"} sem carga programada
              </h4>
              <p className="text-xs text-red-600 mt-0.5">
                Estas pecas ja passaram por Pintura mas nao estao em nenhuma carga. Verifique com a producao.
              </p>
              <div className="mt-3 space-y-2">
                {alertas.pecasEsquecidas.map((alerta) => (
                  <div key={alerta.opId} className="flex items-start gap-2 flex-wrap">
                    <Link
                      href={`/expedicao/checklist`}
                      className="text-xs font-mono font-bold text-red-700 hover:underline flex-shrink-0"
                    >
                      {fmtOP(alerta.opNumero)}
                    </Link>
                    <span className="text-xs text-red-600 flex-shrink-0">
                      {alerta.cliente} — {alerta.pecas.length} {alerta.pecas.length === 1 ? "peca" : "pecas"}:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {alerta.pecas.slice(0, 8).map((p) => (
                        <span key={p.id} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                          {p.marca}
                        </span>
                      ))}
                      {alerta.pecas.length > 8 && (
                        <span className="text-[10px] text-red-500">+{alerta.pecas.length - 8} mais</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cargas vencidas */}
      {alertas.cargasVencidas > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-600" />
            <p className="text-sm text-amber-700 font-medium">
              {alertas.cargasVencidas} {alertas.cargasVencidas === 1 ? "carga" : "cargas"} com data prevista vencida.
              Verifique e reprograme ou conclua.
            </p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setAba("cargas")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === "cargas"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <Truck size={14} className="inline mr-1.5 -mt-0.5" />
          Cargas programadas ({cargas.length})
        </button>
        <button
          onClick={() => setAba("ops")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === "ops"
              ? "border-torg-blue text-torg-blue"
              : "border-transparent text-torg-gray hover:text-torg-dark"
          }`}
        >
          <Package size={14} className="inline mr-1.5 -mt-0.5" />
          Progresso por OP ({progressoOPs.length})
        </button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={aba === "cargas" ? "Buscar por OP, cliente ou obra..." : "Buscar OP..."}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
        />
      </div>

      {/* Conteudo da aba */}
      {aba === "cargas" ? (
        <TabCargas cargas={cargas} busca={busca} />
      ) : (
        <TabProgressoOPs progressoOPs={progressoOPs} busca={busca} />
      )}
    </div>
  );
}

// ─── Tab: Cargas Programadas ──────────────────────────────────

function TabCargas({ cargas, busca }) {
  const filtradas = useMemo(() => {
    if (!busca.trim()) return cargas;
    const q = busca.toLowerCase();
    return cargas.filter(
      (c) =>
        c.opNumero?.toLowerCase().includes(q) ||
        c.cliente?.toLowerCase().includes(q) ||
        c.obra?.toLowerCase().includes(q) ||
        c.descricao?.toLowerCase().includes(q)
    );
  }, [cargas, busca]);

  // Separa por status
  const vencidas = filtradas.filter((c) => c.vencida);
  const planejadas = filtradas.filter((c) => c.status === "PLANEJADO" && !c.vencida);
  const emCarga = filtradas.filter((c) => c.status === "EM_CARGA");
  const concluidas = filtradas.filter((c) => c.status === "CONCLUIDO");
  const canceladas = filtradas.filter((c) => c.status === "CANCELADO");

  if (filtradas.length === 0) {
    return (
      <div className="text-center py-12 text-torg-gray">
        <Truck size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">Nenhuma carga programada.</p>
        <p className="text-xs mt-1">
          Acesse o <Link href="/expedicao/checklist" className="text-torg-blue hover:underline">Checklist</Link> de uma OP para criar cargas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vencidas (destacadas) */}
      {vencidas.length > 0 && (
        <GrupoCarga titulo="Vencidas" cor="text-red-600" cargas={vencidas} destaque="red" />
      )}
      {emCarga.length > 0 && (
        <GrupoCarga titulo="Em carregamento" cor="text-amber-600" cargas={emCarga} destaque="amber" />
      )}
      {planejadas.length > 0 && (
        <GrupoCarga titulo="Proximas cargas" cor="text-torg-blue" cargas={planejadas} />
      )}
      {concluidas.length > 0 && (
        <GrupoCarga titulo="Concluidas" cor="text-green-600" cargas={concluidas} />
      )}
      {canceladas.length > 0 && (
        <GrupoCarga titulo="Canceladas" cor="text-gray-400" cargas={canceladas} />
      )}
    </div>
  );
}

function GrupoCarga({ titulo, cor, cargas, destaque }) {
  const borderMap = { red: "border-l-red-400", amber: "border-l-amber-400" };
  const borderClass = borderMap[destaque] || "border-l-gray-200";

  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${cor}`}>
        {titulo} ({cargas.length})
      </h4>
      <div className="space-y-2">
        {cargas.map((c) => (
          <CargaCard key={c.id} carga={c} borderClass={borderClass} />
        ))}
      </div>
    </div>
  );
}

function CargaCard({ carga, borderClass }) {
  const st = STATUS_COR[carga.status] || STATUS_COR.PLANEJADO;

  return (
    <div className={`bg-white rounded-lg border border-gray-100 shadow-sm ${borderClass} border-l-4 hover:shadow transition-shadow`}>
      <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          {/* Data */}
          <div className="text-center flex-shrink-0 w-14">
            <p className="text-lg font-bold text-torg-dark leading-none">
              {new Date(carga.dataPrevista).getDate()}
            </p>
            <p className="text-[10px] text-torg-gray uppercase">
              {new Date(carga.dataPrevista).toLocaleDateString("pt-BR", { month: "short" })}
            </p>
          </div>

          <div className="border-l border-gray-200 pl-4 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/expedicao/checklist"
                className="font-mono text-sm font-bold text-torg-blue hover:underline whitespace-nowrap"
              >
                {fmtOP(carga.opNumero)}
              </Link>
              <span className="text-xs text-torg-gray truncate max-w-[200px]" title={carga.cliente}>— {carga.cliente}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${st.bg} ${st.text}`}>
                {st.label}
              </span>
              {carga.vencida && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 whitespace-nowrap">
                  <Clock size={10} /> Vencida
                </span>
              )}
            </div>
            {carga.descricao && (
              <p className="text-xs text-torg-gray mt-0.5">{carga.descricao}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-torg-gray flex-wrap">
          <span className="flex items-center gap-1">
            <Package size={12} /> {carga.totalItens} itens
          </span>
          <span className="flex items-center gap-1">
            <Weight size={12} /> {fmtPesoCompacto(carga.pesoEstimadoKg)}
          </span>
          {carga.carregados > 0 && (
            <span className="text-green-600 font-medium">
              {carga.carregados}/{carga.totalItens} carregados
            </span>
          )}
          {carga.naoEnviados > 0 && (
            <span className="text-red-500 font-medium flex items-center gap-1">
              <AlertTriangle size={12} /> {carga.naoEnviados} nao enviados
            </span>
          )}
          {carga.romaneio && (
            <span className="text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} /> Rom. {carga.romaneio.numero}
            </span>
          )}
          <Link
            href="/expedicao/checklist"
            className="text-torg-blue hover:text-torg-blue-700 flex items-center gap-1"
          >
            <Eye size={12} /> Ver
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Progresso por OP ─────────────────────────────────────

function TabProgressoOPs({ progressoOPs, busca }) {
  const filtrados = useMemo(() => {
    if (!busca.trim()) return progressoOPs;
    const q = busca.toLowerCase();
    return progressoOPs.filter(
      (op) =>
        op.numero?.toLowerCase().includes(q) ||
        op.cliente?.toLowerCase().includes(q) ||
        op.obra?.toLowerCase().includes(q)
    );
  }, [progressoOPs, busca]);

  if (filtrados.length === 0) {
    return (
      <div className="text-center py-12 text-torg-gray">
        <Package size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">Nenhuma OP ativa encontrada.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50/60">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">OP</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Cliente / Obra</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Pecas</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase w-48">Progresso</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Peso expedido</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Alertas</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map((op) => {
              const temAlerta = op.pecasProntasSemCarga > 0;
              const temJato = op.pecasJatoSemCarga > 0;
              return (
                <tr
                  key={op.id}
                  className={`hover:bg-gray-50 ${temAlerta ? "bg-red-50/30" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href="/expedicao/checklist"
                      className="font-mono text-sm font-bold text-torg-blue hover:underline"
                    >
                      {fmtOP(op.numero)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-torg-dark truncate max-w-[280px]" title={op.cliente}>{op.cliente}</p>
                    {op.obra && <p className="text-[10px] text-torg-gray truncate max-w-[280px]" title={op.obra}>{op.obra}</p>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-bold text-torg-dark">{op.pecasExpedidas}</span>
                    <span className="text-xs text-torg-gray">/{op.totalPecas}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            op.pctExpedido === 100 ? "bg-green-500" :
                            op.pctExpedido >= 50 ? "bg-torg-blue" :
                            "bg-amber-500"
                          }`}
                          style={{ width: `${Math.min(op.pctExpedido, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-torg-dark w-10 text-right tabular-nums">
                        {fmtPct(op.pctExpedido)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium text-torg-dark">{fmtPesoCompacto(op.pesoExpedidoKg)}</span>
                    <span className="text-[10px] text-torg-gray ml-1">/ {fmtPesoCompacto(op.pesoTotalKg)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {temAlerta && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700"
                          title={`${op.pecasProntasSemCarga} pecas prontas sem carga programada`}
                        >
                          <Ban size={10} /> {op.pecasProntasSemCarga}
                        </span>
                      )}
                      {temJato && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700"
                          title={`${op.pecasJatoSemCarga} pecas em Jato sem carga`}
                        >
                          <AlertTriangle size={10} /> {op.pecasJatoSemCarga}
                        </span>
                      )}
                      {!temAlerta && !temJato && op.pctExpedido < 100 && (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                      {op.pctExpedido === 100 && (
                        <CheckCircle2 size={16} className="text-green-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href="/expedicao/checklist"
                      className="text-xs text-torg-blue hover:underline flex items-center gap-1"
                    >
                      <Eye size={12} /> Checklist
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, cor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${cor} p-2.5 rounded-lg`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-torg-gray">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums">{value}</p>
      </div>
    </div>
  );
}
