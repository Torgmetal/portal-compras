"use client";
import { MONTAGEM_REFERENCIA, referenciaMontagem } from "@/lib/lqc";
import { Inp, Kpi } from "./campos";
import { fmtR$, num } from "../_lib/formatos";

/**
 * MONTAGEM EM CAMPO — o bloco 3 da planilha comercial.
 *
 * Vitor (05/09/2026): "sim, precisamos criar ela agora, faltava apenas ela bem dizer".
 *
 * ⚠ Era o maior buraco de escopo do estudo: na LQC-253 a montagem é 31% da obra (R$ 5,28 mi de
 * R$ 16,96 mi) e o portal não tinha onde pôr. Obra com montagem só podia ser orçada na planilha.
 */
export function MontagemCampo({ c, res, setComp }) {
  const cfg = c.montagem || {};
  const set = (k, v) => setComp({ montagem: { ...cfg, [k]: v } });
  const setItem = (k, v) => setComp({ montagem: { ...cfg, porItem: { ...(cfg.porItem || {}), [k]: v } } });
  const m = res.montagem || { linhas: [], mdo: 0, despesas: 0, equipamentos: 0, total: 0, porKg: 0 };
  const comerciais = (res.itensComerciais || []).filter((i) => i.qtd > 0 && !["frete", "montagem", "complemento"].includes(i.tipo));
  const ativo = cfg.ativo === true || num(cfg.estruturaRsKg) > 0 || num(cfg.equipamentosVb) > 0;

  // ⚠⚠ CAMPO EM BRANCO EMPURRA O ORÇAMENTISTA A CHUTAR. Vitor (05/09/2026): "precisa trazer as
  // informações para ficar fácil… precisa ter sentido e lógica". A referência sai das 22 LQCs de
  // 2026 que têm montagem, por FAIXA DE PESO — o R$/kg despenca com o tamanho da obra (739 t saem
  // por 1,92 e 25 t por 6,25), então uma mediana só mentiria nas duas pontas.
  const pesoKg = num(res.pesoTotal);
  const ref = referenciaMontagem(pesoKg);
  const equipSugerido = Math.round((ref.equipamentosRsKg * pesoKg) / 1000) * 1000;
  const usarReferencia = () => setComp({
    montagem: {
      ...cfg, ativo: true,
      estruturaRsKg: String(ref.estruturaRsKg),
      despesasPct: String(MONTAGEM_REFERENCIA.despesasPct),
      equipamentosVb: String(equipSugerido),
      porItem: Object.fromEntries(comerciais
        .filter((i) => MONTAGEM_REFERENCIA.porItem[i.key])
        .map((i) => [i.key, String(MONTAGEM_REFERENCIA.porItem[i.key].valor)])),
    },
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <p className="text-[12px] text-torg-gray">
        A montagem se cobra <strong className="text-torg-dark">por item, na unidade dele</strong> — a estrutura por
        quilo, mas telha e steel deck por m², calha e rufo por metro. É como a planilha faz, e é como o cliente compara.
        O canteiro entra em separado: na LQC-253 as despesas de campo custam <strong className="text-torg-dark">mais</strong> que
        a mão de obra de montagem da estrutura.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <label className="flex items-center gap-2 text-[12px] text-torg-dark">
            <input type="checkbox" checked={ativo} onChange={(e) => set("ativo", e.target.checked)} />
            <strong>Esta obra tem montagem em campo</strong>
            <span className="text-torg-gray">— desmarcado, o bloco não entra no custo nem na proposta</span>
          </label>
          <button type="button" onClick={usarReferencia}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2.5 py-1">
            Preencher com a referência da casa
          </button>
        </div>
        <p className="text-[11px] text-torg-dark bg-torg-blue-50/50 border border-torg-blue-200 rounded-lg px-3 py-2 mb-3">
          Obra de <strong>{Math.round(pesoKg / 1000).toLocaleString("pt-BR")} t</strong> — faixa <strong>{ref.rotulo}</strong>.
          Nas {ref.n} obras dessa faixa a casa cobrou <strong>{fmtR$(ref.estruturaRsKg)}/kg</strong> de montagem da estrutura,
          <strong> {MONTAGEM_REFERENCIA.despesasPct}%</strong> de despesas e canteiro sobre a mão de obra, e
          <strong> {fmtR$(ref.equipamentosRsKg)}/kg</strong> de equipamento — o que daria {fmtR$(equipSugerido)} nesta obra.
          <span className="block text-torg-gray mt-0.5">
            O equipamento costuma custar MAIS que o montador (na LQC-253, R$ 942 mil de guindaste contra R$ 642 mil de mão de obra) — é o campo que mais fica em branco.
          </span>
        </p>
        {ativo && (
          <div className="grid sm:grid-cols-3 gap-x-4 gap-y-3">
            {[["estruturaRsKg", "Estrutura", "só a mão de obra do montador, R$/kg", ref.estruturaRsKg],
              ["despesasPct", "Despesas e canteiro", "% sobre a mão de obra — alojamento, EPI, canteiro", MONTAGEM_REFERENCIA.despesasPct],
              ["equipamentosVb", "Equipamentos", "verba — guindaste, plataforma, munck", equipSugerido]].map(([k, rot, ajuda, sug]) => (
              <label key={k} className="flex flex-col text-[11px] text-torg-dark">
                <span className="min-h-[2.75em] leading-snug">{rot}</span>
                <Inp value={cfg[k] ?? ""} placeholder={String(sug)} onChange={(e) => set(k, e.target.value)} className="block mt-1 w-full text-right" />
                <span className="block text-[10px] text-torg-gray mt-0.5">{ajuda} · casa: <b>{k === "despesasPct" ? `${sug}%` : fmtR$(sug)}</b></span>
              </label>
            ))}
          </div>
        )}
      </div>

      {ativo && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark">Montagem dos itens comerciais</p>
            <p className="text-[11px] text-torg-gray mt-0.5">
              A quantidade vem da aba Itens comerciais; aqui entra só o preço de montar cada um.
              {!comerciais.length && " Esta obra não tem item comercial lançado."}
            </p>
          </div>
          {comerciais.length > 0 && (
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-4 py-1.5">Item</th><th className="text-right px-2 py-1.5">Quantidade</th>
                  <th className="text-right px-2 py-1.5">R$ por unidade</th><th className="text-right px-4 py-1.5">Subtotal</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {comerciais.map((i) => {
                  const l = m.linhas.find((x) => x.key === (i.id || i.key));
                  return (
                    <tr key={i.id || i.key}>
                      <td className="px-4 py-1.5">{i.rotulo}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Number(i.qtd).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {i.un}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Inp value={cfg.porItem?.[i.id || i.key] ?? cfg.porItem?.[i.key] ?? ""} placeholder={String(MONTAGEM_REFERENCIA.porItem[i.key]?.valor ?? "")}
                          onChange={(e) => setItem(i.id || i.key, e.target.value)} className="w-24 text-right" />
                        {MONTAGEM_REFERENCIA.porItem[i.key] && (
                          <span className="block text-[9px] text-torg-gray mt-0.5">
                            casa {fmtR$(MONTAGEM_REFERENCIA.porItem[i.key].valor)}/{i.un} ({MONTAGEM_REFERENCIA.porItem[i.key].n} obras)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(l?.subtotal || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {ativo && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-[12px] font-bold text-torg-dark mb-3">O que a montagem custa</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi r="Mão de obra" v={fmtR$(m.mdo)} />
            <Kpi r={`Despesas e canteiro (${m.despesasPct}%)`} v={fmtR$(m.despesas)} />
            <Kpi r="Equipamentos" v={fmtR$(m.equipamentos)} />
            <Kpi r="Total" v={fmtR$(m.total)} cor="text-torg-orange-700" />
          </div>
          <p className="text-[11px] text-torg-gray mt-3">
            Equivale a <strong className="text-torg-dark">{fmtR$(m.porKg)}/kg</strong> de estrutura.
            A montagem entra no custo do lado da Torg — se o cliente monta por conta, desmarque o bloco em vez de zerar os valores.
          </p>
        </div>
      )}
    </div>
  );
}
