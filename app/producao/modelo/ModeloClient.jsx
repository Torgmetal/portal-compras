"use client";
// ─── OBRA EM 3D: o modelo do Tekla como porta de entrada ──────────────────────
//
// Vitor (03/09/2026): "clicar na peça, dar o tipo do material, número do conjunto, quais croquis
// fazem parte daquele conjunto, rastreabilidade dos materiais, status de onde a peça está na
// fábrica (…) e na mesma página podermos selecionar a peça, caso seja o planejamento, poder
// definir prioridade em cima disso".
//
// ⚠⚠ O 3D NÃO GUARDA DADO NENHUM. Ele responde uma coisa só: QUAL peça. Todo o resto sai do
// portal, pela marca — é por isso que o clique precisava ser nosso, e não do visualizador de
// terceiro. Ver components/VisualizadorIfc.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Star, SlidersHorizontal, FileSpreadsheet, Search, Eye, EyeOff } from "lucide-react";
import VisualizadorIfc from "@/components/VisualizadorIfc";

// ⚠ as mesmas cores do visualizador (components/VisualizadorIfc), em hexa de CSS: a legenda tem de
// bater com a obra na tela, e duas listas separadas divergem no primeiro ajuste.
const COR_TIPO = {
  Pilar: "#2e7d5b", Viga: "#3d6fa5", Barra: "#8a6bb0", Chapa: "#c19a2b",
  "Guarda-corpo": "#c4682e", Escada: "#6d8496", Piso: "#a8b3bd", Parafuso: "#5b6b7a",
};

const COR = { pronta: "#0E7A5F", andando: "#B4761E", parado: "#9FB0BF" };
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

const ETAPAS = ["Corte", "Preparação", "Montagem", "Solda", "Jato", "Pintura", "Acabamento"];

export default function ModeloClient({ ops }) {
  const [opId, setOpId] = useState(ops?.[0]?.id || "");
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [modelo, setModelo] = useState(null);
  const [sel, setSel] = useState(null);          // item do índice do modelo (conjunto ou parafuso)
  const [peca, setPeca] = useState(null);
  const [carregandoPeca, setCarregandoPeca] = useState(false);
  // ⚠⚠ O QUE O MODELO TEM DENTRO. Vitor (03/09/2026): "se tivermos uma forma de trazer os níveis
  // ou áreas para que o cliente, caso esteja com dúvida de qual peça forma aquele nível (…)
  // conseguimos colocar para fazer um filtro?". O índice vem do próprio IFC — nível pela cota de
  // base, tipo pela entidade, parafuso pelo pset do Tekla — e é montado uma vez, ao abrir.
  const [indice, setIndice] = useState(null);
  // ⚠ modelo sem cor nenhuma no arquivo: o portal passa a pintar por tipo, e o botão precisa dizer
  // isso — senão "Cores do modelo" vira mentira na tela.
  const [semCor, setSemCor] = useState(false);
  const [niveis, setNiveis] = useState([]);           // faixas medidas na geometria (reserva)
  // ⚠⚠ O NÍVEL DA OBRA VEM DA ENGENHARIA. Vitor (03/09/2026) mandou o caminho: a pasta
  // "2.5.4 Montagem / Lista de Peças por Nível" já tem uma planilha por nível, com as marcas
  // dentro — "EL +3100 @ +3265", em milímetro, do jeito que se fala na montagem. Enquanto ela não
  // chega (ou quando a obra não tem), valem as faixas que o visualizador mede na geometria.
  const [niveisObra, setNiveisObra] = useState(null);
  const [fNiveis, setFNiveis] = useState(() => new Set());
  const [fTipos, setFTipos] = useState(() => new Set());
  // ⚠ setor de fabricação: onde a peça está AGORA, pelo apontamento do Syneco (vem na listagem
  // junto com o andamento). É o "clicar no setor e ver as peças" que o Vitor pediu.
  const [fSetores, setFSetores] = useState(() => new Set());
  const [busca, setBusca] = useState("");
  // ⚠ dois jeitos de tirar da frente: apagar (guarda a referência da obra) e ocultar (limpa a
  // vista). O primeiro é o padrão; o segundo é para quando a peça atrás é o que importa.
  const [esconderResto, setEsconderResto] = useState(false);
  const [ocultos, setOcultos] = useState(() => new Set());
  const [painel, setPainel] = useState(false);
  const [baixando, setBaixando] = useState(false);
  // ⚠⚠ DUAS LEITURAS DO MESMO MODELO, e as duas são necessárias. A cor DO MODELO é a que a
  // Engenharia deu no Tekla (viga azul, treliça amarela) — é como o pessoal reconhece a obra. A cor
  // do ANDAMENTO responde outra pergunta: o que já passou pela fábrica. Misturar as duas seria
  // perder as duas.
  const [modo, setModo] = useState("modelo");

  // ── modelos e andamento da obra ──
  useEffect(() => {
    if (!opId) return;
    let vivo = true;
    setLista(null); setErro(""); setModelo(null); setSel(null); setPeca(null);
    setIndice(null); setNiveis([]); setFNiveis(new Set()); setFTipos(new Set()); setSemCor(false);
    setFSetores(new Set()); setOcultos(new Set()); setBusca("");
    setNiveisObra(null);
    fetch(`/api/producao/modelo-3d/niveis?opId=${opId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setNiveisObra(j?.achou ? j : { achou: false, niveis: [] }))
      .catch(() => vivo && setNiveisObra({ achou: false, niveis: [] }));
    fetch(`/api/producao/modelo-3d?opId=${opId}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok) return setErro(j.error || "Erro ao buscar os modelos.");
        setLista(j);
        setModelo(j.modelos?.find((m) => !m.grande) || null);
      })
      .catch(() => vivo && setErro("Erro ao buscar os modelos."));
    return () => { vivo = false; };
  }, [opId]);

  // ⚠ cores por MARCA, montadas uma vez: o visualizador pinta a cena inteira de uma vez só.
  const cores = useMemo(() => {
    const e = lista?.estados || {};
    return Object.fromEntries(Object.entries(e).map(([m, st]) => [m, COR[st] || COR.parado]));
  }, [lista]);

  // ⚠ o visualizador entrega o índice pronto uma vez; guardar numa função estável evita remontar
  // a cena a cada render do pai (a dependência do efeito lá dentro é a URL, mas o React avisa).
  const receberIndice = useCallback(({ indice: ix, niveis: nv, semCor: sc }) => {
    setIndice(ix); setNiveis(nv); setSemCor(!!sc);
  }, []);

  // ⚠⚠ O FILTRO É UMA LISTA DE CHAVES, não um "esconde". Níveis e tipos se cruzam (o nível +4,20
  // E só as vigas), e vários níveis podem estar marcados ao mesmo tempo — foi o pedido: "posso
  // fazer uma seleção de várias áreas e você listar as peças?".
  // ⚠ marca casa por texto normalizado: a planilha escreve "T118B256" e o Tag do IFC também, mas
  // um espaço à toa de um lado quebraria o cruzamento inteiro sem dar sinal nenhum.
  const chaveMarca = (m) => String(m || "").toUpperCase().replace(/\s/g, "");

  const daObra = !!niveisObra?.achou && niveisObra.niveis?.length > 0;
  const niveisNaTela = useMemo(() => {
    if (!daObra) return niveis;
    return niveisObra.niveis.map((nv, i) => ({
      chave: `o${i}`, rotulo: nv.rotulo, marcas: new Set((nv.marcas || []).map(chaveMarca)), daObra: true,
    }));
  }, [daObra, niveisObra, niveis]);

  const setorDe = useCallback((x) => (x?.marca ? lista?.setores?.[x.marca] || null : null), [lista]);

  const setores = useMemo(() => {
    const c = new Map();
    for (const x of indice || []) {
      const s = setorDe(x);
      if (s) c.set(s, (c.get(s) || 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [indice, setorDe]);

  const selecionados = useMemo(() => {
    if (!indice) return null;
    if (!fNiveis.size && !fTipos.size) return null;
    // quando o nível é o da Engenharia, quem manda é a lista de marcas dele
    const alvo = daObra && fNiveis.size
      ? new Set(niveisNaTela.filter((nv) => fNiveis.has(nv.chave)).flatMap((nv) => [...nv.marcas]))
      : null;
    return indice.filter((x) =>
      (!fNiveis.size || (alvo ? x.marca && alvo.has(chaveMarca(x.marca)) : fNiveis.has(x.nivel)))
      && (!fTipos.size || fTipos.has(x.tipo))
      && (!fSetores.size || fSetores.has(setorDe(x))));
  }, [indice, fNiveis, fTipos, fSetores, daObra, niveisNaTela, lista]);

  // quantos itens do modelo cada nível pega — é o número que aparece na lista de marcação
  const contaNivel = useMemo(() => {
    const c = new Map();
    for (const nv of niveisNaTela) {
      c.set(nv.chave, nv.daObra
        ? (indice || []).filter((x) => x.marca && nv.marcas.has(chaveMarca(x.marca))).length
        : (indice || []).filter((x) => x.nivel === nv.chave).length);
    }
    return c;
  }, [niveisNaTela, indice]);
  const visiveis = useMemo(() => (selecionados ? new Set(selecionados.map((x) => x.id)) : null), [selecionados]);

  const tipos = useMemo(() => {
    const c = new Map();
    for (const x of indice || []) c.set(x.tipo, (c.get(x.tipo) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [indice]);

  // ⚠⚠ SEM BUSCA A LISTA NÃO SERVE numa obra grande: a 118 tem 3.032 conjuntos e a tela mostra os
  // 400 primeiros. Vitor: "se não vai mostrar todas as peças para poder clicar, deixe um campo para
  // podermos pesquisar a peça". Procura por marca, tipo ou especificação de parafuso.
  const listados = useMemo(() => {
    const base = selecionados || indice || [];
    const t = busca.trim().toUpperCase().replace(/\s+/g, " ");
    if (!t) return base;
    return base.filter((x) =>
      String(x.marca || "").toUpperCase().includes(t)
      || String(x.parafuso?.nome || "").toUpperCase().includes(t)
      || String(x.tipo || "").toUpperCase().includes(t));
  }, [selecionados, indice, busca]);

  const soma = useMemo(() => {
    const alvo = selecionados || indice || [];
    return {
      grupos: alvo.length,
      pecas: alvo.reduce((t, x) => t + (x.pecas || 0), 0),
      kg: alvo.reduce((t, x) => t + (x.pesoKg || 0), 0),
      parafusos: alvo.filter((x) => x.parafuso).reduce((t, x) => t + (x.pecas || 0), 0),
    };
  }, [selecionados, indice]);

  // ⚠⚠ MODELO SEM NUMERAÇÃO PRECISA AVISAR, e não fingir que está tudo certo. Quando o IFC sai do
  // Tekla antes de rodar a Numeração, a marca vem como "V0(?)" — prefixo, zero e a interrogação que
  // é o próprio Tekla dizendo "esta posição não está atribuída". Aconteceu no executivo da OP-089
  // (SEAZ10, 03/06): 148 conjuntos, nenhuma marca. Sem marca o clique não tem como puxar R, croqui
  // nem setor — e quem abre a tela precisa saber disso ANTES de concluir que o portal está cego.
  const semNumeracao = useMemo(() => {
    const conj = (indice || []).filter((x) => !x.parafuso);
    if (conj.length < 5) return null;
    const com = conj.filter((x) => x.marca).length;
    return com / conj.length < 0.2 ? { total: conj.length, com } : null;
  }, [indice]);

  const alternar = (setar, valor) => setar((antes) => {
    const novo = new Set(antes);
    if (novo.has(valor)) novo.delete(valor); else novo.add(valor);
    return novo;
  });

  // ── o dossiê da peça clicada ──
  const abrir = useCallback((item) => {
    setSel(item || null);
    const m = item?.marca;
    if (!m) return setPeca(null);
    setCarregandoPeca(true); setPeca(null);
    fetch(`/api/producao/peca?opId=${opId}&marca=${encodeURIComponent(m)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setPeca(ok ? j : { erro: j.error || "Não achei essa marca na lista." }))
      .catch(() => setPeca({ erro: "Erro ao buscar a peça." }))
      .finally(() => setCarregandoPeca(false));
  }, [opId]);

  const urlModelo = modelo ? `/api/producao/modelo-3d?opId=${opId}&rel=${encodeURIComponent(modelo.rel)}` : null;
  const op = ops.find((o) => o.id === opId);

  // ⚠⚠ A PLANILHA SAI DO QUE ESTÁ NA TELA. Vitor (03/09/2026): "posso tirar uma planilha dos itens
  // selecionados?". Sai no padrão das planilhas do portal (lib/excel-relatorio) — mesma capa, mesmo
  // rodapé ISO das outras. Sem filtro, exporta o modelo inteiro.
  //
  // ⚠ O PESO É O DO MODELO, e a coluna diz isso. Quem manda em kg de OP é a LPC (é dela que sai o
  // peso real); o do IFC é o que a Engenharia modelou. Misturar os dois numa coluna só chamada
  // "peso" seria criar um terceiro número que ninguém sabe de onde veio.
  async function exportar() {
    setBaixando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const alvo = (selecionados || indice || []).slice().sort((a, b) =>
        (a.tipo || "").localeCompare(b.tipo || "") || String(a.marca || a.parafuso?.nome).localeCompare(String(b.marca || b.parafuso?.nome)));
      const rotNivel = (k) => niveisNaTela.find((x) => x.chave === k)?.rotulo || "";
      const nivelDoItem = (x) => (daObra
        ? niveisNaTela.find((nv) => x.marca && nv.marcas.has(chaveMarca(x.marca)))?.rotulo || ""
        : rotNivel(x.nivel));
      const COLS = [
        { t: "Tipo", w: 14, v: (x) => x.tipo || "" },
        { t: "Marca / especificação", w: 30, v: (x) => x.marca || x.parafuso?.nome || "sem marca no modelo" },
        { t: "Norma", w: 12, v: (x) => x.parafuso?.norma || "" },
        { t: "Nível", w: 20, v: nivelDoItem },
        // ⚠ mm, não metro: é a unidade do projeto e da montagem (Vitor, 03/09/2026).
        { t: "Cota base (mm)", w: 15, dir: "right", v: (x) => (x.cota == null ? "" : Math.round(x.cota * 1000)) },
        { t: "Qtd", w: 8, dir: "right", v: (x) => x.pecas || 0 },
        { t: "Peso do modelo (kg)", w: 18, dir: "right", v: (x) => (x.pesoKg == null ? "" : Math.round(x.pesoKg)) },
        { t: "Bitola (mm)", w: 12, dir: "right", v: (x) => x.parafuso?.bitolaMm ?? "" },
        { t: "Compr. (mm)", w: 12, dir: "right", v: (x) => x.parafuso?.compMm ?? "" },
        { t: "Furo (mm)", w: 11, dir: "right", v: (x) => x.parafuso?.furoMm ?? "" },
        { t: "Porca", w: 16, v: (x) => x.parafuso?.porca || "" },
        { t: "Arruela", w: 16, v: (x) => x.parafuso?.arruela || "" },
        { t: "Aperta em", w: 12, v: (x) => x.parafuso?.local || "" },
      ];
      const alinhamento = COLS.map((c) => c.dir || "left");
      const filtrado = !!selecionados;
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Modelo 3D — OP-${op?.numero || ""}`,
        subtitulo: [
          op?.obra || op?.cliente || "",
          modelo?.nome || "",
          filtrado
            ? `Seleção: ${[...fNiveis].map(rotNivel).filter(Boolean).join(", ") || "todos os níveis"}${fTipos.size ? ` · ${[...fTipos].join(", ")}` : ""}`
            : "Modelo inteiro",
        ].filter(Boolean).join(" · "),
        kpis: [`${soma.grupos} item(ns)`, `${soma.pecas} peça(s)`, `${Math.round(soma.kg)} kg (modelo)`],
        totalColunas: COLS.length, nomePlanilha: "Modelo 3D", codigoDoc: "REL-ENG-002",
      });
      ws.columns = COLS.map((c) => ({ width: c.w }));
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, COLS.map((c) => c.t)); l++;
      for (const x of alvo) { adicionarLinhaTabela(ws, l, COLS.map((c) => c.v(x)), { alinhamento }); l++; }
      adicionarRodapeISO(ws, l + 1, COLS.length);
      await downloadWorkbook(workbook, `Modelo 3D - OP-${op?.numero || ""}${filtrado ? " - selecao" : ""}.xlsx`);
    } catch (e) { setErro(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setBaixando(false); }
  }

  return (
    // ⚠⚠ A OBRA OCUPA A TELA. Vitor (03/09/2026): "o layout externo está bem ruim". Estava — era
    // um formulário com um quadro de 3D dentro: título grande, parágrafo de explicação, seletor
    // solto e o modelo espremido em 560px. Visualizador de modelo é o contrário disso: a cena é a
    // página, e todo o resto encolhe para caber numa faixa. É o que o Trimble faz, e é o que faz
    // sentido — ninguém abre esta tela para ler texto.
    // ⚠ `left-64` casa com o `ml-64` do layout de Produção e com a `w-64 fixed` da barra lateral
    // (conferido nos dois arquivos). Fixo em vez de fluido porque a tela precisa da altura inteira
    // da janela: dentro do `p-8` do layout, o modelo nunca passaria de meia tela.
    <div data-tela-cheia className="fixed inset-y-0 right-0 left-64 flex flex-col bg-torg-dark">
      {/* faixa de controle: tudo numa linha, escura, para a obra ficar sendo a única coisa clara */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 shrink-0 text-white/90">
        <span className="text-[13px] font-bold tracking-tight mr-1">Obra em 3D</span>
        <select value={opId} onChange={(e) => setOpId(e.target.value)}
          className="text-[12px] bg-white/10 border border-white/15 rounded-md px-2 py-1 max-w-[300px] outline-none focus:border-white/40">
          {ops.map((o) => <option key={o.id} value={o.id} className="text-torg-dark">OP-{o.numero} — {o.obra || o.cliente || "sem obra"}</option>)}
        </select>
        {lista?.modelos?.length > 1 && (
          <select value={modelo?.rel || ""} onChange={(e) => { setModelo(lista.modelos.find((m) => m.rel === e.target.value)); setSel(null); setPeca(null); setIndice(null); setFNiveis(new Set()); setFTipos(new Set()); }}
            className="text-[12px] bg-white/10 border border-white/15 rounded-md px-2 py-1 max-w-[340px] outline-none focus:border-white/40">
            {lista.modelos.map((m) => (
              <option key={m.rel} value={m.rel} disabled={m.grande} className="text-torg-dark">
                {m.nome}{m.kb ? ` · ${(m.kb / 1024).toFixed(1)} MB` : ""}{m.grande ? " (grande demais)" : ""}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-0.5 bg-white/10 border border-white/15 rounded-md p-0.5">
          {[["modelo", semCor ? "Cores por tipo" : "Cores do modelo"], ["andamento", "Andamento"]].map(([k, t]) => (
            <button key={k} onClick={() => setModo(k)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded ${modo === k ? "bg-white text-torg-dark" : "text-white/70 hover:text-white"}`}>
              {t}
            </button>
          ))}
        </div>

        {semCor && modo === "modelo" && indice && (
          <div className="flex items-center gap-2.5 text-[11.5px] text-white/70 flex-wrap">
            {tipos.filter(([t]) => COR_TIPO[t]).slice(0, 6).map(([t, qt]) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR_TIPO[t] }} /> {t} <span className="text-white/40">{qt}</span>
              </span>
            ))}
          </div>
        )}

        {lista?.resumo && modo === "andamento" && (
          <div className="flex items-center gap-2.5 text-[11.5px] text-white/70">
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.pronta }} /> {lista.resumo.prontas}</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.andando }} /> {lista.resumo.andando}</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR.parado }} /> {lista.resumo.marcas - lista.resumo.prontas - lista.resumo.andando}</span>
          </div>
        )}

        {indice && (
          <button onClick={() => setPainel((v) => !v)}
            className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border inline-flex items-center gap-1.5 ${
              painel || selecionados ? "bg-white text-torg-dark border-white" : "bg-white/10 text-white/80 border-white/15 hover:text-white"}`}>
            <SlidersHorizontal size={12} />
            {selecionados ? `${soma.grupos} em foco` : "Níveis e tipos"}
          </button>
        )}

        {sel && (
          <button onClick={() => { setSel(null); setPeca(null); }}
            className="ml-auto text-[11.5px] text-white/60 hover:text-white">fechar a peça</button>
        )}
      </div>

      {semNumeracao && (
        <div className="shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[11.5px] text-amber-900 flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            <b>Modelo sem numeração do Tekla</b> — {semNumeracao.com} de {semNumeracao.total} conjuntos têm marca.
            Dá para navegar, medir e filtrar, mas o clique não puxa R, croqui nem setor: a marca é a chave.
            {lista?.modelos?.length > 1 && " Veja se outro modelo desta obra já saiu numerado."}
          </span>
        </div>
      )}

      {/* corpo: cena + painéis, ocupando tudo o que sobra */}
      {/* ⚠⚠ SEMPRE EM COLUNAS LADO A LADO. Estava `flex-col lg:flex-row`: abaixo de 1024 px de
          janela os painéis iam para BAIXO da cena — e como a cena ocupa a altura toda, o painel da
          peça nascia fora da tela. O sintoma era o pior possível: clicar na peça parecia não fazer
          nada. Numa tela de modelo 3D, painel ao lado é o único arranjo que funciona. */}
      <div className="flex-1 min-h-0 flex flex-row bg-white">
        {/* ⚠ o filtro fica À ESQUERDA e o dossiê à direita: são movimentos opostos — um escolhe o
            que ver, o outro lê o que foi escolhido — e disputar o mesmo lado faria um fechar o
            outro justamente quando se usa os dois juntos. */}
        {painel && indice && (
          <aside className="w-[290px] max-w-[38vw] shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
            <div className="p-3.5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-torg-dark uppercase tracking-wide">Filtrar a vista</h3>
                {(selecionados || fSetores.size) && (
                  <button onClick={() => { setFNiveis(new Set()); setFTipos(new Set()); setFSetores(new Set()); }}
                    className="text-[11px] text-torg-blue hover:underline">limpar</button>
                )}
              </div>

              {niveisNaTela.length > 1 && (
                <div>
                  <p className="text-[10.5px] font-semibold text-torg-gray uppercase tracking-wide mb-1">
                    Níveis {daObra
                      ? <span className="normal-case font-normal text-[10px] text-torg-blue">· da Engenharia</span>
                      : <span className="normal-case font-normal text-[10px]">· medidos no modelo</span>}
                  </p>
                  <div className="space-y-0.5">
                    {niveisNaTela.map((nv) => {
                      const qt = contaNivel.get(nv.chave) || 0;
                      return (
                        <label key={nv.chave}
                          className={`flex items-center gap-2 text-[12.5px] rounded px-1.5 py-1 cursor-pointer hover:bg-torg-blue-50/60 ${qt ? "text-torg-dark" : "text-torg-gray"}`}>
                          <input type="checkbox" checked={fNiveis.has(nv.chave)} onChange={() => alternar(setFNiveis, nv.chave)}
                            className="accent-torg-blue" />
                          <span className="flex-1">{nv.rotulo}</span>
                          <span className="text-[11px] text-torg-gray tabular-nums">{qt}</span>
                        </label>
                      );
                    })}
                  </div>
                  {/* ⚠ nível da lista com zero no modelo é sinal, não enfeite: ou a marca ainda não
                      entrou no IFC, ou o modelo aberto é de outra parte da obra. */}
                  {daObra && [...contaNivel.values()].some((v) => !v) && (
                    <p className="text-[10.5px] text-amber-700 mt-1 px-1.5">
                      Nível com 0 não tem nenhuma marca deste modelo.
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-[10.5px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Tipos</p>
                <div className="space-y-0.5">
                  {tipos.map(([t, qt]) => (
                    <label key={t} className="flex items-center gap-2 text-[12.5px] text-torg-dark hover:bg-torg-blue-50/60 rounded px-1.5 py-1 cursor-pointer">
                      <input type="checkbox" checked={fTipos.has(t)} onChange={() => alternar(setFTipos, t)} className="accent-torg-blue" />
                      <span className="flex-1">{t}</span>
                      <span className="text-[11px] text-torg-gray tabular-nums">{qt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {setores.length > 0 && (
                <div>
                  <p className="text-[10.5px] font-semibold text-torg-gray uppercase tracking-wide mb-1">
                    Onde está na fábrica <span className="normal-case font-normal text-[10px]">· pelo apontamento</span>
                  </p>
                  <div className="space-y-0.5">
                    {setores.map(([t, qt]) => (
                      <label key={t} className="flex items-center gap-2 text-[12.5px] text-torg-dark hover:bg-torg-blue-50/60 rounded px-1.5 py-1 cursor-pointer">
                        <input type="checkbox" checked={fSetores.has(t)} onChange={() => alternar(setFSetores, t)} className="accent-torg-blue" />
                        <span className="flex-1">{t}</span>
                        <span className="text-[11px] text-torg-gray tabular-nums">{qt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3 text-[12px] text-torg-gray space-y-0.5">
                <p><b className="text-torg-dark">{soma.grupos}</b> item(ns) · <b className="text-torg-dark">{soma.pecas}</b> peça(s)</p>
                {soma.kg > 0 && <p><b className="text-torg-dark">{Math.round(soma.kg).toLocaleString("pt-BR")}</b> kg no modelo</p>}
                {soma.parafusos > 0 && <p><b className="text-torg-dark">{soma.parafusos}</b> parafuso(s)</p>}
              </div>

              <div className="flex items-center gap-3 flex-wrap text-[11.5px]">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-torg-dark">
                  <input type="checkbox" checked={esconderResto} onChange={(e) => setEsconderResto(e.target.checked)} className="accent-torg-blue" />
                  Ocultar o resto
                </label>
                {ocultos.size > 0 && (
                  <button onClick={() => setOcultos(new Set())} className="text-torg-blue hover:underline inline-flex items-center gap-1">
                    <Eye size={12} /> mostrar {ocultos.size} oculta(s)
                  </button>
                )}
              </div>

              <button onClick={exportar} disabled={baixando}
                className="w-full text-[12px] font-semibold px-3 py-2 rounded-md bg-torg-blue text-white hover:bg-torg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {baixando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                {selecionados ? "Exportar a seleção" : "Exportar o modelo"}
              </button>

              {/* ⚠ a lista vem DEPOIS do resumo e do botão: quem abriu o filtro quer saber quanto
                  deu e levar para a planilha; a lista é conferência, e conferência é o que se rola. */}
              <div className="border-t border-gray-200 pt-2">
                <div className="relative mb-1">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="procurar marca, tipo, parafuso…"
                    className="w-full text-[12px] pl-6 pr-6 py-1.5 border border-gray-200 rounded-md outline-none focus:border-torg-blue" />
                  {busca && (
                    <button onClick={() => setBusca("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-torg-gray hover:text-torg-dark text-[13px] leading-none">×</button>
                  )}
                </div>
                <p className="text-[10.5px] text-torg-gray px-1.5 pb-1">
                  {listados.length} item(ns){busca ? " encontrados" : ""}
                </p>
              </div>

              <div className="max-h-[34vh] overflow-y-auto">
                {listados.slice(0, 400).map((x) => (
                  <button key={x.id} onClick={() => abrir(x)}
                    className={`w-full text-left text-[12px] px-1.5 py-1 rounded flex items-baseline gap-2 hover:bg-torg-blue-50/60 ${sel?.id === x.id ? "bg-orange-50" : ""}`}>
                    {/* ⚠ tipo e cota vão junto porque nem todo modelo tem marca: sem eles, a lista de
                        uma obra ainda não numerada vira dezenas de linhas visualmente idênticas. */}
                    <span className="font-mono text-torg-dark truncate">{x.marca || x.parafuso?.nome || x.tipo}</span>
                    <span className="text-[10.5px] text-torg-gray truncate">
                      {[x.marca && x.tipo, x.cota != null && `${x.cota >= 0 ? "+" : ""}${x.cota.toFixed(2).replace(".", ",")}`].filter(Boolean).join(" · ")}
                    </span>
                    <span className="ml-auto text-[11px] text-torg-gray shrink-0">{x.pecas}×</span>
                  </button>
                ))}
                {listados.length > 400 && (
                  <p className="text-[11px] text-torg-gray px-1.5 py-1">
                    …e mais {listados.length - 400}. Use a busca para chegar na peça, ou exporte a planilha com todos.
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* ⚠⚠ `min-w-0` É O QUE FAZ O PAINEL APARECER. Item de flex nasce com `min-width:auto`, ou
            seja, não encolhe abaixo do conteúdo — e o conteúdo aqui é um canvas com largura em
            pixels, do tamanho da janela. Sem isto a cena se recusava a estreitar e empurrava o
            painel para fora da tela (medido: o painel nascia em x=1440 numa janela de 1440). O
            clique funcionava o tempo todo; o que não aparecia era a resposta. */}
        <div className="flex-1 min-w-0 min-h-0 relative">
          {erro && (
            <div className="absolute inset-0 grid place-items-center p-6 z-10 bg-white">
              <p className="text-[13px] text-red-600 text-center max-w-sm inline-flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {erro}
              </p>
            </div>
          )}
          {lista && !lista.modelos?.length && !erro && (
            <div className="absolute inset-0 grid place-items-center p-6 z-10 bg-white">
              <p className="text-[13px] text-torg-gray text-center max-w-md">
                Esta obra não tem modelo IFC na pasta da Engenharia.<br />
                <span className="text-[12px]">O arquivo é procurado em <b>2. Engenharia › 2.5 Projetos</b> — normalmente em <b>2.5.3 Modelo 3D</b>.</span>
              </p>
            </div>
          )}
          {!lista && !erro && (
            <div className="absolute inset-0 grid place-items-center bg-white">
              <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> procurando o modelo…</p>
            </div>
          )}
          {urlModelo && (
            <VisualizadorIfc key={urlModelo} url={urlModelo} onSelecionar={abrir} onIndice={receberIndice}
              visiveis={visiveis} ocultos={ocultos} esconderResto={esconderResto}
              selecionada={sel?.id || null} cores={cores} modo={modo} altura="fill" />
          )}
        </div>

        {/* ⚠ o painel só existe quando há peça: coluna vazia ocupando um terço da tela rouba da obra
            justamente quando não há nada a dizer. */}
        {sel && (
          <aside className="w-[360px] max-w-[42vw] shrink-0 border-l border-gray-200 overflow-y-auto bg-white">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => setOcultos((v) => new Set(v).add(sel.id))}
                  className="text-[11.5px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1">
                  <EyeOff size={12} /> ocultar esta peça
                </button>
                {ocultos.size > 0 && (
                  <button onClick={() => setOcultos(new Set())} className="text-[11.5px] text-torg-blue hover:underline">
                    mostrar as {ocultos.size} ocultas
                  </button>
                )}
              </div>
              {sel.parafuso && <PainelParafuso p={sel.parafuso} qtd={sel.pecas} />}
              {sel.marca && carregandoPeca && <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> buscando {sel.marca}…</p>}
              {sel.marca && peca?.erro && (
                <div className="text-[13px]">
                  <p className="font-mono font-bold text-torg-dark">{sel.marca}</p>
                  <p className="text-amber-700 mt-1">{peca.erro}</p>
                  <p className="text-[12px] text-torg-gray mt-1">Objeto do modelo sem marca na LPC — normalmente é eixo ou objeto auxiliar.</p>
                </div>
              )}
              {sel.marca && peca && !peca.erro && <Painel d={peca} />}
              {!sel.marca && !sel.parafuso && (
                <p className="text-[12.5px] text-torg-gray">
                  Objeto do modelo sem marca — normalmente é eixo, cota ou objeto auxiliar do Tekla.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * O parafuso clicado, por especificação.
 *
 * ⚠⚠ PARAFUSO NÃO TEM DOSSIÊ NO PORTAL, e não deveria fingir que tem: é item comprado, não passa
 * pela LPC nem pela fábrica (ver lib/item-comprado). O que existe sobre ele está TODO no modelo —
 * e é bastante: bitola, comprimento, norma, furo, porca, arruela e onde aperta. Por isso este
 * painel se resolve no navegador, sem ida ao servidor.
 *
 * ⚠ "Aperta na obra" é a informação que muda o dia de quem separa material: parafuso de obra vai
 * na caixa que embarca, parafuso de oficina fica na fábrica.
 */
function PainelParafuso({ p, qtd }) {
  const mm = (x) => (x == null ? "—" : `${Number(x).toFixed(1).replace(".", ",")} mm`);
  const naObra = /obra|field|site/i.test(p.local || "");
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="font-mono text-[17px] font-bold text-torg-dark">{p.nome}</h3>
        {p.norma && (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-blue-200 bg-torg-blue-50 text-torg-blue">{p.norma}</span>
        )}
        {p.local && (
          <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
            naObra ? "border-amber-200 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-torg-gray"}`}>
            aperta {naObra ? "na obra" : `na ${String(p.local).toLowerCase()}`}
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-torg-gray">
        <b className="text-torg-dark">{qtd}</b> deste parafuso {qtd === 1 ? "está" : "estão"} nesta obra.
      </p>
      <Bloco titulo="O parafuso">
        {/* ⚠ as medidas saem como o Tekla gravou. Há parafuso no catálogo em que "Bolt size" vem
            com o diâmetro do FURO e o comprimento em outra unidade — o nome ("5/8\" X 1 1/4\"") é o
            que vale para comprar. Corrigir o número por conta própria seria inventar dado. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          <dt className="text-torg-gray">Bitola</dt><dd className="text-torg-dark">{mm(p.bitolaMm)}</dd>
          <dt className="text-torg-gray">Comprimento</dt><dd className="text-torg-dark">{mm(p.compMm)}</dd>
          <dt className="text-torg-gray">Furo</dt><dd className="text-torg-dark">{mm(p.furoMm)}</dd>
          {p.porca && <><dt className="text-torg-gray">Porca</dt><dd className="text-torg-dark">{p.porca}{p.porcaTipo ? ` · ${p.porcaTipo}` : ""}</dd></>}
          {p.arruela && <><dt className="text-torg-gray">Arruela</dt><dd className="text-torg-dark">{p.arruela}{p.arruelaTipo ? ` · ${p.arruelaTipo}` : ""}</dd></>}
        </dl>
      </Bloco>
    </div>
  );
}

/** O dossiê — cada bloco vem de uma parte do portal que já existia, agora na mesma tela. */
export function Painel({ d }) {
  const p = d.pecas?.[0] || {};
  const feitos = new Set((d.fabrica?.trilha || []).map((t) => t.setor));
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="font-mono text-[17px] font-bold text-torg-dark">{d.marca}</h3>
        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-blue-200 bg-torg-blue-50 text-torg-blue">
          {p.tipoPeca === "CONJUNTO" ? "conjunto" : p.tipoPeca === "CROQUI" ? "croqui" : "marca"}
        </span>
        {d.fabrica?.setorAtual && (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
            {d.fabrica.setorAtual}
          </span>
        )}
        {p.prioridade ? (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-torg-orange-200 bg-orange-50 text-torg-orange-700 inline-flex items-center gap-1">
            <Star size={10} className="fill-current" /> prioridade {p.prioridade}
          </span>
        ) : null}
      </div>

      <Bloco titulo="A peça">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          <dt className="text-torg-gray">Descrição</dt><dd className="font-medium">{p.descricao || "—"}</dd>
          <dt className="text-torg-gray">Perfil</dt><dd className="font-mono font-medium">{p.perfil || "—"}</dd>
          <dt className="text-torg-gray">Material</dt><dd className="font-medium">{p.material || "—"}</dd>
          <dt className="text-torg-gray">Comprimento</dt><dd className="font-medium">{p.comprimentoMm ? `${fmtN(p.comprimentoMm)} mm` : "—"}</dd>
          <dt className="text-torg-gray">Quantidade</dt><dd className="font-medium">{fmtN(p.qte)} un · {fmtKg(p.pesoTotalKg)}</dd>
          <dt className="text-torg-gray">Frente</dt><dd className="font-mono font-medium">{p.opNumero || "—"}</dd>
        </dl>
      </Bloco>

      {d.croquis?.length > 0 && (
        <Bloco titulo={`Croquis do conjunto (${d.croquis.length})`}>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {d.croquis.map((c) => (
              <div key={c.marca} className="flex gap-2 text-[12px]">
                <span className="font-mono font-semibold min-w-[86px]">{c.marca}</span>
                <span className="text-torg-gray flex-1 truncate">{c.perfil || c.descricao || ""}</span>
                <span className="text-torg-gray tabular-nums">{fmtN(c.qtdNoConjunto)}×</span>
              </div>
            ))}
          </div>
        </Bloco>
      )}
      {d.conjuntos?.length > 0 && (
        <Bloco titulo="Faz parte de">
          <p className="font-mono text-[12.5px]">{d.conjuntos.map((c) => c.marca).join(", ")}</p>
        </Bloco>
      )}

      {/* ⚠⚠ UMA LINHA POR PERFIL, E O MOTIVO QUANDO NÃO HÁ R. Vitor (03/09/2026), na foto de um
          conjunto com a mesma cantoneira repetida onze vezes: "aqui não é real que está sem R, é?".
          Era real — só que por prazo de fornecedor, não por furo de rastreio. "Sem R" sozinho, em
          vermelho, acusa quem não tem culpa; agora a linha diz POR QUE não há R. */}
      <Bloco titulo="Rastreabilidade">
        {d.rastreio?.length ? d.rastreio.map((r, i) => {
          const mat = d.materialPorPerfil?.[r.perfil] || null;
          return (
            <div key={i} className="text-[12px] mb-1.5 last:mb-0">
              <span className="font-mono font-semibold">{r.perfil}</span>
              {r.posicoes > 1 && <span className="text-torg-gray-light ml-1">{r.posicoes}×</span>}
              {r.usadas?.length ? r.usadas.map((u, k) => (
                <span key={k} className="ml-2">
                  <span className="font-mono font-semibold text-emerald-700">R {u.r}</span>
                  {u.corrida && <span className="text-torg-gray"> · corrida {u.corrida}</span>}
                  {u.nf && <span className="text-torg-gray"> · NF {u.nf}</span>}
                  {u.indicado && <span className="text-torg-gray-light"> (indicado)</span>}
                </span>
              )) : (
                <span className="ml-2">
                  {mat?.estado === "ESTOQUE" && !mat.rInformado
                    ? <span className="text-amber-700">{mat.rotulo === "aguardando entrega" ? "aço a caminho — sem entrada no CMR ainda" : `de estoque · ${mat.rotulo || "sem o R informado"}`}</span>
                    : mat && mat.estado !== "NA_OP"
                    ? <span className="text-amber-700">{mat.rotulo || "material não comprado"}</span>
                    : <span className="text-red-600 italic">sem R</span>}
                </span>
              )}
              {mat?.descricaoCmr && <span className="block text-[11px] text-torg-gray-light truncate" title={mat.descricaoCmr}>{mat.descricaoCmr}</span>}
            </div>
          );
        }) : <p className="text-[12.5px] text-torg-gray italic">Sem rastreio ainda.</p>}
      </Bloco>

      <Bloco titulo="Onde está na fábrica">
        <div className="flex flex-wrap gap-1.5">
          {ETAPAS.map((s) => (
            <span key={s} className={`text-[11px] px-2 py-0.5 rounded border ${
              feitos.has(s) ? "border-amber-300 bg-amber-50 text-amber-800 font-semibold" : "border-gray-200 text-torg-gray"}`}>{s}</span>
          ))}
        </div>
        {d.fabrica?.trilha?.length ? (
          <p className="text-[11.5px] text-torg-gray mt-1.5">
            {d.fabrica.trilha.map((t) => `${t.setor} ${fmtN(t.un)} un · ${fmtKg(t.kg)} · ${fmtD(t.ultimo)}`).join(" · ")}
          </p>
        ) : <p className="text-[12px] text-torg-gray italic mt-1">Nenhum apontamento ainda.</p>}
      </Bloco>

      {d.liberacoes?.length > 0 && (
        <Bloco titulo="Programação">
          {d.liberacoes.map((l, i) => (
            <p key={i} className="text-[12px]">
              <b>{fmtD(l.dia) || "sem dia"}</b> · {(l.setores || []).join(" / ")}
              {l.liberadoPor && <span className="text-torg-gray"> — liberado por {l.liberadoPor}</span>}
            </p>
          ))}
        </Bloco>
      )}

      <Bloco titulo="Qualidade">
        {d.relatorios?.length ? d.relatorios.map((r) => (
          <div key={r.codigo} className="flex gap-2 text-[12px]">
            <span className="font-mono font-semibold">{r.codigo}</span>
            <span className="text-torg-gray flex-1">{r.tipoRotulo}</span>
            {r.resultado && <span className={r.resultado === "APROVADO" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{r.resultado}</span>}
          </div>
        )) : (
          <>
            <p className="text-[12.5px] text-torg-gray italic">Nenhum relatório emitido para esta marca.</p>
            <p className="text-[11.5px] text-torg-gray-light mt-1">Dimensional, visual de solda e ultrassom aparecem aqui quando o primeiro for emitido.</p>
          </>
        )}
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div className="pt-2.5 border-t border-gray-100 first:border-t-0 first:pt-0">
      <p className="text-[10px] uppercase tracking-wider text-torg-gray font-semibold mb-1">{titulo}</p>
      {children}
    </div>
  );
}
