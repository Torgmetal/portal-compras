"use client";
import { BASES_ENSAIO, ENSAIOS } from "@/lib/lqc";
import { Inp, Sel } from "./campos";
import { fmtKg, fmtR$ } from "../_lib/formatos";

/**
 * ENSAIOS DA QUALIDADE — quantos e quanto.
 *
 * Vitor (23/08/2026): "Pull-off, Salinidade, Ultrassom, Dimensional N1, Visual de Solda N1 — para
 * esses testes verificar na norma a quantidade que precisamos fazer por kg ou por m²".
 *
 * ⚠ A FREQUÊNCIA VEM PREENCHIDA MAS NÃO É A NORMA. A referência de cada ensaio está escrita ao
 * lado, mas a quantidade que se faz numa obra sai do CONTRATO e do procedimento dela — a mesma
 * norma admite planos de amostragem diferentes, e o cliente costuma apertar. Errar aqui custa dos
 * dois lados: a mais, perde-se a proposta; a menos, assume-se ensaio que não foi orçado. Por isso
 * o campo é editável e a tela pede a conferência em vez de afirmar.
 */
export function Ensaios({ c, res, setComp }) {
  const cfg = c.ensaios || {};
  const set = (k, campo, v) => setComp({ ensaios: { ...cfg, [k]: { ...(cfg[k] || {}), [campo]: v } } });
  const linhas = res.ensaios?.linhas || [];

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2">
        A frequência abaixo é ponto de partida, <strong className="text-torg-dark">não a norma</strong>.
        Confira contra a especificação da obra antes de fechar o preço: a mesma norma admite planos de
        amostragem diferentes, e o cliente costuma apertar.
      </p>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Ensaio / inspetor</th><th className="text-left px-2 py-1.5">Base</th>
              <th className="text-right px-2 py-1.5">1 a cada / dias</th><th className="text-right px-2 py-1.5">Universo</th>
              <th className="text-right px-2 py-1.5">Qtd.</th><th className="text-right px-2 py-1.5">Custo unit.</th>
              <th className="text-right px-4 py-1.5">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ENSAIOS.map((e) => {
              const l = linhas.find((x) => x.key === e.key) || {};
              return (
                <tr key={e.key}>
                  <td className="px-4 py-1.5">
                    <span className="block font-semibold text-torg-dark">{e.nome}</span>
                    <span className="block text-[10px] text-torg-gray">{e.norma}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    {/* ⚠ inspetor tem as quatro bases; ensaio de amostragem só kg/m². Oferecer
                        "verba" num pull-off convidaria a esconder o custo de amostragem numa
                        verba que ninguém confere. */}
                    <Sel value={cfg[e.key]?.base || e.base} onChange={(ev) => set(e.key, "base", ev.target.value)}
                      opcoes={e.pessoa ? ["dia", "kg", "vb"] : ["kg", "m2"]} className="w-20" />
                    <span className="block text-[10px] text-torg-gray mt-0.5">{BASES_ENSAIO[l.base || e.base]}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {(l.base || e.base) === "dia"
                      ? <Inp value={cfg[e.key]?.qtd ?? ""} onChange={(ev) => set(e.key, "qtd", ev.target.value)} className="w-20 text-right" placeholder="dias" />
                      : (l.base || e.base) === "vb"
                        ? <span className="text-[10px] text-torg-gray">—</span>
                        : <Inp value={cfg[e.key]?.cada ?? e.cada} onChange={(ev) => set(e.key, "cada", ev.target.value)} className="w-20 text-right" />}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                    {(l.base || e.base) === "m2" ? `${Number(l.universo || 0).toLocaleString("pt-BR")} m²`
                      : (l.base || e.base) === "dia" ? `${Number(l.universo || 0).toLocaleString("pt-BR")} dias`
                      : (l.base || e.base) === "vb" ? "—" : fmtKg(l.universo)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{l.qtd || 0}</td>
                  <td className="px-2 py-1.5 text-right"><Inp value={cfg[e.key]?.custo ?? ""} onChange={(ev) => set(e.key, "custo", ev.target.value)} className="w-24 text-right" /></td>
                  <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(l.total)}</td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 font-bold"><td className="px-4 py-1.5" colSpan={6}>Total da qualidade</td>
              <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(res.ensaios?.total)}</td></tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-torg-gray">
        Área de pintura considerada: <strong className="text-torg-dark">{Number(res.areaM2 || 0).toLocaleString("pt-BR")} m²</strong> —
        vem do coeficiente de superfície de cada linha do quantitativo, como a planilha calcula.
        {!res.areaM2 && " Sem coeficiente lançado, os ensaios por m² ficam zerados."}
        {" "}Equivale a <strong className="text-torg-dark">{fmtR$(res.ensaios?.porKg)}/kg</strong>, que é como
        a linha 2.3 da planilha (inspeção e data book) recebe esse custo.
      </p>
    </div>
  );
}
