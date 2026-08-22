"use client";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  TIPOS_PENETRANTE, METODOS, MARCAS, REMOVEDORES, CONDICOES_SUPERFICIE, TIPOS_INDICACAO,
  CRITERIOS, CRITERIO_PADRAO, PROCEDIMENTO_PADRAO, conferirEnsaio, tipoSugerido,
  PENETRACAO_MIN, PENETRACAO_MAX, SECAGEM_MIN, REVELADOR_MAX,
  LUX_MINIMO_COLORIDA, LUX_MAXIMO_FLUORESCENTE, UV_MINIMO,
} from "@/lib/lp-campos";
import { LAUDOS } from "@/lib/evs-campos";

/**
 * O PREENCHIMENTO DO ENSAIO POR LÍQUIDO PENETRANTE.
 *
 * Modelo: FORM. SGQ - 012 (aba do "Modelos de relatórios de qualidade torg"), conferido contra o
 * LP_269_26_T70 emitido na OP-070. Procedimento: PO-15 R1.
 *
 * ⚠ O QUE ESTE ENSAIO TEM DE PRÓPRIO É O TEMPO. Penetração, secagem e revelação têm mínimo e
 * máximo, e furar qualquer um invalida o ensaio SEM DEIXAR MARCA no resultado: o líquido não teve
 * tempo de entrar, ou entrou e secou antes de revelar. É diferente de uma medida errada, que
 * alguém percebe olhando. Por isso cada tempo mostra a faixa do PO-15 ao lado e a verificação
 * aparece inteira, com o item citado.
 */
export default function FormLP({ rel, linhas, res, travado, setLinhas, setResultado }) {
  const fluor = res.tipoPenetrante === "I";
  const check = conferirEnsaio({
    tipo: res.tipoPenetrante, lux: res.iluminacao, uv: res.uv, tempSuperficie: res.temperatura,
    penetracao: res.tempoPenetracao, secagem: res.tempoSecagem, revelador: res.tempoRevelador,
  });

  const set = (i, k, v) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const Campo = ({ rot, k, tipo = "text", opcoes = null, dica = null, larg = "" }) => (
    <label className={`block ${larg}`}>
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{rot}</span>
      {opcoes ? (
        <select value={res[k] || ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue disabled:bg-gray-50">
          <option value="">—</option>
          {opcoes.map((o) => <option key={o.id || o} value={o.id || o}>{o.nome || o}</option>)}
        </select>
      ) : (
        <input type={tipo} value={res[k] ?? ""} disabled={travado} onChange={(e) => setResultado(k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50" />
      )}
      {dica && <span className="block text-[10px] text-torg-gray mt-0.5">{dica}</span>}
    </label>
  );

  return (
    <div className="space-y-3">
      {/* ── identificação ── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Identificação</p>
        <div className="grid sm:grid-cols-4 gap-2.5">
          <Campo rot="Documento de inspeção" k="documentoInspecao" />
          <Campo rot="Data de inspeção" k="dataInspecao" tipo="date" />
          <Campo rot="Componente inspecionado" k="componente" />
          <Campo rot="Revisão do desenho" k="revisaoDesenho" />
          <Campo rot="Metal base / espessura" k="metalBase" />
          <Campo rot="Metal de adição" k="metalAdicao" />
          <Campo rot="Processo de soldagem" k="processoSolda" />
          <Campo rot="Condições superficiais" k="condicoes" opcoes={CONDICOES_SUPERFICIE} />
        </div>
      </div>

      {/* ── parâmetros do ensaio ── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Parâmetros do ensaio</p>
        <div className="grid sm:grid-cols-4 gap-2.5">
          <Campo rot="Tipo de penetrante" k="tipoPenetrante" opcoes={TIPOS_PENETRANTE} />
          <Campo rot="Método (remoção)" k="metodo" opcoes={METODOS} />
          <Campo rot="Penetrante — marca" k="penetranteMarca" opcoes={MARCAS} />
          <Campo rot="Penetrante — lote" k="penetranteLote" />

          <Campo rot="Tempo de penetração (min)" k="tempoPenetracao" tipo="number"
            dica={`PO-15: ${PENETRACAO_MIN} a ${PENETRACAO_MAX} min`} />
          <Campo rot="Removedor" k="removedor" opcoes={REMOVEDORES} />
          <Campo rot="Removedor — lote" k="removedorLote" />
          <Campo rot="Tempo de secagem (min)" k="tempoSecagem" tipo="number"
            dica={`PO-15: mínimo ${SECAGEM_MIN} min`} />

          <Campo rot="Revelador" k="revelador" opcoes={MARCAS} />
          <Campo rot="Revelador — lote" k="reveladorLote" />
          <Campo rot="Tempo de interpretação (min)" k="tempoRevelador" tipo="number"
            dica={`PO-15: revelador em até ${REVELADOR_MAX} min`} />
          <Campo rot="Temperatura da superfície (°C)" k="temperatura" tipo="number"
            dica={fluor ? "Tipo I: 10 a 38 °C" : "Tipo II: 10 a 52 °C"} />

          {/* ⚠ a exigência de luz MUDA com a técnica, e inverte: a colorida quer luz, a
              fluorescente quer escuro. Trocar as duas invalida o ensaio. */}
          <Campo rot="Iluminação (lux)" k="iluminacao" tipo="number"
            dica={fluor ? `Fluorescente: no máximo ${LUX_MAXIMO_FLUORESCENTE} lux` : `Colorida: mínimo ${LUX_MINIMO_COLORIDA} lux`} />
          {fluor && <Campo rot="Luz negra (µW/cm²)" k="uv" tipo="number" dica={`Mínimo ${UV_MINIMO}`} />}
          <Campo rot="Procedimento / rev." k="procedimento" dica={PROCEDIMENTO_PADRAO} />
          <Campo rot="Norma / critério de aceitação" k="criterio" opcoes={CRITERIOS} dica={CRITERIO_PADRAO} />
        </div>

        {check.avaliado && (
          <div className={`mt-2.5 rounded-lg px-3 py-2 border ${check.conforme ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            <p className={`text-[12px] font-bold inline-flex items-center gap-1.5 ${check.conforme ? "text-emerald-800" : "text-red-700"}`}>
              {check.conforme ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {check.conforme ? "Ensaio dentro do procedimento" : "Ensaio fora do procedimento"}
            </p>
            {!check.conforme && (
              <ul className="text-[11px] text-red-700 mt-1 space-y-0.5">
                {check.problemas.map((p, i) => <li key={i}>· {p}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── registros dos resultados ── */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-bold text-torg-dark">Registros dos resultados</p>
          {!travado && (
            <button onClick={() => setLinhas([...linhas, { marca: "", indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "", laudo: "" }])}
              className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 inline-flex items-center gap-1">
              <Plus size={11} /> Junta / peça
            </button>
          )}
        </div>

        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-torg-gray text-left border-b border-gray-100">
              <th className="pb-1 font-semibold">Junta / peça</th>
              <th className="pb-1 font-semibold">Nº indicação</th>
              <th className="pb-1 font-semibold">Local</th>
              <th className="pb-1 font-semibold">Tamanho</th>
              <th className="pb-1 font-semibold">Tipo</th>
              <th className="pb-1 font-semibold">Laudo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const sug = tipoSugerido(l.tamanho);
              return (
                <tr key={i} className="border-t border-gray-50">
                  {["marca", "indicacaoLp", "local", "tamanho"].map((k) => (
                    <td key={k} className="py-1 pr-1">
                      <input value={l[k] ?? ""} disabled={travado} onChange={(e) => set(i, k, e.target.value)}
                        className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50" />
                    </td>
                  ))}
                  <td className="py-1 pr-1">
                    <select value={l.tipoDefeito || ""} disabled={travado} onChange={(e) => set(i, "tipoDefeito", e.target.value)}
                      className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50"
                      title={TIPOS_INDICACAO.map((t) => `${t.id}: ${t.desc}`).join("\n")}>
                      <option value="">—</option>
                      {TIPOS_INDICACAO.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
                    </select>
                    {/* ⚠ o portal SUGERE, não decide: abaixo de 1,5 mm o item 14.1.1 diz que a
                        indicação não é relevante, mas quem julga é quem viu a peça. */}
                    {sug && l.tipoDefeito !== sug && (
                      <span className="block text-[9px] text-amber-700">PO-15: {sug}?</span>
                    )}
                  </td>
                  <td className="py-1 pr-1">
                    <select value={l.laudo || ""} disabled={travado} onChange={(e) => set(i, "laudo", e.target.value)}
                      className={`w-full text-[11px] border rounded px-1 py-0.5 disabled:bg-gray-50 ${
                        l.laudo === "R" ? "border-red-300 bg-red-50 text-red-700 font-bold" : "border-gray-200"}`}>
                      <option value="">—</option>
                      {LAUDOS.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
                    </select>
                  </td>
                  <td className="py-1 w-6">
                    {!travado && (
                      <button onClick={() => setLinhas(linhas.filter((_, j) => j !== i))} className="text-torg-gray hover:text-red-600">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!linhas.length && (
          <div className="mt-1">
            <p className="text-[11px] text-torg-gray">
              Nenhuma junta lançada. Peça sem indicação também entra — com laudo A e traço nas demais colunas, como no modelo.
            </p>
            {/* ⚠ RELATÓRIO ABERTO ANTES DESTA MUDANÇA nasceu sem linhas. As peças já foram
                escolhidas na abertura; redigitá-las seria pedir de novo o que o portal sabe. */}
            {!travado && (rel.marcas || []).length > 0 && (
              <button
                onClick={() => setLinhas((rel.marcas || []).map((m) => ({
                  marca: m,
                  descricao: res.tiposPeca?.[String(m).toUpperCase()] || null,
                  indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "", laudo: "",
                })))}
                className="mt-1.5 text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50">
                Trazer as {(rel.marcas || []).length} peça(s) selecionada(s) na abertura
              </button>
            )}
          </div>
        )}
        <p className="text-[10px] text-torg-gray mt-2">
          IL — indicação linear · IA — arredondada · INR — não relevante (menor que 1,5 mm) · A aprovado · R reprovado · REC exame complementar
        </p>
      </div>
    </div>
  );
}
