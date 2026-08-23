"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Loader2, FileSpreadsheet, Plus, Trash2, Save, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { CLASSES, PERFIS, FATURAMENTO, FATURAMENTO_ROTULO, ESTRUTURAS, ESTRUTURA_ROTULO, METODOS, METODO_ROTULO, ITENS_COMERCIAIS, TERCEIROS_SUGESTOES, BASES_TERCEIRO, CAMADAS_TINTA, BDI_CAMPOS, LINHAS_FATURAMENTO, CFOPS, ENSAIOS, BASES_ENSAIO, cargaDoCfop, perdaDaEstrutura, precoPreMontagem, coefSugerido, rendimentoTinta, custoCamada, numeroBr, CENARIOS, analiseDeCenarios, prazoDeFabricacao, fluxoDeCaixa } from "@/lib/lqc";

const fmtR$ = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// ⚠ mesma leitura de número do cálculo — tela e conta não podem discordar do que "0,15" vale.
const num = numeroBr;

// ⚠ AS ABAS SÃO AS DA LQC, NA ORDEM DA LQC. Vitor (22/08/2026): "que você transforme cada aba da
// geração de custo igual está na nossa LQC". Quem orça já sabe onde cada coisa fica; inventar uma
// navegação "melhor" obrigaria a reaprender o que a casa faz há anos — e a conferir contra a
// planilha ficaria impossível.
// ⚠ O NOME DA ABA DA PLANILHA VIRA LEGENDA, NÃO TÍTULO. Vitor (23/08/2026): "melhore essas
// escritas — sei que trouxe da planilha dessa maneira, mas deixe melhor isso". "RESUMOS_EM" e
// "MC_TINTAS" são nomes de arquivo, não de assunto: servem para quem confere contra a LQC, e por
// isso ficam embaixo, pequenos, em vez de ocupar o rótulo que a pessoa lê o dia inteiro.
// ⚠ UMA ABA, UM ASSUNTO. Vitor (23/08/2026): "está confuso demais essa sua leitura para compor
// esses custos, não tem como simplificar? Falamos de pintura em uma área, você joga para outra
// nada a ver para preencher o custo".
//
// Antes as abas eram as da planilha, e a planilha organiza por FÓRMULA, não por assunto: a área
// pintada ficava no quantitativo, a tinta na MC_TINTAS e o preço da pintura na industrialização —
// três lugares para uma pergunta só. Agora cada aba responde uma pergunta inteira, e quem monta o
// custo não precisa saber como a LQC guarda as coisas por dentro.
const ABAS = [
  { k: "RESUMOS", r: "Quantitativo", ajuda: "o que tem na obra: peso e área" },
  { k: "MATERIAL", r: "Material", ajuda: "aço, fixadores e itens comerciais" },
  { k: "PINTURA", r: "Pintura", ajuda: "camadas, tinta e mão de obra" },
  { k: "FABRICACAO", r: "Fabricação", ajuda: "fábrica e pré-montagem" },
  { k: "TERCEIROS", r: "Terceiros", ajuda: "o que vem de fora" },
  { k: "ENSAIOS", r: "Ensaios", ajuda: "inspeção e data book" },
  { k: "BDI", r: "Impostos e BDI" },
  { k: "COMERCIAL", r: "Resumo", planilha: "PLANILHA COMERCIAL" },
  { k: "CENARIO", r: "Cenário financeiro" },
];

export default function EstudoClient({ id }) {
  const { showToast } = useStore();
  const [d, setD] = useState(null);
  const [aba, setAba] = useState("RESUMOS");
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    fetch(`/api/comercial/estudos/${id}`).then((r) => r.json()).then(setD);
  }, [id]);

  const salvar = useCallback(async (patch) => {
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/estudos/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setD((p) => ({ ...p, estudo: j.estudo, resultado: j.resultado, cenario: j.cenario }));
      setSujo(false);
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  }, [id, showToast]);

  // ⚠ salva sozinho, com atraso: composição de custo se mexe campo a campo, e obrigar a clicar
  // "salvar" a cada número é o caminho mais curto pra alguém perder meia hora de trabalho.
  const mexer = useCallback((patch) => {
    setD((p) => ({ ...p, estudo: { ...p.estudo, ...patch } }));
    setSujo(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => salvar(patch), 900);
  }, [salvar]);

  if (!d?.estudo) return <div className="p-6"><Loader2 className="animate-spin text-torg-blue" size={22} /></div>;
  const e = d.estudo, res = d.resultado || {}, c = e.composicao || {};
  const setComp = (patch) => mexer({ composicao: { ...c, ...patch } });
  const codigo = `LQC-${String(e.numero || 0).padStart(3, "0")}-${String(e.ano).slice(-2)}-R${String(e.revisao || 0).padStart(2, "0")}`;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] font-mono font-bold text-torg-blue">{codigo}</p>
          <h1 className="text-xl font-bold text-torg-dark">{e.cliente}{e.obra ? ` · ${e.obra}` : ""}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-torg-gray">
            {salvando ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> salvando…</span>
              : sujo ? "alterações pendentes" : <span className="inline-flex items-center gap-1"><Save size={11} /> salvo</span>}
          </span>
          <ImportarLqc id={id} onPronto={(j) => setD((p) => ({ ...p, estudo: j.estudo, resultado: j.resultado }))} showToast={showToast} />
          <a href={`/api/comercial/estudos/${id}/planilha`}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
            <FileSpreadsheet size={14} /> Extrair planilha
          </a>
        </div>
      </div>

      {/* barra de resultado — sempre visível, porque é a pergunta que o orçamentista faz */}
      {/* ⚠ VALOR NÃO QUEBRA. Vitor (23/08/2026): "não deixe quebrar essas coisas" — "R$
          12.096.000,00" saía com o "R$" numa linha e o número na outra. Número partido ao meio é
          número que se lê errado, e num painel de preço isso é grave. A grade abre em 3 colunas
          antes de ir pra 6: espremer seis valores de moeda numa linha só é o que causa a quebra. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden mb-5">
        <Kpi r={res.escopo?.total > res.escopo?.selecionadas ? `Peso · ${res.escopo.selecionadas} de ${res.escopo.total} áreas` : "Peso"} v={fmtKg(res.pesoTotal)} />
        <Kpi r="Custo" v={fmtR$(res.custo)} />
        <Kpi r={`BDI ${res.bdiPct || 0}%`} v={fmtR$(res.bdiValor)} />
        <Kpi r="Impostos" v={fmtR$(res.totalImpostos)} />
        <Kpi r="Preço" v={fmtR$(res.preco)} cor="text-torg-blue" />
        <Kpi r="R$/kg" v={fmtR$(res.precoPorKg)} cor="text-green-700" />
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-100">
        {ABAS.map((a) => (
          <button key={a.k} onClick={() => setAba(a.k)}
            className={`px-3 py-2 -mb-px border-b-2 text-left ${aba === a.k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            <span className="block text-[12px] font-semibold whitespace-nowrap">{a.r}</span>
            {(a.ajuda || a.planilha) && <span className="block text-[9px] opacity-60 whitespace-nowrap">{a.ajuda || a.planilha}</span>}
          </button>
        ))}
      </div>

      {aba === "RESUMOS" && <Resumos e={e} c={c} setComp={setComp} mexer={mexer} res={res} />}
      {aba === "MATERIAL" && <Material c={c} res={res} setComp={setComp} />}
      {aba === "PINTURA" && <Pintura c={c} res={res} setComp={setComp} />}
      {aba === "FABRICACAO" && <Fabricacao c={c} res={res} setComp={setComp} />}
      {aba === "TERCEIROS" && <Terceiros c={c} res={res} setComp={setComp} />}
      {aba === "ENSAIOS" && <Ensaios c={c} res={res} setComp={setComp} />}
      {aba === "BDI" && <Bdi c={c} res={res} setComp={setComp} />}
      {aba === "COMERCIAL" && <PlanilhaComercial res={res} e={e} />}
      {aba === "CENARIO" && <Cenario e={e} res={res} mexer={mexer} fabrica={d.fabrica} />}
    </div>
  );
}

/**
 * IMPORTAR A LQC — trazer o quantitativo pronto em vez de redigitar.
 *
 * Vitor (23/08/2026): "importarmos áreas levantadas nessa planilha… para preencher apenas os
 * custos". Medir a estrutura e tirar o coeficiente de superfície é trabalho de projeto, feito uma
 * vez no Excel; o custo é o que muda toda semana. Redigitar 11 áreas para conferir um preço é o
 * jeito mais rápido de a ferramenta nova não ser usada.
 */
function ImportarLqc({ id, onPronto, showToast }) {
  const [enviando, setEnviando] = useState(false);
  const ref = useRef(null);

  const enviar = async (arquivo) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const r = await fetch(`/api/comercial/estudos/${id}/importar`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      const s = j.resumo;
      showToast(`${s.areas} áreas · ${s.pesoKg.toLocaleString("pt-BR")} kg${s.comPreco ? ` · ${s.comPreco} com preço` : ""}`, "success");
      for (const a of j.avisos || []) showToast(a, "error");
      onPronto(j);
    } catch (e) { showToast(e.message, "error"); }
    finally { setEnviando(false); if (ref.current) ref.current.value = ""; }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.xlsm,.xlsb" className="hidden"
        onChange={(e) => enviar(e.target.files?.[0])} />
      <button onClick={() => ref.current?.click()} disabled={enviando}
        className="text-[12px] font-semibold text-torg-blue border border-torg-blue/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 hover:bg-torg-blue-50 disabled:opacity-50">
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar LQC
      </button>
    </>
  );
}

function Kpi({ r, v, cor }) {
  return (
    <div className="bg-white p-3 min-w-0">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider truncate">{r}</p>
      <p className={`text-[14px] font-extrabold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis ${cor || "text-torg-dark"}`} title={String(v)}>{v}</p>
    </div>
  );
}

const Inp = (p) => <input {...p} className={`border border-gray-200 rounded px-2 py-1 text-[12px] ${p.className || ""}`} />;
/** ⚠ `rotulos` mostra texto de gente sem mexer no VALOR — que é a chave que a planilha compara. */
const Sel = ({ opcoes, rotulos, ...p }) => (
  <select {...p} className={`border border-gray-200 rounded px-2 py-1 text-[12px] bg-white ${p.className || ""}`}>
    <option value="">—</option>
    {opcoes.map((o) => <option key={o} value={o}>{rotulos?.[o] || o}</option>)}
  </select>
);

/**
 * RESUMOS_EM — o quantitativo. É daqui que sai o peso por classe e por perfil.
 *
 * ⚠ CADA LINHA É UM CARTÃO, NÃO UMA LINHA DE TABELA. Vitor (22/08/2026): "precisa melhorar essa
 * projeção dessa linha, ser mais explicativo, pois está confuso e difícil de preencher".
 *
 * Ele tem razão: doze campos numa linha só cabem rolando de lado, e rolando de lado some o
 * cabeçalho — a pessoa digita sem saber em que coluna está. Pior: os campos que MAIS precisam de
 * explicação (classificação e perfil predominante) são justamente os que definem o preço, e
 * apareciam como duas palavras soltas.
 *
 * Então cada linha vira um bloco com três perguntas na ordem em que o orçamentista pensa:
 * ONDE fica · COMO se mede · DE QUE é feito. E cada escolha mostra a consequência: a faixa de
 * kg/m ao lado da classificação, o R$/kg ao lado do perfil, e o peso e o custo da linha
 * calculados na hora — porque um número que aparece na hora ensina mais que qualquer legenda.
 */
function Resumos({ e, c, setComp, mexer, res }) {
  const linhas = Array.isArray(c.resumos) ? c.resumos : [];
  const set = (i, campo, v) => setComp({ resumos: linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)) });
  const add = () => setComp({ resumos: [...linhas, { item: `1.${linhas.length + 1}`, metodo: e.metodo || "ESTIMATIVA", un: "unid", quantidade: 1, unidades: 1 }] });
  const del = (i) => setComp({ resumos: linhas.filter((_, j) => j !== i) });
  const dup = (i) => setComp({ resumos: [...linhas.slice(0, i + 1), { ...linhas[i], item: `1.${linhas.length + 1}` }, ...linhas.slice(i + 1)] });
  const pesoDe = (l) => num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit);
  const total = linhas.filter((l) => l.ativo !== false).reduce((a, l) => a + pesoDe(l), 0);
  const fora = linhas.filter((l) => l.ativo === false).reduce((a, l) => a + pesoDe(l), 0);
  const ativas = linhas.filter((l) => l.ativo !== false).length;
  const porArea = res?.porArea || [];
  // ⚠ A COR É CHAVE, NÃO ENFEITE. Vitor (23/08/2026): "o ideal seria já mencionar a cor de cada
  // tipo de estrutura". É ela que decide qual demão de acabamento cai naquele trecho — digitada
  // com um espaço a mais, a área fica sem acabamento e ninguém vê. Por isso a lista sugere as
  // cores que já existem no esquema de pintura, em vez de deixar cada um escrever do seu jeito.
  const coresDoEsquema = [...new Set((c.tintas || [])
    .filter((t) => String(t.camada || "").toUpperCase() === "ACABAMENTO" && t.cor)
    .map((t) => String(t.cor).trim()))];
  const coresConhecidas = [...new Set([...coresDoEsquema, ...linhas.map((l) => String(l.cor || "").trim()).filter(Boolean)])];

  return (
    <div>
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
        <p className="text-[12px] text-torg-gray mb-3">
          Cada bloco é um pedaço da obra. O peso lançado aqui é o que alimenta a industrialização:
          a <strong className="text-torg-dark">classificação</strong> escolhe o preço de fabricação e pintura,
          e o <strong className="text-torg-dark">perfil predominante</strong> escolhe o preço da matéria-prima.
        </p>
        {/* ⚠ nada de seletor global aqui. Método é por linha (é assim na RESUMOS_EM), demãos a
            planilha CONTA das camadas da MC_TINTAS, e pré-montagem é decisão de preço — foi pra
            aba Industrialização, junto do faturamento dela. */}
        {/* ⚠ ESCOPO SE MARCA, NÃO SE APAGA. Vitor (23/08/2026): "pode ser que ele exclua alguns
            pacotes… precisa deixar uma forma de selecionar e desselecionar, pois pode ser que ele
            peça para deixar alguma outra área, e aí evitaria de termos que refazer todo o
            levantamento". Negociação vai e volta: o cliente corta a galeria e depois pede a
            treliça. A linha desmarcada some da conta e continua guardada. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[12px] text-torg-gray">
            <strong className="text-torg-dark">{ativas} de {linhas.length}</strong> {linhas.length === 1 ? "área" : "áreas"} no escopo ·
            <strong className="text-torg-dark tabular-nums whitespace-nowrap"> {fmtKg(total)}</strong>
            {fora > 0 && <span> · {fmtKg(fora)} fora</span>}
          </span>
          {linhas.length > 1 && (
            <span className="flex items-center gap-2">
              <button onClick={() => setComp({ resumos: linhas.map((l) => ({ ...l, ativo: true })) })}
                className="text-[11px] font-semibold text-torg-blue hover:underline">marcar todas</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => setComp({ resumos: linhas.map((l) => ({ ...l, ativo: false })) })}
                className="text-[11px] font-semibold text-torg-gray hover:text-torg-dark">desmarcar todas</button>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {linhas.map((l, i) => <CartaoLinha key={i} l={l} i={i} set={set} del={del} dup={dup} porArea={porArea} cores={coresConhecidas} doEsquema={coresDoEsquema} />)}
      </div>

      <button onClick={add}
        className="mt-3 text-[12px] font-semibold text-torg-blue border border-dashed border-torg-blue/40 rounded-xl px-4 py-2.5 w-full hover:bg-torg-blue-50 inline-flex items-center justify-center gap-1.5">
        <Plus size={14} /> {linhas.length ? "Adicionar outro elemento" : "Adicionar o primeiro elemento"}
      </button>
    </div>
  );
}

/** Um elemento do quantitativo, com a consequência de cada escolha à vista. */
function CartaoLinha({ l, i, set, del, dup, porArea, cores, doEsquema }) {
  const dentro = l.ativo !== false;
  const custo = (porArea || []).find((x) => x.area === (l.area || l.item));
  // null = ainda não há esquema de acabamento para comparar
  const norma = (x) => String(x || "").trim().toUpperCase();
  const corCasa = !doEsquema?.length ? null : !l.cor ? null : doEsquema.some((x) => norma(x) === norma(l.cor));
  const classe = CLASSES.find((x) => x.nome.toUpperCase() === String(l.classificacao || "").toUpperCase());
  const perfil = PERFIS.find((p) => p.nome === l.perfil);
  const peso = num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit);
  const custoMat = perfil ? peso * perfil.preco : 0;
  const custoFab = classe ? peso * classe.fabricacao : 0;
  // a unidade do peso unitário SEGUE a unidade de medida — é o que evita lançar kg/m num item "unid"
  const unPeso = l.un === "m" ? "kg/m" : l.un === "m²" ? "kg/m²" : "kg/un";

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${dentro ? "border-gray-100" : "border-gray-200 opacity-60"}`}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b border-gray-100 ${dentro ? "bg-gray-50" : "bg-gray-100"}`}>
        <input type="checkbox" checked={dentro} onChange={(e) => set(i, "ativo", e.target.checked)}
          title={dentro ? "no escopo — desmarque para tirar da conta" : "fora do escopo — o levantamento continua guardado"}
          className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
        <span className="text-[12px] font-bold text-torg-blue font-mono">{l.item || `1.${i + 1}`}</span>
        <span className="text-[12px] font-semibold text-torg-dark">{l.area || "sem área"}</span>
        {l.estrutura && <span className="text-[12px] text-torg-gray">· {ESTRUTURA_ROTULO[l.estrutura] || l.estrutura}</span>}
        {l.elemento && <span className="text-[12px] text-torg-gray">· {l.elemento}</span>}
        {l.cor && (
          <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${corCasa === false ? "bg-[#FFF7ED] text-torg-orange-700 border border-[#F4801F]/40" : "bg-white text-torg-gray border border-gray-200"}`}>
            {l.cor}{corCasa === false ? " · sem acabamento" : ""}
          </span>
        )}
        <span className={`ml-auto text-[13px] font-extrabold tabular-nums whitespace-nowrap ${dentro ? "text-torg-dark" : "text-torg-gray line-through"}`}>{fmtKg(peso)}</span>
        {!dentro && <span className="text-[10px] font-semibold text-torg-gray uppercase tracking-wide">fora do escopo</span>}
        <button onClick={() => dup(i)} title="duplicar" className="text-gray-300 hover:text-torg-blue"><Plus size={14} /></button>
        <button onClick={() => del(i)} title="remover" className="text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
      </div>

      <div className="p-4 space-y-4">
        <Bloco titulo="Onde fica">
          <Campo r="Item" ajuda="numeração da proposta">
            <Inp value={l.item || ""} onChange={(ev) => set(i, "item", ev.target.value)} className="w-full" /></Campo>
          <Campo r="Área" ajuda="galpão, prédio, trecho">
            <Inp value={l.area || ""} onChange={(ev) => set(i, "area", ev.target.value)} className="w-full" /></Campo>
          <Campo r="Estrutura">
            <Sel value={l.estrutura || ""} onChange={(ev) => set(i, "estrutura", ev.target.value)} opcoes={ESTRUTURAS} rotulos={ESTRUTURA_ROTULO} className="w-full" /></Campo>
          <Campo r="Elemento" ajuda="tesoura, terça, pilar…">
            <Inp value={l.elemento || ""} onChange={(ev) => set(i, "elemento", ev.target.value)} className="w-full" /></Campo>
        </Bloco>

        <Bloco titulo="Como se mede" nota="Quantidade × Unidades × Peso unitário = peso do elemento">
          <Campo r="Método">
            <Sel value={l.metodo || ""} onChange={(ev) => set(i, "metodo", ev.target.value)} opcoes={METODOS} rotulos={METODO_ROTULO} className="w-full" /></Campo>
          <Campo r="Unidade de medida" ajuda="define o peso unitário abaixo">
            <Sel value={l.un || ""} onChange={(ev) => set(i, "un", ev.target.value)} opcoes={["m", "m²", "unid"]} className="w-full" /></Campo>
          <Campo r="Quantidade" ajuda={l.un === "unid" ? "quantas peças" : `quantos ${l.un || "m"}`}>
            <Inp value={l.quantidade ?? ""} onChange={(ev) => set(i, "quantidade", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Unidades" ajuda="repetições iguais (ex.: 12 pórticos)">
            <Inp value={l.unidades ?? ""} onChange={(ev) => set(i, "unidades", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r={`Peso unitário (${unPeso})`} ajuda="peso de cada unidade de medida">
            <Inp value={l.pesoUnit ?? ""} onChange={(ev) => set(i, "pesoUnit", ev.target.value)} className="w-full text-right" /></Campo>
        </Bloco>

        {/* ⚠ ÁREA INFORMADA MANDA. Vitor (23/08/2026): "deixar o campo para preencher caso
            tenhamos essa informação da área de pintura, ou veja se conseguimos fazer uma
            estimativa de área de acordo com o peso". As duas coisas, nesta ordem: quando existe
            medição, ela vence; o coeficiente é o plano B, e a tela diz qual dos dois está valendo. */}
        <Bloco titulo="Área de pintura" nota="é ela que precifica tinta e ensaio por m²">
          <Campo r="Área informada (m²)" ajuda="tem o levantamento? preencha e o resto é ignorado">
            <Inp value={l.areaM2 ?? ""} onChange={(ev) => set(i, "areaM2", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Coeficiente (m²/kg)" ajuda={`vazio usa ${coefSugerido(l.perfil).toFixed(4)} — média das nossas obras neste perfil`}>
            <Inp value={l.coef ?? ""} onChange={(ev) => set(i, "coef", ev.target.value)} className="w-full text-right" /></Campo>
          <div className="col-span-2 sm:col-span-3 lg:col-span-3 flex items-end">
            <p className="text-[11px] text-torg-gray">
              {num(l.areaM2) > 0
                ? <>Usando a área informada: <strong className="text-torg-dark">{Number(num(l.areaM2)).toLocaleString("pt-BR")} m²</strong>.</>
                : peso > 0
                  ? <>Estimando <strong className="text-torg-dark">{Math.round(peso * (num(l.coef) || coefSugerido(l.perfil))).toLocaleString("pt-BR")} m²</strong>{" "}
                      ({(num(l.coef) || coefSugerido(l.perfil)).toFixed(4)} m²/kg × peso){num(l.coef) > 0 ? "" : " — coeficiente sugerido, confira"}.</>
                  : "Lance o peso para estimar a área."}
            </p>
          </div>
        </Bloco>

        {/* ⚠ O AÇO É COTADO POR ÁREA. Descoberto na LQC-081-26-TMSA-VALE: num estudo de verdade a
            coluna "Perfil predominante" fica vazia e cada trecho tem seu R$/kg — apoios 7,62,
            treliça 6,50, galeria 7,55. O comprador cota o pacote do trecho, não "quantos quilos de
            chapa lisa tem na obra". O perfil vira plano B, para quem orçar do outro jeito. */}
        <Bloco titulo="Preço e acabamento desta área" nota="o R$/kg do aço deste trecho e a cor que ele recebe">
          <Campo r="Aço (R$/kg)" ajuda="preço cotado para esta área">
            <Inp value={l.precoKg ?? ""} onChange={(ev) => set(i, "precoKg", ev.target.value)} className="w-full text-right" /></Campo>
          <Campo r="Cor da estrutura"
            ajuda={corCasa === false ? "⚠ não há acabamento nesta cor — esta área fica sem a demão final"
              : corCasa === true ? "recebe o acabamento desta cor" : "define qual acabamento vai nesta área"}>
            <>
              <Inp value={l.cor ?? ""} list={`cores-${i}`} onChange={(ev) => set(i, "cor", ev.target.value)}
                className={`w-full ${corCasa === false ? "border-torg-orange-700" : ""}`} />
              <datalist id={`cores-${i}`}>
                {(cores || []).map((x) => <option key={x} value={x} />)}
              </datalist>
            </>
          </Campo>
          <div className="col-span-2 sm:col-span-1 lg:col-span-3 flex items-end">
            <p className="text-[11px] text-torg-gray">
              {num(l.precoKg) > 0 && peso > 0
                ? <>Aço desta área: <strong className="text-torg-dark">{fmtR$(num(l.precoKg) * peso)}</strong></>
                : "Sem o R$/kg, o aço desta área não entra no custo."}
            </p>
          </div>
        </Bloco>

        <Bloco titulo="De que é feito" nota={`opcional — só para quem orça por categoria de perfil · perda de tinta ${perdaDaEstrutura(l.estrutura)}%`}>
          <Campo r="Classificação" ajuda={classe ? `${classe.faixa} · fabricação ${fmtR$(classe.fabricacao)}/kg` : "faixa de peso por metro do perfil"}>
            <select value={l.classificacao || ""} onChange={(ev) => set(i, "classificacao", ev.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white w-full">
              <option value="">—</option>
              {CLASSES.map((x) => <option key={x.key} value={x.nome.toUpperCase()}>{x.nome} · {x.faixa}</option>)}
            </select>
          </Campo>
          <Campo r="Perfil predominante" ajuda={perfil ? `matéria-prima ${fmtR$(perfil.preco)}/kg` : "define o preço do aço desta linha"}>
            <select value={l.perfil || ""} onChange={(ev) => set(i, "perfil", ev.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white w-full">
              <option value="">—</option>
              {PERFIS.map((p) => <option key={p.nome} value={p.nome}>{p.rotulo} · {fmtR$(p.preco)}/kg</option>)}
            </select>
          </Campo>
        </Bloco>

        {peso > 0 && (
          <p className="text-[11px] text-torg-gray border-t border-gray-100 pt-3">
            <strong className="text-torg-dark">{fmtKg(peso)}</strong>
            {perfil && <> · matéria-prima <strong className="text-torg-dark">{fmtR$(custoMat)}</strong></>}
            {classe && <> · fabricação <strong className="text-torg-dark">{fmtR$(custoFab)}</strong></>}
            {custo?.custoPorKg > 0 && (
              <> · custo <strong className="text-torg-dark">{fmtR$(custo.custo)}</strong>
                {" "}(<strong className="text-torg-dark">{fmtR$(custo.custoPorKg)}/kg</strong>)</>
            )}
            {(!perfil || !classe) && <span className="text-torg-orange-700"> · falta {[!perfil && "o perfil", !classe && "a classificação"].filter(Boolean).join(" e ")} para esta linha custar</span>}
          </p>
        )}
      </div>
    </div>
  );
}

const Bloco = ({ titulo, nota, children }) => (
  <div>
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-torg-blue">{titulo}</p>
      {nota && <p className="text-[10px] text-torg-gray">{nota}</p>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>
  </div>
);

const Campo = ({ r, ajuda, children }) => (
  <label className="block min-w-0">
    <span className="block text-[11px] font-semibold text-torg-dark mb-1 truncate">{r}</span>
    {children}
    {ajuda && <span className="block text-[10px] text-torg-gray mt-0.5 leading-tight">{ajuda}</span>}
  </label>
);

/**
 * MATERIAL — o que se compra: aço, fixadores e itens comerciais.
 *
 * ⚠ É AQUI QUE "TORG OU DIRETO" FAZ SENTIDO, e só aqui (com os Terceiros). Vitor (23/08/2026):
 * "fabricação, pré-montagem, pintura, data book — tudo isso não precisa estar lá, pois sempre será
 * para a Torg". Exato: o cliente não compra fabricação de ninguém. Perguntar era pedir uma decisão
 * que não existe.
 */
function Material({ c, res, setComp }) {
  const [expandido, setExpandido] = useState(null);
  // ⚠ só as áreas NO ESCOPO: lançar telha numa área desmarcada seria orçar o que não se vende
  const areas = [...new Set((c.resumos || []).filter((l) => l.ativo !== false).map((l) => l.area || l.item).filter(Boolean))];
  const fat = c.faturamento || {};
  const setFat = (k, v) => setComp({ faturamento: { ...fat, [k]: v } });
  const it = c.itensComerciais || {};
  const setIt = (k, campo, v) => setComp({ itensComerciais: { ...it, [k]: { ...(it[k] || {}), [campo]: v } } });
  const g = res.grupos || {};

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray">
        Quem fatura o material define o imposto: <strong className="text-torg-dark">Torg fatura</strong> carrega
        ICMS e PIS/COFINS na linha; <strong className="text-torg-dark">cliente compra direto</strong> não passa pelo
        nosso faturamento — e também não recebe BDI.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-4">
          {[["materiaPrima", "Aço (matéria-prima)"], ["fixadores", "Fixadores"], ["tintas", "Tintas"], ["itensComerciais", "Itens comerciais"]].map(([k, r]) => (
            <label key={k} className="text-[11px] font-semibold text-torg-dark">{r}
              <Sel value={fat[k] || ""} onChange={(ev) => setFat(k, ev.target.value)} opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="block mt-1 w-44" /></label>
          ))}
          <label className="text-[11px] font-semibold text-torg-dark">Fixadores (R$/kg da obra)
            <Inp value={c.fixadoresRsKg ?? ""} onChange={(ev) => setComp({ fixadoresRsKg: ev.target.value })} className="block mt-1 w-32 text-right" /></label>
        </div>
      </div>

      <Quadro titulo="Aço por categoria de perfil" grupo={g.materiaPrima} vazio="Lance o perfil predominante nas linhas do quantitativo." />
      <Quadro titulo="Fixadores" grupo={g.fixadores} vazio="Informe o R$/kg dos fixadores acima." />

      {/* ⚠ QUANTIDADE POR ÁREA, senão não acompanha o escopo. Vitor (23/08/2026): "a soma sai como
          se fosse para a obra toda ainda". Telha e calha eram número absoluto e continuavam
          inteiros com 70% da obra fora. Lançando por área, desmarcar um pacote tira a telha dele
          junto — que é o que acontece na obra. */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Itens comerciais</p>
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Item</th><th className="text-left px-2 py-1.5">Un.</th>
              <th className="text-right px-2 py-1.5">Quantidade</th><th className="text-right px-2 py-1.5">Preço unit.</th>
              <th className="text-right px-4 py-1.5">Subtotal</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ITENS_COMERCIAIS.map((i) => {
              const calc = (res.grupos ? null : null) || (res.comerciaisDetalhe || []).find((x) => x.key === i.key);
              const cfg = it[i.key] || {};
              const porArea = cfg.porArea || {};
              const temPorArea = Object.values(porArea).some((v) => num(v) > 0);
              const somaAreas = areas.reduce((a2, ar) => a2 + num(porArea[ar]), 0);
              const qtd = temPorArea ? somaAreas : num(cfg.qtd);
              const preco = cfg.preco == null ? i.preco : num(cfg.preco);
              const aberta = expandido === i.key;
              return (
                <Fragment key={i.key}>
                  <tr>
                    <td className="px-4 py-1">
                      <button onClick={() => setExpandido(aberta ? null : i.key)} className="text-left hover:text-torg-blue">
                        {i.rotulo} <span className="text-[10px] text-torg-blue">{aberta ? "▾" : "▸"} por área</span>
                      </button>
                      {!temPorArea && num(cfg.qtd) > 0 && (
                        <span className="block text-[10px] text-torg-orange-700">lançado para a obra toda — não acompanha o escopo</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-torg-gray">{i.un}</td>
                    <td className="px-2 py-1 text-right">
                      {temPorArea
                        ? <span className="tabular-nums whitespace-nowrap font-semibold">{Number(qtd).toLocaleString("pt-BR")}</span>
                        : <Inp value={cfg.qtd ?? ""} onChange={(e) => setIt(i.key, "qtd", e.target.value)} className="w-24 text-right" />}
                    </td>
                    <td className="px-2 py-1 text-right"><Inp value={cfg.preco ?? i.preco} onChange={(e) => setIt(i.key, "preco", e.target.value)} className="w-24 text-right" /></td>
                    <td className="px-4 py-1 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(qtd * preco)}</td>
                  </tr>
                  {aberta && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={5} className="px-4 py-2">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {areas.map((ar) => (
                            <label key={ar} className="text-[11px] text-torg-dark flex items-center gap-2">
                              <span className="truncate flex-1" title={ar}>{ar}</span>
                              <Inp value={porArea[ar] ?? ""} onChange={(e) => setIt(i.key, "porArea", { ...porArea, [ar]: e.target.value })}
                                className="w-20 text-right" />
                            </label>
                          ))}
                        </div>
                        {!areas.length && <p className="text-[11px] text-torg-gray">Lance as áreas no quantitativo primeiro.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr className="bg-gray-50 font-bold"><td className="px-4 py-1.5" colSpan={4}>Total</td>
              <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(res.totais?.comerciais)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** FABRICAÇÃO — o que a fábrica faz. Sempre Torg, então não há o que escolher. */
function Fabricacao({ c, res, setComp }) {
  const pct = c.preMontagemPct ?? "";
  const pctNum = num(pct);
  const tabelado = pctNum === 10 || pctNum === 100;
  const g = res.grupos || {};

  return (
    <div className="space-y-4">
      <Quadro titulo="Fabricação por classe" grupo={g.fabricacao}
        vazio="Lance a classificação nas linhas do quantitativo — é ela que escolhe o preço." />

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Pré-montagem</p>
        <p className="text-[11px] text-torg-gray mb-3">Quanto da obra sai pré-montada da fábrica.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Inp value={pct} onChange={(e) => setComp({ preMontagemPct: e.target.value })} className="w-24 text-right" />
          <span className="text-[12px] text-torg-gray pb-1">%</span>
          <div className="flex flex-wrap gap-2">
            {[0, 10, 25, 50, 75, 100].map((v) => (
              <button key={v} onClick={() => setComp({ preMontagemPct: v })}
                className={`text-[11px] font-semibold rounded px-2.5 py-1 border ${pctNum === v ? "border-torg-blue text-torg-blue bg-torg-blue-50" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                {v}%
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-torg-gray mt-3">
          {pctNum === 0 ? "Sem pré-montagem."
            : tabelado ? `${pctNum}% é preço tabelado.`
              : `${pctNum}% não é tabelado — interpolado entre as âncoras de 10% e 100%.`}
        </p>
      </div>

      {pctNum > 0 && <Quadro titulo="Pré-montagem por classe" grupo={g.preMontagem} />}
    </div>
  );
}

/**
 * TERCEIROS — o que vem de fora.
 *
 * Vitor (23/08/2026): "se criar uma nova aba e colocar terceiros, para podermos fabricar alguns
 * itens, e aí ter a opção de faturamento direto ou Torg, aí tudo bem". A lista é livre porque cada
 * obra terceiriza uma coisa diferente; os atalhos cobrem o que se repete.
 */
function Terceiros({ c, res, setComp }) {
  const lista = Array.isArray(c.terceiros) ? c.terceiros : [];
  const set = (i, campo, v) => setComp({ terceiros: lista.map((t, j) => (j === i ? { ...t, [campo]: v } : t)) });
  const add = (base = {}) => setComp({ terceiros: [...lista, { descricao: "", base: "kg", faturamento: "TORG", ...base }] });
  const del = (i) => setComp({ terceiros: lista.filter((_, j) => j !== i) });
  const usados = new Set(lista.map((t) => t.chave).filter(Boolean));

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray">
        Serviço contratado fora. É onde <strong className="text-torg-dark">Torg fatura</strong> ou{" "}
        <strong className="text-torg-dark">cliente compra direto</strong> muda o preço: o que o cliente contrata
        direto não carrega nosso imposto nem recebe BDI.
      </p>

      <div className="flex flex-wrap gap-2">
        {TERCEIROS_SUGESTOES.filter((t) => !usados.has(t.chave)).map((t) => (
          <button key={t.chave} onClick={() => add(t)}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue/30 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 inline-flex items-center gap-1">
            <Plus size={12} /> {t.descricao}
          </button>
        ))}
        <button onClick={() => add()} className="text-[11px] font-semibold text-torg-gray border border-dashed border-gray-300 rounded-lg px-2.5 py-1 hover:border-torg-blue/40 inline-flex items-center gap-1">
          <Plus size={12} /> Outro serviço
        </button>
      </div>

      {lista.length === 0 && <p className="text-[13px] text-torg-gray">Nada terceirizado nesta obra.</p>}

      {lista.map((t, i) => {
        const l = res.grupos?.terceirizados?.linhas?.[i] || {};
        return (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="col-span-2">
                <Campo r="Serviço">
                  <Inp value={t.descricao ?? ""} onChange={(e) => set(i, "descricao", e.target.value)} className="w-full" /></Campo>
              </div>
              <Campo r="Área" ajuda="vazio = obra inteira">
                <Sel value={t.area || ""} onChange={(e) => set(i, "area", e.target.value)}
                  opcoes={[...new Set((c.resumos || []).map((x) => x.area).filter(Boolean))]} className="w-full" /></Campo>
              <Campo r="Cobrança" ajuda={BASES_TERCEIRO[t.base || "kg"]}>
                <Sel value={t.base || "kg"} onChange={(e) => set(i, "base", e.target.value)} opcoes={["kg", "m2", "verba"]}
                  rotulos={{ kg: "Por kg", m2: "Por m²", verba: "Valor fechado" }} className="w-full" /></Campo>
              <Campo r={t.base === "verba" ? "Valor (R$)" : "Preço unitário (R$)"}>
                <Inp value={t.precoUnit ?? ""} onChange={(e) => set(i, "precoUnit", e.target.value)} className="w-full text-right" /></Campo>
              <Campo r="Faturamento">
                <Sel value={t.faturamento || ""} onChange={(e) => set(i, "faturamento", e.target.value)}
                  opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="w-full" /></Campo>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] text-torg-gray">
                {l.foraDoEscopo
                  ? <span className="text-torg-orange-700 font-semibold">área fora do escopo — zerado</span>
                  : <>{fmtKg(l.pesoKg)} × {fmtR$(l.precoKg)} = <strong className="text-torg-dark">{fmtR$(l.subtotal)}</strong></>}
                {l.naoAcompanha && <span className="block text-torg-orange-700">valor fechado da obra toda — não encolheu com o escopo, confira</span>}
                {l.icms > 0 && <> · ICMS {fmtR$(l.icms)}</>}
                {l.pisCofins > 0 && <> · PIS/COFINS {fmtR$(l.pisCofins)}</>}
              </p>
              <button onClick={() => del(i)} className="text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}

      {lista.length > 0 && (
        <p className="text-[13px] font-bold text-torg-dark text-right">
          Total de terceiros: <span className="tabular-nums whitespace-nowrap">{fmtR$(res.grupos?.terceirizados?.total?.subtotal)}</span>
        </p>
      )}
    </div>
  );
}

function Quadro({ titulo, grupo, vazio }) {
  const temLinha = grupo?.linhas?.some((l) => l.pesoKg > 0 || l.subtotal > 0);
  if (!temLinha) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
        <p className="text-[12px] font-bold text-torg-dark">{titulo}</p>
        <p className="text-[11px] text-torg-gray mt-1">{vazio || "Sem valor lançado."}</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">{titulo}</p>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Descrição</th><th className="text-left px-2 py-1.5">Espec.</th>
            <th className="text-right px-2 py-1.5">Peso</th><th className="text-right px-2 py-1.5">R$/kg</th>
            <th className="text-right px-2 py-1.5">Subtotal</th><th className="text-right px-2 py-1.5">ICMS</th><th className="text-right px-4 py-1.5">PIS/COFINS</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {grupo.linhas.filter((l) => l.pesoKg > 0 || l.subtotal > 0).map((l, i) => (
            <tr key={i}>
              <td className="px-4 py-1">{l.nome}</td><td className="px-2 py-1 text-torg-gray">{l.espec || "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmtKg(l.pesoKg)}</td>
              <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{fmtR$(l.precoKg)}</td>
              <td className="px-2 py-1 text-right tabular-nums font-semibold whitespace-nowrap">{fmtR$(l.subtotal)}</td>
              <td className="px-2 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtR$(l.icms)}</td>
              <td className="px-4 py-1 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtR$(l.pisCofins)}</td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-bold">
            <td className="px-4 py-1.5" colSpan={4}>Total</td>
            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(grupo.total.subtotal)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(grupo.total.icms)}</td>
            <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(grupo.total.pisCofins)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * PINTURA — tudo de tinta num lugar só.
 *
 * ⚠ ESTAVA ESPALHADO EM TRÊS ABAS. Vitor (23/08/2026): "falamos de pintura em uma área, você joga
 * para outra nada a ver para preencher o custo". Era verdade: a área pintada ficava no
 * quantitativo, a tinta na MC_TINTAS e o preço da mão de obra na industrialização. A planilha
 * organiza assim porque as fórmulas dela precisam; quem monta o custo, não.
 */
function Pintura({ c, res, setComp }) {
  const t = Array.isArray(c.tintas) ? c.tintas : [];
  const linha = (i) => t[i] || {};
  const set = (i, campo, v) => {
    const novo = [...t];
    for (let k = 0; k <= i; k++) if (!novo[k]) novo[k] = {};
    const perda = linha(i).perda ?? (i === 0 ? 45 : 85);
    novo[i] = { ...linha(i), [campo]: v, perda,
      nome: perda === 85 ? "ESTRUTURA — FATOR DE PERDA: 85%" : "ESTRUTURA — FATOR DE PERDA: 45%" };
    setComp({ tintas: novo });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-[12px] text-torg-dark">
            Área a pintar: <strong className="tabular-nums whitespace-nowrap">{Number(res.areaM2 || 0).toLocaleString("pt-BR")} m²</strong>
          </p>
          <p className="text-[12px] text-torg-dark">
            Demãos: <strong>{res.demaos || 1}</strong> <span className="text-torg-gray">(uma por camada preenchida abaixo)</span>
          </p>
        </div>
        <p className="text-[11px] text-torg-gray mt-1">
          A área vem do quantitativo — informada por linha, ou estimada pelo perfil. Para mudá-la,
          é lá que se mexe.
        </p>
      </div>

      {/* ⚠ as camadas vêm do estudo (produto, cor, sólidos, película): projeto define, custo não.
          Importando a LQC, elas chegam prontas — inclusive um acabamento por cor da obra. */}
      {Array.from({ length: Math.max(2, t.length) }, (_, i) => i).map((i) => {
        const cam = { ...linha(i), perda: linha(i).perda ?? (i === 0 ? 45 : 85) };
        const areaCamada = num(cam.areaM2) > 0 ? num(cam.areaM2) : (res?.areaM2 || 0);
        const rend = rendimentoTinta(cam);
        const calc = custoCamada(cam, areaCamada);
        const pesoTinta = num(cam.pesoKg) > 0 ? num(cam.pesoKg) : (res?.pesoTotal || 0);
        return (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-[12px] font-bold text-torg-dark mb-1">
              {cam.camada ? `${cam.camada.charAt(0) + cam.camada.slice(1).toLowerCase()}` : `Camada ${i + 1}`}
              {cam.cor ? <span className="text-torg-gray"> · {cam.cor}</span> : null}
            </p>
            <p className="text-[11px] text-torg-gray mb-3">
              Perda {cam.perda}% — {cam.perda === 85 ? "guarda-corpo e escada marinheiro" : "estrutura em geral"}; vem da área, não se escolhe.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Campo r="Camada"><Sel value={cam.camada || ""} onChange={(e) => set(i, "camada", e.target.value)} opcoes={CAMADAS_TINTA} className="w-full" /></Campo>
              {[["produto", "Produto", ""], ["cor", "Cor", ""], ["solidos", "Sólidos por volume (%)", ""],
                ["peliculaSeca", "Película seca (µm)", ""], ["precoLitro", "Preço por litro (R$)", ""],
                ["areaM2", "Área desta camada (m²)", "vazio usa a área da obra"],
                ["precoKg", "Custo (R$/kg)", "vazio calcula pelo rendimento"]].map(([k, r, ajuda]) => (
                <Campo key={k} r={r} ajuda={ajuda}>
                  <Inp value={linha(i)[k] ?? ""} onChange={(e) => set(i, k, e.target.value)} className="w-full text-right" /></Campo>
              ))}
            </div>
            {/* ⚠ os passos aparecem para o número poder ser conferido: rendimento errado é o tipo de
                engano que só se descobre quando a tinta acaba no meio da obra. */}
            {rend.teorico > 0 && (
              <p className="text-[11px] text-torg-gray mt-3 pt-3 border-t border-gray-100">
                Rendimento teórico <strong className="text-torg-dark">{rend.teorico} m²/L</strong>
                {" "}({cam.solidos}% × 10 ÷ {cam.peliculaSeca} µm) · com {i === 0 ? 45 : 85}% de perda,
                prático <strong className="text-torg-dark">{rend.pratico} m²/L</strong> ·
                {" "}<strong className="text-torg-dark">{Number(areaCamada).toLocaleString("pt-BR")} m²</strong> pedem
                {" "}<strong className="text-torg-dark">{Number(calc.litros).toLocaleString("pt-BR")} L</strong>
                {cam.precoLitro ? <> = <strong className="text-torg-dark">{fmtR$(calc.total)}</strong>{pesoTinta > 0 ? <> ({fmtR$(calc.total / pesoTinta)}/kg)</> : null}</> : null}
              </p>
            )}
          </div>
        );
      })}

      {/* ⚠ A TINTA POR ÁREA, que é como a obra é comprada e aplicada. Vitor (23/08/2026): "trazer
          as áreas de pintura mencionadas na primeira parte e trazer a quantidade de tinta que
          vamos usar em cada área". Quem compra tinta compra por cor e por trecho, não um número
          único da obra — e é aqui que se vê que o guarda-corpo, com 8% da área, leva 25% da tinta. */}
      {res.pinturaPorArea?.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Tinta por área da obra</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ minWidth: 720 }}>
              <thead className="text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-4 py-1.5">Área</th><th className="text-left px-2 py-1.5">Cor</th>
                  <th className="text-right px-2 py-1.5">Área</th><th className="text-left px-2 py-1.5">Esquema</th>
                  <th className="text-right px-2 py-1.5">Película</th><th className="text-right px-2 py-1.5">Tinta</th>
                  <th className="text-right px-2 py-1.5">Diluente</th><th className="text-right px-4 py-1.5">Custo</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {res.pinturaPorArea.map((a2, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5">{a2.area} <span className="text-torg-gray">· perda {a2.perda}%</span></td>
                    <td className="px-2 py-1.5 text-torg-gray">{a2.cor || "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Number(a2.areaM2).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²</td>
                    <td className="px-2 py-1.5 text-torg-gray">
                      {a2.camadas.length ? a2.camadas.map((x) => `${x.camada.toLowerCase()}${x.produto ? ` (${x.produto})` : ""}`).join(" + ") : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{a2.peliculaTotal || "—"} µm</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{Number(a2.litros).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{Number(a2.litrosDiluente).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L</td>
                    <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(a2.custo)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-4 py-1.5" colSpan={5}>Total</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {Number(res.pinturaPorArea.reduce((a2, x) => a2 + x.litros, 0)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {Number(res.pinturaPorArea.reduce((a2, x) => a2 + x.litrosDiluente, 0)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {fmtR$(res.pinturaPorArea.reduce((a2, x) => a2 + x.custo, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
            Primer e intermediário cobrem todas as áreas do mesmo fator de perda; o acabamento vai
            só nas áreas da sua cor. A cor de cada área se define no quantitativo.
          </p>
        </div>
      )}

      <Quadro titulo="Tinta (material)" grupo={res.grupos?.tintas} vazio="Preencha uma camada acima." />
      <button onClick={() => setComp({ tintas: [...t, { perda: 45, camada: "" }] })}
        className="text-[12px] font-semibold text-torg-blue border border-dashed border-torg-blue/40 rounded-xl px-4 py-2 w-full hover:bg-torg-blue-50 inline-flex items-center justify-center gap-1.5">
        <Plus size={14} /> Acrescentar camada
      </button>

      <Quadro titulo={`Mão de obra de pintura — ${res.demaos || 1} ${res.demaos === 1 ? "demão" : "demãos"}`}
        grupo={res.grupos?.pintura} vazio="Lance a classificação nas linhas do quantitativo." />
    </div>
  );
}

/**
 * ENSAIOS DA QUALIDADE — quantos e quanto.
 *
 * Vitor (23/08/2026): "Pull-off, Salinidade, Ultrassom, Dimensional N1, Visual de Solda N1 — para
 * esses testes verificar na norma a quantidade que precisamos fazer por kg ou por m²".
 *
 * ⚠ A FREQUÊNCIA VEM PREENCHIDA MAS NÃO É A NORMA. A referência de cada ensaio está escrita ao
 * lado, mas a quantidade que se faz numa obra sai do CONTRATO e do procedimento dela — a mesma
 * norma admite planos de amostragem diferentes, e o cliente costuma apertar. Errar aqui custa dos
 * dois lados: a mais, perde-se a proposta; a menos, assume-se ensaio que não foi orçado. Por isso
 * o campo é editável e a tela pede a conferência em vez de afirmar.
 */
function Ensaios({ c, res, setComp }) {
  const cfg = c.ensaios || {};
  const set = (k, campo, v) => setComp({ ensaios: { ...cfg, [k]: { ...(cfg[k] || {}), [campo]: v } } });
  const linhas = res.ensaios?.linhas || [];

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2">
        A frequência abaixo é ponto de partida, <strong className="text-torg-dark">não a norma</strong>.
        Confira contra a especificação da obra antes de fechar o preço: a mesma norma admite planos de
        amostragem diferentes, e o cliente costuma apertar.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Ensaio</th><th className="text-left px-2 py-1.5">Base</th>
              <th className="text-right px-2 py-1.5">1 a cada</th><th className="text-right px-2 py-1.5">Universo</th>
              <th className="text-right px-2 py-1.5">Qtd.</th><th className="text-right px-2 py-1.5">Custo unit.</th>
              <th className="text-right px-4 py-1.5">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ENSAIOS.map((e) => {
              const l = linhas.find((x) => x.key === e.key) || {};
              return (
                <tr key={e.key}>
                  <td className="px-4 py-1.5">
                    <span className="block font-semibold text-torg-dark">{e.nome}</span>
                    <span className="block text-[10px] text-torg-gray">{e.norma}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Sel value={cfg[e.key]?.base || e.base} onChange={(ev) => set(e.key, "base", ev.target.value)}
                      opcoes={["kg", "m2"]} className="w-20" />
                    <span className="block text-[10px] text-torg-gray mt-0.5">{BASES_ENSAIO[l.base || e.base]}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right"><Inp value={cfg[e.key]?.cada ?? e.cada} onChange={(ev) => set(e.key, "cada", ev.target.value)} className="w-20 text-right" /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                    {(l.base || e.base) === "m2" ? `${Number(l.universo || 0).toLocaleString("pt-BR")} m²` : fmtKg(l.universo)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{l.qtd || 0}</td>
                  <td className="px-2 py-1.5 text-right"><Inp value={cfg[e.key]?.custo ?? ""} onChange={(ev) => set(e.key, "custo", ev.target.value)} className="w-24 text-right" /></td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(l.total)}</td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 font-bold"><td className="px-4 py-1.5" colSpan={6}>Total dos ensaios</td>
              <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(res.ensaios?.total)}</td></tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-torg-gray">
        Área de pintura considerada: <strong className="text-torg-dark">{Number(res.areaM2 || 0).toLocaleString("pt-BR")} m²</strong> —
        vem do coeficiente de superfície de cada linha do quantitativo, como a planilha calcula.
        {!res.areaM2 && " Sem coeficiente lançado, os ensaios por m² ficam zerados."}
        {" "}Equivale a <strong className="text-torg-dark">{fmtR$(res.ensaios?.porKg)}/kg</strong>, que é como
        a linha 2.3 da planilha (inspeção e data book) recebe esse custo.
      </p>
    </div>
  );
}

/**
 * IMPOSTOS E BDI — a aba que faltava.
 *
 * Vitor (23/08/2026): "não vi aba de impostos… o preço da planilha comercial está errado".
 *
 * ⚠ ERA A MESMA CAUSA. Na LQC o BDI não é um número solto: é composto
 * `(1+adm+seguro+risco)/(1−(impostos+factoring+margem+comissões))−1`, e mora na aba BDI junto com
 * a tabela de tributos por CFOP. O portal tinha um campo "BDI %" que não existia na planilha —
 * então a planilha saía com BDI zero e imposto nenhum, e o preço vinha errado.
 *
 * ⚠ E O BDI SÓ INCIDE SOBRE O QUE PASSA PELA TORG: o que o cliente compra direto entra na venda
 * pelo custo, sem margem. É o que a aba mostra separado.
 */
function Bdi({ c, res, setComp }) {
  const bdi = c.bdi || {};
  const cfops = c.cfops || {};
  const set = (k, v) => setComp({ bdi: { ...bdi, [k]: v } });
  const noCusto = BDI_CAMPOS.filter((x) => x.onde === "custo");
  const naVenda = BDI_CAMPOS.filter((x) => x.onde === "venda");

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Composição do BDI</p>
        <p className="text-[11px] text-torg-gray mb-4">
          BDI = (1 + administração + seguro + risco) ÷ (1 − impostos − factoring − margem − comissões) − 1.
          Os três primeiros são custo indireto; os quatro últimos incidem sobre a venda.
        </p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...noCusto, ...naVenda].map((campo) => (
            <label key={campo.key} className="text-[11px] text-torg-dark">
              {campo.nome} (%)
              <Inp value={bdi[campo.key] ?? ""} onChange={(e) => set(campo.key, e.target.value)} className="block mt-1 w-full text-right" />
              <span className="block text-[10px] text-torg-gray mt-0.5">{campo.onde === "custo" ? "sobre o custo" : "sobre a venda"}</span>
            </label>
          ))}
        </div>
        <dl className="mt-5 space-y-1 text-[13px] max-w-md">
          <Linha r="Custo faturado pela Torg" v={fmtR$(res.custoTorg)} />
          <Linha r="Custo em faturamento direto" v={fmtR$(res.custoDireto)} />
          <Linha r={`BDI (${res.bdiPct || 0}%) — só sobre o que a Torg fatura`} v={fmtR$(res.bdiValor)} />
          <Linha r="Preço de venda" v={fmtR$(res.preco)} forte />
          <Linha r="Preço por kg" v={fmtR$(res.precoPorKg)} />
        </dl>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-[12px] font-bold text-torg-dark">Impostos por linha de faturamento</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            O CFOP escolhe a coluna da tabela de tributos. PIS e COFINS entram sobre a base sem ICMS —
            somar tudo direto infla a carga e encarece a proposta à toa.
          </p>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-5 py-1.5">Linha</th><th className="text-left px-2 py-1.5">CFOP / cód.</th>
              <th className="text-right px-2 py-1.5">Base</th><th className="text-right px-2 py-1.5">Carga</th><th className="text-right px-5 py-1.5">Imposto</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(res.impostos || []).map((l) => (
              <tr key={l.key}>
                <td className="px-5 py-1.5">{l.nome}</td>
                <td className="px-2 py-1.5">
                  <select value={cfops[l.key] || l.padrao} onChange={(e) => setComp({ cfops: { ...cfops, [l.key]: e.target.value } })}
                    className="border border-gray-200 rounded px-2 py-1 text-[12px] bg-white">
                    {CFOPS.map((f) => <option key={f.cod} value={f.cod}>{f.rotulo}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(l.base)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{l.cargaPct}%</td>
                <td className="px-5 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">{fmtR$(l.valor)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold"><td className="px-5 py-1.5" colSpan={4}>Total de impostos</td>
              <td className="px-5 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(res.totalImpostos)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-3">Carga por CFOP</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CFOPS.map((f) => (
            <div key={f.cod} className="flex justify-between gap-3 text-[11px] border border-gray-100 rounded px-2.5 py-1.5">
              <span className="text-torg-gray truncate">{f.rotulo}</span>
              <span className="font-semibold tabular-nums text-torg-dark shrink-0 whitespace-nowrap">{Math.round(cargaDoCfop(f.cod) * 10000) / 100}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const Linha = ({ r, v, forte }) => (
  <div className={`flex justify-between gap-4 ${forte ? "font-bold text-torg-dark border-t border-gray-100 pt-1" : "text-torg-gray"}`}>
    <dt>{r}</dt><dd className="tabular-nums whitespace-nowrap">{v}</dd>
  </div>
);

function PlanilhaComercial({ res, e }) {
  const t = res.totais || {};
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden max-w-4xl">
      <table className="w-full text-[13px]">
        <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-2">Item</th><th className="text-left px-2 py-2">Descrição</th>
            <th className="text-left px-2 py-2">un.</th><th className="text-right px-2 py-2">Quant.</th>
            <th className="text-right px-2 py-2">Unit. R$</th><th className="text-right px-4 py-2">Valor R$</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          <tr><td className="px-4 py-2 font-semibold">1</td><td className="px-2 py-2 font-semibold" colSpan={5}>Fornecimento de estruturas metálicas</td></tr>
          <tr>
            <td className="px-4 py-2">1.1</td>
            <td className="px-2 py-2">Fornecimento das estruturas metálicas{e.obra ? ` — ${e.obra}` : ""}</td>
            <td className="px-2 py-2">kg</td>
            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{Number(res.pesoTotal || 0).toLocaleString("pt-BR")}</td>
            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(res.precoPorKg)}</td>
            <td className="px-4 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{fmtR$(res.preco)}</td>
          </tr>
          <tr className="bg-gray-50 font-bold"><td className="px-4 py-2" colSpan={5}>Total geral</td>
            <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(res.preco)}</td></tr>
        </tbody>
      </table>
      <div className="p-4 border-t border-gray-100 grid sm:grid-cols-4 gap-3 text-[12px]">
        <Kpi r="Material" v={fmtR$(t.material?.subtotal)} />
        <Kpi r="MDO terceirizada" v={fmtR$(t.mdo?.subtotal)} />
        <Kpi r="Industrialização" v={fmtR$(t.industrializacao?.subtotal)} />
        <Kpi r="Itens comerciais" v={fmtR$(t.comerciais)} />
      </div>
    </div>
  );
}

/**
 * CENÁRIO FINANCEIRO — os três cenários, como o Comercial já faz.
 *
 * ⚠ REFEITO CONTRA A LQC REAL (LQC-081-26-TMSA-VALE, 23/08/2026). Eu tinha inventado um fluxo de
 * caixa; a aba que o Comercial usa é outra coisa — as mesmas sete alavancas do BDI em três
 * colunas, e quanto de lucro se ganha ou se perde entre elas.
 *
 * É assim que uma proposta é defendida: ninguém entra numa reunião com "a margem é 10%", entra
 * sabendo quanto pode ceder antes de a obra virar prejuízo. Na TMSA/VALE, margem de 5% dá BDI
 * 33,9% e preço R$ 51,2 mi; 15% dá 54,6% e R$ 59,1 mi — R$ 6,3 milhões de lucro entre os extremos.
 */
function Cenario({ e, res, mexer, fabrica }) {
  const cfg = e.cenario || {};
  const set = (cen, k, v) => mexer({ cenario: { ...cfg, [cen]: { ...(cfg[cen] || {}), [k]: v } } });
  const analise = analiseDeCenarios(res.custoTorg, res.custoDireto, {
    base: { ...(res.bdiCampos || {}), ...(cfg.base || {}) },
    conservador: cfg.conservador || {},
    otimista: cfg.otimista || {},
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        <Kpi r="Material" v={fmtR$(res.totais?.material?.subtotal)} />
        <Kpi r="Terceiros" v={fmtR$(res.totais?.mdo?.subtotal)} />
        <Kpi r="Industrialização" v={fmtR$(res.totais?.industrializacao?.subtotal)} />
        <Kpi r="Custo total" v={fmtR$(res.custo)} />
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Alavancas, por cenário</p>
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Alavanca</th>
              {CENARIOS.map((c) => <th key={c.key} className="text-right px-3 py-1.5">{c.nome}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {BDI_CAMPOS.map((campo) => (
              <tr key={campo.key}>
                <td className="px-4 py-1">{campo.nome} <span className="text-torg-gray">(%)</span></td>
                {CENARIOS.map((c) => (
                  <td key={c.key} className="px-3 py-1 text-right">
                    <Inp value={cfg[c.key]?.[campo.key] ?? ""}
                      placeholder={String(analise.find((x) => x.key === c.key)?.alavancas?.[campo.key] ?? "0")}
                      onChange={(ev) => set(c.key, campo.key, ev.target.value)} className="w-20 text-right" />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-1">Fator de custo <span className="text-torg-gray">(% do custo base)</span></td>
              {CENARIOS.map((c) => (
                <td key={c.key} className="px-3 py-1 text-right">
                  <Inp value={cfg[c.key]?.fatorCusto ?? ""} placeholder="100"
                    onChange={(ev) => set(c.key, "fatorCusto", ev.target.value)} className="w-20 text-right" /></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Resultado</p>
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5" />{CENARIOS.map((c) => <th key={c.key} className="text-right px-3 py-1.5">{c.nome}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[["Custo ajustado", (x) => fmtR$(x.custo)], ["BDI", (x) => `${x.bdiPct}%`],
              ["BDI (R$)", (x) => fmtR$(x.bdiValor)], ["Preço de venda", (x) => fmtR$(x.preco)],
              ["Lucro estimado", (x) => fmtR$(x.lucro)],
              ["Δ lucro vs. base", (x) => (x.key === "base" ? "—" : fmtR$(x.deltaLucro))]].map(([r, fn]) => (
              <tr key={r} className={r === "Preço de venda" ? "bg-torg-blue-50/40 font-bold" : ""}>
                <td className="px-4 py-1.5">{r}</td>
                {analise.map((x) => (
                  <td key={x.key} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${r === "Δ lucro vs. base" && x.deltaLucro < 0 ? "text-red-600" : r === "Δ lucro vs. base" && x.deltaLucro > 0 ? "text-green-700" : ""}`}>
                    {fn(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fabrica?.capacidadeKgMes > 0 && (
        <>
          <PrazoDoLucro res={res} analise={analise} fabrica={fabrica} />
          <FluxoDoDinheiro res={res} base={analise.find((x) => x.key === "base")} fabrica={fabrica} cfg={cfg} mexer={mexer} />
        </>
      )}

      <p className="text-[11px] text-torg-gray">
        O BDI incide só sobre o que a Torg fatura ({fmtR$(res.custoTorg)}); o que o cliente compra
        direto ({fmtR$(res.custoDireto)}) entra na venda pelo custo.
      </p>
    </div>
  );
}

/**
 * PRAZO — até quando a obra ainda dá lucro.
 *
 * Vitor (23/08/2026): "para termos lucro, qual seria o prazo que poderíamos fazer?".
 *
 * ⚠ NÃO SE SOMA A INDUSTRIALIZAÇÃO COM O CUSTO OPERACIONAL — é a mesma despesa contada duas
 * vezes, e foi o erro da primeira versão. O custo mensal da casa (R$ 784.270) É a folha dos oito
 * setores mais todos os outros custos; a industrialização que o estudo cobra é justamente a mão
 * de obra dessa casa. A conta certa separa o que SAI da empresa do que fica dentro:
 *
 *   receita − impostos − material − terceiros = sobra para pagar a casa e lucrar
 *   prazo máximo = sobra ÷ custo mensal da casa
 *
 * ⚠ E A OCUPAÇÃO NÃO MUDA NADA: metade da fábrica dobra o prazo e corta o custo atribuído pela
 * metade. Quem muda se a obra fecha é o PREÇO ou a CADÊNCIA — nunca a fatia ocupada.
 */
function PrazoDoLucro({ res, analise, fabrica }) {
  const prazos = analise.map((c) => ({
    ...c,
    p: prazoDeFabricacao(
      { pesoKg: res.pesoTotal, preco: c.preco, impostos: c.preco * ((numeroBr(c.alavancas?.impostos) || 0) / 100), custosExternos: res.custosExternos },
      { capacidadeKgMes: fabrica.capacidadeKgMes, custoOperacionalMes: fabrica.custoOperacionalMes },
    ),
  })).filter((x) => x.p);
  if (!prazos.length) return null;
  const base = prazos.find((x) => x.key === "base");

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">Prazo em que a obra ainda dá lucro</p>
        {/* ⚠ CADÊNCIA É POR SETOR, E VALE O GARGALO. Vitor: "696 t no mês não é uma realidade;
            você deve estar somando a produção de cada setor". Estava — a mesma peça passa por
            corte, montagem, solda, acabamento, jato e pintura. */}
        <p className="text-[11px] text-torg-gray mt-0.5">
          A fábrica entrega no ritmo do setor mais lento:{" "}
          <strong className="text-torg-dark">{fabrica.setorGargalo} — {fabrica.capacidadeKgMes.toLocaleString("pt-BR")} kg/mês</strong>{" "}
          ({fabrica.mesesConsiderados} meses, {fabrica.periodo}). A casa custa{" "}
          <strong className="text-torg-dark">{fmtR$(fabrica.custoOperacionalMes)}/mês</strong> — folha dos setores mais os demais custos.
        </p>
        <p className="text-[11px] text-torg-gray mt-1.5">
          {(fabrica.setores || []).map((x) => `${x.setor} ${x.kgMes.toLocaleString("pt-BR")}`).join(" · ")} kg/mês.
          <span className="block">Não se somam: a mesma peça passa por todos.</span>
        </p>
      </div>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Cenário</th>
            <th className="text-right px-3 py-1.5">Sobra p/ a casa</th>
            <th className="text-right px-3 py-1.5">Prazo máximo</th>
            <th className="text-right px-3 py-1.5">A fábrica leva</th>
            <th className="text-right px-4 py-1.5">Resultado</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {prazos.map((x) => (
            <tr key={x.key} className={x.key === "base" ? "bg-torg-blue-50/40 font-semibold" : ""}>
              <td className="px-4 py-1.5">{x.nome}</td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(x.p.sobra)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{x.p.mesesLimite} meses</td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{x.p.mesesPrevistos} meses</td>
              <td className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${x.p.fecha ? "text-green-700" : "text-red-600"}`}>
                {x.p.fecha ? `sobra ${x.p.folgaMeses} m` : `falta ${Math.abs(x.p.folgaMeses)} m`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {base && (
        <p className="text-[11px] text-torg-gray px-4 py-3 border-t border-gray-100">
          {base.p.fecha
            ? <>No cenário base a obra pode levar até <strong className="text-torg-dark">{base.p.mesesLimite} meses</strong> e
               a fábrica leva {base.p.mesesPrevistos} — sobram {base.p.folgaMeses} meses.</>
            : <>No cenário base a obra só dá lucro até <strong className="text-torg-dark">{base.p.mesesLimite} meses</strong>,
               mas a fábrica leva <strong className="text-torg-dark">{base.p.mesesPrevistos}</strong>. Nesse prazo o resultado
               é <strong className="text-red-600">{fmtR$(base.p.lucroNoPrazoReal)}</strong>. Para caber, o{" "}
               <strong className="text-torg-dark">{fabrica.setorGargalo?.toLowerCase()}</strong> precisaria fazer{" "}
               <strong className="text-torg-dark">{base.p.cadenciaNecessariaKgMes.toLocaleString("pt-BR")} kg/mês</strong>{" "}
               ({((base.p.cadenciaNecessariaKgMes / fabrica.capacidadeKgMes - 1) * 100).toFixed(0)}% acima de hoje) — ou o preço subir.</>}
          {" "}Ocupar menos da fábrica não resolve: dobra o prazo e corta o custo pela metade, na mesma proporção.
        </p>
      )}
    </div>
  );
}

/**
 * O DINHEIRO — quem paga o material até o cliente pagar.
 *
 * Vitor (23/08/2026): "só que você levou em consideração que vamos precisar comprar o material
 * todo dessa obra?".
 *
 * ⚠ MATERIAL NÃO É SÓ VALOR, É MOMENTO. Os R$ 20,3 milhões de aço, tinta e fixador saem do nosso
 * caixa antes de o cliente medir a primeira peça. A conta de prazo tratava isso como um custo
 * qualquer, subtraído da receita — e um custo subtraído não mostra quanto tempo o dinheiro fica
 * fora.
 *
 * ⚠ E O BDI JÁ RESERVA UMA LINHA PARA ISSO ("despesas financeiras / factoring"). Se ela for menor
 * que o juro real do período, a diferença sai do lucro sem aparecer em lugar nenhum. É esse
 * confronto que a tabela faz.
 */
function FluxoDoDinheiro({ res, base, fabrica, cfg, mexer }) {
  const set = (k, v) => mexer({ cenario: { ...cfg, [k]: v } });
  const meses = numeroBr(cfg.mesesFabricacao) || Math.max(1, Math.round((res.pesoTotal / fabrica.capacidadeKgMes) * 10) / 10);
  const reserva = (base?.preco || 0) * ((numeroBr(base?.alavancas?.factoring) || 0) / 100);
  const f = fluxoDeCaixa({
    meses,
    preco: base?.preco || 0,
    impostos: (base?.preco || 0) * ((numeroBr(base?.alavancas?.impostos) || 0) / 100),
    material: res.totais?.material?.subtotal || 0,
    terceiros: res.totais?.mdo?.subtotal || 0,
    custoOperacionalMes: fabrica.custoOperacionalMes,
    reservaFinanceira: reserva,
  }, {
    entradaPct: cfg.entradaPct ?? 10,
    entregaPct: cfg.entregaPct ?? 10,
    prazoFornecedorDias: cfg.prazoFornecedorDias ?? 30,
    taxaMensalPct: cfg.taxaMensalPct ?? 1.5,
    mesesCompraMaterial: cfg.mesesCompraMaterial,
  });

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">O dinheiro: comprar o material antes de receber</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          São <strong className="text-torg-dark">{fmtR$(res.totais?.material?.subtotal)}</strong> de aço, tinta e
          fixador que saem do nosso caixa antes de o cliente medir a primeira peça.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
          {[["mesesFabricacao", "Prazo (meses)", String(meses)],
            ["entradaPct", "Entrada (%)", "10"],
            ["entregaPct", "Entrega (%)", "10"],
            ["prazoFornecedorDias", "Fornecedor (dias)", "30"],
            ["taxaMensalPct", "Custo do dinheiro (% a.m.)", "1,5"]].map(([k, r, ph]) => (
            <label key={k} className="text-[11px] text-torg-dark">{r}
              <Inp value={cfg[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} className="block mt-1 w-full text-right" /></label>
          ))}
        </div>
        <p className="text-[10px] text-torg-gray mt-1.5">
          O saldo das medições é o que sobra de entrada e entrega. Sem entrada, a obra inteira é financiada por nós.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Kpi r="Capital de giro no pior mês" v={fmtR$(f.capitalDeGiro)} cor="text-torg-orange-700" />
        <Kpi r="Custo financeiro do período" v={fmtR$(f.custoFinanceiro)} />
        <Kpi r="Reservado no BDI" v={fmtR$(f.reservadoNoBdi)} />
        <Kpi r={f.diferenca >= 0 ? "Sobra da reserva" : "Falta na reserva"} v={fmtR$(Math.abs(f.diferenca))}
          cor={f.diferenca >= 0 ? "text-green-700" : "text-red-600"} />
      </div>

      {f.diferenca < 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-t border-[#F4801F]/30 px-4 py-2.5">
          A linha de despesas financeiras do BDI reservou <strong>{fmtR$(f.reservadoNoBdi)}</strong> e o dinheiro
          parado custa <strong>{fmtR$(f.custoFinanceiro)}</strong> em {meses} meses.
          A diferença de <strong className="text-red-600">{fmtR$(Math.abs(f.diferenca))}</strong> sai do lucro
          sem aparecer na composição — subir o factoring no BDI é o que traz esse custo para o preço.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Mês</th><th className="text-right px-3 py-1.5">Recebimento</th>
              <th className="text-right px-3 py-1.5">Desembolso</th><th className="text-right px-3 py-1.5">Juros</th>
              <th className="text-right px-4 py-1.5">Saldo acumulado</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {f.fluxo.filter((x) => x.entrada || x.saida || x.saldo).map((x) => (
              <tr key={x.mes}>
                <td className="px-4 py-1 whitespace-nowrap">{x.mes === 0 ? "assinatura" : `mês ${x.mes}`}</td>
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-green-700">{x.entrada ? fmtR$(x.entrada) : "—"}</td>
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">{x.saida ? `− ${fmtR$(x.saida)}` : "—"}</td>
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-torg-gray">{x.juros ? `− ${fmtR$(x.juros)}` : "—"}</td>
                <td className={`px-4 py-1 text-right tabular-nums whitespace-nowrap font-semibold ${x.saldo < 0 ? "text-red-600" : "text-torg-dark"}`}>{fmtR$(x.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
