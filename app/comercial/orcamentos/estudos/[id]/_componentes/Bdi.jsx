"use client";
import { BDI_CAMPOS, CFOPS, cargaDoCfop } from "@/lib/lqc";
import { Campo, Inp, Linha } from "./campos";
import { fmtR$ } from "../_lib/formatos";

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
export function Bdi({ c, res, setComp }) {
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
        {/* ⚠ CAMPO DE RÓTULO LONGO NÃO PODE EMPURRAR O SEU. Vitor (05/09/2026): "alinhe essas
            partes". "Administração do escritório central (%)" e "Despesas financeiras (factoring)
            (%)" ocupam duas linhas; como o rótulo, o campo e a nota eram irmãos num bloco, a caixa
            desses dois descia e a linha inteira ficava em degrau.

            ⚠ E O QUE ALINHA É O RÓTULO, NÃO O RODAPÉ. A primeira tentativa esticava o rótulo
            (`flex-1`) e ancorava a célula embaixo — funciona enquanto todas as notas de rodapé
            têm o mesmo número de linhas. No cronograma, onde uma nota quebra em duas, a caixa
            daquela célula subia sozinha (Vitor, 05/09/2026: "ajuste as linhas"). Reservar duas
            linhas de altura para o rótulo alinha as caixas por cima, que é o que se lê. */}
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
          {[...noCusto, ...naVenda].map((campo) => (
            <label key={campo.key} className="flex flex-col text-[11px] text-torg-dark">
              <span className="min-h-[2.75em] leading-snug">{campo.nome} <span className="text-torg-gray">(%)</span></span>
              <Inp value={bdi[campo.key] ?? ""} onChange={(e) => set(campo.key, e.target.value)} className="block mt-1 w-full text-right" />
              <span className="block text-[10px] text-torg-gray mt-0.5">{campo.onde === "custo" ? "sobre o custo" : "sobre a venda"}</span>
            </label>
          ))}
        </div>
        {/* ⚠⚠ BDI DE 400% NÃO É ERRO DE FÓRMULA, É LEITURA ERRADA DA ALAVANCA. Auditoria de
            05/09/2026: a LQC-268 saiu com BDI 400% porque margem 50 + impostos 27 + factoring 3
            somam 80% no denominador. "Margem" aqui é sobre a VENDA — 50% quintuplica o preço.
            Quem digitou provavelmente queria 50% sobre o custo, que é 33% sobre a venda. */}
        {res.bdiAlerta && (
          <p className={`mt-4 text-[11px] rounded-lg px-3 py-2 border ${res.bdiAlerta.nivel === "erro" ? "text-red-700 bg-red-50 border-red-200" : "text-torg-dark bg-[#FFF7ED] border-[#F4801F]/30"}`}>
            <strong>BDI de {res.bdiPct}%</strong> — {res.bdiAlerta.texto} (somam {res.bdiAlerta.den}%).
            {" "}Margem de 50% sobre o custo equivale a 33% sobre a venda.
          </p>
        )}

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
            <tr className="bg-gray-50 font-semibold"><td className="px-5 py-1.5" colSpan={4}>Débito — o que a venda gera</td>
              <td className="px-5 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(res.debitoImpostos)}</td></tr>
            {/* ⚠ ICMS É NÃO CUMULATIVO. Vitor (23/08/2026): "teremos o crédito referente às compras,
                considerar 12% de ICMS — transporte, parafusos, tinta, material e acessórios comprados
                devem ser calculados e dado crédito". Ignorar isso joga milhões de imposto que não
                existem dentro do preço, e o concorrente que conta certo ganha com a mesma margem. */}
            {(res.creditoIcms?.linhas || []).filter((l) => l.base > 0).map((l) => (
              <tr key={l.key} className="text-green-700">
                <td className="px-5 py-1.5">Crédito · {l.nome}</td>
                <td className="px-2 py-1.5 text-torg-gray">ICMS na entrada</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(l.base)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.aliquotaPct}%</td>
                <td className="px-5 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">− {fmtR$(l.valor)}</td>
              </tr>
            ))}
            <tr className="bg-torg-blue-50/50 font-bold"><td className="px-5 py-1.5" colSpan={4}>
              Imposto a recolher <span className="font-normal text-torg-gray">— débito menos crédito</span></td>
              <td className="px-5 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(res.totalImpostos)}</td></tr>
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-end gap-4">
          <Campo r="ICMS de crédito nas compras (%)" ajuda="alíquota da entrada; vazio usa 12%">
            <Inp value={c.creditoIcmsPct ?? ""} placeholder="12"
              onChange={(e) => setComp({ creditoIcmsPct: e.target.value })} className="w-24 text-right" /></Campo>
          <p className="text-[11px] text-torg-gray flex-1 min-w-[240px]">
            A carga cai de <strong className="text-torg-dark">{res.splitFaturamento?.cargaBrutaPct}%</strong> para{" "}
            <strong className="text-torg-dark">{res.splitFaturamento?.cargaEfetivaPct}%</strong> do preço —
            são <strong className="text-green-700">{fmtR$(res.creditoIcms?.total)}</strong> que a obra não paga de imposto
            porque já pagou na compra.
            <span className="block mt-1">
              ⚠ crédito só do que a <strong className="text-torg-dark">Torg</strong> compra: material que o cliente compra
              direto do fornecedor nunca entrou por nota nossa, e não gera crédito nenhum.
            </span>
            {res.creditoIcms?.semCredito?.length ? (
              <span className="block mt-1 text-torg-orange-700">
                Sem crédito nesta obra porque está em nome do cliente:{" "}
                <strong>{res.creditoIcms.semCredito.join(", ")}</strong>.
              </span>
            ) : null}
          </p>
        </div>
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
