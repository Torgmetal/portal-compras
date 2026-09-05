"use client";
import { Plus, Trash2 } from "lucide-react";
import { EVENTOS_PAGAMENTO, PAGAMENTO_PADRAO, PRAZOS_PAGAMENTO, conferirPagamento } from "@/lib/lqc";
import { Inp, Kpi, Sel } from "./campos";
import { fmtR$, num } from "../_lib/formatos";

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
export function Pagamento({ c, res, setComp }) {
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
                // ⚠⚠ TODA CÉLULA ANCORA NO TOPO. Vitor (05/09/2026): "precisamos ajustar o
                // alinhamento dessa parte". A célula do prazo é a mais alta da linha (caixa + os
                // atalhos de 7 a 90) e a do "quando" tem a frase embaixo do seletor; com o
                // `vertical-align: middle` que a tabela usa por padrão, cada uma centralizava na
                // altura da linha e a primeira linha de controles saía em quatro alturas
                // diferentes — nome, %, seletor e prazo, cada um num degrau. Ancorando no topo,
                // todos começam na mesma linha e o que cresce cresce para baixo.
                <tr key={i} className="align-top">
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
                    {/* ⚠ A CAIXA E A RÉGUA DE ATALHOS TÊM DE FECHAR NA MESMA BORDA. O sufixo
                        "dias" ficava depois da caixa e a empurrava para a esquerda, deixando os
                        dois blocos desencontrados. Agora os dois moram num contêiner `w-fit`: a
                        largura é a da régua e a caixa acompanha, com qualquer quantidade de
                        atalhos. O cabeçalho da coluna já diz "Prazo (dias)", e a frase sob o
                        seletor repete o prazo por extenso. */}
                    <div className="flex flex-col items-end">
                      <div className="w-fit">
                        <Inp value={p.dias ?? ""} list={`prazos-${i}`} onChange={(e) => set(i, "dias", e.target.value)} className="w-full text-right" />
                        <datalist id={`prazos-${i}`}>
                          {PRAZOS_PAGAMENTO.map((d) => <option key={d} value={d} />)}
                        </datalist>
                        <div className="flex gap-1 mt-1">
                          {PRAZOS_PAGAMENTO.map((d) => (
                            <button key={d} onClick={() => set(i, "dias", d)}
                              className={`flex-1 text-[10px] rounded px-1.5 py-0.5 border ${num(p.dias) === d ? "border-torg-blue text-torg-blue bg-torg-blue-50 font-semibold" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  {/* pt-[5px] põe o texto na mesma altura do texto DENTRO das caixas (py-1 + borda) */}
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold"><span className="inline-block pt-[5px]">{fmtR$(preco * (num(p.pct) / 100))}</span></td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => salvar(parcelas.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600 block pt-[5px]"><Trash2 size={13} /></button>
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
