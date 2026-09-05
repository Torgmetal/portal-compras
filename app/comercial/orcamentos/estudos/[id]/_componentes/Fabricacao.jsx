"use client";
import { CustoDaFabrica } from "./CustoDaFabrica";
import { Inp, Quadro } from "./campos";
import { fmtKg, fmtR$, num } from "../_lib/formatos";

/** FABRICAÇÃO — o que a fábrica faz. Sempre Torg, então não há o que escolher. */
export function Fabricacao({ c, res, setComp, custoFabrica }) {
  // ⚠ só as áreas no escopo: pré-montar o que não se vende não existe
  const areasDisponiveis = [...new Set((c.resumos || []).filter((l) => l.ativo !== false).map((l) => l.area || l.item).filter(Boolean))];
  const pct = c.preMontagemPct ?? "";
  const pctNum = num(pct);
  const tabelado = pctNum === 10 || pctNum === 100;
  const g = res.grupos || {};

  return (
    <div className="space-y-4">
      {custoFabrica && <CustoDaFabrica cf={custoFabrica} c={c} setComp={setComp} res={res} />}

      <Quadro titulo="Fabricação por classe" grupo={g.fabricacao}
        vazio="Lance a classificação nas linhas do quantitativo — é ela que escolhe o preço." />

      {/* ⚠ NÃO SE PRÉ-MONTA "25% DA OBRA". Vitor (23/08/2026): "na pré-montagem vale deixar
          selecionar as áreas que serão pré-montadas". Pré-monta-se a galeria e a treliça — as
          peças que vão inteiras para o canteiro. Escolhendo as áreas, o percentual SAI da conta
          em vez de ser adivinhado, e o peso é o daquelas áreas, não uma fatia teórica espalhada. */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-bold text-torg-dark mb-1">Pré-montagem</p>
        <p className="text-[11px] text-torg-gray mb-3">Escolha as áreas que saem pré-montadas da fábrica.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {areasDisponiveis.map((a2) => {
            const marcada = (c.preMontagemAreas || []).includes(a2);
            return (
              <label key={a2} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 cursor-pointer ${marcada ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
                <input type="checkbox" checked={marcada}
                  onChange={(e) => setComp({ preMontagemAreas: e.target.checked
                    ? [...(c.preMontagemAreas || []), a2]
                    : (c.preMontagemAreas || []).filter((x) => x !== a2) })}
                  className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                <span className="text-[11px] text-torg-dark truncate" title={a2}>{a2}</span>
              </label>
            );
          })}
          {!areasDisponiveis.length && <p className="text-[11px] text-torg-gray col-span-full">Lance as áreas no quantitativo primeiro.</p>}
        </div>

        {res.preMont?.porArea ? (
          <p className="text-[11px] text-torg-gray mt-3">
            <strong className="text-torg-dark">{fmtKg(res.preMont.pesoKg)}</strong> pré-montados —{" "}
            {res.preMont.pctDaObra}% do peso da obra, que é o que escolhe a coluna de preço.
            {res.preMont.pctDaObra !== 10 && res.preMont.pctDaObra !== 100 && " Não é percentual tabelado: interpolado entre 10% e 100%."}
          </p>
        ) : (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] text-torg-gray mb-2">Sem área marcada, dá para usar um percentual da obra:</p>
            <div className="flex flex-wrap items-center gap-2">
              <Inp value={pct} onChange={(e) => setComp({ preMontagemPct: e.target.value })} className="w-20 text-right" />
              <span className="text-[12px] text-torg-gray">%</span>
              {[0, 10, 25, 50, 100].map((v) => (
                <button key={v} onClick={() => setComp({ preMontagemPct: v })}
                  className={`text-[11px] font-semibold rounded px-2.5 py-1 border ${pctNum === v ? "border-torg-blue text-torg-blue bg-torg-blue-50" : "border-gray-200 text-torg-gray hover:border-torg-blue/40"}`}>
                  {v}%
                </button>
              ))}
            </div>
            <p className="text-[11px] text-torg-gray mt-2">
              {pctNum === 0 ? "Sem pré-montagem."
                : tabelado ? `${pctNum}% é preço tabelado.`
                  : `${pctNum}% não é tabelado — interpolado entre as âncoras de 10% e 100%.`}
            </p>
          </div>
        )}

        {res.preMont?.total > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[12px] font-bold text-torg-dark mb-2">Como aparece na proposta</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[["diluido", "Diluída no R$/kg", "some ao preço da estrutura"],
                ["separado", "Item separado", "linha própria na proposta, fora do R$/kg"]].map(([k, nome, ajuda]) => (
                <label key={k} className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 cursor-pointer ${res.preMont.apresentacao === k ? "border-torg-blue bg-torg-blue-50" : "border-gray-200"}`}>
                  <input type="radio" name="apresPre" checked={res.preMont.apresentacao === k}
                    onChange={() => setComp({ preMontagemApresentacao: k })} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-torg-dark">{nome}</span>
                    <span className="block text-[11px] text-torg-gray">{ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-torg-gray mt-2">
              {fmtR$(res.preMont.total)} — equivale a {fmtR$(res.preMont.porKg)}/kg da obra.
            </p>
          </div>
        )}
      </div>

      {pctNum > 0 && <Quadro titulo="Pré-montagem por classe" grupo={g.preMontagem} />}
    </div>
  );
}
