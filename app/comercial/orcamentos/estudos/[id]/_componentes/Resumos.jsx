"use client";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { CartaoLinha } from "./CartaoLinha";
import { fmtKg, num } from "../_lib/formatos";

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
export function Resumos({ e, c, setComp, mexer: _mexer, res }) {
  const linhas = Array.isArray(c.resumos) ? c.resumos : [];
  const set = (i, campo, v) => setComp({ resumos: linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)) });
  const add = () => setComp({ resumos: [...linhas, { id: crypto.randomUUID(), item: `1.${linhas.length + 1}`, metodo: e.metodo || "ESTIMATIVA", un: "unid", quantidade: 1, unidades: 1 }] });
  const escolherTipo = (i, tipo, novo) => setComp({
    ...(novo ? { tiposEstrutura: [...(c.tiposEstrutura || []), tipo] } : {}),
    resumos: linhas.map((l, j) => j === i ? { ...l, id:l.id || crypto.randomUUID(), estrutura:tipo.base, estruturaNome:tipo.nome, estruturaTipoId:tipo.id } : l),
  });
  const del = (i) => setComp({ resumos: linhas.filter((_, j) => j !== i) });
  const dup = (i) => setComp({ resumos: [...linhas.slice(0, i + 1), { ...linhas[i], id: crypto.randomUUID(), item: `1.${linhas.length + 1}` }, ...linhas.slice(i + 1)] });
  // ⚠ MESMA REGRA DO MOTOR (lib/lqc.js): o peso lançado manda, a fórmula é o plano B. Sem isto a
  // linha "N áreas · X kg" desta aba podia divergir do KPI do topo, que já usava a regra certa.
  const pesoDe = (l) => (num(l.pesoTotal) > 0 ? num(l.pesoTotal) : num(l.quantidade) * num(l.unidades || 1) * num(l.pesoUnit));
  const total = linhas.filter((l) => l.ativo !== false).reduce((a, l) => a + pesoDe(l), 0);
  const fora = linhas.filter((l) => l.ativo === false).reduce((a, l) => a + pesoDe(l), 0);
  const ativas = linhas.filter((l) => l.ativo !== false).length;
  // ─── IMPORTAR O PESO DA ÁREA DE UMA PLANILHA ────────────────────────────────────────────────
  // Vitor (31/08/2026): "ao lado [do Método] ter um botão para ser possível importarmos uma
  // planilha onde terá o peso da área".
  //
  // ⚠ A REGRA É EXPLÍCITA E SIMPLES, de propósito: procura a coluna cujo cabeçalho fale de PESO
  // (ou kg) e SOMA a coluna inteira. Não tento adivinhar layout — a tela diz o que somou e de qual
  // coluna, e quem lançou confere. Uma heurística esperta que erra em silêncio seria pior que
  // digitar o número à mão.
  const [importando, setImportando] = useState(null);   // índice da linha
  const arquivoRef = useRef(null);
  const alvoRef = useRef(null);

  const pedirPlanilha = (i) => { alvoRef.current = i; arquivoRef.current?.click(); };

  async function lerPlanilhaPeso(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    const i = alvoRef.current;
    if (!file || i == null) return;
    setImportando(i);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grade = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
      // acha a linha de cabeçalho e a coluna de peso
      let col = -1, cab = -1, nomeCol = "";
      for (let r = 0; r < Math.min(grade.length, 25) && col < 0; r++) {
        for (let cIdx = 0; cIdx < (grade[r] || []).length; cIdx++) {
          const t = String(grade[r][cIdx] || "").trim();
          if (/^(peso|peso\s*(total|liquido|líquido|kg)?|kg|kgs)\b/i.test(t) || /peso.*\(kg\)/i.test(t)) {
            col = cIdx; cab = r; nomeCol = t; break;
          }
        }
      }
      if (col < 0) throw new Error("Não achei uma coluna de peso nesta planilha. O cabeçalho precisa ter “Peso” ou “kg”.");
      let soma = 0, lidas = 0;
      for (let r = cab + 1; r < grade.length; r++) {
        const v = num(grade[r]?.[col]);
        if (v > 0) { soma += v; lidas++; }
      }
      if (!(soma > 0)) throw new Error(`A coluna “${nomeCol}” não tem nenhum número maior que zero.`);
      if (!confirm(
        `Somei ${lidas} linha(s) da coluna “${nomeCol}”: ${fmtKg(soma)}.\n\n` +
        "Usar como peso desta área?"
      )) return;
      setComp({ resumos: linhas.map((l, j) => (j === i ? { ...l, pesoTotal: soma, metodo: "PESO DE PROJETO" } : l)) });
    } catch (e) { alert(e.message); } finally { setImportando(null); }
  }

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
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-torg-dark">Quantitativo da obra</h2>
        <p className="text-sm text-torg-gray mb-3">Áreas, elementos e pesos que compõem o estudo. Abra uma área para preencher ou conferir.</p>
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
        <input ref={arquivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={lerPlanilhaPeso} />
        {linhas.map((l, i) => (
          <CartaoLinha key={l.id || i} l={l} i={i} set={set} del={del} dup={dup} porArea={porArea}
            tiposEstrutura={c.tiposEstrutura || []} onTipoEstrutura={escolherTipo}
            cores={coresConhecidas} doEsquema={coresDoEsquema}
            onImportarPeso={pedirPlanilha} importando={importando === i} />
        ))}
      </div>

      <button onClick={add}
        className="mt-3 text-[12px] font-semibold text-torg-blue border border-dashed border-torg-blue/40 rounded-xl px-4 py-2.5 w-full hover:bg-torg-blue-50 inline-flex items-center justify-center gap-1.5">
        <Plus size={14} /> {linhas.length ? "Adicionar outro elemento" : "Adicionar o primeiro elemento"}
      </button>
    </div>
  );
}
