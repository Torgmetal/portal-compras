"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { PackageSearch, Search, Loader2, FileSpreadsheet, CheckCircle2, Clock, AlertCircle, X, Truck, Trash2, Copy, CalendarDays, MapPin, Upload, Plus, ThumbsUp, RotateCcw, Star } from "lucide-react";
import { exportarListaExpedicao } from "@/lib/export-lista-expedicao";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const LIMITE = 300;
const chave = (m) => `${m.frente}|${String(m.marca).toUpperCase()}`;
// Baixa manual (sem romaneio) — motivos.
const MOTIVOS_BAIXA = [
  { v: "NAO_ENCONTRADA", l: "Não encontrada em obra" },
  { v: "ADICIONADA", l: "Adicionada" },
  { v: "ERRO_EXPEDICAO", l: "Erro na expedição" },
  { v: "QTD_DIVERGENTE", l: "Quantidade divergente" },
];
const MOTIVO_LABEL = Object.fromEntries(MOTIVOS_BAIXA.map((m) => [m.v, m.l]));
const STATUS = {
  PREVISTO: { l: "em aberto", c: "bg-amber-100 text-amber-800" },
  APROVADO: { l: "aprovado — vai para a Expedição", c: "bg-emerald-100 text-emerald-800" },
  CANCELADO: { l: "cancelado", c: "bg-gray-200 text-torg-gray" },
};

// ⚠ `focoPendentes` abre já filtrado no que falta expedir — é como a aba do Planejamento usa a
// tela: o resumo em cima responde "quanto saiu", e aqui embaixo fica "o que falta programar".
// ⚠ `semCard` renderiza SEM o cartão e sem o título próprio: é assim que esta tela entra DENTRO da
// Lista de Expedição, na aba Planejamento. Vitor (24/08/2026): "está deixando separado ainda, deixe
// juntas" — dois cartões brancos empilhados, os dois escritos "Lista de Expedição", continuavam
// lendo como duas listas mesmo estando na mesma aba.
export default function ConsultaExpedicao({ opId, readOnly = false, focoPendentes = false, semCard = false }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState(focoPendentes ? "pendentes" : "todas");
  const [priorizando, setPriorizando] = useState(false);
  const [frente, setFrente] = useState("");
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [sel, setSel] = useState({});
  const [qtdImport, setQtdImport] = useState({}); // chave(marca) -> qtd desta carga (da lista ou ajustada). Sem entrada = qtd total da marca.
  const [imp, setImp] = useState(null); // { rows, nome } — arquivo em prévia de importação
  const [modalBaixa, setModalBaixa] = useState(false); // baixa manual (sem romaneio)
  const [motivoBaixa, setMotivoBaixa] = useState("NAO_ENCONTRADA");
  const [obsBaixa, setObsBaixa] = useState("");
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);
  const [previos, setPrevios] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [proximo, setProximo] = useState(null);
  const [modal, setModal] = useState(false);
  const [ab, setAb] = useState({});
  const [ocupado, setOcupado] = useState({});
  const [localEntrega, setLocalEntrega] = useState(""); // endereço de entrega da obra (kickoff)
  const fileRef = useRef(null);

  const carregarPrevios = () => fetch(`/api/comercial/op/${opId}/romaneios-previos`).then((r) => r.json())
    .then((j) => { if (j.success) { setPrevios(j.previos || []); setProximo(j.proximoNumero); } }).catch(() => {});
  const carregarMarcas = () => fetch(`/api/comercial/op/${opId}/lista-expedicao/marcas`).then((r) => r.json())
    .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
    .catch(() => setErro("Não foi possível carregar a lista."));

  useEffect(() => {
    carregarMarcas();
    fetch(`/api/comercial/op/${opId}/lotes-expedicao`).then((r) => r.json())
      .then((j) => { if (j.success) setLotes(j.lotes || []); }).catch(() => {});
    fetch(`/api/comercial/op/${opId}/local-entrega`).then((r) => r.json())
      .then((j) => { if (j.success) setLocalEntrega(j.local || ""); }).catch(() => {});
    carregarPrevios();
  }, [opId]);

  const frentes = dados?.frentes || [];
  const todas = useMemo(() => frentes.flatMap((f) => f.marcas.map((m) => ({ ...m, frente: f.frente }))), [frentes]);
  const conhecidas = useMemo(() => { const mp = new Map(); for (const m of todas) mp.set(String(m.marca).trim().toUpperCase(), m); return mp; }, [todas]);

  // Total / expedido / pendente por marca. expedido = soma dos romaneios EMITIDOS
  // (expedidoQtd, da API). Sem quantidade, cai no booleano legado (m.expedido =
  // romaneio do arquivo/backfill ou coluna "Marca (Expedido)"). pendente = total − expedido.
  const totQ = (m) => (Number(m.qte) > 0 ? Number(m.qte) : null);
  const expQ = (m) => Math.max(0, Number(m.expedidoQtd) || 0);
  const unitPeso = (m) => { const t = totQ(m); return t ? (m.pesoTotal || 0) / t : (m.pesoTotal || 0); };
  const temBaixa = (m) => (Array.isArray(m.baixas) && m.baixas.length > 0) || Number(m.baixaQtd) > 0;
  const expedidaFull = (m) => { const t = totQ(m), e = expQ(m); if (e > 0 && t != null && t > 0) return e >= t; return m.expedido === true; };
  // Baixa MANUAL tem precedência visual (amarelo + motivo); senão expedida/parcial/pendente.
  const situacaoM = (m) => { if (temBaixa(m)) return "baixa"; if (expedidaFull(m)) return "expedida"; if (expQ(m) > 0) return "parcial"; return "pendente"; };
  const pendQ = (m) => { const t = totQ(m); if (t == null) return null; if (expedidaFull(m)) return 0; return Math.max(0, t - expQ(m)); };
  const pesoExpM = (m) => (expedidaFull(m) ? (m.pesoTotal || 0) : unitPeso(m) * expQ(m));

  // ⚠⚠ FILTRO POR COLUNA (o funil), igual ao da lista do PCP — mesmo componente.
  // Cada coluna vira TEXTO pela mesma leitura que a célula faz; se divergisse, a pessoa marcaria
  // "expedida" e veria linha dizendo outra coisa, e passaria a não confiar no filtro.
  //
  // ⚠ Qtd, Expedido e Peso ficam de fora: são contínuos, e caixinha com centenas de números não
  // filtra nada — para eles vale a busca por texto, que já existe acima.
  const COLUNAS_FILTRO = useMemo(() => [
    { key: "marca", label: "Marca", valor: (m) => m.marca || "—" },
    { key: "descricao", label: "Descrição", valor: (m) => m.descricao || "—" },
    { key: "situacao", label: "Situação", valor: (m) => ({ expedida: "expedida", parcial: "parcial", baixa: "baixa manual", pendente: "pendente" })[situacaoM(m)] },
    { key: "romaneio", label: "Romaneio", valor: (m) => (String(m.romaneio || "").trim() || "sem romaneio") },
    { key: "frente", label: "Frente", valor: (m) => m.frente || "—" },
  ], []);

  const preFiltradas = useMemo(() => {
    const b = norm(busca);
    return todas.filter((m) => {
      if (frente && m.frente !== frente) return false;
      const sit = situacaoM(m);
      if (situacao === "expedidas" && sit !== "expedida") return false;
      if (situacao === "pendentes" && sit !== "pendente") return false;
      if (situacao === "parciais" && sit !== "parcial") return false;
      if (situacao === "baixas" && sit !== "baixa") return false;
      if (!b) return true;
      return norm(m.marca).includes(b) || norm(m.descricao).includes(b) || norm(m.romaneio).includes(b);
    });
  }, [todas, busca, situacao, frente]);

  const { filtros: filtroCol, setFiltros: setFiltroCol, filtradas, opcoesDaColuna, ativos: filtrosAtivos, limpar: limparColunas } =
    useFiltroColunas(preFiltradas, COLUNAS_FILTRO);
  const [colAberta, setColAberta] = useState(null);
  const fp = { filtros: filtroCol, setFiltros: setFiltroCol, opcoesDaColuna, aberta: colAberta, setAberta: setColAberta };

  // ⚠⚠ "TODOS" É O QUE ESTÁ NA TELA, não a lista inteira. A tabela mostra as LIMITE primeiras: uma
  // OP grande passa de mil marcas, e um clique marcando 1.443 peças que a pessoa não viu é o tipo de
  // seleção que só se descobre errada depois do romaneio montado.
  const visiveis = useMemo(() => filtradas.slice(0, LIMITE), [filtradas]);
  // ⚠ e só as que dá para expedir: marca totalmente expedida tem a caixinha desabilitada.
  const selecionaveis = useMemo(() => visiveis.filter((m) => { const p = pendQ(m); return !(p != null && p <= 0); }), [visiveis]);

  const contratado = frentes.reduce((s, f) => s + (f.pesoContratado || 0), 0);
  const nFull = todas.filter((m) => situacaoM(m) === "expedida").length;
  const nParcial = todas.filter((m) => situacaoM(m) === "parcial").length;
  const nBaixa = todas.filter((m) => situacaoM(m) === "baixa").length;
  const nPendente = todas.filter((m) => situacaoM(m) === "pendente").length;
  const pesoExpedidoReal = todas.reduce((s, m) => s + pesoExpM(m), 0);
  const pesoFiltrado = filtradas.reduce((s, m) => s + (m.pesoTotal || 0), 0);

  // Seleção p/ o PRÓXIMO romaneio: parte do PENDENTE (não dá pra reexpedir o que já saiu).
  // Peso é PROPORCIONAL (unidade = pesoTotal ÷ total da marca).
  const baseQte = (m) => pendQ(m);
  const qteUsar = (m) => {
    const q = qtdImport[chave(m)];
    const b = baseQte(m);
    if (q == null) return b ?? 1;
    return b != null ? Math.max(0, Math.min(q, b)) : Math.max(0, q);
  };
  const pesoUsar = (m) => unitPeso(m) * qteUsar(m);

  const marcadas = useMemo(() => todas.filter((m) => sel[chave(m)]), [todas, sel]);
  const pesoSel = marcadas.reduce((s, m) => s + pesoUsar(m), 0);
  const unSel = marcadas.reduce((s, m) => s + qteUsar(m), 0);
  const parciais = marcadas.filter((m) => baseQte(m) != null && qteUsar(m) < baseQte(m)).length;

  // ── PRIORIDADE PARA O PCP ──────────────────────────────────────────────────────────────────
  // Vitor (24/08/2026): "uma forma de marcarmos quais conjuntos da lista seriam prioridades, isso
  // já vai indicando para o PCP onde atacar".
  //
  // ⚠⚠ É A MESMA FILA DE PRIORIDADE do "Mandar p/ produção" da tela do PCP — `destino: PRIORIDADE`
  // no /api/pcp/despacho, que numera a peça na fila da OP e a põe no topo da aba do setor em
  // /producao/prioridades. Um "prioritário da expedição" à parte criaria duas listas de prioridade
  // para a mesma fábrica, e ela seguiria a errada.
  //
  // ⚠ vai pela MARCA porque a lista de expedição vem do arquivo da Engenharia e não carrega o id da
  // peça; a rota resolve marca → peça dentro da OP.
  async function priorizar() {
    const alvo = marcadas;
    if (!alvo.length) return;
    if (!confirm(`Marcar ${alvo.length} conjunto(s) como PRIORIDADE para a produção?\n\nEles entram na fila da OP e sobem no topo do setor onde estiverem, no Painel de Produção.`)) return;
    setPriorizando(true); setErro(""); setMsg("");
    try {
      const r = await fetch("/api/pcp/despacho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, marcas: [...new Set(alvo.map((m) => m.marca))], destino: "PRIORIDADE" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao marcar prioridade");
      const semPeca = j.marcasSemPeca?.length || 0;
      setMsg(`${j.atualizados ?? alvo.length} peça(s) na fila de prioridade da produção.`
        + (j.duplicadasIgnoradas ? ` ${j.duplicadasIgnoradas} ignorada(s) por já estarem na LPC.` : "")
        // ⚠ marca da lista sem peça no portal é sinal de lista da Engenharia incompleta — dizer isso
        // é melhor que somar um sucesso que a fábrica nunca vai ver na fila.
        + (semPeca ? ` ⚠ ${semPeca} marca(s) sem peça cadastrada na OP: ${j.marcasSemPeca.slice(0, 6).join(", ")}${semPeca > 6 ? "…" : ""}.` : "")
        + " A seleção continua marcada — se estas peças já vão numa carga, gere o romaneio prévio agora.");
      // ⚠⚠ A SELEÇÃO NÃO É LIMPA AQUI, de propósito.
      // Prioridade e romaneio prévio são decisões diferentes sobre as MESMAS peças: uma diz à
      // fábrica o que fazer primeiro, a outra diz o que vai junto no caminhão. Limpar obrigava a
      // marcar tudo de novo para fazer as duas — Vitor (24/08/2026): "ou teremos que marcar
      // novamente". Mantendo, os dois botões servem a uma seleção só.
      //
      // ⚠ e NÃO se cria romaneio prévio automático: ele consome um NÚMERO da série que continua a
      // dos romaneios já emitidos, e nasceria sem data nem local. Carga é decisão de quando e como
      // embarca; prioridade é ordem de fabricação. Amarrar as duas encheria a fila da Expedição de
      // documento que ninguém pediu.
    } catch (e) { setErro(e.message); } finally { setPriorizando(false); }
  }

  // Baixa MANUAL (sem romaneio) das marcas selecionadas, com motivo.
  async function darBaixa() {
    if (!marcadas.length) return;
    setSalvandoBaixa(true); setErro("");
    try {
      const itens = marcadas.map((m) => ({ marca: m.marca, frente: m.frente, qtd: qteUsar(m), pesoKg: pesoUsar(m) }));
      const r = await fetch(`/api/comercial/op/${opId}/baixa-expedicao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo: motivoBaixa, observacao: obsBaixa.trim() || null, itens }) });
      const j = await r.json(); if (!r.ok || !j.success) throw new Error(j.error || "Erro ao dar baixa");
      setModalBaixa(false); setObsBaixa(""); setSel({}); setQtdImport({});
      await carregarMarcas();
      setMsg(`Baixa registrada em ${itens.length} marca(s) — ${MOTIVO_LABEL[motivoBaixa]}.`);
    } catch (e) { setErro(e.message); } finally { setSalvandoBaixa(false); }
  }
  async function desfazerBaixa(id) {
    try { await fetch(`/api/comercial/op/${opId}/baixa-expedicao?id=${id}`, { method: "DELETE" }); await carregarMarcas(); }
    catch { /* silencioso */ }
  }

  // Extrai a 1ª marca conhecida de uma célula/texto (tokeniza — aceita "T45 - Viga").
  function marcaNaCelula(cell) {
    for (const tok of String(cell ?? "").split(/[\s,;|"'\t]+/)) {
      const t = tok.trim().toUpperCase().replace(/^[.,;:(\[]+|[.,;:)\]]+$/g, "");
      if (t.length < 2) continue;
      const m = conhecidas.get(t);
      if (m) return { m, key: t };
    }
    return null;
  }

  // Lê o arquivo (Excel/CSV = linhas de células; PDF = linhas de texto) e abre a
  // PRÉVIA de importação pra você conferir/mapear as colunas antes de aplicar.
  async function prepararImport(file) {
    if (!file) return;
    setImportando(true); setErro(""); setMsg("");
    try {
      let rows = [];
      if (/\.pdf$/i.test(file.name)) {
        const fd = new FormData(); fd.append("arquivo", file);
        const j = await fetch(`/api/comercial/op/${opId}/lista-expedicao/ler-arquivo`, { method: "POST", body: fd }).then((r) => r.json());
        if (!j.success) throw new Error(j.error);
        rows = String(j.texto || "").split(/\r?\n/).map((l) => l.split(/ {2,}|\t/)).filter((r) => r.some((c) => String(c ?? "").trim()));
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        for (const nome of wb.SheetNames) {
          for (const r of XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, blankrows: false })) rows.push(r || []);
        }
      }
      if (!rows.length) { setErro(`"${file.name}" está vazio.`); return; }
      setImp({ rows, nome: file.name });
    } catch (e) { setErro(e.message); } finally { setImportando(false); }
  }

  // Aplica o resultado da prévia: marca as peças e grava as quantidades lidas/ajustadas.
  function aplicarImport(achadas, nome) {
    const vals = [...achadas.values()];
    if (!vals.length) { setErro("Nenhuma marca reconhecida na lista."); return; }
    const comQtd = vals.filter((a) => a.qtd != null).length;
    setSel((s) => { const n = { ...s }; for (const a of vals) n[chave(a.m)] = true; return n; });
    setQtdImport((q) => { const n = { ...q }; for (const a of vals) if (a.qtd != null) n[chave(a.m)] = a.qtd; return n; });
    const jaExp = vals.filter((a) => a.m.expedido === true).length;
    setImp(null);
    setMsg(
      `${vals.length} peça(s) de "${nome}" selecionada(s)` +
      (comQtd ? ` · ${comQtd} com a quantidade da lista` : ` · quantidades não lidas — ajuste na coluna Qtd`) +
      (jaExp ? ` — atenção: ${jaExp} já constam como expedidas` : "") + "."
    );
  }

  async function exportar() {
    setExportando(true); setErro("");
    try {
      // ⚠ o filtro de COLUNA conta como filtro aqui. Sem isto, quem filtrasse só pelo funil
      // exportaria a lista inteira achando que exportou o que estava vendo.
      const rotulosCol = Object.entries(filtroCol).filter(([, v]) => v?.size).map(([k]) => COLUNAS_FILTRO.find((c) => c.key === k)?.label || k);
      const filtrando = busca.trim() || situacao !== "todas" || frente || rotulosCol.length > 0;
      await exportarListaExpedicao({
        op: dados.op, frentes,
        marcasFiltradas: filtrando ? filtradas : null,
        sufixo: filtrando
          ? `filtro: ${[frente, situacao !== "todas" ? situacao : null, busca.trim() ? `"${busca.trim()}"` : null, ...rotulosCol.map((r) => r.toLowerCase())].filter(Boolean).join(" / ")}`
          : null,
      });
    } catch (e) { setErro(e.message); } finally { setExportando(false); }
  }

  async function patchPrevio(p, body, tag) {
    setOcupado((o) => ({ ...o, [p.id]: tag }));
    try {
      const r = await fetch(`/api/comercial/op/${opId}/romaneios-previos/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      carregarPrevios();
    } catch (e) { setErro(e.message); } finally { setOcupado((o) => ({ ...o, [p.id]: null })); }
  }
  const aprovar = (p) => { if (confirm(`Aprovar a entrega do romaneio prévio ${String(p.numero).padStart(2, "0")}? Ele passa a valer para a Expedição.`)) patchPrevio(p, { aprovado: true }, "ok"); };
  const reabrir = (p) => patchPrevio(p, { aprovado: false }, "ok");
  const acrescentar = (p) => {
    const novos = marcadas.filter((m) => !(p.itens || []).some((i) => String(i.marca).toUpperCase() === String(m.marca).toUpperCase()));
    if (!novos.length) return setErro("As peças selecionadas já estão nesta carga.");
    patchPrevio(p, { itens: [...(p.itens || []), ...novos.map((m) => ({ frente: m.frente, marca: m.marca, descricao: m.descricao, qte: qteUsar(m), pesoTotal: pesoUsar(m) }))] }, "itens");
    setSel({}); setQtdImport({});
  };
  const removerItem = (p, marca) => {
    const itens = (p.itens || []).filter((i) => String(i.marca).toUpperCase() !== String(marca).toUpperCase());
    if (!itens.length) return setErro("A carga precisa ter ao menos uma peça — exclua o romaneio prévio se quiser desfazer.");
    patchPrevio(p, { itens }, "itens");
  };
  async function excluirPrevio(p) {
    if (!confirm(`Excluir o romaneio prévio ${String(p.numero).padStart(2, "0")}?`)) return;
    await fetch(`/api/comercial/op/${opId}/romaneios-previos/${p.id}`, { method: "DELETE" }).catch(() => {});
    carregarPrevios();
  }
  function copiarCronograma(p) {
    navigator.clipboard?.writeText(`Entrega — Romaneio prévio ${String(p.numero).padStart(2, "0")} · ${(p.itens || []).length} peças · ${fmtKg(p.pesoKg)}${p.dataPrevista ? ` · previsto ${fmtD(p.dataPrevista)}` : ""}${p.local ? ` · ${p.local}` : ""}`);
    setMsg("Linha copiada — cole no cronograma da obra.");
  }

  const inp = "text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white";
  const nomeLote = (id) => lotes.find((l) => l.id === id)?.nome || null;

  return (
    <div className="space-y-4">
      <div className={semCard ? "" : "bg-white rounded-xl border border-gray-100 shadow-sm p-4"}>
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5">
            <PackageSearch size={15} className="text-torg-blue" />
            {semCard ? "Peças da lista" : <>Lista de expedição <span className="text-torg-gray font-normal">· consulta por peça</span></>}
          </h3>
          <button onClick={exportar} disabled={exportando || !todas.length} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-40">{exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar peças</button>
        </div>
        {readOnly
          ? <p className="text-[11px] text-torg-gray mb-3">Acompanhamento por peça — o que já foi <strong>expedido</strong>, o que <strong>falta</strong> e em qual <strong>romaneio</strong> saiu.</p>
          : <p className="text-[11px] text-torg-gray mb-3">Marque as peças uma a uma <strong>ou importe um Excel/PDF</strong> com a relação — abre uma <strong>prévia</strong> pra você confirmar qual coluna é a marca e qual é a <strong>quantidade</strong>, casa com as peças e seleciona. Depois monte o <strong>romaneio prévio</strong>.</p>}

        {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        {msg && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2 inline-flex items-center gap-1"><CheckCircle2 size={13} /> {msg}</p>}

        {dados === null && !erro ? (
          <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
        ) : !todas.length ? (
          <p className="text-sm text-torg-gray py-8 text-center">Nenhuma lista de expedição importada para esta OP ainda — importe na aba <strong>Engenharia</strong>.</p>
        ) : (<>
          {/* ⚠ EMBUTIDO, SÓ O QUE A TABELA DE CIMA NÃO DÁ. "Marcas" e "Peso expedido" repetiam
              exatamente as colunas MARCAS / CONTRATADO / EXPEDIDO do resumo por frente — os mesmos
              620 e os mesmos 87.639,84 kg, um palmo abaixo. O que só existe aqui é a CONTAGEM de
              marcas expedidas e pendentes; é isso que fica. */}
          <div className={`grid gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3 ${semCard ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
            {!semCard && <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Marcas</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{todas.length}</p></div>}
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Marcas expedidas</p><p className="text-lg font-extrabold text-emerald-700 tabular-nums">{nFull}<span className="text-sm font-bold text-torg-gray-light">/{todas.length}</span></p><p className="text-[10px] text-torg-gray">{[nParcial ? `${nParcial} parcial(is)` : null, nBaixa ? `${nBaixa} baixa` : null].filter(Boolean).join(" · ") || " "}</p></div>
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Marcas pendentes</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{nPendente}</p></div>
            {!semCard && <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Peso expedido</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtKg(pesoExpedidoReal)}</p><p className="text-[10px] text-torg-gray">de {fmtKg(contratado)}</p></div>}
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="relative flex-1 min-w-[170px]">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca, descrição ou romaneio…" className={`${inp} w-full pl-7 pr-7`} />
              {busca && <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-torg-gray hover:text-torg-dark"><X size={13} /></button>}
            </div>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={inp}>
              <option value="todas">Todas</option>
              <option value="expedidas">Só expedidas</option>
              <option value="parciais">Só parciais</option>
              <option value="baixas">Só baixas (sem romaneio)</option>
              <option value="pendentes">Só pendentes</option>
            </select>
            {/* importar relação de peças (ao lado do filtro, como pedido) */}
            {!readOnly && <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={(e) => { prepararImport(e.target.files?.[0]); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={importando} className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50 disabled:opacity-50" title="Excel ou PDF com a relação de peças — seleciono as marcas automaticamente">
                {importando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Selecionar por arquivo
              </button>
            </>}
            {frentes.length > 1 && (
              <select value={frente} onChange={(e) => setFrente(e.target.value)} className={`${inp} max-w-[150px]`}>
                <option value="">Todas as frentes</option>
                {frentes.map((f) => <option key={f.frente} value={f.frente}>{f.frente}</option>)}
              </select>
            )}
            <span className="text-[11px] text-torg-gray whitespace-nowrap">{filtradas.length} de {todas.length} · {fmtKg(pesoFiltrado)}</span>
            {filtrosAtivos > 0 && (
              <button onClick={limparColunas} className="text-[11px] text-torg-orange hover:underline font-semibold whitespace-nowrap">
                limpar {filtrosAtivos} filtro(s) de coluna
              </button>
            )}
          </div>

          {!readOnly && marcadas.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2 bg-torg-blue-50/60 border border-torg-blue-200 rounded-lg px-3 py-2 text-xs">
              <span className="font-semibold text-torg-dark">{marcadas.length} peça(s){unSel ? ` · ${unSel} un` : ""} · {fmtKg(pesoSel)}{parciais ? <span className="text-amber-600"> · {parciais} parcial(is)</span> : ""}</span>
              <button onClick={() => setModal(true)} className="bg-torg-blue text-white rounded-lg px-2.5 py-1 font-medium inline-flex items-center gap-1 hover:bg-torg-dark"><Truck size={12} /> Gerar romaneio prévio{proximo ? ` ${String(proximo).padStart(2, "0")}` : ""}</button>
              {/* ⚠ mesma fila do "Mandar p/ produção" do PCP — não é prioridade "da expedição". */}
              <button onClick={priorizar} disabled={priorizando}
                title="Põe estes conjuntos na fila de prioridade da produção — sobem no topo do setor onde estiverem, no Painel de Produção"
                className="bg-torg-orange text-white rounded-lg px-2.5 py-1 font-medium inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-50">
                {priorizando ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />} Prioridade p/ produção
              </button>
              <button onClick={() => setModalBaixa(true)} className="bg-amber-500 text-white rounded-lg px-2.5 py-1 font-medium inline-flex items-center gap-1 hover:bg-amber-600" title="Marcar como expedida SEM romaneio, com um motivo"><CheckCircle2 size={12} /> Dar baixa (sem romaneio)</button>
              <button onClick={() => { setSel({}); setQtdImport({}); }} className="text-torg-gray hover:text-torg-dark ml-auto">limpar seleção</button>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-[11px] text-torg-gray uppercase">
                  {/* ⚠ SELECIONAR TODOS = as que dá para selecionar, entre as VISÍVEIS.
                      Marca totalmente expedida tem a caixinha desabilitada (não há o que pôr em
                      romaneio), então marcar "todas" incluindo essas encheria a seleção de peça que
                      o botão de montar carga descarta depois — e o número da seleção mentiria. */}
                  {!readOnly && (
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" checked={selecionaveis.length > 0 && selecionaveis.every((m) => sel[chave(m)])}
                        onChange={() => {
                          const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((m) => sel[chave(m)]);
                          setSel((s) => {
                            const n = { ...s };
                            for (const m of selecionaveis) { if (todasMarcadas) delete n[chave(m)]; else n[chave(m)] = true; }
                            return n;
                          });
                        }}
                        title={`Selecionar as ${selecionaveis.length} peça(s) com saldo a expedir nesta lista`}
                        className="accent-torg-blue" />
                    </th>
                  )}
                  <ThFiltro col="marca" label="Marca" className="text-left px-3 py-2 font-medium" {...fp} />
                  <ThFiltro col="descricao" label="Descrição" className="text-left px-3 py-2 font-medium" {...fp} />
                  <th className="text-right px-3 py-2 font-medium w-16">Qtd</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Expedido</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Peso</th>
                  <ThFiltro col="situacao" label="Situação" larg="w-32" className="text-left px-3 py-2 font-medium" {...fp} />
                  <ThFiltro col="romaneio" label="Romaneio" larg="w-24" className="text-left px-3 py-2 font-medium" {...fp} />
                  <th className="text-left px-3 py-2 font-medium w-28">Expedida em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visiveis.map((m, i) => {
                  const k = chave(m);
                  const exp = expQ(m), tot = totQ(m), pend = pendQ(m), sit = situacaoM(m);
                  const semPendente = pend != null && pend <= 0;
                  return (
                    <tr key={`${k}-${i}`} className={sel[k] ? "bg-torg-blue-50/50" : sit === "baixa" ? "bg-amber-100/70" : sit === "expedida" ? "bg-emerald-50/40" : sit === "parcial" ? "bg-amber-50/30" : ""}>
                      {!readOnly && <td className="px-2 py-1.5"><input type="checkbox" checked={!!sel[k]} disabled={semPendente} onChange={() => setSel((s) => { const n = { ...s }; if (n[k]) delete n[k]; else n[k] = true; return n; })} className="accent-torg-blue disabled:opacity-30" title={semPendente ? "Marca totalmente expedida" : ""} /></td>}
                      <td className="px-3 py-1.5 font-mono text-torg-dark whitespace-nowrap">{m.marca}</td>
                      <td className="px-3 py-1.5 text-torg-gray truncate max-w-[240px]" title={m.descricao}>{m.descricao || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {sel[k] ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number" min={0} max={pend ?? undefined} step="1"
                              value={qteUsar(m)}
                              onChange={(e) => { const v = e.target.value; setQtdImport((q) => ({ ...q, [k]: v === "" ? 0 : Math.max(0, Math.floor(Number(v) || 0)) })); }}
                              className="w-14 text-right border border-torg-blue-300 rounded px-1 py-0.5 text-[12px] tabular-nums outline-none focus:border-torg-blue bg-white"
                            />
                            {pend != null && <span className="text-[10px] text-torg-gray">/{pend}</span>}
                          </span>
                        ) : (
                          <span className="text-torg-gray">{tot ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {sit === "expedida"
                          ? <span className="text-emerald-700 font-semibold">{exp > 0 ? exp.toLocaleString("pt-BR") : (tot != null ? tot.toLocaleString("pt-BR") : "✓")}</span>
                          : exp > 0 ? <span className="text-emerald-700 font-semibold">{exp.toLocaleString("pt-BR")}</span>
                          : <span className="text-gray-300">0</span>}
                        {sit === "parcial" && pend != null && pend > 0 && <span className="block text-[10px] text-amber-600">faltam {pend.toLocaleString("pt-BR")}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-torg-dark tabular-nums whitespace-nowrap">{fmtKg(sel[k] ? pesoUsar(m) : m.pesoTotal)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {sit === "baixa"
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold inline-flex items-center gap-1" title={(m.baixas || []).map((b) => MOTIVO_LABEL[b.motivo] + (b.observacao ? ` — ${b.observacao}` : "")).join(" · ")}><CheckCircle2 size={10} /> {MOTIVO_LABEL[m.baixas?.[0]?.motivo] || "baixa manual"}</span>
                          : sit === "expedida"
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium inline-flex items-center gap-1"><CheckCircle2 size={10} /> expedida</span>
                          : sit === "parcial"
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium inline-flex items-center gap-1"><Clock size={10} /> parcial {exp}/{tot}</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray font-medium inline-flex items-center gap-1"><Clock size={10} /> pendente</span>}
                      </td>
                      <td className="px-3 py-1.5 text-torg-gray whitespace-nowrap">
                        {sit === "baixa"
                          ? <span className="inline-flex items-center gap-1 text-amber-700">baixa manual{!readOnly && m.baixas?.[0]?.id && <button onClick={() => desfazerBaixa(m.baixas[0].id)} className="text-gray-400 hover:text-red-600" title="Desfazer baixa"><X size={11} /></button>}</span>
                          : (m.romaneio || "—")}
                      </td>
                      <td className="px-3 py-1.5 text-torg-gray whitespace-nowrap">{m.dataExpedicao ? fmtD(m.dataExpedicao) : "—"}</td>
                    </tr>
                  );
                })}
                {!filtradas.length && <tr><td colSpan={readOnly ? 8 : 9} className="px-3 py-6 text-center text-sm text-torg-gray">Nenhuma peça encontrada com esse filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          {filtradas.length > LIMITE && <p className="text-[11px] text-torg-gray mt-1.5">Mostrando as {LIMITE} primeiras de {filtradas.length} — refine a busca, ou use <strong>Exportar</strong> (respeita o filtro).</p>}
        </>)}
      </div>

      {/* ── romaneios prévios ── */}
      {!readOnly && (previos.length > 0 || todas.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5 mb-1"><Truck size={15} className="text-torg-blue" /> Romaneios prévios <span className="text-torg-gray font-normal">· prioridade de entrega</span></h3>
          <p className="text-[11px] text-torg-gray mb-3">A carga fica <strong>em aberto</strong> até ser aprovada. Aprovada, vale para a Expedição. A numeração segue o último romaneio emitido{proximo ? ` — o próximo é o ${String(proximo).padStart(2, "0")}` : ""}.</p>

          {previos.length === 0 ? (
            <p className="text-sm text-torg-gray py-4 text-center">Nenhum romaneio prévio ainda — selecione peças acima e clique em <strong>Gerar romaneio prévio</strong>.</p>
          ) : (
            <div className="space-y-2">
              {previos.map((p) => {
                const aberto = !!ab[p.id];
                const st = STATUS[p.status] || STATUS.PREVISTO;
                const busy = ocupado[p.id];
                return (
                  <div key={p.id} className={`border rounded-lg overflow-hidden ${p.status === "APROVADO" ? "border-emerald-200" : "border-amber-200"}`}>
                    <div className={`px-3 py-2 flex items-center gap-2 flex-wrap ${p.status === "APROVADO" ? "bg-emerald-50/70" : "bg-amber-50/70"}`}>
                      <span className="text-[11px] font-mono font-bold text-white bg-torg-blue rounded px-1.5 py-0.5">{String(p.numero).padStart(2, "0")}</span>
                      <span className="text-[13px] font-semibold text-torg-dark">{(p.itens || []).length} peça(s) · {fmtKg(p.pesoKg)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.c}`}>{st.l}</span>
                      {p.dataPrevista && <span className="text-[11px] text-torg-gray inline-flex items-center gap-0.5"><CalendarDays size={11} /> {fmtD(p.dataPrevista)}</span>}
                      {p.local && <span className="text-[11px] text-torg-gray inline-flex items-center gap-0.5"><MapPin size={11} /> {p.local}</span>}
                      {nomeLote(p.loteId) && <span className="text-[10px] px-2 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue font-medium">lote: {nomeLote(p.loteId)}</span>}
                      {p.nfNumero && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium inline-flex items-center gap-1" title={p.nfEmitidaEm ? `NF registrada em ${fmtD(p.nfEmitidaEm)}` : "NF vinculada pelo Fiscal"}>NF {p.nfNumero}{p.nfTipo ? ` · ${p.nfTipo}` : ""}</span>}
                      <div className="ml-auto flex items-center gap-2">
                        {p.status !== "APROVADO"
                          ? <button onClick={() => aprovar(p)} disabled={!!busy} className="text-[12px] bg-emerald-600 text-white rounded-lg px-2 py-1 font-medium inline-flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50">{busy === "ok" ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />} Aprovar entrega</button>
                          : <button onClick={() => reabrir(p)} disabled={!!busy} className="text-[12px] text-torg-gray hover:text-amber-700 inline-flex items-center gap-1 font-medium disabled:opacity-50">{busy === "ok" ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} reabrir</button>}
                        <button onClick={() => setAb((a) => ({ ...a, [p.id]: !aberto }))} className="text-[12px] text-torg-blue hover:text-torg-dark font-medium">{aberto ? "ocultar" : "ver/editar"} peças</button>
                        <button onClick={() => copiarCronograma(p)} className="text-torg-gray hover:text-torg-blue" title="Copiar a linha para o cronograma"><Copy size={13} /></button>
                        <button onClick={() => excluirPrevio(p)} className="text-torg-gray hover:text-red-600" title="Excluir"><Trash2 size={13} /></button>
                      </div>
                    </div>

                    <div className="px-3 py-2 bg-amber-50/40 border-t border-amber-100">
                      <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Para o cronograma (ainda não lançado)</p>
                      <p className="text-[12px] text-torg-dark font-mono">Entrega — Romaneio prévio {String(p.numero).padStart(2, "0")} · {(p.itens || []).length} peças · {fmtKg(p.pesoKg)}{p.dataPrevista ? ` · previsto ${fmtD(p.dataPrevista)}` : ""}{p.local ? ` · ${p.local}` : ""}</p>
                    </div>

                    {aberto && (
                      <div className="border-t border-gray-100">
                        <div className="px-3 py-2 flex items-center gap-2 flex-wrap bg-white">
                          <button onClick={() => acrescentar(p)} disabled={!marcadas.length || !!busy} className="text-[12px] text-torg-blue border border-torg-blue-200 rounded-lg px-2 py-1 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50 disabled:opacity-40" title={marcadas.length ? "" : "Selecione peças na lista acima"}>{busy === "itens" ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Acrescentar {marcadas.length || ""} selecionada(s)</button>
                          <select value={p.loteId || ""} onChange={(e) => patchPrevio(p, { loteId: e.target.value || null }, "lote")} className={`${inp} max-w-[200px]`}>
                            <option value="">— sem lote de entrega —</option>
                            {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                          </select>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          <table className="w-full text-[12px]">
                            <thead className="bg-gray-50 sticky top-0 text-torg-gray"><tr>
                              <th className="text-left px-3 py-1 font-medium">Marca</th>
                              <th className="text-left px-3 py-1 font-medium">Descrição</th>
                              <th className="text-right px-3 py-1 font-medium w-16">Qtd</th>
                              <th className="text-right px-3 py-1 font-medium w-24">Peso</th>
                              <th className="px-2 py-1 w-8"></th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-50">
                              {(p.itens || []).map((it, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-1 font-mono text-torg-dark">{it.marca}</td>
                                  <td className="px-3 py-1 text-torg-gray truncate max-w-[220px]">{it.descricao || "—"}</td>
                                  <td className="px-3 py-1 text-right text-torg-gray tabular-nums">{it.qte ?? "—"}</td>
                                  <td className="px-3 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">{fmtKg(it.pesoTotal)}</td>
                                  <td className="px-2 py-1"><button onClick={() => removerItem(p, it.marca)} disabled={!!busy} className="text-torg-gray hover:text-red-600 disabled:opacity-40" title="Retirar desta carga"><X size={12} /></button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {imp && <ImportarListaModal rows={imp.rows} nome={imp.nome} marcaNaCelula={marcaNaCelula} onAplicar={aplicarImport} onClose={() => setImp(null)} />}
      {modalBaixa && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setModalBaixa(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-amber-500" /> Dar baixa sem romaneio</h3>
              <button onClick={() => setModalBaixa(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-torg-gray"><strong>{marcadas.length} marca(s)</strong> vão ficar <strong>expedidas sem romaneio</strong> (destacadas em amarelo na lista). Escolha o motivo:</p>
              <div className="space-y-1.5">
                {MOTIVOS_BAIXA.map((mo) => (
                  <label key={mo.v} className="flex items-center gap-2 text-sm cursor-pointer text-torg-dark">
                    <input type="radio" name="motivoBaixa" checked={motivoBaixa === mo.v} onChange={() => setMotivoBaixa(mo.v)} className="accent-amber-500" />
                    {mo.l}
                  </label>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-torg-dark mb-1">Observação <span className="text-gray-400">(opcional)</span></label>
                <input value={obsBaixa} onChange={(e) => setObsBaixa(e.target.value)} placeholder="Detalhe se quiser" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
              </div>
              {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setModalBaixa(false)} className="text-sm text-torg-gray border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Cancelar</button>
              <button onClick={darBaixa} disabled={salvandoBaixa} className="text-sm font-semibold text-white bg-amber-500 rounded-lg px-4 py-1.5 hover:bg-amber-600 disabled:opacity-50 inline-flex items-center gap-1.5">{salvandoBaixa ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Dar baixa</button>
            </div>
          </div>
        </div>
      )}
      {modal && <NovoPrevioModal opId={opId} numero={proximo} itens={marcadas.map((m) => ({ ...m, qte: qteUsar(m), pesoTotal: pesoUsar(m) }))} peso={pesoSel} lotes={lotes} localObra={localEntrega} onClose={() => setModal(false)} onCriado={() => { setModal(false); setSel({}); setQtdImport({}); carregarPrevios(); setMsg("Romaneio prévio criado."); }} />}
    </div>
  );
}

// Prévia da importação: mostra as linhas do arquivo, deixa MAPEAR a coluna da marca
// e a da quantidade, e exibe o resultado casado antes de aplicar. À prova de layout.
function ImportarListaModal({ rows, nome, marcaNaCelula, onAplicar, onClose }) {
  const nCols = useMemo(() => rows.reduce((mx, r) => Math.max(mx, (r || []).length), 0), [rows]);
  const nrm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const inteiro = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isFinite(n) && n > 0 ? n : null; };

  // Auto-detecção: marca = coluna com mais marcas conhecidas; qtd = coluna cujo cabeçalho bate.
  const auto = useMemo(() => {
    const marcaHits = Array(nCols).fill(0);
    for (const r of rows) for (let c = 0; c < nCols; c++) if (marcaNaCelula((r || [])[c])) marcaHits[c]++;
    let marcaCol = -1, best = 0;
    marcaHits.forEach((h, c) => { if (h > best) { best = h; marcaCol = c; } });
    let qtdCol = -1;
    for (let ri = 0; ri < Math.min(rows.length, 12) && qtdCol < 0; ri++) {
      (rows[ri] || []).forEach((cell, c) => {
        if (qtdCol < 0 && c !== marcaCol && /(^|[^a-z])(qtd|qtde|qte|qt|quant|quantidade|pc|pcs|pca|pcas|peca|pecas|un|und|unid|unidade|expedir|enviar|saldo|remessa)([^a-z]|$)/.test(nrm(cell))) qtdCol = c;
      });
    }
    return { marcaCol, qtdCol };
  }, [rows, nCols]);

  const [marcaCol, setMarcaCol] = useState(auto.marcaCol);
  const [qtdCol, setQtdCol] = useState(auto.qtdCol);

  const achadas = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      let hit = marcaCol >= 0 ? marcaNaCelula((r || [])[marcaCol]) : null;
      if (!hit && marcaCol < 0) for (const cc of (r || [])) { hit = marcaNaCelula(cc); if (hit) break; }
      if (!hit) continue;
      const qtd = qtdCol >= 0 ? inteiro((r || [])[qtdCol]) : null;
      const ex = map.get(hit.key);
      map.set(hit.key, { m: hit.m, qtd: qtd == null ? (ex?.qtd ?? null) : (ex?.qtd ?? 0) + qtd });
    }
    return map;
  }, [rows, marcaCol, qtdCol]);
  const vals = [...achadas.values()];
  const comQtd = vals.filter((a) => a.qtd != null).length;

  const cols = Array.from({ length: nCols }, (_, i) => i);
  const preview = rows.slice(0, 12);
  const setCol = (c, papel) => {
    if (papel === "marca") { setMarcaCol(c); if (qtdCol === c) setQtdCol(-1); }
    else if (papel === "qtd") { setQtdCol(c); if (marcaCol === c) setMarcaCol(-1); }
    else { if (marcaCol === c) setMarcaCol(-1); if (qtdCol === c) setQtdCol(-1); }
  };
  const papelDe = (c) => (c === marcaCol ? "marca" : c === qtdCol ? "qtd" : "");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><FileSpreadsheet size={15} className="text-torg-blue" /> Conferir importação — {nome}</h3>
            <p className="text-[11px] text-torg-gray mt-0.5 max-w-lg">Confirme qual coluna é a <strong>marca</strong> e qual é a <strong>quantidade a enviar</strong>. O portal casa com as peças da OP e mostra o resultado antes de aplicar.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`px-2 py-1 rounded-lg font-medium ${vals.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{vals.length} marca(s) reconhecida(s)</span>
            <span className={`px-2 py-1 rounded-lg font-medium ${comQtd ? "bg-torg-blue-50 text-torg-blue" : "bg-gray-100 text-torg-gray"}`}>{comQtd} com quantidade lida</span>
            {qtdCol < 0 && <span className="text-amber-700">— escolha a coluna de <strong>Quantidade</strong> no cabeçalho abaixo</span>}
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[300px] overflow-y-auto">
            <table className="text-[11px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>{cols.map((c) => (
                  <th key={c} className="px-2 py-1.5 border-l first:border-l-0 border-gray-100">
                    <select value={papelDe(c)} onChange={(e) => setCol(c, e.target.value)} className={`text-[11px] rounded px-1 py-0.5 border outline-none cursor-pointer ${c === marcaCol ? "border-torg-blue text-torg-blue bg-torg-blue-50 font-semibold" : c === qtdCol ? "border-emerald-400 text-emerald-700 bg-emerald-50 font-semibold" : "border-gray-200 text-torg-gray"}`}>
                      <option value="">col {c + 1}</option>
                      <option value="marca">Marca</option>
                      <option value="qtd">Quantidade</option>
                    </select>
                  </th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map((r, ri) => (
                  <tr key={ri} className="hover:bg-gray-50/40">
                    {cols.map((c) => {
                      const val = (r || [])[c];
                      return <td key={c} className={`px-2 py-1 border-l first:border-l-0 border-gray-50 whitespace-nowrap ${c === marcaCol ? "font-mono text-torg-dark" : c === qtdCol ? "text-emerald-700 text-right tabular-nums" : "text-torg-gray"}`}>{val == null || val === "" ? "" : String(val)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > preview.length && <p className="text-[10px] text-torg-gray">Mostrando as {preview.length} primeiras de {rows.length} linhas — a importação usa todas.</p>}

          {vals.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-torg-dark mb-1">Vai importar:</p>
              <div className="border border-gray-100 rounded-lg max-h-[150px] overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 sticky top-0 text-torg-gray"><tr><th className="text-left px-3 py-1 font-medium">Marca</th><th className="text-right px-3 py-1 font-medium">Qtd da lista</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {vals.slice(0, 80).map((a, i) => (
                      <tr key={i}><td className="px-3 py-1 font-mono text-torg-dark">{a.m.marca}</td><td className="px-3 py-1 text-right tabular-nums">{a.qtd != null ? a.qtd : <span className="text-amber-600">total da marca</span>}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs text-torg-gray border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => onAplicar(achadas, nome)} disabled={!vals.length} className="text-xs font-semibold text-white bg-torg-blue rounded-lg px-4 py-1.5 hover:bg-torg-dark disabled:opacity-40 inline-flex items-center gap-1.5"><CheckCircle2 size={13} /> Aplicar {vals.length || ""} peça(s)</button>
        </div>
      </div>
    </div>
  );
}

function NovoPrevioModal({ opId, numero, itens, peso, lotes, localObra, onClose, onCriado }) {
  // lote: "__novo__" = criar "Romaneio NN" (padrão), "" = sem lote, ou id existente.
  // Local já vem preenchido das informações da obra e pode ser alterado.
  const [f, setF] = useState({ dataPrevista: "", local: localObra || "", observacao: "", loteId: "__novo__" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";
  const jaExp = itens.filter((m) => m.expedido === true).length;
  const nn = numero ? String(numero).padStart(2, "0") : "NN";

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/romaneios-previos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: itens.map((m) => ({ frente: m.frente, marca: m.marca, descricao: m.descricao, qte: m.qte, pesoTotal: m.pesoTotal })),
          dataPrevista: f.dataPrevista || null, local: f.local.trim() || null, observacao: f.observacao.trim() || null,
          loteId: f.loteId && f.loteId !== "__novo__" ? f.loteId : null,
          criarLote: f.loteId === "__novo__",
        }),
      });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onCriado();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><Truck size={15} className="text-torg-blue" /> Romaneio prévio {numero ? String(numero).padStart(2, "0") : ""}</h3>
            <p className="text-[11px] text-torg-gray mt-0.5">{itens.length} peça(s) · {fmtKg(peso)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {jaExp > 0 && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><AlertCircle size={13} /> {jaExp} peça(s) selecionada(s) já constam como expedidas.</p>}
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Lote de entrega</label>
            <select value={f.loteId} onChange={(e) => setF((v) => ({ ...v, loteId: e.target.value }))} className={inp}>
              <option value="__novo__">Criar lote deste romaneio — Romaneio {nn}</option>
              <option value="">— sem lote —</option>
              {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            {f.loteId === "__novo__" && <p className="text-[10px] text-torg-gray mt-0.5">Cria o lote “Romaneio {nn}” com estas {itens.length} peça(s) e o peso — aparece na Expedição.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data prevista</label>
              <input type="date" value={f.dataPrevista} onChange={(e) => setF((v) => ({ ...v, dataPrevista: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Local de entrega</label>
              <input value={f.local} onChange={(e) => setF((v) => ({ ...v, local: e.target.value }))} placeholder="Ex: Obra SP" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <input value={f.observacao} onChange={(e) => setF((v) => ({ ...v, observacao: e.target.value }))} placeholder="Opcional" className={inp} />
          </div>
          <p className="text-[11px] text-torg-gray">Nasce <strong>em aberto</strong>; só vai para a Expedição depois de aprovado. Nada é lançado no cronograma.</p>
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando && <Loader2 size={14} className="animate-spin" />} Gerar</button>
        </div>
      </div>
    </div>
  );
}
