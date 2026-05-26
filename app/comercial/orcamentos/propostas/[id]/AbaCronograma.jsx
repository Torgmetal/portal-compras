"use client";
import { useState } from "react";
import {
  Plus, Trash2, Loader2, X, Edit3, Check, Sparkles, RefreshCw,
  Calendar, Users,
} from "lucide-react";

// ── Cores padrao para as barras ──
const CORES_PADRAO = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

const HORAS_DIA = 8.5;
const DIAS_SEMANA = 5;

// ── Grupos sugeridos por tipo de material ──
const GRUPOS_SUGERIDOS = [
  { id: "COLUNAS", label: "Colunas", tipos: ["PERFIL_W"], setores: ["coluna", "pilar"] },
  { id: "VIGAS", label: "Vigas Principais", tipos: ["PERFIL_W"], setores: ["viga"] },
  { id: "TERCAS", label: "Tercas / Longarinas", tipos: ["PERFIL_U"], setores: ["terca", "longarina"] },
  { id: "CONTRAV", label: "Contraventamentos", tipos: ["PERFIL_L", "BARRA_REDONDA"], setores: ["contrav", "tirante", "diagonal"] },
  { id: "CHAPARIA", label: "Chaparia / Ligacoes", tipos: ["CHAPA"], setores: ["chapa", "ligacao", "tala"] },
  { id: "TUBOS", label: "Tubulacao / Tubos", tipos: ["TUBO_REDONDO", "TUBO_QUADRADO", "TUBO_RETANGULAR"], setores: ["tubo"] },
  { id: "GUARDA_CORPO", label: "Guarda-corpo / Escadas", tipos: ["BARRA_CHATA", "BARRA_QUADRADA"], setores: ["guarda", "escada", "corrimao"] },
  { id: "GRADES", label: "Grades / Pisos", tipos: ["GRADE_PISO", "DEGRAU", "TELA"], setores: ["grade", "piso", "degrau", "passarela"] },
  { id: "DIVERSOS", label: "Diversos", tipos: ["OUTRO", "BARRA_ROSCADA"], setores: [] },
];

function fmtNum(v, dec = 0) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPeso(v) {
  if (!v) return "—";
  if (v >= 1000) return `${fmtNum(v / 1000, 1)} ton`;
  return `${fmtNum(v, 0)} kg`;
}

/**
 * Prazos fixos de Projeto e Compra conforme porte da obra.
 * Até 100 ton: 25d projeto, 15d compra
 * 100–300 ton: 35d projeto, 25d compra
 * Acima 300 ton: 45d projeto, 35d compra
 */
function getPrazosPreFab(pesoTotalTon) {
  if (pesoTotalTon <= 100) return { projetoDias: 25, compraDias: 15 };
  if (pesoTotalTon <= 300) return { projetoDias: 35, compraDias: 25 };
  return { projetoDias: 45, compraDias: 35 };
}

/**
 * Calcula dias uteis de fabricacao.
 * equipe = quantidade de pessoas alocadas ao projeto (nao a fabrica inteira).
 */
function calcDias(pesoKg, hhPorTon, equipe) {
  if (!pesoKg || !hhPorTon || !equipe) return 0;
  const hhTotal = (pesoKg / 1000) * hhPorTon;
  const dias = hhTotal / (HORAS_DIA * equipe);
  return Math.max(1, Math.ceil(dias));
}

// ── Componente principal ──
export default function AbaCronograma({ estudo, estudoId }) {
  const [itens, setItens] = useState(estudo.itensCronograma || []);
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [excluindoId, setExcluindoId] = useState(null);
  const [showNovoForm, setShowNovoForm] = useState(false);
  const [novoItem, setNovoItem] = useState({ grupo: "", pesoKg: "", diasFabricacao: "", diasMontagem: "", semanaInicio: 1, cor: CORES_PADRAO[0] });
  const [adicionando, setAdicionando] = useState(false);
  const [equipe, setEquipe] = useState(8);
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const hhPorTon = estudo.hhPorTon || 0;

  // ══════════════════════════════════════════════════════════
  // TOTAIS
  // ══════════════════════════════════════════════════════════
  const pesoTotalCrono = itens.reduce((s, i) => s + (i.pesoKg || 0), 0);
  const pesoTotalTon = pesoTotalCrono / 1000;
  const prazosPreFab = getPrazosPreFab(pesoTotalTon || (estudo.pesoTotal || 0) / 1000);

  // Ultima semana ocupada
  const ultimaSemana = itens.reduce((max, item) => {
    const semFab = Math.ceil((item.diasFabricacao || 0) / DIAS_SEMANA) || 0;
    const semMont = Math.ceil((item.diasMontagem || 0) / DIAS_SEMANA) || 0;
    const fim = (item.semanaInicio || 1) + semFab + semMont - 1;
    return Math.max(max, fim);
  }, 0);
  const semanasVisiveis = Math.max(ultimaSemana + 2, 8);

  // ══════════════════════════════════════════════════════════
  // GERAR AUTOMATICAMENTE
  // ══════════════════════════════════════════════════════════
  const handleGerarAutomatico = async () => {
    const itensPerso = estudo.itensPerso || [];
    if (itensPerso.length === 0) { showToast("Nenhum material cadastrado na aba Materiais"); return; }
    if (!hhPorTon) { showToast("Defina Hh/ton na aba Produtividade primeiro"); return; }

    setLoading(true);
    try {
      // Agrupar por setor ou tipo de material
      const grupos = {};
      for (const item of itensPerso) {
        const setor = (item.setor || "").toLowerCase();
        const tipo = item.tipoMaterial || "OUTRO";
        let grupoId = null;
        for (const gs of GRUPOS_SUGERIDOS) {
          if (gs.setores.some((s) => setor.includes(s))) { grupoId = gs.id; break; }
        }
        if (!grupoId) {
          for (const gs of GRUPOS_SUGERIDOS) {
            if (gs.tipos.includes(tipo)) { grupoId = gs.id; break; }
          }
        }
        if (!grupoId) grupoId = "DIVERSOS";
        if (!grupos[grupoId]) grupos[grupoId] = { pesoKg: 0, itens: 0 };
        grupos[grupoId].pesoKg += item.pesoTotal || 0;
        grupos[grupoId].itens++;
      }

      // Calcular peso total para definir prazos de Projeto e Compra
      const pesoTotalMat = Object.values(grupos).reduce((s, g) => s + g.pesoKg, 0);
      const { projetoDias, compraDias } = getPrazosPreFab(pesoTotalMat / 1000);

      const cronogramaItens = [];

      // Fase 1 — Projeto / Engenharia
      cronogramaItens.push({
        grupo: "Projeto / Engenharia",
        descricao: `Detalhamento e aprovação · ${fmtPeso(pesoTotalMat)} total`,
        pesoKg: 0,
        diasFabricacao: projetoDias,
        semanaInicio: 1,
        cor: "#7C3AED",
      });

      // Fase 2 — Compra de materiais
      const compraSemana = Math.ceil(projetoDias / DIAS_SEMANA) + 1;
      cronogramaItens.push({
        grupo: "Compra de Materiais",
        descricao: `Aquisição e entrega de matéria-prima`,
        pesoKg: 0,
        diasFabricacao: compraDias,
        semanaInicio: compraSemana,
        cor: "#0891B2",
      });

      // Fabricacao começa após compra
      let diaAcumulado = projetoDias + compraDias + 1;
      let ordemIdx = 0;

      for (const gs of GRUPOS_SUGERIDOS) {
        const g = grupos[gs.id];
        if (!g || g.pesoKg < 50) continue; // ignorar grupos com menos de 50kg

        const diasFab = calcDias(g.pesoKg, hhPorTon, equipe);
        const semanaInicio = Math.ceil(diaAcumulado / DIAS_SEMANA) || 1;

        cronogramaItens.push({
          grupo: gs.label,
          descricao: `${g.itens} itens · ${fmtNum((g.pesoKg / 1000) * hhPorTon, 0)} Hh`,
          pesoKg: Math.round(g.pesoKg),
          diasFabricacao: diasFab,
          semanaInicio,
          cor: CORES_PADRAO[ordemIdx % CORES_PADRAO.length],
        });

        // Proximo grupo inicia com sobreposicao de ~30% (fabricacao paralela)
        diaAcumulado += Math.max(1, Math.ceil(diasFab * 0.7));
        ordemIdx++;
      }

      if (cronogramaItens.length === 0) { showToast("Nao foi possivel agrupar os materiais"); setLoading(false); return; }

      // Limpar e recriar
      await fetch(`/api/comercial/estudo/${estudoId}/cronograma?todos=true`, { method: "DELETE" });
      const res = await fetch(`/api/comercial/estudo/${estudoId}/cronograma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cronogramaItens),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      const numFab = cronogramaItens.length - 2;
      showToast(`Projeto + Compra + ${numFab} grupos de fabricação`);
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════
  // CRUD
  // ══════════════════════════════════════════════════════════
  const handleAdicionar = async () => {
    if (!novoItem.grupo.trim()) return;
    setAdicionando(true);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/cronograma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grupo: novoItem.grupo.trim(),
          pesoKg: parseFloat(novoItem.pesoKg) || 0,
          diasFabricacao: parseInt(novoItem.diasFabricacao) || 0,
          diasMontagem: novoItem.diasMontagem ? parseInt(novoItem.diasMontagem) : null,
          semanaInicio: parseInt(novoItem.semanaInicio) || 1,
          cor: novoItem.cor || CORES_PADRAO[itens.length % CORES_PADRAO.length],
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      setNovoItem({ grupo: "", pesoKg: "", diasFabricacao: "", diasMontagem: "", semanaInicio: 1, cor: CORES_PADRAO[(itens.length + 1) % CORES_PADRAO.length] });
      setShowNovoForm(false);
    } catch (e) { showToast(`Erro: ${e.message}`); }
    finally { setAdicionando(false); }
  };

  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/cronograma?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
    } catch (e) { showToast(`Erro: ${e.message}`); }
    finally { setExcluindoId(null); }
  };

  const startEdit = (item) => {
    setEditandoId(item.id);
    setEditValores({
      grupo: item.grupo, pesoKg: item.pesoKg || 0, diasFabricacao: item.diasFabricacao || 0,
      diasMontagem: item.diasMontagem ?? "", semanaInicio: item.semanaInicio || 1,
      cor: item.cor || CORES_PADRAO[0],
    });
  };

  const saveEdit = async () => {
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/cronograma`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editandoId, grupo: editValores.grupo,
          pesoKg: parseFloat(editValores.pesoKg) || 0,
          diasFabricacao: parseInt(editValores.diasFabricacao) || 0,
          diasMontagem: editValores.diasMontagem !== "" ? parseInt(editValores.diasMontagem) : null,
          semanaInicio: parseInt(editValores.semanaInicio) || 1,
          cor: editValores.cor,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens(json.data);
      setEditandoId(null);
    } catch (e) { showToast(`Erro: ${e.message}`); }
  };

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-torg-blue/10 flex items-center justify-center">
            <Calendar size={18} className="text-torg-blue" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-torg-dark">Cronograma de Fabricacao</h3>
            <p className="text-xs text-torg-gray">
              {itens.length > 0
                ? `${itens.length} grupos · ${fmtPeso(pesoTotalCrono)} · ~${ultimaSemana} semanas`
                : "Defina os prazos por grupo de material para enviar ao cliente"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Equipe do projeto */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <Users size={14} className="text-torg-gray" />
            <span className="text-xs text-torg-gray">Equipe:</span>
            <input
              type="number"
              value={equipe}
              onChange={(e) => setEquipe(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              max="50"
              className="w-10 text-sm text-center text-torg-dark font-medium outline-none bg-transparent"
            />
            <span className="text-xs text-torg-gray">pessoas</span>
          </div>

          {(estudo.itensPerso || []).length > 0 && hhPorTon > 0 && (
            <button
              onClick={handleGerarAutomatico}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-torg-dark hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : (itens.length > 0 ? <RefreshCw size={14} /> : <Sparkles size={14} />)}
              {itens.length > 0 ? "Regerar" : "Gerar automatico"}
            </button>
          )}
          <button
            onClick={() => setShowNovoForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>

      {/* ═══ Cards resumo ═══ */}
      {itens.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Peso total</p>
            <p className="text-sm font-bold text-torg-dark">{fmtPeso(pesoTotalCrono)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-purple-600 uppercase tracking-wide">Projeto</p>
            <p className="text-sm font-bold text-purple-700">{prazosPreFab.projetoDias} dias</p>
            <p className="text-[10px] text-torg-gray">{pesoTotalTon <= 100 ? "≤ 100 ton" : pesoTotalTon <= 300 ? "100–300 ton" : "> 300 ton"}</p>
          </div>
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-cyan-600 uppercase tracking-wide">Compra</p>
            <p className="text-sm font-bold text-cyan-700">{prazosPreFab.compraDias} dias</p>
            <p className="text-[10px] text-torg-gray">Aquisição MP</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-gray uppercase tracking-wide">Hh total estimado</p>
            <p className="text-sm font-bold text-torg-dark">{hhPorTon > 0 ? `${fmtNum((pesoTotalCrono / 1000) * hhPorTon, 0)} Hh` : "—"}</p>
          </div>
          <div className="bg-torg-blue/5 border border-torg-blue/20 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-torg-blue uppercase tracking-wide">Prazo total</p>
            <p className="text-sm font-bold text-torg-blue">{ultimaSemana} semanas</p>
            <p className="text-[10px] text-torg-gray">~{ultimaSemana * DIAS_SEMANA} dias uteis · {equipe} pessoas</p>
          </div>
        </div>
      )}

      {/* ═══ Estado vazio ═══ */}
      {itens.length === 0 && !showNovoForm && (
        <div className="flex flex-col items-center justify-center py-16 border border-gray-100 rounded-xl text-center">
          <Calendar size={32} className="text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray mb-1">Nenhum grupo no cronograma</p>
          <p className="text-xs text-gray-400 mb-4">
            {(estudo.itensPerso || []).length > 0 && hhPorTon > 0
              ? "Gere automaticamente a partir dos materiais ou adicione manualmente."
              : "Defina Hh/ton na Produtividade e cadastre materiais primeiro."}
          </p>
          {(estudo.itensPerso || []).length > 0 && hhPorTon > 0 && (
            <button
              onClick={handleGerarAutomatico}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Gerar cronograma automatico
            </button>
          )}
        </div>
      )}

      {/* ═══ Gantt visual ═══ */}
      {itens.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: `${360 + semanasVisiveis * 48}px` }}>
              <thead>
                <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100">
                  <th className="py-2.5 px-3 font-medium w-44 sticky left-0 bg-gray-50/95 z-10">Grupo</th>
                  <th className="py-2.5 px-2 font-medium text-right w-20">Peso</th>
                  <th className="py-2.5 px-2 font-medium text-center w-14">Dias</th>
                  {Array.from({ length: semanasVisiveis }, (_, i) => (
                    <th key={i} className="py-2.5 px-0 font-medium text-center text-[10px]" style={{ width: "48px", minWidth: "48px" }}>
                      S{i + 1}
                    </th>
                  ))}
                  <th className="py-2.5 px-2 w-16 sticky right-0 bg-gray-50/95 z-10"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const semFab = Math.ceil((item.diasFabricacao || 0) / DIAS_SEMANA) || 0;
                  const semMont = Math.ceil((item.diasMontagem || 0) / DIAS_SEMANA) || 0;
                  const semInicio = (item.semanaInicio || 1) - 1; // 0-based

                  if (editandoId === item.id) return (
                    <tr key={item.id} className="border-b border-gray-50 bg-torg-blue/5">
                      <td className="py-1.5 px-3 sticky left-0 bg-torg-blue/5 z-10">
                        <input type="text" value={editValores.grupo}
                          onChange={(e) => setEditValores((v) => ({ ...v, grupo: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input type="number" value={editValores.pesoKg}
                          onChange={(e) => setEditValores((v) => ({ ...v, pesoKg: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input type="number" value={editValores.diasFabricacao} min="0"
                          onChange={(e) => setEditValores((v) => ({ ...v, diasFabricacao: e.target.value }))}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:ring-1 focus:ring-torg-blue/30 outline-none" />
                      </td>
                      <td colSpan={semanasVisiveis} className="py-1.5 px-2">
                        <div className="flex items-center gap-3 text-xs text-torg-gray">
                          <label className="flex items-center gap-1">
                            Inicio: <input type="number" value={editValores.semanaInicio} min="1"
                              onChange={(e) => setEditValores((v) => ({ ...v, semanaInicio: e.target.value }))}
                              className="w-12 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:ring-1 focus:ring-torg-blue/30 outline-none" />
                          </label>
                          <label className="flex items-center gap-1">
                            Mont.: <input type="number" value={editValores.diasMontagem} min="0" placeholder="—"
                              onChange={(e) => setEditValores((v) => ({ ...v, diasMontagem: e.target.value }))}
                              className="w-12 px-2 py-1 border border-gray-200 rounded text-xs text-center focus:ring-1 focus:ring-torg-blue/30 outline-none" /> dias
                          </label>
                          <label className="flex items-center gap-1">
                            Cor: <input type="color" value={editValores.cor || CORES_PADRAO[0]}
                              onChange={(e) => setEditValores((v) => ({ ...v, cor: e.target.value }))}
                              className="w-6 h-6 rounded cursor-pointer border-0" />
                          </label>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 sticky right-0 bg-torg-blue/5 z-10">
                        <div className="flex items-center gap-1">
                          <button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button>
                          <button onClick={() => setEditandoId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );

                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/30 transition-colors group">
                      <td className="py-2.5 px-3 sticky left-0 bg-white group-hover:bg-gray-50/30 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.cor || CORES_PADRAO[0] }} />
                          <span className="text-sm font-medium text-torg-dark truncate">{item.grupo}</span>
                        </div>
                        {item.descricao && <p className="text-[10px] text-torg-gray ml-[18px]">{item.descricao}</p>}
                      </td>
                      <td className="py-2.5 px-2 text-right text-xs text-torg-gray tabular-nums">{fmtPeso(item.pesoKg)}</td>
                      <td className="py-2.5 px-2 text-center text-xs font-medium text-torg-dark tabular-nums">
                        {item.diasFabricacao || 0}d
                        {item.diasMontagem > 0 && <span className="text-torg-gray font-normal"> +{item.diasMontagem}d</span>}
                      </td>
                      {/* Barras Gantt */}
                      {Array.from({ length: semanasVisiveis }, (_, i) => {
                        const isFab = semFab > 0 && i >= semInicio && i < semInicio + semFab;
                        const isMont = semMont > 0 && i >= semInicio + semFab && i < semInicio + semFab + semMont;
                        return (
                          <td key={i} className="py-2.5 px-0" style={{ width: "48px", minWidth: "48px" }}>
                            {isFab && (
                              <div className="h-6 rounded-sm mx-0.5"
                                style={{ backgroundColor: item.cor || CORES_PADRAO[0], opacity: 0.85 }}
                                title={`Fab: S${item.semanaInicio}–S${item.semanaInicio + semFab - 1} (${item.diasFabricacao}d)`} />
                            )}
                            {isMont && (
                              <div className="h-6 rounded-sm mx-0.5 border-2 border-dashed"
                                style={{ borderColor: item.cor || CORES_PADRAO[0], backgroundColor: `${item.cor || CORES_PADRAO[0]}20` }}
                                title={`Mont: ${item.diasMontagem}d`} />
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-2 sticky right-0 bg-white group-hover:bg-gray-50/30 z-10">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"><Edit3 size={13} /></button>
                          <button onClick={() => handleExcluir(item.id)} disabled={excluindoId === item.id}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50">
                            {excluindoId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-50/60 border-t border-gray-100 text-xs text-torg-gray">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm bg-torg-blue/85" />
              <span>Fabricacao</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded-sm border-2 border-dashed border-torg-blue bg-torg-blue/10" />
              <span>Montagem</span>
            </div>
            <span className="ml-auto text-[10px]">S = semana ({DIAS_SEMANA} dias uteis) · Equipe de {equipe} pessoas</span>
          </div>
        </div>
      )}

      {/* ═══ Form de adicao ═══ */}
      {showNovoForm && (
        <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-torg-dark">Adicionar grupo ao cronograma</p>
            <button onClick={() => setShowNovoForm(false)} className="p-1 text-gray-400 hover:text-torg-dark rounded"><X size={14} /></button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Grupo</label>
              <input type="text" value={novoItem.grupo} autoFocus
                onChange={(e) => setNovoItem((p) => ({ ...p, grupo: e.target.value }))}
                placeholder="Ex: Colunas, Vigas, Guarda-corpo..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
            </div>
            <div className="w-28 shrink-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Peso (kg)</label>
              <input type="number" value={novoItem.pesoKg} placeholder="0" min="0"
                onChange={(e) => setNovoItem((p) => ({ ...p, pesoKg: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
            </div>
            <div className="w-24 shrink-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Dias fab.</label>
              <input type="number" value={novoItem.diasFabricacao} placeholder="0" min="0"
                onChange={(e) => setNovoItem((p) => ({ ...p, diasFabricacao: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
            </div>
            <div className="w-20 shrink-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Semana</label>
              <input type="number" value={novoItem.semanaInicio} min="1"
                onChange={(e) => setNovoItem((p) => ({ ...p, semanaInicio: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none bg-white" />
            </div>
            <div className="w-10 shrink-0">
              <label className="block text-[10px] text-torg-gray uppercase tracking-wide mb-1">Cor</label>
              <input type="color" value={novoItem.cor}
                onChange={(e) => setNovoItem((p) => ({ ...p, cor: e.target.value }))}
                className="w-10 h-[38px] rounded-lg cursor-pointer border border-gray-200" />
            </div>
            <div className="shrink-0">
              <button onClick={handleAdicionar} disabled={adicionando || !novoItem.grupo.trim()}
                className="flex items-center justify-center w-10 h-[38px] bg-torg-blue text-white rounded-lg hover:bg-torg-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {adicionando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
          </div>
          {hhPorTon > 0 && novoItem.pesoKg > 0 && (
            <p className="text-xs text-torg-gray mt-2">
              Estimativa com {equipe} pessoas: <strong className="text-torg-dark">{calcDias(parseFloat(novoItem.pesoKg), hhPorTon, equipe)} dias</strong> de fabricacao
              ({fmtNum((parseFloat(novoItem.pesoKg) / 1000) * hhPorTon, 0)} Hh)
            </p>
          )}
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
    </div>
  );
}
