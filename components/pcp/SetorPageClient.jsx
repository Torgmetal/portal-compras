"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, AlertCircle, RefreshCw, Weight, Package,
  Users, TrendingUp, Search, Cpu,
  Wrench, Flame, Wind, Paintbrush, Scissors, Sparkles,
} from "lucide-react";

const ICON_MAP = { Wrench, Flame, Wind, Paintbrush, Cpu, Scissors, Sparkles };
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { corSetor } from "@/lib/setores";
import { fmtKg } from "@/lib/utils";

const fmtDataHora = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

/**
 * Componente reutilizável pra todas as páginas de setor.
 * @param {{ setor: string, titulo: string, iconName: string, corHex: string }} props
 */
export default function SetorPageClient({ setor, titulo, iconName, corHex }) {
  const Icon = ICON_MAP[iconName] || Cpu;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");
  const [filtroMaquina, setFiltroMaquina] = useState(""); // "" = todas
  const [dias, setDias] = useState(7);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/pcp/setor?setor=${encodeURIComponent(setor)}&dias=${dias}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setData(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [setor, dias]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin text-torg-blue" />
        <span className="ml-3 text-sm text-torg-gray">Carregando dados de {titulo}...</span>
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

  const { kgHoje, kgDiario, produzindoAgora, operadores, maquinas, pecasNoSetor, apontamentos } = data;
  const emProducaoAgora = data.emProducaoAgora || [];
  const produzidoHoje = data.produzidoHoje || [];

  const ehCorte = setor === "Corte";
  const labelAgora = ehCorte ? "Em corte agora" : "Em produção agora";
  const labelHoje = ehCorte ? "Cortado hoje" : "Produzido hoje";

  // Seletor de máquinas — união de todas as fontes, com kg de hoje por máquina
  const kgHojeMaq = new Map();
  for (const a of produzidoHoje) {
    if (!a.maquina) continue;
    kgHojeMaq.set(a.maquina, (kgHojeMaq.get(a.maquina) || 0) + (a.produzidoKg || 0));
  }
  const listaMaquinas = [...new Set([
    ...produzindoAgora.map((m) => m.maquina),
    ...emProducaoAgora.map((m) => m.maquina),
    ...produzidoHoje.map((m) => m.maquina),
    ...apontamentos.map((a) => a.maquina),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const byMaquina = (x) => !filtroMaquina || x.maquina === filtroMaquina;

  const emProducaoFiltrado = emProducaoAgora.filter(byMaquina);
  const hojeFiltrado = produzidoHoje.filter(byMaquina);
  const bancadasFiltradas = produzindoAgora.filter(byMaquina);
  const totalHojeUn = hojeFiltrado.reduce((s, a) => s + (a.produzidoUn || 0), 0);
  const totalHojeKg = hojeFiltrado.reduce((s, a) => s + (a.produzidoKg || 0), 0);

  // Filtra apontamentos pelo texto + máquina
  const apontFiltrados = apontamentos.filter((a) => {
    if (!byMaquina(a)) return false;
    if (!filtro) return true;
    const q = filtro.toLowerCase();
    return (
      (a.obra || "").toLowerCase().includes(q) ||
      (a.opSka || "").toLowerCase().includes(q) ||
      (a.maquina || "").toLowerCase().includes(q) ||
      (a.operador || "").toLowerCase().includes(q) ||
      (a.descricaoItem || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Icon size={28} style={{ color: corHex }} />
            {titulo}
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Acompanhamento do setor com dados do Syneco.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value={3}>3 dias</option>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </select>
          <button
            onClick={carregar}
            className="px-4 py-2 bg-white border border-torg-blue-200 text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon={Weight} label="KG hoje" value={fmtKg(kgHoje)} cor={corHex} />
        <KpiCard
          icon={TrendingUp}
          label={`KG ${dias}d`}
          value={fmtKg(kgDiario.reduce((s, d) => s + d.kg, 0))}
          cor={corHex}
        />
        <KpiCard icon={Cpu} label="Bancadas" value={produzindoAgora.length} cor={corHex} />
        <KpiCard icon={Package} label="Peças no setor" value={pecasNoSetor.length} cor={corHex} />
      </div>

      {/* Seletor de máquinas — filtra as seções abaixo */}
      {listaMaquinas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-1.5 flex-wrap">
          <Cpu size={14} className="text-torg-gray mr-1" />
          <button
            onClick={() => setFiltroMaquina("")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              !filtroMaquina ? "text-white" : "bg-gray-100 text-torg-gray hover:bg-gray-200"
            }`}
            style={!filtroMaquina ? { background: corHex } : undefined}
          >
            Todas as máquinas
          </button>
          {listaMaquinas.map((m) => {
            const kg = kgHojeMaq.get(m) || 0;
            const ativa = filtroMaquina === m;
            return (
              <button
                key={m}
                onClick={() => setFiltroMaquina(ativa ? "" : m)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  ativa ? "text-white" : "bg-gray-100 text-torg-gray hover:bg-gray-200"
                }`}
                style={ativa ? { background: corHex } : undefined}
                title={kg > 0 ? `${fmtKg(kg)} hoje` : "Sem produção hoje"}
              >
                {m}{kg > 0 && <span className={ativa ? "opacity-80" : "text-torg-dark"}> · {fmtKg(kg)}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Em produção AGORA (status Produzindo no Syneco) */}
      {emProducaoFiltrado.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-green-100 bg-green-50/50 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h3 className="text-base font-semibold text-torg-dark">{labelAgora} ({emProducaoFiltrado.length})</h3>
            <span className="text-xs text-torg-gray ml-auto">status “Produzindo” no Syneco</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Máquina</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Peça</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Obra / OP</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Operador</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Prod. / Plan.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Saldo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {emProducaoFiltrado.map((a) => (
                  <tr key={a.id} className="hover:bg-green-50/30">
                    <td className="px-3 py-2 text-xs font-mono font-bold" style={{ color: corHex }}>{a.maquina || "—"}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark max-w-[220px] truncate" title={a.descricaoItem || ""}>{a.descricaoItem || "—"}</td>
                    <td className="px-3 py-2 text-xs font-medium text-torg-blue whitespace-nowrap">{a.obra || "—"}{a.opSka ? ` · ${a.opSka}` : ""}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark">{a.operador || "—"}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{a.produzidoUn} / {a.planejadoUn}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{a.saldoUn}</td>
                    <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">{fmtDataHora(a.dataInicio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Produzido / cortado HOJE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-torg-dark">{labelHoje}{filtroMaquina ? ` — ${filtroMaquina}` : ""}</h3>
          <span className="text-xs text-torg-gray">
            <strong className="text-torg-dark">{totalHojeUn.toLocaleString("pt-BR")}</strong> un ·{" "}
            <strong className="text-torg-dark">{fmtKg(totalHojeKg)}</strong>
            {hojeFiltrado.length > 0 && <> · {hojeFiltrado.length} apontamento{hojeFiltrado.length !== 1 ? "s" : ""}</>}
          </span>
        </div>
        {hojeFiltrado.length === 0 ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center">
            Nada finalizado hoje{filtroMaquina ? ` na ${filtroMaquina}` : ""} até agora.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm min-w-[750px]">
              <thead className="bg-gray-50/60 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Hora</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Máquina</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Peça</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Obra / OP</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Operador</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Un</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">KG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {hojeFiltrado.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap tabular-nums">
                      {a.dataFim ? new Date(a.dataFim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-torg-gray whitespace-nowrap">{a.maquina || "—"}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark max-w-[220px] truncate" title={a.descricaoItem || ""}>{a.descricaoItem || "—"}</td>
                    <td className="px-3 py-2 text-xs font-medium text-torg-blue whitespace-nowrap">{a.obra || "—"}{a.opSka ? ` · ${a.opSka}` : ""}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark">{a.operador || "—"}</td>
                    <td className="px-3 py-2 text-xs"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{a.produzidoUn || "—"}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">{fmtKg(a.produzidoKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bancadas / Máquinas do setor */}
      {bancadasFiltradas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            <Cpu size={16} style={{ color: corHex }} />
            <h3 className="text-base font-semibold text-torg-dark">Bancadas — {titulo}</h3>
            <span className="ml-auto flex items-center gap-2 text-xs flex-wrap">
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {bancadasFiltradas.filter((m) => m.status === "Finalizada Parcial").length} em andamento
              </span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                {bancadasFiltradas.filter((m) => m.status === "Finalizado" || m.status === "Finalizado Total").length} finalizadas
              </span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
            {bancadasFiltradas.map((m, i) => {
              const isProduzindo = m.status === "Produzindo";
              return (
                <div
                  key={i}
                  className={`border rounded-lg p-3 transition-colors ${
                    isProduzindo
                      ? "border-green-300 bg-green-50/40 ring-1 ring-green-200"
                      : "border-gray-100 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-bold" style={{ color: corHex }}>
                      {m.maquina || m.codigoMaquina || "—"}
                    </span>
                    <MaquinaStatusBadge status={m.status} />
                  </div>
                  <div className="space-y-0.5 text-xs text-torg-gray">
                    <p>OP: <span className="font-medium text-torg-blue">{m.obra || "—"}</span></p>
                    <p>Peça: <span className="text-torg-dark">{m.descricaoItem || m.opSka || "—"}</span></p>
                    <p>Operador: <span className="text-torg-dark">{m.operador || "—"}</span></p>
                    <p>Último registro: <span className="text-torg-dark">{fmtDataHora(m.dataInicio)}</span></p>
                    <p className="pt-1">
                      <span className="font-medium text-torg-dark text-sm">{fmtKg(m.produzidoKg)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gráficos lado a lado: KG diário + Operadores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* KG diário */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-torg-dark mb-4">KG por dia</h3>
          {kgDiario.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kgDiario} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => { const d = new Date(v + "T12:00:00"); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}t`} />
                <Tooltip
                  labelFormatter={(v) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR")}
                  formatter={(v) => [fmtKg(v), "Produzido"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="kg" fill={corHex} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-torg-gray text-center py-8">Sem dados no período.</p>
          )}
        </div>

        {/* Operadores */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-torg-gray" />
            <h3 className="text-sm font-semibold text-torg-dark">Operadores ({operadores.length})</h3>
          </div>
          {operadores.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {operadores.slice(0, 15).map((op) => (
                <div key={op.nome} className="flex items-center gap-3 text-xs">
                  <span className="text-torg-dark flex-1 truncate">{op.nome}</span>
                  <span className="text-torg-gray tabular-nums">{op.apontamentos} apt.</span>
                  <span className="font-medium text-torg-dark tabular-nums w-24 text-right">{fmtKg(op.kg)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-torg-gray text-center py-8">Sem operadores no período.</p>
          )}
        </div>
      </div>

      {/* Peças no setor */}
      {pecasNoSetor.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-torg-dark">Peças no setor ({pecasNoSetor.length})</h3>
            <p className="text-xs text-torg-gray mt-0.5">Peças com status correspondente a este setor.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">OP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Marca</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Qtd</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Peso (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pecasNoSetor.slice(0, 50).map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-torg-blue font-medium">{p.opNumero}</td>
                    <td className="px-4 py-2 font-mono text-xs text-torg-dark">{p.marca}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray max-w-[250px] truncate" title={p.descricao || ""}>{p.descricao || "—"}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums">{p.qte}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums font-medium">{fmtKg(p.pesoTotalKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apontamentos recentes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-base font-semibold text-torg-dark">Apontamentos recentes</h3>
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar OP, peça, operador..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue"
            />
          </div>
        </div>
        {apontFiltrados.length === 0 ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center">Nenhum apontamento encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[750px]">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Data</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">OP</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Peça</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Máquina</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Operador</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">KG</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Un</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {apontFiltrados.slice(0, 100).map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">{fmtDataHora(a.dataInicio)}</td>
                    <td className="px-3 py-2 text-xs font-medium text-torg-blue">{a.obra || "—"}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark max-w-[200px] truncate" title={a.descricaoItem || a.opSka || ""}>{a.descricaoItem || a.opSka || "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono text-torg-gray">{a.maquina || "—"}</td>
                    <td className="px-3 py-2 text-xs text-torg-dark">{a.operador || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{fmtKg(a.produzidoKg)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{a.produzidoUn || "—"}</td>
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

function KpiCard({ icon: Icon, label, value, cor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className="p-2.5 rounded-lg" style={{ background: cor }}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-torg-gray">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "Finalizado":         "bg-green-50 text-green-700",
    "Finalizado Total":   "bg-green-50 text-green-700",
    "Finalizada Parcial": "bg-yellow-50 text-yellow-700",
    "Produzindo":         "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${map[status] || "bg-gray-50 text-gray-600"}`}>
      {status || "—"}
    </span>
  );
}

function MaquinaStatusBadge({ status }) {
  const cfg = {
    Produzindo:           { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500 animate-pulse", label: "Produzindo" },
    Finalizado:           { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400",             label: "Finalizado" },
    "Finalizado Total":   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400",             label: "Finalizado" },
    "Finalizada Parcial": { bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-500",               label: "Parcial" },
    "Não Inicializada":   { bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-300",                label: "Não iniciada" },
  };
  const c = cfg[status] || { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", label: status || "—" };
  const ativa = status === "Produzindo" || status === "Finalizada Parcial";
  return (
    <span className={`text-[10px] ${c.bg} ${c.text} px-1.5 py-0.5 rounded font-medium flex items-center gap-1`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${ativa ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}
