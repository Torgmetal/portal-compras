"use client";
// FLUXO DA PRODUÇÃO — as três perguntas da Diretoria, numa tela de leitura.
//
// Vitor (25/08/2026): "não tenho o controle do que a engenharia desce de desenho para o programador,
// não tenho a visão do que o programador de fato fez e não tenho o controle do que cada setor está
// fazendo".
//
// ⚠⚠ ORDEM DOS BLOCOS = ORDEM DA DOR. "Fora do mapa" vem PRIMEIRO, antes da fila do programador,
// porque enquanto a fábrica produz item que o portal não tem, todo o resto da conta sai errado —
// medido em 25/08/2026: 4.576 itens, 3.671 só na OP-064. Pôr a fila em cima daria a impressão de
// que o problema é o programador estar devagar.
//
// ⚠ NADA AQUI TEM BOTÃO QUE MUDA DADO. Quem opera trabalha no PCP e na Produção; esta tela é para
// olhar e cobrar. Virar tela de ação faria a quarta lista de trabalho da mesma fábrica.
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, RefreshCw, EyeOff, Send, Factory, ArrowRight, CalendarClock,
  ChevronRight, ChevronDown, FileSpreadsheet, FolderOpen, Search,
} from "lucide-react";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");

// ⚠ o veredito da pasta em uma frase. Classes ESCRITAS por extenso — Tailwind não gera classe
// montada em runtime, e o chip sairia sem cor nenhuma.
const VEREDITO = {
  OK:           { rot: "desenho completo",         chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PARCIAL:      { rot: "falta desenho",            chip: "bg-amber-50 text-amber-700 border-amber-200" },
  SEM_CONJUNTO: { rot: "croqui sim, conjunto não", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  SO_MAQUINA:   { rot: "só arquivo de máquina",    chip: "bg-red-100 text-red-800 border-red-200" },
  SEM_DESENHO:  { rot: "sem desenho nenhum",       chip: "bg-red-100 text-red-800 border-red-200" },
  // ⚠ ESTADO INTERNO, RÓTULO NEUTRO. Vitor (26/08/2026): "o vinculo da pasta 2.5.5 não precisa ser
  // mencionado em nada só se eu pedir". O veredito continua separado no banco (o arquivo existe,
  // fora do alcance da fabricação — é dado que ele pode pedir), mas na tela lê como o que é para
  // quem precisa produzir: não tem desenho na fabricação.
  SO_ENVIO:     { rot: "sem desenho na fabricação", chip: "bg-red-100 text-red-800 border-red-200" },
  SEM_LISTA:    { rot: "desenho sem lista",        chip: "bg-sky-50 text-sky-700 border-sky-200" },
  // ⚠ obra sem lista E sem arquivo é obra que ainda não começou — cinza, não vermelho. Em vermelho,
  // seis obras futuras encheriam o painel de alarme falso e afogariam a OP-106.
  VAZIA:        { rot: "ainda não começou",        chip: "bg-gray-100 text-torg-gray border-gray-200" },
  ERRO:         { rot: "não consegui ler a pasta",  chip: "bg-gray-100 text-torg-gray border-gray-200" },
  NAO_CONFERIDA:{ rot: "ainda não conferida",      chip: "bg-gray-100 text-torg-gray border-gray-200" },
};

// ⚠ o resumo da linha chega em DOIS formatos: o que o cron gravou (vem no payload do painel, já
// achatado) e o que o botão acabou de conferir (aninhado em arquivos/lista). Normalizar aqui evita
// a linha ficar meio preenchida conforme a origem.
const resumoPasta = (o, fresco) => {
  if (fresco?.erro) return { erro: fresco.erro };
  if (fresco?.veredito) return {
    veredito: fresco.veredito, checadoEm: fresco.checadoEm,
    pdfs: fresco.arquivos.pdfs, nc1: fresco.arquivos.nc1, igs: fresco.arquivos.igs,
    cliente: fresco.arquivos.cliente, foraPadrao: fresco.lista.foraPadrao,
    conjuntos: fresco.lista.conjuntos, croquis: fresco.lista.croquis,
  };
  return o.pasta || null;
};

// colunas com funil, como no Excel — Vitor pediu o mesmo padrão da lista do PCP
const COLUNAS_PASTA = [
  { key: "cliente",  label: "Cliente",  valor: (l) => l._cliente },
  { key: "veredito", label: "Veredito", valor: (l) => l._veredito },
];

const desdeQuando = (iso) => {
  if (!iso) return "";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
};

export default function FluxoProducao() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  // opId aberto no bloco "fora do mapa" + o detalhe carregado sob demanda
  const [aberta, setAberta] = useState(null);
  const [detalhe, setDetalhe] = useState({}); // opId → payload
  const [buscando, setBuscando] = useState(null);
  const [exportando, setExportando] = useState(false);
  // conferência da pasta da Engenharia: opId → payload, e a varredura em andamento
  const [pasta, setPasta] = useState({});
  const [conferindo, setConferindo] = useState(null);
  const [varrendo, setVarrendo] = useState(null); // { feitas, total } enquanto confere todas
  const [pastaAberta, setPastaAberta] = useState(null);
  const [selPasta, setSelPasta] = useState(() => new Set()); // OPs marcadas para a planilha
  const [colPasta, setColPasta] = useState(null);            // qual filtro de coluna está aberto
  const [baixando, setBaixando] = useState(false);
  const [verBaixadas, setVerBaixadas] = useState(false);
  const [baixaEmCurso, setBaixaEmCurso] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/fluxo", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // ⚠ SOB DEMANDA: a OP-064 tem 3.671 itens. Carregar no payload do painel faria a Diretoria
  // esperar por uma lista que ela talvez nem abra.
  const abrir = useCallback(async (opId) => {
    if (aberta === opId) return setAberta(null);
    setAberta(opId);
    if (detalhe[opId]) return;
    setBuscando(opId);
    try {
      const r = await fetch(`/api/diretoria/fluxo/fora-do-mapa?opId=${opId}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao abrir");
      setDetalhe((d) => ({ ...d, [opId]: j }));
    } catch (e) { setErro(e.message); } finally { setBuscando(null); }
  }, [aberta, detalhe]);

  // O painel já ABRE com o que o cron gravou de madrugada (vem no payload, em `o.pasta`). Estes
  // dois só existem para quem quiser o número de agora.
  //
  // ⚠ POST, não GET: reconferir VARRE o SharePoint e grava. Escondido atrás de um GET, um refresh
  // do navegador dispararia a varredura de novo.
  const conferirPasta = useCallback(async (opId) => {
    setConferindo(opId);
    try {
      const r = await fetch("/api/diretoria/fluxo/pasta", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opId }),
      });
      const j = await r.json();
      setPasta((p) => ({ ...p, [opId]: r.ok ? j : { erro: j.error || "Erro ao conferir" } }));
      return r.ok ? j : null;
    } catch (e) {
      setPasta((p) => ({ ...p, [opId]: { erro: e.message } }));
      return null;
    } finally { setConferindo(null); }
  }, []);

  // ⚠ SEQUENCIAL, não em paralelo: são centenas de chamadas ao Graph por obra e o SharePoint
  // devolve 429 quando se abre tudo de uma vez.
  const conferirTodas = useCallback(async (lista) => {
    setVarrendo({ feitas: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      await conferirPasta(lista[i].opId);
      setVarrendo({ feitas: i + 1, total: lista.length });
    }
    setVarrendo(null);
  }, [conferirPasta]);

  // detalhe pesado (a lista de marcas sem desenho) só quando a linha abre
  const abrirPasta = useCallback(async (opId, jaTem) => {
    if (pastaAberta === opId) return setPastaAberta(null);
    setPastaAberta(opId);
    if (jaTem) return;
    try {
      const r = await fetch(`/api/diretoria/fluxo/pasta?opId=${opId}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.veredito) setPasta((p) => ({ ...p, [opId]: j }));
    } catch { /* o resumo da linha continua valendo */ }
  }, [pastaAberta]);

  // ⚠ pede o motivo, mas não OBRIGA: baixa é decisão da Diretoria, e travar num campo obrigatório
  // só faria escrever "antiga" trinta vezes. Reativar é um clique, sem pergunta.
  async function darBaixa(o) {
    const jaTem = !!o.pasta?.baixada;
    let motivo = null;
    if (!jaTem) {
      motivo = window.prompt(`Dar baixa na ${fmtOP(o.numero)} — some da lista de conferência de desenhos.\n\nMotivo (opcional):`, "obra antiga");
      if (motivo === null) return; // cancelou
    }
    setBaixaEmCurso(o.opId); setErro("");
    try {
      const r = await fetch("/api/diretoria/fluxo/pasta/baixa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId: o.opId, baixada: !jaTem, motivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao registrar a baixa");
      setSelPasta((sel) => { const n = new Set(sel); n.delete(o.opId); return n; });
      await carregar();
    } catch (e) { setErro(`Não consegui registrar a baixa: ${e?.message || e}`); }
    finally { setBaixaEmCurso(null); }
  }

  // ⚠ PLANILHA DOS DESENHOS. Sai do que o cron gravou — não varre o SharePoint de novo, senão uma
  // exportação de 30 obras viraria minutos de espera pelo mesmo número que já está no banco.
  //
  // ⚠ try/catch com o erro NA TELA: já aconteceu de a planilha falhar em silêncio e o clique não
  // fazer nada visível. Sem isso, "não estou conseguindo baixar" vira investigação do zero.
  async function baixarPlanilhaPasta(ids) {
    setBaixando(true); setErro("");
    try {
      const r = await fetch("/api/diretoria/fluxo/pasta/planilha", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opIds: ids || [] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao montar a planilha");
      if (!j.resumo?.length) throw new Error("Nenhuma obra para exportar.");

      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");

      const semDesenho = j.resumo.filter((x) => ["SO_MAQUINA", "SEM_DESENHO", "SO_ENVIO", "VAZIA"].includes(x.veredito)).length;
      const completas = j.resumo.filter((x) => x.veredito === "OK").length;
      const cab = ["OP", "Cliente", "Obra", "Veredito", "Marcas na lista", "Conjuntos c/ desenho", "Croquis c/ desenho",
        "Desenhos em 2.5.2", "Arq. de máquina", "Modelo 3D",
        "Nome fora do padrão", "Conferido em", "Baixa"];

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Desenhos na pasta da Engenharia",
        subtitulo: ids?.length ? `${ids.length} obra(s) selecionada(s)` : "Todas as obras em andamento",
        kpis: [`${fmtN(j.resumo.length)} obra(s)`, `${fmtN(semDesenho)} sem desenho`, `${fmtN(completas)} completa(s)`],
        totalColunas: cab.length, nomePlanilha: "Resumo", codigoDoc: "REL-DIR-002",
      });
      ws.columns = [{ width: 10 }, { width: 20 }, { width: 26 }, { width: 24 }, { width: 15 }, { width: 19 }, { width: 17 },
        { width: 17 }, { width: 19 }, { width: 12 }, { width: 15 }, { width: 11 }, { width: 18 }, { width: 16 }, { width: 22 }];

      // ⚠ os helpers NÃO devolvem a próxima linha — contar aqui. Já custou uma planilha que não baixava.
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, cab); l++;
      for (const x of j.resumo) {
        adicionarLinhaTabela(ws, l, [
          fmtOP(x.numero), x.cliente, x.obra,
          x.veredito ? (VEREDITO[x.veredito]?.rot || x.veredito) : "ainda não conferida",
          x.marcas, `${x.conjuntosCom}/${x.conjuntosTotal}`, `${x.croquisCom}/${x.croquisTotal}`,
          x.pdfs, x.nc1, x.igs, x.foraPadrao,
          x.checadoEm ? new Date(x.checadoEm).toLocaleString("pt-BR") : "—",
          x.baixada ? `sim${x.baixaMotivo ? ` — ${x.baixaMotivo}` : ""}` : "",
        ], { alinhamento: { 4: "right", 5: "right", 6: "right", 7: "right", 8: "right", 9: "right", 10: "right", 11: "right", 12: "right" } });
        l++;
      }
      adicionarRodapeISO(ws, l + 1, cab.length);

      // ── aba 2: a peça, não a obra ──
      const cab2 = ["OP", "Cliente", "Marca", "Tipo", "Tem NC1", "Desenho achado com outro nome"];
      const ws2 = workbook.addWorksheet("Sem desenho");
      ws2.columns = [{ width: 10 }, { width: 20 }, { width: 22 }, { width: 12 }, { width: 10 }, { width: 19 }, { width: 44 }];
      let l2 = 1;
      adicionarHeaderTabela(ws2, l2, cab2); l2++;
      for (const it of j.itens) {
        adicionarLinhaTabela(ws2, l2, [
          fmtOP(it.numero), it.cliente, it.marca, it.conjunto ? "Conjunto" : "Croqui",
          it.nc1 ? "sim" : "não", it.foraPadrao || "",
        ]);
        l2++;
      }
      if (!j.itens.length) { adicionarLinhaTabela(ws2, l2, ["—", "", "Nenhuma marca sem desenho.", "", "", "", ""]); }
      ws2.views = [{ state: "frozen", ySplit: 1 }];

      const nome = ids?.length ? `Desenhos na pasta - ${ids.length} OPs.xlsx` : "Desenhos na pasta - todas as OPs.xlsx";
      await downloadWorkbook(workbook, nome);
      // ⚠ avisar o corte: 20.000 itens calados pareceriam a lista inteira.
      if (j.truncado) setErro("A planilha saiu, mas a aba de peças foi cortada em 20.000 linhas. Exporte por seleção de OP para ver o resto.");
      else if (j.naoConferidas) setErro(`Planilha gerada. ${j.naoConferidas} obra(s) ainda não foram conferidas e saíram sem números.`);
    } catch (e) { setErro(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setBaixando(false); }
  }

  // ⚠ a planilha é o que sai daqui para a Engenharia — é a lista do que falta importar, com nome
  // e peso. Sem ela, "3.671 itens" continua sendo um número que ninguém consegue acionar.
  async function exportar(opId) {
    const d0 = detalhe[opId];
    if (!d0?.itens?.length) return;
    setExportando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const headers = ["Peça (Syneco)", "Tipo", "Situação", "Onde está", "Falta passar por", "Rota lançada", "Sem apontamento (já passou)", "Planejado", "Produzido", "Peso (kg)", "1º apontamento", "Último"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Fora do mapa — ${fmtOP(d0.op.numero)}`,
        subtitulo: `${d0.op.cliente || ""}${d0.op.obra ? ` — ${d0.op.obra}` : ""} · peças com ordem no Syneco e sem lista no portal`,
        kpis: [`${fmtN(d0.resumo.aProduzir)} a produzir`, `${fmtN(d0.resumo.jaProduzido)} já produzidas`, `${fmtN(d0.resumo.total)} no total`],
        totalColunas: headers.length, nomePlanilha: "Fora do mapa", codigoDoc: "REL-DIR-001",
      });
      ws.columns = [{ width: 20 }, { width: 12 }, { width: 14 }, { width: 15 }, { width: 28 }, { width: 34 }, { width: 28 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 15 }, { width: 15 }];
      let linha = linhaInicio;
      adicionarHeaderTabela(ws, linha, headers); linha++;
      for (const it of d0.itens) {
        adicionarLinhaTabela(ws, linha, [
          it.item, it.croqui ? "Croqui" : "Conjunto", it.aProduzir ? "A PRODUZIR" : "já produzida",
          it.onde || "não começou", (it.restam || []).join(" · "), (it.rota || []).join(" · "),
          (it.semRegistro || []).join(" · "),
          it.planejado, it.produzido, it.kg, fmtD(it.primeiro), fmtD(it.ultimo),
        ]);
        linha++;
      }
      await downloadWorkbook(workbook, `Fora do mapa - ${fmtOP(d0.op.numero)}.xlsx`);
    } catch (e) { setErro(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setExportando(false); }
  }

  const foraDoMapa = useMemo(
    () => (d?.ops || []).filter((o) => o.foraDoMapa > 0).sort((a, b) => b.foraDoMapa - a.foraDoMapa),
    [d]);
  const filaProgramador = useMemo(
    () => (d?.ops || []).filter((o) => o.aLancar > 0).sort((a, b) => b.aLancar - a.aLancar),
    [d]);
  // obras que AFIRMAM entrega: têm lista no portal. São exatamente as que o painel dava por
  // entregues sem nunca ter olhado a pasta.
  const obrasPasta = useMemo(
    () => (d?.ops || []).filter((o) => o.entregues > 0).sort((a, b) => String(b.numero).localeCompare(String(a.numero), "pt-BR", { numeric: true })),
    [d]);
  // ⚠ o rótulo do veredito entra como CAMPO: o filtro de coluna lista o que a pessoa lê na tela,
  // não a constante interna. Ninguém procura por "SO_MAQUINA".
  const linhasPasta = useMemo(() => obrasPasta.map((o) => ({
    ...o,
    _veredito: o.pasta ? (VEREDITO[o.pasta.veredito]?.rot || o.pasta.veredito) : "ainda não conferida",
    _cliente: o.cliente || "—",
  })), [obrasPasta]);
  const fPasta = useFiltroColunas(linhasPasta, COLUNAS_PASTA);
  // obra com baixa fica escondida por padrão, e o contador no topo do bloco permite trazê-la de volta
  const listaVisivel = useMemo(
    () => fPasta.filtradas.filter((o) => verBaixadas || !o.pasta?.baixada),
    [fPasta.filtradas, verBaixadas]);
  const fp = { filtros: fPasta.filtros, setFiltros: fPasta.setFiltros, opcoesDaColuna: fPasta.opcoesDaColuna, aberta: colPasta, setAberta: setColPasta };
  const todasMarcadas = listaVisivel.length > 0 && listaVisivel.every((x) => selPasta.has(x.opId));
  const algumasMarcadas = listaVisivel.some((x) => selPasta.has(x.opId));
  const picoDia = useMemo(() => Math.max(1, ...(d?.dias || []).map((x) => x.kg)), [d]);

  if (carregando) return <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Carregando…</div>;
  if (erro) return <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-700 flex flex-col items-center gap-2"><AlertCircle size={26} /> {erro}</div>;

  const t = d.totais;
  const pctLancado = t.entregues > 0 ? Math.round((t.lancadas / t.entregues) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-torg-gray max-w-3xl">
          O caminho do trabalho, da Engenharia até a bancada: <strong>o que desceu</strong>,
          <strong> o que o programador pegou</strong> e <strong>o que cada setor fez</strong>.
          Só leitura — quem opera trabalha no PCP e na Produção.
        </p>
        <button onClick={carregar} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50">
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      {/* ── o funil, em três números ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card n={fmtN(t.entregues)} l="Peças que a Engenharia entregou" sub="lista de produção importada" cor="#006EAB" bg="#e8f2f9" />
        <Card n={`${pctLancado}%`} l="Programadas no Syneco" sub={`${fmtN(t.lancadas)} de ${fmtN(t.entregues)}`} cor="#1e9e6a" bg="#e7f5ee" />
        <Card n={fmtN(t.aLancar)} l="Esperando o programador" sub="entregue e sem ordem" cor="#b45309" bg="#fff6e6" />
        <Card n={fmtN(t.foraDoMapa)} l="Fora do mapa" sub={`em ${t.obrasForaDoMapa} obra(s)`} cor="#dc2626" bg="#fdeaea" />
        {/* ⚠ conta OBRAS, não peças: uma obra sem desenho nenhum é um problema inteiro. Somando
            marcas, a OP-089 (35 croquis faltando) pareceria pior que a OP-106 (nada emitido). */}
        <Card n={fmtN(t.obrasSemDesenho)} l="Obras sem desenho na pasta" sub={`de ${fmtN(t.obrasConferidas)} conferida(s)`} cor="#b45309" bg="#fff6e6" />
      </div>

      {/* ── 1. FORA DO MAPA (vem primeiro: contamina todo o resto) ── */}
      <Bloco
        icone={EyeOff}
        titulo="A fábrica está produzindo o que o portal não conhece"
        sub={`${fmtN(t.foraDoMapa)} item(ns) com ordem no Syneco e sem peça na lista do portal, em ${t.obrasForaDoMapa} obra(s).`}
        cor="text-red-700"
      >
        {/* ⚠ o texto explica o EFEITO, não só o fato: sem isso, o número vira curiosidade. */}
        <p className="text-[12px] text-torg-gray mb-3">
          Enquanto a lista não entra, tudo que se conta por obra sai errado — kg pendente, avanço de
          setor, fila do programador. É por isso que este bloco vem antes dos outros.
        </p>
        {!foraDoMapa.length ? <Vazio texto="Nenhuma obra fora do mapa. Toda ordem do Syneco tem peça no portal." /> : (
          <Tabela cabecalho={["", "Obra", "Fora do mapa", "Na lista", "Situação"]}>
            {foraDoMapa.map((o) => {
              const det = detalhe[o.opId];
              const open = aberta === o.opId;
              return (
                <Fragment key={o.opId}>
                  <tr className={`border-t border-gray-50 cursor-pointer ${open ? "bg-red-50/40" : "hover:bg-gray-50/60"}`} onClick={() => abrir(o.opId)}>
                    <Td>
                      <button onClick={(e) => { e.stopPropagation(); abrir(o.opId); }} aria-expanded={open}
                        aria-label={`${open ? "Fechar" : "Ver"} as peças da OP ${o.numero}`} className="text-torg-gray">
                        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </Td>
                    <Td><Obra o={o} /></Td>
                    <Td dir><span className="font-bold text-red-700 tabular-nums">{fmtN(o.foraDoMapa)}</span></Td>
                    <Td dir><span className="tabular-nums text-torg-gray">{fmtN(o.entregues)}</span></Td>
                    <Td>
                      {o.semListaNenhuma
                        ? <Chip cor="bg-red-100 text-red-800 border-red-200">produz sem lista nenhuma</Chip>
                        : <Chip cor="bg-amber-50 text-amber-700 border-amber-200">lista incompleta</Chip>}
                    </Td>
                  </tr>
                  {open && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={5} className="px-3 py-3">
                        {buscando === o.opId ? (
                          <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> buscando as peças…</p>
                        ) : !det ? (
                          <p className="text-sm text-torg-gray">Não consegui abrir as peças desta obra.</p>
                        ) : <Detalhe d={det} onExportar={() => exportar(o.opId)} exportando={exportando} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Tabela>
        )}
      </Bloco>

      {/* ── 2. A PASTA DA ENGENHARIA ── */}
      <Bloco
        icone={FolderOpen}
        titulo="O desenho existe na pasta?"
        sub={`${fmtN(t.obrasConferidas)} de ${fmtN(obrasPasta.length)} obra(s) conferida(s) · ${fmtN(t.obrasSemDesenho)} sem desenho na pasta de fabricação · ${fmtN(t.obrasPastaOk)} completa(s).`}
        cor="text-torg-blue"
      >
        {/* ⚠ o texto diz por que o bloco existe: até aqui o painel media LISTA e chamava de desenho. */}
        <p className="text-[12px] text-torg-gray mb-3">
          Lista importada não é desenho emitido. Medido na <b>OP-106</b>: a LPC estava no portal, a pasta
          tinha 16 arquivos <code className="text-[11px]">.nc1</code> e 11 <code className="text-[11px]">.igs</code> — e
          nenhum desenho. O programador conseguiu lançar porque a máquina lê NC1; a bancada ficou sem papel,
          e foi por isso que a impressão não saiu. Conta só o que está em <b>2.5.2 Fabricação</b>.
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-3">
          <button
            onClick={() => baixarPlanilhaPasta(selPasta.size ? [...selPasta] : listaVisivel.map((x) => x.opId))}
            disabled={baixando || !listaVisivel.length}
            title={selPasta.size ? `Exportar as ${selPasta.size} obra(s) marcadas` : "Exportar as obras visíveis na lista"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50 disabled:opacity-40"
          >
            {baixando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            {selPasta.size ? `Planilha das ${selPasta.size} marcada(s)` : `Planilha das ${listaVisivel.length} obras`}
          </button>
          <button
            onClick={() => conferirTodas(listaVisivel)}
            disabled={!!varrendo || !!conferindo || !listaVisivel.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50 disabled:opacity-40"
          >
            {varrendo ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {varrendo ? `conferindo ${varrendo.feitas} de ${varrendo.total}…` : "Reconferir agora"}
          </button>
          {selPasta.size > 0 && (
            <button onClick={() => setSelPasta(new Set())} className="text-[11px] text-torg-gray hover:underline">limpar seleção</button>
          )}
          {fPasta.ativos > 0 && (
            <button onClick={fPasta.limpar} className="text-[11px] text-torg-orange hover:underline">
              limpar filtro ({fPasta.rotulosAtivos.join(", ")})
            </button>
          )}
          {/* ⚠ a baixa fica visível como CONTADOR, não escondida: obra fora da conta tem de ser
              possível de reencontrar, senão vira dado sumido. */}
          {t.obrasBaixadas > 0 && (
            <button onClick={() => setVerBaixadas((v) => !v)} className="text-[11px] text-torg-gray hover:underline">
              {verBaixadas ? "ocultar" : "mostrar"} {fmtN(t.obrasBaixadas)} com baixa
            </button>
          )}
          <span className="text-[11px] text-torg-gray-light">
            atualizado todo dia pelo sistema; reconferir varre o SharePoint de novo
          </span>
        </div>

        {!listaVisivel.length ? <Vazio texto="Nenhuma obra nesta lista." /> : (
          <Tabela cabecalhoNode={
            <tr>
              <th className="px-3 py-2 w-8">
                {/* ⚠ MARCAR TODAS = as VISÍVEIS, não a base inteira. Com filtro ligado, marcar o que
                    está escondido é a forma clássica de exportar o que ninguém pediu. */}
                <input type="checkbox" aria-label="Marcar todas as obras visíveis" className="accent-torg-orange"
                  checked={todasMarcadas} ref={(el) => { if (el) el.indeterminate = algumasMarcadas && !todasMarcadas; }}
                  onChange={() => setSelPasta(todasMarcadas ? new Set() : new Set(listaVisivel.map((x) => x.opId)))} />
              </th>
              <th className="px-3 py-2 font-semibold text-left">Obra</th>
              <ThFiltro col="cliente" label="Cliente" className="px-3 py-2 font-semibold text-left" {...fp} />
              <th className="px-3 py-2 font-semibold text-right">Na lista</th>
              <th className="px-3 py-2 font-semibold text-right">Desenhos</th>
              <th className="px-3 py-2 font-semibold text-right">Conjuntos</th>
              <th className="px-3 py-2 font-semibold text-right">Croquis</th>
              <ThFiltro col="veredito" label="Veredito" className="px-3 py-2 font-semibold text-left" {...fp} />
              <th className="px-3 py-2 font-semibold text-right">Conferido</th>
            </tr>
          }>
            {listaVisivel.map((o) => {
              const r = resumoPasta(o, pasta[o.opId]);
              const det = pasta[o.opId];
              const open = pastaAberta === o.opId;
              const v = r?.veredito ? VEREDITO[r.veredito] : null;
              const ocupado = !!conferindo || !!varrendo;
              const temDet = !!det?.semDesenho;
              return (
                <Fragment key={o.opId}>
                  <tr className={`border-t border-gray-50 ${r && !r.erro ? "cursor-pointer" : ""} ${open ? "bg-sky-50/40" : "hover:bg-gray-50/60"} ${o.pasta?.baixada ? "opacity-50" : ""}`}
                    onClick={() => r && !r.erro && abrirPasta(o.opId, temDet)}>
                    <Td>
                      <input type="checkbox" className="accent-torg-orange" checked={selPasta.has(o.opId)}
                        aria-label={`Marcar a OP ${o.numero} para a planilha`}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => setSelPasta((sel) => {
                          const n = new Set(sel);
                          if (n.has(o.opId)) n.delete(o.opId); else n.add(o.opId);
                          return n;
                        })} />
                    </Td>
                    <Td>
                      <div className="flex items-start gap-1.5">
                        <button onClick={(e) => { e.stopPropagation(); abrirPasta(o.opId, temDet); }} aria-expanded={open}
                          aria-label={`${open ? "Fechar" : "Ver"} a pasta da OP ${o.numero}`}
                          className={`mt-0.5 text-torg-gray ${r && !r.erro ? "" : "invisible"}`}>
                          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                        <div>
                          <Obra o={o} />
                          {o.pasta?.baixada && (
                            <p className="text-[10px] text-torg-gray-light mt-0.5">
                              baixa {o.pasta.baixadaPorNome ? `por ${o.pasta.baixadaPorNome}` : ""}{o.pasta.baixaMotivo ? ` — ${o.pasta.baixaMotivo}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td><span className="text-[12px] text-torg-gray">{o._cliente}</span></Td>
                    <Td dir><span className="tabular-nums text-torg-gray">{fmtN(o.entregues)}</span></Td>
                    {!r || r.veredito === "NAO_CONFERIDA" ? (
                      <td colSpan={4} className="px-3 py-2 text-[12px] text-torg-gray-light">ainda não conferida</td>
                    ) : r.erro ? (
                      <td colSpan={4} className="px-3 py-2 text-[12px] text-torg-gray">{r.erro}</td>
                    ) : (
                      <>
                        <Td dir><span className="tabular-nums text-torg-gray">{fmtN(r.pdfs)}</span></Td>
                        <Td dir><Fracao com={r.conjuntos.comDesenho} de={r.conjuntos.total} /></Td>
                        <Td dir><Fracao com={r.croquis.comDesenho} de={r.croquis.total} /></Td>
                        <Td>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {v && <Chip cor={v.chip}>{v.rot}</Chip>}
                            {/* ⚠ desenho com nome fora do padrão é outro problema: a emissão não o
                                acha, e some da impressão como se não existisse. */}
                            {r.foraPadrao > 0 && <Chip cor="bg-amber-50 text-amber-700 border-amber-200">{fmtN(r.foraPadrao)} mal nomeado(s)</Chip>}
                          </div>
                        </Td>
                      </>
                    )}
                    <Td dir>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button onClick={(e) => { e.stopPropagation(); conferirPasta(o.opId); }} disabled={ocupado}
                          title={r?.checadoEm ? `conferido ${desdeQuando(r.checadoEm)} — clique para reconferir agora` : "conferir a pasta agora"}
                          className="inline-flex items-center gap-1 text-[11px] text-torg-blue hover:underline disabled:opacity-40 disabled:no-underline">
                          {conferindo === o.opId
                            ? <><Loader2 size={11} className="animate-spin" /> conferindo…</>
                            : <><RefreshCw size={11} /> {r?.checadoEm ? desdeQuando(r.checadoEm) : "conferir"}</>}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); darBaixa(o); }} disabled={baixaEmCurso === o.opId}
                          title={o.pasta?.baixada ? "Devolver esta obra à lista" : "Tirar esta obra da lista — obra antiga que não se acompanha mais"}
                          className="text-[11px] text-torg-gray hover:underline disabled:opacity-40">
                          {baixaEmCurso === o.opId ? "…" : o.pasta?.baixada ? "reativar" : "dar baixa"}
                        </button>
                      </div>
                    </Td>
                  </tr>
                  {open && temDet && <tr className="bg-gray-50/50"><td colSpan={9} className="px-3 py-3"><PastaDetalhe d={det} /></td></tr>}
                  {open && !temDet && (
                    <tr className="bg-gray-50/50"><td colSpan={9} className="px-3 py-3">
                      <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> abrindo o detalhe…</p>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </Tabela>
        )}
      </Bloco>

      {/* ── 3. FILA DO PROGRAMADOR ── */}
      <Bloco
        icone={Send}
        titulo="A Engenharia entregou e o programador ainda não pegou"
        sub={`${fmtN(t.aLancar)} peça(s) com lista no portal e sem ordem no Syneco.`}
        cor="text-amber-700"
      >
        {!filaProgramador.length ? <Vazio texto="Nada esperando: toda peça entregue já tem ordem no Syneco." /> : (
          <Tabela cabecalho={["Obra", "A programar", "Programado", "Último lançamento", "Entrega"]}>
            {filaProgramador.map((o) => (
              <tr key={o.opId} className="border-t border-gray-50 hover:bg-gray-50/60">
                <Td><Obra o={o} /></Td>
                <Td dir><span className="font-bold text-amber-700 tabular-nums">{fmtN(o.aLancar)}</span></Td>
                <Td dir><span className="tabular-nums text-torg-gray">{fmtN(o.lancadas)}/{fmtN(o.entregues)}</span></Td>
                {/* ⚠ "há N dias sem lançar" é o que separa fila grande de fila PARADA — uma obra com
                    1.100 peças mexida ontem é volume; a mesma parada há três semanas é problema. */}
                <Td>
                  <span className={`text-[12px] tabular-nums ${o.diasSemLancar >= 14 ? "text-red-600 font-semibold" : o.diasSemLancar >= 7 ? "text-amber-700" : "text-torg-gray"}`}>
                    {o.diasSemLancar == null ? "nunca" : o.diasSemLancar === 0 ? "hoje" : `há ${o.diasSemLancar}d`}
                  </span>
                </Td>
                <Td>
                  <span className={`text-[12px] tabular-nums inline-flex items-center gap-1 ${o.atrasoDias > 0 ? "text-red-600 font-semibold" : "text-torg-gray"}`}>
                    <CalendarClock size={11} /> {fmtD(o.entrega)}
                  </span>
                </Td>
              </tr>
            ))}
          </Tabela>
        )}
      </Bloco>

      {/* ── 4. RITMO POR SETOR ── */}
      <Bloco
        icone={Factory}
        titulo={`O que cada setor fez nos últimos ${d.janelaDias} dias`}
        sub="Apontamento do Syneco, por dia de produção."
        cor="text-torg-blue"
      >
        <Tabela cabecalho={["Setor", "Peso", "Média/dia", "Dias com apontamento", "Obras", "Último"]}>
          {d.setores.map((s) => (
            <tr key={s.setor} className="border-t border-gray-50 hover:bg-gray-50/60">
              <Td><span className="font-semibold text-torg-dark">{s.setor}</span></Td>
              <Td dir><span className="font-bold tabular-nums">{fmtKg(s.kg)}</span></Td>
              <Td dir><span className="tabular-nums text-torg-gray">{fmtKg(s.mediaDia)}</span></Td>
              {/* ⚠ dias COM apontamento é a pergunta escondida: um setor que soma bastante peso em
                  poucos dias não está tocando todo dia — e é isso que quebra o ritmo da fábrica. */}
              <Td>
                <span className={`text-[12px] tabular-nums ${s.dias <= d.janelaDias / 2 ? "text-amber-700 font-semibold" : "text-torg-gray"}`}>
                  {s.dias} de {d.janelaDias}
                </span>
              </Td>
              <Td dir><span className="tabular-nums text-torg-gray">{s.obras}</span></Td>
              <Td><span className="text-[12px] text-torg-gray tabular-nums">{fmtD(s.ultimo)}</span></Td>
            </tr>
          ))}
        </Tabela>

        {/* ⚠ o gráfico é de BARRA SIMPLES, sem biblioteca: o que se quer ver é a irregularidade do
            ritmo — dias de 1 t ao lado de dias de 33 t —, e para isso a altura relativa basta. */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-2">Ritmo diário (kg apontados)</p>
          <div className="flex items-end gap-1 h-24">
            {d.dias.map((x) => (
              <div key={x.dia} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${x.dia}: ${fmtKg(x.kg)} em ${x.setores} setor(es)`}>
                <div className="w-full bg-torg-blue/80 rounded-t hover:bg-torg-blue" style={{ height: `${Math.max(2, (x.kg / picoDia) * 100)}%` }} />
                <span className="text-[9px] text-torg-gray-light tabular-nums">{x.dia.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      </Bloco>

      <p className="text-[11px] text-torg-gray-light text-right">
        Gerado em {new Date(d.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </div>
  );
}

// ⚠⚠ SEPARA O URGENTE DO HISTÓRICO — é a razão de este detalhe existir.
// "3.671 itens fora do mapa" na OP-064 assusta e não aciona: 3.082 deles JÁ FORAM PRODUZIDOS, com
// apontamento de nov/2025 — obra que rodou antes de a lista existir no portal. Importar agora não
// muda a bancada, conserta o número. Já os 266 da OP-097 têm ZERO produção: a fábrica vai fazer e o
// portal não sabe o que é. Somados, o urgente sumia dentro do histórico.
function Detalhe({ d, onExportar, exportando }) {
  const r = d.resumo;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <Mini n={fmtN(r.aProduzir)} l="ainda a produzir" sub={fmtKg(r.aProduzirKg)} cor="text-red-700" bg="bg-red-50 border-red-200" />
          <Mini n={fmtN(r.jaProduzido)} l="já produzidas" sub={fmtKg(r.jaProduzidoKg)} cor="text-torg-gray" bg="bg-white border-gray-200" />
          {/* ⚠ croqui × conjunto diz QUAL import falhou: na OP-097 os 266 eram todos conjunto, o que
              apontou direto para a aba de conjuntos que não entrou. */}
          <Mini n={fmtN(r.conjuntos)} l="conjuntos" cor="text-torg-dark" bg="bg-white border-gray-200" />
          <Mini n={fmtN(r.croquis)} l="croquis" cor="text-torg-dark" bg="bg-white border-gray-200" />
        </div>
        <button onClick={onExportar} disabled={exportando}
          title="Lista completa em Excel — é o que vai para a Engenharia importar"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-torg-gray hover:bg-white disabled:opacity-40">
          {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Planilha
        </button>
      </div>

      {/* ⚠ a distribuição vem ANTES da tabela: é a resposta de "onde está o lote". A tabela existe
          para quem precisa da peça específica depois de já saber a foto geral. */}
      {d.porSetor?.length > 0 && (
        <div>
          <p className="text-[11px] uppercase text-torg-gray-light mb-1.5">Onde estão as peças</p>
          <div className="flex flex-wrap gap-1.5">
            {d.porSetor.map((s) => (
              <span key={s.setor}
                className={`text-[11px] px-2 py-1 rounded-lg border tabular-nums ${s.setor === "não começou" ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-200 text-torg-dark"}`}>
                <b>{s.setor}</b> · {fmtN(s.pecas)} peça(s) · {fmtKg(s.kg)}
              </span>
            ))}
          </div>
        </div>
      )}

      {r.comBuracoDeRegistro > 0 && (
        /* ⚠ é medida do REGISTRO, não da produção — a peça passou, o apontamento é que não veio.
           Fora do "quanto falta" de propósito: somado ali, viraria trabalho que não existe. */
        <p className="text-[11px] text-torg-gray">
          {fmtN(r.comBuracoDeRegistro)} peça(s) passaram por etapa sem apontamento — a peça avançou,
          o registro é que ficou para trás. Não conta como trabalho pendente.
        </p>
      )}

      <p className="text-[12px] text-torg-gray">
        {r.aProduzir > 0
          ? <><b className="text-red-700">{fmtN(r.aProduzir)} peça(s) ainda não produzidas</b> — a fábrica vai fazer e o portal não sabe o que é. É o que precisa de lista com urgência.</>
          : <>Nenhuma peça pendente: tudo aqui já foi produzido. Importar a lista <b>não muda a bancada</b>, conserta os números da obra.</>}
        {r.ultimoApontamento && <> Apontamentos de {fmtD(r.primeiroApontamento)} a {fmtD(r.ultimoApontamento)}.</>}
      </p>

      <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 sticky top-0 text-[10px] uppercase text-torg-gray">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Peça</th>
              <th className="px-2 py-1.5 text-left font-semibold">Tipo</th>
              <th className="px-2 py-1.5 text-left font-semibold">Situação</th>
              <th className="px-2 py-1.5 text-left font-semibold" title="O setor em que a peça está — o mais adiantado com apontamento — e quantas etapas ainda faltam depois dele">Onde está</th>
              <th className="px-2 py-1.5 text-right font-semibold">Feito/Plan.</th>
              <th className="px-2 py-1.5 text-right font-semibold">Peso</th>
              <th className="px-2 py-1.5 text-left font-semibold">Último</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {d.itens.map((it) => (
              <tr key={it.item} className={it.aProduzir ? "bg-red-50/40" : ""}>
                <td className="px-2 py-1 font-semibold text-torg-dark whitespace-nowrap">{it.item}</td>
                <td className="px-2 py-1 text-torg-gray">{it.croqui ? "croqui" : "conjunto"}</td>
                <td className="px-2 py-1">
                  {it.aProduzir
                    ? <span className="text-[10px] font-bold text-red-700">a produzir</span>
                    : <span className="text-[10px] text-torg-gray">já produzida</span>}
                </td>
                {/* ⚠ UM setor, não a lista. A lista crua vinha fora de ordem ("Acabamento · Jato ·
                    Corte") e incluía etapa que só tem ORDEM — a peça parecia ter passado por onde
                    nunca esteve. Aqui: até onde chegou, e o quanto da rota isso é. A rota inteira,
                    com o que já foi feito marcado, fica na dica do mouse. */}
                <td className="px-2 py-1">
                  <Rota it={it} />
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtN(it.produzido)}/{fmtN(it.planejado)}</td>
                <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmtKg(it.kg)}</td>
                <td className="px-2 py-1 text-torg-gray tabular-nums whitespace-nowrap">{fmtD(it.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* ⚠ o corte NUNCA esconde urgente: a API ordena "a produzir" primeiro, então o que sobra de
          fora é sempre a cauda do que já foi produzido. */}
      {d.truncado > 0 && (
        <p className="text-[11px] text-amber-700">
          Mostrando as {fmtN(d.itens.length)} primeiras — mais {fmtN(d.truncado)} não couberam na tela.
          A ordem põe as <b>a produzir</b> na frente, então nenhuma pendente ficou de fora. A planilha sai completa.
        </p>
      )}
    </div>
  );
}

// fração com desenho: verde só quando fecha. "16/25" em cinza faz o furo passar batido.
const Fracao = ({ com, de }) => {
  if (!de) return <span className="text-torg-gray-light">—</span>;
  const ok = com >= de;
  return <span className={`tabular-nums font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}>{fmtN(com)}/{fmtN(de)}</span>;
};

function PastaDetalhe({ d }) {
  const a = d.arquivos;
  const semNada = d.semDesenho.filter((x) => !x.foraPadrao);
  const malNomeado = d.semDesenho.filter((x) => x.foraPadrao);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Mini n={fmtN(a.pdfs)} l="desenhos (PDF)" sub={a.porFormato.map(([f, n]) => `${f} ${n}`).join(" · ") || undefined} cor="text-torg-dark" bg="bg-white border-gray-200" />
        {/* ⚠ NC1/IGS ao lado do desenho de propósito: é o contraste que explica a OP-106 — máquina
            servida, bancada não. Sozinho, "0 desenhos" pareceria pasta esquecida. */}
        <Mini n={fmtN(a.nc1)} l="NC1 (máquina)" cor="text-torg-gray" bg="bg-white border-gray-200" />
        <Mini n={fmtN(a.igs)} l="IGS (modelo 3D)" cor="text-torg-gray" bg="bg-white border-gray-200" />
      </div>

      {a.pdfs === 0 && (a.nc1 > 0 || a.igs > 0) && (
        <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <b>Saiu arquivo de máquina e não saiu desenho.</b> O programador consegue lançar; o setor não tem
          o que abrir na bancada, e a emissão em lote não acha nada para imprimir.
        </p>
      )}

      {malNomeado.length > 0 && (
        /* ⚠ CASO DIFERENTE DE FALTAR: o desenho existe, com nome que a emissão não reconhece (ela
           casa pelo COMEÇO do nome). Some da impressão em lote exatamente como se não existisse. */
        <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <b>{fmtN(malNomeado.length)} desenho(s) existem com nome fora do padrão</b> — a emissão procura o
          arquivo começando pela marca, então não os encontra. Renomear resolve:
          <ul className="mt-1 space-y-0.5">
            {malNomeado.slice(0, 4).map((x) => (
              <li key={x.marca} className="font-mono text-[11px]">{x.marca} → {x.foraPadrao}</li>
            ))}
          </ul>
        </div>
      )}

      {!semNada.length ? (
        <p className="text-[12px] text-emerald-700">Toda marca da lista tem desenho na pasta.</p>
      ) : (
        <>
          <p className="text-[12px] text-torg-gray">
            <b>{fmtN(semNada.length)}</b> marca(s) da lista sem desenho na pasta
            {d.truncado > 0 && <> — mostrando as primeiras {fmtN(d.semDesenho.length)}</>}.
          </p>
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg bg-white">
            <Tabela cabecalho={["Marca", "Tipo", "NC1 gerado"]}>
              {semNada.slice(0, 120).map((x) => (
                <tr key={x.marca} className="border-t border-gray-50">
                  <Td><span className="font-mono text-[12px]">{x.marca}</span></Td>
                  <Td>{x.conjunto ? <Chip cor="bg-sky-50 text-sky-700 border-sky-200">conjunto</Chip> : <span className="text-[12px] text-torg-gray">croqui</span>}</Td>
                  <Td>{x.nc1 ? <span className="text-[12px] text-torg-gray">sim</span> : <span className="text-[12px] text-torg-gray-light">não</span>}</Td>
                </tr>
              ))}
            </Tabela>
          </div>
        </>
      )}
    </div>
  );
}

// ONDE A PEÇA ESTÁ — um setor só, o mais adiantado, e o que falta depois dele.
//
// ⚠ NÃO conta quantos setores apontaram. Vitor (25/08/2026): "se tem peça que está no setor da
// frente não poderia estar no setor anterior". Peça na pintura passou pela montagem, tenha ou não
// apontamento lá — a fração "2/5" dizia o contrário e era a origem da confusão.
function Rota({ it }) {
  const rota = it.rota || [];
  if (!rota.length) return <span className="text-torg-gray-light">—</span>;

  const restam = it.restam || [];
  const semReg = it.semRegistro || [];
  const dica = [
    `Rota: ${rota.join(" → ")}`,
    it.onde ? `Está em: ${it.onde}` : "Sem apontamento nenhum",
    restam.length ? `Falta: ${restam.join(" → ")}` : it.onde ? "Última etapa da rota" : "",
    semReg.length ? `Sem apontamento (já passou): ${semReg.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  if (!it.onde) return <span className="text-torg-gray-light" title={dica}>não começou</span>;

  return (
    <span className="whitespace-nowrap" title={dica}>
      <span className="text-torg-dark font-medium">{it.onde}</span>
      <span className="text-torg-gray-light ml-1">
        {restam.length ? `· faltam ${restam.length}` : "· última"}
      </span>
    </span>
  );
}

const Mini = ({ n, l, sub, cor, bg }) => (
  <span className={`inline-flex flex-col rounded-lg border px-2.5 py-1.5 ${bg}`}>
    <span className={`text-base font-extrabold tabular-nums leading-none ${cor}`}>{n}</span>
    <span className="text-[10px] text-torg-gray mt-0.5">{l}</span>
    {sub && <span className="text-[10px] text-torg-gray-light tabular-nums">{sub}</span>}
  </span>
);

function Obra({ o }) {
  return (
    <span className="min-w-0">
      {/* ⚠ leva para a OP, não para a tela de trabalho: daqui se investiga, não se opera. */}
      <Link href={`/comercial/${o.opId}`} className="font-extrabold text-torg-dark tabular-nums hover:text-torg-blue hover:underline">
        {fmtOP(o.numero)}
      </Link>
      <span className="block text-[11px] text-torg-gray truncate max-w-[26ch]" title={`${o.cliente || ""}${o.obra ? ` — ${o.obra}` : ""}`}>
        {o.cliente || "—"}{o.obra ? ` — ${o.obra}` : ""}
      </span>
    </span>
  );
}

function Bloco({ icone: Icone, titulo, sub, cor, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start gap-2 mb-1">
        <Icone size={18} className={`${cor} mt-0.5 shrink-0`} />
        <div className="min-w-0">
          <h3 className={`font-bold ${cor}`}>{titulo}</h3>
          <p className="text-[12px] text-torg-gray">{sub}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

// `cabecalhoNode` para tabelas cujo <th> tem funil ou caixa de seleção; `cabecalho` (strings) segue
// valendo para as simples. Chave pelo índice: há colunas de rótulo vazio, e "" repetido colide.
function Tabela({ cabecalho, cabecalhoNode, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray">
          {cabecalhoNode || <tr>{cabecalho.map((h, i) => <th key={i} className="px-3 py-2 font-semibold text-left">{h}</th>)}</tr>}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children, dir }) => <td className={`px-3 py-2 align-top ${dir ? "text-right" : ""}`}>{children}</td>;
const Chip = ({ cor, children }) => <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cor}`}>{children}</span>;
const Vazio = ({ texto }) => (
  <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 inline-flex items-center gap-2">
    <ArrowRight size={14} /> {texto}
  </p>
);

function Card({ n, l, sub, cor, bg }) {
  return (
    <div className="rounded-xl p-3.5 border border-transparent" style={{ background: bg }}>
      <div className="text-2xl font-extrabold tabular-nums" style={{ color: cor }}>{n}</div>
      <div className="text-xs text-torg-gray mt-0.5">{l}</div>
      {sub && <div className="text-[10px] text-torg-gray-light mt-0.5">{sub}</div>}
    </div>
  );
}
