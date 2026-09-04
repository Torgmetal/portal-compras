"use client";
// ─── O MODELO 3D NA TELA DO CLIENTE ───────────────────────────────────────────
//
// Vitor (03/09/2026): "conseguimos ter a opção de disponibilizar esse painel no portal do cliente
// para eles conseguirem olhar e navegar no modelo e ver tudo que precisa: status de peças, apenas a
// rastreabilidade (…), relatórios de qualidade, peso, marca, tipo".
//
// ⚠⚠ MESMO MOTOR, PAINEL OUTRO. O visualizador é o mesmo do portal interno — obra é obra, e manter
// dois renderizadores seria manter dois conjuntos de defeitos. O que muda é o que se lê ao clicar:
// aqui não há R interno, croqui, liberação, carga nem nada de fornecedor. O corte não é feito nesta
// tela: vem pronto da rota, que por sua vez só chama lib/portal-obra-consulta.
//
// ⚠⚠ FALTA DE DADO SE ESCREVE "SEM INFORMAÇÃO". Vitor: "se por acaso não estiver apontado no CMR
// deixar como sem informação para não levantar suspeita". Nada nesta tela pode dizer "não apontado",
// "pendente" ou "não conferido" — é a mesma regra dos documentos ao cliente.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Box, SlidersHorizontal, Search, EyeOff, Eye, FileSpreadsheet, X, Factory } from "lucide-react";
import VisualizadorIfc from "@/components/VisualizadorIfc";

const SEM = "sem informação";

const fmtKg = (v) => (v == null ? null : `${Math.round(v).toLocaleString("pt-BR")} kg`);
const fmtData = (d) => { try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return ""; } };

export default function ModeloObraCliente({ token }) {
  const [lista, setLista] = useState(null);
  const [modelo, setModelo] = useState(null);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(null);
  // ⚠ a RM abre por cima do painel, não troca a tela: o cliente estava olhando a peça e quer
  // conferir de onde ela veio — tirá-lo da peça para responder isso seria perder o lugar.
  const [rm, setRm] = useState(null);        // { numero, ...dados } | { numero, carregando } | { numero, erro }
  const [peca, setPeca] = useState(null);
  const [buscando, setBuscando] = useState(false);
  // ⚠⚠ O CLIENTE NAVEGA IGUAL. Vitor (03/09/2026): "no portal do cliente não está dando os filtros
  // que falamos (…) não dá nada do que dá no da produção". Ele tem razão: eu tinha entregue só o
  // visualizador com o dossiê. O que muda entre as duas telas é O QUE SE LÊ da peça, não o que se
  // consegue fazer com o modelo — girar, filtrar por nível, isolar e procurar servem aos dois.
  const [indice, setIndice] = useState(null);
  const [niveisGeo, setNiveisGeo] = useState([]);
  const [niveisObra, setNiveisObra] = useState(null);
  // ⚠ filtro por ETAPA DE FABRICAÇÃO. Vitor (04/09/2026): "quero que o cliente clique no status e
  // só apareçam as peças que estão sendo apontadas naquele setor".
  const [fSetores, setFSetores] = useState(() => new Set());
  const [fNiveis, setFNiveis] = useState(() => new Set());
  const [fTipos, setFTipos] = useState(() => new Set());
  const [painel, setPainel] = useState(false);
  // ⚠ botão PRÓPRIO para a etapa. Vitor (05/09/2026): "não encontro o filtro para ver as etapas de
  // fabricação, tem que ser um botão ao lado de Níveis e tipos". Estava dentro do painel de
  // filtros, junto de nível e tipo — geometria e estado no mesmo lugar, e a pergunta mais comum do
  // cliente ("onde está minha peça?") escondida atrás de um botão que fala de outra coisa.
  const [painelEtapa, setPainelEtapa] = useState(false);
  const [busca, setBusca] = useState("");
  const [esconderResto, setEsconderResto] = useState(false);
  const [ocultos, setOcultos] = useState(() => new Set());
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/portal/${token}/modelo-3d`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (!ok) return setErro(j.error || "Modelo indisponível.");
        setLista(j);
        setModelo(j.modelos?.find((m) => !m.grande) || null);
      })
      .catch(() => vivo && setErro("Modelo indisponível."));
    return () => { vivo = false; };
  }, [token]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/portal/${token}/niveis`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setNiveisObra(j?.achou ? j : { achou: false, niveis: [] }))
      .catch(() => vivo && setNiveisObra({ achou: false, niveis: [] }));
    return () => { vivo = false; };
  }, [token]);

  const receberIndice = useCallback(({ indice: ix, niveis: nv }) => { setIndice(ix); setNiveisGeo(nv); }, []);

  const chaveMarca = (m) => String(m || "").toUpperCase().replace(/\s/g, "");
  const daObra = !!niveisObra?.achou && niveisObra.niveis?.length > 0;

  const niveisNaTela = useMemo(() => {
    if (!daObra) return niveisGeo;
    return niveisObra.niveis.map((nv, i) => ({
      chave: `o${i}`, rotulo: nv.rotulo, marcas: new Set((nv.marcas || []).map(chaveMarca)), daObra: true,
    }));
  }, [daObra, niveisObra, niveisGeo]);

  // ⚠ o setor vem do apontamento (mapa marca → setor); peça sem apontamento não tem etapa e não
  // entra em filtro nenhum — dizer que ela está "em preparação" sem lastro seria inventar.
  const setorDe = useCallback((x) => (x?.marca ? niveisObra?.setores?.[x.marca] || null : null), [niveisObra]);

  // ⚠⚠ O TIPO VEM DA LISTA quando ela sabe o nome. Vitor (05/09/2026): "quando colocamos em vigas
  // ele seleciona algumas coisas sem sentido; teria que pegar nas listas os nomes das peças —
  // colunas, tesouras, terças". O tipo do modelo é a CLASSE DO IFC, e o Tekla exporta como IfcBeam
  // quase tudo que é barra: terça, tesoura, contraventamento e tirante viravam "Viga".
  // Sem nome na lista (croqui e avulsa trazem o perfil, que é bitola e não tipo), vale o do IFC —
  // que para chapa e parafuso acerta. Ver lib/tipo-peca.js.
  const tipoDe = useCallback(
    (x) => (x?.marca ? niveisObra?.tipos?.[String(x.marca).trim().toUpperCase()] : null) || x?.tipo || null,
    [niveisObra],
  );

  const setores = useMemo(() => {
    const c = new Map();
    for (const x of indice || []) { const st = setorDe(x); if (st) c.set(st, (c.get(st) || 0) + 1); }
    // ⚠ ordem da ROTA, não a alfabética nem a por quantidade: o cliente lê o caminho da peça.
    const ordem = ["Corte", "Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
    return [...c.entries()].sort((a2, b2) => ordem.indexOf(a2[0]) - ordem.indexOf(b2[0]));
  }, [indice, setorDe]);

  // ⚠ "Corte" e "Preparação" são a mesma etapa para quem olha de fora — o Syneco é que separa as
  // operações 10 e 20 (ver lib/portal-obra-consulta).
  const rotuloEtapa = (st) => (st === "Corte" || st === "Preparação" ? "Preparação" : st);

  const selecionados = useMemo(() => {
    if (!indice) return null;
    if (!fNiveis.size && !fTipos.size && !fSetores.size) return null;
    const alvo = daObra && fNiveis.size
      ? new Set(niveisNaTela.filter((nv) => fNiveis.has(nv.chave)).flatMap((nv) => [...nv.marcas]))
      : null;
    return indice.filter((x) =>
      (!fNiveis.size || (alvo ? x.marca && alvo.has(chaveMarca(x.marca)) : fNiveis.has(x.nivel)))
      && (!fTipos.size || fTipos.has(tipoDe(x)))
      && (!fSetores.size || fSetores.has(setorDe(x))));
  }, [indice, fNiveis, fTipos, fSetores, daObra, niveisNaTela, setorDe, tipoDe]);

  const visiveis = useMemo(() => (selecionados ? new Set(selecionados.map((x) => x.id)) : null), [selecionados]);

  const tipos = useMemo(() => {
    const c = new Map();
    for (const x of indice || []) { const t = tipoDe(x); if (t) c.set(t, (c.get(t) || 0) + 1); }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [indice, tipoDe]);

  const contaNivel = useMemo(() => {
    const c = new Map();
    for (const nv of niveisNaTela) {
      c.set(nv.chave, nv.daObra
        ? (indice || []).filter((x) => x.marca && nv.marcas.has(chaveMarca(x.marca))).length
        : (indice || []).filter((x) => x.nivel === nv.chave).length);
    }
    return c;
  }, [niveisNaTela, indice]);

  const listados = useMemo(() => {
    const base = selecionados || indice || [];
    const t = busca.trim().toUpperCase();
    if (!t) return base;
    return base.filter((x) => String(x.marca || "").toUpperCase().includes(t) || String(tipoDe(x) || "").toUpperCase().includes(t));
  }, [selecionados, indice, busca]);

  const alternar = (setar, valor) => setar((antes) => {
    const novo = new Set(antes);
    if (novo.has(valor)) novo.delete(valor); else novo.add(valor);
    return novo;
  });

  async function exportar() {
    setBaixando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const alvo = (selecionados || indice || []).slice()
        .sort((a, b) => String(a.marca || a.tipo).localeCompare(String(b.marca || b.tipo), "pt-BR", { numeric: true }));
      const nivelDoItem = (x) => (daObra
        ? niveisNaTela.find((nv) => x.marca && nv.marcas.has(chaveMarca(x.marca)))?.rotulo || ""
        : niveisNaTela.find((nv) => nv.chave === x.nivel)?.rotulo || "");
      const COLS = [
        { t: "Tipo", w: 14, v: (x) => tipoDe(x) || "" },
        { t: "Marca", w: 24, v: (x) => x.marca || "" },
        { t: "Nível", w: 24, v: nivelDoItem },
        { t: "Cota base (mm)", w: 15, dir: "right", v: (x) => (x.cota == null ? "" : Math.round(x.cota * 1000)) },
        { t: "Qtd", w: 9, dir: "right", v: (x) => x.pecas || 0 },
        { t: "Peso do modelo (kg)", w: 19, dir: "right", v: (x) => (x.pesoKg == null ? "" : Math.round(x.pesoKg)) },
      ];
      const alinhamento = COLS.map((c) => c.dir || "left");
      const foco = [...fNiveis].map((k) => niveisNaTela.find((nv) => nv.chave === k)?.rotulo).filter(Boolean);
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Modelo 3D — OP-${lista?.obra?.numero || ""}`,
        subtitulo: [lista?.obra?.obra || lista?.obra?.cliente || "", modelo?.nome || "",
          foco.length ? `Seleção: ${foco.join(", ")}` : "Modelo inteiro"].filter(Boolean).join(" · "),
        kpis: [`${alvo.length} item(ns)`, `${alvo.reduce((t, x) => t + (x.pecas || 0), 0)} peça(s)`],
        totalColunas: COLS.length, nomePlanilha: "Modelo 3D", codigoDoc: "REL-ENG-002",
      });
      ws.columns = COLS.map((c) => ({ width: c.w }));
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, COLS.map((c) => c.t)); l++;
      ws.views = [{ state: "frozen", ySplit: l - 1 }];
      for (const x of alvo) {
        adicionarLinhaTabela(ws, l, COLS.map((c) => c.v(x)), { alinhamento });
        ws.getCell(l, 4).numFmt = "#,##0"; ws.getCell(l, 6).numFmt = "#,##0";
        l++;
      }
      adicionarRodapeISO(ws, l + 1, COLS.length);
      await downloadWorkbook(workbook, `Modelo 3D - OP-${lista?.obra?.numero || ""}.xlsx`);
    } catch { /* sem alarde na tela do cliente */ }
    finally { setBaixando(false); }
  }

  const abrir = useCallback((item) => {
    setSel(item || null);
    const m = item?.marca;
    if (!m) return setPeca(null);
    setBuscando(true); setPeca(null);
    fetch(`/api/portal/${token}/peca?marca=${encodeURIComponent(m)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setPeca(ok ? j : null))
      .catch(() => setPeca(null))
      .finally(() => setBuscando(false));
  }, [token]);

  const abrirRm = useCallback((numero) => {
    setRm({ numero, carregando: true });
    fetch(`/api/portal/${token}/rm?numero=${encodeURIComponent(numero)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setRm(ok ? { numero, ...j } : { numero, erro: j.error || SEM }))
      .catch(() => setRm({ numero, erro: SEM }));
  }, [token]);

  const url = modelo ? `/api/portal/${token}/modelo-3d?rel=${encodeURIComponent(modelo.rel)}` : null;

  // ⚠ nem erro nem lista vazia viram explicação: o cliente lê uma linha neutra, não o motivo. É a
  // mesma regra dos documentos — buraco nosso se resolve aqui dentro, não na tela dele.
  if (erro) return <p className="text-[13px] text-gray-500">O modelo desta obra não está disponível aqui.</p>;
  // ⚠ a espera tem cara, não é uma linha de texto perdida num cartão branco: com a marca e o
  // compasso girando, parece o portal trabalhando — que é o que está acontecendo.
  if (!lista) {
    return (
      <div className="h-40 grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/torg-logo.png" alt="Torg Metal" className="h-8 opacity-80" />
          <p className="text-[12.5px] text-gray-500 inline-flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> abrindo o modelo da obra…
          </p>
        </div>
      </div>
    );
  }
  if (!lista.modelos?.length) return <p className="text-[13px] text-gray-500">O modelo desta obra não está disponível aqui.</p>;

  return (
    <div className="space-y-3">
      {/* ⚠⚠ A BARRA ENTRA NA TELA CHEIA. Vitor (03/09/2026): "dê a opção para apertar no menu de
          níveis e tipos dentro da tela cheia também". O `data-tela-cheia` é o que o botão procura
          para saber o que levar junto — estava só no quadro do 3D, então o seletor de modelo e o
          botão de filtros ficavam de fora justamente onde mais se precisa deles. */}
      <div data-tela-cheia className="flex flex-col gap-3 bg-white">
      <div className="flex items-center gap-2 flex-wrap px-0 pt-0">
      {lista.modelos.length > 1 && (
        <select value={modelo?.rel || ""} onChange={(e) => { setModelo(lista.modelos.find((m) => m.rel === e.target.value)); setSel(null); setPeca(null); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 max-w-full outline-none focus:border-[#006EAB]">
          {lista.modelos.map((m) => (
            <option key={m.rel} value={m.rel} disabled={m.grande}>{m.nome}{m.grande ? " (grande demais)" : ""}</option>
          ))}
        </select>
      )}
        {indice && (
          <button onClick={() => setPainel((v) => !v)}
            className={`text-[12.5px] font-semibold px-3 py-2 rounded-lg border inline-flex items-center gap-2 ${
              painel || selecionados ? "bg-[#0D1F3C] text-white border-[#0D1F3C]" : "border-gray-200 text-gray-600 hover:border-[#006EAB] hover:text-[#006EAB]"}`}>
            <SlidersHorizontal size={13} />
            {/* ⚠ "Filtro", não "Níveis e tipos". Vitor (05/09/2026) — depois que a etapa ganhou
                botão próprio, o painel deixou de ser só nível e tipo. */}
            {selecionados ? `${selecionados.length} em foco` : "Filtro"}
          </button>
        )}
        {indice && setores.length > 0 && (
          <div className="relative">
            <button onClick={() => setPainelEtapa((v) => !v)}
              className={`text-[12.5px] font-semibold px-3 py-2 rounded-lg border inline-flex items-center gap-2 ${
                fSetores.size ? "bg-[#006EAB] text-white border-[#006EAB]" : "border-gray-200 text-gray-600 hover:border-[#006EAB] hover:text-[#006EAB]"}`}>
              <Factory size={13} />
              {fSetores.size ? rotuloEtapa([...fSetores][0]) : "Etapa de fabricação"}
            </button>
            {painelEtapa && (
              <div className="absolute left-0 top-full mt-1 z-30 w-[250px] bg-white border border-gray-200 rounded-xl shadow-lg p-2">
                <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 mb-1">Onde está</p>
                <div className="space-y-0.5">
                  {setores.map(([st, qt]) => {
                    const ativo = fSetores.has(st);
                    return (
                      <button key={st} type="button"
                        onClick={() => { setFSetores(ativo ? new Set() : new Set([st])); setPainelEtapa(false); }}
                        aria-pressed={ativo}
                        className={`w-full flex items-center gap-2 text-[12.5px] rounded px-1.5 py-1.5 text-left transition-colors ${
                          ativo ? "bg-[#006EAB] text-white font-semibold" : "text-[#0D1F3C] hover:bg-gray-50"}`}>
                        <span className="flex-1">{rotuloEtapa(st)}</span>
                        <span className={`text-[11px] tabular-nums ${ativo ? "text-white/80" : "text-gray-400"}`}>{qt}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10.5px] text-gray-400 mt-1.5 px-1.5">
                  {fSetores.size ? "clique de novo na etapa para ver a obra inteira" : "peça sem apontamento não entra em nenhuma etapa"}
                </p>
              </div>
            )}
          </div>
        )}
        {ocultos.size > 0 && (
          <button onClick={() => setOcultos(new Set())} className="text-[12px] text-[#006EAB] hover:underline inline-flex items-center gap-1">
            <Eye size={12} /> mostrar {ocultos.size} oculta(s)
          </button>
        )}
      </div>

      {/* ⚠ o modelo é a peça central da seção: altura generosa, painel ao lado só quando há peça
          escolhida — coluna vazia num portal de cliente parece defeito. */}
      {/* ⚠⚠ `data-tela-cheia` É O QUE MANTÉM OS FILTROS EM TELA CHEIA. Vitor (03/09/2026): "no modo
          tela cheia vc tira os filtros, precisa deixar". O botão de tela cheia procura este atributo
          para saber o que levar junto (ver components/VisualizadorIfc); sem ele, sobrava só a caixa
          do 3D — e tela cheia sem filtro é justamente quando se precisa mais dele. */}
      {/* ⚠ o `flex-1 min-h-0` aqui serve à TELA CHEIA (o pai vira coluna de 100vh e esta linha
          precisa esticar). Fora dela o contêiner tem altura automática, e quem manda é a altura do
          quadro da cena. */}
      <div className="flex flex-col lg:flex-row gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white flex-1 min-h-0">
        {painel && indice && (
          <aside data-painel-3d className="w-full lg:w-[260px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto" style={{ maxHeight: 560 }}>
            <div className="p-3.5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[12px] font-bold text-[#0D1F3C] uppercase tracking-wide">Filtrar a vista</h4>
                {selecionados && (
                  <button onClick={() => { setFNiveis(new Set()); setFTipos(new Set()); setFSetores(new Set()); }} className="text-[11px] text-[#006EAB] hover:underline">limpar</button>
                )}
              </div>

              {niveisNaTela.length > 1 && (
                <div>
                  <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Níveis</p>
                  <div className="space-y-0.5">
                    {niveisNaTela.map((nv) => {
                      const qt = contaNivel.get(nv.chave) || 0;
                      return (
                        <label key={nv.chave} className={`flex items-center gap-2 text-[12.5px] rounded px-1.5 py-1 cursor-pointer hover:bg-gray-50 ${qt ? "text-[#0D1F3C]" : "text-gray-400"}`}>
                          <input type="checkbox" checked={fNiveis.has(nv.chave)} onChange={() => alternar(setFNiveis, nv.chave)} className="accent-[#006EAB]" />
                          <span className="flex-1">{nv.rotulo}</span>
                          <span className="text-[11px] text-gray-400 tabular-nums">{qt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ⚠ a ETAPA saiu daqui: virou botão próprio na barra, ao lado deste (Vitor,
                  05/09/2026: "tem que ser um botão ao lado de Níveis e tipos"). Aqui ficou o que é
                  GEOMETRIA — nível e tipo. */}
              <div>
                <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tipos</p>
                <div className="space-y-0.5">
                  {tipos.map(([t, qt]) => (
                    <label key={t} className="flex items-center gap-2 text-[12.5px] text-[#0D1F3C] rounded px-1.5 py-1 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={fTipos.has(t)} onChange={() => alternar(setFTipos, t)} className="accent-[#006EAB]" />
                      <span className="flex-1">{t}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{qt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ⚠ EXPORTAR O QUE ESTÁ EM FOCO. Vitor (03/09/2026): "não tem o botão para eles
                  extraírem caso queira selecionar um nível para ver as peças que compõem o nível".
                  Sai no padrão das planilhas da casa, com marca, tipo, nível, quantidade e peso —
                  os mesmos campos que ele já recebe na LE. */}
              <button onClick={exportar} disabled={baixando}
                className="w-full text-[12px] font-semibold px-3 py-2 rounded-md bg-[#006EAB] text-white hover:bg-[#005A8C] disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {baixando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                {selecionados ? "Exportar a seleção" : "Exportar a lista"}
              </button>

              <label className="flex items-center gap-2 text-[12px] text-[#0D1F3C] cursor-pointer border-t border-gray-100 pt-2.5">
                <input type="checkbox" checked={esconderResto} onChange={(e) => setEsconderResto(e.target.checked)} className="accent-[#006EAB]" />
                Ocultar o resto
              </label>

              <div className="border-t border-gray-100 pt-2">
                <div className="relative mb-1">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="procurar marca…"
                    className="w-full text-[12px] pl-6 pr-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-[#006EAB]" />
                </div>
                <p className="text-[10.5px] text-gray-400 px-1.5 pb-1">{listados.length} item(ns)</p>
                <div className="max-h-[220px] overflow-y-auto">
                  {listados.slice(0, 300).map((x) => (
                    <button key={x.id} onClick={() => abrir(x)}
                      className={`w-full text-left text-[12px] px-1.5 py-1 rounded flex items-baseline gap-2 hover:bg-gray-50 ${sel?.id === x.id ? "bg-orange-50" : ""}`}>
                      <span className="font-mono text-[#0D1F3C] truncate">{x.marca || tipoDe(x)}</span>
                      <span className="ml-auto text-[11px] text-gray-400 shrink-0">{x.pecas}×</span>
                    </button>
                  ))}
                  {listados.length > 300 && <p className="text-[11px] text-gray-400 px-1.5 py-1">…e mais {listados.length - 300}. Use a busca.</p>}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* ⚠⚠ `flex-1` SÓ QUANDO A LINHA É LINHA. Vitor (03/09/2026): "olha aí, está branco o
            modelo". O quadro tem 560 px de altura fixa, mas abaixo de 1024 px o contêiner vira
            COLUNA — e aí `flex-1` passa a valer no eixo vertical, com base 0: a altura de 560
            morria e o canvas nascia com 300 px de altura desenhando nada. Em coluna ele é um bloco
            de altura própria; em linha, o item que estica. */}
        <div data-cena-3d className="w-full lg:flex-1 min-w-0 relative" style={{ height: 560 }}>
          {url && (
            <VisualizadorIfc key={url} url={url} onSelecionar={abrir} onIndice={receberIndice}
              visiveis={visiveis} ocultos={ocultos} esconderResto={esconderResto}
              selecionada={sel?.id || null} altura="fill" />
          )}
        </div>

        {/* ⚠⚠ A RM SEM VALOR NENHUM. Vitor (04/09/2026): "uma vista da RM sem valores seria ótimo".
            O que o cliente vê é o que a obra PEDIU — item, material, quantidade e peso —, nunca o
            que custou: `RMItem` guarda preço, e a rota escolhe os campos um a um por causa disso. */}
        {rm && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-6"
            onClick={() => setRm(null)}>
            <div onClick={(e) => e.stopPropagation()}
              className="bg-white w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl">
              <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Requisição de material</p>
                  <h4 className="font-mono text-[16px] font-bold text-[#0D1F3C]">{rm.numero}</h4>
                  {rm.descricao && <p className="text-[13px] text-gray-600 mt-0.5">{rm.descricao}</p>}
                </div>
                <button onClick={() => setRm(null)} className="ml-auto p-1 text-gray-500 hover:text-[#0D1F3C]"><X size={16} /></button>
              </div>
              <div className="px-5 py-4">
                {rm.carregando ? (
                  <p className="text-[13px] text-gray-500 inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> abrindo…</p>
                ) : rm.erro ? (
                  <p className="text-[13px] text-gray-500">{rm.erro}</p>
                ) : (
                  <>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] mb-4">
                      <dt className="text-gray-500">Solicitada em</dt>
                      <dd className="text-[#0D1F3C]">{rm.solicitadaEm ? fmtData(rm.solicitadaEm) : SEM}</dd>
                      <dt className="text-gray-500">Setor</dt><dd className="text-[#0D1F3C]">{rm.setor || SEM}</dd>
                      <dt className="text-gray-500">Peso total</dt><dd className="text-[#0D1F3C]">{fmtKg(rm.pesoTotalKg) || SEM}</dd>
                    </dl>
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-1.5 font-medium">Item</th>
                          <th className="py-1.5 font-medium">Material</th>
                          <th className="py-1.5 font-medium text-right">Qtd</th>
                          <th className="py-1.5 font-medium text-right">Peso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(rm.itens || []).map((it, i) => (
                          <tr key={i}>
                            <td className="py-1.5 text-[#0D1F3C]">{it.descricao}</td>
                            <td className="py-1.5 text-gray-600">{it.material || "—"}{it.tratamento ? ` · ${it.tratamento}` : ""}</td>
                            <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">{it.qtd ?? "—"} {it.unidade || ""}</td>
                            <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">{it.pesoKg ? fmtKg(it.pesoKg) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {sel && (
          <aside data-painel-3d className="w-full lg:w-[330px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto" style={{ maxHeight: 560 }}>
            <div className="p-4 space-y-3">
              <button onClick={() => setOcultos((v) => new Set(v).add(sel.id))}
                className="text-[11.5px] text-gray-500 hover:text-[#0D1F3C] inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1">
                <EyeOff size={12} /> ocultar esta peça
              </button>
              {buscando && <p className="text-[13px] text-gray-500 inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> buscando…</p>}

              {!buscando && !peca && (
                <p className="text-[13px] text-gray-500">
                  <b className="font-mono text-[#0D1F3C] block">{sel.marca || "peça do modelo"}</b>
                  {SEM}
                </p>
              )}

              {peca && (
                <>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h4 className="font-mono text-[17px] font-bold text-[#0D1F3C]">{peca.marca}</h4>
                    {/* ⚠ o mesmo tipo do filtro: da lista quando ela nomeia, do IFC quando não */}
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600">{tipoDe(peca) || peca.tipo}</span>
                    <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
                      peca.etapa === "expedida" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : peca.etapa === SEM ? "border-gray-200 bg-gray-50 text-gray-500"
                      : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {peca.etapa}
                    </span>
                  </div>

                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-gray-500">Quantidade</dt><dd className="text-[#0D1F3C]">{peca.qtd}</dd>
                    <dt className="text-gray-500">Peso</dt><dd className="text-[#0D1F3C]">{fmtKg(peca.pesoKg) || SEM}</dd>
                    {peca.perfil && <><dt className="text-gray-500">Material</dt><dd className="text-[#0D1F3C]">{peca.perfil}</dd></>}
                  </dl>

                  <Bloco titulo="Expedição">
                    {peca.expedicao?.length ? (
                      <ul className="space-y-0.5 text-[13px]">
                        {peca.expedicao.map((e, i) => (
                          <li key={i} className="text-[#0D1F3C]">Romaneio {e.romaneio} · {fmtData(e.data)}</li>
                        ))}
                      </ul>
                    ) : <p className="text-[13px] text-gray-500">ainda em fabricação</p>}
                  </Bloco>

                  <Bloco titulo="Rastreabilidade">
                    {Array.isArray(peca.rastreio) ? (
                      <ul className="space-y-1 text-[12.5px]">
                        {peca.rastreio.map((r, i) => (
                          <li key={i}>
                            {/* ⚠ o R vem PRIMEIRO. Vitor (04/09/2026): "não está trazendo o número
                                da Rastreabilidade" — é por ele que se acha o material e o
                                certificado, e é o mesmo número que aparece no carimbo do desenho e
                                na §02 do data book. A corrida é atributo do R, não o contrário. */}
                            {r.r && <span className="font-mono font-semibold text-[#0D1F3C]">R {r.r}</span>}
                            <span className="text-[#0D1F3C]">{r.r ? " · " : ""}{r.material || "material"}</span>
                            {r.corrida && <span className="text-gray-500"> · corrida {r.corrida}</span>}
                            {r.norma && <span className="text-gray-500"> · {r.norma}</span>}
                            {/* ⚠ segunda linha: o que PROVA a origem — certificado, nota fiscal e o
                                peso comprado naquele R. Vitor (04/09/2026) pediu a NF e o kg; é o
                                mesmo conjunto que vai no data book §02. */}
                            {(r.certificado || r.nf || r.compradoKg) && (
                              <span className="text-gray-500 block">
                                {r.certificado && <>certificado {r.certificado}</>}
                                {r.certificado && (r.nf || r.compradoKg) ? " · " : ""}
                                {r.nf && <>NF {r.nf}</>}
                                {r.nf && r.compradoKg ? " · " : ""}
                                {r.compradoKg ? <>{fmtKg(r.compradoKg)} comprados</> : null}
                                {/* ⚠ a corrente documental: RM (o que a obra pediu) → pedido (o que
                                    foi comprado) → NF → R → corrida → certificado. Vitor
                                    (04/09/2026) pediu os dois primeiros. */}
                                {(r.pedido || r.rm) && (
                                  <span className="block">
                                    {r.rm && (
                                      <button onClick={() => abrirRm(r.rm)}
                                        className="text-[#006EAB] hover:underline font-semibold">RM {r.rm}</button>
                                    )}
                                    {r.rm && r.pedido ? " · " : ""}
                                    {r.pedido && <>pedido {r.pedido}</>}
                                  </span>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-[13px] text-gray-500">{SEM}</p>}
                  </Bloco>

                  <Bloco titulo="Relatórios de inspeção">
                    {Array.isArray(peca.relatorios) ? (
                      <ul className="space-y-0.5 text-[12.5px]">
                        {peca.relatorios.map((r, i) => (
                          <li key={i} className="text-[#0D1F3C]">{r.codigo} <span className="text-gray-500">· {String(r.tipo || "").replace(/_/g, " ").toLowerCase()} · {fmtData(r.data)}</span></li>
                        ))}
                      </ul>
                    ) : <p className="text-[13px] text-gray-500">{SEM}</p>}
                  </Bloco>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      </div>

      <p className="text-[12px] text-gray-400 inline-flex items-center gap-1.5">
        <Box size={12} /> Clique em qualquer peça do modelo para ver os dados dela.
      </p>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div className="border-t border-gray-100 pt-2">
      <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{titulo}</p>
      {children}
    </div>
  );
}
