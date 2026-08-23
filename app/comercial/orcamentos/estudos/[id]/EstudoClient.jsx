"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Loader2, FileSpreadsheet, Plus, Trash2, Save, Upload } from "lucide-react";
import { useStore } from "@/lib/store";
import { CLASSES, PERFIS, FATURAMENTO, FATURAMENTO_ROTULO, ESTRUTURAS, ESTRUTURA_ROTULO, METODOS, METODO_ROTULO, ITENS_COMERCIAIS, TERCEIROS_SUGESTOES, BASES_TERCEIRO, MODOS_FRETE, APRESENTACAO_FRETE, CAPACIDADE_CARGA, EVENTOS_PAGAMENTO, PAGAMENTO_PADRAO, PRAZOS_PAGAMENTO, conferirPagamento, CAMADAS_TINTA, BDI_CAMPOS, LINHAS_FATURAMENTO, CFOPS, ENSAIOS, BASES_ENSAIO, cargaDoCfop, perdaDaEstrutura, precoPreMontagem, coefSugerido, rendimentoTinta, custoCamada, numeroBr, CENARIOS, analiseDeCenarios, prazoDeFabricacao, fluxoDeCaixa, resultadoDoCenario, sensibilidade, ALAVANCAS_SENSIVEIS, equilibrioConvergido } from "@/lib/lqc";
import { capacidadePorHora } from "@/lib/fabrica-horas";

const fmtR$ = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** ⚠ CARTÃO É ESTREITO E NÚMERO NÃO QUEBRA. "R$ 46.958.004,32" não cabe num KPI; "R$ 46,96 mi" cabe
    e se lê de longe. A precisão continua nas tabelas, que rolam na horizontal. */
const fmtMi = (v) => {
  const x = Number(v || 0);
  if (Math.abs(x) >= 1e6) return `R$ ${(x / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
  if (Math.abs(x) >= 1e3) return `R$ ${(x / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  return fmtR$(x);
};
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
  { k: "FRETE", r: "Frete", ajuda: "transporte até a obra" },
  { k: "ENSAIOS", r: "Ensaios", ajuda: "inspeção e data book" },
  { k: "PAGAMENTO", r: "Forma de pagamento", ajuda: "quando o dinheiro entra" },
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
      {aba === "FABRICACAO" && <Fabricacao c={c} res={res} setComp={setComp} custoFabrica={d.custoFabrica} />}
      {aba === "TERCEIROS" && <Terceiros c={c} res={res} setComp={setComp} />}
      {aba === "FRETE" && <Frete c={c} res={res} setComp={setComp} />}
      {aba === "ENSAIOS" && <Ensaios c={c} res={res} setComp={setComp} />}
      {aba === "PAGAMENTO" && <Pagamento c={c} res={res} setComp={setComp} />}
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
function Fabricacao({ c, res, setComp, custoFabrica }) {
  // ⚠ só as áreas no escopo: pré-montar o que não se vende não existe
  const areasDisponiveis = [...new Set((c.resumos || []).filter((l) => l.ativo !== false).map((l) => l.area || l.item).filter(Boolean))];
  const pct = c.preMontagemPct ?? "";
  const pctNum = num(pct);
  const tabelado = pctNum === 10 || pctNum === 100;
  const g = res.grupos || {};

  return (
    <div className="space-y-4">
      {custoFabrica && <CustoDaFabrica cf={custoFabrica} c={c} setComp={setComp} />}

      <Quadro titulo="Fabricação por classe" grupo={g.fabricacao}
        vazio="Lance a classificação nas linhas do quantitativo — é ela que escolhe o preço." />

      {/* ⚠ NÃO SE PRÉ-MONTA "25% DA OBRA". Vitor (23/08/2026): "na pré-montagem vale deixar
          selecionar as áreas que serão pré-montadas". Pré-monta-se a galeria e a treliça — as
          peças que vão inteiras para o canteiro. Escolhendo as áreas, o percentual SAI da conta
          em vez de ser adivinhado, e o peso é o daquelas áreas, não uma fatia teórica espalhada. */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Pré-montagem</p>
        <p className="text-[11px] text-torg-gray mb-3">Escolha as áreas que saem pré-montadas da fábrica.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {areasDisponiveis.map((a2) => {
            const marcada = (c.preMontagemAreas || []).includes(a2);
            return (
              <label key={a2} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 cursor-pointer ${marcada ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
                <input type="checkbox" checked={marcada}
                  onChange={(e) => setComp({ preMontagemAreas: e.target.checked
                    ? [...(c.preMontagemAreas || []), a2]
                    : (c.preMontagemAreas || []).filter((x) => x !== a2) })}
                  className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                <span className="text-[11px] text-torg-dark truncate" title={a2}>{a2}</span>
              </label>
            );
          })}
          {!areasDisponiveis.length && <p className="text-[11px] text-torg-gray col-span-full">Lance as áreas no quantitativo primeiro.</p>}
        </div>

        {res.preMont?.porArea ? (
          <p className="text-[11px] text-torg-gray mt-3">
            <strong className="text-torg-dark">{fmtKg(res.preMont.pesoKg)}</strong> pré-montados —{" "}
            {res.preMont.pctDaObra}% do peso da obra, que é o que escolhe a coluna de preço.
            {res.preMont.pctDaObra !== 10 && res.preMont.pctDaObra !== 100 && " Não é percentual tabelado: interpolado entre 10% e 100%."}
          </p>
        ) : (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] text-torg-gray mb-2">Sem área marcada, dá para usar um percentual da obra:</p>
            <div className="flex flex-wrap items-center gap-2">
              <Inp value={pct} onChange={(e) => setComp({ preMontagemPct: e.target.value })} className="w-20 text-right" />
              <span className="text-[12px] text-torg-gray">%</span>
              {[0, 10, 25, 50, 100].map((v) => (
                <button key={v} onClick={() => setComp({ preMontagemPct: v })}
                  className={`text-[11px] font-semibold rounded px-2.5 py-1 border ${pctNum === v ? "border-torg-blue text-torg-blue bg-torg-blue-50" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                  {v}%
                </button>
              ))}
            </div>
            <p className="text-[11px] text-torg-gray mt-2">
              {pctNum === 0 ? "Sem pré-montagem."
                : tabelado ? `${pctNum}% é preço tabelado.`
                  : `${pctNum}% não é tabelado — interpolado entre as âncoras de 10% e 100%.`}
            </p>
          </div>
        )}

        {res.preMont?.total > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark mb-2">Como aparece na proposta</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[["diluido", "Diluída no R$/kg", "some ao preço da estrutura"],
                ["separado", "Item separado", "linha própria na proposta, fora do R$/kg"]].map(([k, nome, ajuda]) => (
                <label key={k} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer ${res.preMont.apresentacao === k ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
                  <input type="radio" name="apresPre" checked={res.preMont.apresentacao === k}
                    onChange={() => setComp({ preMontagemApresentacao: k })} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-torg-dark">{nome}</span>
                    <span className="block text-[11px] text-torg-gray">{ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-torg-gray mt-2">
              {fmtR$(res.preMont.total)} — equivale a {fmtR$(res.preMont.porKg)}/kg da obra.
            </p>
          </div>
        )}
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
              {t.base === "verba" && !t.area && (
                <Campo r="Escopo" ajuda={t.escopoFixo ? "não encolhe" : "encolhe com o escopo"}>
                  <label className="flex items-center gap-2 text-[11px] text-torg-dark mt-1">
                    <input type="checkbox" checked={!!t.escopoFixo} onChange={(e) => set(i, "escopoFixo", e.target.checked)}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                    travar valor
                  </label>
                </Campo>
              )}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] text-torg-gray">
                {l.foraDoEscopo
                  ? <span className="text-torg-orange-700 font-semibold">área fora do escopo — zerado</span>
                  : <>{fmtKg(l.pesoKg)} × {fmtR$(l.precoKg)} = <strong className="text-torg-dark">{fmtR$(l.subtotal)}</strong></>}
                {l.naoAcompanha && <span className="block text-torg-orange-700">travado — não encolheu com o corte de escopo, confira</span>}
                {!l.escopoFixo && l.fracaoEscopo < 0.999 && l.base === "verba" && !l.area && (
                  <span className="block">valor do levantamento inteiro, ajustado para {(l.fracaoEscopo * 100).toFixed(0)}% do peso</span>
                )}
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
          {/* ⚠ O SPLIT É NEGOCIAÇÃO, NÃO CONSTANTE. Vitor (23/08/2026): "de onde você tirou o valor
              de 5% de projeto? Temos acordos da forma de pagamento já negociados com o cliente".
              Os 5% vieram da planilha dele e eu tinha copiado sem perguntar. Projeto sai como
              SERVIÇO e industrialização como INDUSTRIALIZAÇÃO PARA TERCEIRO — o CFOP é outro e a
              carga também, então o percentual move o imposto do contrato inteiro. */}
          <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-gray-100">
            <label className="text-[11px] font-semibold text-torg-dark">
              Parcela faturada como projeto (%)
              <Inp value={c.faturamentoSplit?.projetoPct ?? ""} placeholder="5"
                onChange={(e) => setComp({ faturamentoSplit: { ...(c.faturamentoSplit || {}), projetoPct: e.target.value } })}
                className="block mt-1 w-24 text-right" />
            </label>
            <p className="text-[11px] text-torg-gray flex-1 min-w-[240px]">
              {res.splitFaturamento?.projetoHerdado
                ? <span className="text-torg-orange-700">
                    Está usando 5%, herdado da planilha de estudo — <strong>não é regra</strong>.
                    Confirme com o acordo de pagamento negociado com este cliente.
                  </span>
                : <>Do faturamento Torg de {fmtR$(res.splitFaturamento?.vendaTorg)}, {res.splitFaturamento?.projetoPct}% sai
                   como serviço de projeto e o restante como industrialização.</>}
            </p>
          </div>
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

/**
 * RESUMO — uma linha por área, como na PLANILHA COMERCIAL da LQC.
 *
 * Vitor (23/08/2026): "você trouxe o total da obra, não trouxe o peso separado por área que
 * selecionei, não trouxe o total somente das áreas que mencionei".
 *
 * ⚠ UMA LINHA SÓ NÃO SERVE PARA NEGOCIAR. O cliente corta pacote por pacote, e a proposta precisa
 * dizer quanto custa cada um — é o que a PLANILHA COMERCIAL da LQC faz, uma linha por área com o
 * R$/kg dela. Aqui só entram as áreas do escopo; as desmarcadas ficam listadas abaixo, apagadas,
 * para não sumirem da vista de quem negocia.
 *
 * ⚠ E O R$/kg DE CADA ÁREA CARREGA TUDO: aço, tinta pela cor, fabricação, pintura, mais o rateio
 * por peso de fixador, ensaio e frete. A soma das áreas fecha com o custo do estudo ao centavo —
 * é o que garante que nada se perdeu nem foi contado duas vezes no caminho.
 */
function PlanilhaComercial({ res, e }) {
  const t = res.totais || {};
  const dentro = (res.porArea || []).filter((a) => a.ativo);
  const fora = (res.porArea || []).filter((a) => !a.ativo);
  const pesoDentro = dentro.reduce((a, x) => a + x.pesoKg, 0);
  const precoDentro = dentro.reduce((a, x) => a + x.preco, 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[12px] font-bold text-torg-dark">
            Fornecimento de estruturas metálicas{e.obra ? ` — ${e.obra}` : ""}
          </p>
          <p className="text-[11px] text-torg-gray">
            {dentro.length} {dentro.length === 1 ? "área" : "áreas"} no escopo
            {fora.length > 0 && <> · {fora.length} fora</>}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ minWidth: 700 }}>
            <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left px-4 py-2">Item</th><th className="text-left px-2 py-2">Área</th>
                <th className="text-left px-2 py-2">un.</th><th className="text-right px-2 py-2">Quant.</th>
                <th className="text-right px-2 py-2">Unit. R$/kg</th><th className="text-right px-4 py-2">Valor R$</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dentro.map((a, i) => (
                <tr key={a.area}>
                  <td className="px-4 py-1.5 whitespace-nowrap">1.{i + 1}</td>
                  <td className="px-2 py-1.5">
                    {a.area}
                    {a.cor && <span className="text-torg-gray"> · {a.cor}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-torg-gray">kg</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Number(a.pesoKg).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(a.precoPorKg)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(a.preco)}</td>
                </tr>
              ))}
              {!dentro.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-torg-gray">Nenhuma área no escopo.</td></tr>}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-2" colSpan={3}>Subtotal</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{Number(pesoDentro).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(pesoDentro > 0 ? precoDentro / pesoDentro : 0)}</td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(precoDentro)}</td>
              </tr>
              {t.comerciais > 0 && (
                <tr>
                  <td className="px-4 py-1.5">2</td>
                  <td className="px-2 py-1.5" colSpan={4}>Fornecimento de itens comerciais</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(t.comerciais * (1 + (res.bdiPct || 0) / 100))}</td>
                </tr>
              )}
              {/* ⚠ pré-montagem separada também vira linha, pelo mesmo motivo do frete: o cliente
                  quer ver o que está pagando por ela, e às vezes tira do escopo. */}
              {res.preMont?.apresentacao === "separado" && res.preMont?.total > 0 && (
                <tr>
                  <td className="px-4 py-1.5">{t.comerciais > 0 ? 3 : 2}</td>
                  <td className="px-2 py-1.5" colSpan={3}>
                    Pré-montagem
                    {res.preMont.porArea && res.preMont.areas.length
                      ? <span className="text-torg-gray"> — {res.preMont.areas.join(", ")}</span>
                      : <span className="text-torg-gray"> — {res.preMont.pctDaObra}% da obra</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(res.preMont.porKg)}/kg</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(res.preMont.total * (1 + (res.bdiPct || 0) / 100))}</td>
                </tr>
              )}
              {/* ⚠ frete separado é LINHA PRÓPRIA — foi para isso que o cliente pediu a separação. */}
              {res.frete?.apresentacao === "separado" && res.frete?.total > 0 && (
                <tr>
                  <td className="px-4 py-1.5">{2 + (t.comerciais > 0 ? 1 : 0) + (res.preMont?.apresentacao === "separado" && res.preMont?.total > 0 ? 1 : 0)}</td>
                  <td className="px-2 py-1.5" colSpan={3}>
                    Transporte até a obra
                    {res.frete.destino ? <span className="text-torg-gray"> — {res.frete.destino}</span> : null}
                    {res.frete.modo === "viagem" ? <span className="text-torg-gray"> · {res.frete.viagens} viagens</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(res.frete.porKg)}/kg</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(res.frete.total * (1 + (res.bdiPct || 0) / 100))}</td>
                </tr>
              )}
              <tr className="bg-torg-blue-50/50 font-bold text-torg-dark">
                <td className="px-4 py-2" colSpan={5}>Total geral</td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(res.preco)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {fora.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden opacity-70">
          <p className="text-[12px] font-bold text-torg-gray px-4 py-2 bg-gray-50">Fora do escopo</p>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-gray-50">
              {fora.map((a) => (
                <tr key={a.area} className="text-torg-gray">
                  <td className="px-4 py-1.5">{a.area}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Number(a.pesoKg).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap line-through">{fmtR$(a.preco)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-torg-gray px-4 py-2 border-t border-gray-100">
            Continuam no estudo com o levantamento inteiro — basta remarcar no quantitativo.
          </p>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-[12px] font-bold text-torg-dark mb-3">Custo do escopo, por natureza</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi r="Material" v={fmtR$(t.material?.subtotal)} />
          <Kpi r="Terceiros" v={fmtR$(t.mdo?.subtotal)} />
          <Kpi r="Industrialização" v={fmtR$(t.industrializacao?.subtotal)} />
          <Kpi r="Itens comerciais" v={fmtR$(t.comerciais)} />
        </div>
        <p className="text-[11px] text-torg-gray mt-3">
          O R$/kg de cada área carrega tudo: aço, tinta pela cor, fabricação e pintura, mais o
          rateio por peso de fixador, ensaio e frete. A soma das áreas fecha com o custo do estudo.
        </p>
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
/**
 * CENÁRIO FINANCEIRO — do preço ao que sobra.
 *
 * Vitor (23/08/2026): "no cenário financeiro parece muito genérico, precisa melhorar as
 * informações".
 *
 * ⚠ ESTAVA GENÉRICO PORQUE O "LUCRO ESTIMADO" ERA O ECO DA ALAVANCA. A tabela calculava
 * `lucro = preço × margem do BDI`: digitava-se margem 10% e ela respondia "lucro 10%". Isso não
 * informa nada — devolve o campo. O que decide uma proposta é o caminho inteiro, do preço até o
 * que sobra, e três coisas que a tela não dizia:
 *
 *   1. o RESULTADO de verdade — preço − impostos − o que sai da empresa − a casa pelos meses de
 *      obra − o dinheiro parado. Medido na LQC-081: com margem 10% no BDI o resultado é
 *      NEGATIVO em R$ 2,7 milhões, porque a obra ocupa a fábrica por 24,6 meses;
 *   2. o PREÇO DE EQUILÍBRIO — R$ 51,45 mi, R$ 22,43/kg. É um só, igual nos três cenários: o BDI
 *      muda o preço, não muda o custo. Dele sai o desconto que ainda cabe;
 *   3. O QUE MOVE o resultado, em ordem — nesta obra a fábrica render 10% menos custa mais que
 *      um desconto de 5%.
 */
function Cenario({ e, res, mexer, fabrica }) {
  const cfg = e.cenario || {};
  const comp = e.composicao || {};
  const set = (cen, k, v) => mexer({ cenario: { ...cfg, [cen]: { ...(cfg[cen] || {}), [k]: v } } });
  const analise = analiseDeCenarios(res.custoTorg, res.custoDireto, {
    base: { ...(res.bdiCampos || {}), ...(cfg.base || {}) },
    conservador: cfg.conservador || {},
    otimista: cfg.otimista || {},
    pesoKg: res.pesoTotal,
  });

  const temFabrica = fabrica?.capacidadeKgMes > 0;
  // ⚠ MÉDIA NÃO É CAPACIDADE. Vitor (23/08/2026): "nossa fábrica já teve alguns meses que entregou
  // acima de 330 t". A média mede o que a fábrica ABSORVEU — nos últimos meses quem limitou foi a
  // carteira, não a fábrica. Qual das leituras vale muda o prazo e, com ele, quanto da casa esta
  // obra carrega. Por isso é escolha do estudo, e não um número fixo.
  const cadencia = numeroBr(cfg.cadenciaKgMes) || fabrica?.capacidadeKgMes || 0;

  // ⚠ O CUSTO DO DINHEIRO ENTRA NO RESULTADO, NÃO SÓ NUM QUADRO À PARTE. Os meses entre pagar o
  // aço e receber a medição custam juro real; deixá-los fora do resultado é dar lucro de mentira.
  // Por isso a conta roda em duas passadas: a primeira acha o imposto, a segunda usa o fluxo.
  const conta = (cen, mods = {}) => {
    const preco = numeroBr(cen.preco) * (1 + (mods.precoPct || 0) / 100);
    const comum = {
      capacidadeKgMes: cadencia * (1 + (mods.cadenciaPct || 0) / 100),
      custoOperacionalMes: fabrica?.custoOperacionalMes || 0,
      acoPct: mods.acoPct || 0,
      mesesExtra: mods.mesesExtra || 0,
      // ⚠ a fase de projeto entra em TODOS os cenários: é custo, e desloca o caixa um mês inteiro
      mesesProjeto: cfg.mesesProjeto == null || cfg.mesesProjeto === "" ? 1 : Math.max(0, Math.round(numeroBr(cfg.mesesProjeto))),
      custoProjetoMes: numeroBr(cfg.custoProjetoMes),
    };
    const seco = resultadoDoCenario(res, { ...cen, preco }, { ...comum, custoFinanceiro: 0 });
    const parcelas = (comp.pagamento?.parcelas?.length ? comp.pagamento.parcelas : PAGAMENTO_PADRAO)
      .map((p) => (mods.recebimentoDias ? { ...p, dias: numeroBr(p.dias) + mods.recebimentoDias } : p));
    const f = fluxoDeCaixa({
      meses: seco.meses, preco, pesoKg: res.pesoTotal, impostos: seco.impostos, material: seco.material,
      mesesProjeto: comum.mesesProjeto, custoProjetoMes: comum.custoProjetoMes,
      terceiros: res.totais?.mdo?.subtotal || 0,
      custoOperacionalMes: fabrica?.custoOperacionalMes || 0,
      reservaFinanceira: preco * ((numeroBr(cen.alavancas?.factoring) || 0) / 100),
    }, {
      pagamento: { parcelas },
      taxaMensalPct: cfg.taxaMensalPct ?? 1.5,
      mesesCompraMaterial: cfg.mesesCompraMaterial,
      // ⚠ o cronograma real do contrato vale em TODOS os cenários: compra antecipada, parcela de
      // fornecedor e mês sem medição mudam o custo do dinheiro, e é ele que entra no resultado.
      compraMesesAntes: cfg.compraMesesAntes == null || cfg.compraMesesAntes === "" ? 1 : numeroBr(cfg.compraMesesAntes),
      parcelasFornecedor: String(cfg.parcelasFornecedor ?? "28/42/56").split(/[^\d]+/).map(Number).filter((d) => d >= 0 && Number.isFinite(d)),
      mesesSemMedicao: Array.isArray(cfg.mesesSemMedicao) ? cfg.mesesSemMedicao.map(Number) : [],
      kgPorMes: Array.isArray(cfg.kgPorMes) ? cfg.kgPorMes.map((v) => numeroBr(v)) : [],
      // ⚠ só o cenário BASE usa a receita digitada: nos outros o preço muda, e um cronograma
      // digitado para outro preço mediria um contrato que não existe.
      receitaPorMes: (mods.precoPct || 0) === 0 && Array.isArray(cfg.receitaPorMes) ? cfg.receitaPorMes.map((v) => numeroBr(v)) : null,
    });
    return resultadoDoCenario(res, { ...cen, preco }, { ...comum, custoFinanceiro: f.custoFinanceiro });
  };

  const contas = temFabrica ? analise.map((cen) => ({ cen, r: conta(cen) })) : [];
  const base = contas.find((x) => x.cen.key === "base");
  const eq = base ? equilibrioConvergido(res, base.r, (m) => conta(base.cen, m)) : null;
  const sens = base ? sensibilidade((m) => conta(base.cen, m).resultado, ALAVANCAS_SENSIVEIS) : [];

  return (
    <div className="space-y-4">
      {base ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          <Kpi r="Preço de venda" v={fmtMi(base.r.preco)} />
          <Kpi r="Preço por kg" v={`R$ ${numeroBr(base.r.precoPorKg).toFixed(2).replace(".", ",")}`} />
          <Kpi r="Resultado" v={fmtMi(base.r.resultado)} cor={base.r.resultado >= 0 ? "text-green-700" : "text-red-600"} />
          <Kpi r={`Margem real · BDI pede ${base.r.margemPretendidaPct}%`} v={`${base.r.margemRealPct}%`}
            cor={base.r.margemRealPct >= base.r.margemPretendidaPct ? "text-green-700" : "text-torg-orange-700"} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          <Kpi r="Material" v={fmtMi(res.totais?.material?.subtotal)} />
          <Kpi r="Terceiros" v={fmtMi(res.totais?.mdo?.subtotal)} />
          <Kpi r="Industrialização" v={fmtMi(res.totais?.industrializacao?.subtotal)} />
          <Kpi r="Custo total" v={fmtMi(res.custo)} />
        </div>
      )}

      {/* ── O caminho do preço até o que sobra ── */}
      {contas.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark">Do preço ao que sobra</p>
            <p className="text-[11px] text-torg-gray mt-0.5">
              A margem do BDI é o que se <em>pretende</em> ganhar. Aqui está o que <strong className="text-torg-dark">sobra</strong>:
              tirando o imposto, o que sai da empresa, a fábrica pelos meses que a obra ocupa e o dinheiro que fica parado.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ minWidth: 620 }}>
              <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-4 py-1.5">&nbsp;</th>
                  {contas.map((x) => <th key={x.cen.key} className="text-right px-3 py-1.5 whitespace-nowrap">{x.cen.nome}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  ["Preço de venda", (r) => fmtR$(r.preco), "", "font-semibold"],
                  ["Impostos", (r) => `− ${fmtR$(r.impostos)}`, "das linhas de faturamento, com o CFOP de cada uma", "text-red-600"],
                  ["Material, terceiros e frete", (r) => `− ${fmtR$(r.externos)}`, "o que sai da empresa e vai para fora", "text-red-600"],
                  ["Projeto", (r) => (r.projeto ? `− ${fmtR$(r.projeto)}` : "—"), "os meses de engenharia antes de a fábrica cortar", "text-red-600"],
                  ["Custo da casa", (r) => `− ${fmtR$(r.casa)}`, "o que a Torg paga por mês, medido nas contas a pagar, pelos meses de obra — não a tabela de industrialização", "text-red-600"],
                  ["Custo do dinheiro", (r) => `− ${fmtR$(r.financeiro)}`, "juro dos meses entre pagar o aço e receber a medição", "text-red-600"],
                  ["Resultado", (r) => fmtR$(r.resultado), "", "resultado"],
                  ["Margem real", (r) => `${r.margemRealPct}%`, "", "pct"],
                  ["Margem pretendida (BDI)", (r) => `${r.margemPretendidaPct}%`, "", "text-torg-gray"],
                  ["Preço por kg", (r) => `R$ ${numeroBr(r.precoPorKg).toFixed(2).replace(".", ",")}`, "", "text-torg-gray"],
                  ["Prazo de fábrica", (r) => `${r.meses} meses`, "", "text-torg-gray"],
                  ["Prazo do contrato", (r) => `${r.mesesContrato} meses`, "projeto + fabricação", "text-torg-gray"],
                ].map(([rot, fn, ajuda, tipo]) => (
                  <tr key={rot} className={tipo === "resultado" ? "bg-torg-blue-50/40 font-bold" : ""}>
                    <td className="px-4 py-1.5">
                      {rot}
                      {ajuda ? <span className="block text-[10px] text-torg-gray font-normal leading-tight">{ajuda}</span> : null}
                    </td>
                    {contas.map((x) => {
                      const cor = tipo === "resultado" || tipo === "pct"
                        ? (numeroBr(x.r.resultado) >= 0 ? "text-green-700" : "text-red-600")
                        : tipo === "font-semibold" ? "text-torg-dark font-semibold" : tipo;
                      return <td key={x.cen.key} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${cor}`}>{fn(x.r)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {base && (
            <p className="text-[11px] text-torg-dark px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              {base.r.margemRealPct >= base.r.margemPretendidaPct
                ? <>O BDI pede <strong>{base.r.margemPretendidaPct}%</strong> e sobra <strong className="text-green-700">{base.r.margemRealPct}%</strong>:
                    a tabela de preços recupera mais do que a fábrica custa. Essa diferença é espaço de desconto que a composição não mostrava.</>
                : <>O BDI pede <strong>{base.r.margemPretendidaPct}%</strong> mas sobra <strong className="text-red-600">{base.r.margemRealPct}%</strong>.
                    A conta do BDI cobra a fábrica pela tabela de industrialização; esta cobra o <strong>custo da casa</strong> em {base.r.meses} meses
                    ({fmtR$(fabrica.custoOperacionalMes)}/mês, medido nas contas a pagar de {fabrica.custoPeriodo}). Enquanto a obra ocupar a fábrica esse tempo, é este o número que vale.</>}
            </p>
          )}
        </div>
      )}

      {/* ── Até onde dá para ceder ── */}
      {eq && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark">Até onde dá para ceder</p>
            <p className="text-[11px] text-torg-gray mt-0.5">
              Abaixo deste preço a obra não se paga. O custo não muda com o cenário — o BDI mexe no preço, não no
              que a obra consome; só o <strong className="text-torg-dark">custo do dinheiro</strong> acompanha, porque
              receber menos atrasa o caixa. É por isso que o número converge em vez de sair de uma conta só.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
            <Kpi r="Empata em" v={fmtMi(eq.preco)} />
            <Kpi r="Ou seja, por kg" v={`R$ ${numeroBr(eq.precoPorKg).toFixed(2).replace(".", ",")}`} />
            <Kpi r={eq.descontoMaxPct >= 0 ? "Desconto que ainda cabe" : "O preço precisa subir"}
              v={`${Math.abs(eq.descontoMaxPct)}%`}
              cor={eq.descontoMaxPct >= 0 ? "text-green-700" : "text-red-600"} />
            <Kpi r={eq.acoPodeSubirPct >= 0 ? "O aço pode subir" : "O aço já está caro demais"}
              v={`${Math.abs(eq.acoPodeSubirPct)}%`}
              cor={eq.acoPodeSubirPct >= 0 ? "text-torg-dark" : "text-red-600"} />
          </div>
          <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
            {eq.folga >= 0
              ? <>Entre o preço da proposta e o empate há <strong className="text-torg-dark">{fmtR$(eq.folga)}</strong>. A obra
                  aguenta até <strong className="text-torg-dark">{eq.mesesLimite} meses</strong> de fábrica — leva {base.r.meses}.</>
              : <>A proposta está <strong className="text-red-600">{fmtR$(Math.abs(eq.folga))}</strong> abaixo do empate. Nesse preço
                  a obra só se paga em <strong className="text-torg-dark">{eq.mesesLimite} meses</strong> de fábrica, e ela leva {base.r.meses}.</>}
            {" "}⚠ o preço do contrato não sobe quando o aço sobe: um aumento do fornecedor vem inteiro do resultado.
          </p>
        </div>
      )}

      {/* ── O que move o resultado ── */}
      {sens.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark">O que move o resultado</p>
            <p className="text-[11px] text-torg-gray mt-0.5">
              Cada linha é um susto de tamanho realista, aplicado sozinho sobre o cenário base. Serve para saber
              onde vale gastar a negociação — com o cliente, com o fornecedor ou dentro de casa.
            </p>
          </div>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-gray-50">
              {sens.map((s) => {
                const maior = Math.max(...sens.map((x) => Math.abs(x.delta))) || 1;
                return (
                  <tr key={s.key}>
                    <td className="px-4 py-1.5 whitespace-nowrap">{s.nome} <span className="text-torg-gray">{s.passo}</span></td>
                    <td className="px-3 py-1.5 w-1/2">
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${s.delta < 0 ? "bg-red-500" : "bg-green-600"}`}
                          style={{ width: `${(Math.abs(s.delta) / maior) * 100}%` }} />
                      </div>
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${s.delta < 0 ? "text-red-600" : "text-green-700"}`}>
                      {s.delta < 0 ? "− " : "+ "}{fmtR$(Math.abs(s.delta))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── As alavancas do BDI ── */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Alavancas, por cenário</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ minWidth: 520 }}>
            <thead className="text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left px-4 py-1.5">Alavanca</th>
                {CENARIOS.map((c) => <th key={c.key} className="text-right px-3 py-1.5">{c.nome}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {BDI_CAMPOS.map((campo) => (
                <tr key={campo.key}>
                  <td className="px-4 py-1 whitespace-nowrap">{campo.nome} <span className="text-torg-gray">(%)</span></td>
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
                <td className="px-4 py-1">Fator de custo <span className="text-torg-gray">(% do custo base)</span>
                  <span className="block text-[10px] text-torg-gray leading-tight">100 = o custo do estudo; 110 = tudo 10% mais caro</span></td>
                {CENARIOS.map((c) => (
                  <td key={c.key} className="px-3 py-1 text-right align-top">
                    <Inp value={cfg[c.key]?.fatorCusto ?? ""} placeholder="100"
                      onChange={(ev) => set(c.key, "fatorCusto", ev.target.value)} className="w-20 text-right" /></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ⚠ ESTA TABELA FORMA O PREÇO — não diz o resultado. O "lucro estimado" que ficava aqui era
          `preço × margem`, ou seja, a alavanca de volta. Quem responde pelo resultado é o quadro
          de cima, que cobra a fábrica pelo custo medido dela. */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Como o BDI forma o preço</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ minWidth: 520 }}>
            <thead className="text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left px-4 py-1.5">&nbsp;</th>{CENARIOS.map((c) => <th key={c.key} className="text-right px-3 py-1.5">{c.nome}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[["Custo ajustado", (x) => fmtR$(x.custo)], ["BDI", (x) => `${x.bdiPct}%`],
                ["BDI (R$)", (x) => fmtR$(x.bdiValor)], ["Preço de venda", (x) => fmtR$(x.preco)],
                ["Preço por kg", (x) => `R$ ${numeroBr(x.precoPorKg).toFixed(2).replace(".", ",")}`]].map(([r, fn]) => (
                <tr key={r} className={r === "Preço de venda" ? "bg-torg-blue-50/40 font-bold" : ""}>
                  <td className="px-4 py-1.5 whitespace-nowrap">{r}</td>
                  {analise.map((x) => (
                    <td key={x.key} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fn(x)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {temFabrica && (
        <>
          <FabricaPorHora fabrica={fabrica} cfg={cfg} mexer={mexer} cadencia={cadencia} />
          <Cadencia fabrica={fabrica} cfg={cfg} mexer={mexer} res={res} cadencia={cadencia} />
          <PrazoDoLucro res={res} analise={analise} fabrica={fabrica} cadencia={cadencia} />
          <FluxoDoDinheiro res={res} base={analise.find((x) => x.key === "base")} fabrica={fabrica} cfg={cfg} mexer={mexer} c={comp} />
        </>
      )}

      {!temFabrica && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-xl px-4 py-2.5">
          Sem a capacidade e o custo mensal da fábrica não dá para dizer o que sobra — só o que se pretende ganhar.
          Configure o custo-hora por setor para a tela mostrar resultado, ponto de equilíbrio e sensibilidade.
        </p>
      )}

      <p className="text-[11px] text-torg-gray">
        O BDI incide só sobre o que a Torg fatura ({fmtR$(res.custoTorg)}); o que o cliente compra
        direto ({fmtR$(res.custoDireto)}) entra na venda pelo custo.
      </p>
    </div>
  );
}

/**
 * A FÁBRICA POR HORA — quanto ela aguenta, e o que isso faz com o custo.
 *
 * Vitor (23/08/2026): "vamos seguir dessa maneira, por hora — com base nessas análises vamos
 * colocar esses números para o cenário financeiro para vermos o que de fato é".
 *
 * ⚠⚠ A LIÇÃO QUE CUSTOU CARO: HH/t NÃO SE MEDE EM FÁBRICA OCIOSA. Com 4 montadores e só 114 t de
 * serviço na frente deles, a conta devolve 6,2 HH/t seja o trabalho de 1,7 ou de 6,2 — o que se
 * mediu foi EFETIVO ÷ PRODUÇÃO, não conteúdo de trabalho. Por isso a linha "medido" desta tela
 * sempre mostra 100% de ocupação: ela foi derivada da própria produção. É circular, e está
 * escrito na tela para ninguém tomar decisão em cima dela.
 *
 * ⚠ Vitor: "tenho 4 montadores, cada um monta 5 t por dia, só aí daria 440 t". Com essa régua
 * TODOS os postos aparecem entre 17% e 27% de ocupação — consistente demais para ser coincidência.
 * É a assinatura de fábrica limitada por CARTEIRA, não por capacidade. E aí o gargalo é a
 * PINTURA, com 3 pessoas.
 */
function FabricaPorHora({ fabrica, cfg, mexer, cadencia }) {
  const set = (k, v) => mexer({ cenario: { ...cfg, [k]: v } });
  const rota = fabrica.rota || [];
  if (!rota.length) return null;

  const regua = numeroBr(cfg.kgPessoaDia);
  const cap = capacidadePorHora({
    rota, horasPessoaMes: fabrica.horasPessoaMes, diasUteis: fabrica.diasUteis,
    hhPorTonelada: regua > 0 ? 0 : fabrica.hhPorTRota,
    kgPorPessoaDia: regua,
  });
  const custoMes = fabrica.custoOperacionalMes || 0;
  const porKg = cap.capacidadeKgMes > 0 ? custoMes / cap.capacidadeKgMes : 0;
  const usando = cadencia === cap.capacidadeKgMes;

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">A fábrica por hora</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          {fabrica.pessoasChao} pessoas no chão × {fabrica.horasPessoaMes} h/mês.
          A capacidade é a do <strong className="text-torg-dark">posto que aperta primeiro</strong> — não a soma nem a média.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {[{ kg: 5000, r: "5 t/dia por posto", a: "o que você disse do montador" },
            { kg: 2500, r: "2,5 t/dia", a: "meio do caminho" },
            { kg: 0, r: `Medido (${fabrica.hhPorTRota} HH/t)`, a: "⚠ circular: sai da própria produção" }].map((o) => (
            <button key={o.r} type="button" onClick={() => set("kgPessoaDia", o.kg ? String(o.kg) : "")}
              className={`text-left border rounded-lg px-3 py-2 transition ${regua === o.kg ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
              <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">{o.r}</span>
              <span className="block text-[10px] text-torg-gray">{o.a}</span>
            </button>
          ))}
          <label className="text-[11px] text-torg-dark border border-gray-200 rounded-lg px-3 py-2">
            <span className="block font-semibold">Outra régua</span>
            <Inp value={cfg.kgPessoaDia ?? ""} placeholder="5000"
              onChange={(e) => set("kgPessoaDia", e.target.value)} className="block mt-0.5 w-24 text-right" />
            <span className="block text-[10px] text-torg-gray mt-0.5">kg por pessoa/dia</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Posto</th>
              <th className="text-right px-3 py-1.5">Pessoas</th>
              <th className="text-right px-3 py-1.5">Faz hoje</th>
              <th className="text-right px-3 py-1.5">Aguenta</th>
              <th className="text-right px-4 py-1.5">Ocupação</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cap.postos.map((x) => {
              const eGargalo = cap.gargalo?.chave === x.chave;
              return (
                <tr key={x.chave} className={eGargalo ? "bg-[#FFF7ED] font-semibold" : ""}>
                  <td className="px-4 py-1.5 whitespace-nowrap">{x.setor}
                    {eGargalo ? <span className="ml-2 text-[9px] uppercase tracking-wider text-torg-orange-700">aperta primeiro</span> : null}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.pessoas}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{x.kgMes.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{x.capacidadeKgMes.toLocaleString("pt-BR")}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums ${x.ocupacaoPct >= 95 ? "text-red-600" : x.ocupacaoPct >= 70 ? "text-torg-dark" : "text-green-700"}`}>{x.ocupacaoPct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
        <Kpi r="Capacidade da fábrica" v={`${cap.capacidadeKgMes.toLocaleString("pt-BR")} kg/mês`} />
        <Kpi r="Aperta primeiro" v={cap.gargalo?.setor || "—"} cor="text-torg-orange-700" />
        <Kpi r="Custo da casa por kg" v={`R$ ${porKg.toFixed(2).replace(".", ",")}`} />
        <Kpi r="Horas do chão" v={`${cap.horas.toLocaleString("pt-BR")} h/mês`} />
      </div>

      {regua === 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-t border-[#F4801F]/30 px-4 py-2.5">
          ⚠ Esta leitura é <strong>circular</strong>: o HH/t saiu de dividir o efetivo pela produção que a fábrica fez,
          então ela devolve 100% de ocupação por construção. Serve para ver a ordem dos postos, não para decidir preço.
          Escolha uma régua de kg por pessoa/dia para ter uma capacidade de verdade — e confirme essa régua
          cronometrando um posto num conjunto real, anotando <strong>que peça é</strong>.
        </p>
      )}

      <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => mexer({ cenario: { ...cfg, cadenciaKgMes: String(cap.capacidadeKgMes) } })}
          disabled={usando || !cap.capacidadeKgMes}
          className={`text-[11px] rounded-lg px-3 py-1.5 border ${usando ? "border-gray-200 text-torg-gray" : "border-torg-blue text-torg-blue hover:bg-torg-blue-50"}`}>
          {usando ? "Esta capacidade já é a cadência do estudo" : "Usar esta capacidade como cadência do estudo"}
        </button>
        <span className="text-[10px] text-torg-gray">
          a cadência define o prazo da obra e quanto do custo da casa esta obra carrega
        </span>
      </div>
    </div>
  );
}

/**
 * A CADÊNCIA DA FÁBRICA — e o que ela faz com o custo por quilo.
 *
 * Vitor (23/08/2026): "você pegou esse número da produção, porém eu acho que não é esse de fato,
 * pois nossa fábrica já teve alguns meses que entregou um número acima de 330 t. Como podemos
 * medir de fato para sabermos a quantidade de kg que é possível fabricarmos?".
 *
 * ⚠ MÉDIA E CAPACIDADE SÃO PERGUNTAS DIFERENTES. A média mede o que a fábrica ABSORVEU — e nos
 * últimos meses quem limitou foi a carteira, não a fábrica. Capacidade é o que ela AGUENTA.
 * Tratar uma como a outra faz toda obra parecer mais lenta e mais cara do que precisa ser.
 *
 * ⚠ E POR HORA NÃO DÁ PARA MEDIR COM O DADO DE HOJE: no Syneco o apontamento é um CARIMBO, não um
 * intervalo — `dataFim` é igual a `dataInicio` nos 50.733 registros. Sem duração não existe
 * kg/hora. Por operador-dia também não fecha: o acabamento registra 63 t num dia porque encerra
 * um lote inteiro de uma vez, não porque produziu 63 t naquele dia.
 *
 * O que dá para medir com honestidade são três leituras do próprio apontamento, e o efeito de
 * cada uma no custo — que é onde a pergunta realmente importa.
 */
function Cadencia({ fabrica, cfg, mexer, res, cadencia }) {
  const L = fabrica.leituras || {};
  const custoMes = fabrica.custoOperacionalMes || 0;
  const set = (v) => mexer({ cenario: { ...cfg, cadenciaKgMes: v } });

  // ⚠ o que a tabela COBRA de industrialização por quilo — é contra isto que a cadência se mede
  const tabelaPorKg = res.pesoTotal > 0 ? (res.totais?.industrializacao?.subtotal || 0) / res.pesoTotal : 0;
  const empata = tabelaPorKg > 0 ? Math.round(custoMes / tabelaPorKg) : 0;

  // ⚠ O SEMESTRE É O NÚMERO DEFENSÁVEL, e não o trimestre. Vitor (23/08/2026): "temos um furo
  // enorme nos números de expedição, pintura e jato". O furo aparece no kg por apontamento: o
  // acabamento salta de 129 kg (847 lançamentos em set/2025) para 400 kg (476 lançamentos para
  // 190 t em fev/2026) — é lote atrasado fechado de uma vez, seguido da ressaca de mai/2026 com
  // 45 t. Um trimestre cabe inteiro dentro de um ciclo desses; um semestre, não.
  const opcoes = [
    { key: "media", nome: "Média de hoje", kg: L.mediaKgMes, ajuda: `o que a fábrica absorveu em ${fabrica.mesesConsiderados} meses` },
    { key: "sem", nome: "Melhor semestre", kg: L.melhorSemestreKgMes, ajuda: L.melhorSemestre ? `sustentado de ${L.melhorSemestre}` : "seis meses seguidos", recomendado: true },
    { key: "tri", nome: "Melhor trimestre", kg: L.melhorTrimestreKgMes, ajuda: L.melhorTrimestre ? `${L.melhorTrimestre} — curto para o registro em lote` : "três meses seguidos" },
    { key: "pico", nome: "Melhor mês", kg: L.melhorMesKgMes, ajuda: L.melhorMes ? `atingido em ${L.melhorMes}` : "teto observado" },
  ].filter((o) => o.kg > 0);

  const linhas = [...opcoes.map((o) => ({ ...o, marca: false })),
    ...(empata > 0 ? [{ key: "empata", nome: "Onde a tabela empata", kg: empata, ajuda: "a cadência que faz o preço de industrialização cobrir o custo", marca: true }] : [])]
    .sort((a, b) => a.kg - b.kg);

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">A cadência da fábrica</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          Média não é capacidade. Nos últimos meses quem limitou a produção foi a carteira, não a fábrica — então
          a média mede o que ela <strong className="text-torg-dark">absorveu</strong>, e o melhor trimestre é o piso
          confiável do que ela <strong className="text-torg-dark">aguenta</strong>. A escolha aqui muda o prazo da obra
          e, com ele, quanto do custo da casa esta obra carrega.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {opcoes.map((o) => (
            <button key={o.key} type="button" onClick={() => set(String(o.kg))}
              className={`text-left border rounded-lg px-3 py-2 transition ${cadencia === o.kg ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
              <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">
                {o.nome}{o.recomendado ? <span className="ml-1 text-[9px] uppercase tracking-wider text-torg-orange-700">recomendado</span> : null}
              </span>
              <span className="block text-[13px] font-bold tabular-nums text-torg-dark whitespace-nowrap">{o.kg.toLocaleString("pt-BR")} kg/mês</span>
              <span className="block text-[10px] text-torg-gray">{o.ajuda}</span>
            </button>
          ))}
          <label className="text-[11px] text-torg-dark border border-gray-200 rounded-lg px-3 py-2">
            <span className="block font-semibold">Outra</span>
            <Inp value={cfg.cadenciaKgMes ?? ""} placeholder={String(L.mediaKgMes || "")}
              onChange={(e) => set(e.target.value)} className="block mt-0.5 w-28 text-right" />
            <span className="block text-[10px] text-torg-gray mt-0.5">kg/mês</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Cadência</th>
              <th className="text-right px-3 py-1.5">kg/mês</th>
              <th className="text-right px-3 py-1.5">Custo da casa por kg</th>
              <th className="text-right px-3 py-1.5">A tabela cobra</th>
              <th className="text-right px-4 py-1.5">Cobre?</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((o) => {
              const porKg = o.kg > 0 ? custoMes / o.kg : 0;
              const dif = tabelaPorKg - porKg;
              return (
                <tr key={o.key} className={o.marca ? "bg-torg-blue-50/40 font-semibold" : cadencia === o.kg ? "bg-gray-50" : ""}>
                  <td className="px-4 py-1.5">{o.nome}
                    <span className="block text-[10px] text-torg-gray font-normal leading-tight">{o.ajuda}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{o.kg.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">R$ {porKg.toFixed(2).replace(".", ",")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">R$ {tabelaPorKg.toFixed(2).replace(".", ",")}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${dif >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {dif >= 0 ? "+" : "−"} R$ {Math.abs(dif).toFixed(2).replace(".", ",")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {empata > 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-t border-[#F4801F]/30 px-4 py-2.5">
          A tabela de industrialização cobra <strong>R$ {tabelaPorKg.toFixed(2).replace(".", ",")}/kg</strong>, que é
          o custo da casa quando a fábrica roda a <strong>{empata.toLocaleString("pt-BR")} kg/mês</strong>.
          Hoje ela roda {(L.mediaKgMes || 0).toLocaleString("pt-BR")} — por isso o mesmo preço cobre{" "}
          {Math.round((tabelaPorKg / (custoMes / (L.mediaKgMes || 1))) * 100)}% do custo. O preço não está errado:
          está carregando uma fábrica mais cheia do que a de agora. Encher a fábrica é o caminho mais barato de
          consertar a margem — mais barato que subir preço.
        </p>
      )}

      {/* ⚠ picos por setor: o teto observado NÃO é o mesmo em toda a rota, e a menor peça manda. */}
      {(fabrica.picos || []).length > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-[12px]" style={{ minWidth: 520 }}>
            <caption className="text-[10px] uppercase text-torg-gray text-left px-4 py-2 bg-gray-50">
              O que cada setor já provou fazer
            </caption>
            <thead className="text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left px-4 py-1.5">Setor</th>
                <th className="text-right px-3 py-1.5">Média</th>
                <th className="text-right px-3 py-1.5">Melhor semestre</th>
                <th className="text-right px-3 py-1.5">Melhor mês</th>
                <th className="text-left px-4 py-1.5">Registro</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {fabrica.picos.map((p) => {
                const falha = [p.registroFalho && `só ${p.mesesCheios} de ${p.mesesComDado} meses com registro cheio`,
                  p.registroIrregular && "fecha lote atrasado de uma vez"].filter(Boolean);
                return (
                  <tr key={p.setor}>
                    <td className="px-4 py-1 whitespace-nowrap">{p.setor}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-torg-gray">{(p.mediaKgMes || 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap font-semibold">{p.melhorSemestreKgMes ? p.melhorSemestreKgMes.toLocaleString("pt-BR") : "—"}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">{(p.melhorMesKgMes || 0).toLocaleString("pt-BR")}
                      <span className="text-torg-gray"> · {p.melhorMes || "—"}</span></td>
                    <td className={`px-4 py-1 text-[10px] leading-tight ${falha.length ? "text-torg-orange-700" : "text-torg-gray"}`}>
                      {falha.length ? falha.join(" · ") : "regular"}
                    </td>
                  </tr>
                );
              })}
              {/* ⚠ setor que sumiu da rota quase nunca parou de produzir — parou de APONTAR. */}
              {(fabrica.setoresIgnorados || []).filter((x) => x.ultimoMes).map((x) => (
                <tr key={x.setor} className="bg-[#FFF7ED]">
                  <td className="px-4 py-1 whitespace-nowrap">{x.setor}</td>
                  <td className="px-3 py-1 text-right text-torg-gray">—</td>
                  <td className="px-3 py-1 text-right text-torg-gray">—</td>
                  <td className="px-3 py-1 text-right text-torg-gray">—</td>
                  <td className="px-4 py-1 text-[10px] leading-tight text-torg-orange-700">
                    sem apontamento desde {x.ultimoMes} — não dá para medir
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
        ⚠ Para medir capacidade de verdade faltaria a <strong className="text-torg-dark">duração</strong> do
        apontamento: hoje o Syneco carimba o evento e grava fim igual ao início, então não existe kg/hora.
        Enquanto isso, o <strong className="text-torg-dark">melhor semestre</strong> é o número mais defensável.
        Seis meses comem a distorção do registro em lote que três não comem — e o semestre do corte
        ({(L.melhorSemestreKgMes || 0).toLocaleString("pt-BR")}) bate com o do acabamento a menos de 10%,
        medindo setores diferentes com registros de qualidade diferente.
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
 * vezes, e foi o erro da primeira versão. O CUSTO DA CASA (R$ 1.052.966/mês, medido nas contas a
 * pagar) já é a folha mais todos os outros custos; a industrialização que o estudo cobra é
 * justamente a mão de obra dessa casa. A conta certa separa o que SAI da empresa do que fica dentro:
 *
 *   receita − impostos − material − terceiros = sobra para pagar a casa e lucrar
 *   prazo máximo = sobra ÷ custo mensal da casa
 *
 * ⚠ E A OCUPAÇÃO NÃO MUDA NADA: metade da fábrica dobra o prazo e corta o custo atribuído pela
 * metade. Quem muda se a obra fecha é o PREÇO ou a CADÊNCIA — nunca a fatia ocupada.
 */
function PrazoDoLucro({ res, analise, fabrica, cadencia }) {
  const prazos = analise.map((c) => ({
    ...c,
    p: prazoDeFabricacao(
      { pesoKg: res.pesoTotal, preco: c.preco, impostos: c.preco * ((numeroBr(c.alavancas?.impostos) || 0) / 100), custosExternos: res.custosExternos },
      { capacidadeKgMes: cadencia || fabrica.capacidadeKgMes, custoOperacionalMes: fabrica.custoOperacionalMes },
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
          Tudo que se fabrica passa pelo corte, então a cadência da fábrica é o que entra por lá:{" "}
          <strong className="text-torg-dark">{fabrica.setorEntrada} — {(cadencia || fabrica.capacidadeKgMes).toLocaleString("pt-BR")} kg/mês</strong>{" "}
          ({fabrica.mesesConsiderados} meses, {fabrica.periodo}). O <strong className="text-torg-dark">custo da casa</strong> é{" "}
          <strong className="text-torg-dark">{fmtR$(fabrica.custoOperacionalMes)}/mês</strong>
          {fabrica.custoMedido > 0 ? <> — medido nas contas a pagar de {fabrica.custoPeriodo}, sem material, tinta, parafuso, frete, capex nem financeiro</> : null}.
        </p>
        {/* ⚠ ISTO É ROTA, NÃO VELOCIDADE. A solda faz 71% do que o corte faz porque nem toda peça é
            soldada — não porque a solda seja gargalo. Se fosse fila, o estoque em processo antes
            dela teria crescido 39 t/mês por 11 meses; não existe no chão. */}
        <p className="text-[11px] text-torg-gray mt-1.5">
          {(fabrica.setores || []).map((x) => `${x.setor} ${x.pctDaEntrada}%`).join(" · ")} do peso cortado.
          <span className="block">É a rota da peça, não a velocidade de cada setor: nem tudo é soldado, e galvanizado pula jato e pintura.</span>
        </p>
      </div>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Cenário</th>
            <th className="text-right px-3 py-1.5">Sobra p/ o custo da casa</th>
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
               é <strong className="text-red-600">{fmtR$(base.p.lucroNoPrazoReal)}</strong>. Para caber, a fábrica{" "}
               precisaria entrar com{" "}
               <strong className="text-torg-dark">{base.p.cadenciaNecessariaKgMes.toLocaleString("pt-BR")} kg/mês</strong>{" "}
               ({((base.p.cadenciaNecessariaKgMes / (cadencia || fabrica.capacidadeKgMes) - 1) * 100).toFixed(0)}% acima da cadência escolhida) — ou o preço subir.</>}
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
function FluxoDoDinheiro({ res, base, fabrica, cfg, mexer, c }) {
  const set = (k, v) => mexer({ cenario: { ...cfg, [k]: v } });
  const meses = numeroBr(cfg.mesesFabricacao) || Math.max(1, Math.round((res.pesoTotal / fabrica.capacidadeKgMes) * 10) / 10);
  const projeto = cfg.mesesProjeto == null || cfg.mesesProjeto === "" ? 1 : Math.max(0, Math.round(numeroBr(cfg.mesesProjeto)));
  const reserva = (base?.preco || 0) * ((numeroBr(base?.alavancas?.factoring) || 0) / 100);
  const receita = Array.isArray(cfg.receitaPorMes) ? cfg.receitaPorMes : [];
  // ⚠ "28/42/56" é como o comprador fala e como vem no pedido — o campo aceita assim e a conta
  // faz o resto. Pedir três campos numerados seria transcrever o que ele já sabe de cor.
  const parcelasFornecedor = String(cfg.parcelasFornecedor ?? "28/42/56").split(/[^\d]+/).map(Number).filter((d) => d >= 0 && Number.isFinite(d));
  const semMedicao = Array.isArray(cfg.mesesSemMedicao) ? cfg.mesesSemMedicao.map(Number) : [];
  const kgPorMes = Array.isArray(cfg.kgPorMes) ? cfg.kgPorMes : [];
  // ⚠ A RECEITA É RESULTADO, NÃO CAMPO. Vitor (23/08/2026): "você não puxou o valor unitário para
  // dentro do cenário financeiro, você me fez preencher à mão o valor — quero colocar o peso e
  // você já transformar na receita". A conta existia, mas a coluna era uma caixa vazia com o valor
  // em cinza de sugestão: quem olha entende que ainda tem trabalho a fazer, e digita o que o
  // portal já sabia. Agora o número aparece pronto; ajustar é a exceção, e é preciso clicar.
  const [ajustando, setAjustando] = useState(null);
  const f = fluxoDeCaixa({
    meses, mesesProjeto: projeto,
    custoProjetoMes: numeroBr(cfg.custoProjetoMes),
    preco: base?.preco || 0, pesoKg: res.pesoTotal,
    impostos: (base?.preco || 0) * ((numeroBr(base?.alavancas?.impostos) || 0) / 100),
    material: res.totais?.material?.subtotal || 0,
    terceiros: res.totais?.mdo?.subtotal || 0,
    custoOperacionalMes: fabrica.custoOperacionalMes,
    reservaFinanceira: reserva,
  }, {
    pagamento: c.pagamento || {},
    prazoFornecedorDias: cfg.prazoFornecedorDias ?? 30,
    taxaMensalPct: cfg.taxaMensalPct ?? 1.5,
    mesesCompraMaterial: cfg.mesesCompraMaterial,
    compraMesesAntes: cfg.compraMesesAntes == null || cfg.compraMesesAntes === "" ? 1 : numeroBr(cfg.compraMesesAntes),
    parcelasFornecedor,
    mesesSemMedicao: semMedicao,
    kgPorMes: kgPorMes.map((v) => numeroBr(v)),
    receitaPorMes: receita.map((v) => numeroBr(v)),
  });
  const setKg = (m, v) => {
    const novo = Array.from({ length: Math.max(f.meses + 2, kgPorMes.length) + 1 }, (_, i) => kgPorMes[i] ?? "");
    novo[m] = v;
    mexer({ cenario: { ...cfg, kgPorMes: novo } });
  };
  // ⚠ marcar/desmarcar é por mês DA FABRICAÇÃO (1, 2, 3...), não por mês do contrato — é assim
  // que a obra é falada no chão: "no primeiro mês de fabricação não tem medição".
  const alternaMedicao = (mesFab) => {
    const tem = semMedicao.includes(mesFab);
    mexer({ cenario: { ...cfg, mesesSemMedicao: tem ? semMedicao.filter((x) => x !== mesFab) : [...semMedicao, mesFab].sort((a, b) => a - b) } });
  };
  // ⚠ a tabela de receita precisa cobrir o contrato inteiro MAIS a cauda da retenção, senão a
  // última parcela não tem onde ser digitada e some do fluxo.
  const linhasReceita = Math.max(f.meses + 2, receita.length);
  const setReceita = (m, v) => {
    const novo = Array.from({ length: linhasReceita + 1 }, (_, i) => receita[i] ?? "");
    novo[m] = v;
    mexer({ cenario: { ...cfg, receitaPorMes: novo } });
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">O dinheiro: comprar o material antes de receber</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          São <strong className="text-torg-dark">{fmtR$(res.totais?.material?.subtotal)}</strong> de aço, tinta e
          fixador que saem do nosso caixa antes de o cliente medir a primeira peça.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
          {[["mesesProjeto", "Projeto (meses)", "1"],
            ["custoProjetoMes", "Custo do projeto (R$/mês)", "0"],
            ["mesesFabricacao", "Fabricação (meses)", String(meses)],
            ["compraMesesAntes", "Compra começa (meses antes)", "1"],
            ["mesesCompraMaterial", "Compra dura (meses)", ""],
            ["parcelasFornecedor", "Pagamento do material (dias)", "28/42/56"],
            ["taxaMensalPct", "Custo do dinheiro (% a.m.)", "1,5"]].map(([k, r, ph]) => (
            <label key={k} className="text-[11px] text-torg-dark">{r}
              <Inp value={cfg[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} className="block mt-1 w-full text-right" /></label>
          ))}
        </div>
        {/* ⚠ OBRA NÃO COMEÇA PRODUZINDO. Vitor (23/08/2026): "no primeiro mês vamos fazer projeto
            apenas, no segundo é que vamos começar a produzir, e daí é que começa nosso prazo de
            fabricação". Um mês de erro no início desloca o pior mês inteiro do caixa. */}
        <p className="text-[11px] text-torg-gray mt-2">
          O aço é comprado a partir do <strong className="text-torg-dark">mês {f.compra.inicio}</strong> — antes de a
          fábrica cortar — em {f.compra.meses} {f.compra.meses === 1 ? "mês" : "meses"}, e cada compra é paga em{" "}
          {f.compra.parcelas.map((x) => `${x.dias} dias`).join(" · ")}
          {" "}(no fluxo mensal isso cai {f.compra.parcelas.map((x) => `+${x.mes}`).join(" · ")} {f.compra.parcelas.length > 1 ? "meses" : "mês"} depois de cada compra).
        </p>
        <p className="text-[11px] text-torg-dark mt-2">
          Contrato de <strong>{f.meses} meses</strong>: {f.mesesProjeto > 0 ? <>{f.mesesProjeto} de projeto, a fábrica corta a partir do <strong>mês {f.mesInicioFabricacao}</strong> e </> : null}
          entrega no <strong>mês {f.mesEntrega}</strong>. A medição acompanha a produção, então ela começa no mês {f.mesInicioFabricacao} — não na assinatura.
        </p>
        <p className="text-[10px] text-torg-gray mt-1.5">
          O recebimento vem da aba <strong className="text-torg-dark">Forma de pagamento</strong>:{" "}
          {(f.pagamento?.parcelas || []).map((p) => `${p.pct}% ${String(p.nome).toLowerCase()}`).join(" · ")}.
          {f.mesesAjustados?.length ? <> {f.mesesAjustados.length} {f.mesesAjustados.length === 1 ? "mês foi ajustado" : "meses foram ajustados"} à mão (mês {f.mesesAjustados.join(", ")}).</> : null}
        </p>
        {Math.abs(f.diferencaFaturamento) > 1 && (
          <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-2">
            O faturamento do cronograma soma <strong>{fmtR$(f.faturado)}</strong> e o preço da proposta é <strong>{fmtR$(base?.preco || 0)}</strong> —
            {f.diferencaFaturamento > 0 ? " sobrando " : " faltando "}
            <strong className={f.diferencaFaturamento > 0 ? "text-green-700" : "text-red-600"}>{fmtR$(Math.abs(f.diferencaFaturamento))}</strong>.
            Enquanto não fechar, o fluxo está medindo outro contrato.
          </p>
        )}
      </div>

      {/* ⚠ MEDIÇÃO É O QUE SE PRODUZIU, NÃO FATIA IGUAL DO CONTRATO. Vitor (23/08/2026): "pegue o
          valor que falta faturar e divida por kg — esse é o preço por kg fabricado, e aí nos meses
          que marco que tem medição já teríamos o valor por mês". Entrada, projeto, entrega e
          retenção saem por cima; o que sobra passa pela balança. */}
      {f.medicao?.saldoAFaturar > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[11px] text-torg-dark">
            Fora da medição (entrada, projeto, entrega e retenção): <strong>{fmtR$(f.medicao.foraDaMedicao)}</strong>.
            Sobram <strong>{fmtR$(f.medicao.saldoAFaturar)}</strong> para faturar por medição —
            {" "}÷ <strong>{fmtKg(f.medicao.pesoKg)}</strong> dá{" "}
            <strong className="text-torg-dark">{fmtR$(f.medicao.precoPorKg)}/kg fabricado</strong>.
          </p>
          <p className="text-[11px] text-torg-gray mt-1">
            {f.medicao.porKgDigitado
              ? <>Cada mês fatura o <strong className="text-torg-dark">kg que produziu</strong> × esse preço. O que fica pronto
                 em mês sem medição não se perde: acumula e entra na medição seguinte.</>
              : <>Preencha o <strong className="text-torg-dark">kg produzido</strong> mês a mês na tabela abaixo para o
                 faturamento seguir a produção. Sem isso, a medição é dividida por partes iguais.</>}
          </p>
          {f.medicao.porKgDigitado && Math.abs(f.medicao.kgFaltando) > 1 && (
            <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-2">
              O kg informado soma <strong>{fmtKg(f.medicao.kgInformado)}</strong> e a obra tem <strong>{fmtKg(f.medicao.pesoKg)}</strong> —
              {f.medicao.kgFaltando > 0 ? <> faltam <strong className="text-red-600">{fmtKg(f.medicao.kgFaltando)}</strong> sem mês para produzir, e esse pedaço não vai ser faturado por medição.</>
                : <> sobram <strong className="text-red-600">{fmtKg(Math.abs(f.medicao.kgFaltando))}</strong> a mais do que a obra tem.</>}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Kpi r={`Capital de giro — pior mês (${f.mesDoPico})`} v={fmtR$(f.capitalDeGiro)} cor="text-torg-orange-700" />
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

      {/* ⚠ A RECEITA É DIGITÁVEL AQUI, mês a mês. Vitor (23/08/2026): "mais as receitas nos meses
          para que aí sim você calcule o cenário financeiro real". Quando o cronograma de medição
          já foi negociado, distribuir por regra é palpite ao lado do que está no contrato. */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 900 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Mês</th><th className="text-left px-2 py-1.5">Fase</th>
              <th className="text-right px-3 py-1.5">kg produzido</th>
              <th className="text-right px-3 py-1.5">Recebimento</th>
              <th className="text-right px-3 py-1.5">Material</th>
              <th className="text-right px-3 py-1.5">Fábrica</th>
              <th className="text-right px-3 py-1.5">Impostos</th>
              <th className="text-right px-3 py-1.5">Juros</th>
              <th className="text-right px-4 py-1.5">Saldo acumulado</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Array.from({ length: linhasReceita + 1 }, (_, m) => f.fluxo[m] || { mes: m, entrada: 0, saida: 0, juros: 0, saldo: f.fluxo[f.fluxo.length - 1]?.saldo || 0, fase: "pós-entrega" }).map((x) => (
              <tr key={x.mes} className={x.fase === "projeto" ? "bg-gray-50" : x.mes === f.mesEntrega ? "bg-torg-blue-50/40" : ""}>
                <td className="px-4 py-1 whitespace-nowrap">{x.mes === 0 ? "assinatura" : `mês ${x.mes}`}</td>
                {/* ⚠ MEDIÇÃO SÓ NOS MESES QUE MEDEM. Vitor (23/08/2026): "no mês 1 da fabricação não
                    teremos medição, e pode ser que o segundo também não". Espalhar a medição por
                    igual desde o primeiro mês antecipa receita que não existe e esconde o buraco de
                    caixa exatamente onde ele é maior. */}
                <td className="px-2 py-1 text-[10px] whitespace-nowrap">
                  {x.fase === "fabricação" ? (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer" title="mês com medição">
                      <input type="checkbox" checked={!semMedicao.includes(x.mes - f.mesesProjeto)}
                        onChange={() => alternaMedicao(x.mes - f.mesesProjeto)}
                        className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue h-3 w-3" />
                      <span className={semMedicao.includes(x.mes - f.mesesProjeto) ? "text-torg-gray line-through" : "text-torg-dark"}>
                        {x.mes === f.mesEntrega ? "entrega" : `mede · fab ${x.mes - f.mesesProjeto}`}
                      </span>
                    </label>
                  ) : <span className="text-torg-gray">{x.fase}</span>}
                </td>
                <td className="px-3 py-1 text-right">
                  {x.fase === "fabricação"
                    ? <Inp value={kgPorMes[x.mes] ?? ""} placeholder="0"
                        onChange={(e) => setKg(x.mes, e.target.value)} className="w-24 text-right tabular-nums" />
                    : <span className="text-torg-gray">—</span>}
                </td>
                <td className="px-3 py-1 text-right">
                  {ajustando === x.mes ? (
                    <Inp autoFocus value={receita[x.mes] ?? ""} placeholder={x.entrada ? Math.round(x.entrada).toLocaleString("pt-BR") : "0"}
                      onChange={(e) => setReceita(x.mes, e.target.value)}
                      onBlur={() => setAjustando(null)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setAjustando(null); }}
                      className="w-32 text-right tabular-nums" />
                  ) : (
                    <button type="button" onClick={() => setAjustando(x.mes)} title="clique para ajustar"
                      className={`tabular-nums whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-gray-100 ${x.entrada ? "text-green-700 font-semibold" : "text-torg-gray"}`}>
                      {x.entrada ? fmtR$(x.entrada) : "—"}
                      {numeroBr(receita[x.mes]) > 0 ? <span className="ml-1 text-[9px] uppercase tracking-wider text-torg-orange-700">ajustado</span> : null}
                    </button>
                  )}
                </td>
                {/* ⚠ material tem coluna própria: é a maior saída da obra e a única com prazo de
                    fornecedor. Somada dentro de um total, ninguém confere se a compra caiu no mês
                    certo nem se as parcelas 28/42/56 pousaram onde deviam. */}
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">{x.material ? `− ${fmtR$(x.material)}` : "—"}</td>
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">
                  {x.fabrica || x.projeto ? `− ${fmtR$(x.fabrica + x.projeto)}` : "—"}
                  {x.projeto ? <span className="block text-[9px] text-torg-gray leading-none">projeto</span> : null}
                </td>
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">{x.impostos ? `− ${fmtR$(x.impostos)}` : "—"}</td>
                <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-torg-gray">{x.juros ? `− ${fmtR$(x.juros)}` : "—"}</td>
                <td className={`px-4 py-1 text-right tabular-nums whitespace-nowrap font-semibold ${x.saldo < 0 ? "text-red-600" : "text-torg-dark"}`}>{fmtR$(x.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {f.totais && (
        <p className="text-[11px] text-torg-dark px-4 py-2 border-t border-gray-100 bg-gray-50">
          Somando o fluxo: material <strong>{fmtR$(f.totais.material)}</strong> · fábrica e projeto{" "}
          <strong>{fmtR$(f.totais.fabrica + f.totais.projeto)}</strong> · impostos <strong>{fmtR$(f.totais.impostos)}</strong>.
          {Math.abs(f.totais.material - (res.totais?.material?.subtotal || 0)) > 1 && (
            <span className="block text-torg-gray mt-0.5">
              A composição tem {fmtR$(res.totais?.material?.subtotal)} de material — a diferença é o que a janela de
              compra ainda não alcançou.
            </span>
          )}
        </p>
      )}
      <p className="text-[10px] text-torg-gray px-4 py-2 border-t border-gray-100">
        Preencha só o <strong className="text-torg-dark">kg produzido</strong>: o recebimento sai dele, pelo preço por
        quilo do quadro acima. Desmarque os meses de fabricação que <strong className="text-torg-dark">não medem</strong> —
        no primeiro mês normalmente ainda não há peça pronta, e o que ficou feito acumula para a medição seguinte.
        Se um mês tiver valor combinado diferente, clique no recebimento para ajustar à mão; ele fica marcado como
        ajustado e passa a mandar na frente da conta.
      </p>
    </div>
  );
}

/**
 * FRETE — aba própria, com o seletor de apresentação.
 *
 * Vitor (23/08/2026): "frete precisa ter uma aba dedicada para ele, e um seletor para apresentar
 * ele separado do preço por kg ou diluído no preço unitário, pois isso cada cliente pede essa
 * informação".
 *
 * ⚠ A APRESENTAÇÃO NÃO MUDA O CUSTO — MUDA O QUE O CLIENTE VÊ, e isso vale dinheiro. Diluído, o
 * R$/kg da estrutura fica mais alto e o frete não vira alvo de corte; separado, o cliente compara
 * o nosso frete com o transportador dele — e às vezes leva o frete por conta. A proposta tem de
 * sair dos dois jeitos sem refazer conta nenhuma.
 */
function Frete({ c, res, setComp }) {
  const f = c.frete || {};
  const set = (k, v) => setComp({ frete: { ...f, [k]: v } });
  const r = res.frete || {};
  const modo = r.modo || "kg";

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo r="Origem"><Inp value={f.origem ?? ""} onChange={(e) => set("origem", e.target.value)} className="w-full" /></Campo>
          <Campo r="Destino" ajuda="cidade / UF da obra">
            <Inp value={f.destino ?? ""} onChange={(e) => set("destino", e.target.value)} className="w-full" /></Campo>
          <Campo r="Cobrança">
            <Sel value={modo} onChange={(e) => set("modo", e.target.value)} opcoes={MODOS_FRETE.map((x) => x.key)}
              rotulos={Object.fromEntries(MODOS_FRETE.map((x) => [x.key, x.nome]))} className="w-full" /></Campo>
          <Campo r="Faturamento" ajuda="direto = o cliente contrata o transporte">
            <Sel value={f.faturamento || "TORG"} onChange={(e) => set("faturamento", e.target.value)}
              opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="w-full" /></Campo>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
          {modo === "kg" && (
            <Campo r="Preço por kg (R$)"><Inp value={f.precoKg ?? ""} onChange={(e) => set("precoKg", e.target.value)} className="w-full text-right" /></Campo>
          )}
          {modo === "viagem" && (<>
            <Campo r="Preço por viagem (R$)"><Inp value={f.precoViagem ?? ""} onChange={(e) => set("precoViagem", e.target.value)} className="w-full text-right" /></Campo>
            <Campo r="Capacidade da carreta (kg)" ajuda="vazio usa 27.000">
              <Inp value={f.capacidadeKg ?? ""} placeholder="27000" onChange={(e) => set("capacidadeKg", e.target.value)} className="w-full text-right" /></Campo>
            <Campo r="Viagens" ajuda="vazio usa as cargas por classe">
              <Inp value={f.viagens ?? ""} placeholder={String(r.viagens || 0)} onChange={(e) => set("viagens", e.target.value)} className="w-full text-right" /></Campo>
          </>)}
          {modo === "verba" && (
            <Campo r="Valor fechado (R$)"><Inp value={f.verba ?? ""} onChange={(e) => set("verba", e.target.value)} className="w-full text-right" /></Campo>
          )}
        </div>

        {/* ⚠ DE ONDE VEIO O NÚMERO DO FRETE — E ISSO NÃO É BUROCRACIA. Vitor (23/08/2026): "no frete
            precisamos um campo para colocarmos o valor orçado para ficar registrado, e informar o
            nome da transportadora ou se foi apenas na tabela de fretes".
            Seis meses depois, olhando uma proposta perdida, a pergunta é sempre a mesma: esse frete
            era cotação de verdade ou chute de tabela? Sem o registro, ninguém sabe — e o comercial
            defende na reunião um número que não tem dono. Com o registro, dá para cobrar a
            transportadora do que ela prometeu, e dá para saber se a tabela está velha. */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[11px] font-semibold text-torg-dark">De onde veio este valor</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {[{ k: "COTACAO", r: "Cotado com transportadora", a: "tem nome e valor de quem cotou" },
              { k: "TABELA", r: "Tabela de fretes", a: "referência interna, sem cotação" }].map((o) => (
              <button key={o.k} type="button" onClick={() => set("fonte", o.k)}
                className={`text-left border rounded-lg px-3 py-2 transition ${(f.fonte || "TABELA") === o.k ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">{o.r}</span>
                <span className="block text-[10px] text-torg-gray">{o.a}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
            {f.fonte === "COTACAO" && (<>
              <Campo r="Transportadora"><Inp value={f.transportadora ?? ""} onChange={(e) => set("transportadora", e.target.value)} className="w-full" /></Campo>
              <Campo r="Data da cotação"><Inp type="date" value={f.dataOrcamento ?? ""} onChange={(e) => set("dataOrcamento", e.target.value)} className="w-full" /></Campo>
            </>)}
            {/* ⚠ o ORÇADO fica guardado como veio, mesmo quando a composição usa outro número —
                é o que permite, depois, saber se a obra andou por cima ou por baixo da cotação. */}
            <Campo r="Valor orçado (R$)" ajuda="como veio da cotação, mesmo que a composição use outro">
              <Inp value={f.orcado ?? ""} onChange={(e) => set("orcado", e.target.value)} className="w-full text-right" /></Campo>
          </div>
          {numeroBr(f.orcado) > 0 && r.total > 0 && (() => {
            const dif = r.total - numeroBr(f.orcado);
            const pct = (dif / numeroBr(f.orcado)) * 100;
            return (
              <p className={`text-[11px] rounded-lg px-3 py-2 mt-3 ${Math.abs(pct) < 0.5 ? "text-torg-gray bg-gray-50 border border-gray-100" : "text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30"}`}>
                Orçado <strong>{fmtR$(numeroBr(f.orcado))}</strong>
                {f.fonte === "COTACAO" && f.transportadora ? <> com <strong>{f.transportadora}</strong></> : f.fonte === "COTACAO" ? " (transportadora não informada)" : " pela tabela de fretes"}.
                A composição está usando <strong>{fmtR$(r.total)}</strong>
                {Math.abs(pct) < 0.5 ? " — igual." : <>, {dif > 0 ? "acima" : "abaixo"} em <strong className={dif > 0 ? "text-red-600" : "text-green-700"}>{fmtR$(Math.abs(dif))}</strong> ({Math.abs(pct).toFixed(1)}%).</>}
              </p>
            );
          })()}
          {(f.fonte || "TABELA") === "TABELA" && (
            <p className="text-[11px] text-torg-gray mt-2">
              Sem cotação, o frete entra como estimativa. Vale cotar antes de fechar preço em obra
              longe: é a linha da composição que mais se move entre o estudo e a entrega.
            </p>
          )}
        </div>

        {/* ⚠ DESMARCAR É EXCLUIR. Vitor (23/08/2026): "quando eu desmarcar uma área do quantitativo
            é como se eu tivesse excluído ela do escopo, só não estou fazendo isso para garantir o
            histórico". Então valor digitado vale para o levantamento inteiro e encolhe junto —
            frete é fisicamente proporcional ao que embarca. Quem já cotou para o escopo reduzido
            trava aqui. */}
        {(modo === "verba" || (modo === "viagem" && f.viagens)) && (
          <label className="flex items-start gap-2.5 mt-3 pt-3 border-t border-gray-100 cursor-pointer">
            <input type="checkbox" checked={!!f.escopoFixo} onChange={(e) => set("escopoFixo", e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-torg-dark">Travar o valor — já cotado para este escopo</span>
              <span className="block text-[11px] text-torg-gray">
                Sem travar, o valor digitado vale para o levantamento inteiro e encolhe na proporção
                do peso quando você desmarca uma área.
              </span>
            </span>
          </label>
        )}

        {r.fracaoEscopo < 0.999 && !r.escopoFixo && r.valorCheio > 0 && (
          <p className="text-[11px] text-torg-dark bg-torg-blue-50 border border-torg-blue/20 rounded-lg px-3 py-2 mt-3">
            Lançado <strong>{fmtR$(r.valorCheio)}</strong> para o levantamento inteiro. No escopo de{" "}
            <strong>{fmtKg(res.pesoTotal)}</strong> ({(r.fracaoEscopo * 100).toFixed(0)}% do peso),
            equivale a <strong>{fmtR$(r.total)}</strong>.
          </p>
        )}
        {r.escopoFixo && r.fracaoEscopo < 0.999 && (
          <p className="text-[11px] text-torg-orange-700 bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-3">
            Travado: o valor não encolheu com o corte de escopo. Confira se a cotação é mesmo deste escopo.
          </p>
        )}
      </div>

      <CargasPorClasse c={c} res={res} setComp={setComp} />

      {/* ⚠ DESLIGADA POR ORA. Vitor (23/08/2026): "vamos deixar o cálculo da QualP por hora, vamos
          retirar a opção da tela do frete por hora". A consulta depende de assinatura paga
          (R$ 390 a R$ 702/mês), e botão que não funciona é pior que botão que não existe — quem
          abre a tela tenta, não vai, e passa a duvidar do resto.
          O código está pronto e intacto: <ConsultaQualp /> logo abaixo, lib/qualp.js e a rota
          /api/comercial/frete/qualp. Contratado o plano, é descomentar esta linha e pôr a chave
          em QUALP_TOKEN. */}
      {/* <ConsultaQualp c={c} res={res} setComp={setComp} /> */}

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Como o frete aparece na proposta</p>
        <p className="text-[11px] text-torg-gray mb-3">Não muda o custo — muda o que o cliente vê, e o que ele consegue cortar.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {APRESENTACAO_FRETE.map((a) => (
            <label key={a.key} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer ${r.apresentacao === a.key ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
              <input type="radio" name="apres" checked={r.apresentacao === a.key} onChange={() => set("apresentacao", a.key)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-torg-dark">{a.nome}</span>
                <span className="block text-[11px] text-torg-gray">{a.ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        <Kpi r="Peso do escopo" v={fmtKg(res.pesoTotal)} />
        {modo === "viagem" && <Kpi r="Viagens" v={`${r.viagens || 0} × ${fmtKg(r.capacidadeKg)}`} />}
        <Kpi r="Frete total" v={fmtR$(r.total)} />
        <Kpi r="Equivale a" v={`${fmtR$(r.porKg)}/kg`} />
        <Kpi r="Na proposta" v={r.apresentacao === "separado" ? "Item separado" : "No R$/kg"} cor="text-torg-blue" />
      </div>

      {r.total > 0 && (
        <p className="text-[12px] text-torg-gray bg-white border border-gray-100 rounded-xl px-4 py-3">
          {r.apresentacao === "diluido"
            ? <>O R$/kg de cada área carrega <strong className="text-torg-dark">{fmtR$(r.porKg)}</strong> de frete.
               O cliente não vê o transporte na proposta — e também não tem como cortá-lo.</>
            : <>O frete sai como item próprio de <strong className="text-torg-dark">{fmtR$(r.total)}</strong>, e o
               R$/kg das áreas fica <strong className="text-torg-dark">{fmtR$(r.porKg)}</strong> mais baixo.
               O cliente consegue comparar com o transportador dele.</>}
        </p>
      )}
    </div>
  );
}

/**
 * O CUSTO DE FABRICAR, MEDIDO NA EMPRESA.
 *
 * Vitor (23/08/2026): "não quero que use minha planilha como bengala sua, quero que monte a
 * sistemática que deve ser essa parte do comercial".
 *
 * ⚠ A TABELA É UM PREÇO QUE ALGUÉM ESCREVEU UM DIA. Ela não sabe se a fábrica contratou gente, se
 * a energia subiu ou se a produção caiu — enquanto ela for a fonte, o orçamento repete o passado,
 * e o erro só aparece no fechamento da obra, quando não dá mais para corrigir.
 *
 * A sistemática é a outra: o custo por quilo de cada setor é o que ele custa por mês dividido pelo
 * que ele produz por mês. Os dois números o portal já tem e ambos se atualizam sozinhos.
 *
 * ⚠ O QUE NÃO DÁ PARA MEDIR: custo por CLASSE de peso. O apontamento do Syneco grava a descrição
 * da peça, não a marca, e sem isso não há como ligar setor a peça e à sua classe. Então a tabela
 * dá a FORMA (peça leve custa mais por quilo — é física) e a medição dá o NÍVEL: calibrar é
 * escalar a tabela até a média dela, pesada pelo mix real, bater com o custo medido.
 */
function CustoDaFabrica({ cf, c, setComp }) {
  const [aberto, setAberto] = useState(false);
  const cal = cf.calibracao || {};
  const rota = c.rotaFabricacao || cf.rota || [];
  const adotar = () => setComp({
    precos: {
      ...(c.precos || {}),
      classe: Object.fromEntries((cal.linhas || []).map((l) => [l.key, { fabricacao: l.calibrado }])),
    },
    baseFabricacao: { origem: "medido", em: new Date().toISOString(), custoPorKg: cf.custoPorKg, periodo: cf.periodo },
  });
  const adotada = c.baseFabricacao?.origem === "medido";

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[12px] font-bold text-torg-dark">O que custa fabricar um quilo, medido na empresa</p>
          <button onClick={() => setAberto((v) => !v)} className="text-[11px] font-semibold text-torg-blue hover:underline">
            {aberto ? "ocultar a conta" : "ver a conta"}
          </button>
        </div>
        <p className="text-[11px] text-torg-gray mt-0.5">
          Custo mensal de cada setor ÷ o que ele produz por mês. {cf.mesesConsiderados} meses ({cf.periodo}).
          Não é a tabela — é a folha, o rateio da casa e o apontamento do Syneco.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Kpi r="Custo de industrialização" v={`${fmtR$(cf.custoPorKg)}/kg`} />
        <Kpi r={`Preço a ${cf.margemPct}% de margem`} v={`${fmtR$(cf.custoPorKg * (1 + cf.margemPct / 100) / (1 - cf.impostosVendaPct / 100))}/kg`} />
        <Kpi r="Média da tabela (pelo mix)" v={`${fmtR$(cal.mediaTabela)}/kg`} />
        <Kpi r="A tabela cobra" v={`${cal.diferencaPct > 0 ? "+" : ""}${cal.diferencaPct}%`}
          cor={cal.diferencaPct > 0 ? "text-green-700" : "text-red-600"} />
      </div>

      {aberto && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-torg-blue mb-2">Por setor da rota</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" style={{ minWidth: 520 }}>
                <thead className="text-[10px] uppercase text-torg-gray">
                  <tr><th className="text-left px-2 py-1.5">Setor</th><th className="text-right px-2 py-1.5">Custo/mês</th>
                    <th className="text-right px-2 py-1.5">kg/mês</th><th className="text-right px-2 py-1.5">R$/kg</th>
                    <th className="text-center px-2 py-1.5">Na rota</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(cf.linhas || []).map((l) => (
                    <tr key={l.key} className={rota.includes(l.key) ? "" : "opacity-50"}>
                      <td className="px-2 py-1.5">{l.nome}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(l.custoMes)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(l.kgMes)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">
                        {l.semDados ? <span className="text-torg-gray">sem apontamento</span> : `${fmtR$(l.custoPorKg)}`}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={rota.includes(l.key)}
                          onChange={(e) => setComp({ rotaFabricacao: e.target.checked ? [...rota, l.key] : rota.filter((x) => x !== l.key) })}
                          className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-torg-gray mt-1.5">
              Galvanizado pula jato e pintura; peça solta não é montada. Por isso a rota se escolhe.
              A produção de cada setor não se soma — a mesma peça passa por todos.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-torg-blue mb-2">Tabela × custo medido</p>
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-2 py-1.5">Classe</th><th className="text-right px-2 py-1.5">% do peso</th>
                  <th className="text-right px-2 py-1.5">Tabela</th><th className="text-right px-2 py-1.5">Calibrado</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(cal.linhas || []).map((l) => (
                  <tr key={l.key}>
                    <td className="px-2 py-1.5">{l.nome} <span className="text-torg-gray">· {l.faixa}</span></td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{(l.peso * 100).toFixed(0)}%</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(l.tabela)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(l.calibrado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-torg-gray mt-2">
              O mix vem da LPC: {cf.mix?.pecas?.toLocaleString("pt-BR")} peças, classe pelo kg/m de cada uma.
              Custo por classe não se mede — o apontamento não liga setor a peça —, então a tabela dá a
              forma e a medição dá o nível.
            </p>
            <button onClick={adotar}
              className="mt-3 text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-4 py-2">
              {adotada ? "Reaplicar o custo medido" : "Usar o custo medido neste estudo"}
            </button>
            {adotada && (
              <p className="text-[11px] text-torg-gray mt-2">
                Este estudo está com o custo medido de {fmtR$(c.baseFabricacao?.custoPorKg)}/kg,
                adotado em {new Date(c.baseFabricacao.em).toLocaleDateString("pt-BR")} sobre {c.baseFabricacao?.periodo}.
                Fica congelado: refazer a medição não muda proposta já enviada.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * CONSULTA NA QUALP — distância, pedágio e o piso da ANTT.
 *
 * Vitor (23/08/2026): "conseguimos deixar uma forma de linkar com o site qualp.com.br para
 * podermos fazer o cálculo para informar o valor do frete".
 *
 * ⚠ O PISO DA ANTT NÃO É ESTIMATIVA, É LEI. O transporte rodoviário de carga tem piso mínimo por
 * distância, eixos e tipo de carga — é o número com que o transportador negocia. Orçar frete "por
 * quilo, de cabeça" pode cair abaixo do piso, e aí ou a proposta é refeita ou a margem paga a
 * diferença.
 *
 * ⚠ PRECISA DE ASSINATURA. A API é paga e a chave sai do painel da QualP.
 *
 * ⚠ NÃO ESTÁ NA TELA HOJE. Vitor (23/08/2026) pediu para tirar a opção enquanto a assinatura não
 * existe — botão que não funciona é pior que botão que não existe. Fica aqui inteiro: contratado
 * o plano, é descomentar a chamada na aba de Frete e pôr a chave em QUALP_TOKEN.
 */
// eslint-disable-next-line no-unused-vars
function ConsultaQualp({ c, res, setComp }) {
  const { showToast } = useStore();
  const f = c.frete || {};
  const [carregando, setCarregando] = useState(false);
  const [r, setR] = useState(null);

  const consultar = async () => {
    if (!f.origem || !f.destino) { showToast("Preencha origem e destino.", "error"); return; }
    setCarregando(true);
    try {
      const resp = await fetch("/api/comercial/frete/qualp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origem: f.origem, destino: f.destino, eixos: f.eixos || 6, cargaKg: res.pesoTotal }),
      });
      const j = await resp.json();
      setR(j);
      if (!j.ok) showToast(j.erro || "Não consegui consultar.", "error");
    } catch (e) { showToast(e.message, "error"); }
    finally { setCarregando(false); }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-torg-dark">Consultar na QualP</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Traz distância, pedágio e o piso mínimo da ANTT para a rota — o número com que o
            transportador negocia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-torg-dark">Eixos
            <Inp value={f.eixos ?? ""} placeholder="6" onChange={(e) => setComp({ frete: { ...f, eixos: e.target.value } })} className="block mt-1 w-16 text-right" /></label>
          <button onClick={consultar} disabled={carregando}
            className="text-[12px] font-semibold text-torg-blue border border-torg-blue/30 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {carregando ? <Loader2 size={13} className="animate-spin" /> : null} Consultar rota
          </button>
        </div>
      </div>

      {r?.semChave && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2.5 mt-3">
          A consulta precisa de uma assinatura da QualP (planos a partir de R$ 390/mês em
          api.qualp.com.br). Contratado, a chave vai na variável <strong>QUALP_TOKEN</strong> e o
          botão passa a funcionar — o resto já está pronto.
        </p>
      )}

      {r?.ok && (
        <div className="mt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            <Kpi r="Distância" v={r.distanciaKm ? `${Number(r.distanciaKm).toLocaleString("pt-BR")} km` : "—"} />
            <Kpi r="Pedágio" v={r.pedagio ? fmtR$(r.pedagio) : "—"} />
            <Kpi r="Piso ANTT" v={r.pisoAntt ? fmtR$(r.pisoAntt) : "—"} />
            <Kpi r="Equivale a" v={r.porKg ? `${fmtR$(r.porKg)}/kg` : "—"} />
          </div>
          {r.pisoAntt > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={() => setComp({ frete: { ...f, modo: "verba", verba: r.pisoAntt, consulta: { em: r.consultadoEm, distanciaKm: r.distanciaKm, pedagio: r.pedagio } } })}
                className="text-[11px] font-semibold text-torg-blue hover:underline">usar o piso como valor fechado</button>
              {r.porKg > 0 && (<>
                <span className="text-gray-300">·</span>
                <button onClick={() => setComp({ frete: { ...f, modo: "kg", precoKg: r.porKg, consulta: { em: r.consultadoEm, distanciaKm: r.distanciaKm, pedagio: r.pedagio } } })}
                  className="text-[11px] font-semibold text-torg-blue hover:underline">usar como R$/kg</button>
              </>)}
            </div>
          )}
          {/* ⚠ o piso é MÍNIMO legal, não o preço do transportador: pedágio, retorno vazio e
              carga especial entram por cima. Adotar sem conferir é orçar no piso. */}
          <p className="text-[11px] text-torg-gray mt-2">
            O piso da ANTT é o mínimo legal, não a cotação: pedágio, retorno vazio e carga especial
            entram por cima. Use como base e confira com o transportador.
          </p>
          {!r.pisoAntt && (
            <p className="text-[11px] text-torg-orange-700 mt-2">
              A resposta veio sem a tabela de frete — pode ser o plano contratado (a tabela é
              recurso de plano) ou nome de campo diferente. A resposta crua está guardada para eu
              ajustar a leitura.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * CARGAS POR CLASSE — quantas carretas cada tipo de estrutura precisa.
 *
 * Vitor (23/08/2026): "para as estruturas extra leve calcular a média de 6,5 toneladas por carga,
 * para a leve 8, média 12, pesada 14, extra pesada 20… para podermos ver quantas cargas será
 * necessário para cada tipo de estrutura".
 *
 * ⚠ O QUE LIMITA A CARGA NÃO É O PESO, É O VOLUME. A carreta é a mesma nos cinco casos; o que muda
 * é que estrutura leve OCUPA a prancha antes de atingir o limite de peso. Dividir o peso total por
 * uma capacidade única erra feio: na TMSA dá 85 cargas por 27 t, contra 226 pela classe — 141
 * carretas de diferença, ou R$ 2,5 milhões a R$ 18 mil a viagem.
 */
function CargasPorClasse({ c, res, setComp }) {
  const cargas = res.cargas || { linhas: [], totalCargas: 0, pesoTotal: 0 };
  const cap = c.frete?.capacidadePorClasse || {};
  const setCap = (k, v) => setComp({ frete: { ...(c.frete || {}), capacidadePorClasse: { ...cap, [k]: v } } });
  const unica = cargas.pesoTotal > 0 ? Math.ceil(cargas.pesoTotal / 27000) : 0;

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">Cargas necessárias, por tipo de estrutura</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          A carreta é a mesma; o que muda é que estrutura leve ocupa a prancha antes de atingir o
          limite de peso. Média da casa, editável por obra.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 620 }}>
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Classe</th><th className="text-right px-2 py-1.5">Peso no escopo</th>
              <th className="text-right px-2 py-1.5">t por carga</th><th className="text-right px-2 py-1.5">Cargas</th>
              <th className="text-right px-4 py-1.5">Última carga</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cargas.linhas.map((l) => (
              <tr key={l.key}>
                <td className="px-4 py-1.5">{l.nome} <span className="text-torg-gray">· {l.faixa}</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(l.pesoKg)}</td>
                <td className="px-2 py-1.5 text-right">
                  <Inp value={cap[l.key] ?? ""} placeholder={String(CAPACIDADE_CARGA[l.key] / 1000).replace(".", ",")}
                    onChange={(e) => setCap(l.key, (numeroBr(e.target.value) || 0) * 1000)}
                    className="w-20 text-right" />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{l.cargas}</td>
                <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                  {fmtKg(l.ultimaCargaKg)}
                  {l.ultimaCargaKg < l.capacidadeKg * 0.5 && l.cargas > 1 && <span className="text-torg-orange-700"> · meia carga</span>}
                </td>
              </tr>
            ))}
            {!cargas.linhas.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-torg-gray">Lance a classificação no quantitativo.</td></tr>}
            <tr className="bg-gray-50 font-bold">
              <td className="px-4 py-1.5">Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(cargas.pesoTotal)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                {cargas.totalCargas > 0 ? `${(cargas.pesoTotal / cargas.totalCargas / 1000).toFixed(1)} méd.` : "—"}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{cargas.totalCargas}</td>
              <td className="px-4 py-1.5" />
            </tr>
          </tbody>
        </table>
      </div>
      {cargas.totalCargas > 0 && (
        <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
          {/* ⚠ o contraste com a capacidade única existe para mostrar o tamanho do erro que se
              evita — não é curiosidade, é a diferença entre orçar e perder dinheiro no frete. */}
          <strong className="text-torg-dark">{cargas.totalCargas} cargas</strong> para{" "}
          {fmtKg(cargas.pesoTotal)} — média de {fmtKg(cargas.pesoTotal / cargas.totalCargas)} por carreta.
          Por uma capacidade única de 27 t dariam {unica}, e o frete sairia{" "}
          {Math.round((1 - unica / cargas.totalCargas) * 100)}% mais barato do que a obra realmente exige.
        </p>
      )}
    </div>
  );
}

/**
 * FORMA DE PAGAMENTO — quando o dinheiro entra.
 *
 * Vitor (23/08/2026): "para essas formas de pagamento vamos criar uma tela para, antes dos
 * impostos, calcular isso — colocar as formas de pagamento para podermos gerar o cenário
 * financeiro".
 *
 * ⚠ A FORMA DE PAGAMENTO É METADE DO NEGÓCIO. Duas propostas com o mesmo preço valem coisas
 * diferentes: 30% de entrada contra nenhuma entrada, com 5% retidos até 90 dias depois da
 * entrega, separam milhões de capital de giro. É o que se negocia depois que o preço fecha.
 *
 * ⚠ E O QUE MANDA É QUANDO O DINHEIRO ENTRA, NÃO QUANDO SE FATURA. Medir no mês 3 e receber em 30
 * dias é caixa no mês 4 — sem o prazo, o fluxo mente por um mês inteiro, e um mês de obra grande
 * é o custo da casa por completo.
 */
function Pagamento({ c, res, setComp }) {
  const cfg = c.pagamento || {};
  const parcelas = Array.isArray(cfg.parcelas) && cfg.parcelas.length ? cfg.parcelas : PAGAMENTO_PADRAO;
  const salvar = (novas) => setComp({ pagamento: { ...cfg, parcelas: novas } });
  const set = (i, campo, v) => salvar(parcelas.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));
  const check = conferirPagamento({ parcelas });
  const preco = res.preco || 0;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray">
        É aqui que se desenha o recebimento da obra. O cenário financeiro usa exatamente isto — cada
        parcela entra no mês do seu evento, mais o prazo da nota.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ minWidth: 660 }}>
            <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left px-4 py-2">Parcela</th><th className="text-right px-2 py-2">%</th>
                <th className="text-left px-2 py-2">Quando</th><th className="text-right px-2 py-2">Prazo (dias)</th>
                <th className="text-right px-2 py-2">Valor</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {parcelas.map((p, i) => (
                <tr key={i}>
                  <td className="px-4 py-1.5"><Inp value={p.nome ?? ""} onChange={(e) => set(i, "nome", e.target.value)} className="w-44" /></td>
                  <td className="px-2 py-1.5 text-right"><Inp value={p.pct ?? ""} onChange={(e) => set(i, "pct", e.target.value)} className="w-16 text-right" /></td>
                  <td className="px-2 py-1.5">
                    <Sel value={p.evento || "MEDICAO"} onChange={(e) => set(i, "evento", e.target.value)}
                      opcoes={EVENTOS_PAGAMENTO.map((x) => x.key)}
                      rotulos={Object.fromEntries(EVENTOS_PAGAMENTO.map((x) => [x.key, x.nome]))} className="w-40" />
                    <span className="block text-[10px] text-torg-gray mt-0.5">
                      {(() => {
                        const ev = p.evento || "MEDICAO";
                        const d = num(p.dias);
                        const base = ev === "ASSINATURA" ? "da assinatura"
                          : ev === "ENTREGA" || ev === "POS_ENTREGA" ? "da entrega" : "de cada medição";
                        return d > 0 ? `${d} dias depois ${base}` : `à vista, ${base.replace("de cada", "na").replace("da ", "na ")}`;
                      })()}
                    </span>
                  </td>
                  {/* ⚠ os prazos da casa a um clique: digitar 3 quando se quis 30 some no fluxo
                      de caixa sem deixar rastro. Valor fora da lista continua aceito. */}
                  <td className="px-2 py-1.5">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <Inp value={p.dias ?? ""} list={`prazos-${i}`} onChange={(e) => set(i, "dias", e.target.value)} className="w-16 text-right" />
                        <span className="text-[10px] text-torg-gray">dias</span>
                        <datalist id={`prazos-${i}`}>
                          {PRAZOS_PAGAMENTO.map((d) => <option key={d} value={d} />)}
                        </datalist>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {PRAZOS_PAGAMENTO.map((d) => (
                          <button key={d} onClick={() => set(i, "dias", d)}
                            className={`text-[10px] rounded px-1.5 py-0.5 border ${num(p.dias) === d ? "border-torg-blue text-torg-blue bg-torg-blue-50 font-semibold" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(preco * (num(p.pct) / 100))}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => salvar(parcelas.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              <tr className={check.fecha ? "bg-gray-50 font-bold" : "bg-[#FFF7ED] font-bold"}>
                <td className="px-4 py-2">Total</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {check.soma}%{!check.fecha && <span className="text-torg-orange-700"> ⚠</span>}
                </td>
                <td className="px-2 py-2 text-torg-gray" colSpan={2}>
                  {check.fecha ? "fecha em 100%" : "as parcelas não somam 100% — o fluxo vai sair errado"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(preco * check.soma / 100)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-3">
          <button onClick={() => salvar([...parcelas, { nome: "", pct: 0, evento: "MEDICAO", dias: 30 }])}
            className="text-[11px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={12} /> parcela</button>
          <span className="text-gray-300">·</span>
          <button onClick={() => salvar(PAGAMENTO_PADRAO.map((p) => ({ ...p })))}
            className="text-[11px] font-semibold text-torg-gray hover:text-torg-dark">voltar ao padrão 10 / 80 / 10</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        <Kpi r="Entra na assinatura" v={`${check.adiantadoPct}%`} cor={check.adiantadoPct > 0 ? "text-green-700" : "text-red-600"} />
        <Kpi r="Adiantamento em R$" v={fmtR$(preco * check.adiantadoPct / 100)} />
        <Kpi r="Retido para depois" v={`${check.retidoPct}%`} cor={check.retidoPct > 0 ? "text-torg-orange-700" : undefined} />
        <Kpi r="Retido em R$" v={fmtR$(preco * check.retidoPct / 100)} />
      </div>

      {/* ⚠ é a entrada que compra o aço. Sem ela, a Torg financia a obra inteira do próprio caixa —
          e na TMSA isso são R$ 20 milhões de material antes da primeira medição. */}
      <p className="text-[12px] text-torg-gray bg-white border border-gray-100 rounded-xl px-4 py-3">
        {check.adiantadoPct <= 0
          ? <><strong className="text-torg-dark">Sem entrada</strong>, a compra do material
             ({fmtR$(res.totais?.material?.subtotal)}) sai inteira do nosso caixa antes da primeira medição.
             É o cenário que mais exige capital de giro — veja o efeito na aba de cenário.</>
          : <>A entrada de <strong className="text-torg-dark">{fmtR$(preco * check.adiantadoPct / 100)}</strong> cobre{" "}
             <strong className="text-torg-dark">
               {res.totais?.material?.subtotal > 0
                 ? `${Math.round((preco * check.adiantadoPct / 100) / res.totais.material.subtotal * 100)}%`
                 : "—"}
             </strong>{" "}da compra de material. O resto a Torg financia até as medições entrarem.</>}
      </p>
    </div>
  );
}
