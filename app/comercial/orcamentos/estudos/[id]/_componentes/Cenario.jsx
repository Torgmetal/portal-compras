"use client";
import { cadenciaPorClasse } from "@/lib/lqc";
import { ALAVANCAS_SENSIVEIS, BDI_CAMPOS, CENARIOS, PAGAMENTO_PADRAO, analiseDeCenarios, equilibrioConvergido, fluxoDeCaixa, numeroBr, resultadoDoCenario, sensibilidade } from "@/lib/lqc";
import { Cadencia } from "./Cadencia";
import { FabricaPorHora } from "./FabricaPorHora";
import { FluxoDoDinheiro } from "./FluxoDoDinheiro";
import { PrazoDoLucro } from "./PrazoDoLucro";
import { Inp, Kpi } from "./campos";
import { fmtMi, fmtR$ } from "../_lib/formatos";
import { OQueMoveOResultado } from "./OQueMoveOResultado";

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
export function Cenario({ e, res, mexer, fabrica }) {
  const cfg = e.cenario || {};
  const comp = e.composicao || {};
  const set = (cen, k, v) => mexer((a) => ({ cenario: { ...(a.cenario || {}), [cen]: { ...((a.cenario || {})[cen] || {}), [k]: v } } }));
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

  // ⚠⚠ A CADÊNCIA QUE VALE PARA ESTA OBRA É A DO MIX DELA. Vitor (05/09/2026): "na parte de
  // cadência você deveria fazer um resumo de tipos de estrutura". A régua escolhida acima é a da
  // classe de referência; obra de guarda-corpo come muito mais fábrica por quilo que obra pesada, e
  // é o consumo real que decide quantos meses de casa esta obra carrega. Ver `cadenciaPorClasse`.
  const porClasse = cadenciaPorClasse(cadencia, res.pesoPorClasse || {});
  const cadenciaObra = porClasse.pesoTotal > 0 ? porClasse.obraKgMes : cadencia;

  // ⚠ O CUSTO DO DINHEIRO ENTRA NO RESULTADO, NÃO SÓ NUM QUADRO À PARTE. Os meses entre pagar o
  // aço e receber a medição custam juro real; deixá-los fora do resultado é dar lucro de mentira.
  // Por isso a conta roda em duas passadas: a primeira acha o imposto, a segunda usa o fluxo.
  const conta = (cen, mods = {}) => {
    const preco = numeroBr(cen.preco) * (1 + (mods.precoPct || 0) / 100);
    const comum = {
      capacidadeKgMes: cadenciaObra * (1 + (mods.cadenciaPct || 0) / 100),
      custoOperacionalMes: fabrica?.custoOperacionalMes || 0,
      acoPct: mods.acoPct || 0,
      mesesExtra: mods.mesesExtra || 0,
      // ⚠ a fase de projeto entra em TODOS os cenários: é custo, e desloca o caixa um mês inteiro
      mesesProjeto: cfg.mesesProjeto == null || cfg.mesesProjeto === "" ? 1 : Math.max(0, Math.round(numeroBr(cfg.mesesProjeto))),
      custoProjetoMes: numeroBr(cfg.custoProjetoMes),
      // ⚠ o PRAZO DIGITADO vale aqui também. Antes a cascata cobrava a casa por peso ÷ cadência e
      // o fluxo pelos meses do contrato — dois números na mesma tela, e ninguém via a diferença.
      mesesFabricacao: numeroBr(cfg.mesesFabricacao),
      mesInicioFabricacao: numeroBr(cfg.mesInicioFabricacao),
      ocupacaoPct: cfg.ocupacaoPct,
    };
    const seco = resultadoDoCenario(res, { ...cen, preco }, { ...comum, custoFinanceiro: 0 });
    const parcelas = (comp.pagamento?.parcelas?.length ? comp.pagamento.parcelas : PAGAMENTO_PADRAO)
      .map((p) => (mods.recebimentoDias ? { ...p, dias: numeroBr(p.dias) + mods.recebimentoDias } : p));
    const f = fluxoDeCaixa({
      meses: seco.meses, preco, pesoKg: res.pesoTotal, impostos: seco.impostos, material: seco.material,
      mesesProjeto: comum.mesesProjeto, custoProjetoMes: comum.custoProjetoMes,
      mesInicioFabricacao: comum.mesInicioFabricacao,
      terceiros: res.totais?.mdo?.subtotal || 0,
      // ⚠ o fluxo cobra o MESMO custo mensal que a cascata: sem o rateio pela ocupação, o caixa
      // pagaria a fábrica inteira e o resultado só a fatia — e os dois quadros brigariam.
      custoOperacionalMes: (fabrica?.custoOperacionalMes || 0) * (numeroBr(seco.ocupacaoPct) / 100),
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
      kgMedidoPorMes: Array.isArray(cfg.kgMedidoPorMes) ? cfg.kgMedidoPorMes.map((v) => numeroBr(v)) : [],
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
                  ["Fábrica que a obra come", (r) => `${r.mesesConsumo} meses · ${r.ocupacaoPct}%`, "quanto da fábrica esta obra ocupa no prazo", "text-torg-gray"],
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
        <OQueMoveOResultado
          sens={sens}
        />
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
          <Cadencia fabrica={fabrica} cfg={cfg} mexer={mexer} res={res} cadencia={cadencia} analise={analise} />
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
