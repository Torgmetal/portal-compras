"use client";
// Painel da OP na TV do PCP — duas abas:
//   • Liberar       → área de trabalho do setor: lista as peças a concluir (filtro + seleção),
//                     dá BAIXA (por quantidade), importa planilha (marca + qtd) e ainda destina
//                     as em aberto (Prioridade / Terceiro / Revisão / Aguardando / Cancelar).
//   • Peças prontas → histórico do que já teve baixa NAQUELE setor: qtd total, qtd baixada, qtd
//                     produzida no Syneco, peso unitário e peso total (extremo sincronismo).
// Baixa é SÓ do portal (PecaConjunto.baixaSetores[setor] = { qtd, em, por }); não escreve no Syneco.
// Reusa /api/pcp/despacho (GET peças+placar+reconciliação, POST despacha / dá baixa por qtd).
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { X, Loader2, Star, Truck, RotateCcw, Ban, Package, FileDown, FileUp, CheckCircle2, Undo2, ClipboardList, ChevronRight, ChevronDown, Factory, FileText } from "lucide-react";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";
import TerceiroModal from "./TerceiroModal";

const DESTINOS = [
  { key: "PRIORIDADE", label: "Prioridade", icon: Star, cor: "bg-amber-500 hover:bg-amber-600", desc: "libera p/ desenho e corte" },
  { key: "TERCEIRO", label: "Terceiro", icon: Truck, cor: "bg-indigo-600 hover:bg-indigo-700", desc: "terceiriza (vai p/ /pcp/terceirizados)" },
  { key: "REVISAO", label: "Revisão", icon: RotateCcw, cor: "bg-sky-600 hover:bg-sky-700", desc: "volta p/ engenharia revisar" },
  { key: "AGUARDANDO_MATERIAL", label: "Aguard. material", icon: Package, cor: "bg-slate-500 hover:bg-slate-600", desc: "trava esperando matéria-prima" },
  { key: "CANCELADA", label: "Cancelar", icon: Ban, cor: "bg-red-600 hover:bg-red-700", desc: "tira do escopo" },
];
const VOLTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const ROTULO = { ABERTO: "Em aberto", PRIORIDADE: "Prioridade", TERCEIRO: "Terceiro", REVISAO: "Revisão", AGUARDANDO_MATERIAL: "Aguard. material", CANCELADA: "Cancelada" };
const SETOR_LABEL = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };
const LIMITE = 400;
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function DespachoPanel({ obra, setor, onClose, abaInicial = "despacho" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [terceiroVolta, setTerceiroVolta] = useState("MONTAGEM");
  const [aba, setAba] = useState(setor ? abaInicial : "despacho"); // "despacho"(Liberar) | "prontas"
  const [filtro, setFiltro] = useState("");
  const [expandido, setExpandido] = useState(() => new Set()); // conjuntos abertos (ver croquis faltantes)
  const [terceiroPecas, setTerceiroPecas] = useState(null); // peças abertas no modal de terceiro
  const [desenhoMarca, setDesenhoMarca] = useState(null); // marca aberta no modal de desenhos (GRD)
  const [encSetor, setEncSetor] = useState("JATO"); // setor do "enviar direto p/ setor"
  const [encPrio, setEncPrio] = useState(true); // enviar pro setor JÁ marcando prioridade
  const podeBaixa = !!setor;
  const toggleExpand = (id) => setExpandido((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/despacho?obra=${encodeURIComponent(obra)}${setor ? `&setor=${setor}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j); setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [obra, setor]);
  useEffect(() => { carregar(); }, [carregar]);

  // Enviar a OP inteira pra produção (ação da OP, não das peças): liga/desliga OP.emProducao.
  // Só as OPs em produção aparecem nas telas de Prioridades de Produção.
  const enviarProducao = async () => {
    if (!data?.opId) return;
    const novo = !data.emProducao;
    setEnviando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/op-em-producao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opId: data.opId, emProducao: novo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao enviar para produção");
      setData((d) => ({ ...d, emProducao: novo }));
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  };

  const pecas = data?.pecas || [];
  const filtrar = (arr) => { const q = filtro.trim().toLowerCase(); return q ? arr.filter((p) => `${p.marca} ${p.descricao || ""}`.toLowerCase().includes(q)) : arr; };
  // "Feito" no setor = o maior entre o produzido no Syneco e a baixa do portal. Assim o que já
  // foi produzido (mesmo sem baixa no portal) NÃO aparece como pendente. (Vitor: "não temos
  // essas peças para fazer" — eram peças já produzidas no Syneco.)
  const feitoQtd = (p) => Math.max(p.baixadoQtd || 0, p.produzidoSyneco || 0);
  // Liberar: só o que FALTA — não concluído no Syneco nem baixado no portal.
  const pendentes = useMemo(() => pecas.filter((p) => feitoQtd(p) < (p.qte || 1)), [pecas]);
  // Peças prontas: já concluídas no setor (produzidas no Syneco OU baixadas no portal) — histórico.
  const prontas = useMemo(() => pecas.filter((p) => feitoQtd(p) >= (p.qte || 1)), [pecas]);
  const listaLiberar = useMemo(() => filtrar(pendentes), [pendentes, filtro]);
  const listaProntas = useMemo(() => filtrar(prontas), [prontas, filtro]);
  const visiveis = aba === "prontas" ? listaProntas : listaLiberar;
  const visLimit = visiveis.slice(0, LIMITE);

  // em aberto (pra destinos) = sem destino e PENDENTE, dentro do que está selecionado
  const emAbertoSel = () => [...sel].filter((id) => { const p = pecas.find((x) => x.id === id); return p && !p.destino && p.status === "PENDENTE"; });

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selTodas = () => setSel((s) => (s.size === visLimit.length && visLimit.length ? new Set() : new Set(visLimit.map((p) => p.id))));
  const trocaAba = (a) => { setAba(a); setSel(new Set()); };

  async function post(body, okMsg) {
    setEnviando(true);
    try {
      const r = await fetch("/api/pcp/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      await carregar();
      if (okMsg) alert(okMsg(j));
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  async function despachar(destino) {
    const ids = emAbertoSel();
    if (!ids.length) return alert("Selecione peças em aberto (sem destino) para destinar.");
    await post({ ids, destino });
  }
  // Encaminhar DIRETO pra um setor (ex.: Jato) — a peça pula as etapas anteriores e fica pendente
  // no setor escolhido; com "priorizar", também ganha o número de prioridade.
  async function encaminhar() {
    const ids = [...sel];
    if (!ids.length) return alert("Selecione as peças para enviar ao setor.");
    await post({ ids, encaminharSetor: encSetor, comPrioridade: encPrio }, (j) => `${j.atualizados} peça(s) enviada(s) para ${SETOR_LABEL[encSetor] || encSetor}${encPrio ? " (com prioridade)" : ""}.`);
  }
  // Terceiro abre um modal (escolher fornecedor + retorno + gerar romaneio) em vez de despachar direto.
  function abrirTerceiro() {
    const alvo = (data?.pecas || []).filter((p) => sel.has(p.id));
    if (!alvo.length) return alert("Selecione as peças para enviar ao terceiro.");
    setTerceiroPecas(alvo);
  }
  async function baixar() {
    const alvo = pendentes.filter((p) => sel.has(p.id));
    if (!alvo.length) return;
    // A baixa no portal é só o "atalho" pro delay do Syneco: peça que JÁ tem apontamento no Syneco
    // não precisa (e não deixa) baixar de novo — deixa o Syneco terminar.
    const jaSyneco = alvo.filter((p) => (p.produzidoSyneco || 0) > 0);
    const baixaveis = alvo.filter((p) => !((p.produzidoSyneco || 0) > 0));
    if (!baixaveis.length) return alert("Essas peças já têm apontamento no Syneco — não precisa dar baixa pelo portal.");
    const baixas = baixaveis.map((p) => ({ id: p.id, qtd: p.qte || 1 })); // baixa a peça inteira
    await post({ baixaSetor: setor, baixas }, jaSyneco.length ? (j) => `Baixa em ${j.atualizados} peça(s). ${jaSyneco.length} já no Syneco — ignoradas.` : null);
  }
  async function reverterBaixa() {
    if (!sel.size) return;
    await post({ baixaSetor: setor, reverterBaixa: true, ids: [...sel] });
  }

  // Baixa em massa por planilha: coluna "Peça"/"Marca" + (opcional) "Qtd"/"Quantidade"; casa por
  // marca e dá baixa na quantidade informada (sem coluna de qtd → peça inteira).
  async function importar(file) {
    if (!file || !setor) return;
    setEnviando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: "" });
      let hRow = -1, cMarca = -1, cQtd = -1;
      for (let r = 0; r < grid.length && hRow < 0; r++) {
        const row = (grid[r] || []).map((x) => String(x).trim().toLowerCase());
        const jm = row.findIndex((x) => x === "peça" || x === "peca" || x === "marca");
        if (jm >= 0) { hRow = r; cMarca = jm; cQtd = row.findIndex((x) => x === "qtd" || x.includes("quantidade") || x === "qtd baixada" || x === "qtde"); }
      }
      if (hRow < 0) throw new Error('Não achei a coluna "Peça"/"Marca" na planilha.');
      const idx = new Map();
      for (const p of pecas) idx.set(String(p.marca).trim().toUpperCase(), p);
      const baixas = [], naoAchou = [], jaSyneco = []; const vistos = new Set();
      for (let r = hRow + 1; r < grid.length; r++) {
        const m = String(grid[r]?.[cMarca] ?? "").trim();
        if (!m) continue;
        const p = idx.get(m.toUpperCase());
        if (!p) { naoAchou.push(m); continue; }
        if (vistos.has(p.id)) continue; vistos.add(p.id);
        if ((p.produzidoSyneco || 0) > 0) { jaSyneco.push(m); continue; } // já no Syneco → não baixa de novo
        let qtd = p.qte || 1;
        if (cQtd >= 0) { const q = parseInt(String(grid[r][cQtd]).replace(/\D/g, ""), 10); if (Number.isFinite(q) && q > 0) qtd = q; }
        baixas.push({ id: p.id, qtd });
      }
      if (!baixas.length) throw new Error(jaSyneco.length ? `Todas as marcas da planilha já têm apontamento no Syneco — nada a baixar pelo portal.` : `Nenhuma das marcas da planilha bate com peças desta OP/setor.`);
      const aviso = [naoAchou.length ? `${naoAchou.length} não encontrada(s): ${naoAchou.slice(0, 6).join(", ")}${naoAchou.length > 6 ? "…" : ""}` : "", jaSyneco.length ? `${jaSyneco.length} já no Syneco (ignoradas)` : ""].filter(Boolean).join("\n");
      if (!confirm(`Dar baixa em ${baixas.length} peça(s) de ${SETOR_LABEL[setor] || setor}?${aviso ? "\n\n" + aviso : ""}`)) { setEnviando(false); return; }
      await post({ baixaSetor: setor, baixas }, (j) => `Baixa aplicada em ${j.atualizados} peça(s).${naoAchou.length ? ` ${naoAchou.length} não encontradas.` : ""}${jaSyneco.length ? ` ${jaSyneco.length} já no Syneco.` : ""}`);
    } catch (e) { alert(e.message); setEnviando(false); }
  }

  async function exportar() {
    // RELAÇÃO p/ o setor de apontamento: peças baixadas MANUALMENTE no portal que o Syneco ainda
    // não tem (precisaSyneco) — o apontamento deve dar baixa dessas no Syneco. Mesmo modelo da LPC
    // (Marca/Tipo/Peso) + coluna Observação. Some sozinho quando o Syneco sincroniza (a peça deixa
    // de ser precisaSyneco).
    const base = (data?.pecas || []).filter((p) => p.precisaSyneco).sort((a, b) => String(a.marca).localeCompare(String(b.marca)));
    if (!base.length) return alert("Nenhuma peça baixada manualmente pendente de apontamento no Syneco.");
    const hoje = new Date().toISOString().split("T")[0];
    const nomeSetor = setor ? SETOR_LABEL[setor] || setor : "Geral";
    const tipoTxt = (t) => (t === "CONJUNTO" ? "Conjunto" : t === "CROQUI" ? "Croqui" : "Avulsa");
    const headers = ["Marca", "Tipo", "Peso (kg)", "Observação"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Apontar no Syneco — ${obra}${setor ? ` (${nomeSetor})` : ""}`,
      subtitulo: `${obra} · Setor: ${nomeSetor} · baixadas manualmente no portal — dar baixa no Syneco`,
      kpis: [`${base.length} peça(s) p/ apontar no Syneco`],
      totalColunas: headers.length, nomePlanilha: "Apontar Syneco", codigoDoc: "REL-ENG-002",
    });
    ws.columns = [{ width: 20 }, { width: 12 }, { width: 14 }, { width: 46 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    const first = row;
    for (const p of base) {
      const quando = p.baixadoEm ? ` em ${new Date(p.baixadoEm).toLocaleDateString("pt-BR")}` : "";
      const obs = `Dar baixa no Syneco (${nomeSetor}): ${fmtN(p.baixadoQtd)} un — baixa manual no portal${p.baixadoPor ? ` por ${p.baixadoPor}` : ""}${quando}`;
      adicionarLinhaTabela(ws, row, [p.marca, tipoTxt(p.tipoPeca), p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : "", obs], { alinhamento: { 1: "center", 2: "right" } });
      row++;
    }
    if (row > first) adicionarLinhaTotais(ws, row, ["TOTAL", "", { formula: `SUM(C${first}:C${row - 1})` }, ""]);
    await downloadWorkbook(workbook, `Apontar_Syneco_${obra}${setor ? "_" + nomeSetor : ""}_${hoje}.xlsx`);
  }

  const th = "text-left px-2.5 py-2 font-semibold text-torg-gray";
  const td = "px-2.5 py-1.5";

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold">{obra}{setor ? ` · ${SETOR_LABEL[setor] || setor}` : ""}</h2>
            {data && <p className="text-[12px] text-torg-gray">{fmtN(data.total)} peça(s){podeBaixa ? ` · ${fmtN(pendentes.length)} a liberar · ${fmtN(prontas.length)} prontas` : ""}{podeBaixa && data.precisamSyneco > 0 ? ` · ${fmtN(data.precisamSyneco)} p/ acertar no Syneco` : ""}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportar} disabled={!data} title="Relação das peças baixadas manualmente p/ o setor de apontamento dar baixa no Syneco" className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><FileDown size={13} /> Relação Syneco</button>
            <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-5 pt-2 border-b border-gray-100">
          <button onClick={() => trocaAba("despacho")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-t-lg ${aba === "despacho" ? "bg-torg-blue text-white" : "text-torg-gray hover:bg-gray-50"}`} title="Liberar a peça pro próximo passo do fluxo">Liberar</button>
          <button onClick={() => trocaAba("prontas")} disabled={!podeBaixa} title={podeBaixa ? "Histórico do que já teve baixa" : "Abra por setor"} className={`text-[13px] font-semibold px-3 py-1.5 rounded-t-lg disabled:opacity-40 inline-flex items-center gap-1 ${aba === "prontas" ? "bg-emerald-600 text-white" : "text-torg-gray hover:bg-gray-50"}`}><ClipboardList size={13} /> Peças prontas{data ? ` (${fmtN(prontas.length)})` : ""}</button>
        </div>

        {/* Toolbar: filtro + importar + placar */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-2 border-b border-gray-50">
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por marca ou descrição…" className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]" />
          {podeBaixa && aba === "despacho" && (
            <label className={`text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 ${enviando ? "opacity-40 pointer-events-none" : "hover:bg-blue-50 cursor-pointer"}`} title="Dá baixa em massa a partir de uma planilha (colunas Peça/Marca e Qtd)">
              <FileUp size={13} /> Importar planilha
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importar(f); }} />
            </label>
          )}
          {data && aba === "despacho" && Object.entries(data.placar).filter(([, v]) => v > 0).map(([k, v]) => (
            <span key={k} className="bg-gray-100 rounded-full px-2 py-0.5 text-[11px] font-medium">{ROTULO[k] || k}: {v}</span>
          ))}
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto px-5 py-2">
          {loading && <div className="py-10 text-center text-torg-gray"><Loader2 className="mx-auto animate-spin" /></div>}
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          {!loading && !erro && visiveis.length === 0 && (
            <p className="text-torg-gray text-sm text-center py-10">{aba === "prontas" ? "Nenhuma peça com baixa ainda." : filtro ? "Nenhuma peça no filtro." : "Nada a liberar — tudo pronto. 🎉"}</p>
          )}
          {!loading && visiveis.length > 0 && (
            <table className="w-full text-[13px] min-w-[820px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide">
                  <th className="px-2 py-2 w-8"><input type="checkbox" checked={sel.size === visLimit.length && visLimit.length > 0} onChange={selTodas} /></th>
                  <th className={th}>Marca</th>
                  <th className={th}>Descrição</th>
                  <th className={`${th} text-right`}>Qtd</th>
                  <th className={`${th} text-right`}>Baixada</th>
                  <th className={`${th} text-right`}>Produz. Syneco</th>
                  <th className={`${th} text-right`}>Peso un.</th>
                  <th className={`${th} text-right`}>Peso tot.</th>
                  <th className={`${th} text-center`}>Syneco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visLimit.map((p) => {
                  const temFalta = Array.isArray(p.faltamCroquis) && p.faltamCroquis.length > 0;
                  const aberto = expandido.has(p.id);
                  return (
                  <Fragment key={p.id}>
                  <tr className={`hover:bg-gray-50 cursor-pointer ${sel.has(p.id) ? "bg-blue-50/50" : ""}`} onClick={() => toggle(p.id)}>
                    <td className="px-2 py-1.5"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className={`${td} font-mono font-semibold whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5">
                        {p.marca}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setDesenhoMarca(p.marca); }} title="Ver os desenhos/projetos da Engenharia (imprimir + GRD)"
                          className="text-gray-300 hover:text-torg-blue shrink-0"><FileText size={13} /></button>
                      </span>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className="text-torg-gray max-w-[240px] truncate" title={p.descricao || ""}>{p.descricao || "—"}</span>
                        {p.prontoMontar === true && <span className="shrink-0 text-emerald-700 bg-emerald-50 text-[10px] rounded px-1.5 py-0.5 inline-flex items-center gap-0.5"><CheckCircle2 size={10} /> pronto p/ montar</span>}
                        {p.prontoMontar === false && temFalta && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }} title="Ver as peças que faltam cortar"
                            className="shrink-0 text-amber-700 bg-amber-50 hover:bg-amber-100 text-[10px] rounded px-1.5 py-0.5 inline-flex items-center gap-0.5 font-medium">
                            falta {p.faltamCroquis.length} {aberto ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{fmtN(p.qte)}</td>
                    <td className={`${td} text-right tabular-nums ${p.baixadoQtd ? "text-emerald-700 font-semibold" : "text-gray-300"}`}>{p.baixadoQtd ? fmtN(p.baixadoQtd) : "—"}</td>
                    <td className={`${td} text-right tabular-nums ${p.produzidoSyneco ? "text-emerald-700 font-medium" : "text-torg-gray"}`} title={p.produzidoSyneco ? "Já tem apontamento no Syneco — não precisa dar baixa pelo portal" : ""}>{p.produzidoSyneco ? fmtN(p.produzidoSyneco) : "—"}</td>
                    <td className={`${td} text-right tabular-nums text-torg-gray`}>{p.pesoUnitKg ? fmtKg(p.pesoUnitKg) : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{p.pesoTotalKg ? fmtKg(p.pesoTotalKg) : "—"}</td>
                    <td className={`${td} text-center`}>
                      {p.baixadoPortal
                        ? (p.precisaSyneco
                          ? <span className="text-red-700 bg-red-50 text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap font-semibold" title="Baixado só no portal — o Syneco ainda não tem produção equivalente. Precisa dar baixa no Syneco.">Dar baixa</span>
                          : <span className="text-emerald-700 bg-emerald-50 text-[10px] rounded px-1.5 py-0.5">ok</span>)
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                  {aberto && temFalta && (
                    <tr className="bg-amber-50/40">
                      <td></td>
                      <td colSpan={8} className="px-2.5 pb-2 pt-0">
                        <div className="text-[11px] max-w-2xl">
                          <div className="text-amber-700 font-semibold mb-1">Faltam cortar ({p.faltamCroquis.length}):</div>
                          <div className="space-y-0.5">
                            {p.faltamCroquis.map((c, i) => (
                              <div key={i} className="flex items-baseline gap-1.5">
                                <span className="font-mono font-semibold text-torg-dark shrink-0">{c.marca}</span>
                                {c.descricao && <span className="text-torg-gray truncate">· {c.descricao}</span>}
                                <span className="text-amber-700 font-semibold tabular-nums shrink-0 ml-auto">faltam {fmtN(c.faltaQtd)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {visiveis.length > LIMITE && <p className="text-[11px] text-torg-gray mt-2">Mostrando {LIMITE} de {fmtN(visiveis.length)} — use o filtro pra refinar (o "Selecionar todas" pega as {LIMITE} visíveis).</p>}
        </div>

        {/* Ações por aba */}
        {aba === "prontas" ? (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-2 flex-wrap">
            <button onClick={reverterBaixa} disabled={!sel.size || enviando} className="text-[12px] font-semibold text-torg-dark rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 bg-gray-100 hover:bg-gray-200"><Undo2 size={13} /> Reverter baixa</button>
            <p className="text-[11px] text-torg-gray">{sel.size} selecionada(s) · histórico do que já teve baixa neste setor.</p>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-5 py-3 space-y-2">
            {/* Ação da OP inteira: enviar/tirar da produção (independe da seleção de peças). */}
            <div className="flex items-center gap-2 flex-wrap pb-1">
              <button onClick={enviarProducao} disabled={enviando || !data?.opId}
                title="Envia a OP INTEIRA pra produção — só as OPs em produção aparecem nas telas de Prioridades de Produção"
                className={`text-[12px] font-bold rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 ${data?.emProducao ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-torg-dark text-white hover:opacity-90"}`}>
                <Factory size={13} /> {data?.emProducao ? "Em produção ✓" : "Enviar para produção"}
              </button>
              <span className="text-[11px] text-torg-gray">{data?.emProducao ? "Esta OP aparece nas telas de produção — clique p/ tirar." : "Esta OP NÃO aparece nas telas de produção ainda."}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {podeBaixa && (
                <button onClick={baixar} disabled={!sel.size || enviando} title="Dá baixa (peça inteira) nas selecionadas neste setor"
                  className="text-[12px] font-semibold text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 size={13} /> Dar baixa em {setor ? SETOR_LABEL[setor] || setor : ""}</button>
              )}
              <span className="w-px h-6 bg-gray-200 mx-1" />
              <span className="text-[11px] text-torg-gray">Destinar em aberto:</span>
              {DESTINOS.map((d) => (
                <button key={d.key} onClick={() => (d.key === "TERCEIRO" ? abrirTerceiro() : despachar(d.key))} disabled={!sel.size || enviando} title={d.key === "TERCEIRO" ? "Escolher fornecedor + setor de retorno e gerar o romaneio do terceiro" : d.desc}
                  className={`text-[11px] font-semibold text-white rounded-lg px-2.5 py-2 inline-flex items-center gap-1 disabled:opacity-40 ${d.cor}`}><d.icon size={12} /> {d.label}</button>
              ))}
              <span className="w-px h-6 bg-gray-200 mx-1" />
              {/* Enviar DIRETO pra um setor (pula as etapas anteriores) — ex.: prioridade + direto pro Jato */}
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[11px] text-torg-gray">Enviar p/ setor:</span>
                <select value={encSetor} onChange={(e) => setEncSetor(e.target.value)} disabled={enviando}
                  className="text-[11px] font-semibold border border-gray-300 rounded-lg px-1.5 py-[7px]">
                  {["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"].map((s) => <option key={s} value={s}>{SETOR_LABEL[s] || s}</option>)}
                </select>
                <label className="inline-flex items-center gap-1 text-[11px] text-torg-gray cursor-pointer" title="Além de enviar, já marca as peças como prioridade (1,2,3…)">
                  <input type="checkbox" checked={encPrio} onChange={(e) => setEncPrio(e.target.checked)} /> priorizar
                </label>
                <button onClick={encaminhar} disabled={!sel.size || enviando} title="A peça pula as etapas anteriores e entra na fila do setor escolhido"
                  className="text-[11px] font-semibold text-white rounded-lg px-2.5 py-2 inline-flex items-center gap-1 disabled:opacity-40 bg-teal-600 hover:bg-teal-700"><ChevronRight size={12} /> Enviar</button>
              </span>
            </div>
            <p className="text-[11px] text-torg-gray">{sel.size} selecionada(s) · <b>Dar baixa</b> = concluída no setor (vai pro histórico). Destinar age só nas <b>em aberto</b>. A baixa é do portal; a coluna Syneco mostra o que falta acertar lá.</p>
          </div>
        )}
      </div>
    </div>
    {terceiroPecas && (
      <TerceiroModal obra={obra} opId={data?.opId} setor={setor} pecas={terceiroPecas}
        onClose={() => setTerceiroPecas(null)}
        onDone={() => { setTerceiroPecas(null); setSel(new Set()); carregar(); }} />
    )}
    {desenhoMarca && data?.opNumero && (
      <DesenhoPecaModal opNumero={data.opNumero} opId={data?.opId} marca={desenhoMarca} setor="PCP" onClose={() => setDesenhoMarca(null)} />
    )}
    </>
  );
}
