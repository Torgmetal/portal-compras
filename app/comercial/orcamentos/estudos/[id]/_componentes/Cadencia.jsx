"use client";
import { CadenciaPorClasse } from "./CadenciaPorClasse";
import { FazerOuTerceirizar } from "./FazerOuTerceirizar";
import { Inp } from "./campos";

/**
 * A CADÊNCIA DA FÁBRICA — e o que ela faz com o custo por quilo.
 *
 * Vitor (23/08/2026): "você pegou esse número da produção, porém eu acho que não é esse de fato,
 * pois nossa fábrica já teve alguns meses que entregou um número acima de 330 t. Como podemos
 * medir de fato para sabermos a quantidade de kg que é possível fabricarmos?".
 *
 * ⚠ MÉDIA E CAPACIDADE SÃO PERGUNTAS DIFERENTES. A média mede o que a fábrica ABSORVEU — e nos
 * últimos meses quem limitou foi a carteira, não a fábrica. Capacidade é o que ela AGUENTA.
 * Tratar uma como a outra faz toda obra parecer mais lenta e mais cara do que precisa ser.
 *
 * ⚠ E POR HORA NÃO DÁ PARA MEDIR COM O DADO DE HOJE: no Syneco o apontamento é um CARIMBO, não um
 * intervalo — `dataFim` é igual a `dataInicio` nos 50.733 registros. Sem duração não existe
 * kg/hora. Por operador-dia também não fecha: o acabamento registra 63 t num dia porque encerra
 * um lote inteiro de uma vez, não porque produziu 63 t naquele dia.
 *
 * O que dá para medir com honestidade são três leituras do próprio apontamento, e o efeito de
 * cada uma no custo — que é onde a pergunta realmente importa.
 */
export function Cadencia({ fabrica, cfg, mexer, res, cadencia, analise }) {
  const L = fabrica.leituras || {};
  const custoMes = fabrica.custoOperacionalMes || 0;
  const set = (v) => mexer((a) => ({ cenario: { ...(a.cenario || {}), cadenciaKgMes: v } }));

  // ⚠ o que a tabela COBRA de industrialização por quilo — é contra isto que a cadência se mede
  const tabelaPorKg = res.pesoTotal > 0 ? (res.totais?.industrializacao?.subtotal || 0) / res.pesoTotal : 0;
  const empata = tabelaPorKg > 0 ? Math.round(custoMes / tabelaPorKg) : 0;

  // ⚠ O SEMESTRE É O NÚMERO DEFENSÁVEL, e não o trimestre. Vitor (23/08/2026): "temos um furo
  // enorme nos números de expedição, pintura e jato". O furo aparece no kg por apontamento: o
  // acabamento salta de 129 kg (847 lançamentos em set/2025) para 400 kg (476 lançamentos para
  // 190 t em fev/2026) — é lote atrasado fechado de uma vez, seguido da ressaca de mai/2026 com
  // 45 t. Um trimestre cabe inteiro dentro de um ciclo desses; um semestre, não.
  const opcoes = [
    { key: "media", nome: "Média de hoje", kg: L.mediaKgMes, ajuda: `o que a fábrica absorveu em ${fabrica.mesesConsiderados} meses` },
    { key: "sem", nome: "Melhor semestre", kg: L.melhorSemestreKgMes, ajuda: L.melhorSemestre ? `sustentado de ${L.melhorSemestre}` : "seis meses seguidos", recomendado: true },
    { key: "tri", nome: "Melhor trimestre", kg: L.melhorTrimestreKgMes, ajuda: L.melhorTrimestre ? `${L.melhorTrimestre} — curto para o registro em lote` : "três meses seguidos" },
    { key: "pico", nome: "Melhor mês", kg: L.melhorMesKgMes, ajuda: L.melhorMes ? `atingido em ${L.melhorMes}` : "teto observado" },
  ].filter((o) => o.kg > 0);

  const linhas = [...opcoes.map((o) => ({ ...o, marca: false })),
    ...(empata > 0 ? [{ key: "empata", nome: "Onde a tabela empata", kg: empata, ajuda: "a cadência que faz o preço de industrialização cobrir o custo", marca: true }] : [])]
    .sort((a, b) => a.kg - b.kg);

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">A cadência da fábrica</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          Média não é capacidade. Nos últimos meses quem limitou a produção foi a carteira, não a fábrica — então
          a média mede o que ela <strong className="text-torg-dark">absorveu</strong>, e o melhor trimestre é o piso
          confiável do que ela <strong className="text-torg-dark">aguenta</strong>. A escolha aqui muda o prazo da obra
          e, com ele, quanto do custo da casa esta obra carrega.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {opcoes.map((o) => (
            <button key={o.key} type="button" onClick={() => set(String(o.kg))}
              className={`text-left border rounded-lg px-3 py-2 transition ${cadencia === o.kg ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
              <span className="block text-[11px] font-semibold text-torg-dark whitespace-nowrap">
                {o.nome}{o.recomendado ? <span className="ml-1 text-[9px] uppercase tracking-wider text-torg-orange-700">recomendado</span> : null}
              </span>
              <span className="block text-[13px] font-bold tabular-nums text-torg-dark whitespace-nowrap">{o.kg.toLocaleString("pt-BR")} kg/mês</span>
              <span className="block text-[10px] text-torg-gray">{o.ajuda}</span>
            </button>
          ))}
          <label className="text-[11px] text-torg-dark border border-gray-200 rounded-lg px-3 py-2">
            <span className="block font-semibold">Outra</span>
            <Inp value={cfg.cadenciaKgMes ?? ""} placeholder={String(L.mediaKgMes || "")}
              onChange={(e) => set(e.target.value)} className="block mt-0.5 w-28 text-right" />
            <span className="block text-[10px] text-torg-gray mt-0.5">kg/mês</span>
          </label>
        </div>
      </div>

      {/* ⚠⚠ UM kg/mês SÓ MENTE. A fábrica que faz 250 t de estrutura pesada não faz 250 t de
          guarda-corpo: a mesma tonelada de extra leve tem muito mais peça, corte, solda e pintura.
          Vitor (05/09/2026): "na parte de cadência você deveria fazer um resumo de tipos de
          estrutura". A proporção sai da própria tabela de classes — a coluna de fabricação (R$/kg)
          É o índice de dificuldade. Ver `cadenciaPorClasse` em lib/lqc. */}
      <CadenciaPorClasse cadencia={cadencia} res={res} />
      {/* ⚠⚠ EXTRA LEVE É A PRIMEIRA CANDIDATA A SAIR. Vitor (05/09/2026): "em obras onde temos
          muita estrutura extra leve precisamos que tenha a opção de terceirizar… porém o custo se
          torna maior… como poderíamos projetar isso e tomar uma decisão já no comercial?".
          A conta está em `decisaoTerceirizar` (lib/lqc): custo real dentro = casa ÷ cadência da
          classe, e o ganho não é só dinheiro — é fábrica liberada. */}
      <FazerOuTerceirizar cadencia={cadencia} res={res} cfg={cfg} mexer={mexer} fabrica={fabrica} analise={analise} />

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Cadência</th>
              <th className="text-right px-3 py-1.5">kg/mês</th>
              <th className="text-right px-3 py-1.5">Custo da casa por kg</th>
              <th className="text-right px-3 py-1.5">A tabela cobra</th>
              <th className="text-right px-4 py-1.5">Cobre?</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.map((o) => {
              const porKg = o.kg > 0 ? custoMes / o.kg : 0;
              const dif = tabelaPorKg - porKg;
              return (
                <tr key={o.key} className={o.marca ? "bg-torg-blue-50/40 font-semibold" : cadencia === o.kg ? "bg-gray-50" : ""}>
                  <td className="px-4 py-1.5">{o.nome}
                    <span className="block text-[10px] text-torg-gray font-normal leading-tight">{o.ajuda}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{o.kg.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">R$ {porKg.toFixed(2).replace(".", ",")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">R$ {tabelaPorKg.toFixed(2).replace(".", ",")}</td>
                  <td className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${dif >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {dif >= 0 ? "+" : "−"} R$ {Math.abs(dif).toFixed(2).replace(".", ",")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {empata > 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-t border-[#F4801F]/30 px-4 py-2.5">
          A tabela de industrialização cobra <strong>R$ {tabelaPorKg.toFixed(2).replace(".", ",")}/kg</strong>, que é
          o custo da casa quando a fábrica roda a <strong>{empata.toLocaleString("pt-BR")} kg/mês</strong>.
          Hoje ela roda {(L.mediaKgMes || 0).toLocaleString("pt-BR")} — por isso o mesmo preço cobre{" "}
          {Math.round((tabelaPorKg / (custoMes / (L.mediaKgMes || 1))) * 100)}% do custo. O preço não está errado:
          está carregando uma fábrica mais cheia do que a de agora. Encher a fábrica é o caminho mais barato de
          consertar a margem — mais barato que subir preço.
        </p>
      )}

      {/* ⚠ picos por setor: o teto observado NÃO é o mesmo em toda a rota, e a menor peça manda. */}
      {(fabrica.picos || []).length > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-[12px]" style={{ minWidth: 520 }}>
            <caption className="text-[10px] uppercase text-torg-gray text-left px-4 py-2 bg-gray-50">
              O que cada setor já provou fazer
            </caption>
            <thead className="text-[10px] uppercase text-torg-gray">
              <tr><th className="text-left px-4 py-1.5">Setor</th>
                <th className="text-right px-3 py-1.5">Média</th>
                <th className="text-right px-3 py-1.5">Melhor semestre</th>
                <th className="text-right px-3 py-1.5">Melhor mês</th>
                <th className="text-left px-4 py-1.5">Registro</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {fabrica.picos.map((p) => {
                const falha = [p.registroFalho && `só ${p.mesesCheios} de ${p.mesesComDado} meses com registro cheio`,
                  p.registroIrregular && "fecha lote atrasado de uma vez"].filter(Boolean);
                return (
                  <tr key={p.setor}>
                    <td className="px-4 py-1 whitespace-nowrap">{p.setor}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-torg-gray">{(p.mediaKgMes || 0).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap font-semibold">{p.melhorSemestreKgMes ? p.melhorSemestreKgMes.toLocaleString("pt-BR") : "—"}</td>
                    <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">{(p.melhorMesKgMes || 0).toLocaleString("pt-BR")}
                      <span className="text-torg-gray"> · {p.melhorMes || "—"}</span></td>
                    <td className={`px-4 py-1 text-[10px] leading-tight ${falha.length ? "text-torg-orange-700" : "text-torg-gray"}`}>
                      {falha.length ? falha.join(" · ") : "regular"}
                    </td>
                  </tr>
                );
              })}
              {/* ⚠ setor que sumiu da rota quase nunca parou de produzir — parou de APONTAR. */}
              {(fabrica.setoresIgnorados || []).filter((x) => x.ultimoMes).map((x) => (
                <tr key={x.setor} className="bg-[#FFF7ED]">
                  <td className="px-4 py-1 whitespace-nowrap">{x.setor}</td>
                  <td className="px-3 py-1 text-right text-torg-gray">—</td>
                  <td className="px-3 py-1 text-right text-torg-gray">—</td>
                  <td className="px-3 py-1 text-right text-torg-gray">—</td>
                  <td className="px-4 py-1 text-[10px] leading-tight text-torg-orange-700">
                    sem apontamento desde {x.ultimoMes} — não dá para medir
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
        ⚠ Para medir capacidade de verdade faltaria a <strong className="text-torg-dark">duração</strong> do
        apontamento: hoje o Syneco carimba o evento e grava fim igual ao início, então não existe kg/hora.
        Enquanto isso, o <strong className="text-torg-dark">melhor semestre</strong> é o número mais defensável.
        Seis meses comem a distorção do registro em lote que três não comem — e o semestre do corte
        ({(L.melhorSemestreKgMes || 0).toLocaleString("pt-BR")}) bate com o do acabamento a menos de 10%,
        medindo setores diferentes com registros de qualidade diferente.
      </p>
    </div>
  );
}
