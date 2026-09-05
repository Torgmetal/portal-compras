"use client";
import { useState } from "react";
import { Comp, Kpi } from "./campos";
import { fmtR$ } from "../_lib/formatos";

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
export function PlanilhaComercial({ res, e }) {
  // ⚠ Matheus (Comercial, 05/09/2026): "na aba de resumo quando mostra os valores seria importante
  // ter um botão pra ver 'composição do preço', eu uso isso pra verificar se os valores estão
  // coerentes". O R$/kg da área é um número só, e um número só não se confere: ou se acredita, ou
  // se refaz a conta na planilha à parte. Aberto, cada área mostra o caminho inteiro — material,
  // terceiros, industrialização, custo/kg, BDI e preço/kg — que é como ele já confere na LQC.
  const [comp, setComp] = useState(false);
  const t = res.totais || {};
  const dentro = (res.porArea || []).filter((a) => a.ativo);
  const fora = (res.porArea || []).filter((a) => !a.ativo);
  const pesoDentro = dentro.reduce((a, x) => a + x.pesoKg, 0);
  const precoDentro = dentro.reduce((a, x) => a + x.preco, 0);

  // ⚠⚠ O TOTAL GERAL É A SOMA DO QUE ESTÁ NA TELA. Matheus (Comercial, 05/09/2026): "a soma dos
  // valores não está batendo". A causa principal era o rateio (corrigida em lib/lqc), mas o total
  // vinha de `res.preco` — o preço do estudo — enquanto as linhas são valores arredondados ao
  // centavo. Qualquer diferença, mesmo de R$ 1, faz quem confere com a calculadora perder a
  // confiança na planilha inteira. Aqui o total é a conta das linhas, pelos mesmos números
  // impressos: se não fechar, é porque uma linha está faltando — e aí o erro aparece, que é o certo.
  const c2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const bdiFator = 1 + (res.bdiPct || 0) / 100;
  // ⚠ item comercial não leva o BDI da estrutura: leva a margem própria dele (ver lib/lqc)
  const linhaComerciais = res.comerciais?.precoComMargem > 0 ? c2(res.comerciais.precoComMargem) : 0;
  const linhaPreMont = res.preMont?.apresentacao === "separado" && res.preMont?.total > 0 ? c2(res.preMont.total * bdiFator) : 0;
  const linhaFrete = res.frete?.apresentacao === "separado" && res.frete?.total > 0 ? c2(res.frete.total * bdiFator) : 0;
  // ⚠ MONTAGEM É ITEM PRÓPRIO NA PROPOSTA, sempre. É assim na planilha (bloco 3) e é assim que o
  // cliente negocia: ele pode tirar a montagem do escopo sem mexer no fornecimento.
  const linhaMontagem = res.montagem?.total > 0 ? c2(res.montagem.total * bdiFator) : 0;
  const totalGeral = c2(dentro.reduce((a, x) => a + c2(x.preco), 0) + linhaComerciais + linhaPreMont + linhaFrete + linhaMontagem);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[12px] font-bold text-torg-dark">
            Fornecimento de estruturas metálicas{e.obra ? ` — ${e.obra}` : ""}
          </p>
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-torg-gray">
              {dentro.length} {dentro.length === 1 ? "área" : "áreas"} no escopo
              {fora.length > 0 && <> · {fora.length} fora</>}
            </p>
            <button onClick={() => setComp((v) => !v)}
              className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border transition-colors ${comp ? "bg-torg-blue text-white border-transparent" : "text-torg-blue border-torg-blue-200 hover:bg-torg-blue-50"}`}>
              Composição do preço
            </button>
          </div>
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
              {comp && dentro.map((a) => (
                <tr key={`c-${a.area}`} className="bg-torg-blue-50/30">
                  <td className="px-4 py-2 text-[11px] text-torg-gray align-top">↳</td>
                  <td className="px-2 py-2 text-[11px]" colSpan={5}>
                    <p className="font-semibold text-torg-dark mb-1">{a.area} · como se chega em {fmtR$(a.precoPorKg)}/kg</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 tabular-nums">
                      <Comp r="Material" v={a.material} kg={a.pesoKg} nota="aço, tinta da cor e o rateio por peso do que não tem área (fixador, aço por perfil)" />
                      <Comp r="Terceiros" v={a.terceiros} kg={a.pesoKg} nota="serviço da área + rateio de terceiro geral, ensaio e frete diluído" />
                      <Comp r="Industrialização" v={a.industrializacao} kg={a.pesoKg} nota="fabricação e pintura da classe da área" />
                      <Comp r="Custo" v={a.custo} kg={a.pesoKg} forte />
                      <Comp r={`Preço (BDI ${res.bdiPct || 0}%)`} v={a.preco} kg={a.pesoKg} forte />
                    </div>
                  </td>
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
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(linhaComerciais)}</td>
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
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(pesoDentro > 0 ? linhaPreMont / pesoDentro : 0)}/kg</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(linhaPreMont)}</td>
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
                  {/* ⚠ R$/kg COM BDI, igual ao valor da linha. Mostrava o custo (R$ 2,86) ao lado
                      do preço (R$ 39.491,20): 2,86 × 9.787 kg não dá 39.491, e quem confere na
                      calculadora acha que a planilha está errada. */}
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(pesoDentro > 0 ? linhaFrete / pesoDentro : 0)}/kg</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(linhaFrete)}</td>
                </tr>
              )}
              {linhaMontagem > 0 && (
                <tr>
                  <td className="px-4 py-1.5">{2 + (t.comerciais > 0 ? 1 : 0) + (res.preMont?.apresentacao === "separado" && res.preMont?.total > 0 ? 1 : 0) + (linhaFrete > 0 ? 1 : 0)}</td>
                  <td className="px-2 py-1.5" colSpan={3}>
                    Montagem em campo
                    <span className="text-torg-gray"> — mão de obra, canteiro e equipamentos</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(pesoDentro > 0 ? linhaMontagem / pesoDentro : 0)}/kg</td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(linhaMontagem)}</td>
                </tr>
              )}
              <tr className="bg-torg-blue-50/50 font-bold text-torg-dark">
                <td className="px-4 py-2" colSpan={5}>Total geral</td>
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{fmtR$(totalGeral)}</td>
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
