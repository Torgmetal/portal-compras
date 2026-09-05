"use client";
import { useState } from "react";
import { CLASSES } from "@/lib/lqc";
import { Kpi } from "./campos";
import { fmtKg, fmtR$ } from "../_lib/formatos";

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
export function CustoDaFabrica({ cf, c, setComp, res }) {
  const [aberto, setAberto] = useState(false);
  const cal = cf.calibracao || {};
  const rota = c.rotaFabricacao || cf.rota || [];
  // ⚠ MESMO ÍNDICE QUE A API USA (`resultado.demaos - 1`, preso em 0..2): se a tela calculasse a
  // demão por conta própria, mostraria uma coluna e o motor usaria outra.
  const demaos = res?.demaos || 1;
  const iDem = Math.max(0, Math.min(2, demaos - 1));
  // as classes que esta obra realmente tem — é sobre elas que a margem daqui é verdade
  const nomesObra = new Set((c.resumos || []).filter((l) => l.ativo !== false)
    .map((l) => String(l.classificacao || "").toUpperCase()).filter((x) => x && x !== "N/A"));
  const classesDaObra = CLASSES.filter((x) => nomesObra.has(String(x.nome).toUpperCase()));
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
          <strong className="text-torg-dark"> Inclui jato e pintura</strong>, porque os dois setores estão na rota.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <Kpi r="Custo de industrialização" v={`${fmtR$(cf.custoPorKg)}/kg`} />
        <Kpi r={`Preço a ${cf.margemPct}% de margem`} v={`${fmtR$(cf.custoPorKg * (1 + cf.margemPct / 100) / (1 - cf.impostosVendaPct / 100))}/kg`} />
        <Kpi r={`Média da tabela · mix da fábrica${demaos ? ` · ${demaos} demão${demaos > 1 ? "s" : ""}` : ""}`} v={`${fmtR$(cal.mediaTabela)}/kg`} />
        <Kpi r="A tabela cobra (mix da fábrica)" v={`${cal.diferencaPct > 0 ? "+" : ""}${cal.diferencaPct}%`}
          cor={cal.diferencaPct > 0 ? "text-green-700" : "text-red-600"} />
      </div>

      {/* ─── O QUE VALE PARA ESTA OBRA ──────────────────────────────────────────────────────────
          Vitor (01/09/2026), sobre a tela: "não está bem claro a composição" e "de acordo com a
          quantidade de demão temos que ter uma variação de valores por kg da pintura também".

          ⚠⚠ TRÊS NÚMEROS QUE MEDEM COISAS DIFERENTES ficavam lado a lado sem dizer isso, e a
          leitura natural saía errada:
            · o custo medido (R$/kg) JÁ INCLUI jato e pintura — são setores da rota;
            · a linha "Fabricação por classe" mostra SÓ a parcela de fabricação da tabela;
            · a média da tabela usa o mix da FÁBRICA, não o desta obra.
          Comparando 3,14 (linha) com 3,56 (custo), parecia que a obra cobrava abaixo do custo. Não
          cobrava: faltava somar a pintura, que na tabela é coluna separada e varia com a demão.

          ⚠ A DEMÃO JÁ ENTRAVA NA CONTA (a API escolhe a coluna pelo `resultado.demaos`) — só não
          aparecia. Agora a tela mostra qual coluna está valendo e quanto a pintura pesa nela. */}
      {classesDaObra.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-torg-blue mb-1.5">
            Nesta obra {demaos ? `· ${demaos} demão${demaos > 1 ? "s" : ""}` : ""}
          </p>
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase text-torg-gray">
              <tr>
                <th className="text-left py-1">Classe</th>
                <th className="text-right py-1">Fabricação</th>
                <th className="text-right py-1">Pintura ({demaos || 1} demão{(demaos || 1) > 1 ? "s" : ""})</th>
                <th className="text-right py-1">Tabela cheia</th>
                <th className="text-right py-1">Custo medido</th>
                <th className="text-right py-1">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {classesDaObra.map((cl) => {
                const pint = cl.demaos?.[iDem] ?? 0;
                const cheia = cl.fabricacao + pint;
                const marg = cf.custoPorKg > 0 ? (cheia / cf.custoPorKg - 1) * 100 : 0;
                return (
                  <tr key={cl.key}>
                    <td className="py-1.5 text-torg-dark">{cl.nome} <span className="text-torg-gray">· {cl.faixa}</span></td>
                    <td className="py-1.5 text-right tabular-nums">{fmtR$(cl.fabricacao)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtR$(pint)}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-torg-dark">{fmtR$(cheia)}</td>
                    <td className="py-1.5 text-right tabular-nums text-torg-gray">{fmtR$(cf.custoPorKg)}</td>
                    <td className={`py-1.5 text-right tabular-nums font-semibold ${marg >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {marg > 0 ? "+" : ""}{marg.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-torg-gray">
            A <strong>tabela cheia</strong> é o que se compara com o custo medido — as duas incluem
            pintura. A linha “Fabricação por classe” abaixo mostra só a parcela de fabricação, porque
            a pintura desta obra é precificada na aba Pintura, com tinta e mão de obra próprias.
          </p>
          {/* ⚠ a variação por demão é o pedido literal dele: ver quanto muda o R$/kg quando a
              especificação pede uma demão a mais. */}
          {classesDaObra.length === 1 && (
            <p className="mt-1 text-[11px] text-torg-dark">
              Se a especificação mudar de demão:{" "}
              {[0, 1, 2].map((k) => (
                <span key={k} className={`mr-3 ${k === iDem ? "font-semibold text-torg-blue" : "text-torg-gray"}`}>
                  {k + 1} demão{k > 0 ? "s" : ""} → {fmtR$(classesDaObra[0].fabricacao + (classesDaObra[0].demaos?.[k] ?? 0))}/kg
                </span>
              ))}
            </p>
          )}
        </div>
      )}

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
