"use client";
// Painel da OP na TV do PCP — duas abas:
//   • Liberar       → área de trabalho do setor: lista as peças a concluir (filtro + seleção),
//                     dá BAIXA (por quantidade), importa planilha (marca + qtd) e ainda destina
//                     as em aberto (Prioridade / Terceiro) e mostra o MATERIAL de cada peça (CMR).
//   • Peças prontas → histórico do que já teve baixa NAQUELE setor: qtd total, qtd baixada, qtd
//                     produzida no Syneco, peso unitário e peso total (extremo sincronismo).
// Baixa é SÓ do portal (PecaConjunto.baixaSetores[setor] = { qtd, em, por }); não escreve no Syneco.
// Reusa /api/pcp/despacho (GET peças+placar+reconciliação, POST despacha / dá baixa por qtd).
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { X, Loader2, Star, Truck, Package, FileDown, FileUp, CheckCircle2, Undo2, ClipboardList, ChevronRight, ChevronDown, Factory, FileText, AlertTriangle } from "lucide-react";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import CompraChip, { ModalRastreabilidade } from "@/components/CompraChip";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";
import TerceiroModal from "./TerceiroModal";
import SeparacaoModal from "./SeparacaoModal";

// Só os destinos que o PCP usa de fato. Revisão / Aguard. material / Cancelar saíram a pedido do
// Vitor (18/08) — não faziam sentido no dia a dia e poluíam a barra. O status de material agora
// vem do CMR, item a item, então "Aguard. material" virou informação, não ação.
const DESTINOS = [
  { key: "PRIORIDADE", label: "Prioridade", icon: Star, cor: "bg-amber-500 hover:bg-amber-600", desc: "libera p/ desenho e corte" },
  { key: "TERCEIRO", label: "Terceiro", icon: Truck, cor: "bg-indigo-600 hover:bg-indigo-700", desc: "terceiriza (vai p/ /pcp/terceirizados)" },
];
const VOLTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const ROTULO = { ABERTO: "Em aberto", PRIORIDADE: "Prioridade", TERCEIRO: "Terceiro", REVISAO: "Revisão", AGUARDANDO_MATERIAL: "Aguard. material", CANCELADA: "Cancelada" };
const SETOR_LABEL = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };
const LIMITE = 400;
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

// PROGRAMAÇÃO (Syneco): o programador já lançou a peça na produção? A ordem do Syneco nasce
// quando ele lança — peça sem ordem nenhuma ainda não foi programada. (Vitor 18/08.)
const PROG = {
  INICIADA: { txt: "iniciada", cls: "bg-emerald-50 text-emerald-700", dica: "A ordem deste setor já rodou no Syneco (produzindo ou finalizada)." },
  PROGRAMADA: { txt: "programada", cls: "bg-sky-50 text-sky-700", dica: "O programador já lançou a peça na produção (ordem aberta no Syneco), ainda não iniciada." },
  OUTRO_SETOR: { txt: "lançada", cls: "bg-slate-100 text-slate-600", dica: "O programador lançou a peça na produção, mas o Syneco não tem ordem deste setor pra ela." },
  NAO_LANCADA: { txt: "não lançada", cls: "bg-red-50 text-red-700", dica: "O programador ainda NÃO lançou esta peça na produção (sem ordem no Syneco)." },
};
// "Programada" pro filtro = o programador LANÇOU a peça (existe ordem no Syneco), mesmo que a
// ordem deste setor específico não exista. A coluna mostra o detalhe.
const foiProgramada = (p) => !!p?.programacao && p.programacao.situacao !== "NAO_LANCADA";
// Botãozinho de filtro (segmentado) — "todos / com / sem", pra selecionar em bloco.
function Seg({ valor, onChange, opcoes, titulo }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] text-torg-gray">{titulo}:</span>
      <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        {opcoes.map((o) => (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} title={o.dica}
            className={`text-[11px] font-semibold px-2.5 py-1 border-r border-gray-200 last:border-r-0 ${valor === o.key ? o.ativo || "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"}`}>
            {o.label}{o.n != null ? ` (${fmtN(o.n)})` : ""}
          </button>
        ))}
      </span>
    </span>
  );
}

// Textos usados nos Excel. A coluna MATERIAL leva SÓ a descrição do material — rastreabilidade,
// corrida, NF, pedido, fornecedor e data têm cada uma a sua coluna. (Vitor 18/08: "na coluna
// material descrever apenas o material, não repetir a rastreabilidade, lote, NF, corrida, data".)
const textoMaterial = (p) => {
  if (!p.perfil) return "";
  return p.material?.material || "sem material";
};
const textoProg = (p) => (p.programacao ? PROG[p.programacao.situacao]?.txt || "" : "");
// Corrida em branco no CMR é informação, não vazio — o Vitor quer ver pra ir conferir.
const textoCorrida = (p) => (!p.perfil || !p.material ? "" : p.material.corrida || "sem corrida no CMR");

export default function DespachoPanel({ obra, setor, onClose, abaInicial = "despacho" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [terceiroVolta, setTerceiroVolta] = useState("MONTAGEM");
  const [aba, setAba] = useState(setor ? abaInicial : "despacho"); // "despacho"(Liberar) | "prontas"
  const [filtro, setFiltro] = useState("");
  // Filtros de bloco (Vitor 18/08: "um seletor de com material e sem material" — a seleção em
  // massa depende disso). Mesma ideia para a PROGRAMAÇÃO do Syneco.
  const [fMaterial, setFMaterial] = useState("TODOS"); // TODOS | COM | SEM
  const [fProg, setFProg] = useState("TODOS"); // TODOS | PROG | NAO
  const [fMont, setFMont] = useState("TODAS"); // TODAS | LIBERADAS | AGUARDANDO (só na Montagem)
  const [rastroOp, setRastroOp] = useState(false); // modal de rastreabilidade da OP inteira
  const [rastroItem, setRastroItem] = useState(null); // peça com a rastreabilidade do material dela
  const [progItem, setProgItem] = useState(null); // peça com as ordens do Syneco (conferir a programação)
  const [separacao, setSeparacao] = useState(null); // lista de separação de material (Almoxarifado)
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
  const filtrar = (arr) => {
    const q = filtro.trim().toLowerCase();
    let r = q ? arr.filter((p) => `${p.marca} ${p.descricao || ""}`.toLowerCase().includes(q)) : arr;
    // Material (CMR): "com" = o perfil já tem recebimento nesta OP; "sem" = ainda não chegou.
    // Peça sem perfil (conjunto/GC) não tem material de corte — fica fora dos dois.
    if (fMaterial === "COM") r = r.filter((p) => p.perfil && p.material);
    else if (fMaterial === "SEM") r = r.filter((p) => p.perfil && !p.material);
    if (fProg === "PROG") r = r.filter(foiProgramada);
    else if (fProg === "NAO") r = r.filter((p) => !foiProgramada(p));
    // Montagem: o ÚNICO setor que depende de outro (o conjunto espera os croquis serem cortados).
    // prontoMontar null = conjunto sem croqui na LPC (ex.: guarda-corpo) — não espera nada, é liberada.
    if (fMont === "AGUARDANDO") r = r.filter((p) => p.prontoMontar === false);
    else if (fMont === "LIBERADAS") r = r.filter((p) => p.prontoMontar !== false);
    return r;
  };
  // "Feito" no setor = o maior entre o produzido no Syneco e a baixa do portal. Assim o que já
  // foi produzido (mesmo sem baixa no portal) NÃO aparece como pendente. (Vitor: "não temos
  // essas peças para fazer" — eram peças já produzidas no Syneco.)
  const feitoQtd = (p) => Math.max(p.baixadoQtd || 0, p.produzidoSyneco || 0);
  // "Já resolvida neste setor" = concluída (baixa/Syneco) OU já avançou pra um setor À FRENTE
  // (avancouAlem) — peça que está no Jato não pode ficar pendente na Montagem. (Vitor 18/08.)
  const resolvida = (p) => feitoQtd(p) >= (p.qte || 1) || !!p.avancouAlem;
  // Liberar: só o que FALTA de verdade neste setor.
  const pendentes = useMemo(() => pecas.filter((p) => !resolvida(p)), [pecas]);
  // Peças prontas: histórico do setor (concluídas aqui ou que já seguiram adiante).
  const prontas = useMemo(() => pecas.filter((p) => resolvida(p)), [pecas]);
  const listaLiberar = useMemo(() => filtrar(pendentes), [pendentes, filtro, fMaterial, fProg, fMont]);
  const listaProntas = useMemo(() => filtrar(prontas), [prontas, filtro, fMaterial, fProg, fMont]);
  // Resumo do que está na tela (deixa o painel mais informativo: o setor vê o tamanho da carga).
  const comMaterial = useMemo(() => pendentes.filter((p) => p.perfil && p.material).length, [pendentes]);
  const semMaterial = useMemo(() => pendentes.filter((p) => p.perfil && !p.material).length, [pendentes]);
  const programadas = useMemo(() => pendentes.filter(foiProgramada).length, [pendentes]);
  const naoProgramadas = pendentes.length - programadas;
  const temColunaProg = useMemo(() => pecas.some((p) => p.programacao), [pecas]);
  // Montagem: conjunto liberado p/ montar × aguardando os croquis serem cortados.
  const aguardando = useMemo(() => pendentes.filter((p) => p.prontoMontar === false).length, [pendentes]);
  const liberadas = pendentes.length - aguardando;
  // QUAIS FILTROS APARECEM EM CADA SETOR (Vitor 18/08): a Preparação é a única que depende de
  // COMPRA e de PROGRAMAÇÃO; a Montagem é a única que depende de OUTRO SETOR (espera os croquis);
  // de Solda pra frente a peça não depende de mais ninguém — filtro ali só polui a tela.
  const mostraMaterial = !setor || setor === "CORTE";
  const mostraProg = !setor || setor === "CORTE";
  const mostraMont = setor === "MONTAGEM";
  const temFiltros = (mostraMaterial && (comMaterial > 0 || semMaterial > 0)) || (mostraProg && temColunaProg) || mostraMont;
  const filtrandoAlgo = fMaterial !== "TODOS" || fProg !== "TODOS" || fMont !== "TODAS";
  const visiveis = aba === "prontas" ? listaProntas : listaLiberar;
  const visLimit = visiveis.slice(0, LIMITE);
  const pesoVisivel = useMemo(() => visiveis.reduce((a, p) => a + (Number(p.pesoTotalKg) || 0), 0), [visiveis]);
  const pesoSelecionado = useMemo(() => (data?.pecas || []).filter((p) => sel.has(p.id)).reduce((a, p) => a + (Number(p.pesoTotalKg) || 0), 0), [data, sel]);

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
      if (okMsg) { const m = okMsg(j); if (m) alert(m); } // okMsg pode devolver null = não avisa
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  const avisoDup = (j) => (j.duplicadasIgnoradas ? `\n\n${j.duplicadasIgnoradas} linha(s) duplicada(s) ignorada(s) — a mesma marca existe na LPC e na Lista de Expedição; vale a da LPC.` : "");

  async function despachar(destino) {
    const ids = emAbertoSel();
    if (!ids.length) return alert("Selecione peças em aberto (sem destino) para destinar.");
    await post({ ids, destino }, (j) => (j.duplicadasIgnoradas ? `${j.atualizados} peça(s) destinada(s).${avisoDup(j)}` : null));
  }
  // Tira a prioridade das selecionadas (marcou errado) — renumera a OP sozinho.
  async function tirarPrioridade() {
    const ids = [...sel];
    if (!ids.length) return alert("Selecione as peças para tirar a prioridade.");
    if (!confirm(`Tirar a marcação de prioridade de ${ids.length} peça(s) selecionada(s)?`)) return;
    await post({ ids, tirarPrioridade: true }, (j) => `Prioridade removida de ${j.atualizados} peça(s).`);
  }
  // Encaminhar DIRETO pra um setor (ex.: Jato) — a peça pula as etapas anteriores e fica pendente
  // no setor escolhido; com "priorizar", também ganha o número de prioridade.
  async function encaminhar() {
    const ids = [...sel];
    if (!ids.length) return alert("Selecione as peças para enviar ao setor.");
    await post({ ids, encaminharSetor: encSetor, comPrioridade: encPrio }, (j) => `${j.atualizados} peça(s) enviada(s) para ${SETOR_LABEL[encSetor] || encSetor}${encPrio ? " (com prioridade)" : ""}.${avisoDup(j)}`);
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
    const headers = ["Marca", "Tipo", "Material", "Rastreab. (R)", "Corrida / lote", "NF", "Programação", "Peso (kg)", "Observação"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Apontar no Syneco — ${obra}${setor ? ` (${nomeSetor})` : ""}`,
      subtitulo: `${obra} · Setor: ${nomeSetor} · baixadas manualmente no portal — dar baixa no Syneco`,
      kpis: [`${base.length} peça(s) p/ apontar no Syneco`],
      totalColunas: headers.length, nomePlanilha: "Apontar Syneco", codigoDoc: "REL-ENG-002",
    });
    ws.columns = [{ width: 20 }, { width: 12 }, { width: 46 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 15 }, { width: 13 }, { width: 46 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    const first = row;
    for (const p of base) {
      const quando = p.baixadoEm ? ` em ${new Date(p.baixadoEm).toLocaleDateString("pt-BR")}` : "";
      // a Observação fala só da BAIXA — material/corrida/NF têm colunas próprias
      const obs = `Dar baixa no Syneco (${nomeSetor}): ${fmtN(p.baixadoQtd)} un — baixa manual no portal${p.baixadoPor ? ` por ${p.baixadoPor}` : ""}${quando}`;
      // Material do perfil (CMR) — descrição na coluna Material; rastreabilidade, corrida e NF
      // em colunas próprias, pro setor levar a informação junto da relação. (Vitor 18/08.)
      adicionarLinhaTabela(ws, row, [p.marca, tipoTxt(p.tipoPeca), textoMaterial(p), p.material?.rastreio || "", textoCorrida(p), p.material?.nf || "", textoProg(p), p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : "", obs], { alinhamento: { 1: "center", 3: "center", 4: "center", 5: "center", 6: "center", 7: "right" } });
      row++;
    }
    if (row > first) adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", "", "", { formula: `SUM(H${first}:H${row - 1})` }, ""]);
    await downloadWorkbook(workbook, `Apontar_Syneco_${obra}${setor ? "_" + nomeSetor : ""}_${hoje}.xlsx`);
  }

  // Exporta EXATAMENTE o que está na tela (filtros de material/programação inclusos) — é a lista
  // que o PCP leva pro setor. Traz a rastreabilidade do material junto (NF, corrida, pedido) e se
  // o programador já lançou a peça. (Vitor 18/08.)
  async function exportarLista() {
    if (!visiveis.length) return alert("Nada na tela para exportar.");
    const hoje = new Date().toISOString().split("T")[0];
    const nomeSetor = setor ? SETOR_LABEL[setor] || setor : "Geral";
    const tipoTxt = (t) => (t === "CONJUNTO" ? "Conjunto" : t === "CROQUI" ? "Croqui" : "Avulsa");
    const recorte = [fMaterial === "COM" ? "com material" : fMaterial === "SEM" ? "sem material" : null,
      fMont === "LIBERADAS" ? "liberados p/ montar" : fMont === "AGUARDANDO" ? "aguardando componentes" : null,
      fProg === "PROG" ? "programadas" : fProg === "NAO" ? "não lançadas no Syneco" : null,
      filtro.trim() ? `filtro "${filtro.trim()}"` : null].filter(Boolean).join(" · ");
    const headers = ["Marca", "Descrição", "Tipo", "Perfil", "Qtd", "Peso un. (kg)", "Peso tot. (kg)",
      "Material", "Rastreab. (R)", "Corrida / lote", "Certificado", "NF", "Pedido", "Fornecedor", "Recebido em", "Programação"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `${aba === "prontas" ? "Peças prontas" : "Peças a liberar"} — ${obra}${setor ? ` (${nomeSetor})` : ""}`,
      subtitulo: `${obra} · Setor: ${nomeSetor}${recorte ? ` · Recorte: ${recorte}` : ""}`,
      kpis: [`${fmtN(visiveis.length)} peça(s)`, `${fmtKg(pesoVisivel)} kg`],
      totalColunas: headers.length, nomePlanilha: "Peças", codigoDoc: "REL-PCP-004",
    });
    ws.columns = [{ width: 18 }, { width: 34 }, { width: 11 }, { width: 22 }, { width: 8 }, { width: 13 }, { width: 14 },
      { width: 46 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 11 }, { width: 20 }, { width: 13 }, { width: 15 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    const first = row;
    for (const p of [...visiveis].sort((a, b) => String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }))) {
      const m = p.material;
      adicionarLinhaTabela(ws, row, [
        p.marca, p.descricao || "", tipoTxt(p.tipoPeca), p.perfil || "",
        p.qte || 1, p.pesoUnitKg ? Number(p.pesoUnitKg.toFixed(2)) : "", p.pesoTotalKg ? Number(p.pesoTotalKg.toFixed(1)) : "",
        textoMaterial(p), m?.rastreio || "", textoCorrida(p), m?.certificado || "", m?.nf || "", m?.pedido || "", m?.fornecedor || "",
        m?.dataRecebimento ? new Date(m.dataRecebimento).toLocaleDateString("pt-BR") : "", textoProg(p),
      ], { alinhamento: { 2: "center", 4: "center", 5: "right", 6: "right", 8: "center", 9: "center", 10: "center", 11: "center", 12: "center", 14: "center", 15: "center" } });
      row++;
    }
    if (row > first) adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", "", { formula: `SUM(G${first}:G${row - 1})` }, "", "", "", "", "", "", "", "", ""]);
    await downloadWorkbook(workbook, `Pecas_${obra}${setor ? "_" + nomeSetor : ""}_${hoje}.xlsx`);
  }

  const th = "text-left px-2.5 py-2 font-semibold text-torg-gray";
  const td = "px-2.5 py-1.5";

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-3" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-[98vw] max-w-[1800px] h-[95vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold inline-flex items-center gap-2 flex-wrap">
              {obra}{setor ? ` · ${SETOR_LABEL[setor] || setor}` : ""}
              {/* Status de COMPRA da OP — clica e abre a RASTREABILIDADE completa (corrida/lote,
                  certificado, NF, pedido, fornecedor). Vitor 18/08: "onde está a rastreabilidade". */}
              {data?.compra && <CompraChip compra={data.compra} opNumero={data.opNumero} />}
            </h2>
            {data && <p className="text-[12px] text-torg-gray">{fmtN(data.total)} peça(s){podeBaixa ? ` · ${fmtN(pendentes.length)} a liberar · ${fmtN(prontas.length)} prontas` : ""}{podeBaixa && data.precisamSyneco > 0 ? ` · ${fmtN(data.precisamSyneco)} p/ acertar no Syneco` : ""}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setRastroOp(true)} disabled={!data?.opNumero} title="Rastreabilidade do material desta OP: corrida/lote, certificado, NF, pedido de compra e fornecedor (CMR do Almoxarifado)"
              className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><Package size={13} /> Rastreabilidade</button>
            {/* Lista de separação: o que o Almoxarifado tira do estoque pra atender estes croquis,
                com o R de cada material. Com peças selecionadas, sai só delas. (Vitor 19/08.) */}
            <button type="button" onClick={() => setSeparacao({ ids: sel.size ? [...sel] : null })} disabled={!data?.opId}
              title="Gera a lista de separação de material: tipo, barras, peso e o R de cada material — com opção de trocar o R no ato da separação"
              className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><ClipboardList size={13} /> Separação{sel.size ? ` (${fmtN(sel.size)})` : ""}</button>
            <button type="button" onClick={exportarLista} disabled={!data || !visiveis.length} title="Exporta a lista como está na tela (respeita os filtros), com material, rastreabilidade e programação" className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><FileDown size={13} /> Exportar lista</button>
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

        {/* Seletores de bloco: material (CMR) e programação (Syneco). Servem pra SELECIONAR em
            massa — filtra, marca "selecionar todas" e despacha só aquele grupo. (Vitor 18/08.) */}
        {data && aba === "despacho" && temFiltros && (
          <div className="flex items-center gap-4 flex-wrap px-5 py-2 border-b border-gray-50 bg-gray-50/60">
            {mostraMaterial && (comMaterial > 0 || semMaterial > 0) && (
              <Seg titulo="Material" valor={fMaterial} onChange={setFMaterial} opcoes={[
                { key: "TODOS", label: "Todos", dica: "Sem filtro de material" },
                { key: "COM", label: "Com material", n: comMaterial, ativo: "bg-emerald-600 text-white", dica: "Perfis com recebimento registrado no CMR desta OP" },
                { key: "SEM", label: "Sem material", n: semMaterial, ativo: "bg-amber-500 text-white", dica: "Perfis que ainda não têm recebimento no CMR desta OP" },
              ]} />
            )}
            {/* MONTAGEM — o único setor que espera outro: o conjunto só monta com os croquis
                cortados. Daqui pra frente a peça não depende de mais ninguém. (Vitor 18/08.) */}
            {mostraMont && (
              <Seg titulo="Conjuntos" valor={fMont} onChange={setFMont} opcoes={[
                { key: "TODAS", label: "Todos", dica: "Sem filtro" },
                { key: "LIBERADAS", label: "Liberados p/ montar", n: liberadas, ativo: "bg-emerald-600 text-white", dica: "Todos os croquis do conjunto já foram cortados — pode montar" },
                { key: "AGUARDANDO", label: "Aguardando componentes", n: aguardando, ativo: "bg-amber-500 text-white", dica: "Ainda falta cortar croqui do conjunto — clique em \"falta N\" na linha para ver quais" },
              ]} />
            )}
            {mostraProg && temColunaProg && (
              <Seg titulo={`Programação${data.ordensSincronizadasEm ? ` (Syneco ${new Date(data.ordensSincronizadasEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : ""}`} valor={fProg} onChange={setFProg} opcoes={[
                { key: "TODOS", label: "Todas", dica: "Sem filtro de programação" },
                { key: "PROG", label: "Programadas", n: programadas, ativo: "bg-sky-600 text-white", dica: "O programador já lançou a peça na produção (ordem no Syneco)" },
                { key: "NAO", label: "Não lançadas", n: naoProgramadas, ativo: "bg-red-600 text-white", dica: "Ainda sem ordem no Syneco — o programador não lançou" },
              ]} />
            )}
            {filtrandoAlgo && (
              <button type="button" onClick={() => { setFMaterial("TODOS"); setFProg("TODOS"); setFMont("TODAS"); }} className="text-[11px] font-semibold text-torg-gray hover:text-red-600 underline">limpar filtros</button>
            )}
          </div>
        )}

        {/* Tabela */}
        <div className="flex-1 overflow-auto px-5 py-2">
          {loading && <div className="py-10 text-center text-torg-gray"><Loader2 className="mx-auto animate-spin" /></div>}
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          {!loading && !erro && visiveis.length === 0 && (
            <p className="text-torg-gray text-sm text-center py-10">{aba === "prontas" && !filtro && !filtrandoAlgo ? "Nenhuma peça com baixa ainda." : filtro || filtrandoAlgo ? "Nenhuma peça nos filtros escolhidos." : "Nada a liberar — tudo pronto. 🎉"}</p>
          )}
          {!loading && visiveis.length > 0 && (
            <table className="w-full text-[13px] min-w-[1120px]">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide">
                  <th className="px-2 py-2 w-8"><input type="checkbox" checked={sel.size === visLimit.length && visLimit.length > 0} onChange={selTodas} /></th>
                  <th className={th}>Marca</th>
                  <th className={th}>Descrição</th>
                  <th className={`${th} text-right`}>Qtd</th>
                  <th className={`${th} text-right`}>Baixada</th>
                  <th className={`${th} text-right`}>Produz. Syneco</th>
                  <th className={`${th} text-right`}>Peso un.</th>
                  <th className={`${th} text-right`}>Peso tot.</th>
                  <th className={`${th} text-center`} title="Material do perfil já recebido? (CMR do Almoxarifado). Clique no item p/ ver a rastreabilidade: corrida/lote, NF, pedido, fornecedor.">Material</th>
                  {temColunaProg && <th className={`${th} text-center`} title="O programador já lançou a peça na produção? (ordem no Syneco)">Programação</th>}
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
                    {/* MATERIAL do perfil (CMR do Almoxarifado): o corte vê item a item se o
                        material já chegou. Sem perfil (conjunto/GC) não se aplica. */}
                    <td className={`${td} text-center`}>
                      {!p.perfil ? (
                        (p._count?.conjuntoCroquis || 0) > 0 ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setRastroItem(p); }}
                            className="text-slate-600 bg-slate-100 hover:bg-slate-200 text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap font-semibold"
                            title="Conjunto montado: ver as corridas/lotes dos croquis que o compõem">corridas</button>
                        ) : <span className="text-gray-300" title="Peça sem perfil de corte — não tem matéria-prima própria.">—</span>
                      )
                        : p.material ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setRastroItem(p); }}
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap font-semibold"
                            title={`Rastreab. R ${p.material.rastreio || "—"}${p.material.corrida ? ` · corrida ${p.material.corrida}` : " · SEM CORRIDA no CMR"}\n${p.material.material}\nNF ${p.material.nf || "—"}${p.material.pedido ? ` · pedido ${p.material.pedido}` : ""}\nClique para ver a rastreabilidade.`}>
                            ok{p.material.dataRecebimento ? ` ${fmtD(p.material.dataRecebimento)}` : ""}
                          </button>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap font-semibold" title={`Sem registro de recebimento do perfil ${p.perfil} no CMR desta OP.`}>sem material</span>
                        )}
                    </td>
                    {/* PROGRAMAÇÃO — o programador já lançou a peça na produção? (ordem no Syneco) */}
                    {temColunaProg && (
                      <td className={`${td} text-center`}>
                        {(() => {
                          const g = p.programacao;
                          const e = PROG[g?.situacao] || PROG.NAO_LANCADA;
                          const rota = g?.setores?.length ? `\nRota no Syneco: ${g.setores.join(" · ")}` : "";
                          const qtdRuim = g?.qtdOk === false;
                          const dica = `${e.dica}${rota}${g?.planejadoUn ? `\nPlanejado: ${fmtN(g.planejadoUn)} un` : ""}${qtdRuim ? `\n⚠ O Syneco planejou ${fmtN(g.planejadoUn)} un e a LPC pede ${fmtN(g.qtdLpc)} un.` : ""}\n\nClique para ver as ordens do Syneco.`;
                          if (!g?.nOrdens) return <span className={`text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap font-semibold ${e.cls}`} title={dica}>{e.txt}</span>;
                          return (
                            <button type="button" onClick={(ev) => { ev.stopPropagation(); setProgItem(p); }} title={dica}
                              className={`text-[11px] rounded px-1.5 py-0.5 whitespace-nowrap font-semibold inline-flex items-center gap-1 hover:brightness-95 ${e.cls}`}>
                              {qtdRuim && <AlertTriangle size={10} />}{e.txt}
                            </button>
                          );
                        })()}
                      </td>
                    )}
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
                      <td colSpan={temColunaProg ? 10 : 9} className="px-2.5 pb-2 pt-0">
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
          {/* Resumo da carga: quanto tem na tela e quanto está selecionado (o setor dimensiona o dia). */}
          {visiveis.length > 0 && (
            <div className="mt-2 flex items-center gap-4 flex-wrap text-[11px] text-torg-gray border-t border-gray-100 pt-2">
              <span><b className="text-torg-dark">{fmtN(visiveis.length)}</b> peça(s) na tela · <b className="text-torg-dark">{fmtKg(pesoVisivel)} kg</b></span>
              {sel.size > 0 && <span className="text-torg-blue font-semibold">{fmtN(sel.size)} selecionada(s) · {fmtKg(pesoSelecionado)} kg</span>}
              {fMaterial !== "TODOS" && <span className={fMaterial === "SEM" ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}>filtrando {fMaterial === "SEM" ? "só sem material" : "só com material"}</span>}
              {fProg !== "TODOS" && <span className={fProg === "NAO" ? "text-red-700 font-semibold" : "text-sky-700 font-semibold"}>filtrando {fProg === "NAO" ? "só não lançadas no Syneco" : "só programadas"}</span>}
              {fMont !== "TODAS" && <span className={fMont === "AGUARDANDO" ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}>filtrando {fMont === "AGUARDANDO" ? "só aguardando componentes" : "só liberados p/ montar"}</span>}
            </div>
          )}
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
              <button onClick={tirarPrioridade} disabled={!sel.size || enviando} title="Tira a marcação de prioridade das selecionadas (marcou errado)"
                className="text-[11px] font-semibold text-torg-dark rounded-lg px-2.5 py-2 inline-flex items-center gap-1 disabled:opacity-40 bg-gray-100 hover:bg-gray-200"><Undo2 size={12} /> Tirar prioridade</button>
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
    {rastroOp && data?.opNumero && <ModalRastreabilidade opNumero={data.opNumero} onClose={() => setRastroOp(false)} />}
    {rastroItem && <RastroDoItem peca={rastroItem} opNumero={data?.opNumero} onClose={() => setRastroItem(null)} />}
    {progItem && <OrdensDoItem peca={progItem} opId={data?.opId} setor={setor} sincronizadoEm={data?.ordensSincronizadasEm} onClose={() => setProgItem(null)} />}
    {separacao && data?.opId && (
      <SeparacaoModal opId={data.opId} obra={obra} setor={setor} ids={separacao.ids} onClose={() => setSeparacao(null)} />
    )}
    </>
  );
}

// ORDENS DO SYNECO da peça — é aqui que o PCP CONFERE a programação: qual operação/setor o
// programador lançou, em que máquina, quantas peças planejou (contra a qtd da LPC), o status e
// as datas. Sem isso o chip "programada" era só uma afirmação do portal. (Vitor 18/08.)
function OrdensDoItem({ peca, opId, setor, sincronizadoEm, onClose }) {
  const g = peca?.programacao;
  // As ordens vêm SOB DEMANDA — fora da listagem, que ficava pesada. (Vitor 19/08.)
  const [ordens, setOrdens] = useState(null);
  const [erroOrd, setErroOrd] = useState("");
  useEffect(() => {
    if (!opId) return setErroOrd("OP não identificada.");
    fetch(`/api/pcp/despacho/ordens?opId=${encodeURIComponent(opId)}&marca=${encodeURIComponent(peca.marca)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErroOrd(j.error) : setOrdens(j.ordens || [])))
      .catch(() => setErroOrd("Não foi possível carregar as ordens."));
  }, [opId, peca.marca]);
  const SETOR_SY = { CORTE: /corte|prepara|serra|plasma|oxico/i, MONTAGEM: /montag/i, SOLDA: /solda|mig|mag|tig/i, ACABAMENTO: /acabamento|esmeril|lixamento/i, JATO: /jato|granalha/i, PINTURA: /pintura|primer/i };
  const rx = setor ? SETOR_SY[setor] : null;
  const doSetor = (o) => (rx ? rx.test(o.setor || "") : true);
  const nesteSetor = (ordens || []).filter(doSetor);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold inline-flex items-center gap-2"><Factory size={16} className="text-torg-blue" /> Programação no Syneco · <span className="font-mono">{peca.marca}</span></h2>
            <p className="text-[12px] text-torg-gray truncate">{peca.descricao || peca.perfil || "—"} · LPC pede <b>{fmtN(peca.qte)}</b> un</p>
          </div>
          <button onClick={onClose} className="text-torg-gray hover:text-red-600 shrink-0"><X size={18} /></button>
        </div>

        {/* Veredito: dá pra afirmar que o programador lançou esta peça PARA ESTE SETOR? */}
        <div className="px-5 pt-3">
          {ordens === null ? (
            <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Carregando as ordens do Syneco…</p>
          ) : erroOrd ? (
            <p className="text-[12px] text-red-600">{erroOrd}</p>
          ) : !nesteSetor.length ? (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> O Syneco não tem ordem de {SETOR_LABEL[setor] || setor} para esta peça — o programador lançou a peça, mas não para este setor.
            </p>
          ) : g.qtdOk === false ? (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Programada, mas a quantidade não bate: o Syneco planejou <b>{fmtN(g.planejadoUn)}</b> un e a LPC pede <b>{fmtN(g.qtdLpc)}</b> un.
            </p>
          ) : (
            <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 inline-flex items-start gap-1.5">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> Programada para {SETOR_LABEL[setor] || setor}: {nesteSetor.length} ordem(ns) no Syneco, {fmtN(g.planejadoUn)} un planejada(s) — igual à LPC.
            </p>
          )}
        </div>

        <div className="px-5 py-3 overflow-y-auto">
          {ordens !== null && (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase text-torg-gray border-b border-gray-100">
                <th className="text-left py-1.5">Op.</th><th className="text-left py-1.5">Setor</th>
                <th className="text-left py-1.5">Máquina</th><th className="text-right py-1.5">Planejado</th>
                <th className="text-right py-1.5">Produzido</th><th className="text-left py-1.5">Status</th>
                <th className="text-left py-1.5">Início</th><th className="text-left py-1.5">Fim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(ordens || []).map((o, i) => (
                <tr key={i} className={doSetor(o) ? "bg-blue-50/40" : ""}>
                  <td className="py-1.5 font-mono">{o.operacao || "—"}</td>
                  <td className="py-1.5 whitespace-nowrap font-semibold">{o.setor || "—"}</td>
                  <td className="py-1.5 whitespace-nowrap">{o.maquina || <span className="text-gray-300">—</span>}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtN(o.planejadoUn)}</td>
                  <td className="py-1.5 text-right tabular-nums">{o.produzidoUn ? fmtN(o.produzidoUn) : <span className="text-gray-300">—</span>}</td>
                  <td className="py-1.5 whitespace-nowrap">{o.status || "—"}</td>
                  <td className="py-1.5 whitespace-nowrap tabular-nums">{fmtD(o.dataInicio)}</td>
                  <td className="py-1.5 whitespace-nowrap tabular-nums">{fmtD(o.dataFim)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          <p className="text-[11px] text-torg-gray mt-2">As linhas destacadas são as deste setor. O Syneco separa <b>Corte</b> (op. 10 — laser/serra) de <b>Preparação</b> (op. 20 — furação/rosca) — as duas são a Preparação do portal.</p>
        </div>
        <div className="px-5 py-2.5 border-t border-gray-100">
          <p className="text-[11px] text-torg-gray">Fonte: ordens do Syneco (SKA), enviadas pelo agente da fábrica{sincronizadoEm ? ` — última sincronização em ${new Date(sincronizadoEm).toLocaleString("pt-BR")}` : ""}. O portal só lê; quem cria a ordem é o programador.</p>
        </div>
      </div>
    </div>
  );
}

// RASTREABILIDADE DO ITEM — qual CORRIDA/LOTE foi usada nesta peça. Para um CONJUNTO, lista os
// croquis que o compõem, cada um com a corrida do seu perfil (Vitor 18/08: "quais rastreabilidades
// foram usadas para cada perfil que compõe o conjunto"). O casamento é LPC × CMR pela data:
// a peça só pode ter saído de material recebido ATÉ o dia em que foi cortada. Ver lib/rastreio-peca.js.
// O R é quem manda: ele puxa corrida/lote, certificado, NF, pedido e fornecedor. (Vitor 18/08.)
const SIT = {
  R_DEFINIDO: { txt: "R definido", cls: "bg-emerald-50 text-emerald-700", dica: "Peça cortada e R atribuído: era a única entrada disponível no dia do corte, ou o FIFO (entrega mais antiga primeiro) apontou esta." },
  AGUARDANDO_CORTE: { txt: "aguarda corte", cls: "bg-slate-100 text-slate-500", dica: "Peça ainda em aberto — o R só é atribuído quando ela é cortada." },
  ESTOQUE: { txt: "de estoque", cls: "bg-amber-50 text-amber-700", dica: "A peça foi cortada ANTES de qualquer entrega desta OP: saiu de sobra/estoque, o CMR desta OP não explica." },
  SEM_MATERIAL: { txt: "sem material", cls: "bg-slate-100 text-slate-500", dica: "Nenhuma entrada desse perfil no CMR desta OP." },
};

function RastroDoItem({ peca, opNumero, onClose }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!opNumero) return setErro("OP sem número.");
    fetch(`/api/qualidade/rastreio/${encodeURIComponent(opNumero)}?marca=${encodeURIComponent(peca.marca)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErro(j.error) : setD(j)))
      .catch(() => setErro("Não foi possível carregar."));
  }, [opNumero, peca.marca]);

  const itens = d?.itens || [];
  const conjunto = itens.length > 1 || (itens.length === 1 && itens[0].marca !== peca.marca);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-5xl shadow-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold inline-flex items-center gap-2"><Package size={16} className="text-torg-blue" /> Rastreabilidade · <span className="font-mono">{peca.marca}</span></h2>
            <p className="text-[12px] text-torg-gray truncate">
              {peca.perfil ? <>Perfil <b>{peca.perfil}</b></> : peca.descricao || "Conjunto"}
              {conjunto ? ` · ${itens.length} peça(s) que o compõem` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-torg-gray hover:text-red-600 shrink-0"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {!d && !erro && <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>}
          {d && !itens.length && <p className="text-sm text-torg-gray py-6 text-center">Sem informação de material para esta peça.</p>}
          {itens.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[960px]">
                <thead>
                  <tr className="text-[10px] uppercase text-torg-gray border-b border-gray-100">
                    {conjunto && <th className="text-left py-1.5">Peça</th>}
                    <th className="text-left py-1.5">Perfil</th>
                    {/* O nº da rastreabilidade (ÍNDICE R do CMR) vem ANTES da corrida e do lote —
                        é o número pelo qual o material é procurado. (Vitor 18/08.) */}
                    <th className="text-left py-1.5">Rastreab. (R)</th>
                    <th className="text-left py-1.5">Corrida / lote</th>
                    <th className="text-left py-1.5">Certificado</th>
                    <th className="text-left py-1.5">NF</th>
                    <th className="text-left py-1.5">Fornecedor</th>
                    <th className="text-left py-1.5">Recebido</th>
                    <th className="text-left py-1.5">Cortada</th>
                    <th className="text-left py-1.5">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((it, i) => {
                    const u = it.usadas?.[0]; // vazio de propósito enquanto a peça não foi cortada
                    const e = SIT[it.situacao] || SIT.SEM_MATERIAL;
                    const nCand = (it.candidatas || []).length;
                    // explica POR QUE este R: FIFO entre várias entradas, ou era a única
                    const porQue = it.situacao === "R_DEFINIDO" && it.criterio === "fifo" && nCand > 1;
                    return (
                      <Fragment key={i}>
                        <tr>
                          {conjunto && <td className="py-1.5 font-mono font-semibold whitespace-nowrap">{it.marca}</td>}
                          <td className="py-1.5 whitespace-nowrap">{it.perfil || "—"}</td>
                          <td className="py-1.5 whitespace-nowrap font-mono font-bold text-torg-dark">
                            {u?.rastreio || <span className="text-gray-300 font-sans">—</span>}
                          </td>
                          <td className="py-1.5 whitespace-nowrap font-mono font-semibold">
                            {u?.corrida || (u ? <span className="text-amber-600 font-sans font-semibold">sem corrida no CMR</span> : <span className="text-gray-300">—</span>)}
                          </td>
                          <td className="py-1.5 whitespace-nowrap font-mono text-torg-gray">{u?.certificado || "—"}</td>
                          <td className="py-1.5 whitespace-nowrap font-mono">{u?.nf || "—"}</td>
                          <td className="py-1.5 whitespace-nowrap">{u?.fornecedor || "—"}</td>
                          <td className="py-1.5 whitespace-nowrap tabular-nums">{fmtD(u?.recebidoEm)}</td>
                          <td className="py-1.5 whitespace-nowrap tabular-nums">{it.cortadoEm ? new Date(it.cortadoEm + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : <span className="text-gray-300">não cortada</span>}</td>
                          <td className="py-1.5 whitespace-nowrap">
                            <span className={`text-[10px] rounded px-1.5 py-0.5 font-semibold ${e.cls}`} title={e.dica}>{e.txt}</span>
                            {it.saldoEsgotado && <span className="ml-1 text-[10px] text-amber-700" title="Cortou-se mais desse material do que o CMR registra ter chegado — falta lançar recebimento.">⚠</span>}
                          </td>
                        </tr>
                        {(porQue || it.situacao === "ESTOQUE") && nCand > 0 && (
                          <tr className={it.situacao === "ESTOQUE" ? "bg-amber-50/50" : "bg-emerald-50/40"}>
                            {conjunto && <td />}
                            <td colSpan={9} className="py-1.5 px-1 text-[11px]">
                              <span className={it.situacao === "ESTOQUE" ? "text-amber-800 font-semibold" : "text-emerald-800 font-semibold"}>
                                {it.situacao === "ESTOQUE"
                                  ? "Cortada antes de qualquer entrega — o material desta OP não explica. Entradas da OP:"
                                  : `FIFO — ${nCand} entradas estavam disponíveis no dia do corte; vale a de entrega mais antiga:`}
                              </span>
                              <span className="ml-1 text-torg-gray">
                                {it.candidatas.map((c, k) => `${k === 0 && it.situacao !== "ESTOQUE" ? "✓ " : ""}R ${c.rastreio || "—"} · ${c.corrida ? `corrida ${c.corrida}` : "sem corrida"} (recebida ${fmtD(c.recebidoEm)}, ${Math.round(c.pesoKg || 0)} kg)`).join("   |   ")}
                              </span>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-gray-100">
          <p className="text-[11px] text-torg-gray">
            Casamento automático: <b>peças da LPC</b> × <b>entradas do CMR</b> daquela OP. O <b>R</b> é quem manda — é ele que puxa corrida/lote, certificado, NF, pedido e fornecedor. Regra: só peça <b>cortada</b> ganha R; entre as entradas disponíveis no dia do corte (data do Syneco) vale a de <b>entrega mais antiga</b> — <b>FIFO</b>, gastando o peso recebido antes de passar à próxima. Premissa: o material é comprado e recebido por OP; peça cortada antes de qualquer entrega cai em "de estoque".
          </p>
        </div>
      </div>
    </div>
  );
}
