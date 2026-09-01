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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, RefreshCw, ChevronRight, ChevronDown, Printer, Search,
  Factory, Monitor, CalendarClock, Package, CheckCircle2, FileText, FileSpreadsheet, Send, Flag, X,
} from "lucide-react";
import { fmtOP } from "@/lib/utils";
import CompraChip, { ModalRastreabilidade } from "@/components/CompraChip";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";
import SeparacaoModal from "@/components/SeparacaoModal";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import LiberacaoMaterial from "./LiberacaoMaterial";
// ⚠ o download do ZIP vem da lib (era a TERCEIRA cópia da mesma função neste repositório); ela
// suporta a pasta por bancada, que a cópia local não tinha.
import { baixarZipLote } from "@/lib/desenhos-zip-cliente";
import PainelBancadas from "@/app/producao/programacao/montagem/PainelBancadas";

const MAX_LOTE = 80; // teto do /api/producao/desenhos/lote

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");
const fmtDH = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

// A programação do Syneco, na linguagem do PCP. Mesmos quatro estados do painel de despacho —
// se divergissem, a mesma peça teria dois nomes em duas telas.
//
// ⚠⚠ NA TELA SE DIZ "PROGRAMAR", NÃO "LANÇAR". Vitor (24/08/2026) pediu a troca, e ela conserta uma
// incoerência: o estado bom já se chamava "programada" e o ruim "não lançada" — duas palavras para
// os dois lados da MESMA pergunta, que é o que faz alguém achar que são coisas diferentes. Quem faz
// é o programador; o que ele faz é programar. As chaves internas seguem com LANCADA porque são o
// contrato com a API; o que muda é o que a pessoa lê.
const PROG = {
  INICIADA: { txt: "iniciada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dica: "A ordem deste setor já rodou no Syneco." },
  PROGRAMADA: { txt: "programada", cls: "bg-sky-50 text-sky-700 border-sky-200", dica: "O programador programou a peça e a ordem ainda não iniciou — é o que pode descer para a fábrica." },
  OUTRO_SETOR: { txt: "outro setor", cls: "bg-slate-100 text-slate-600 border-slate-200", dica: "Programada no Syneco, mas sem ordem deste setor." },
  NAO_LANCADA: { txt: "não programada", cls: "bg-red-50 text-red-700 border-red-200", dica: "O programador ainda NÃO programou esta peça no Syneco." },
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

// ⚠⚠ A SITUAÇÃO DA PEÇA NO SETOR — não iniciado → em produção → finalizado.
// Vitor (24/08/2026): "deixar como uma marcação mais clara do que estava com status de não iniciado
// em relação ao iniciado ou finalizados, e conforme for dado baixa nesse material você vai marcando
// dando como finalizado".
//
// ⚠ É DERIVADO, não é campo. Finalizado é o que a fábrica fechou (Syneco atingiu a quantidade) OU o
// que alguém baixou no portal — as duas coisas querem dizer a mesma: aqui acabou. Guardar um campo
// à parte criaria uma terceira verdade para brigar com essas duas.
// ⚠ O QUE JÁ SAIU DA PEÇA NESTE SETOR: o maior entre o apontado no Syneco e a baixa do portal.
// São dois registros da mesma coisa — a fábrica apontando e alguém dando baixa no que ela não
// apontou —, então somar contaria duas vezes e ficar só com um deixaria peça pronta parecendo
// pendente. Mesma regra da situação, para o número e a cor nunca contarem histórias diferentes.
function feitoDaPeca(p) {
  return Math.max(Number(p.produzidoSyneco) || 0, Number(p.baixadoQtd) || 0);
}

function situacaoDaPeca(p) {
  if (p.expedida) return "EXPEDIDA";
  const qtd = Number(p.qte) || 0;
  const feito = feitoDaPeca(p);
  if (p.baixadoPortal && (Number(p.baixadoQtd) || 0) >= qtd) return "FINALIZADO";
  if (qtd > 0 && feito >= qtd) return "FINALIZADO";
  if (feito > 0) return "PARCIAL";
  if (p.programacao?.situacao === "INICIADA") return "PARCIAL";
  return "NAO_INICIADO";
}
// ⚠ `barra` é a classe INTEIRA, escrita à mão. O Tailwind varre o código como TEXTO: classe montada
// em tempo de execução (`"bg-" + cor`, ou um `.replace()`) não existe no CSS gerado e a faixa
// simplesmente não aparece — sem erro nenhum, que é o pior jeito de descobrir.
const SIT = {
  NAO_INICIADO: { txt: "não iniciado", cls: "bg-gray-100 text-gray-600 border-gray-200", barra: "border-l-gray-200", dica: "Nada apontado no Syneco e sem baixa no portal." },
  PARCIAL:      { txt: "em produção",  cls: "bg-sky-50 text-sky-700 border-sky-200",     barra: "border-l-sky-400",  dica: "A fábrica começou e ainda não fechou a quantidade." },
  FINALIZADO:   { txt: "finalizado",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", barra: "border-l-emerald-500", dica: "Quantidade fechada no Syneco ou baixa dada no portal." },
  EXPEDIDA:     { txt: "expedida",     cls: "bg-emerald-100 text-emerald-800 border-emerald-300", barra: "border-l-emerald-600", dica: "Já saiu em romaneio — a Expedição assumiu." },
};

// ⚠⚠ FILTRO POR COLUNA, COMO NO EXCEL. Vitor (24/08/2026): "nessa parte você poderia criar um
// filtro igual no excel para facilitar o que eu quero filtrar de fato".
//
// ⚠ Cada coluna vira TEXTO por uma função só — a mesma que a célula mostra. Se o filtro derivasse o
// valor de um jeito e a célula de outro, a pessoa marcaria "programada" e veria linha escrito outra
// coisa, e passaria a não confiar no filtro.
//
// ⚠ Peso e Qtd ficam de fora de propósito: são contínuos, e lista de caixinha com 300 números
// distintos não filtra nada — para eles vale a busca por texto.
const COLUNAS_FILTRO = [
  { key: "marca", label: "Marca", valor: (p) => p.marca || "—" },
  // ⚠ a coluna se chamava "Perfil" e mostrava a DESCRIÇÃO — o filtro sempre leu `descricao`, então
  // o dado estava certo e só o rótulo mentia. Pior na montagem, onde conjunto não tem perfil nenhum.
  { key: "perfil", label: "Descrição", valor: (p) => p.descricao || "—" },
  { key: "programacao", label: "Programação", valor: (p) => (PROG[p.programacao?.situacao] || PROG.NAO_LANCADA).txt },
  { key: "situacao", label: "Situação", valor: (p) => SIT[situacaoDaPeca(p)].txt },
  { key: "material", label: "Material", valor: (p) => (p.material?.recebido ? (p.material.rastreio ? `R ${p.material.rastreio}` : "recebido") : "sem R") },
  { key: "grd", label: "Liberado (GRD)", valor: (p) => (p.grd ? "liberado" : "não liberado") },
];

const ALERTA = {
  SEM_LISTA: { txt: "sem lista", cls: "bg-red-50 text-red-700 border-red-200", dica: "Nenhuma peça importada (nem LPC nem LE) — não há o que programar." },
  PRODUZINDO_SEM_LISTA: { txt: "produzindo sem lista", cls: "bg-red-50 text-red-700 border-red-200", dica: "A fábrica já apontou produção e o portal não tem o detalhamento." },
  SEM_DETALHE_CORTE: { txt: "sem detalhe de corte", cls: "bg-amber-50 text-amber-700 border-amber-200", dica: "Sem croqui no portal: não há o que cortar nem rastrear." },
  SEM_CRONOGRAMA: { txt: "sem cronograma", cls: "bg-amber-50 text-amber-700 border-amber-200", dica: "Sem cronograma a OP não tem data por setor — nem prazo, nem posição real na fila." },
  NADA_LANCADO: { txt: "nada programado", cls: "bg-slate-100 text-slate-600 border-slate-200", dica: "Nenhuma peça desta OP tem ordem no Syneco — o programador ainda não programou nada." },
};

export default function ProducaoClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verTodas, setVerTodas] = useState(false);
  const [materialAberto, setMaterialAberto] = useState(null); // liberação com o portão aberto
  const [erro, setErro] = useState("");

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
  // é união de duas situações — a que o programador nem programou e a que ele programou e a fábrica não
  // pegou. As duas separadas também servem, porque a ação é diferente: uma se cobra do programador,
  // a outra se desce para a fábrica.
  const [baixando, setBaixando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [mandando, setMandando] = useState(false);
  const [colAberta, setColAberta] = useState(null);
  // ⚠ a lista de separação é o papel do ALMOXARIFADO, não do PCP: sai por material, com barras,
  // peso e o R de cada um. Mesmo componente da TV — duas versões do mesmo papel divergiriam, e é
  // ele que garante que o material separado é o R certo.
  const [separacao, setSeparacao] = useState(null);
  const [rastro, setRastro] = useState(null); // opNumero com a rastreabilidade aberta

  // ⚠⚠ O HOOK VEM ANTES DE QUEM O USA — e não vinha.
  // `pecas` chama `passaColuna` no corpo do `useMemo`, que roda DURANTE a renderização. Com a
  // declaração depois, o `const` ainda estava na zona morta e a tela inteira caía com "Cannot access
  // 'passaColuna' before initialization" — a página do PCP abria em branco com "Application error".
  // ⚠ nem o `next build` nem o `no-undef` pegam isto: a variável existe, só ainda não foi criada
  // quando alguém a chama. Ordem de declaração é regra, não estilo.
  const { filtros: filtroCol, setFiltros: setFiltroCol, passa: passaColuna, opcoesDaColuna, ativos: filtrosAtivos, limpar: limparColunas, rotulosAtivos } =
    useFiltroColunas(detalhe?.pecas || [], COLUNAS_FILTRO);
  const fp = { filtros: filtroCol, setFiltros: setFiltroCol, opcoesDaColuna, aberta: colAberta, setAberta: setColAberta };
  // ⚠ material (o R) só faz sentido no CORTE: da montagem em diante a linha é o conjunto, e o R
  // pertence a cada croqui que o compõe — ele sai no carimbo do desenho, posição por posição.
  const mostraMaterial = !setorAba || setorAba === "CORTE";

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      // ⚠ por padrão só o que o Planejamento LIBEROU. Vitor (25/08/2026): "no painel do PCP o ideal
      // seria não mostrar nenhuma obra por hora para não ficar confuso". `todas` é a saída de
      // emergência, não o normal.
      const r = await fetch(`/api/pcp/producao${verTodas ? "?todas=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [verTodas]);
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
    const setor = op.setores.find((s) => s.pendenteKg > 0)?.setor || op.setores[0]?.setor || "";
    setAberta(op.opId); setSetorAba(setor); setDetalhe(null); setFiltroPecas(""); limparColunas(); setColAberta(null);
    carregarDetalhe(op.opId, setor);
  }

  function trocarSetor(op, setor) {
    setSetorAba(setor); setDetalhe(null); setFiltroPecas(""); limparColunas(); setColAberta(null);
    carregarDetalhe(op.opId, setor);
  }

  // ⚠ A BARRA DE FILTROS SAIU (Vitor, 01/09/2026: "remova essa parte") — busca, abas de setor e a
  // caixa "só o que tem fila ou alerta". O COMPORTAMENTO da caixa fica: ela vinha marcada, e obra
  // sem fila nem alerta continua fora da lista. Tirar o controle e ligar tudo de volta encheria a
  // tela com o que ele acabou de mandar limpar.
  const ops = useMemo(
    () => (dados?.ops || []).filter((o) => o.kg.pendente > 0 || o.alertas.length > 0),
    [dados]
  );


  // ── peças da OP aberta, já filtradas ──
  // ⚠ OS CHIPS DE SITUAÇÃO SAÍRAM. Vitor (01/09/2026): "não precisa desses botões tbm pois já temos
  // os filtros nas colunas". Eram duas maneiras de filtrar a MESMA coisa — a coluna Programação e a
  // Situação já têm funil próprio, e dois controles para o mesmo recorte se contradizem na tela
  // (chip dizendo "Programadas 47" com a coluna filtrada em outra coisa).
  const pecas = useMemo(() => {
    const base = (detalhe?.pecas || []).filter((p) => passaColuna(p, null));
    const q = filtroPecas.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => [p.marca, p.descricao, p.perfil].some((x) => String(x || "").toLowerCase().includes(q)));
  }, [detalhe, filtroPecas, passaColuna]);

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

      // ⚠⚠ ZERO EMITIDAS NÃO É SUCESSO — e a mensagem dizia que era.
      // Estava `j.emitidas || marcasSel.length`: com emitidas = 0 (nenhuma marca tem desenho na
      // pasta da OP), o zero é falsy e caía no fallback, então a tela anunciava "7 desenho(s)
      // liberado(s)" tendo liberado nenhum. Vitor (24/08/2026): "estou tentando imprimir os
      // projetos mas não está indo" — o portal tinha dito que foi.
      const emitidas = Number(j.emitidas) || 0;
      const semDesenho = j.semDesenho?.length || 0;
      const faltantes = semDesenho ? ` Sem desenho na pasta da OP: ${j.semDesenho.slice(0, 8).join(", ")}${semDesenho > 8 ? ` e mais ${semDesenho - 8}` : ""}.` : "";
      if (!emitidas) {
        setAviso({
          ok: false,
          texto: `Nenhum desenho foi encontrado para as ${marcasSel.length} marca(s) selecionada(s), então nada foi impresso nem liberado.${faltantes}`
            + " Confira se os PDFs estão em 2. Engenharia › 2.5 Projetos › 2.5.2 Fabricação, com o nome começando pela marca.",
        });
        return;
      }

      // ⚠ o erro do ZIP não pode mais sumir: as GRDs JÁ foram gravadas, então dizer só "liberado"
      // sem o arquivo na mão deixa a pessoa procurando um download que não aconteceu.
      let erroZip = null;
      try { await baixarZipLote(j, detalhe.opNumero); } catch (e) { erroZip = e?.message || "falhou"; }
      setAviso({
        ok: !erroZip,
        texto: `${emitidas} desenho(s) liberado(s)`
          + (erroZip ? `, mas o download falhou (${erroZip}). A GRD está registrada; abra os arquivos pela pasta da OP no servidor.` : " e baixado(s) em pastas por impressora.")
          + faltantes,
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

  // ── MANDAR PARA PRODUÇÃO ───────────────────────────────────────────────────────────────────
  // Vitor (24/08/2026): "para eu formar a linha do que eu quero que a produção fabrique para ficar
  // lá no painel da produção... mas não pode tirar isso da minha tela".
  //
  // ⚠ NÃO É ESTADO NOVO: é a FILA DE PRIORIDADE que já existe. A peça ganha número na fila da OP e
  // sobe para o topo da aba do setor em /producao/prioridades. Inventar um "enviado para produção"
  // à parte daria duas listas para a fábrica olhar, e ela ia olhar a errada.
  //
  // ⚠ A PEÇA CONTINUA AQUI. Marcar prioridade não tira ninguém desta tela — some da lista só quem
  // entrou em romaneio, porque aí a Expedição assumiu. O que muda é a marcação.
  //
  // ⚠ E A OP PRECISA ESTAR "EM PRODUÇÃO", senão o painel da fábrica nem mostra a obra e a fila vai
  // para o vazio. Ligar junto evita o silêncio; o aviso diz que ligou.
  async function mandarParaProducao() {
    const alvo = pecas.filter((p) => sel.has(p.id));
    if (!alvo.length || !detalhe) return;
    const novas = alvo.filter((p) => p.prioridade == null);
    if (!novas.length) {
      setAviso({ ok: false, texto: "Todas as selecionadas já estão na fila da produção." });
      return;
    }
    const op = ops.find((o) => o.opId === aberta);
    const precisaLigar = !detalhe.emProducao;
    if (!confirm(`Mandar ${novas.length} peça(s) para a produção?\n\nElas entram na fila da ${SETOR_LABEL[setorAba] || setorAba} no Painel de Produção, na ordem, e continuam nesta tela.${precisaLigar ? "\n\nA OP ainda não está marcada como \"em produção\" — vou ligar, senão o painel da fábrica não mostra a obra." : ""}`)) return;
    setMandando(true); setAviso(null);
    try {
      if (precisaLigar) {
        await fetch("/api/pcp/op-em-producao", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opId: aberta, emProducao: true }),
        });
      }
      const r = await fetch("/api/pcp/despacho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: novas.map((p) => p.id), destino: "PRIORIDADE" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao mandar para produção");
      setAviso({
        ok: true,
        texto: `${j.atualizados ?? novas.length} peça(s) na fila da ${SETOR_LABEL[setorAba] || setorAba}${op ? ` da ${fmtOP(op.opNumero)}` : ""}.`
          + (precisaLigar ? " A OP foi marcada como em produção." : "")
          + (j.descartados ? ` ${j.descartados} da lista de expedição foram descartadas (já estão na LPC).` : ""),
      });
      setSel(new Set());
      await carregarDetalhe(aberta, setorAba);
      carregar();
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    finally { setMandando(false); }
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
  // ── MONTAGEM: repartir entre bancadas, liberar e imprimir ──────────────────────────────────
  // ⚠⚠ ISTO MORA AQUI PORQUE É AQUI QUE SE TRABALHA. Vitor (01/09/2026): "onde eu vou para
  // selecionar as bancadas? está confuso demais o passo a passo". Eu tinha construído o painel em
  // /pcp/montagem — outra tela, que ele nem usa. Passo a passo espalhado por duas telas não é passo
  // a passo, é caça ao tesouro.
  async function liberarEmBancadas(distrib, porDia) {
    const bancadaPorId = {}, bancadaPorMarca = {}, diaPorId = {}, ids = [];
    for (const b of distrib) for (const it of b.itens) {
      bancadaPorId[it.id] = b.bancada; bancadaPorMarca[it.marca] = b.bancada; ids.push(it.id);
    }
    for (const b of porDia || []) for (const d of b.dias) {
      const iso = d.dia.toISOString().slice(0, 10);
      for (const it of d.itens) diaPorId[it.id] = iso;
    }
    if (!ids.length) return;
    const nDias = new Set(Object.values(diaPorId)).size;
    if (!confirm(`Liberar ${ids.length} conjunto(s) em ${distrib.length} bancada(s)`
      + (nDias > 1 ? `, distribuídos em ${nDias} dias` : "") + `, e imprimir o maço?`)) return;

    setImprimindo(true);
    const erros = [];
    try {
      // ⚠ libera ANTES de imprimir: a impressão registra GRD, e emitir GRD de conjunto que o
      // servidor recusou liberar seria assinar papel de peça que não vai ser montada.
      const rl = await fetch("/api/producao/pecas/liberar-montagem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, bancadaPorId, diaPorId }),
      });
      const jl = await rl.json();
      if (!rl.ok) throw new Error(jl.error || "Erro ao liberar");
      if (jl.bloqueados?.length) {
        erros.push(...jl.bloqueados.map((b) => `${b.marca} não desceu — ${b.cortados}/${b.total} croquis cortados`));
      }
      const liberados = new Set(jl.liberadosIds || ids);
      const marcas = [...new Set(distrib.flatMap((b) => b.itens.filter((i) => liberados.has(i.id)).map((i) => i.marca)))];
      if (marcas.length) {
        const r = await fetch("/api/producao/desenhos/lote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opNumero: detalhe.opNumero, marcas, setor: "MONTAGEM", acao: "IMPRIMIR", bancadaPorMarca }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Erro ao emitir os desenhos");
        await baixarZipLote(j, detalhe.opNumero, "montagem");
      }
      setSel(new Set());
      await carregarDetalhe(aberta, setorAba);
      setAviso({ ok: !erros.length, texto: `${liberados.size} conjunto(s) liberado(s) em ${distrib.length} bancada(s).` });
    } catch (e) {
      erros.push(e.message);
    } finally {
      setImprimindo(false);
      if (erros.length) alert("Terminou com pendências:\n\n" + erros.slice(0, 10).join("\n"));
    }
  }

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
    const headers = ["Marca", "Perfil", "Feito", "Qtd", "Peso (kg)", "Programação", "Onde está", "Material (R)", "NF", "Corrida", "Liberado em", "Liberado por"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Produção — ${fmtOP(detalhe.opNumero)} · ${nomeSetor}`,
      // ⚠ a planilha sai COM O FILTRO da tela, então ela precisa DIZER isso. Papel de 40 linhas que
      // parece a lista inteira leva alguém a concluir que o resto não existe.
      subtitulo: `${op?.cliente || ""}${op?.obra ? ` — ${op.obra}` : ""} · ${lista.length} peça(s)`

        + (filtrosAtivos ? ` · filtrado por ${rotulosAtivos.map((x) => x.toLowerCase()).join(", ")}` : "")
        + (filtroPecas.trim() ? ` · busca "${filtroPecas.trim()}"` : ""),
      kpis: [
        `${lista.filter((p) => p.programacao?.situacao === "NAO_LANCADA").length} não programada(s)`,
        `${lista.filter((p) => p.programacao?.situacao === "PROGRAMADA").length} programada(s)`,
        `${lista.filter((p) => p.grd).length} liberada(s)`,
      ],
      totalColunas: headers.length, nomePlanilha: "Produção", codigoDoc: "REL-PCP-001",
    });
    ws.columns = [{ width: 18 }, { width: 22 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 15 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 22 }];
    let linha = linhaInicio;
    adicionarHeaderTabela(ws, linha, headers); linha++;
    for (const p of lista) {
      adicionarLinhaTabela(ws, linha, [
        p.marca, p.descricao || "", feitoDaPeca(p), Number(p.qte) || 0, Number(p.pesoTotalKg) || 0,
        PROG[p.programacao?.situacao]?.txt || "—",
        p.expedida ? "expedida"
          : p.montadoEm ? (p.montadoEm.montados >= p.montadoEm.total ? "montado" : `montado ${p.montadoEm.montados}/${p.montadoEm.total}`)
          : p.setorReal ? SETOR_LABEL[p.setorReal] || p.setorReal : "não começou",
        p.material?.rastreio || (p.material?.recebido ? "recebido" : "sem R"),
        p.material?.nf || "", p.material?.corrida || "",
        p.grd ? fmtDH(p.grd.em) : "", p.grd?.por || "",
      ]);
      linha++;
    }
    adicionarLinhaTotais(ws, linha, ["TOTAL", "",
      lista.reduce((a, p) => a + feitoDaPeca(p), 0),
      lista.reduce((a, p) => a + (Number(p.qte) || 0), 0),
      Math.round(lista.reduce((a, p) => a + (Number(p.pesoTotalKg) || 0), 0)), "", "", "", "", "", "", ""]);
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
            As obras na fábrica. Clique numa OP para ver as peças, o que o programador já programou e liberar para fabricar.
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
        /* ⚠ VAZIO NÃO É ERRO — é o estado normal quando o Planejamento não liberou nada. O texto
            precisa DIZER isso, senão a tela parece quebrada e alguém vai procurar a obra na mão. */
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
          {verTodas ? (
            <p className="text-torg-gray">Nenhuma OP com fila.</p>
          ) : (
            <>
              <p className="text-torg-dark font-semibold mb-1">Nada liberado para produzir.</p>
              <p className="text-[13px] text-torg-gray max-w-lg mx-auto">
                A fila do PCP é montada pelo Planejamento, em <b>Datas por setor → Liberar para o PCP</b>,
                por frente da obra e com prioridade.
                {dados?.totalObras > 0 && <> Há {fmtN(dados.totalObras)} obra(s) com cronograma ativo esperando liberação.</>}
              </p>
              <button onClick={() => setVerTodas(true)} className="mt-3 text-[12px] text-torg-blue hover:underline">
                ver todas as obras mesmo assim
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {ops.map((o) => {
            const open = aberta === o.opId;
            return (
              <div key={o.opId} className={`bg-white rounded-xl border shadow-[0_1px_3px_rgba(0,41,69,0.06)] overflow-hidden ${open ? "border-torg-blue-200" : "border-gray-100"}`}>
                {/* ⚠ O QUE O PLANEJAMENTO LIBEROU, no topo do cartão. Sem isto o PCP vê a obra e não
                    sabe QUAL frente foi mandada nem com que prioridade — que é a informação toda. */}
                {/* ⚠ O PORTÃO DO MATERIAL fica NA LIBERAÇÃO, não na OP: cada frente liberada tem o
                    seu material, e é por frente que o PCP decide o que imprimir. */}
                {o.liberacoes?.length > 0 && (
                  <div className="px-4 pt-2.5 pb-2 border-b border-gray-50">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {o.liberacoes.map((l) => {
                        const aberto = materialAberto === l.id;
                        return (
                          <button key={l.id} onClick={(e) => { e.stopPropagation(); setMaterialAberto(aberto ? null : l.id); }}
                            title={[`liberada por ${l.liberadoPorNome || "—"}`, l.desvioMotivo, "clique para conferir o material"].filter(Boolean).join(" · ")}
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold hover:opacity-80 ${aberto ? "ring-2 ring-torg-blue " : ""}${l.prioridade === "ALTA" ? "bg-red-50 text-red-700 border-red-200" : l.prioridade === "BAIXA" ? "bg-gray-100 text-torg-gray border-gray-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {l.frente} · {(l.setores || []).join(" ")}
                            {l.desvioDias > 0 && <span className="ml-1 font-normal">{l.desvioDias}d após o marco</span>}
                          </button>
                        );
                      })}
                      <span className="text-[10px] text-torg-gray-light ml-1">clique na frente para conferir o material</span>
                    </div>
                    {o.liberacoes.some((l) => l.id === materialAberto) && (
                      <div onClick={(e) => e.stopPropagation()} className="mt-2.5 bg-gray-50/60 border border-gray-100 rounded-lg p-3">
                        <LiberacaoMaterial liberacaoId={materialAberto} opNumero={o.numero}
                          onImprimir={(ids) => { setSel(new Set(ids)); abrir(o); }} />
                      </div>
                    )}
                  </div>
                )}
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
                    {/* ⚠⚠ HIERARQUIA, NÃO MENOS DADO. Vitor (01/09/2026): "está um pouco confuso a
                        visualização". Os cinco números viviam na MESMA linha, do mesmo tamanho,
                        competindo — "1d de atraso · 96.013 kg na fila · 197/197 programadas · 79
                        liberadas · 9% Recebimento". Agora o que faz alguém PARAR (atraso, material)
                        são selos; o resto vira uma linha de apoio, menor. Nenhum número saiu. */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {o.atrasoDias > 0 ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 inline-flex items-center gap-1">
                          <CalendarClock size={11} /> {o.atrasoDias} {o.atrasoDias === 1 ? "dia" : "dias"} de atraso
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray inline-flex items-center gap-1">
                          <CalendarClock size={11} /> entrega {fmtD(o.entrega)}
                        </span>
                      )}
                      {o.compra && <CompraChip compra={o.compra} opNumero={o.opNumero} mini />}
                      {o.alertas.map((a) => {
                        const t = ALERTA[a];
                        return t ? (
                          <span key={a} title={t.dica} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${t.cls}`}>{t.txt}</span>
                        ) : null;
                      })}
                    </div>
                    {/* a barra é o CORTE — o portão da obra: nada anda enquanto ele não passa */}
                    {(() => {
                      const c = o.setores.find((x) => x.setor === "CORTE");
                      const pct = c?.pct ?? null;
                      return (
                        <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                          {pct != null && (
                            <span className="h-1.5 w-32 rounded-full bg-gray-100 overflow-hidden shrink-0" title={`Preparação ${pct}% pronta`}>
                              <i className="block h-full bg-torg-blue" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                            </span>
                          )}
                          <span className="text-[11px] text-torg-gray-light tabular-nums">
                            {pct != null && <>corte {pct}% · </>}
                            {fmtKg(o.kg.pendente)} na fila · {fmtN(o.pecas.lancadas)}/{fmtN(o.pecas.total)} programadas
                            {o.pecas.naoLancadas > 0 && <span className="text-red-600 font-semibold"> · {fmtN(o.pecas.naoLancadas)} não programadas</span>}
                            {" · "}{fmtN(o.pecas.liberadas)} liberadas
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100">
                    {/* abas de setor da OP */}
                    <div className="flex items-center gap-1 px-3 pt-2.5 flex-wrap">
                      {/* ⚠⚠ O kg DA ABA É O QUE FALTA PASSAR NAQUELE SETOR — e não se somam.
                          Vitor (24/08/2026): "o que significam esses números". A mesma peça conta em
                          TODOS os setores por onde ainda vai passar, então somar as abas dá muito
                          mais que o peso da obra. Croqui só existe na Preparação; conjunto vai de
                          Montagem a Expedição; avulsa é cortada e pula Montagem/Solda. */}
                      {/* ⚠⚠ A UNIDADE MUDA COM O SETOR. Vitor (01/09/2026): "vamos ter que prever
                          em peças, pois isso não vai fechar". O corte se mede em kg — é a meta dele.
                          Da montagem em diante, em PEÇA: as mesmas bancadas mantiveram 35→36 peças
                          por dia enquanto o kg/dia caía de 4.312 para 1.425, porque a peça ficou
                          três vezes mais leve. Sete abas em kg faziam a montagem parecer parada.
                          ⚠ ZERO E "AINDA NÃO CHEGOU A VEZ" NÃO SÃO A MESMA COISA: setor sem fila
                          mostra "—", não 0 kg. */}
                      {o.setores.map((s) => {
                        const emKg = s.setor === "CORTE";
                        const vazio = (s.pendenteKg || 0) <= 0;
                        const sel = setorAba === s.setor;
                        return (
                          <button key={s.setor} onClick={() => trocarSetor(o, s.setor)}
                            title={`${s.label}: falta passar ${fmtKg(s.pendenteKg)} de ${fmtKg(s.totalKg)} (${s.pct}% pronto)${emKg ? "" : ` · ${fmtN(s.pendenteItens)} marca(s), ${fmtN(s.pendenteUn)} peça(s)`}.${s.atrasoDias > 0 ? ` Atrasado ${s.atrasoDias} dia(s).` : s.entrega ? ` Até ${fmtD(s.entrega)}.` : ""} A mesma peça conta em cada setor por onde ainda vai passar — não some as abas.`}
                            className={`text-left px-2.5 py-1.5 rounded-lg border ${
                              sel ? "bg-torg-blue text-white border-torg-blue"
                              /* ⚠ o atraso POR SETOR diz QUAL setor está segurando a obra — o
                                 atraso da OP inteira não diz. */
                              : s.atrasoDias > 0 ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              : vazio ? "border-gray-100 text-torg-gray-light"
                              : "border-gray-200 text-torg-gray hover:bg-gray-50"}`}>
                            <span className="block text-[10px] font-bold uppercase tracking-wider opacity-90">{s.label}</span>
                            <span className="block text-[13px] font-extrabold tabular-nums leading-tight">
                              {vazio ? "—" : emKg ? fmtKg(s.pendenteKg) : fmtN(s.pendenteItens)}
                            </span>
                            <span className={`block text-[10px] ${sel ? "opacity-80" : "opacity-70"}`}>
                              {vazio ? "nada na fila" : emKg ? `${fmtN(s.pendenteItens)} peças` : `marcas · ${fmtN(s.pendenteUn)} un · ${fmtKg(s.pendenteKg)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {carregandoDet ? (
                      <div className="flex items-center gap-2 text-torg-gray text-sm px-4 py-8"><Loader2 size={16} className="animate-spin" /> abrindo as peças…</div>
                    ) : !detalhe ? (
                      <div className="px-4 py-8 text-sm text-torg-gray">Não consegui abrir as peças desta OP.</div>
                    ) : (
                      <>
                        <div className="px-3 py-2.5 border-b border-gray-100 space-y-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input value={filtroPecas} onChange={(e) => setFiltroPecas(e.target.value)} placeholder="filtrar marca, perfil…"
                              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-44 focus:border-torg-blue" />
                            <span className="text-[11px] text-torg-gray">{fmtN(pecas.length)} peça(s)</span>
                            {marcasSel.length > 0 && (
                              <span className="text-[11px] text-torg-blue font-semibold">· {marcasSel.length} selecionada(s)</span>
                            )}
                            {filtrosAtivos > 0 && (
                              <button onClick={limparColunas}
                                className="text-[11px] text-torg-orange hover:underline inline-flex items-center gap-1 font-semibold">
                                <X size={11} /> limpar {filtrosAtivos} filtro(s) de coluna
                              </button>
                            )}
                            <span className="flex-1" />
                            {/* ⚠ com peça marcada, a lista sai SÓ das marcadas; sem marcar, da OP
                                inteira — igual ao painel da TV. É o que deixa separar por lote. */}
                            {/* ⚠ SEPARAÇÃO É DO CORTE. Vitor (01/09/2026): "não precisa o botão
                                separação nesse caso para os perfis" — na montagem a unidade é o
                                conjunto, que não tem perfil nem barra a separar. O botão some em
                                vez de ficar cinza ocupando espaço. */}
                            {(!setorAba || setorAba === "CORTE") && (
                            <button onClick={() => setSeparacao({ opId: aberta, obra: `${fmtOP(detalhe.opNumero)}${o.obra ? ` — ${o.obra}` : ""}`, setor: setorAba || null, ids: sel.size ? [...sel] : null })}
                              disabled={!detalhe}
                              title={sel.size ? `Lista de separação das ${sel.size} peça(s) marcadas` : "Lista de separação da OP inteira — material, barras, peso e o R de cada um"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50 disabled:opacity-40">
                              <Package size={13} /> Separação{sel.size ? ` (${sel.size})` : ""}
                            </button>
                            )}
                            <button onClick={exportar} disabled={!pecas.length || exportando}
                              title="Baixa a lista filtrada em Excel, no padrão das planilhas da Torg"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50 disabled:opacity-40">
                              {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Planilha
                            </button>
                            {/* ⚠ a baixa é do PORTAL, não do Syneco — o rótulo diz o setor para ninguém
                                baixar na aba errada achando que baixou na fábrica inteira. */}
                            {/* ⚠⚠ AÇÃO QUE DEPENDE DE SELEÇÃO SÓ APARECE COM SELEÇÃO. Vitor
                                (01/09/2026): "está um pouco confuso". Eram cinco botões lado a
                                lado, três deles apagados — e botão cinza não ensina o que fazer,
                                só ocupa espaço e faz a pessoa clicar para descobrir que não dá.
                                Sem peça marcada a barra fica com o que funciona sempre (Separação e
                                Planilha); marcou, aparecem as ações do lote. */}
                            {sel.size > 0 && setorAba && (
                            <button onClick={darBaixa} disabled={baixando}
                              title={sel.size ? `Marca como feita na ${SETOR_LABEL[setorAba] || setorAba} — registro do portal, não escreve no Syneco` : "Selecione as peças"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                              {baixando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              Baixa manual{setorAba ? ` · ${SETOR_LABEL[setorAba] || setorAba}` : ""}
                            </button>
                            )}
                            {/* ⚠ é a fila da produção: as peças sobem para o topo da aba do setor
                                em /producao/prioridades e CONTINUAM aqui, só com a marcação nova. */}
                            {sel.size > 0 && (
                            <button onClick={mandarParaProducao} disabled={mandando}
                              title={sel.size ? `Põe ${sel.size} peça(s) na fila da ${SETOR_LABEL[setorAba] || setorAba} no Painel de Produção` : "Selecione as peças"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-torg-blue text-white hover:opacity-90 disabled:opacity-40">
                              {mandando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                              Mandar p/ produção
                            </button>
                            )}
                            {marcasSel.length > 0 && (
                            <button onClick={imprimirELiberar} disabled={imprimindo}
                              title={marcasSel.length ? `Imprime o desenho carimbado e registra a GRD de ${marcasSel.length} marca(s)` : "Selecione as peças"}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-torg-orange text-white hover:opacity-90 disabled:opacity-40">
                              {imprimindo ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                              Imprimir e liberar
                            </button>
                            )}
                            {sel.size === 0 && (
                              <span className="text-[11px] text-torg-gray-light">marque peças para liberar, dar baixa ou mandar p/ produção</span>
                            )}
                          </div>
                        </div>

                        {/* ⚠⚠ `table-fixed` COM LARGURA EM %, e não `overflow-x-auto`.
                            Vitor (24/08/2026): "precisamos que você deixe a tela completa sem haver a
                            necessidade de ficarmos andando para o lado". Rolagem lateral numa tabela
                            de trabalho esconde justamente as colunas da direita — material e liberado —,
                            que são as que dizem se a peça pode descer. Com largura automática, um perfil
                            comprido ("TBØ42.40X2.65 - INDUSTRIAL") empurrava tudo; fixa, ele corta e o
                            resto fica no lugar. O nome inteiro segue na dica. */}
                        {/* ⚠⚠ O PAINEL DAS BANCADAS FICA AQUI, ENTRE A SELEÇÃO E A LISTA — é a
                            ordem do trabalho: marca os conjuntos, vê como se reparte, libera.
                            Vitor (01/09/2026): "onde eu vou para selecionar as bancadas? está
                            confuso demais o passo a passo". */}
                        {setorAba === "MONTAGEM" && sel.size > 0 && (
                          <div className="px-3 pb-3">
                            <PainelBancadas
                              conjuntos={pecas.filter((p) => sel.has(p.id)).map((p) => ({ ...p, opNumero: detalhe.opNumero }))}
                              onLiberar={liberarEmBancadas}
                              ocupado={imprimindo}
                            />
                          </div>
                        )}
                        <table className="w-full table-fixed text-[12px]">
                            <thead className="bg-gray-50 text-torg-gray">
                              <tr>
                                <th className="px-2 py-2 w-9">
                                  <input type="checkbox" checked={pecas.length > 0 && pecas.every((p) => sel.has(p.id))}
                                    onChange={() => marcarTodas(pecas)} className="accent-torg-orange" />
                                </th>
                                <ThFiltro col="marca" label="Marca" larg="w-[17%]" className="px-2 py-2 text-left font-bold" {...fp} />
                                <ThFiltro col="perfil" label="Descrição" larg="w-[12%]" className="px-2 py-2 text-left font-bold" {...fp} />
                                <th className="px-2 py-2 text-right font-bold w-[10%]"
                                  title="Quantidade já feita neste setor sobre a quantidade da peça. O feito é o apontamento do Syneco ou a baixa do portal, o que for maior.">
                                  Feito / Qtd
                                </th>
                                <th className="px-2 py-2 text-right font-bold w-[10%]">Peso</th>
                                <ThFiltro col="programacao" label="Programação" larg="w-[14%]" className="px-2 py-2 text-left font-bold" {...fp} />
                                <ThFiltro col="situacao" label="Situação" larg="w-[15%]" dica="Não iniciado → em produção → finalizado. Finalizado é o que o Syneco fechou ou o que recebeu baixa no portal." className="px-2 py-2 text-left font-bold" {...fp} />
                                {/* ⚠⚠ O R É DO CROQUI, NÃO DO CONJUNTO. Vitor (01/09/2026): "na aba
                                    de conjuntos para montagem, solda, jato e acabamento e pintura
                                    não precisamos informar o R". O conjunto é a soma de croquis de
                                    materiais diferentes — a coluna só sabia dizer "sem R" em todas
                                    as linhas, que é ruído com cara de pendência. */}
                                {mostraMaterial && (
                                  <ThFiltro col="material" label="Material" larg="w-[11%]" className="px-2 py-2 text-left font-bold" {...fp} />
                                )}
                                <ThFiltro col="grd" label="Liberado (GRD)" larg="w-[11%]" dica="Data em que o desenho foi impresso pelo portal e a GRD registrada — é o que prova que a peça desceu para a fábrica." className="px-2 py-2 text-left font-bold" {...fp} />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {pecas.map((p) => {
                                const prog = PROG[p.programacao?.situacao] || PROG.NAO_LANCADA;
                                const sit = SIT[situacaoDaPeca(p)];
                                const pronto = sit === SIT.FINALIZADO || sit === SIT.EXPEDIDA;
                                return (
                                  /* ⚠ a faixa de cor na borda esquerda é o que se lê ROLANDO a lista: chip
                                     exige parar e ler, faixa não. Linha pronta fica esmaecida — o que
                                     interessa numa lista de trabalho é o que ainda falta. */
                                  <tr key={p.id}
                                    className={`border-l-4 ${sit.barra} ${sel.has(p.id) ? "bg-torg-blue-50/40" : pronto ? "bg-emerald-50/20 text-torg-gray" : "hover:bg-gray-50/60"}`}>
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
                                      {/* ⚠ o número é a POSIÇÃO NA FILA da OP — é assim que a peça aparece
                                          ordenada no Painel de Produção, e é o que prova que ela foi
                                          mandada. Sem número, não foi. */}
                                      {/* ⚠ cortada sem passar pela liberação — Vitor (01/09/2026)
                                          pediu para trazer essas peças; trazê-las sem marcar faria
                                          o recorte do Planejamento perder o sentido. */}
                                      {p.foraDoLote && (
                                        <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold align-middle whitespace-nowrap"
                                          title="Não está no lote liberado pelo Planejamento — a fábrica já apontou produção nela.">
                                          fora do lote
                                        </span>
                                      )}
                                      {p.prioridade != null && (
                                        <span className="ml-1 text-[9px] font-bold text-torg-orange bg-torg-orange/10 rounded px-1 py-0.5 align-middle"
                                          title={`Na fila da produção, posição ${p.prioridade} desta OP`}>
                                          <Flag size={8} className="inline -mt-0.5" /> {p.prioridade}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 text-torg-gray truncate" title={p.descricao || ""}>{p.descricao || "—"}</td>
                                    {/* ⚠ Vitor (24/08/2026): "aqui era bom colocar a quantidade total x
                                        realizado". O total sozinho não dizia se a peça andou — e
                                        peça de 6 unidades com 5 feitas é bem diferente de 6 paradas. */}
                                    <td className="px-2 py-1.5 text-right tabular-nums"
                                      title={feitoDaPeca(p) > (Number(p.qte) || 0)
                                        ? `O Syneco aponta ${fmtN(feitoDaPeca(p))} e a lista tem ${fmtN(p.qte)}. Costuma ser peça relançada no Syneco ou quantidade errada na lista — vale conferir.`
                                        : `${fmtN(feitoDaPeca(p))} de ${fmtN(p.qte)} feita(s) neste setor.`}>
                                      {/* ⚠ feito ACIMA da quantidade não é "pronto", é divergência: sai em
                                          âmbar para não passar por conclusão. */}
                                      <span className={
                                        feitoDaPeca(p) > (Number(p.qte) || 0) ? "font-bold text-amber-600"
                                        : feitoDaPeca(p) >= (Number(p.qte) || 0) ? "font-bold text-emerald-700"
                                        : feitoDaPeca(p) > 0 ? "font-bold text-sky-700"
                                        : "text-torg-gray-light"}>
                                        {fmtN(feitoDaPeca(p))}
                                      </span>
                                      <span className="text-torg-gray-light">/{fmtN(p.qte)}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(p.pesoTotalKg)}</td>
                                    <td className="px-2 py-1.5 truncate">
                                      <span title={prog.dica} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${prog.cls}`}>{prog.txt}</span>
                                    </td>
                                    {/* ⚠ A SITUAÇÃO GANHA DO SETOR. O que o PCP pergunta olhando a linha é
                                        "isso está feito?", não "em que sala está" — o setor vira o
                                        complemento, e a rota do Syneco fica na dica. */}
                                    <td className="px-2 py-1.5 truncate"
                                      title={`${sit.dica}${p.produzidoSyneco != null ? ` Syneco: ${fmtN(p.produzidoSyneco)} de ${fmtN(p.qte)}.` : ""}${p.baixadoPortal ? ` Baixa no portal por ${p.baixadoPor || "—"}.` : ""}${p.programacao?.setores?.length ? ` Rota: ${p.programacao.setores.join(" · ")}.` : ""}`}>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${sit.cls}`}>{sit.txt}</span>
                                      {/* ⚠ MONTADO é informação da peça solta que virou conjunto — e em
                                          parte não é montado (ver /api/pcp/despacho). */}
                                      {p.montadoEm && (
                                        <span className="text-[10px] text-indigo-700 ml-1"
                                          title={`Entrou em ${p.montadoEm.montados} de ${p.montadoEm.total} conjunto(s): ${p.montadoEm.conjuntos.slice(0, 12).join(", ")}${p.montadoEm.conjuntos.length > 12 ? "…" : ""}`}>
                                          {p.montadoEm.montados >= p.montadoEm.total ? "montado" : `montado ${p.montadoEm.montados}/${p.montadoEm.total}`}
                                        </span>
                                      )}
                                    </td>
                                    {/* ⚠⚠ "SEM ENTRADA" AFIRMAVA O QUE O PORTAL NÃO SABE.
                                        O casamento peça↔material é por DESCRIÇÃO, e a Engenharia escreve
                                        o perfil de um jeito ("FRØ1/2\"") e o cadastro de outro ("BARRA
                                        REDONDA ACO CARBONO LAMINADA"). Não casar quer dizer duas coisas
                                        muito diferentes — material que não chegou, ou material que
                                        chegou e ninguém liga uma escrita à outra — e o chip escolhia a
                                        pior das duas, em âmbar, com triângulo de alerta, mandando gente
                                        procurar material que está no pátio.
                                        ⚠ Agora diz o que é FATO: esta peça não tem R. Em cinza, porque
                                        peça não cortada não tem R mesmo — é o estado normal, não um
                                        problema. E clica para abrir a rastreabilidade da OP, que é onde
                                        se descobre qual dos dois casos é. */}
                                    {mostraMaterial && (
                                    <td className="px-2 py-1.5 truncate">
                                      <button onClick={() => setRastro(detalhe.opNumero)}
                                        title={p.material?.recebido
                                          ? `Recebido em ${fmtDH(p.material.dataRecebimento)}${p.material.nf ? ` · NF ${p.material.nf}` : ""}${p.material.corrida ? ` · corrida ${p.material.corrida}` : ""}`
                                            + (p.material.deOutraOp ? ` · MATERIAL DE ESTOQUE: o fardo entrou pela OP ${p.material.deOutraOp}` : "")
                                            + (p.material.porTroca ? ` · R amarrado à mão${p.material.trocaPor ? ` por ${p.material.trocaPor}` : ""}` : "")
                                            + ". Clique para a rastreabilidade da OP."
                                          : "Nenhum R casado com este perfil no CMR desta OP. Pode ser material que ainda não chegou, ou descrição que não bate com o cadastro do Almoxarifado. Clique para conferir a rastreabilidade."}
                                        className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold inline-flex items-center gap-1 max-w-full hover:brightness-95 ${
                                          !p.material?.recebido ? "bg-gray-50 text-torg-gray border-gray-200"
                                            /* ⚠ estoque de outra obra em ÂMBAR, não no verde de
                                               "chegou para esta OP": são situações diferentes e a
                                               cor é o que se lê rolando a lista. */
                                            : p.material.deOutraOp ? "bg-amber-50 text-amber-700 border-amber-200"
                                            : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                        <Package size={9} className="shrink-0" />
                                        <span className="truncate">
                                          {p.material?.recebido ? (p.material.rastreio ? `R ${p.material.rastreio}` : "recebido") : "sem R"}
                                        </span>
                                      </button>
                                    </td>
                                    )}
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
                                <tr><td colSpan={mostraMaterial ? 9 : 8} className="px-3 py-8 text-center text-torg-gray">Nenhuma peça pendente neste setor.</td></tr>
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
      {rastro && <ModalRastreabilidade opNumero={rastro} onClose={() => setRastro(null)} />}
      {separacao && (
        <SeparacaoModal opId={separacao.opId} obra={separacao.obra} setor={separacao.setor}
          ids={separacao.ids} onClose={() => setSeparacao(null)} />
      )}
    </div>
  );
}

