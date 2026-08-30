"use client";
// A ABA CRONOGRAMA — as atividades dos cronogramas ativos, agrupadas por setor.
//
// ⚠⚠ UM COMPONENTE, DUAS TELAS. Vitor (29/08/2026): "preciso criar uma forma com que a engenharia
// enxergue as tarefas do cronograma, igual temos na aba do planejamento... porém apenas para as
// tarefas da engenharia". Em vez de copiar a tela, ela sai daqui para os dois lugares:
//
//   · /planejamento/tarefas   → todos os setores, com o filtro livre
//   · /engenharia/cronograma  → `deptoFixo="ENGENHARIA"`, sem o seletor de setor
//
// Duas cópias divergiriam na primeira correção feita só de um lado — e a Engenharia é justamente
// quem precisa ver o mesmo número que o Planejamento cobra dela.
import { useState, useEffect, useCallback, useMemo } from "react";
import { fmtOP } from "@/lib/utils";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { DEPTOS, DEPT_LABEL, DEPT_COR } from "@/lib/cronograma-departamentos";
import {
  AlertCircle, AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, Clock,
  Download, Filter, GanttChart, Loader2, Lock, Mail, Pencil, Plus, RefreshCw, Send, User, X, ListFilter,
} from "lucide-react";

// ─── Aba Cronograma ──────────────────────────────────────

export default function AtividadesCronograma({ showToast, deptoFixo = "" }) {
  // ⚠ a tela da Engenharia não tem a barra de toast do Planejamento; sem esta saída, salvar uma
  // tarefa lá quebraria com "showToast is not a function" bem depois de a gravação ter dado certo.
  const avisar = showToast || ((msg, tipo) => { if (tipo === "erro") alert(msg); });
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroDepto, setFiltroDepto] = useState(deptoFixo);
  const [filtroStatus, setFiltroStatus] = useState(""); // "" | "atrasada" | "no_prazo" | "concluida"
  const [filtroOp, setFiltroOp] = useState("");
  const [notificarAtiv, setNotificarAtiv] = useState(null);
  const [expandidasCumpridas, setExpandidasCumpridas] = useState(() => new Set()); // setores com as "cumpridas" abertas
  const [exportando, setExportando] = useState(false);
  const [preencherAtiv, setPreencherAtiv] = useState(null); // atividade sendo preenchida (grava no cronograma)
  // ⚠⚠ MODO PLANILHA. Vitor (29/08/2026): "essa tela de cronograma do portal da engenharia, criar
  // como se fosse planilha igual fizemos nas outras, pode criar o filtro na OP, Data e onde aparece
  // hold". Com o setor travado o agrupamento por setor perde a razão de existir — sobra UMA lista,
  // e a pergunta do setor vira "filtra a OP, ordena pela data, mostra o que está em hold".
  // No Planejamento (sem `deptoFixo`) o agrupamento por setor continua sendo o certo.
  const [tabela, setTabela] = useState(!!deptoFixo);
  const [colAberta, setColAberta] = useState(null);
  const [baixando, setBaixando] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (filtroDepto) params.set("departamento", filtroDepto);
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroOp.trim()) params.set("op", filtroOp.trim());
      const res = await fetch(`/api/planejamento/cronogramas/atividades?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setAtividades(data.atividades || []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtroDepto, filtroStatus, filtroOp]);

  useEffect(() => { carregar(); }, [carregar]);

  // ⚠⚠ A DATA DA BAIXA É A DA EVIDÊNCIA, NÃO A DE HOJE. O material da OP-103 chegou em 28/08 com
  // prazo 03/08: dar baixa hoje registraria um atraso diferente do que houve, e o indicador passaria
  // a medir o dia em que alguém lembrou de clicar.
  async function baixarPelaEvidencia(a) {
    setBaixando(a.id);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/tarefas/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataFimReal: new Date(a.evidencia.atendidaEm).toISOString(), percentualRealizado: 100 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao dar baixa");
      avisar("Baixa registrada na data da evidência.", "sucesso");
      carregar();
    } catch (e) { avisar(e.message, "erro"); } finally { setBaixando(null); }
  }

  const fmtData = (d) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };
  // dd/mm/aaaa para o filtro e para a planilha: "12 ago" não ordena nem agrupa por mês
  const dataBR = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
  // ⚠ a situação é UMA coluna, não três colunas de sim/não: é assim que dá para filtrar "só o que
  // está em hold" com um clique, que foi o pedido.
  const situacao = (a) => (a.concluida ? "Concluída" : a.bloqueada ? "Em hold" : a.atrasada ? "Atrasada" : "Em andamento");

  const COLUNAS_FILTRO = useMemo(() => [
    { key: "op", label: "OP", valor: (a) => fmtOP(a.opNumero) || "—" },
    { key: "cliente", label: "Cliente", valor: (a) => a.opCliente || "—" },
    { key: "area", label: "Área", valor: (a) => a.area || "—" },
    { key: "prazo", label: "Prazo", valor: (a) => dataBR(a.dataFimPrevista) },
    { key: "situacao", label: "Situação", valor: situacao },
  ], []);
  const { filtros: filtroCol, setFiltros: setFiltroCol, filtradas, opcoesDaColuna, ativos: filtrosAtivos, limpar: limparColunas } =
    useFiltroColunas(atividades, COLUNAS_FILTRO);
  const fp = { filtros: filtroCol, setFiltros: setFiltroCol, opcoesDaColuna, aberta: colAberta, setAberta: setColAberta };
  // ordenada por prazo: a pergunta do setor é "o que vence primeiro"
  const linhasTabela = useMemo(
    () => [...filtradas].sort((a, b) => (a.dataFimPrevista || "9999").localeCompare(b.dataFimPrevista || "9999")),
    [filtradas],
  );

  const atrasadas = atividades.filter((a) => a.atrasada).length;
  const concluidas = atividades.filter((a) => a.concluida).length;
  const emHold = atividades.filter((a) => a.bloqueada).length;
  const emAndamento = atividades.length - atrasadas - concluidas - emHold;

  const toggleCumpridas = (dept) => setExpandidasCumpridas((s) => { const n = new Set(s); n.has(dept) ? n.delete(dept) : n.add(dept); return n; });
  // Agrupa por SETOR: ativas (detalhadas) + cumpridas (100% → só "cumprida", sem descrever).
  const gruposSetor = (() => {
    const map = new Map();
    for (const a of atividades) {
      const d = a.departamento || "OUTROS";
      if (!map.has(d)) map.set(d, { dept: d, ativas: [], cumpridas: [] });
      (a.concluida ? map.get(d).cumpridas : map.get(d).ativas).push(a);
    }
    const ordem = [...DEPTOS, ...[...map.keys()].filter((d) => !DEPTOS.includes(d))];
    return ordem.filter((d) => map.has(d)).map((d) => map.get(d));
  })();

  // Exporta as atividades (respeitando os filtros) no padrão de planilha da Torg.
  async function exportarRelatorio() {
    if (!atividades.length) return;
    setExportando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, downloadWorkbook } = await import("@/lib/excel-relatorio");
      const filtros = [
        filtroDepto && `Setor: ${DEPT_LABEL[filtroDepto] || filtroDepto}`,
        filtroStatus && `Status: ${filtroStatus}`,
        filtroOp.trim() && `OP: ${filtroOp.trim()}`,
      ].filter(Boolean).join("  |  ");
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Atividades dos Cronogramas — Planejamento",
        subtitulo: filtros || `${atividades.length} atividades · ${new Date().toLocaleDateString("pt-BR")}`,
        nomePlanilha: "Cronogramas",
        codigoDoc: "REL-PLN-001",
        totalColunas: 10,
        kpis: [`Total: ${atividades.length}  |  Atrasadas: ${atrasadas}  |  Em andamento: ${emAndamento}  |  Em hold: ${emHold}  |  Cumpridas: ${concluidas}`],
      });
      [4, 10, 20, 13, 34, 30, 10, 10, 6, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Nº", "OP", "Cliente", "Setor", "Atividade", "Área", "Início", "Prazo", "%", "Status"]);
      row++;
      const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
      const ordenadas = [...atividades].sort((a, b) =>
        (DEPTOS.indexOf(a.departamento) - DEPTOS.indexOf(b.departamento)) ||
        (new Date(a.dataFimPrevista || 0) - new Date(b.dataFimPrevista || 0))
      );
      ordenadas.forEach((a, i) => {
        const status = a.concluida ? "Cumprida" : a.bloqueada ? "Hold / Bloqueada" : a.atrasada ? `Atrasada ${a.diasAtraso}d` : "No prazo";
        adicionarLinhaTabela(ws, row, [
          i + 1, fmtOP(a.opNumero), a.opCliente || "", DEPT_LABEL[a.departamento] || a.departamento || "",
          a.nome, a.area || "", fmtD(a.dataInicioPrevista), fmtD(a.dataFimPrevista), `${a.percentualRealizado}%`, status,
        ]);
        row++;
      });
      await downloadWorkbook(workbook, `Torg_Cronogramas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      avisar("Erro ao exportar: " + e.message, "erro");
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-torg-gray" />
        {/* ⚠ com o setor travado o seletor sai da tela: deixá-lo aberto na visão da Engenharia
            convidaria a trocar para outro setor e a tela deixaria de ser "as minhas tarefas". */}
        {deptoFixo ? (
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${DEPT_COR[deptoFixo] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
            {DEPT_LABEL[deptoFixo] || deptoFixo}
          </span>
        ) : (
          <select value={filtroDepto} onChange={(e) => setFiltroDepto(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
            <option value="">Todos departamentos</option>
            {DEPTOS.map((d) => <option key={d} value={d}>{DEPT_LABEL[d]}</option>)}
          </select>
        )}
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
          <option value="">Todos status</option>
          <option value="atrasada">Atrasadas</option>
          <option value="no_prazo">No prazo</option>
          <option value="concluida">Concluídas</option>
        </select>
        <input
          type="text"
          value={filtroOp}
          onChange={(e) => setFiltroOp(e.target.value)}
          placeholder="Filtrar por OP..."
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white w-32"
        />
        <button onClick={() => { setFiltroDepto(deptoFixo); setFiltroStatus(""); setFiltroOp(""); limparColunas(); }}
          className="text-xs text-torg-gray hover:text-torg-dark ml-auto">
          Limpar{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
        </button>
        {/* ⚠ o modo planilha é o padrão quando o setor está travado, mas dá para voltar aos
            cartões: em obra com muitas áreas o agrupamento ainda ajuda a ler. */}
        <button onClick={() => setTabela((v) => !v)}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white hover:bg-gray-50 inline-flex items-center gap-1.5"
          title={tabela ? "Ver agrupado por setor" : "Ver como planilha, com filtro por coluna"}>
          <ListFilter size={13} className="text-torg-gray" /> {tabela ? "Cartões" : "Planilha"}
        </button>
        <button onClick={carregar} className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100">
          <RefreshCw size={14} />
        </button>
        <button onClick={exportarRelatorio} disabled={exportando || !atividades.length}
          className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50"
          title="Exportar as atividades filtradas em Excel (padrão Torg)">
          {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Exportar
        </button>
      </div>

      {/* KPIs rápidos */}
      {!loading && atividades.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-torg-gray">{atividades.length} atividades</span>
          {atrasadas > 0 && (
            <button onClick={() => setFiltroStatus("atrasada")}
              className="px-2.5 py-1 bg-red-50 text-red-600 text-[11px] font-semibold rounded-full flex items-center gap-1 border border-red-200 hover:bg-red-100">
              <AlertTriangle size={11} /> {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}
            </button>
          )}
          {emAndamento > 0 && (
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-medium rounded-full border border-amber-200">
              {emAndamento} em andamento
            </span>
          )}
          {emHold > 0 && (
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-medium rounded-full border border-slate-200 flex items-center gap-1">
              <Lock size={11} /> {emHold} em hold
            </span>
          )}
          {concluidas > 0 && (
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-medium rounded-full border border-emerald-200">
              {concluidas} concluída{concluidas > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-torg-blue" size={24} />
        </div>
      ) : erro ? (
        <div className="text-center py-10">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline mt-2 flex items-center gap-1 mx-auto">
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : atividades.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <GanttChart size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhuma atividade encontrada.</p>
          <p className="text-xs text-torg-gray mt-1">Ajuste os filtros ou crie tarefas nos cronogramas.</p>
        </div>
      ) : (
        tabela ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200 text-torg-dark">
                  <ThFiltro col="op" label="OP" larg="w-[8%]" className="px-2 py-2 text-left font-bold" {...fp} />
                  <ThFiltro col="cliente" label="Cliente" larg="w-[13%]" className="px-2 py-2 text-left font-bold" {...fp} />
                  <th className="px-2 py-2 text-left font-bold w-[30%]">Atividade</th>
                  <ThFiltro col="area" label="Área" larg="w-[10%]" className="px-2 py-2 text-left font-bold" {...fp} />
                  <ThFiltro col="prazo" label="Prazo" larg="w-[10%]" className="px-2 py-2 text-left font-bold" {...fp} />
                  <th className="px-2 py-2 text-center font-bold w-[7%]">%</th>
                  <ThFiltro col="situacao" label="Situação" larg="w-[12%]"
                    dica="Em hold = tem motivo de bloqueio e ainda não foi liberada; enquanto está em hold não conta como atrasada."
                    className="px-2 py-2 text-left font-bold" {...fp} />
                  <th className="px-2 py-2 text-right font-bold w-[10%]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhasTabela.map((a, i) => (
                  <tr key={a.id} className={`border-b border-gray-50 ${i % 2 ? "bg-gray-50/40" : ""} hover:bg-torg-blue-50/40`}>
                    <td className="px-2 py-1.5 font-mono text-[11.5px] text-torg-dark">{fmtOP(a.opNumero) || "—"}</td>
                    <td className="px-2 py-1.5 text-torg-gray truncate" title={a.opCliente || ""}>{a.opCliente || "—"}</td>
                    <td className="px-2 py-1.5 text-torg-dark">{a.nome}</td>
                    <td className="px-2 py-1.5 text-torg-gray">{a.area || "—"}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${a.atrasada ? "text-red-700 font-semibold" : "text-torg-dark"}`}>
                      {dataBR(a.dataFimPrevista)}
                      {a.diasAtraso > 0 ? <span className="text-[10.5px] text-red-600"> · {a.diasAtraso}d</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums text-torg-dark">{Math.round(a.percentualRealizado || 0)}%</td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold border ${
                        a.concluida ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : a.bloqueada ? "bg-amber-50 text-amber-800 border-amber-200"
                        : a.atrasada ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                        {situacao(a)}
                      </span>
                      {a.bloqueada && a.motivoBloqueio
                        ? <span className="block text-[10.5px] text-torg-gray mt-0.5 truncate" title={a.motivoBloqueio}>{a.motivoBloqueio}</span>
                        : null}
                      {/* ⚠ o que o portal já sabe: recebimento lançado (Suprimentos) ou lista
                          importada (Engenharia). Propõe a baixa, não a faz sozinho. */}
                      {a.evidencia && !a.concluida && (
                        <span className="block text-[10.5px] text-green-700 mt-0.5">
                          ✓ {a.evidencia.resumo}
                          {a.evidencia.generica && <span className="text-torg-gray"> · confira se é o material desta tarefa</span>}
                          {a.evidencia.atendidaEm && (
                            <button onClick={() => baixarPelaEvidencia(a)} disabled={baixando === a.id}
                              className="ml-1 text-torg-blue hover:underline font-semibold disabled:opacity-50">
                              {baixando === a.id ? "baixando…" : "dar baixa nesta data"}
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => setPreencherAtiv(a)} title="Preencher / concluir (grava no cronograma)"
                        className="p-1 text-torg-gray hover:text-torg-blue rounded hover:bg-gray-100"><Pencil size={13} /></button>
                      <button onClick={() => setNotificarAtiv(a)} title="Notificar"
                        className="p-1 text-torg-gray hover:text-torg-blue rounded hover:bg-gray-100"><Mail size={13} /></button>
                    </td>
                  </tr>
                ))}
                {!linhasTabela.length && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-torg-gray text-[12px]">Nenhuma atividade com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-torg-gray">
            {linhasTabela.length} de {atividades.length} atividade(s)
          </div>
        </div>
        ) : (
        <div className="space-y-3">
          {gruposSetor.map(({ dept, ativas, cumpridas }) => {
            const atrasadasDept = ativas.filter((a) => a.atrasada).length;
            const emHoldDept = ativas.filter((a) => a.bloqueada).length;
            return (
              <div key={dept} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Cabeçalho do setor */}
                <div className="px-4 py-2 bg-gray-50/70 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded border ${DEPT_COR[dept] || "bg-gray-50 text-torg-gray border-gray-200"}`}>
                    {DEPT_LABEL[dept] || dept}
                  </span>
                  <span className="text-[11px] text-torg-gray">{ativas.length} pendente{ativas.length !== 1 ? "s" : ""}</span>
                  {atrasadasDept > 0 && (
                    <span className="text-[11px] font-semibold text-red-600 flex items-center gap-0.5"><AlertTriangle size={10} /> {atrasadasDept} atrasada{atrasadasDept > 1 ? "s" : ""}</span>
                  )}
                  {emHoldDept > 0 && (
                    <span className="text-[11px] font-medium text-slate-600 flex items-center gap-0.5"><Lock size={10} /> {emHoldDept} em hold</span>
                  )}
                  {cumpridas.length > 0 && (
                    <span className="text-[11px] text-emerald-600 flex items-center gap-0.5 ml-auto"><CheckCircle2 size={10} /> {cumpridas.length} cumprida{cumpridas.length > 1 ? "s" : ""}</span>
                  )}
                </div>

                {/* Ativas — detalhadas (a "programação" de fato) */}
                {ativas.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {ativas.map((a) => (
                          <tr key={a.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 align-top w-[130px]">
                              <span className="text-xs font-bold text-torg-blue font-mono">{fmtOP(a.opNumero)}</span>
                              {a.opCliente && <p className="text-[10px] text-torg-gray truncate max-w-[120px]">{a.opCliente}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="text-xs font-medium text-torg-dark">{a.nome}</p>
                              {a.area && <p className="text-[10px] text-torg-gray">{a.area}</p>}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap"><span className="text-xs text-torg-dark">{fmtData(a.dataFimPrevista)}</span></td>
                            <td className="px-3 py-2.5 text-center"><span className={`text-xs font-bold ${a.atrasada ? "text-red-600" : "text-torg-dark"}`}>{a.percentualRealizado}%</span></td>
                            <td className="px-3 py-2.5 text-center">
                              {a.bloqueada ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-full" title={a.motivoBloqueio || "Em hold"}><Lock size={10} /> Hold</span>
                              ) : a.atrasada ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded-full"><AlertTriangle size={10} /> {a.diasAtraso}d</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded-full"><Clock size={10} /> No prazo</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <button onClick={() => setPreencherAtiv(a)} className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100 transition-colors" title="Preencher / atualizar direto no cronograma"><Pencil size={14} /></button>
                              <button onClick={() => setNotificarAtiv(a)} className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100 transition-colors" title="Notificar por e-mail"><Mail size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-4 py-3 text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={13} /> Tudo cumprido neste setor.</p>
                )}

                {/* Cumpridas — 100% não descreve, fica só como "cumprida" (colapsado) */}
                {cumpridas.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-50 bg-emerald-50/20">
                    <button onClick={() => toggleCumpridas(dept)} className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 hover:text-emerald-800">
                      {expandidasCumpridas.has(dept) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <CheckCircle2 size={11} /> {cumpridas.length} tarefa{cumpridas.length > 1 ? "s" : ""} cumprida{cumpridas.length > 1 ? "s" : ""}
                    </button>
                    {expandidasCumpridas.has(dept) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {cumpridas.map((a) => (
                          <span key={a.id} className="text-[10px] text-torg-gray bg-white border border-emerald-100 rounded px-1.5 py-0.5">
                            <span className="font-mono text-emerald-700">{fmtOP(a.opNumero)}</span> · <span className="line-through">{a.nome}</span>{a.area ? <span className="text-torg-gray/70"> · {a.area}</span> : null}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )
      )}

      {notificarAtiv && (
        <ModalNotificar
          atividade={notificarAtiv}
          onClose={() => setNotificarAtiv(null)}
          onEnviado={(msg) => { setNotificarAtiv(null); avisar(msg, "sucesso"); }}
          onErro={(msg) => avisar(msg, "erro")}
        />
      )}

      {preencherAtiv && (
        <ModalPreencher
          atividade={preencherAtiv}
          onClose={() => setPreencherAtiv(null)}
          onSalvo={(msg) => { setPreencherAtiv(null); avisar(msg, "sucesso"); carregar(); }}
          onErro={(msg) => avisar(msg, "erro")}
        />
      )}
    </>
  );
}

// ─── Modal Preencher — atualiza a atividade DIRETO no cronograma (CronogramaTarefa) ──
function ModalPreencher({ atividade, onClose, onSalvo, onErro }) {
  const [pct, setPct] = useState(Number(atividade.percentualRealizado) || 0);
  const [dataReal, setDataReal] = useState("");
  const [obs, setObs] = useState(atividade.observacao || "");
  const [hold, setHold] = useState(!!atividade.bloqueada);
  const [motivoBloq, setMotivoBloq] = useState(atividade.motivoBloqueio || "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const body = {
        percentualRealizado: Math.max(0, Math.min(100, Number(pct) || 0)),
        observacao: obs.trim() || null,
        // Hold/Bloqueio: motivo preenchido = bloqueada (não conta atrasada + trava no cronograma); vazio = libera.
        motivoBloqueio: hold ? (motivoBloq.trim() || "Em hold — aguardando liberação") : null,
      };
      if (dataReal) body.dataFimReal = new Date(dataReal + "T12:00:00Z").toISOString();
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${atividade.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || j.success === false) throw new Error(j.error || "Erro ao salvar");
      onSalvo("Cronograma atualizado.");
    } catch (e) {
      onErro?.(e.message);
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <p className="text-base font-bold text-torg-dark flex items-center gap-2"><Pencil size={16} className="text-torg-blue" /> Preencher no cronograma</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-xs text-torg-gray mb-4">
          <span className="font-mono font-semibold">{fmtOP(atividade.opNumero)}</span> · {DEPT_LABEL[atividade.departamento] || atividade.departamento} · {atividade.nome}{atividade.area ? ` · ${atividade.area}` : ""}
        </p>

        <div className="mb-3">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">% concluído</span>
          <div className="flex items-center gap-2 mt-1">
            <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue outline-none" />
            <button onClick={() => setPct(100)} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 hover:bg-emerald-100 flex items-center gap-1">
              <CheckCircle2 size={13} /> Marcar cumprida (100%)
            </button>
          </div>
        </div>

        {/* Hold / Bloqueio */}
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
            <span className="text-xs font-semibold text-amber-800 flex items-center gap-1"><Lock size={13} /> Colocar em Hold / Bloqueio</span>
          </label>
          {hold && (
            <input value={motivoBloq} onChange={(e) => setMotivoBloq(e.target.value)}
              placeholder="Motivo (ex.: aguardando liberação do cliente)"
              className="mt-2 w-full border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500" />
          )}
          <p className="text-[10px] text-amber-700 mt-1.5">Em hold, a tarefa <b>não conta como atrasada</b> e <b>trava a sequência no cronograma</b>. Ao liberar, é só desmarcar.</p>
        </div>

        <label className="block mb-3">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Data de conclusão <span className="text-gray-400">(opcional)</span></span>
          <input type="date" value={dataReal} onChange={(e) => setDataReal(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue outline-none" />
        </label>

        <label className="block mb-4">
          <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Observação / evento</span>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3}
            placeholder="O que foi feito / status desta atividade…"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue outline-none" />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-torg-gray hover:text-torg-dark px-3 py-1.5">Cancelar</button>
          <button onClick={salvar} disabled={salvando}
            className="text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark px-4 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Salvar no cronograma
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal para escolher emails e notificar ──────────────
function ModalNotificar({ atividade, onClose, onEnviado, onErro }) {
  const [sugeridos, setSugeridos] = useState([]);
  const [loadingSugeridos, setLoadingSugeridos] = useState(true);
  const [selecionados, setSelecionados] = useState([]);
  const [emailExtra, setEmailExtra] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setLoadingSugeridos(true);
    fetch(`/api/planejamento/cronogramas/tarefas/${atividade.id}/notificar`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sugeridos) {
          setSugeridos(data.sugeridos);
          setSelecionados(data.sugeridos.map((s) => s.email));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSugeridos(false));
  }, [atividade.id]);

  function toggleEmail(email) {
    setSelecionados((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  function adicionarExtra() {
    const e = emailExtra.trim().toLowerCase();
    if (!e || !e.includes("@")) return;
    if (!selecionados.includes(e)) setSelecionados((prev) => [...prev, e]);
    if (!sugeridos.find((s) => s.email === e)) {
      setSugeridos((prev) => [...prev, { email: e, nome: e, origem: "manual" }]);
    }
    setEmailExtra("");
  }

  async function enviar() {
    if (selecionados.length === 0) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/planejamento/cronogramas/tarefas/${atividade.id}/notificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: selecionados, mensagem: mensagem.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      onEnviado(`Notificação enviada para ${data.enviados} destinatário(s)`);
    } catch (e) {
      onErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  const a = atividade;
  const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2">
            <Mail size={15} className="text-torg-blue" /> Notificar Atividade
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Resumo da atividade */}
        <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-torg-blue font-mono">{fmtOP(a.opNumero)}</span>
            {a.opCliente && <span className="text-[10px] text-torg-gray">({a.opCliente})</span>}
            <span className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded border ${DEPT_COR[a.departamento] || "bg-gray-50 text-torg-gray border-gray-200"}`}>
              {DEPT_LABEL[a.departamento] || a.departamento}
            </span>
          </div>
          <p className="text-sm font-medium text-torg-dark">{a.nome}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-torg-gray">
            <span>Prazo: {fmtData(a.dataFimPrevista)}</span>
            <span>Realizado: {a.percentualRealizado}%</span>
            {a.atrasada && <span className="text-red-600 font-semibold">{a.diasAtraso}d de atraso</span>}
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Destinatários */}
          <div>
            <label className="block text-xs font-semibold text-torg-dark mb-2">Destinatários</label>
            {loadingSugeridos ? (
              <div className="flex items-center gap-2 text-xs text-torg-gray py-2">
                <Loader2 size={12} className="animate-spin" /> Buscando e-mails sugeridos...
              </div>
            ) : (
              <div className="space-y-1.5">
                {sugeridos.map((s) => (
                  <label key={s.email} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selecionados.includes(s.email)}
                      onChange={() => toggleEmail(s.email)}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue"
                    />
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {s.origem === "cliente" ? (
                        <Building2 size={12} className="text-amber-600 shrink-0" />
                      ) : s.origem === "manual" ? (
                        <Mail size={12} className="text-torg-gray shrink-0" />
                      ) : (
                        <User size={12} className="text-torg-blue shrink-0" />
                      )}
                      <span className="text-xs text-torg-dark font-medium truncate">{s.nome}</span>
                      <span className="text-[10px] text-torg-gray truncate">{s.email}</span>
                    </div>
                    {s.origem === "cliente" && (
                      <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium shrink-0">Cliente</span>
                    )}
                  </label>
                ))}
                {sugeridos.length === 0 && (
                  <p className="text-xs text-torg-gray italic py-1">Nenhum e-mail sugerido para este departamento.</p>
                )}
              </div>
            )}

            {/* Adicionar email manual */}
            <div className="flex items-center gap-2 mt-2">
              <input
                type="email"
                value={emailExtra}
                onChange={(e) => setEmailExtra(e.target.value)}
                placeholder="Adicionar outro e-mail..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarExtra())}
              />
              <button
                onClick={adicionarExtra}
                disabled={!emailExtra.includes("@")}
                className="px-3 py-1.5 text-xs text-torg-blue border border-torg-blue/30 rounded-lg hover:bg-torg-blue-50 disabled:opacity-40"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Mensagem opcional */}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Mensagem (opcional)</label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              rows={2}
              placeholder="Ex: Favor priorizar esta atividade..."
            />
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[10px] text-torg-gray">{selecionados.length} destinatário(s)</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={enviando || selecionados.length === 0}
              className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {enviando ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
