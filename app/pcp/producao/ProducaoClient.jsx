"use client";
// PRODUÇÃO — a lista de trabalho do PCP.
//
// Vitor (24/08/2026): "pensei em alguma coisa listada onde clicamos mostrar as OPs, peças
// programadas pelo programador, peças já programadas fica liberado para o PCP descer para
// fabricar, quando já estiver em algum setor já trazer o status, a forma de conseguir selecionar
// vários para podermos imprimir, status de material na preparação".
//
// ⚠⚠ NADA AQUI É MOTOR NOVO. A lista vem de /api/pcp/producao (que pivota a MESMA fonte da TV) e o
// detalhe de /api/pcp/despacho (que já devolve programação, material, baixa e agora a GRD). O que
// faltava não era dado — era uma tela em que dê para achar a OP, ver as peças e agir em bloco.
//
// ⚠ LIBERAR É IMPRIMIR A GRD, decisão do Vitor. Não há estado "liberado" no banco: o registro é a
// própria GRD emitida, que já grava quem imprimiu, quando e quantas vezes. Por isso o botão diz
// "Imprimir e liberar" — o ato é um só, e chamar de duas coisas faria alguém procurar um segundo
// botão que não existe.
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, RefreshCw, ChevronRight, ChevronDown, Printer, Search,
  Factory, Monitor, CalendarClock, Package, CheckCircle2, AlertTriangle, FileText, FileSpreadsheet,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import CompraChip from "@/components/CompraChip";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import SeparacaoModal from "@/components/SeparacaoModal";

const MAX_LOTE = 80; // teto do /api/producao/desenhos/lote

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");
const fmtDH = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

// A programação do Syneco, na linguagem do PCP. Mesmos quatro estados do painel de despacho —
// se divergissem, a mesma peça teria dois nomes em duas telas.
const PROG = {
  INICIADA: { txt: "iniciada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dica: "A ordem deste setor já rodou no Syneco." },
  PROGRAMADA: { txt: "programada", cls: "bg-sky-50 text-sky-700 border-sky-200", dica: "O programador lançou a peça e a ordem ainda não iniciou — é o que pode descer para a fábrica." },
  OUTRO_SETOR: { txt: "lançada", cls: "bg-slate-100 text-slate-600 border-slate-200", dica: "Lançada no Syneco, mas sem ordem deste setor." },
  NAO_LANCADA: { txt: "não lançada", cls: "bg-red-50 text-red-700 border-red-200", dica: "O programador ainda NÃO lançou esta peça no Syneco." },
};

// ⚠⚠ A ORDEM É A DA FÁBRICA, NÃO A DO BANCO.
// Vitor (24/08/2026): "deixe aqui no fluxo que deve ser dos setores: prep, monta, solda, acab,
// jato, pint, exp". Os botões de filtro nasciam da ordem em que os setores apareciam nas OPs
// carregadas — ou seja, sorteada: saía "Preparação · Acabamento · Jato · Pintura · Expedição ·
// Montagem · Solda". Quem trabalha lê a barra como a rota da peça; fora de ordem, ela mente sobre
// o caminho. Mesma sequência do FLUXO_SETORES do servidor (lib/prioridades-setor.js).
const FLUXO = [
  ["CORTE", "Preparação"], ["MONTAGEM", "Montagem"], ["SOLDA", "Solda"],
  ["ACABAMENTO", "Acabamento"], ["JATO", "Jato"], ["PINTURA", "Pintura"], ["EXPEDICAO", "Expedição"],
];
const SETOR_LABEL = Object.fromEntries(FLUXO);
const ORDEM_SETOR = Object.fromEntries(FLUXO.map(([k], i) => [k, i]));

// ⚠ "Não iniciadas" é a UNIÃO das duas primeiras — é a pergunta que o Vitor faz ("o que não
// iniciou"), e as parcelas continuam separadas porque a ação é diferente: uma se cobra do
// programador, a outra se desce para a fábrica.
const FILTROS = [
  { key: "TODAS", label: "Todas" },
  { key: "NAO_INICIADAS", label: "Não iniciadas" },
  { key: "NAO_LANCADA", label: "Não lançadas" },
  { key: "PROGRAMADA", label: "Programadas" },
  { key: "INICIADA", label: "Iniciadas" },
];

const ALERTA = {
  SEM_LISTA: { txt: "sem lista", cls: "bg-red-50 text-red-700 border-red-200", dica: "Nenhuma peça importada (nem LPC nem LE) — não há o que programar." },
  PRODUZINDO_SEM_LISTA: { txt: "produzindo sem lista", cls: "bg-red-50 text-red-700 border-red-200", dica: "A fábrica já apontou produção e o portal não tem o detalhamento." },
  SEM_DETALHE_CORTE: { txt: "sem detalhe de corte", cls: "bg-amber-50 text-amber-700 border-amber-200", dica: "Sem croqui no portal: não há o que cortar nem rastrear." },
  SEM_CRONOGRAMA: { txt: "sem cronograma", cls: "bg-amber-50 text-amber-700 border-amber-200", dica: "Sem cronograma a OP não tem data por setor — nem prazo, nem posição real na fila." },
  NADA_LANCADO: { txt: "nada lançado", cls: "bg-slate-100 text-slate-600 border-slate-200", dica: "Nenhuma peça desta OP tem ordem no Syneco." },
};

export default function ProducaoClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState("");
  const [soPendentes, setSoPendentes] = useState(true);

  const [aberta, setAberta] = useState(null);   // opId expandida
  const [setorAba, setSetorAba] = useState(""); // setor da OP aberta
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDet, setCarregandoDet] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [imprimindo, setImprimindo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [desenho, setDesenho] = useState(null);
  const [filtroPecas, setFiltroPecas] = useState("");
  // ⚠ Vitor (24/08/2026): "preciso ter o filtro para selecionar o que não iniciou". "Não iniciou"
  // é união de duas situações — a que o programador nem lançou e a que ele lançou e a fábrica não
  // pegou. As duas separadas também servem, porque a ação é diferente: uma se cobra do programador,
  // a outra se desce para a fábrica.
  const [filtroProg, setFiltroProg] = useState("TODAS");
  const [baixando, setBaixando] = useState(false);
  const [exportando, setExportando] = useState(false);
  // ⚠ a lista de separação é o papel do ALMOXARIFADO, não do PCP: sai por material, com barras,
  // peso e o R de cada um. Mesmo componente da TV — duas versões do mesmo papel divergiriam, e é
  // ele que garante que o material separado é o R certo.
  const [separacao, setSeparacao] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/pcp/producao", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const carregarDetalhe = useCallback(async (opId, setor) => {
    setCarregandoDet(true); setSel(new Set());
    try {
      const qs = new URLSearchParams({ opId });
      if (setor) qs.set("setor", setor);
      const r = await fetch(`/api/pcp/despacho?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao abrir a OP");
      setDetalhe(j);
    } catch (e) { setDetalhe(null); setAviso({ ok: false, texto: e.message }); }
    finally { setCarregandoDet(false); }
  }, []);

  function abrir(op) {
    if (aberta === op.opId) { setAberta(null); setDetalhe(null); return; }
    // ⚠ abre no setor que o filtro já escolheu; sem filtro, no primeiro que tem fila — é onde a
    // obra está parada, e é a pergunta que o PCP faz ao clicar.
    const setor = setorFiltro || op.setores.find((s) => s.pendenteKg > 0)?.setor || op.setores[0]?.setor || "";
    setAberta(op.opId); setSetorAba(setor); setDetalhe(null); setFiltroPecas(""); setFiltroProg("TODAS");
    carregarDetalhe(op.opId, setor);
  }

  function trocarSetor(op, setor) {
    setSetorAba(setor); setDetalhe(null); setFiltroPecas(""); setFiltroProg("TODAS");
    carregarDetalhe(op.opId, setor);
  }

  const ops = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.ops || []).filter((o) => {
      if (soPendentes && !(o.kg.pendente > 0) && !o.alertas.length) return false;
      if (setorFiltro && !o.setores.some((s) => s.setor === setorFiltro && s.pendenteKg > 0)) return false;
      if (!q) return true;
      return [o.opNumero, o.cliente, o.obra, o.refCliente].some((x) => String(x || "").toLowerCase().includes(q));
    });
  }, [dados, busca, setorFiltro, soPendentes]);

  const setoresDisponiveis = useMemo(() => {
    const m = new Map();
    for (const o of dados?.ops || []) for (const s of o.setores) if (s.pendenteKg > 0) m.set(s.setor, s.label);
    return [...m.entries()]
      .map(([setor, label]) => ({ setor, label }))
      .sort((a, b) => (ORDEM_SETOR[a.setor] ?? 99) - (ORDEM_SETOR[b.setor] ?? 99));
  }, [dados]);

  // ── peças da OP aberta, já filtradas ──
  const pecas = useMemo(() => {
    let base = detalhe?.pecas || [];
    if (filtroProg !== "TODAS") {
      base = base.filter((p) => {
        const sit = p.programacao?.situacao || "NAO_LANCADA";
        if (filtroProg === "NAO_INICIADAS") return sit !== "INICIADA";
        return sit === filtroProg;
      });
    }
    const q = filtroPecas.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => [p.marca, p.descricao, p.perfil].some((x) => String(x || "").toLowerCase().includes(q)));
  }, [detalhe, filtroPecas, filtroProg]);

  // Contadores do filtro — o número ao lado do rótulo evita clicar para descobrir que está vazio.
  const contas = useMemo(() => {
    const t = { TODAS: 0, NAO_INICIADAS: 0, NAO_LANCADA: 0, PROGRAMADA: 0, INICIADA: 0 };
    for (const p of detalhe?.pecas || []) {
      const sit = p.programacao?.situacao || "NAO_LANCADA";
      t.TODAS++;
      if (sit !== "INICIADA") t.NAO_INICIADAS++;
      if (t[sit] != null) t[sit]++;
    }
    return t;
  }, [detalhe]);

  const marcasSel = useMemo(() => [...new Set(pecas.filter((p) => sel.has(p.id)).map((p) => p.marca))], [pecas, sel]);

  function alternar(id) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function marcarTodas(lista) {
    setSel((s) => {
      const todas = lista.every((p) => s.has(p.id));
      const n = new Set(s);
      for (const p of lista) todas ? n.delete(p.id) : n.add(p.id);
      return n;
    });
  }

  // ⚠ IMPRIMIR **É** LIBERAR. O POST grava a GrdLiberacao de cada marca; o ZIP vem em pastas por
  // impressora (plotter A1/A2, comum A3/A4) porque cada formato vai numa bandeja diferente.
  async function imprimirELiberar() {
    if (!marcasSel.length) return;
    if (marcasSel.length > MAX_LOTE) {
      setAviso({ ok: false, texto: `Lote máximo de ${MAX_LOTE} marcas por vez (selecionadas: ${marcasSel.length}). Divida em blocos.` });
      return;
    }
    if (!confirm(`Imprimir e liberar ${marcasSel.length} desenho(s) da ${fmtOP(detalhe.opNumero)}?\n\nCada um sai carimbado com a rastreabilidade e a GRD fica registrada. Pode levar alguns minutos.`)) return;
    setImprimindo(true); setAviso(null);
    try {
      const r = await fetch("/api/producao/desenhos/lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: detalhe.opNumero, marcas: marcasSel, setor: setorAba || null, acao: "IMPRIMIR" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao emitir o lote");
      await baixarZip(j, detalhe.opNumero).catch(() => {});
      const semDesenho = j.semDesenho?.length || 0;
      setAviso({
        ok: true,
        texto: `${j.emitidas || marcasSel.length} desenho(s) liberado(s) e baixado(s) em pastas por impressora.`
          + (semDesenho ? ` ${semDesenho} marca(s) sem desenho na pasta da OP: ${j.semDesenho.slice(0, 8).join(", ")}.` : ""),
      });
      setSel(new Set());
      await carregarDetalhe(aberta, setorAba); // a GRD nova aparece na coluna
      carregar();
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    finally { setImprimindo(false); }
  }

  // ── BAIXA MANUAL ───────────────────────────────────────────────────────────────────────────
  // Vitor (24/08/2026): "ser possível de extrair uma planilha e de dar baixa manual".
  //
  // ⚠ A BAIXA É SÓ DO PORTAL — não escreve no Syneco. Serve para o setor que produziu e não
  // apontou, para o portal parar de cobrar o que já está feito. Por isso peça que JÁ TEM
  // apontamento no Syneco é recusada: baixar por cima criaria duas verdades para a mesma peça.
  async function darBaixa() {
    const alvo = pecas.filter((p) => sel.has(p.id));
    if (!alvo.length || !setorAba) return;
    const jaNoSyneco = alvo.filter((p) => (p.produzidoSyneco || 0) > 0);
    const baixaveis = alvo.filter((p) => !((p.produzidoSyneco || 0) > 0));
    if (!baixaveis.length) {
      setAviso({ ok: false, texto: "Essas peças já têm apontamento no Syneco — não precisa dar baixa pelo portal." });
      return;
    }
    const nome = SETOR_LABEL[setorAba] || setorAba;
    const extra = jaNoSyneco.length ? `\n\n${jaNoSyneco.length} já tem apontamento no Syneco e vai ser ignorada.` : "";
    if (!confirm(`Dar baixa em ${baixaveis.length} peça(s) na ${nome}?${extra}\n\nA baixa é do portal: não escreve no Syneco.`)) return;
    setBaixando(true); setAviso(null);
    try {
      const r = await fetch("/api/pcp/despacho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baixaSetor: setorAba, baixas: baixaveis.map((p) => ({ id: p.id, qtd: p.qte || 1 })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao dar baixa");
      setAviso({ ok: true, texto: `Baixa em ${j.atualizados} peça(s) na ${nome}.` + (jaNoSyneco.length ? ` ${jaNoSyneco.length} ignorada(s) por já estarem no Syneco.` : "") });
      setSel(new Set());
      await carregarDetalhe(aberta, setorAba);
      carregar();
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    finally { setBaixando(false); }
  }

  // ⚠ Excel no PADRÃO DAS PLANILHAS (lib/excel-relatorio.js): cabeçalho ISO 9001 com logo. Import
  // dinâmico porque o exceljs é pesado e só quem clica precisa dele.
  // ⚠⚠ `adicionarHeaderTabela` E `adicionarLinhaTabela` NÃO DEVOLVEM A PRÓXIMA LINHA.
  // Escrevi `linha = adicionarLinhaTabela(...)` como se devolvessem; devolvem `undefined`, então a
  // primeira peça já chamava `getCell(undefined, 1)` e estourava. Todo o resto do portal incrementa
  // a linha à mão — é a convenção da lib, e é o que vale aqui também.
  //
  // ⚠ E sem `try/catch` o erro sumia: o clique não fazia nada e não dizia nada, e o Vitor teve de
  // vir avisar que "não estou conseguindo baixar a planilha". Exportação que falha calada é pior
  // que exportação que falha — quem clica fica achando que o navegador travou.
  async function exportar() {
    if (!detalhe) return;
    const lista = pecas;
    if (!lista.length) return setAviso({ ok: false, texto: "Nada para exportar com este filtro." });
    setExportando(true); setAviso(null);
    try {
    const op = ops.find((o) => o.opId === aberta);
    const nomeSetor = SETOR_LABEL[setorAba] || setorAba || "Geral";
    const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } =
      await import("@/lib/excel-relatorio");
    const headers = ["Marca", "Perfil", "Qtd", "Peso (kg)", "Programação", "Onde está", "Material (R)", "NF", "Corrida", "Liberado em", "Liberado por"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Produção — ${fmtOP(detalhe.opNumero)} · ${nomeSetor}`,
      subtitulo: `${op?.cliente || ""}${op?.obra ? ` — ${op.obra}` : ""} · ${lista.length} peça(s)${filtroProg !== "TODAS" ? ` · filtro: ${FILTROS.find((f) => f.key === filtroProg)?.label || filtroProg}` : ""}`,
      kpis: [
        `${lista.filter((p) => p.programacao?.situacao === "NAO_LANCADA").length} não lançada(s)`,
        `${lista.filter((p) => p.programacao?.situacao === "PROGRAMADA").length} programada(s)`,
        `${lista.filter((p) => p.grd).length} liberada(s)`,
      ],
      totalColunas: headers.length, nomePlanilha: "Produção", codigoDoc: "REL-PCP-001",
    });
    ws.columns = [{ width: 18 }, { width: 22 }, { width: 8 }, { width: 12 }, { width: 15 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 22 }];
    let linha = linhaInicio;
    adicionarHeaderTabela(ws, linha, headers); linha++;
    for (const p of lista) {
      adicionarLinhaTabela(ws, linha, [
        p.marca, p.descricao || "", Number(p.qte) || 0, Number(p.pesoTotalKg) || 0,
        PROG[p.programacao?.situacao]?.txt || "—",
        p.expedida ? "expedida"
          : p.montadoEm ? (p.montadoEm.montados >= p.montadoEm.total ? "montado" : `montado ${p.montadoEm.montados}/${p.montadoEm.total}`)
          : p.setorReal ? SETOR_LABEL[p.setorReal] || p.setorReal : "não começou",
        p.material?.rastreio || (p.material?.recebido ? "recebido" : ""),
        p.material?.nf || "", p.material?.corrida || "",
        p.grd ? fmtDH(p.grd.em) : "", p.grd?.por || "",
      ]);
      linha++;
    }
    adicionarLinhaTotais(ws, linha, ["TOTAL", "", lista.reduce((a, p) => a + (Number(p.qte) || 0), 0), Math.round(lista.reduce((a, p) => a + (Number(p.pesoTotalKg) || 0), 0)), "", "", "", "", "", "", ""]);
      const hoje = new Date().toISOString().split("T")[0];
      await downloadWorkbook(workbook, `Producao ${fmtOP(detalhe.opNumero)} - ${nomeSetor} - ${hoje}.xlsx`);
      setAviso({ ok: true, texto: `Planilha de ${lista.length} peça(s) baixada.` });
    } catch (e) {
      setAviso({ ok: false, texto: `Não consegui gerar a planilha: ${e?.message || e}` });
    } finally { setExportando(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <Factory size={22} className="text-torg-orange" /> Produção
          </h1>
          <p className="text-sm text-torg-gray mt-1">
            As obras na fábrica. Clique numa OP para ver as peças, o que o programador já lançou e liberar para fabricar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pcp/dashboard-prioridades"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50">
            <Monitor size={15} /> Painel da fábrica
          </Link>
          <button onClick={carregar} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </div>

      {/* ── filtros ── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center gap-2 flex-wrap">
        <span className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray-light" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="OP, cliente, obra ou ref."
            className="text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 w-64 focus:border-torg-blue focus:ring-1 focus:ring-torg-blue" />
        </span>
        <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => setSetorFiltro("")}
            className={`text-xs px-2.5 py-1.5 ${!setorFiltro ? "bg-torg-blue text-white" : "text-torg-gray hover:bg-gray-50"}`}>
            Todos os setores
          </button>
          {setoresDisponiveis.map((s) => (
            <button key={s.setor} onClick={() => setSetorFiltro(s.setor)}
              className={`text-xs px-2.5 py-1.5 border-l border-gray-200 ${setorFiltro === s.setor ? "bg-torg-blue text-white" : "text-torg-gray hover:bg-gray-50"}`}>
              {s.label}
            </button>
          ))}
        </span>
        <label className="inline-flex items-center gap-1.5 text-xs text-torg-gray cursor-pointer ml-auto">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} className="accent-torg-blue" />
          Só o que tem fila ou alerta
        </label>
      </div>

      {aviso && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${aviso.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {aviso.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="text-xs underline shrink-0">fechar</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Carregando…</div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-700 flex flex-col items-center gap-2"><AlertCircle size={26} /> {erro}</div>
      ) : !ops.length ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-torg-gray">
          Nenhuma OP com fila{busca || setorFiltro ? " para este filtro" : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          {ops.map((o) => {
            const open = aberta === o.opId;
            return (
              <div key={o.opId} className={`bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,41,69,0.06)] overflow-hidden ${open ? "border-torg-blue-200" : "border-gray-100"}`}>
                {/* ⚠ DIV, NÃO BUTTON. A linha carrega o CompraChip, que é um botão com modal
                    próprio — botão dentro de botão é HTML inválido e o React avisa em cada
                    render. O chevron é o botão de verdade (é por ele que o teclado abre a OP);
                    o resto da linha abre no clique. */}
                <div onClick={() => abrir(o)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 cursor-pointer">
                  <button onClick={(e) => { e.stopPropagation(); abrir(o); }} aria-expanded={open}
                    aria-label={`${open ? "Fechar" : "Abrir"} a OP ${o.opNumero}`} className="text-torg-gray mt-1 shrink-0">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-extrabold text-torg-dark tabular-nums">{fmtOP(o.opNumero)}</span>
                      <span className="text-sm text-torg-gray truncate">{o.cliente}{o.obra ? ` — ${o.obra}` : ""}</span>
                      {o.refCliente && <span className="text-[11px] text-torg-gray-light">ref. {o.refCliente}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {o.atrasoDias > 0 ? (
                        <span className="text-[11px] font-bold text-red-600 inline-flex items-center gap-1">
                          <CalendarClock size={11} /> {o.atrasoDias}d de atraso
                        </span>
                      ) : (
                        <span className="text-[11px] text-torg-gray inline-flex items-center gap-1">
                          <CalendarClock size={11} /> entrega {fmtD(o.entrega)}
                        </span>
                      )}
                      <span className="text-[11px] text-torg-gray tabular-nums">{fmtKg(o.kg.pendente)} na fila</span>
                      {/* ⚠ os três números que decidem o dia do PCP: o que o programador lançou, o
                          que falta lançar e o que já desceu para a fábrica (GRD impressa). */}
                      <Conta n={o.pecas.lancadas} de={o.pecas.total} label="lançadas" cor="text-sky-700" />
                      {o.pecas.naoLancadas > 0 && <Conta n={o.pecas.naoLancadas} label="a lançar" cor="text-red-600" />}
                      <Conta n={o.pecas.liberadas} label="liberadas" cor="text-emerald-700" />
                      {o.compra && <CompraChip compra={o.compra} opNumero={o.opNumero} mini />}
                      {o.alertas.map((a) => {
                        const t = ALERTA[a];
                        return t ? (
                          <span key={a} title={t.dica} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${t.cls}`}>{t.txt}</span>
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[46%]">
                    {o.setores.filter((s) => s.pendenteKg > 0).map((s) => (
                      <span key={s.setor} title={`${s.label}: ${fmtKg(s.pendenteKg)} de ${fmtKg(s.totalKg)} · ${s.pct}%`}
                        className={`text-[10px] px-1.5 py-1 rounded-lg border tabular-nums ${s.atrasoDias > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 text-torg-gray"}`}>
                        <span className="font-bold">{s.label}</span> {fmtKg(s.pendenteKg)}
                      </span>
                    ))}
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100">
                    {/* abas de setor da OP */}
                    <div className="flex items-center gap-1 px-3 pt-2.5 flex-wrap">
                      {o.setores.map((s) => (
                        <button key={s.setor} onClick={() => trocarSetor(o, s.setor)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold ${setorAba === s.setor ? "bg-torg-blue text-white border-torg-blue" : "border-gray-200 text-torg-gray hover:bg-gray-50"}`}>
                          {s.label} <span className="font-normal opacity-80">{fmtKg(s.pendenteKg)}</span>
                        </button>
                      ))}
                    </div>

                    {carregandoDet ? (
                      <div className="flex items-center gap-2 text-torg-gray text-sm px-4 py-8"><Loader2 size={16} className="animate-spin" /> abrindo as peças…</div>
                    ) : !detalhe ? (
                      <div className="px-4 py-8 text-sm text-torg-gray">Não consegui abrir as peças desta OP.</div>
                    ) : (
                      <>
                        <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {FILTROS.map((f) => (
                              <button key={f.key} onClick={() => setFiltroProg(f.key)}
                                className={`text-[11px] px-2 py-1 rounded-lg border font-semibold ${filtroProg === f.key ? "bg-torg-blue text-white border-torg-blue" : "border-gray-200 text-torg-gray hover:bg-gray-50"}`}>
                                {f.label} <span className="font-normal opacity-75 tabular-nums">{fmtN(contas[f.key])}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input value={filtroPecas} onChange={(e) => setFiltroPecas(e.target.value)} placeholder="filtrar marca, perfil…"
                              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-44 focus:border-torg-blue" />
                            <span className="text-[11px] text-torg-gray">{fmtN(pecas.length)} peça(s)</span>
                            {marcasSel.length > 0 && (
                              <span className="text-[11px] text-torg-blue font-semibold">· {marcasSel.length} selecionada(s)</span>
                            )}
                            <span className="flex-1" />
                            {/* ⚠ com peça marcada, a lista sai SÓ das marcadas; sem marcar, da OP
                                inteira — igual ao painel da TV. É o que deixa separar por lote. */}
                            <button onClick={() => setSeparacao({ opId: aberta, obra: `${fmtOP(detalhe.opNumero)}${o.obra ? ` — ${o.obra}` : ""}`, setor: setorAba || null, ids: sel.size ? [...sel] : null })}
                              disabled={!detalhe}
                              title={sel.size ? `Lista de separação das ${sel.size} peça(s) marcadas` : "Lista de separação da OP inteira — material, barras, peso e o R de cada um"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50 disabled:opacity-40">
                              <Package size={13} /> Separação{sel.size ? ` (${sel.size})` : ""}
                            </button>
                            <button onClick={exportar} disabled={!pecas.length || exportando}
                              title="Baixa a lista filtrada em Excel, no padrão das planilhas da Torg"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50 disabled:opacity-40">
                              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Planilha
                            </button>
                            {/* ⚠ a baixa é do PORTAL, não do Syneco — o rótulo diz o setor para ninguém
                                baixar na aba errada achando que baixou na fábrica inteira. */}
                            <button onClick={darBaixa} disabled={!sel.size || baixando || !setorAba}
                              title={sel.size ? `Marca como feita na ${SETOR_LABEL[setorAba] || setorAba} — registro do portal, não escreve no Syneco` : "Selecione as peças"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                              {baixando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              Baixa manual{setorAba ? ` · ${SETOR_LABEL[setorAba] || setorAba}` : ""}
                            </button>
                            <button onClick={imprimirELiberar} disabled={!marcasSel.length || imprimindo}
                              title={marcasSel.length ? `Imprime o desenho carimbado e registra a GRD de ${marcasSel.length} marca(s)` : "Selecione as peças"}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
                              {imprimindo ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                              Imprimir e liberar
                            </button>
                          </div>
                        </div>

                        {/* ⚠⚠ `table-fixed` COM LARGURA EM %, e não `overflow-x-auto`.
                            Vitor (24/08/2026): "precisamos que você deixe a tela completa sem haver a
                            necessidade de ficarmos andando para o lado". Rolagem lateral numa tabela
                            de trabalho esconde justamente as colunas da direita — material e liberado —,
                            que são as que dizem se a peça pode descer. Com largura automática, um perfil
                            comprido ("TBØ42.40X2.65 - INDUSTRIAL") empurrava tudo; fixa, ele corta e o
                            resto fica no lugar. O nome inteiro segue na dica. */}
                        <table className="w-full table-fixed text-[12px]">
                            <thead className="bg-gray-50 text-torg-gray">
                              <tr>
                                <th className="px-2 py-2 w-9">
                                  <input type="checkbox" checked={pecas.length > 0 && pecas.every((p) => sel.has(p.id))}
                                    onChange={() => marcarTodas(pecas)} className="accent-torg-orange" />
                                </th>
                                <th className="px-2 py-2 text-left font-bold w-[17%]">Marca</th>
                                <th className="px-2 py-2 text-left font-bold w-[17%]">Perfil</th>
                                <th className="px-2 py-2 text-right font-bold w-[7%]">Qtd</th>
                                <th className="px-2 py-2 text-right font-bold w-[10%]">Peso</th>
                                <th className="px-2 py-2 text-left font-bold w-[14%]">Programação</th>
                                <th className="px-2 py-2 text-left font-bold w-[13%]">Onde está</th>
                                <th className="px-2 py-2 text-left font-bold w-[11%]">Material</th>
                                <th className="px-2 py-2 text-left font-bold w-[11%]"
                                  title="Data em que o desenho foi impresso pelo portal e a GRD registrada — é o que prova que a peça desceu para a fábrica.">
                                  Liberado (GRD)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {pecas.map((p) => {
                                const prog = PROG[p.programacao?.situacao] || PROG.NAO_LANCADA;
                                return (
                                  <tr key={p.id} className={sel.has(p.id) ? "bg-torg-blue-50/40" : "hover:bg-gray-50/60"}>
                                    <td className="px-2 py-1.5">
                                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} className="accent-torg-orange" />
                                    </td>
                                    {/* ⚠ a marca É o link do desenho — uma coluna a menos e o alvo de clique
                                        é o que a pessoa já procura com o olho. */}
                                    <td className="px-2 py-1.5 truncate">
                                      <button onClick={() => setDesenho({ opNumero: detalhe.opNumero, marca: p.marca })}
                                        title={`Ver o desenho de ${p.marca}`}
                                        className="font-semibold text-torg-dark hover:text-torg-blue hover:underline inline-flex items-center gap-1 max-w-full">
                                        <FileText size={11} className="text-torg-gray-light shrink-0" />
                                        <span className="truncate">{p.marca}</span>
                                      </button>
                                    </td>
                                    <td className="px-2 py-1.5 text-torg-gray truncate" title={p.descricao || ""}>{p.descricao || "—"}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(p.qte)}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(p.pesoTotalKg)}</td>
                                    <td className="px-2 py-1.5 truncate">
                                      <span title={prog.dica} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${prog.cls}`}>{prog.txt}</span>
                                    </td>
                                    {/* ⚠ ONDE ESTÁ = setor mais adiantado COM APONTAMENTO. Não é o status da
                                        peça (só confiável até o corte) nem a rota dela. A rota — os setores
                                        por onde vai passar — fica na dica, que é onde ela ajuda. */}
                                    <td className="px-2 py-1.5 text-torg-gray truncate"
                                      title={p.programacao?.setores?.length ? `Rota no Syneco: ${p.programacao.setores.join(" · ")}` : "Sem ordem no Syneco."}>
                                      {p.expedida ? <span className="text-emerald-700 font-semibold">expedida</span>
                                        /* ⚠ MONTADO ganha do setor: a peça solta deixou de existir quando
                                           entrou no conjunto, e dizer "Preparação" mandaria alguém
                                           procurar na fábrica o que já virou outra coisa. */
                                        : p.montadoEm ? (
                                          <span className={p.montadoEm.montados >= p.montadoEm.total ? "text-indigo-700 font-semibold" : "text-indigo-600"}
                                            title={`Entrou em ${p.montadoEm.montados} de ${p.montadoEm.total} conjunto(s) que usam esta peça: ${p.montadoEm.conjuntos.slice(0, 12).join(", ")}${p.montadoEm.conjuntos.length > 12 ? "…" : ""}`}>
                                            {p.montadoEm.montados >= p.montadoEm.total
                                              ? "montado"
                                              : `montado ${p.montadoEm.montados}/${p.montadoEm.total}`}
                                          </span>
                                        )
                                        : p.setorReal ? SETOR_LABEL[p.setorReal] || p.setorReal
                                        : <span className="text-torg-gray-light" title="Nenhum apontamento no Syneco: ainda não passou por setor nenhum.">não começou</span>}
                                    </td>
                                    <td className="px-2 py-1.5 truncate">
                                      {p.material?.recebido ? (
                                        <span title={`Recebido em ${fmtDH(p.material.dataRecebimento)}${p.material.nf ? ` · NF ${p.material.nf}` : ""}${p.material.corrida ? ` · corrida ${p.material.corrida}` : ""}`}
                                          className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1">
                                          <Package size={9} /> {p.material.rastreio ? `R ${p.material.rastreio}` : "recebido"}
                                        </span>
                                      ) : p.perfil ? (
                                        <span title="O CMR do Almoxarifado não tem entrada deste material nesta OP." className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1">
                                          <AlertTriangle size={9} /> sem entrada
                                        </span>
                                      ) : <span className="text-torg-gray-light">—</span>}
                                    </td>
                                    <td className="px-2 py-1.5 truncate">
                                      {p.grd ? (
                                        <span title={`GRD impressa por ${p.grd.por || "—"}${p.grd.impressoes > 1 ? ` · ${p.grd.impressoes} impressões` : ""}`}
                                          className="text-[10px] text-emerald-700 font-semibold inline-flex items-center gap-1">
                                          <CheckCircle2 size={10} /> {fmtDH(p.grd.em)}
                                        </span>
                                      ) : <span className="text-torg-gray-light">—</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                              {!pecas.length && (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-torg-gray">Nenhuma peça pendente neste setor.</td></tr>
                              )}
                            </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {desenho && <DesenhoPecaModal opNumero={desenho.opNumero} marca={desenho.marca} onClose={() => setDesenho(null)} />}
      {separacao && (
        <SeparacaoModal opId={separacao.opId} obra={separacao.obra} setor={separacao.setor}
          ids={separacao.ids} onClose={() => setSeparacao(null)} />
      )}
    </div>
  );
}

function Conta({ n, de, label, cor }) {
  return (
    <span className={`text-[11px] tabular-nums ${cor}`}>
      <span className="font-bold">{fmtN(n)}</span>{de != null ? <span className="text-torg-gray-light">/{fmtN(de)}</span> : null} {label}
    </span>
  );
}

// ⚠ ZIP com UMA PASTA POR IMPRESSORA — plotter (A1/A2) e comum (A3/A4). Abrir uma aba por arquivo
// era bloqueado pelo navegador e ainda deixava a pessoa imprimindo um a um. Mesmo caminho do painel
// de despacho, de propósito: dois downloads diferentes do mesmo lote confundiriam a fábrica.
async function baixarZip(lote, opNumero) {
  const r = await fetch("/api/producao/desenhos/lote/zip", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opNumero, arquivos: (lote.arquivos || []).map((a) => ({ itemId: a.itemId, nome: a.nome, formato: a.formato })) }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erro ao montar o ZIP");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || `OP-${opNumero} - desenhos.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
