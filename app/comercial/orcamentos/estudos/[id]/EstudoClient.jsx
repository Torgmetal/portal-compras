"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { Bdi } from "./_componentes/Bdi";
import { Cenario } from "./_componentes/Cenario";
import { CronogramaPrevio } from "./_componentes/CronogramaPrevio";
import { Ensaios } from "./_componentes/Ensaios";
import { Fabricacao } from "./_componentes/Fabricacao";
import { Frete } from "./_componentes/Frete";
import { ImportarLqc } from "./_componentes/ImportarLqc";
import { Material } from "./_componentes/Material";
import { MontagemCampo } from "./_componentes/MontagemCampo";
import { Pagamento } from "./_componentes/Pagamento";
import { Pintura } from "./_componentes/Pintura";
import { PlanilhaComercial } from "./_componentes/PlanilhaComercial";
import { Resumos } from "./_componentes/Resumos";
import { Terceiros } from "./_componentes/Terceiros";
import { Kpi } from "./_componentes/campos";
import { fmtKg, fmtR$ } from "./_lib/formatos";

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
export const ABAS = [
  { k: "RESUMOS", r: "Quantitativo", ajuda: "o que tem na obra: peso e área" },
  { k: "MATERIAL", r: "Material", ajuda: "aço, fixadores e itens comerciais" },
  { k: "PINTURA", r: "Pintura", ajuda: "camadas, tinta e mão de obra" },
  { k: "FABRICACAO", r: "Fabricação", ajuda: "fábrica e pré-montagem" },
  { k: "TERCEIROS", r: "Terceiros", ajuda: "o que vem de fora" },
  { k: "FRETE", r: "Frete", ajuda: "transporte até a obra" },
  { k: "MONTAGEM", r: "Montagem", ajuda: "montagem em campo, canteiro e equipamentos" },
  { k: "ENSAIOS", r: "Qualidade", ajuda: "ensaios, inspetores e data book" },
  { k: "PAGAMENTO", r: "Forma de pagamento", ajuda: "quando o dinheiro entra" },
  { k: "BDI", r: "Impostos e BDI" },
  { k: "COMERCIAL", r: "Resumo", planilha: "PLANILHA COMERCIAL" },
  { k: "CENARIO", r: "Cenário financeiro" },
  { k: "CRONOGRAMA", r: "Cronograma prévio", ajuda: "prazo e cargas para a proposta" },
];

export default function EstudoClient({ id }) {
  const { showToast } = useStore();
  const [d, setD] = useState(null);
  const [aba, setAba] = useState("RESUMOS");
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const timer = useRef(null);
  // ⚠⚠ DUAS EDIÇÕES EM MENOS DE 900 ms E A PRIMEIRA SUMIA. Vitor (23/08/2026), sobre o escopo do
  // cenário financeiro: "onde que é 1.900 é 836 toneladas".
  //
  // O autosave mandava só o ÚLTIMO patch — o `clearTimeout` cancelava o salvamento do anterior — e
  // a resposta do servidor então sobrescrevia a tela com um estudo que nunca recebeu a primeira
  // edição. Desmarcar sete áreas em sequência gravava uma e revertia as outras seis, sem aviso: a
  // tela voltava sozinha para um escopo maior do que o escolhido, e o cenário calculava em cima
  // dele. Por isso o faturamento aparecia como se fosse a obra inteira.
  //
  // Agora as edições se ACUMULAM numa fila até o salvamento sair, e a volta do servidor só
  // substitui a tela quando não há nada novo esperando.
  const pendente = useRef({});
  const estudoRef = useRef(null);

  useEffect(() => {
    fetch(`/api/comercial/estudos/${id}`).then((r) => r.json()).then((j) => {
      estudoRef.current = j?.estudo || null;
      setD(j);
    });
  }, [id]);

  const salvar = useCallback(async () => {
    const patch = pendente.current;
    if (!Object.keys(patch).length) return;
    pendente.current = {};
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/estudos/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      // ⚠ se algo foi digitado enquanto a resposta viajava, o estudo da tela é mais novo que o do
      // servidor: aproveita só o resultado recalculado e preserva o que a pessoa acabou de mexer.
      const temNovo = Object.keys(pendente.current).length > 0;
      setD((p) => (temNovo
        ? { ...p, resultado: j.resultado, cenario: j.cenario }
        : { ...p, estudo: j.estudo, resultado: j.resultado, cenario: j.cenario }));
      if (!temNovo) { estudoRef.current = j.estudo; setSujo(false); }
    } catch (e) {
      // ⚠ falhou: o patch volta para a fila, senão a edição some no erro de rede
      pendente.current = { ...patch, ...pendente.current };
      showToast(e.message, "error");
    } finally { setSalvando(false); }
  }, [id, showToast]);

  // ⚠ salva sozinho, com atraso: composição de custo se mexe campo a campo, e obrigar a clicar
  // "salvar" a cada número é o caminho mais curto pra alguém perder meia hora de trabalho.
  // Aceita função para quem precisa do estado MAIS RECENTE — dois cliques seguidos em caixas
  // diferentes não podem partir do mesmo retrato.
  const mexer = useCallback((patch) => {
    const real = typeof patch === "function" ? patch(estudoRef.current || {}) : patch;
    estudoRef.current = { ...(estudoRef.current || {}), ...real };
    pendente.current = { ...pendente.current, ...real };
    setD((p) => ({ ...p, estudo: { ...p.estudo, ...real } }));
    setSujo(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(salvar, 900);
  }, [salvar]);

  if (!d?.estudo) return <div className="p-6"><Loader2 className="animate-spin text-torg-blue" size={22} /></div>;
  const e = d.estudo, res = d.resultado || {}, c = e.composicao || {};
  // ⚠ SEMPRE a partir do estudo mais recente: marcar/desmarcar áreas em sequência partia do mesmo
  // retrato e uma escolha apagava a outra.
  const setComp = (patch) => mexer((atual) => ({ composicao: { ...(atual.composicao || {}), ...patch } }));
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
      {aba === "MATERIAL" && <Material c={c} res={res} setComp={setComp} estudoId={e.id} />}
      {aba === "PINTURA" && <Pintura c={c} res={res} setComp={setComp} estudoId={e.id} />}
      {aba === "FABRICACAO" && <Fabricacao c={c} res={res} setComp={setComp} custoFabrica={d.custoFabrica} />}
      {aba === "TERCEIROS" && <Terceiros c={c} res={res} setComp={setComp} />}
      {aba === "FRETE" && <Frete c={c} res={res} setComp={setComp} />}
      {aba === "MONTAGEM" && <MontagemCampo c={c} res={res} setComp={setComp} />}
      {aba === "ENSAIOS" && <Ensaios c={c} res={res} setComp={setComp} />}
      {aba === "PAGAMENTO" && <Pagamento c={c} res={res} setComp={setComp} />}
      {aba === "BDI" && <Bdi c={c} res={res} setComp={setComp} />}
      {aba === "COMERCIAL" && <PlanilhaComercial res={res} e={e} />}
      {aba === "CENARIO" && <Cenario e={e} res={res} mexer={mexer} fabrica={d.fabrica} />}
      {aba === "CRONOGRAMA" && <CronogramaPrevio c={c} res={res} e={e} setComp={setComp} />}
    </div>
  );
}
