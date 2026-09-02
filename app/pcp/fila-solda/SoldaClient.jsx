"use client";
// ─── PCP › SOLDA — a fila do que saiu da montagem ─────────────────────────────
// Vitor (01/09/2026): "depois que sair da montagem que foi dado o lançamento de concluído na
// montagem deve ficar uma fila para podermos selecionar o que será feito na solda em cada bancada".
//
// ⚠⚠ A BANCADA AQUI É SUGESTÃO, NÃO ORDEM — escolha do Vitor ("só registra a intenção"): quem manda
// na bancada é o líder no chão. Por isso a tela NÃO cobra aderência e não compara "planejado ×
// realizado" por bancada: transformar a anotação em cobrança seria mudar a regra sem avisar quem
// trabalha. O que a tela mostra do real é só o que o Syneco já apontou.
//
// ⚠ ENTRA NA FILA QUEM TERMINOU A MONTAGEM — pelo apontamento do Syneco, não por clique no portal.
// Conjunto com montagem pela metade não é fila de solda: é montagem em andamento.
import { useState, useMemo, useRef, useEffect } from "react";
import { Flame, Search, Loader2, AlertCircle, X, CheckCircle2, Download, ArrowRight } from "lucide-react";
import { fmtOP } from "@/lib/utils";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import PainelSolda from "./PainelSolda";
import { gerarFolhaSolda } from "@/lib/folha-solda";
import { BANCADAS, RITMO_META, ocupacaoDasBancadas } from "@/lib/solda-capacidade";

const fmtKg = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const isoHoje = () => new Date().toISOString().split("T")[0];
const fmtDiaLongo = (iso) => {
  if (!iso) return "sem data";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  const s = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${s} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

// ⚠ `valor` devolve TEXTO — é o que aparece na lista do funil e o que o filtro compara. Data crua
// (2026-09-03) ordena bem mas ninguém reconhece; o rótulo em português é o que a pessoa procura.
const COLUNAS = [
  { key: "marca", label: "Marca", valor: (c) => c.marca || "—" },
  { key: "descricao", label: "Descrição", valor: (c) => c.descricao || "—" },
  { key: "op", label: "OP", valor: (c) => fmtOP(c.opNumero) || "—" },
  { key: "bancada", label: "Bancada", valor: (c) => c.soldaBancada || "sem bancada" },
  { key: "dia", label: "Dia", valor: (c) => (c._dia ? fmtDiaLongo(c._dia) : "sem data") },
  { key: "situacao", label: "Situação", valor: (c) => (c.emSolda ? "soldando" : c.soldaBancada ? "programado" : "a programar") },
];

export default function SoldaClient({ conjuntosIniciais, montados = {}, soldados = {}, bancadas = [] }) {
  const [conjuntos, setConjuntos] = useState(conjuntosIniciais);
  const [sel, setSel] = useState(new Set());
  const [filtroOp, setFiltroOp] = useState("");
  const [filtroBancada, setFiltroBancada] = useState("");
  const [busca, setBusca] = useState("");
  const [novoDia, setNovoDia] = useState("");
  const [novaBancada, setNovaBancada] = useState("");
  const [repartindo, setRepartindo] = useState(false);
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const fila = useMemo(() => conjuntos
    .map((c) => {
      const q = Number(c.qte) || 1;
      const feitoMont = Number(montados[c.marca] || 0);
      const feitoSolda = Number(soldados[c.marca] || 0);
      // ⚠⚠ O QUE FALTA SOLDAR, não o conjunto inteiro. Vitor (01/09/2026): "no cálculo do dia você
      // não está considerando as quantidades parciais". A marca 71811869 da OP-103 tem 4 peças com
      // 3 já soldadas; contada cheia, ela sozinha inflava o prazo em quase um dia-bancada e a folha
      // mandava o soldador refazer peça pronta.
      const qtePendente = Math.max(0, q - feitoSolda);
      return { ...c, montado: feitoMont >= q, soldado: feitoSolda >= q, emSolda: feitoSolda > 0 && feitoSolda < q,
               feitoSolda, q, qtePendente,
               // peso do que falta: peso por peça (do total cheio) × pendente
               pesoPendenteKg: ((Number(c.pesoTotalKg) || 0) / q) * qtePendente };
    })
    // saiu da montagem e ainda não fechou a solda
    .filter((c) => c.montado && !c.soldado),
    [conjuntos, montados, soldados]);

  // ⚠⚠ A LISTA PADRÃO É O QUE FALTA PROGRAMAR. Vitor (01/09/2026): "quando programarmos as peças
  // das OPs na sua totalidade, precisamos que você tire elas da lista, pois fica confuso — só
  // deixe o seletor para obras que estiverem sem programação de fato".
  //
  // A obra inteira programada continuava ocupando a tela como se pedisse decisão, e o seletor
  // oferecia obras que não tinham mais nada a decidir. O que já foi programado não some do portal:
  // ele passa a viver nos chips das bancadas, que é onde a pergunta deixa de ser "o que falta
  // programar" e vira "o que a máquina vai fazer".
  const aProgramar = useMemo(() => fila.filter((c) => !c.soldaBancada), [fila]);
  // ⚠ o seletor lista só obra com pendência REAL — a não ser que você esteja olhando uma bancada,
  // quando o assunto passa a ser o que está lá dentro.
  const ops = useMemo(() => {
    const base = !filtroBancada ? aProgramar
      : filtroBancada === "__sem" ? fila.filter((c) => !c.soldaBancada)
      : filtroBancada === "__prog" ? fila.filter((c) => c.soldaBancada)
      : fila.filter((c) => c.soldaBancada === filtroBancada);
    return [...new Set(base.map((c) => c.opNumero).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true }));
  }, [fila, aProgramar, filtroBancada]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    // sem bancada escolhida, a lista é só o que falta programar
    const base = filtroBancada ? fila : aProgramar;
    return base.filter((c) => {
      if (filtroOp && c.opNumero !== filtroOp) return false;
      if (filtroBancada === "__sem") { if (c.soldaBancada) return false; }
      // ⚠⚠ "PROGRAMADO" É O CAMINHO DE VOLTA. Vitor (01/09/2026): "eu programei a 102A e não
      // consigo mais encontrar ela para desfazer". Tirar o programado da lista (pedido dele) deixou
      // como única porta de volta adivinhar em QUAL bancada a obra caiu — e ninguém guarda isso. Ele
      // pensa em OBRA; a bancada é consequência.
      else if (filtroBancada === "__prog") { if (!c.soldaBancada) return false; }
      else if (filtroBancada && c.soldaBancada !== filtroBancada) return false;
      if (!q) return true;
      return [c.marca, c.descricao, c.op?.cliente, c.op?.obra].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [fila, aProgramar, filtroOp, filtroBancada, busca]);

  // ⚠⚠ AGRUPA POR BANCADA **E POR DIA**. Vitor (01/09/2026): "preciso ver onde vejo a programação
  // do que selecionei para soldar, para podermos alterar datas, acompanhar, dar baixa manual".
  // Só por bancada, a tela dizia ONDE mas não QUANDO — e a data que ele acabou de programar não
  // aparecia em lugar nenhum. Agora cada bancada abre em dias, e o dia que já passou sem a solda
  // fechar aparece em vermelho: começar não é entregar.
  const hojeIso = isoHoje();

  // ⚠⚠ UM EIXO POR VEZ. Vitor (01/09/2026): "ainda assim está bem difícil a visualização das datas
  // da maneira que está, precisa ficar mais claro a carga de cada máquina e quando".
  //
  // Antes a lista aninhava BANCADA → DIA sempre, e com seis bancadas abertas ao mesmo tempo a data
  // virava a terceira informação de cada bloco — ninguém achava. Agora o eixo é o contexto:
  //   • sem bancada escolhida, a pergunta é "o que falta programar" → agrupa por OBRA;
  //   • com uma bancada escolhida, a pergunta é "o que essa máquina faz e quando" → agrupa por DIA,
  //     e o dia é o título grande do bloco, não uma linha secundária.
  // ⚠ por DIA só quando se olha UMA bancada. Em "programado" o assunto é a obra — agrupar por dia
  // ali espalharia a 102A por vários blocos e o problema voltaria com outra roupa.
  // ⚠⚠ TABELA COM FILTRO DE COLUNA, NÃO BLOCOS AGRUPADOS. Vitor (01/09/2026): "acho que vou querer
  // as informações em forma de lista e filtro de excel igual fizemos em outras do portal, pois está
  // terrível".
  //
  // Eu vinha empilhando eixos: agrupava por bancada, depois por dia, depois por obra conforme o
  // contexto — e cada troca de agrupamento era uma regra nova que só eu sabia. Com a coluna
  // filtrável, BANCADA e DIA viram apenas mais duas colunas: quem quer ver a SOLDA 4 de quinta
  // filtra as duas, e não precisa aprender agrupamento nenhum. É o mesmo padrão do PCP e da
  // Expedição (components/FiltroColuna), que ele já usa todo dia.
  const linhas = useMemo(() => filtrados.map((c) => ({
    ...c,
    _dia: c.soldaDiaProgramado ? String(c.soldaDiaProgramado).slice(0, 10) : "",
    _atrasado: !!c.soldaDiaProgramado && String(c.soldaDiaProgramado).slice(0, 10) < hojeIso,
  })), [filtrados, hojeIso]);

  const { filtradas: visiveis, filtros: filtroCol, setFiltros: setFiltroCol, opcoesDaColuna, limpar: limparCols, ativos: colsAtivas } =
    useFiltroColunas(linhas, COLUNAS);
  const [colAberta, setColAberta] = useState(null);
  const fp = { filtros: filtroCol, setFiltros: setFiltroCol, opcoesDaColuna, aberta: colAberta, setAberta: setColAberta };

  // ⚠ conta na FILA INTEIRA, não no filtrado: o chip "sem bancada" vive na faixa de cima, que
  // resume a fila toda. Contando o filtrado, ele mostraria 0 assim que você clicasse numa bancada —
  // e o número sumiria justamente quando serve para voltar.
  const semBancada = useMemo(() => fila.filter((c) => !c.soldaBancada).length, [fila]);
  // ⚠ soma o peso do QUE FALTA soldar, não o do conjunto cheio
  const somaKg = (arr) => arr.reduce((s, c) => s + (c.pesoPendenteKg != null ? Number(c.pesoPendenteKg) || 0 : Number(c.pesoTotalKg) || 0), 0);
  // ⚠⚠ A SELEÇÃO SAI DA FILA INTEIRA, NÃO DO FILTRO. Vitor (01/09/2026): "quero poder selecionar
  // peças de OPs diferentes para colocar em bancadas diferentes".
  //
  // Saía de `filtrados`: quem filtrasse a OP-067, marcasse 12, trocasse o filtro para a OP-103 e
  // marcasse mais 8, mandaria só 8 para o painel — as 12 primeiras sumiam em silêncio, porque
  // deixaram de passar no filtro. E o cabeçalho piorava a armadilha, contando 20 no número e só 8
  // no peso. O filtro serve para ACHAR a peça; o que está marcado é marcado.
  const selecao = useMemo(() => fila.filter((c) => sel.has(c.id)), [fila, sel]);
  // quantas das marcadas o filtro atual esconde — precisa aparecer, senão a pessoa não entende o total
  const ocultasNaSelecao = useMemo(
    () => selecao.length - filtrados.filter((c) => sel.has(c.id)).length, [selecao, filtrados, sel]);
  const opsNaSelecao = useMemo(() => [...new Set(selecao.map((c) => c.opNumero).filter(Boolean))], [selecao]);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ⚠⚠ EMITE DO QUE JÁ ESTÁ GRAVADO, sem depender de seleção. Vitor (01/09/2026): "fiz uma e não
  // consegui emitir a planilha" — ele gravou 11 conjuntos na SOLDA 1, a seleção foi limpa, o painel
  // sumiu e a folha foi junto. Agora a planilha do que está nas bancadas sai a qualquer momento.
  const comBancada = useMemo(() => fila.filter((c) => c.soldaBancada), [fila]);
  const ocupadasHoje = useMemo(() => ocupacaoDasBancadas(comBancada, isoHoje(), RITMO_META), [comBancada]);

  // ⚠⚠ A TRAVA VALE PARA MOVER TAMBÉM. Vitor (01/09/2026): "precisa ter uma trava e não deixar
  // colocar a bancada a data em que ela estiver em uso". Eu tinha deixado o mover livre argumentando
  // que fato consumado não se discute com algoritmo — mas sem trava duas cargas caem na mesma
  // bancada no mesmo dia e o plano vira ficção, que é pior que a rigidez.
  //
  // O dia que interessa é o da SELEÇÃO (o mais cedo dela; sem data, hoje): mover para uma bancada
  // ocupada ATÉ DEPOIS desse dia é o que cria a sobreposição. Bancada que vaga antes é livre.
  //
  // ⚠ A própria bancada de origem nunca trava: mover de volta para onde já está não acrescenta
  // carga nenhuma.
  const diaAlvo = useMemo(() => {
    const dias = selecao.map((c) => (c.soldaDiaProgramado ? String(c.soldaDiaProgramado).slice(0, 10) : null)).filter(Boolean);
    return dias.length ? dias.sort()[0] : isoHoje();
  }, [selecao]);
  const bancadasDaSelecao = useMemo(() => new Set(selecao.map((c) => c.soldaBancada).filter(Boolean)), [selecao]);
  const travada = (b) => {
    if (bancadasDaSelecao.has(b)) return null;
    const o = ocupadasHoje[b];
    return o && o.livreEm > diaAlvo ? o : null;
  };
  async function planilhaDasBancadas() {
    setAgindo(true); setErro("");
    try {
      const nomes = [...new Set(comBancada.map((c) => c.soldaBancada))].sort();
      await gerarFolhaSolda(nomes.map((b) => ({ bancada: b, itens: comBancada.filter((c) => c.soldaBancada === b) })), {
        subtitulo: `${[...new Set(comBancada.map((c) => c.opNumero).filter(Boolean))].map((o) => `OP ${o}`).join(", ")} · o que está nas bancadas`,
      });
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }
  const marcarLista = (lista) => {
    const ids = lista.map((c) => c.id);
    const todas = ids.length > 0 && ids.every((id) => sel.has(id));
    setSel((p) => { const n = new Set(p); ids.forEach((id) => (todas ? n.delete(id) : n.add(id))); return n; });
  };

  async function definir(bancada) {
    setAgindo(true); setErro(""); setOkMsg("");
    const ids = [...sel];
    try {
      const r = await fetch("/api/pcp/solda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, bancada }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao gravar a bancada");
      const set = new Set(ids);
      setConjuntos((prev) => prev.map((c) => (set.has(c.id) ? { ...c, soldaBancada: bancada, soldaBancadaEm: new Date().toISOString() } : c)));
      setOkMsg(bancada ? `${j.atualizados} conjunto(s) sugerido(s) para ${bancada}.` : `${j.atualizados} conjunto(s) sem bancada.`);
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  // ⚠ O PAINEL DEVOLVE A REPARTIÇÃO INTEIRA — uma chamada por bancada, não uma por conjunto. Com 95
  // marcas em 6 bancadas seriam 95 requisições; assim são 6.

  // ⚠ BAIXA DO PORTAL, NÃO DO SYNECO. Registra que a solda terminou aqui dentro; o apontamento da
  // fábrica continua sendo a fonte. Serve para a peça que a fábrica soldou e não lançou — sem isso
  // ela fica na fila para sempre e o PCP reprograma o que já está pronto.
  async function baixaManual() {
    const alvo = selecao.filter((c) => c.qtePendente > 0);
    if (!alvo.length) return;
    if (!confirm(`Marcar ${alvo.length} conjunto(s) como soldados?\n\nÉ registro do portal — não escreve no Syneco.`)) return;
    setAgindo(true); setErro(""); setOkMsg("");
    try {
      const r = await fetch("/api/pcp/despacho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baixaSetor: "SOLDA", baixas: alvo.map((c) => ({ id: c.id, qtd: c.qtePendente })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao dar baixa");
      setOkMsg(`${j.atualizados ?? alvo.length} conjunto(s) marcados como soldados. Recarregue para sumirem da fila.`);
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  // ⚠⚠ MUDAR A BANCADA DEPOIS. Vitor (01/09/2026): "também preciso da opção de poder mudar a
  // bancada em caso de mudança".
  //
  // ⚠ NÃO É a volta do seletor que ele mandou tirar. Aquele escolhia a bancada NA HORA DE REPARTIR,
  // e furava o painel — que conhece o custo de cada peça e pula a ocupada. Este MOVE o que já foi
  // repartido, quando a realidade muda: soldador faltou, a máquina quebrou, o líder trocou. Repartir
  // é conta; mover é fato consumado, e fato consumado não se discute com algoritmo.
  //
  // ⚠ MANTÉM O DIA. A rota aceita `bancada` sem `dia` justamente para isso: quem troca de máquina
  // raramente quer trocar a data junto, e mandar as duas juntas apagaria a programação sem pedir.
  // ⚠⚠ UM SÓ "MOVER", com bancada e dia opcionais. Eram duas funções e dois botões, e a tela
  // sugeria que fossem alternativas excludentes — daí o "parece que um anula o outro". A rota
  // sempre aceitou cada campo sozinho (`bancada` sem `dia` e vice-versa); quem contava a história
  // errada era a tela.
  //
  // ⚠ O QUE NÃO FOI PREENCHIDO NÃO VAI NO CORPO — mandar `null` apagaria o valor em vez de mantê-lo.
  async function mover() {
    if ((!novaBancada && !novoDia) || !selecao.length) return;
    if (novaBancada) {
      const t = travada(novaBancada);
      if (t) { setErro(`${novaBancada} está ocupada até ${fmtDiaLongo(t.livreEm)} — mude o dia antes, ou escolha outra.`); return; }
    }
    setAgindo(true); setErro(""); setOkMsg("");
    try {
      const ids = selecao.map((c) => c.id);
      const r = await fetch("/api/pcp/solda", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...(novaBancada ? { bancada: novaBancada } : {}), ...(novoDia ? { dia: novoDia } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao mover");
      const set = new Set(ids);
      setConjuntos((prev) => prev.map((c) => (set.has(c.id) ? {
        ...c,
        ...(novaBancada ? { soldaBancada: novaBancada, soldaBancadaEm: new Date().toISOString() } : {}),
        ...(novoDia ? { soldaDiaProgramado: novoDia } : {}),
      } : c)));
      const oq = [novaBancada && `para ${novaBancada}`, novoDia && `para ${novoDia.split("-").reverse().join("/")}`].filter(Boolean).join(" e ");
      setOkMsg(`${j.atualizados} conjunto(s) movidos ${oq}.`);
      setSel(new Set()); setNovaBancada(""); setNovoDia("");
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  async function sugerirEmLote(distrib) {
    setAgindo(true); setErro(""); setOkMsg("");
    try {
      let total = 0; const usadas = new Set();
      // ⚠⚠ UMA CHAMADA POR (BANCADA, DIA), não por bancada. Cada conjunto tem o SEU dia dentro da
      // bancada — a repartição espalha por dias úteis. Gravando só o primeiro dia para a bancada
      // inteira, uma peça marcada para quinta apareceria como se fosse de terça, e a ocupação
      // (que lê esse dia) diria que a bancada vaga antes da hora.
      for (const b of distrib) {
        for (const d of b.dias || []) {
          const ids = d.itens.map((c) => c.id);
          if (!ids.length) continue;
          const r = await fetch("/api/pcp/solda", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, bancada: b.bancada, dia: d.dia }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || `Erro ao gravar ${b.bancada}`);
          total += j.atualizados ?? ids.length; usadas.add(b.bancada);
          const set = new Set(ids);
          setConjuntos((prev) => prev.map((c) => (set.has(c.id)
            ? { ...c, soldaBancada: b.bancada, soldaBancadaEm: new Date().toISOString(), soldaDiaProgramado: d.dia } : c)));
        }
      }
      // ⚠ a mensagem DIZ ONDE FOI PARAR. Sem isso, o conjunto some da lista (que só mostra o que
      // falta programar) e a pessoa fica sem saber para onde olhar — foi o que aconteceu com a 102A.
      setOkMsg(`${total} conjunto(s) repartidos entre ${usadas} bancada(s). Para ver ou desfazer, clique em "programado" acima.`);
      setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setAgindo(false); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-torg-dark flex items-center gap-2">
          <Flame size={20} className="text-torg-blue" /> Solda — fila da montagem
        </h1>
        <p className="text-xs text-torg-gray mt-1 max-w-3xl">
          Conjuntos com a <strong>montagem concluída</strong> (baixa do Syneco) e a solda ainda aberta. A bancada aqui é
          <strong> sugestão para o líder</strong> — o que valeu de verdade continua vindo do apontamento.
        </p>
      </div>

      {/* ⚠⚠ AS BANCADAS LIVRES APARECEM. Vitor (01/09/2026): "e também mostrar as bancadas livres
          ainda". Sem isso, saber o que sobra exigia comparar de cabeça as seis com as que aparecem
          na lista — e o painel de repartição, que é quem escolhe, só existe depois da seleção. */}
      {/* ⚠⚠ OS CHIPS SÃO O FILTRO. Vitor (01/09/2026): "acredito ser melhor poder clicar nesses
          botões e você já trazer as peças destinadas para cada máquina, e ajuste para que fiquem
          melhor alinhados. Não é necessário essas informações" (os três cartões de número).
          Os cartões diziam totais que a própria lista já mostra; os chips dizem o mesmo E levam
          para o lugar. Clicar num filtra a lista para aquela bancada — clicar de novo desfaz.
          ⚠ GRADE, não flex-wrap: com larguras livres os chips quebravam desalinhados e o botão da
          planilha caía sozinho na segunda linha, longe do assunto. */}
      <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm space-y-2">
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <Flame size={14} className="text-torg-blue shrink-0" />
          <span className="text-torg-dark"><b>{comBancada.length}</b> conjunto(s) nas bancadas</span>
          <span className="text-torg-gray">· <b>{semBancada}</b> ainda sem bancada</span>
          {filtroBancada && (
            <button onClick={() => setFiltroBancada("")} className="text-torg-blue underline font-semibold">ver todas</button>
          )}
          <button onClick={planilhaDasBancadas} disabled={agindo || !comBancada.length}
            className="ml-auto px-2.5 py-1.5 rounded-lg border border-torg-blue-200 text-torg-blue font-semibold hover:bg-torg-blue-50 inline-flex items-center gap-1.5 disabled:opacity-50">
            {agindo ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Planilha das bancadas
          </button>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>
          {BANCADAS.map((b) => {
            const o = ocupadasHoje[b];
            const ativo = filtroBancada === b;
            return (
              <button key={b} onClick={() => setFiltroBancada(ativo ? "" : b)}
                title={o ? `${o.conj} conjunto(s) · ${Math.round(o.kg).toLocaleString("pt-BR")} kg · vaga ${fmtDiaLongo(o.livreEm)}` : "sem nada programado"}
                className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                  ativo ? "border-torg-blue bg-torg-blue text-white"
                    : o ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                <span className="block text-[11px] font-bold uppercase tracking-wide truncate">{b}</span>
                <span className={`block text-[10px] truncate ${ativo ? "opacity-90" : "opacity-80"}`}>
                  {o ? `${o.conj} conj · até ${fmtDiaLongo(o.livreEm)}` : "livre"}
                </span>
              </button>
            );
          })}
          {/* ⚠ o chip que devolve o que foi programado — a porta de volta que faltava */}
          <button onClick={() => setFiltroBancada(filtroBancada === "__prog" ? "" : "__prog")}
            title="Tudo que já tem bancada, agrupado por obra — é por aqui que se desfaz"
            className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
              filtroBancada === "__prog" ? "border-torg-blue bg-torg-blue text-white"
                : "border-torg-blue-200 bg-torg-blue-50 text-torg-blue hover:bg-torg-blue-100"}`}>
            <span className="block text-[11px] font-bold uppercase tracking-wide truncate">programado</span>
            <span className="block text-[10px] truncate opacity-80">{comBancada.length} conj · todas as bancadas</span>
          </button>
          <button onClick={() => setFiltroBancada(filtroBancada === "__sem" ? "" : "__sem")}
            title="Conjuntos que ainda não foram para nenhuma bancada"
            className={`px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
              filtroBancada === "__sem" ? "border-torg-blue bg-torg-blue text-white"
                : semBancada > 0 ? "border-gray-200 bg-gray-50 text-torg-gray hover:bg-gray-100"
                : "border-gray-100 bg-white text-torg-gray-light"}`}>
            <span className="block text-[11px] font-bold uppercase tracking-wide truncate">sem bancada</span>
            <span className="block text-[10px] truncate opacity-80">{semBancada} conj</span>
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2"><AlertCircle size={14} /> {erro}</div>}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">{okMsg}</div>}


      <div className="flex items-center gap-2 flex-wrap">
        <select value={filtroOp} onChange={(e) => setFiltroOp(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">Todas as obras</option>
          {ops.map((o) => <option key={o} value={o}>{fmtOP(o)}</option>)}
        </select>
        <select value={filtroBancada} onChange={(e) => setFiltroBancada(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="">Todas as bancadas</option>
          <option value="__sem">Sem bancada sugerida</option>
          {bancadas.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, cliente, obra…"
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-64" />
        </div>
        {/* ⚠ filtro de coluna ligado precisa de saída visível: no Excel a pessoa procura o funil
            azul coluna a coluna, e aqui a tabela pode estar rolada longe do cabeçalho. */}
        {colsAtivas > 0 && (
          <button onClick={limparCols} className="text-[12px] text-torg-blue underline font-semibold">
            limpar {colsAtivas} filtro(s) de coluna
          </button>
        )}
        <span className="ml-auto text-[12px] text-torg-gray tabular-nums">
          {visiveis.length} de {fila.length} na fila
        </span>
      </div>

      {sel.size > 0 && (
        <div className="bg-torg-blue-50/60 border border-torg-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-torg-dark">{selecao.length} conjunto(s) · {fmtKg(somaKg(selecao))}</span>
          {opsNaSelecao.length > 1 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-torg-blue-200 text-torg-blue font-semibold">
              {opsNaSelecao.length} OPs: {opsNaSelecao.map((o) => fmtOP(o)).join(", ")}
            </span>
          )}
          {ocultasNaSelecao > 0 && (
            <span title="Estão marcadas, mas o filtro atual não mostra. Continuam valendo."
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
              {ocultasNaSelecao} fora do filtro
            </span>
          )}
          {/* ⚠⚠ UM "MOVER" SÓ, COM DOIS CAMPOS — NÃO DOIS BOTÕES. Vitor (01/09/2026): "esse mover
              entre bancadas está terrível, confuso pra caramba, vários botões que parece que um
              anula o outro".
              Ele tinha razão e o defeito era meu: "Mudar a bancada" e "Mudar a data" pareciam
              alternativas excludentes, quando são o MESMO ato com dois campos. Agora é um bloco
              rotulado "mover para", com bancada e dia; preenche o que quer mudar e aplica. O que
              ficar vazio não é tocado — e a rota já aceitava cada campo sozinho, era só a tela que
              contava a história errada. */}
          {/* ⚠⚠ REPARTIR É UM PASSO, NÃO UM PAINEL QUE BROTA. Vitor (01/09/2026): "precisamos
              colocar ele em outro local, pois quando clicarmos ele aparecer me parece um pouco
              estranho". O painel nascia embaixo da barra assim que havia seleção — empurrava a
              tabela para baixo e a página pulava debaixo do cursor. Agora é um botão: marca,
              clica, o painel abre por cima. O fluxo fica marca → reparte → libera, cada passo com
              o seu clique. */}
          <button onClick={() => setRepartindo(true)}
            className="px-3 py-1.5 bg-torg-orange text-white text-xs font-semibold rounded-lg hover:opacity-90 inline-flex items-center gap-1">
            <Flame size={13} /> Repartir entre bancadas
          </button>

          <span className="ml-2 pl-3 border-l border-torg-blue-200 text-[11px] font-semibold text-torg-gray">mover para</span>
          <select value={novaBancada} onChange={(e) => setNovaBancada(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="">— manter a bancada —</option>
            {BANCADAS.map((b) => {
              const t = travada(b);
              return (
                <option key={b} value={b} disabled={!!t}>
                  {b}{t ? ` — ocupada até ${fmtDiaLongo(t.livreEm)}` : ocupadasHoje[b] ? ` (${ocupadasHoje[b].conj} conj)` : " (livre)"}
                </option>
              );
            })}
          </select>
          <input type="date" value={novoDia} onChange={(e) => setNovoDia(e.target.value)}
            title="Deixe vazio para manter o dia" placeholder="manter o dia"
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white" />
          <button onClick={mover} disabled={agindo || (!novaBancada && !novoDia)}
            title={!novaBancada && !novoDia ? "Escolha a bancada, o dia, ou os dois" : `Aplica em ${selecao.length} conjunto(s)`}
            className="px-3 py-1.5 bg-torg-blue text-white text-xs font-semibold rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-1 disabled:opacity-40">
            {agindo ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} Aplicar
          </button>

          <span className="ml-2 pl-3 border-l border-torg-blue-200" />
          <button onClick={baixaManual} disabled={agindo}
            title="Marca como soldado no portal — para a peça que a fábrica fez e não lançou no Syneco"
            className="px-3 py-1.5 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-50 disabled:opacity-50 inline-flex items-center gap-1">
            <CheckCircle2 size={13} /> Baixa manual
          </button>
          <button onClick={() => definir(null)} disabled={agindo}
            title="Tira a bancada E a data — o conjunto volta para a fila sem destino, como se nunca tivesse sido programado"
            className="px-3 py-1.5 border border-gray-200 text-torg-gray text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1">
            <X size={13} /> Tirar da programação
          </button>
          <button onClick={() => setSel(new Set())} className="ml-auto p-1.5 text-torg-gray hover:bg-white rounded-lg"><X size={14} /></button>
        </div>
      )}

      {/* ⚠ ABRE POR CIMA, não empurrando a tabela. `fixed` + fundo escurecido: o painel é uma
          decisão à parte, e sair dele devolve a lista exatamente onde estava. */}
      {repartindo && sel.size > 0 && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          onClick={() => setRepartindo(false)}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white font-semibold text-sm">Repartir {selecao.length} conjunto(s) entre as bancadas</p>
              <button onClick={() => setRepartindo(false)} className="text-white/80 hover:text-white p-1.5"><X size={18} /></button>
            </div>
            <PainelSolda conjuntos={selecao} filaCompleta={fila}
              onSugerir={async (d) => { await sugerirEmLote(d); setRepartindo(false); }} ocupado={agindo} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-[12px] table-fixed">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-9 px-2 py-2">
                  {/* ⚠ marcar TUDO QUE O FILTRO DEIXOU À VISTA — não a fila inteira. Marcar o que
                      não se vê é como a seleção some pelo caminho. */}
                  <CaixaGrupo lista={visiveis} sel={sel} onToggle={() => marcarLista(visiveis)} />
                </th>
                <ThFiltro col="marca" label="Marca" larg="w-[13%]" {...fp} />
                <ThFiltro col="descricao" label="Descrição" larg="w-[26%]" {...fp} />
                <ThFiltro col="op" label="OP" larg="w-[10%]" {...fp} />
                <th className="px-2 py-2 text-right w-[9%] font-semibold text-torg-gray">Falta</th>
                <th className="px-2 py-2 text-right w-[10%] font-semibold text-torg-gray">Peso</th>
                <ThFiltro col="bancada" label="Bancada" larg="w-[13%]" {...fp} />
                <ThFiltro col="dia" label="Dia" larg="w-[11%]" {...fp} />
                <ThFiltro col="situacao" label="Situação" larg="w-[12%]" {...fp} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visiveis.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-torg-gray italic">
                  {filtroBancada === "__prog" ? "Nada programado ainda."
                    : filtroBancada ? "Nada nesta bancada."
                    : "Nada a programar — tudo o que saiu da montagem já tem bancada."}
                </td></tr>
              )}
              {visiveis.map((c) => (
                <tr key={c.id} onClick={() => toggle(c.id)}
                  className={`cursor-pointer ${sel.has(c.id) ? "bg-torg-blue/5" : "hover:bg-gray-50/70"}`}>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-gray-300" />
                  </td>
                  <td className="px-2 py-1.5 font-mono font-bold text-torg-dark truncate" title={c.marca}>{c.marca}</td>
                  <td className="px-2 py-1.5 text-torg-gray truncate" title={c.descricao || ""}>{c.descricao || "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-torg-blue truncate">{fmtOP(c.opNumero)}</td>
                  {/* ⚠ "falta", não "qte": o que sobrou para soldar. O total só aparece quando é sobra. */}
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {c.qtePendente < c.q ? <span className="text-amber-700 font-semibold">{c.qtePendente} de {c.q}</span> : c.q}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtKg(c.pesoPendenteKg ?? c.pesoTotalKg)}</td>
                  <td className="px-2 py-1.5 truncate">
                    {c.soldaBancada
                      ? <span className="font-semibold text-torg-dark">{c.soldaBancada}</span>
                      : <span className="text-torg-gray-light">—</span>}
                  </td>
                  <td className={`px-2 py-1.5 whitespace-nowrap tabular-nums ${c._atrasado ? "text-red-700 font-semibold" : c._dia === hojeIso ? "text-amber-800 font-semibold" : "text-torg-gray"}`}>
                    {c._dia ? fmtDiaLongo(c._dia) : "—"}
                  </td>
                  <td className="px-2 py-1.5 truncate">
                    {c.emSolda ? <span className="text-torg-blue font-semibold">soldando {c.feitoSolda}/{c.q}</span>
                      : c.soldaBancada ? <span className="text-emerald-700">programado</span>
                      : <span className="text-torg-gray">a programar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ⚠ `indeterminate` não existe como prop no React — só como propriedade do nó. Sem ele, o bloco com
// parte das peças marcadas apareceria vazio, e clicar marcaria tudo sem avisar que já havia algo.
function CaixaGrupo({ lista, sel, onToggle }) {
  const ref = useRef(null);
  const marcadas = lista.filter((c) => sel.has(c.id)).length;
  const todas = marcadas === lista.length && lista.length > 0;
  useEffect(() => { if (ref.current) ref.current.indeterminate = marcadas > 0 && !todas; }, [marcadas, todas]);
  return (
    <input ref={ref} type="checkbox" checked={todas} onChange={onToggle}
      title={todas ? "Desmarcar o bloco" : "Marcar o bloco inteiro"}
      className="rounded border-gray-300 shrink-0 self-center cursor-pointer" />
  );
}
