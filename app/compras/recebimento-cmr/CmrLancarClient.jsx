"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Loader2, Plus, ClipboardPaste, Save, Trash2, Search, Check, X, PackagePlus, Filter, ArrowUp, ArrowDown, FileDown, RefreshCw, AlertCircle, Pencil } from "lucide-react";
import { avisosDeTinta } from "@/lib/material-tinta";
import CmrCampos, { VAZIO } from "./CmrCampos";
import CmrEditarModal from "./CmrEditarModal";
import CmrColarMassa from "./CmrColarMassa";
import CmrExcluirModal from "./CmrExcluirModal";
import ColunaFiltro from "./ColunaFiltro";

const anoAtual = new Date().getFullYear();
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtNum = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR"));
// R/RC é guardado no início da observação como "Tipo: R" — separa pra exibir na coluna própria.
function parseObs(observacao) {
  const s = String(observacao || "");
  const m = s.match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i);
  if (!m) return { rc: "", obs: s };
  return { rc: m[1].toUpperCase(), obs: s.slice(m[0].length).trim() };
}
// Ordem das colunas ao COLAR do Excel (igual à planilha CMR; o índice R é automático).
const COLS_MASSA = ["rc", "_indice", "descricao", "certificado", "loteCorrida", "especificacao", "pedidoCompra", "dataRecebimento", "nf", "fornecedor", "obra", "qtd", "pesoLitro", "observacao"];

const VAZIA = "(vazias)";
// Colunas da tabela (filtro/ordenação estilo Excel). `get` devolve o valor de exibição.
const COLUNAS = [
  { key: "rc", label: "R/RC", get: (l) => l.rc },
  { key: "importRef", label: "Índice R", get: (l) => l.importRef, num: true },
  { key: "nome", label: "Descrição do material", get: (l) => l.nome, w: 320 },
  { key: "cert", label: "Nº certificado", get: (l) => (l.certOk ? l.numeroDocumento : "") },
  { key: "corrida", label: "Lote / corrida", get: (l) => l.numeroCorrida || "" },
  { key: "norma", label: "Especificação", get: (l) => l.norma || "" },
  { key: "pedido", label: "Pedido compra", get: (l) => l.pedidoCompra || "" },
  { key: "data", label: "Data receb.", get: (l) => l.dataFmt },
  { key: "nf", label: "Nº NF", get: (l) => l.nfNumero || "" },
  { key: "fornecedor", label: "Fornecedor", get: (l) => l.fornecedor || "" },
  { key: "obra", label: "Obra", get: (l) => l.opNumero || "" },
  { key: "qtd", label: "Qtd pçs", get: (l) => l.quantidade ?? "", num: true, align: "right" },
  { key: "peso", label: "Peso/litro", get: (l) => l.pesoKg ?? "", num: true, align: "right" },
  { key: "obs", label: "Observação", get: (l) => l.obs || "", w: 200 },
];
const valorCol = (col, l) => { const v = col.get(l); return v == null || v === "" ? VAZIA : String(v); };

export default function CmrLancarClient() {
  const { showToast } = useStore();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [anos, setAnos] = useState([anoAtual]);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState(null); // null | "form" | "massa"
  const [form, setForm] = useState(VAZIO);
  const [massa, setMassa] = useState([]); // linhas coladas (array de objetos)
  const [salvando, setSalvando] = useState(false);
  const [pedido, setPedido] = useState(null); // itens puxados do pedido de compra
  const [buscandoPed, setBuscandoPed] = useState(false);
  const [itemPedido, setItemPedido] = useState(null); // idx da linha do pedido escolhida
  const [filtros, setFiltros] = useState({}); // { colKey: Set(valores) }
  const [ordenar, setOrdenar] = useState(null); // { key, dir }
  const [filtroAberto, setFiltroAberto] = useState(null); // { key, rect }
  const [selecionada, setSelecionada] = useState(null); // id da linha clicada (marca a linha toda)
  const [soSemCert, setSoSemCert] = useState(false); // filtro rápido: só os sem certificado
  const [excluir, setExcluir] = useState(null);      // linha em confirmação de exclusão
  const [confExcl, setConfExcl] = useState(false);   // checkbox de confirmação
  const [excluindo, setExcluindo] = useState(false);
  const [editar, setEditar] = useState(null);        // linha aberta para edição

  // Normaliza cada item p/ o filtro/ordenação (rc derivado, cert, data formatada).
  const linhas = useMemo(() => (dados?.itens || []).map((it) => {
    const { rc: rcSalvo, obs } = parseObs(it.observacao);
    const rc = rcSalvo || (Number(it.pesoKg) > 0 ? "R" : Number(it.quantidade) > 0 ? "RC" : "R");
    return { ...it, rc, obs, certOk: !!(it.numeroDocumento && String(it.numeroDocumento).trim()), dataFmt: fmtData(it.dataRecebimento) };
  }), [dados]);

  const passa = useCallback((l, exceto) => {
    for (const col of COLUNAS) {
      if (col.key === exceto) continue;
      const sel = filtros[col.key];
      if (sel && !sel.has(valorCol(col, l))) return false;
    }
    return true;
  }, [filtros]);

  const visiveis = useMemo(() => {
    let arr = linhas.filter((l) => passa(l, null));
    if (soSemCert) arr = arr.filter((l) => !l.certOk);
    if (ordenar) {
      const col = COLUNAS.find((c) => c.key === ordenar.key);
      arr = [...arr].sort((a, b) => {
        let x = col.get(a), y = col.get(b);
        if (col.num) { x = Number(x) || 0; y = Number(y) || 0; return ordenar.dir === "asc" ? x - y : y - x; }
        x = String(x || ""); y = String(y || "");
        return ordenar.dir === "asc" ? x.localeCompare(y, "pt-BR") : y.localeCompare(x, "pt-BR");
      });
    }
    return arr;
  }, [linhas, passa, ordenar, soSemCert]);

  const distintos = useCallback((colKey) => {
    const col = COLUNAS.find((c) => c.key === colKey);
    const set = new Set();
    for (const l of linhas) if (passa(l, colKey)) set.add(valorCol(col, l));
    return [...set].sort((a, b) => (col.num ? (Number(a) || 0) - (Number(b) || 0) : String(a).localeCompare(String(b), "pt-BR")));
  }, [linhas, passa]);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ ano: String(ano) });
    if (busca.trim()) p.set("q", busca.trim());
    const r = await fetch(`/api/compras/cmr?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.success) { setDados(r); if (r.anos?.length) setAnos(r.anos); }
  }, [ano, busca]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);

  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  async function puxarPedido() {
    const num = (form.pedidoCompra || "").trim();
    if (!num) { showToast("Digite o nº do pedido de compra", "erro"); return; }
    setBuscandoPed(true); setPedido(null); setItemPedido(null);
    try {
      const j = await fetch(`/api/compras/cmr/pedido?numero=${encodeURIComponent(num)}`).then((r) => r.json());
      if (!j.success) throw new Error(j.error || "Pedido não encontrado");
      setPedido(j);
      // preenche fornecedor/obra/NF do pedido de uma vez
      setForm((s) => ({ ...s, fornecedor: j.fornecedor || s.fornecedor, obra: (j.obra || s.obra || "").replace(/^OP\s*/i, "OP "), nf: j.nf || s.nf }));
    } catch (e) { showToast(e.message, "erro"); } finally { setBuscandoPed(false); }
  }
  /**
   * ⚠⚠ A ESCOLHA É PELO ÍNDICE DA LINHA DO PEDIDO, NUNCA PELA DESCRIÇÃO. Matheus (11/09/2026):
   * "quando ele digita um número de pedido e aparecem itens repetidos, ele precisa conseguir
   * selecionar apenas o que quer e ver a quantidade que está no pedido". Comparando descrição, um
   * pedido com a MESMA peça em três linhas acendia as três ao clicar em qualquer uma — e não havia
   * como dizer qual delas tinha sido escolhida, nem quanto faltava de cada uma.
   *
   * ⚠ A QUANTIDADE SUGERIDA É O SALDO, não o total do pedido. Numa linha de 40 peças com 25 já
   * recebidas, quem chega hoje traz 15; sugerir 40 faz o lançamento nascer errado por padrão. O
   * campo continua editável, e o saldo está escrito ao lado.
   */
  function escolherItemPedido(it) {
    setItemPedido(it.idx);
    const saldo = Math.max(0, (Number(it.qtd) || 0) - (Number(it.qtdRecebida) || 0)) || Number(it.qtd) || 0;
    setForm((s) => ({ ...s, descricao: it.descricao, qtd: saldo ? String(saldo) : s.qtd }));
  }

  async function salvarForm() {
    if (!form.descricao.trim()) { showToast("Informe a descrição do material", "erro"); return; }
    /* ⚠ AVISA, NÃO BLOQUEIA. O recebimento é lançado com a nota na mão e às vezes a validade não
       está legível na embalagem; travar faria o Almoxarifado inventar uma data, que é pior do que
       não ter. Fica um "—" honesto e o FEFO sabe que aquele lote não tem validade conhecida. */
    const faltando = avisosDeTinta(form);
    if (faltando.length && !confirm(
      `Este material é tinta e ficou sem ${faltando.join(" e ")}.\n\n` +
      "Sem validade o lote não entra na ordem de consumo por vencimento (FEFO).\n\nLançar assim mesmo?"
    )) return;
    setSalvando(true);
    try {
      const j = await lancar([form]);
      showToast(`Lançado — índice R ${j.indices?.[0] || ""} · enviando para a planilha…`, "success");
      // Mantém os campos repetitivos: quem lança uma nota inteira repete fornecedor, obra e NF.
      setForm({ ...VAZIO, rc: form.rc, obra: form.obra, fornecedor: form.fornecedor, dataRecebimento: form.dataRecebimento, nf: form.nf });
      setItemPedido(null);
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  }

  /**
   * GRAVA E DEVOLVE A TELA NA HORA — a planilha vai atrás, sem segurar ninguém.
   *
   * ⚠⚠ MATHEUS (11/09/2026): "está lento o botão de lançar; quando clicar já entrar na linha e ir
   * carregando o que precisar nesse meio tempo". Os segundos eram do writeback no SharePoint —
   * seis chamadas ao Graph esperadas ANTES da resposta. Agora a rota grava e responde (`espelhar:
   * false`), a linha entra na tabela com o R já definitivo, e `/espelhar` roda em seguida.
   *
   * ⚠ A LINHA QUE ENTRA VEM DO SERVIDOR, não é montada aqui. Uma linha "otimista" montada no
   * navegador mostraria a obra como foi digitada ("OP 0105") em vez da forma canônica que o banco
   * guardou — e a pessoa conferiria a tela achando que conferiu o registro.
   *
   * ⚠ FALHAR AQUI NÃO PERDE NADA: a reconciliação (diária e no botão Sincronizar) reenvia à
   * planilha os R que o portal tem e ela não. Por isso o erro só avisa, não desfaz.
   */
  async function lancar(lancamentos) {
    const r = await fetch("/api/compras/cmr", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ano, lancamentos, espelhar: false }),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || "Erro");
    if (j.itens?.length) setDados((d) => (d ? { ...d, itens: [...j.itens, ...d.itens], total: (d.total || 0) + j.itens.length } : d));
    espelhar(j.indices || []);
    return j;
  }

  async function espelhar(indices) {
    if (!indices.length) return;
    try {
      const j = await fetch("/api/compras/cmr/espelhar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, indices }),
      }).then((r) => r.json());
      if (!j.ok) showToast(`R ${indices[0]} gravado, mas a planilha não recebeu — use Sincronizar planilha`, "erro");
    } catch {
      showToast("Lançado no portal; a planilha será atualizada na próxima sincronização", "info");
    }
  }

  function colar(texto) {
    const linhas = texto.split(/\r?\n/).map((l) => l).filter((l) => l.trim());
    const parsed = linhas.map((l) => {
      const cels = l.split("\t");
      const o = {};
      COLS_MASSA.forEach((c, i) => { if (c !== "_indice") o[c] = (cels[i] || "").trim(); });
      return o;
    }).filter((o) => o.descricao);
    setMassa(parsed);
  }
  async function salvarMassa() {
    const validos = massa.filter((m) => m.descricao?.trim());
    if (!validos.length) { showToast("Cole linhas com descrição preenchida", "erro"); return; }
    setSalvando(true);
    try {
      const j = await lancar(validos);
      showToast(`${j.criados} lançamento(s) gravados (${j.indices?.[0]}…${j.indices?.[j.indices.length - 1]}) · enviando para a planilha…`, "success");
      setMassa([]); setModo(null);
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  }

  async function executarExcluir() {
    if (!excluir || !confExcl) return;
    setExcluindo(true);
    try {
      const r = await fetch(`/api/compras/cmr/${excluir.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Falha ao excluir");
      setDados((d) => d ? { ...d, itens: d.itens.filter((x) => x.id !== excluir.id), total: (d.total || 1) - 1 } : d);
      const av = j.planilha && !j.planilha.ok ? " (⚠ não consegui limpar na planilha — rode Sincronizar)" : "";
      showToast(`R ${excluir.importRef} excluído${av}`, "success");
      setExcluir(null); setConfExcl(false);
    } catch (e) { showToast(e.message, "erro"); } finally { setExcluindo(false); }
  }

  dados?.itens || [];

  // Reconcilia com a planilha do SharePoint (puxa rastreio digitado direto no Excel e
  // reenvia o que faltar lá). Chave = índice R.
  const [reconciliando, setReconciliando] = useState(false);
  async function reconciliarPlanilha() {
    setReconciliando(true);
    try {
      const r = await fetch("/api/compras/cmr/reconciliar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Falha na reconciliação");
      const partes = [];
      if (j.importados) partes.push(`${j.importados} novo(s) do Excel`);
      if (j.completados) partes.push(`${j.completados} completado(s)`);
      if (j.enviados) partes.push(`${j.enviados} enviado(s) ao Excel`);
      showToast(partes.length ? `Planilha sincronizada — ${partes.join(", ")}` : "Planilha já estava em dia", "success");
      if (j.importados || j.completados) carregar();
    } catch (e) { showToast(e.message, "erro"); } finally { setReconciliando(false); }
  }

  // Exporta pra .xlsx o que está VISÍVEL (respeita filtros/ordenação/busca) — todas as colunas da planilha.
  const [exportando, setExportando] = useState(false);
  async function exportarExcel() {
    if (!visiveis.length) { showToast("Nada para exportar", "erro"); return; }
    setExportando(true);
    try {
      const {criarExcelTabular}=await import('@/lib/excel-tabular');
      const {downloadWorkbook}=await import('@/lib/excel-relatorio');
      const header = COLUNAS.map((c) => c.label);
      const rows = visiveis.map((l) => COLUNAS.map((c) => {
        const v = c.get(l);
        if (v == null || v === "") return "";
        return c.num ? Number(v) : String(v);
      }));
      const wb=await criarExcelTabular({titulo:`Controle de materiais recebidos — ${ano}`,subtitulo:'Registros conforme os filtros selecionados no portal',abas:[{nome:`CMR ${ano}`,headers:header,linhas:rows,larguras:COLUNAS.map(c=>c.w?Math.min(70,Math.round(c.w/6.5)):Math.max(11,c.label.length+3))}]});
      await downloadWorkbook(wb, `CMR-TORG-${ano}.xlsx`);
    } catch (e) { showToast("Falha ao gerar Excel: " + e.message, "erro"); } finally { setExportando(false); }
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><PackagePlus size={22} className="text-torg-blue" /> Recebimentos (CMR)</h1>
          <p className="text-[12px] text-torg-gray mt-0.5">Lançamento de matéria-prima recebida — controle de materiais rastreáveis, por ano.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue">
            {[...new Set([anoAtual, ...anos])].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Ações de lançamento */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setModo(modo === "form" ? null : "form"); setForm(VAZIO); }}
          className={`text-sm font-medium rounded-lg px-4 py-2.5 inline-flex items-center gap-2 ${modo === "form" ? "bg-torg-blue text-white" : "bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50"}`}>
          <Plus size={16} /> Lançar item
        </button>
        <button onClick={() => { setModo(modo === "massa" ? null : "massa"); setMassa([]); }}
          className={`text-sm font-medium rounded-lg px-4 py-2.5 inline-flex items-center gap-2 ${modo === "massa" ? "bg-torg-blue text-white" : "bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50"}`}>
          <ClipboardPaste size={16} /> Colar várias linhas (Excel)
        </button>
      </div>

      {/* Formulário 1 item (celular) */}
      {modo === "form" && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
          {pedido && (
            <div className="border border-torg-blue-100 bg-torg-blue-50/40 rounded-lg overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between">
                <p className="text-[12px] font-semibold text-torg-dark">Pedido {pedido.pedido} · {pedido.fornecedor || "—"}{pedido.obra ? ` · ${pedido.obra}` : ""} <span className="font-normal text-torg-gray">— toque no item que chegou</span></p>
                <button onClick={() => setPedido(null)} className="text-torg-gray hover:text-red-600"><X size={15} /></button>
              </div>
              {/* ⚠⚠ UMA LINHA DO PEDIDO NÃO É UMA DESCRIÇÃO. Matheus (11/09/2026): "quando digita
                  um número de pedido e aparecem itens repetidos, precisa conseguir selecionar
                  apenas o que quer e ver a quantidade que está no pedido". O pedido traz a mesma
                  peça em várias linhas (entregas, obras, preços diferentes); marcando por descrição,
                  clicar numa acendia TODAS e não dava para saber qual foi. Agora cada linha tem
                  número, quantidade, quanto já chegou e quanto falta. */}
              <div className="max-h-52 overflow-y-auto divide-y divide-torg-blue-100/60">
                {pedido.itens.length === 0 ? <p className="px-3 py-2 text-xs text-torg-gray">Pedido sem itens.</p>
                  : pedido.itens.map((it) => {
                    const escolhido = itemPedido === it.idx;
                    const falta = Math.max(0, (Number(it.qtd) || 0) - (Number(it.qtdRecebida) || 0));
                    return (
                      <button key={it.idx} type="button" onClick={() => escolherItemPedido(it)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-white/70 flex items-start gap-2 ${escolhido ? "bg-white ring-1 ring-inset ring-torg-blue" : ""}`}>
                        <span className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${escolhido ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>{escolhido && <Check size={11} className="text-white" />}</span>
                        {/* O número do item é o que separa duas linhas idênticas — sem ele, "qual
                            das três?" não tem resposta na tela. */}
                        <span className="font-mono text-[10px] text-torg-gray mt-0.5 shrink-0 w-5">{it.idx + 1}.</span>
                        <span className="flex-1 min-w-0">
                          <span className="text-torg-dark block truncate" title={it.descricao}>{it.descricao}</span>
                          <span className="text-torg-gray tabular-nums">
                            pedido {fmtNum(it.qtd)} {it.unidade || ""}
                            {it.qtdRecebida > 0 && <> · já recebido <b className="text-torg-dark">{fmtNum(it.qtdRecebida)}</b></>}
                            {" · "}
                            {falta > 0
                              ? <b className="text-torg-orange">faltam {fmtNum(falta)}</b>
                              : <b className="text-emerald-700">entregue</b>}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          <CmrCampos form={form} setF={setF} aoBuscarPedido={puxarPedido}
            pedidoSlot={
              <button type="button" onClick={puxarPedido} disabled={buscandoPed} title="Puxar os itens do pedido"
                className="px-3 rounded-lg bg-torg-blue text-white hover:bg-torg-dark disabled:opacity-50 shrink-0">
                {buscandoPed ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              </button>
            } />
          <div className="flex justify-end gap-2">
            <button onClick={() => setModo(null)} className="px-4 py-2.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={salvarForm} disabled={salvando} className="px-5 py-2.5 bg-torg-blue text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-torg-dark disabled:opacity-50">
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lançar
            </button>
          </div>
        </div>
      )}

      {/* Colar em massa */}
      {modo === "massa" && (
        <CmrColarMassa massa={massa} setMassa={setMassa} colar={colar}
          salvarMassa={salvarMassa} salvando={salvando} />
      )}
      {/* Lista do ano */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[13px] font-bold text-torg-dark">Controle de Materiais Rastreáveis - CMR <span className="font-normal text-torg-gray">· {ano} · {dados?.total ?? "…"} itens</span></p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor, OP, NF…" className="w-64 pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={reconciliarPlanilha} disabled={reconciliando} title="Sincronizar com a planilha do servidor: puxa rastreios digitados direto no Excel e reenvia o que faltar lá"
              className="text-sm font-medium rounded-lg px-3 py-2 inline-flex items-center gap-2 bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50 disabled:opacity-50">
              {reconciliando ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} <span className="hidden sm:inline">Sincronizar planilha</span>
            </button>
            <button onClick={exportarExcel} disabled={exportando || !visiveis.length} title="Baixar a planilha em Excel (.xlsx) com o que está na tela"
              className="text-sm font-medium rounded-lg px-3 py-2 inline-flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              {exportando ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} <span className="hidden sm:inline">Exportar Excel</span>
            </button>
          </div>
        </div>
        {/* Legenda + filtros ativos */}
        <div className="px-4 py-1.5 flex items-center gap-4 text-[11px] text-torg-gray border-b border-gray-50 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" /> com certificado</span>
          <button onClick={() => setSoSemCert((v) => !v)} title="Filtrar: mostrar só os itens sem certificado"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 border text-[11px] font-semibold shadow-sm transition-colors ${soSemCert ? "bg-red-600 text-white border-red-600 hover:bg-red-700" : "bg-white text-red-700 border-red-300 hover:bg-red-50"}`}>
            <AlertCircle size={13} /> Falta certificado
            {soSemCert && <X size={13} className="ml-0.5" />}
          </button>
          {(Object.keys(filtros).length > 0 || ordenar) && (
            <button onClick={() => { setFiltros({}); setOrdenar(null); }} className="ml-auto text-torg-blue hover:underline inline-flex items-center gap-1"><X size={12} /> Limpar filtros ({visiveis.length} de {linhas.length})</button>
          )}
        </div>
        <div className="overflow-auto max-h-[68vh]">
          <table className="text-[11px] whitespace-nowrap" style={{ minWidth: 1500 }}>
            <thead className="bg-gray-100 sticky top-0 z-20"><tr className="text-[10px] text-gray-600 uppercase">
              {COLUNAS.map((col) => {
                const ativo = !!filtros[col.key];
                const ord = ordenar?.key === col.key ? ordenar.dir : null;
                const sticky = col.key === "rc" ? "sticky left-0 z-30 bg-gray-100 min-w-[56px] max-w-[56px]"
                  : col.key === "importRef" ? "sticky left-[56px] z-30 bg-gray-100 min-w-[80px]" : "";
                return (
                  <th key={col.key} className={`px-2.5 py-2 ${col.align === "right" ? "text-right" : "text-left"} ${sticky}`}>
                    <button onClick={(e) => setFiltroAberto({ key: col.key, rect: e.currentTarget.getBoundingClientRect() })}
                      className={`inline-flex items-center gap-1 hover:text-torg-blue ${ativo || ord ? "text-torg-blue" : ""}`}>
                      {col.label}
                      {ord === "asc" ? <ArrowUp size={11} /> : ord === "desc" ? <ArrowDown size={11} /> : null}
                      <Filter size={11} className={ativo ? "fill-torg-blue" : "opacity-40"} />
                    </button>
                  </th>
                );
              })}
              <th className="px-2.5 py-2 text-right">Ações</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {dados === null ? <tr><td colSpan={15} className="px-3 py-8 text-center text-torg-gray"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                : visiveis.length === 0 ? <tr><td colSpan={15} className="px-3 py-8 text-center text-torg-gray">{linhas.length === 0 ? `Nenhum lançamento em ${ano}.` : "Nenhuma linha com os filtros atuais."}</td></tr>
                : visiveis.map((l) => {
                  const sel = l.id === selecionada;
                  // Fundo da linha (também aplicado nas células travadas p/ cobrir o scroll horizontal).
                  const rowBg = sel ? "bg-torg-blue-100" : (l.certOk ? "bg-yellow-50" : "bg-red-50");
                  const rowHover = sel ? "" : (l.certOk ? "hover:bg-yellow-100/70" : "hover:bg-red-100/60");
                  return (
                  // ⚠ DUPLO CLIQUE ABRE A EDIÇÃO, clique simples continua só marcando a linha.
                  // Matheus (11/09/2026): "tem um ícone de editar ou dar um duplo clique na coluna
                  // liberar edição da linha". O clique simples já tinha dono (marcar a linha para
                  // conferir de olho na tabela larga) e trocá-lo abriria um modal a cada toque.
                  <tr key={l.id} onClick={() => setSelecionada(sel ? null : l.id)}
                    onDoubleClick={() => setEditar(l)} title="Duplo clique para editar"
                    className={`align-top cursor-pointer ${rowBg} ${rowHover}`}>
                    <td className={`px-2.5 py-1 font-mono font-semibold sticky left-0 z-10 min-w-[56px] max-w-[56px] ${rowBg}`}>{l.rc}</td>
                    <td className={`px-2.5 py-1 font-mono text-torg-blue sticky left-[56px] z-10 min-w-[80px] ${rowBg}`}>{l.importRef}</td>
                    <td className="px-2.5 py-1 min-w-[360px] max-w-[560px] whitespace-normal break-words leading-snug" title={l.nome}><span className="line-clamp-2">{l.nome}</span></td>
                    <td className="px-2.5 py-1">{l.certOk ? l.numeroDocumento : <span className="text-red-600 font-medium">falta</span>}</td>
                    <td className="px-2.5 py-1 text-torg-gray">{l.numeroCorrida || "—"}</td>
                    <td className="px-2.5 py-1">{l.norma || "—"}</td>
                    <td className="px-2.5 py-1">{l.pedidoCompra || "—"}</td>
                    <td className="px-2.5 py-1 text-torg-gray">{l.dataFmt}</td>
                    <td className="px-2.5 py-1">{l.nfNumero || "—"}</td>
                    <td className="px-2.5 py-1">{l.fornecedor || "—"}</td>
                    <td className="px-2.5 py-1 font-mono">{l.opNumero || "—"}</td>
                    <td className="px-2.5 py-1 text-right tabular-nums">{fmtNum(l.quantidade)}</td>
                    <td className="px-2.5 py-1 text-right tabular-nums">{fmtNum(l.pesoKg)}</td>
                    <td className="px-2.5 py-1 min-w-[220px] max-w-[340px] whitespace-normal break-words leading-snug text-torg-gray" title={l.obs}><span className="line-clamp-2">{l.obs || "—"}</span></td>
                    <td className="px-2.5 py-1 text-right whitespace-nowrap">
                      <button onClick={(e) => { e.stopPropagation(); setEditar(l); }} title="Editar este lançamento"
                        className="text-gray-400 hover:text-torg-blue p-1 rounded hover:bg-torg-blue-50"><Pencil size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setExcluir(l); setConfExcl(false); }} title="Excluir este lançamento"
                        className="text-gray-300 hover:text-red-600 p-1 rounded hover:bg-red-50"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {excluir && (
        <CmrExcluirModal excluir={excluir} setExcluir={setExcluir} confExcl={confExcl}
          setConfExcl={setConfExcl} excluindo={excluindo} executarExcluir={executarExcluir} />
      )}

      {editar && (
        <CmrEditarModal linha={editar} ano={ano} onFechar={() => setEditar(null)}
          onSalvo={(item) => {
            // ⚠ ATUALIZA A LINHA NO LUGAR em vez de recarregar a lista inteira: a tabela tem
            // milhares de linhas com filtro e rolagem, e um refetch devolveria a pessoa ao topo
            // logo depois de ela corrigir uma linha que estava procurando.
            setDados((d) => d ? { ...d, itens: d.itens.map((x) => (x.id === item.id ? { ...x, ...item } : x)) } : d);
            setEditar(null);
          }} />
      )}

      {filtroAberto && (
        <ColunaFiltro
          col={COLUNAS.find((c) => c.key === filtroAberto.key)}
          rect={filtroAberto.rect}
          valores={distintos(filtroAberto.key)}
          selecionados={filtros[filtroAberto.key]}
          ordenar={ordenar?.key === filtroAberto.key ? ordenar.dir : null}
          onOrdenar={(dir) => { setOrdenar(dir ? { key: filtroAberto.key, dir } : null); setFiltroAberto(null); }}
          onAplicar={(sel) => { setFiltros((f) => { const n = { ...f }; if (sel) n[filtroAberto.key] = sel; else delete n[filtroAberto.key]; return n; }); setFiltroAberto(null); }}
          onClose={() => setFiltroAberto(null)}
        />
      )}
    </div>
  );
}
