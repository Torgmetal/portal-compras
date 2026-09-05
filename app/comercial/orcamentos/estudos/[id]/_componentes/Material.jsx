"use client";
import { Fragment, useState } from "react";
import { FAMILIAS_COTACAO, FAMILIA_DO_ITEM } from "@/lib/cotacao-familias";
import { MARGEM_COMERCIAIS_PADRAO } from "@/lib/lqc";
import { FATURAMENTO, FATURAMENTO_ROTULO, ITENS_COMERCIAIS } from "@/lib/lqc";
import { BotaoCotarFamilia } from "./BotaoCotarFamilia";
import { EspecificacaoComercial } from "./EspecificacaoComercial";
import { ListaMaterialAco } from "./ListaMaterialAco";
import { Inp, Quadro, Sel } from "./campos";
import { fmtR$, num } from "../_lib/formatos";

/**
 * MATERIAL — o que se compra: aço, fixadores e itens comerciais.
 *
 * ⚠ É AQUI QUE "TORG OU DIRETO" FAZ SENTIDO, e só aqui (com os Terceiros). Vitor (23/08/2026):
 * "fabricação, pré-montagem, pintura, data book — tudo isso não precisa estar lá, pois sempre será
 * para a Torg". Exato: o cliente não compra fabricação de ninguém. Perguntar era pedir uma decisão
 * que não existe.
 */
export function Material({ c, res, setComp, estudoId }) {
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
          {/* ⚠ TINTA SAIU DAQUI (31/08/2026). Vitor: "tire essa opção da tinta, pois vamos tratar
              disso em outra aba". Quem fatura a tinta é decisão de pintura, e ela agora mora junto
              das camadas — na aba Pintura. O valor continua o mesmo campo (`faturamento.tintas`),
              só mudou de tela: nada foi perdido nem recalculado. */}
          {[["materiaPrima", "Aço (matéria-prima)"], ["fixadores", "Fixadores"], ["itensComerciais", "Itens comerciais"]].map(([k, r]) => (
            <label key={k} className="text-[11px] font-semibold text-torg-dark">{r}
              <Sel value={fat[k] || ""} onChange={(ev) => setFat(k, ev.target.value)} opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="block mt-1 w-44" /></label>
          ))}

        </div>
      </div>

      <ListaMaterialAco c={c} setComp={setComp} estudoId={estudoId} res={res} />
      <Quadro titulo="Aço por categoria de perfil" grupo={g.materiaPrima} vazio="Lance o perfil predominante nas linhas do quantitativo." />
      {/* ⚠ O PREÇO DO PARAFUSO ESTAVA LONGE DA LINHA DELE. Vitor (31/08/2026): "o preço do parafuso
          deve ser preenchido no campo do preço unitário onde ele está descrito, deixar um detalhe
          amarelo claro para chamar a atenção". Era um campo solto na régua de cima enquanto a linha
          "Parafusos A325 e A307" mostrava R$ 0,00 e mandava "informe acima" — quem lia a tabela via
          zero e não sabia onde mexer. Agora o campo É a célula de R$/kg, destacada em amarelo. */}
      <Quadro titulo="Fixadores" grupo={g.fixadores}
        vazio="Informe o R$/kg dos fixadores na linha abaixo."
        precoEditavel={{ valor: c.fixadoresRsKg, onChange: (v) => setComp({ fixadoresRsKg: v }) }} />

      {/* ⚠ QUANTIDADE POR ÁREA, senão não acompanha o escopo. Vitor (23/08/2026): "a soma sai como
          se fosse para a obra toda ainda". Telha e calha eram número absoluto e continuavam
          inteiros com 70% da obra fora. Lançando por área, desmarcar um pacote tira a telha dele
          junto — que é o que acontece na obra. */}
      {/* ⚠ AGRUPADO POR FAMÍLIA, e não numa lista só. Vitor (01/09/2026): "seria bom vc trazer
          separado para não cometermos erro de enviar para cotação". Numa lista única, telha, grade
          e chumbador ficam lado a lado e o botão de cotar vira uma armadilha: um clique distraído
          manda telha para quem vende parafuso. Separado, o grupo E o botão são a mesma coisa. */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-torg-dark">Itens comerciais</p>
          {/* ⚠⚠ NEM ZERO NEM O BDI CHEIO. Vitor (05/09/2026): "o ideal seria ter um ganho, pois a
              compra se torna uma responsabilidade grande para nós — pode haver aumento de preço da
              data orçada para a data concluída… porém, se a margem for grande demais, pode se
              tornar um problema para vender". Telha com 60% de margem o cliente cota direto na
              fábrica; com zero, a Torg banca sozinha a variação de preço até a compra. */}
          <label className="text-[11px] text-torg-dark inline-flex items-center gap-2">
            Margem sobre estes itens
            <Inp value={c.margemComerciaisPct ?? ""} placeholder={String(MARGEM_COMERCIAIS_PADRAO)}
              onChange={(e) => setComp({ margemComerciaisPct: e.target.value })} className="w-16 text-right" />
            <span className="text-torg-gray">% — cobre a variação de preço até a compra; não leva o BDI da estrutura</span>
          </label>
        </div>
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Item</th><th className="text-left px-2 py-1.5">Un.</th>
              <th className="text-right px-2 py-1.5">Quantidade</th><th className="text-right px-2 py-1.5">Preço unit.</th>
              <th className="text-right px-4 py-1.5">Subtotal</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ITENS_COMERCIAIS.map((i, idxItem) => {
              // ⚠ o cabeçalho do grupo entra quando a família MUDA — a lista já vem ordenada por
              // família (ver ITENS_ORDENADOS), então isso basta e evita montar sub-tabelas.
              const fam = FAMILIA_DO_ITEM[i.key] || null;
              const famAnterior = idxItem > 0 ? (FAMILIA_DO_ITEM[ITENS_COMERCIAIS[idxItem - 1].key] || null) : undefined;
              const abreGrupo = fam !== famAnterior;
              (res.grupos ? null : null) || (res.comerciaisDetalhe || []).find((x) => x.key === i.key);
              const cfg = it[i.key] || {};
              const porArea = cfg.porArea || {};
              const temPorArea = Object.values(porArea).some((v) => num(v) > 0);
              const somaAreas = areas.reduce((a2, ar) => a2 + num(porArea[ar]), 0);
              const qtd = temPorArea ? somaAreas : num(cfg.qtd);
              const preco = cfg.preco == null ? i.preco : num(cfg.preco);
              const aberta = expandido === i.key;
              return (
                <Fragment key={i.key}>
                  {abreGrupo && (
                    <tr>
                      <td colSpan={5} className="px-4 pt-3 pb-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-torg-blue">
                            {fam ? FAMILIAS_COTACAO[fam]?.rotulo : "Sem família definida"}
                          </span>
                          {fam
                            ? <BotaoCotarFamilia familia={fam} estudoId={estudoId} itens={ITENS_COMERCIAIS.filter((x) => FAMILIA_DO_ITEM[x.key] === fam)} it={it} areas={areas} />
                            : <span className="text-[11px] text-torg-orange-700">
                                sem fornecedor definido — não dá para cotar até alguém dizer qual família atende
                              </span>}
                        </div>
                      </td>
                    </tr>
                  )}
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
                        <EspecificacaoComercial item={i} cfg={cfg} setIt={setIt} />
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
