"use client";
import { numeroBr, prazoDeFabricacao } from "@/lib/lqc";
import { fmtR$ } from "../_lib/formatos";

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
export function PrazoDoLucro({ res, analise, fabrica, cadencia }) {
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
