"use client";
import { PRECO_TERCEIRO_CLASSE, cadenciaPorClasse, decisaoTerceirizar, margemPorMesDeFabrica } from "@/lib/lqc";
import { Inp } from "./campos";
import { fmtR$, num } from "../_lib/formatos";

/**
 * FAZER AQUI OU TERCEIRIZAR — a decisão que o Comercial precisa tomar antes de fechar o preço.
 *
 * ⚠ O comparativo NÃO é contra a tabela de industrialização (que é o que a casa decidiu cobrar), e
 * sim contra o custo REAL de fazer dentro: custo mensal da casa ÷ cadência daquela classe. É o que
 * revela por que extra leve, que roda a 143 t/mês, sai quase o dobro por quilo da pesada.
 */
export function FazerOuTerceirizar({ cadencia, res, cfg, mexer, fabrica, analise }) {
  const set = (k, v) => mexer((a) => ({ cenario: { ...(a.cenario || {}), [k]: v } }));
  const cad = cadenciaPorClasse(cadencia, res.pesoPorClasse || {});
  const base = (analise?.cenarios || []).find((x) => x.key === "base") || (analise?.cenarios || [])[1];
  // quanto um mês de fábrica rende, medido NESTA obra — é a régua honesta: se a próxima obra for
  // parecida, é isso que o mês liberado vale.
  const margemSugerida = base?.meses > 0 ? Math.round((base.resultado || 0) / base.meses) : 0;
  const margemPorMes = num(cfg.margemPorMesFabrica) || margemSugerida;
  // preço por classe: o digitado manda; sem digitar, vale a tabela da casa
  const precoPorClasse = Object.fromEntries(
    Object.keys(PRECO_TERCEIRO_CLASSE).map((k) => [k, num(cfg.terceiroPorClasse?.[k])]),
  );
  const setPreco = (k, v) => mexer((a) => ({
    cenario: { ...(a.cenario || {}), terceiroPorClasse: { ...((a.cenario || {}).terceiroPorClasse || {}), [k]: v } },
  }));
  const d = decisaoTerceirizar({
    cadencia: cad,
    custoOperacionalMes: fabrica?.custoOperacionalMes || 0,
    precoPorClasse,
    freteKg: num(cfg.terceiroFreteKg),
    retrabalhoPct: num(cfg.terceiroRetrabalhoPct),
    margemPorMes,
  });
  const temPreco = d.linhas.length > 0;
  const ganham = d.linhas.filter((l) => l.difKg < 0);

  // ⚠⚠ COM A FÁBRICA CHEIA A CONTA VIRA DE CABEÇA PARA BAIXO. Vitor (05/09/2026): "e se a demanda
  // da fábrica estiver cheia e eu decidir terceirizar média, pesada e extra pesada, qual seria a
  // forma de eu ganhar dinheiro com isso?". Com fábrica sobrando decide-se pelo custo do quilo;
  // com fábrica CHEIA, cada quilo feito aqui tira o lugar de outro, e o que decide é a MARGEM POR
  // MÊS DE FÁBRICA. Fica dentro o que rende mais por mês — e é a pesada, que roda 2,25× mais quilo
  // no mesmo tempo. Ver `margemPorMesDeFabrica`.
  const cheia = !!cfg.fabricaCheia;
  const rende = margemPorMesDeFabrica(res, cad).filter((x) => x.pesoKg > 0);
  const casaMes = fabrica?.custoOperacionalMes || 0;
  const porMes = new Map(rende.map((x) => [x.key, x]));

  return (
    <div className="px-4 py-3 border-t border-gray-100 bg-white">
      <p className="text-[12px] font-bold text-torg-dark">Fazer aqui ou terceirizar</p>
      <p className="text-[11px] text-torg-gray mt-0.5">
        O custo de fazer dentro é o <strong className="text-torg-dark">custo da casa dividido pela cadência da classe</strong> —
        não o que a tabela cobra. Extra leve ocupa mais fábrica por quilo, e é por isso que ela costuma ser a primeira a sair.
        Terceirizar também <strong className="text-torg-dark">devolve meses de fábrica</strong>: eles só valem alguma coisa se houver obra para ocupá-los.
      </p>
      <div className="grid sm:grid-cols-3 gap-x-4 gap-y-3 mt-3">
        {[["terceiroFreteKg", "Frete ida e volta", "R$/kg, se não estiver no preço"],
          ["terceiroRetrabalhoPct", "Perda e retrabalho", "% sobre o terceiro"],
          ["margemPorMesFabrica", "Um mês de fábrica rende", `R$/mês — sugerido ${fmtR$(margemSugerida)}`]].map(([k, rot, ajuda]) => (
          <label key={k} className="flex flex-col text-[11px] text-torg-dark">
            <span className="min-h-[2.75em] leading-snug">{rot}</span>
            <Inp value={cfg[k] ?? ""} placeholder={k === "margemPorMesFabrica" ? String(margemSugerida) : ""}
              onChange={(ev) => set(k, ev.target.value)} className="block mt-1 w-full text-right" />
            <span className="block text-[10px] text-torg-gray mt-0.5">{ajuda}</span>
          </label>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[12px] text-torg-dark mt-3">
        <input type="checkbox" checked={cheia} onChange={(ev) => set("fabricaCheia", ev.target.checked)} />
        A fábrica está cheia — decidir por <strong>margem por mês</strong>, não por custo do quilo
      </label>

      {!temPreco ? (
        <p className="text-[11px] text-torg-gray mt-3">O quantitativo desta obra ainda não tem classe lançada — sem ela não dá para comparar por tipo de estrutura.</p>
      ) : (
        <>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-[12px]" style={{ minWidth: 640 }}>
              <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
                <tr><th className="text-left px-3 py-1.5">Classe</th><th className="text-right px-2 py-1.5">Peso</th>
                  <th className="text-right px-2 py-1.5">Dentro</th><th className="text-right px-2 py-1.5">Terceiro R$/kg</th>
                  <th className="text-right px-2 py-1.5">Posto aqui</th>
                  <th className="text-right px-2 py-1.5">Diferença</th><th className="text-right px-2 py-1.5">Libera</th>
                  <th className="text-right px-3 py-1.5">{cheia ? "Rende por mês aqui" : "A fábrica liberada rende"}</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.linhas.map((l) => (
                  <tr key={l.key} className={l.difKg < 0 ? "bg-green-50/50" : ""}>
                    <td className="px-3 py-1.5 font-semibold text-torg-dark">{l.nome}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Math.round(l.pesoKg).toLocaleString("pt-BR")} kg</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(l.dentroKg)}/kg</td>
                    <td className="px-2 py-1.5 text-right">
                      <Inp value={cfg.terceiroPorClasse?.[l.key] ?? ""} placeholder={String(PRECO_TERCEIRO_CLASSE[l.key] ?? "").replace(".", ",")}
                        onChange={(ev) => setPreco(l.key, ev.target.value)} className="w-20 text-right" />
                      {!l.cotado && <span className="block text-[9px] text-torg-orange-700 mt-0.5">herdado do médio</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtR$(l.foraKg)}/kg</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${l.diferenca <= 0 ? "text-green-700" : "text-red-600"}`}>
                      {l.diferenca <= 0 ? "−" : "+"} {fmtR$(Math.abs(l.diferenca))}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.mesesLiberados.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mês</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                      {cheia
                        ? (porMes.get(l.key)
                            ? <span className={porMes.get(l.key).margemMes >= casaMes ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{fmtR$(porMes.get(l.key).margemMes)}</span>
                            : "—")
                        : fmtR$(l.ganhoCapacidade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cheia && rende.length > 0 && (
            <p className="text-[11px] text-torg-dark bg-torg-blue-50/50 border border-torg-blue-200 rounded-lg px-3 py-2 mt-3">
              Fábrica cheia: o mês vale mais em <strong>{rende[0].nome.toLowerCase()}</strong> ({fmtR$(rende[0].margemMes)}/mês)
              e menos em <strong>{rende[rende.length - 1].nome.toLowerCase()}</strong> ({fmtR$(rende[rende.length - 1].margemMes)}/mês).
              {casaMes > 0 && rende[rende.length - 1].margemMes < casaMes
                ? <> A casa custa {fmtR$(casaMes)}/mês — um mês inteiro de {rende[rende.length - 1].nome.toLowerCase()} não se paga.</>
                : null}
              {" "}Terceirize de baixo para cima: sai primeiro o que rende menos por mês, não o que é mais caro por quilo.
            </p>
          )}
          <p className="text-[11px] text-torg-dark bg-torg-blue-50/50 border border-torg-blue-200 rounded-lg px-3 py-2 mt-3">
            {ganham.length > 0
              ? <>Terceirizar <strong>{ganham.map((l) => l.nome.toLowerCase()).join(" e ")}</strong> já sai mais barato que fazer aqui —{" "}
                  <strong>{fmtR$(Math.abs(ganham.reduce((a, l) => a + l.diferenca, 0)))}</strong> de economia — e ainda devolve{" "}
                  <strong>{ganham.reduce((a, l) => a + l.mesesLiberados, 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mês</strong> de fábrica.</>
              : <>Nenhuma classe fica mais barata fora. Terceirizar a obra inteira custaria <strong>{fmtR$(d.total.diferenca)}</strong> a mais
                  e devolveria <strong>{d.total.mesesLiberados.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} meses</strong> de
                  fábrica — que valem <strong>{fmtR$(d.total.ganhoCapacidade)}</strong> se houver carteira para ocupá-los.</>}
          </p>
          <p className="text-[10px] text-torg-gray mt-1.5">
            ⚠ O terceiro entra no preço pela aba Terceiros — este quadro é a decisão, não o lançamento.
          </p>
        </>
      )}
    </div>
  );
}
