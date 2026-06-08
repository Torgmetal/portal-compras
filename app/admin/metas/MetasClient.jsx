"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Target, Save, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, CheckCircle2, Factory, TrendingUp,
  DollarSign, Package, Truck, ShoppingCart, Lock,
} from "lucide-react";

// ─── Configuração dos módulos ───────────────────────────────

const MODULOS = [
  {
    id: "PRODUCAO",
    label: "Produção",
    icon: Factory,
    ativo: true,
    tipos: [{ id: "PESO_KG", label: "Peso", unidade: "t", unidadeLonga: "toneladas", fator: 1000 }],
    setores: [
      { id: "CORTE", label: "Corte", cor: "bg-red-100 text-red-700" },
      { id: "MONTAGEM", label: "Montagem", cor: "bg-blue-100 text-blue-700" },
      { id: "SOLDA", label: "Solda", cor: "bg-orange-100 text-orange-700" },
      { id: "ACABAMENTO", label: "Acabamento", cor: "bg-purple-100 text-purple-700" },
      { id: "JATO", label: "Jato", cor: "bg-cyan-100 text-cyan-700" },
      { id: "PINTURA", label: "Pintura", cor: "bg-green-100 text-green-700" },
      { id: "EXPEDICAO", label: "Expedição", cor: "bg-teal-100 text-teal-700" },
    ],
  },
  { id: "COMERCIAL", label: "Comercial", icon: TrendingUp, ativo: false, tipos: [], setores: [] },
  { id: "FINANCEIRO", label: "Financeiro", icon: DollarSign, ativo: false, tipos: [], setores: [] },
  { id: "EXPEDICAO", label: "Expedição", icon: Truck, ativo: false, tipos: [], setores: [] },
  { id: "COMPRAS", label: "Compras", icon: ShoppingCart, ativo: false, tipos: [], setores: [] },
];

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Formata número compacto: 123.4t ou 0
function fmtValor(v, unidade = "t") {
  if (v == null || v === 0) return "0";
  return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${unidade}`;
}

// ─── Componente principal ───────────────────────────────────

export default function MetasClient() {
  const [moduloId, setModuloId] = useState("PRODUCAO");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [tipoIdx, setTipoIdx] = useState(0);

  // grid[setor][mes] = { valorMensal, semana1..5 } — valores já em unidade de display (ton)
  const [grid, setGrid] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [mesSemanal, setMesSemanal] = useState(null); // mes expandido pra ver semanas

  const modulo = MODULOS.find((m) => m.id === moduloId);
  const tipo = modulo?.tipos?.[tipoIdx];
  const fator = tipo?.fator || 1; // conversão db → display (kg → ton = /1000)
  const unidade = tipo?.unidade || "";

  // ─── Carregar dados ─────────────────────────────────────

  const carregarMetas = useCallback(async () => {
    if (!modulo?.ativo || !tipo) return;
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(
        `/api/admin/metas?modulo=${moduloId}&tipo=${tipo.id}&ano=${ano}`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Monta o grid a partir dos dados do banco
      const g = {};
      for (const setor of modulo.setores) {
        g[setor.id] = {};
        for (let m = 1; m <= 12; m++) {
          g[setor.id][m] = { valorMensal: 0, semana1: null, semana2: null, semana3: null, semana4: null, semana5: null };
        }
      }
      for (const meta of json.metas) {
        if (g[meta.setor]) {
          g[meta.setor][meta.mes] = {
            valorMensal: meta.valorMensal / fator,
            semana1: meta.semana1 != null ? meta.semana1 / fator : null,
            semana2: meta.semana2 != null ? meta.semana2 / fator : null,
            semana3: meta.semana3 != null ? meta.semana3 / fator : null,
            semana4: meta.semana4 != null ? meta.semana4 / fator : null,
            semana5: meta.semana5 != null ? meta.semana5 / fator : null,
          };
        }
      }
      setGrid(g);
      setDirty(false);
    } catch (e) {
      setErro(e.message || "Erro ao carregar metas.");
    } finally {
      setLoading(false);
    }
  }, [moduloId, ano, tipoIdx, modulo, tipo, fator]);

  useEffect(() => {
    carregarMetas();
  }, [carregarMetas]);

  // ─── Handlers ───────────────────────────────────────────

  function atualizarCelula(setorId, mes, valor) {
    setGrid((prev) => ({
      ...prev,
      [setorId]: {
        ...prev[setorId],
        [mes]: { ...prev[setorId][mes], valorMensal: valor },
      },
    }));
    setDirty(true);
    setSucesso("");
  }

  function atualizarSemana(setorId, mes, semanaKey, valor) {
    setGrid((prev) => ({
      ...prev,
      [setorId]: {
        ...prev[setorId],
        [mes]: { ...prev[setorId][mes], [semanaKey]: valor },
      },
    }));
    setDirty(true);
    setSucesso("");
  }

  // Distribui mensal → 4 semanas iguais pro mês selecionado
  function autoDistribuir(mes) {
    setGrid((prev) => {
      const next = { ...prev };
      for (const setor of modulo.setores) {
        const cell = next[setor.id]?.[mes];
        if (!cell) continue;
        const porSemana = cell.valorMensal / 4;
        next[setor.id] = {
          ...next[setor.id],
          [mes]: {
            ...cell,
            semana1: porSemana,
            semana2: porSemana,
            semana3: porSemana,
            semana4: porSemana,
            semana5: null,
          },
        };
      }
      return next;
    });
    setDirty(true);
    setSucesso("");
  }

  // ─── Salvar ─────────────────────────────────────────────

  async function salvar() {
    if (!tipo) return;
    setSaving(true);
    setErro("");
    setSucesso("");
    try {
      // Monta array de metas pra enviar
      const metas = [];
      for (const setor of modulo.setores) {
        for (let m = 1; m <= 12; m++) {
          const cell = grid[setor.id]?.[m];
          if (!cell) continue;
          // Só envia se tem valor > 0 ou se tem semanas configuradas
          const temValor = cell.valorMensal > 0;
          const temSemanas = [cell.semana1, cell.semana2, cell.semana3, cell.semana4, cell.semana5].some((v) => v != null);
          if (!temValor && !temSemanas) continue;

          metas.push({
            setor: setor.id,
            mes: m,
            valorMensal: cell.valorMensal * fator,
            semana1: cell.semana1 != null ? cell.semana1 * fator : null,
            semana2: cell.semana2 != null ? cell.semana2 * fator : null,
            semana3: cell.semana3 != null ? cell.semana3 * fator : null,
            semana4: cell.semana4 != null ? cell.semana4 * fator : null,
            semana5: cell.semana5 != null ? cell.semana5 * fator : null,
          });
        }
      }

      if (metas.length === 0) {
        setSucesso("Nenhuma meta para salvar.");
        setDirty(false);
        return;
      }

      const res = await fetch("/api/admin/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulo: moduloId, tipo: tipo.id, ano, metas }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setSucesso(`${json.count} metas salvas com sucesso.`);
      setDirty(false);
    } catch (e) {
      setErro(e.message || "Erro ao salvar metas.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Totais calculados ──────────────────────────────────

  const totais = useMemo(() => {
    const porSetor = {};

    for (const setor of modulo?.setores || []) {
      porSetor[setor.id] = 0;
      for (let m = 1; m <= 12; m++) {
        const val = grid[setor.id]?.[m]?.valorMensal || 0;
        porSetor[setor.id] += val;
      }
    }
    return { porSetor };
  }, [grid, modulo]);

  // ─── Render ─────────────────────────────────────────────

  if (!modulo) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Target size={24} className="text-torg-blue" />
            Metas e Objetivos
          </h1>
          <p className="text-sm text-torg-gray mt-1">
            Defina as metas mensais por setor. As semanas são distribuídas automaticamente.
          </p>
        </div>

        {/* Ano */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAno((a) => a - 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-torg-gray"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-lg font-bold text-torg-dark min-w-[4rem] text-center">{ano}</span>
          <button
            onClick={() => setAno((a) => a + 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-torg-gray"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Tabs de módulo */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {MODULOS.map((m) => {
          const Icon = m.icon;
          const active = m.id === moduloId;
          return (
            <button
              key={m.id}
              onClick={() => m.ativo && setModuloId(m.id)}
              disabled={!m.ativo}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-torg-blue text-torg-blue"
                  : m.ativo
                  ? "border-transparent text-torg-gray hover:text-torg-dark hover:border-gray-300"
                  : "border-transparent text-gray-300 cursor-not-allowed"
              }`}
            >
              <Icon size={16} />
              {m.label}
              {!m.ativo && (
                <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Lock size={10} />
                  Em breve
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo do módulo */}
      {!modulo.ativo ? (
        <div className="text-center py-16 text-torg-gray">
          <Lock size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Metas de {modulo.label} em desenvolvimento.</p>
          <p className="text-sm mt-1">Disponível em breve.</p>
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-torg-gray">
          <Loader2 size={28} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Carregando metas...</p>
        </div>
      ) : (
        <>
          {/* Mensagens */}
          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}
          {sucesso && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
              <span>{sucesso}</span>
            </div>
          )}

          {/* Tipo de meta (badge) */}
          {tipo && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-torg-gray">Tipo:</span>
              <span className="bg-torg-blue-50 text-torg-blue px-3 py-1 rounded-full text-sm font-medium">
                {tipo.label} ({tipo.unidadeLonga})
              </span>
            </div>
          )}

          {/* Grid mensal */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60">
                    <th className="text-left px-4 py-3 font-semibold text-torg-dark whitespace-nowrap sticky left-0 bg-gray-50/60 z-10 min-w-[140px]">
                      Setor
                    </th>
                    {MESES.map((m, i) => (
                      <th key={m} className="px-2 py-3 font-semibold text-torg-dark text-center min-w-[80px]">
                        <button
                          onClick={() => setMesSemanal(mesSemanal === i + 1 ? null : i + 1)}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            mesSemanal === i + 1
                              ? "bg-torg-blue text-white"
                              : "hover:bg-torg-blue-50 hover:text-torg-blue"
                          }`}
                          title={`Clique para ver semanas de ${MESES_FULL[i]}`}
                        >
                          {m}
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold text-torg-dark text-center min-w-[90px] bg-torg-blue-50/50">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {modulo.setores.map((setor) => (
                    <tr key={setor.id} className="hover:bg-gray-50/30">
                      <td className="px-4 py-2 sticky left-0 bg-white z-10">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${setor.cor}`}>
                          {setor.label}
                        </span>
                      </td>
                      {MESES.map((_, i) => {
                        const mes = i + 1;
                        const val = grid[setor.id]?.[mes]?.valorMensal || 0;
                        return (
                          <td key={mes} className="px-1 py-1.5 text-center">
                            <input
                              type="number"
                              value={val || ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                if (!isNaN(v)) atualizarCelula(setor.id, mes, v);
                              }}
                              placeholder="0"
                              step="0.1"
                              min="0"
                              className="w-full max-w-[72px] mx-auto text-center border border-gray-200 rounded-md px-1 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent hover:border-gray-300 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-center font-semibold text-torg-dark bg-torg-blue-50/30 whitespace-nowrap">
                        {fmtValor(totais.porSetor[setor.id], unidade)}
                      </td>
                    </tr>
                  ))}
                  {/* Nota: não soma setores entre si — são etapas sequenciais do mesmo material */}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalhamento semanal */}
          {mesSemanal && (
            <SemanalDetail
              modulo={modulo}
              grid={grid}
              mes={mesSemanal}
              unidade={unidade}
              onUpdate={atualizarSemana}
              onAutoDistribuir={() => autoDistribuir(mesSemanal)}
              onClose={() => setMesSemanal(null)}
            />
          )}

          {/* Botão salvar */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-torg-gray">
              Valores em {tipo?.unidadeLonga || "unidades"}. Clique no nome do mês para ver/editar semanas.
            </p>
            <button
              onClick={salvar}
              disabled={saving || !dirty}
              className="flex items-center gap-2 px-6 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "Salvando..." : dirty ? "Salvar alterações" : "Salvo"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente de detalhamento semanal ─────────────────────

function SemanalDetail({ modulo, grid, mes, unidade, onUpdate, onAutoDistribuir, onClose }) {
  const mesLabel = MESES_FULL[mes - 1];

  // Calcula se as semanas somam o mensal
  function somaSemanas(setorId) {
    const cell = grid[setorId]?.[mes];
    if (!cell) return 0;
    return [cell.semana1, cell.semana2, cell.semana3, cell.semana4, cell.semana5]
      .filter((v) => v != null)
      .reduce((a, b) => a + b, 0);
  }

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-torg-blue-50/50 border-b border-torg-blue-100">
        <div className="flex items-center gap-2">
          <ChevronDown size={16} className="text-torg-blue" />
          <h3 className="font-semibold text-torg-dark">
            Semanas de {mesLabel}
          </h3>
          <span className="text-xs text-torg-gray">(distribuição semanal da meta mensal)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAutoDistribuir}
            className="text-xs bg-torg-blue-50 text-torg-blue px-3 py-1.5 rounded-lg hover:bg-torg-blue-100 font-medium transition-colors"
          >
            Auto-distribuir (÷4)
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-torg-gray">
            <ChevronUp size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/40">
              <th className="text-left px-4 py-2.5 font-medium text-torg-gray min-w-[140px]">Setor</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center">Meta mensal</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center">Sem 1</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center">Sem 2</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center">Sem 3</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center">Sem 4</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center">Sem 5</th>
              <th className="px-4 py-2.5 font-medium text-torg-gray text-center">Soma sem.</th>
              <th className="px-2 py-2.5 font-medium text-torg-gray text-center min-w-[60px]">OK</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {modulo.setores.map((setor) => {
              const cell = grid[setor.id]?.[mes] || {};
              const mensal = cell.valorMensal || 0;
              const soma = somaSemanas(setor.id);
              const match = mensal > 0 && Math.abs(soma - mensal) < 0.01;
              const temSemanas = [cell.semana1, cell.semana2, cell.semana3, cell.semana4, cell.semana5].some((v) => v != null);

              return (
                <tr key={setor.id} className="hover:bg-gray-50/30">
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${setor.cor}`}>
                      {setor.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center font-semibold text-torg-dark whitespace-nowrap">
                    {fmtValor(mensal, unidade)}
                  </td>
                  {["semana1", "semana2", "semana3", "semana4", "semana5"].map((key) => (
                    <td key={key} className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        value={cell[key] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : parseFloat(e.target.value);
                          onUpdate(setor.id, mes, key, isNaN(v) ? null : v);
                        }}
                        placeholder={mensal > 0 ? (mensal / 4).toFixed(1) : "—"}
                        step="0.1"
                        min="0"
                        className="w-full max-w-[72px] mx-auto text-center border border-gray-200 rounded-md px-1 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent hover:border-gray-300 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-medium text-torg-gray whitespace-nowrap">
                    {temSemanas ? fmtValor(soma, unidade) : "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {temSemanas && mensal > 0 ? (
                      match ? (
                        <CheckCircle2 size={16} className="text-green-500 mx-auto" />
                      ) : (
                        <AlertCircle size={16} className="text-amber-500 mx-auto" title="Soma das semanas difere da meta mensal" />
                      )
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2.5 bg-gray-50/40 border-t border-gray-100">
        <p className="text-xs text-torg-gray">
          Placeholder mostra a distribuição automática (meta ÷ 4). Preencha para sobrescrever.
        </p>
      </div>
    </div>
  );
}
