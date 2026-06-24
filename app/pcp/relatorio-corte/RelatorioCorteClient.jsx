"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Factory, Download, Loader2, AlertCircle, RefreshCw, ChevronLeft, Inbox, EyeOff, Eye } from "lucide-react";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, adicionarLegenda, downloadWorkbook, CORES } from "@/lib/excel-relatorio";

const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Cor da situação por ESTADO (independe do setor — o rótulo é o verbo do setor).
const EST_COR = {
  FEITO: "bg-emerald-100 text-emerald-700",
  PARCIAL: "bg-amber-100 text-amber-700",
  PENDENTE: "bg-gray-100 text-gray-500",
};

// Rótulos por setor (verbo da situação, ação no particípio, data do evento).
const SETOR_INFO = {
  CORTE:      { nome: "Corte",      verbo: "Cortada",  acao: "Cortado",  ultima: "Último corte",      dataCol: "Data do corte" },
  MONTAGEM:   { nome: "Montagem",   verbo: "Montada",  acao: "Montado",  ultima: "Última montagem",   dataCol: "Data da montagem" },
  SOLDA:      { nome: "Solda",      verbo: "Soldada",  acao: "Soldado",  ultima: "Última solda",      dataCol: "Data da solda" },
  ACABAMENTO: { nome: "Acabamento", verbo: "Acabada",  acao: "Acabado",  ultima: "Último acabamento", dataCol: "Data do acabamento" },
  JATO:       { nome: "Jato",       verbo: "Jateada",  acao: "Jateado",  ultima: "Último jato",       dataCol: "Data do jato" },
  PINTURA:    { nome: "Pintura",    verbo: "Pintada",  acao: "Pintado",  ultima: "Última pintura",    dataCol: "Data da pintura" },
};
const SETORES = Object.keys(SETOR_INFO);

export default function RelatorioCorteClient({ isAdmin = false }) {
  const [setor, setSetor] = useState("CORTE");
  const [obras, setObras] = useState([]);
  const [obra, setObra] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [fMaquina, setFMaquina] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [exportandoTodas, setExportandoTodas] = useState(false);
  const [reconciliando, setReconciliando] = useState(false);
  const [reconMsg, setReconMsg] = useState("");
  const [mostrarOcultas, setMostrarOcultas] = useState(false);

  const info = SETOR_INFO[setor];

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const p = new URLSearchParams({ setor });
      if (obra) p.set("obra", obra);
      if (de) p.set("de", de);
      if (ate) p.set("ate", ate);
      const res = await fetch(`/api/pcp/relatorio-corte?${p}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      if (obra) { setDetalhe(j); } else { setObras(j.obras || []); setDetalhe(null); }
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [setor, obra, de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  function mudarSetor(s) {
    if (s === setor) return;
    setSetor(s); setObra(""); setDetalhe(null);
    setFMaquina(""); setFEstado(""); setMostrarOcultas(false); setReconMsg("");
  }

  // Reconciliação da baixa do CORTE (Syneco → peças) — manual + auto ao abrir.
  // Só faz sentido no corte (montagem+ avança por liberação manual).
  const carregarRef = useRef(carregar);
  useEffect(() => { carregarRef.current = carregar; }, [carregar]);
  const reconciliar = useCallback(async (auto = false) => {
    if (!auto) { setReconciliando(true); setReconMsg(""); }
    try {
      const r = await fetch(`/api/pcp/reconciliar-corte${auto ? "?auto=1" : ""}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) { if (!auto) setReconMsg(j.error || "Erro ao reconciliar"); return; }
      if (j.skipped) return;
      if (!auto) setReconMsg(`Baixa em dia — ${j.atualizadas} peça(s) atualizada(s)${j.promovidas ? `, ${j.promovidas} promovida(s) p/ CORTE` : ""}.`);
      if (j.atualizadas > 0) carregarRef.current?.();
    } catch (e) { if (!auto) setReconMsg(e.message); }
    finally { if (!auto) setReconciliando(false); }
  }, []);
  useEffect(() => { if (setor === "CORTE") reconciliar(true); }, [reconciliar, setor]); // rede de segurança ao abrir

  // Filtros do detalhe (cliente): máquina + estado
  const itensDet = detalhe?.itens || [];
  const maquinas = [...new Set(itensDet.map((i) => i.maquina).filter((m) => m && m !== "—"))].sort();
  const itensFiltrados = itensDet.filter((i) => (!fMaquina || i.maquina === fMaquina) && (!fEstado || i.estado === fEstado));

  // Resumo: obras visíveis × ocultas (por setor). ADM pode ocultar OPs já
  // finalizadas no setor (só some da visão — nada é apagado).
  const obrasOcultas = obras.filter((o) => o.oculto);
  const obrasVisiveis = obras.filter((o) => !o.oculto);
  const listaExibida = isAdmin && mostrarOcultas ? obras : obrasVisiveis;

  async function toggleOcultar(obraAlvo, ocultar) {
    setObras((prev) => prev.map((o) => (o.obra === obraAlvo ? { ...o, oculto: ocultar } : o)));
    try {
      const r = await fetch("/api/pcp/relatorio-corte/ocultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra: obraAlvo, setor, ocultar }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Erro ao ocultar");
    } catch (e) {
      setObras((prev) => prev.map((o) => (o.obra === obraAlvo ? { ...o, oculto: !ocultar } : o)));
      setErro(e.message);
    }
  }

  // Extrai TODAS as peças de todas as OPs num único Excel (respeita o período)
  async function exportarTodas() {
    setExportandoTodas(true);
    try {
      const p = new URLSearchParams({ todas: "1", setor });
      if (de) p.set("de", de);
      if (ate) p.set("ate", ate);
      const res = await fetch(`/api/pcp/relatorio-corte?${p}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao extrair");
      const itens = j.itens || [];
      const hoje = new Date().toISOString().split("T")[0];
      const periodo = de || ate ? ` · período ${de || "início"} a ${ate || "hoje"}` : " · histórico completo";
      const headers = ["OP / Frente", "Peça", "Descrição / Perfil", "Programado", info.acao, "Saldo", "Situação", info.dataCol, "Máquina", "Operador"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Relatorio de ${info.nome} — Todas as pecas por OP`,
        subtitulo: `Pecas ${info.acao.toLowerCase()}s (Syneco)${periodo}`,
        kpis: [`${itens.length} pecas/linhas  |  ${info.acao}: ${itens.reduce((s, i) => s + (i.cortado || 0), 0).toLocaleString("pt-BR")} un`],
        totalColunas: headers.length,
        nomePlanilha: `${info.nome} (todas as OPs)`.slice(0, 31),
        codigoDoc: "REL-PRD-005",
      });
      ws.columns = [{ width: 14 }, { width: 16 }, { width: 28 }, { width: 11 }, { width: 9 }, { width: 8 }, { width: 11 }, { width: 18 }, { width: 16 }, { width: 16 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      for (const i of itens) {
        const fill = i.estado === "FEITO" ? CORES.LIGHT_GREEN : i.estado === "PARCIAL" ? CORES.LIGHT_ORANGE : undefined;
        adicionarLinhaTabela(ws, row, [i.obra, i.peca, i.descricao, i.programado, i.cortado, i.saldo, i.situacao, fmtDataHora(i.data), i.maquina, i.operador], {
          fillColor: fill, alinhamento: { 3: "right", 4: "right", 5: "right", 6: "center", 7: "center" },
        });
        row++;
      }
      await downloadWorkbook(workbook, `Torg_${info.nome}_TodasOPs_${hoje}.xlsx`);
    } catch (e) { setErro(e.message); } finally { setExportandoTodas(false); }
  }

  async function exportarExcel() {
    const periodo = de || ate ? ` · período ${de || "início"} a ${ate || "hoje"}` : "";
    const hoje = new Date().toISOString().split("T")[0];
    if (detalhe) {
      const headers = ["Peça", "Descrição / Perfil", "Programado", info.acao, "Saldo", "Situação", info.dataCol, "Máquina", "Operador"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Relatorio de ${info.nome} — Obra ${detalhe.obra}`,
        subtitulo: `Pecas programadas e ${info.acao.toLowerCase()}s (Syneco)${periodo}`,
        kpis: [`Programado: ${detalhe.programadoUn} un  |  ${info.acao}: ${detalhe.cortadoUn} un  |  Pecas ${info.verbo.toLowerCase()}s: ${detalhe.cortadas}/${detalhe.total}  |  Pendentes: ${detalhe.pendentes}`],
        totalColunas: headers.length,
        nomePlanilha: `${info.nome} ${detalhe.obra}`.slice(0, 31),
        codigoDoc: "REL-PRD-005",
      });
      ws.columns = [{ width: 16 }, { width: 30 }, { width: 11 }, { width: 9 }, { width: 8 }, { width: 11 }, { width: 18 }, { width: 16 }, { width: 16 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      const first = row;
      for (const i of itensFiltrados) {
        const fill = i.estado === "FEITO" ? CORES.LIGHT_GREEN : i.estado === "PARCIAL" ? CORES.LIGHT_ORANGE : undefined;
        const corSit = i.estado === "FEITO" ? "16A34A" : i.estado === "PARCIAL" ? "EA580C" : "9CA3AF";
        adicionarLinhaTabela(ws, row, [i.peca, i.descricao, i.programado, i.cortado, i.saldo, i.situacao, fmtDataHora(i.data), i.maquina, i.operador], {
          fillColor: fill, fontColors: { 5: corSit },
          alinhamento: { 2: "right", 3: "right", 4: "right", 5: "center", 6: "center" },
        });
        row++;
      }
      const last = row - 1;
      adicionarLinhaTotais(ws, row, ["TOTAL", "", { formula: `SUM(C${first}:C${last})` }, { formula: `SUM(D${first}:D${last})` }, { formula: `SUM(E${first}:E${last})` }, "", "", "", ""]);
      row += 2;
      adicionarLegenda(ws, row, [{ cor: CORES.LIGHT_GREEN, label: `Verde = ${info.verbo.toLowerCase()}` }, { cor: CORES.LIGHT_ORANGE, label: "Laranja = parcial" }, { cor: "FFFFFF", label: "Branco = pendente" }], headers.length);
      await downloadWorkbook(workbook, `Torg_${info.nome}_${detalhe.obra}_${hoje}.xlsx`);
    } else {
      const headers = ["Obra", "Pecas", "Programado (un)", `${info.acao} (un)`, `% ${info.acao.toLowerCase()}`, `Peso ${info.acao.toLowerCase()} (kg)`, info.ultima];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Relatorio de ${info.nome} — Resumo por obra`,
        subtitulo: `Obras com apontamento de ${info.nome.toLowerCase()} no Syneco${periodo}`,
        totalColunas: headers.length,
        nomePlanilha: `${info.nome} (resumo)`.slice(0, 31),
        codigoDoc: "REL-PRD-005",
      });
      ws.columns = [{ width: 12 }, { width: 8 }, { width: 15 }, { width: 13 }, { width: 11 }, { width: 16 }, { width: 14 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      const first = row;
      for (const o of listaExibida) {
        adicionarLinhaTabela(ws, row, [o.obra, o.pecas, o.programadoUn, o.cortadoUn, `${o.pct}%`, o.pesoCortado, fmtData(o.ultima)], {
          alinhamento: { 1: "right", 2: "right", 3: "right", 4: "center", 5: "right" },
        });
        row++;
      }
      const last = row - 1;
      adicionarLinhaTotais(ws, row, ["TOTAL", { formula: `SUM(B${first}:B${last})` }, { formula: `SUM(C${first}:C${last})` }, { formula: `SUM(D${first}:D${last})` }, "", { formula: `SUM(F${first}:F${last})` }, ""]);
      await downloadWorkbook(workbook, `Torg_${info.nome}_Resumo_${hoje}.xlsx`);
    }
  }

  const vazio = detalhe ? !itensFiltrados.length : !listaExibida.length;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Factory size={20} className="text-torg-blue" /> Relatório de Produção</h1>
          <p className="text-xs text-torg-gray mt-0.5">Peças <strong>programadas</strong> e <strong>produzidas</strong> por obra/setor — situação, data/hora, máquina e operador (Syneco).</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {setor === "CORTE" && (
            <button onClick={() => reconciliar(false)} disabled={reconciliando}
              title="Aplica a baixa do corte do Syneco em todas as OPs agora"
              className="text-sm font-semibold text-torg-gray border border-gray-300 hover:bg-gray-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
              {reconciliando ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reconciliar corte
            </button>
          )}
          {isAdmin && !detalhe && obrasOcultas.length > 0 && (
            <button onClick={() => setMostrarOcultas((v) => !v)}
              title="Mostrar/esconder as obras ocultadas deste setor"
              className="text-sm font-semibold text-torg-gray border border-gray-300 hover:bg-gray-50 px-3 py-2 rounded-lg inline-flex items-center gap-2">
              {mostrarOcultas ? <Eye size={15} /> : <EyeOff size={15} />} {mostrarOcultas ? "Esconder ocultas" : `Ocultas (${obrasOcultas.length})`}
            </button>
          )}
          {!detalhe && (
            <button onClick={exportarTodas} disabled={exportandoTodas}
              className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
              {exportandoTodas ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Todas as peças (Excel)
            </button>
          )}
          <button onClick={exportarExcel} disabled={loading || vazio}
            className="text-sm font-semibold text-torg-blue border border-torg-blue-300 hover:bg-torg-blue-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            <Download size={15} /> Exportar {detalhe ? "OP" : "resumo"}
          </button>
        </div>
      </div>

      {/* Abas por setor */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {SETORES.map((s) => (
          <button key={s} onClick={() => mudarSetor(s)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${setor === s ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            {SETOR_INFO[s].nome}
          </button>
        ))}
      </div>

      {reconMsg && <div className="mb-3 text-[13px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 flex items-center gap-2">{reconMsg}<button onClick={() => setReconMsg("")} className="ml-auto text-emerald-700 hover:text-emerald-900 font-bold">✕</button></div>}

      <div className="flex items-center gap-3 flex-wrap mb-4 bg-white border border-gray-100 rounded-xl shadow-sm p-3">
        <select value={obra} onChange={(e) => setObra(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">Todas as obras (resumo)</option>
          {listaExibida.map((o) => <option key={o.obra} value={o.obra}>{o.obra}{o.oculto ? " (oculta)" : ""}</option>)}
        </select>
        <label className="text-xs text-torg-gray flex items-center gap-1">De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg text-sm" /></label>
        <label className="text-xs text-torg-gray flex items-center gap-1">Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg text-sm" /></label>
        {(de || ate) && <button onClick={() => { setDe(""); setAte(""); }} className="text-xs text-torg-gray hover:text-torg-dark underline">limpar datas</button>}
        {obra && (
          <>
            <select value={fMaquina} onChange={(e) => setFMaquina(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">Todas máquinas</option>
              {maquinas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="">Todas situações</option>
              <option value="FEITO">{info.verbo}</option>
              <option value="PARCIAL">Parcial</option>
              <option value="PENDENTE">Pendente</option>
            </select>
          </>
        )}
        {obra && <button onClick={() => { setObra(""); setFMaquina(""); setFEstado(""); }} className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 ml-auto"><ChevronLeft size={13} /> voltar ao resumo</button>}
      </div>
      {(de || ate) && <p className="text-[11px] text-torg-gray -mt-2 mb-3">Filtro de período mostra só o que foi <strong>{info.acao.toLowerCase()}</strong> no intervalo (pendentes aparecem sem filtro de data).</p>}

      {loading ? (
        <div className="text-center py-16 text-torg-gray"><Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="text-center py-16"><AlertCircle size={22} className="mx-auto text-red-500 mb-2" /><p className="text-red-600 text-sm">{erro}</p>
          <button onClick={carregar} className="mt-3 text-sm text-torg-blue inline-flex items-center gap-1"><RefreshCw size={13} /> Tentar novamente</button></div>
      ) : vazio ? (
        <div className="text-center py-16 text-torg-gray"><Inbox size={28} className="mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhum apontamento de {info.nome.toLowerCase()}{(de || ate) ? " no período." : "."}</p></div>
      ) : detalhe ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Kpi label="Programado" valor={`${detalhe.programadoUn.toLocaleString("pt-BR")} un`} />
            <Kpi label={info.acao} valor={`${detalhe.cortadoUn.toLocaleString("pt-BR")} un`} cor="text-emerald-700" />
            <Kpi label={`Peças ${info.verbo.toLowerCase()}s`} valor={`${detalhe.cortadas} / ${detalhe.total}`} />
            <Kpi label="Pendentes" valor={detalhe.pendentes} cor="text-torg-gray" />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-[13px] [&_td]:align-top">
              <thead className="bg-gray-50/60"><tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Peça</th>
                <th className="px-3 py-2 font-medium">Descrição / Perfil</th>
                <th className="px-3 py-2 font-medium text-right">Prog.</th>
                <th className="px-3 py-2 font-medium text-right">Feito</th>
                <th className="px-3 py-2 font-medium text-center">Situação</th>
                <th className="px-3 py-2 font-medium">{info.dataCol}</th>
                <th className="px-3 py-2 font-medium">Máquina</th>
                <th className="px-3 py-2 font-medium">Operador</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {itensFiltrados.map((i, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-mono font-medium text-torg-dark whitespace-nowrap">{i.peca}</td>
                    <td className="px-3 py-2 text-torg-gray">{i.descricao}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{i.programado}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{i.cortado}</td>
                    <td className="px-3 py-2 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${EST_COR[i.estado] || ""}`}>{i.situacao}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap text-torg-dark">{fmtDataHora(i.data)}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{i.maquina}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{i.operador}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50/60"><tr className="text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Obra</th>
              <th className="px-3 py-2 font-medium text-right">Peças</th>
              <th className="px-3 py-2 font-medium text-right">Programado</th>
              <th className="px-3 py-2 font-medium text-right">{info.acao}</th>
              <th className="px-3 py-2 font-medium text-right">% {info.acao.toLowerCase()}</th>
              <th className="px-3 py-2 font-medium text-right">Peso {info.acao.toLowerCase()}</th>
              <th className="px-3 py-2 font-medium">{info.ultima}</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {listaExibida.map((o) => (
                <tr key={o.obra} className={`hover:bg-gray-50/50 ${o.oculto ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-mono font-semibold text-torg-dark whitespace-nowrap">
                    {o.obra}
                    {o.oculto && <span className="ml-2 align-middle text-[10px] font-sans font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">oculta</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-torg-gray">{o.pecas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.programadoUn.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{o.cortadoUn.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{o.pct}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-torg-gray">{fmtKg(o.pesoCortado)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-torg-gray">{fmtData(o.ultima)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setObra(o.obra)} className="text-[12px] text-torg-blue hover:text-torg-dark font-medium">ver peças →</button>
                    {isAdmin && (o.oculto ? (
                      <button onClick={() => toggleOcultar(o.obra, false)} title="Restaurar no relatório"
                        className="ml-3 text-[12px] text-emerald-700 hover:text-emerald-900 font-medium inline-flex items-center gap-1"><Eye size={13} /> restaurar</button>
                    ) : (
                      <button onClick={() => toggleOcultar(o.obra, true)} title="Ocultar do relatório (ex.: OP finalizada neste setor)"
                        className="ml-3 text-[12px] text-torg-gray hover:text-red-600 font-medium inline-flex items-center gap-1"><EyeOff size={13} /> ocultar</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor = "text-torg-dark" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-[10px] text-torg-gray uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${cor}`}>{valor}</p>
    </div>
  );
}
