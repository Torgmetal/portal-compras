"use client";
import { useComponenteEstavel } from "@/lib/react-estavel";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  TESTES_POEIRA, CLASSES_POEIRA, CAMPOS_CABECALHO_POEIRA, GRUPOS_CABECALHO_POEIRA,
  camposCabecalhoPoeira, testesPoeira, mediaQuantidade, classificacaoParticulas, pendenciasPoeira, maiorTamanhoAcima,
} from "@/lib/poeira-campos";

/**
 * O PREENCHIMENTO DO TESTE DE POEIRA (ISO 8502-3), no computador.
 *
 * Todo campo que o modelo imprime: identificação, informações (peça, etapa, fita, ampliação), os testes
 * A a E com local e as duas classes, a média (calculada como a planilha), a classificação das partículas
 * (sugerida pela maior classe encontrada — o inspetor pode registrar outra). O laudo é o "Resultado da
 * inspeção" do relatório, porque o modelo não traz requisito de aceitação.
 */
export default function FormPoeira({ rel, res, travado, setResultado }) {
  const efetivo = camposCabecalhoPoeira({ ...rel, resultados: res });
  const testes = testesPoeira(res);
  const media = mediaQuantidade(res);
  const sugerida = classificacaoParticulas({ ...res, classificacao: "" });
  const faltam = pendenciasPoeira({ ...rel, resultados: res });
  const maior = maiorTamanhoAcima(res);

  const setTeste = (i, k, v) => {
    const atual = Array.isArray(res.testes) ? [...res.testes] : [];
    while (atual.length < TESTES_POEIRA.length) atual.push({});
    atual[i] = { ...(atual[i] || {}), [k]: v };
    setResultado("testes", atual);
  };

  const Campo = useComponenteEstavel(({ c }) => (
    <div>
    <label className="block">
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{c.rotulo}{c.obrigatorio ? " *" : ""}</span>
      <input type={c.data ? "date" : "text"} list={c.sugestoes ? `poeira-pc-${c.k}` : undefined}
        value={res[c.k] ?? ""} placeholder={res[c.k] ? "" : efetivo[c.k] || ""} disabled={travado}
        maxLength={c.data ? undefined : c.max || 120}
        onChange={(e) => setResultado(c.k, e.target.value)}
        className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50 placeholder:text-gray-400" />
    </label>
    {c.data && !res[c.k] && <span className="block text-[10px] text-torg-gray mt-0.5">vazio: sai a data de emissão do relatório</span>}
    {c.sugestoes && <datalist id={`poeira-pc-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  ));

  // ⚠ função que DESENHA, não componente: um componente declarado aqui dentro nasceria de novo a cada
  // tecla e o campo perderia o foco (o defeito que já houve nos formulários de inspeção)
  const selClasse = (valor, onChange, titulo) => (
    <select value={valor ?? ""} disabled={travado} onChange={(e) => onChange(e.target.value)} title={titulo}
      className="w-full text-[12px] border border-gray-200 rounded px-1 py-1 disabled:bg-gray-50">
      <option value="">—</option>
      {CLASSES_POEIRA.map((c) => <option key={c.classe} value={String(c.classe)}>{c.classe}</option>)}
    </select>
  );

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        {GRUPOS_CABECALHO_POEIRA.map((g, gi) => (
          <div key={g.id} className={gi ? "mt-3" : ""}>
            <p className="text-[12px] font-bold text-torg-dark mb-2">{g.titulo}</p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {CAMPOS_CABECALHO_POEIRA.filter((c) => c.grupo === g.id).map((c) => <Campo key={c.k} c={c} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm overflow-x-auto">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Ensaio — testes A a E</p>
        <table className="w-full min-w-[620px] text-[12px]">
          <thead>
            <tr className="text-[10px] text-torg-gray">
              <th className="text-left font-semibold pb-1.5 w-16">Teste</th>
              <th className="text-left font-semibold pb-1.5 pr-2">Local <span className="font-normal">(opcional)</span></th>
              <th className="font-semibold pb-1.5 px-1 w-28">Quantidade (classe 0–5)</th>
              <th className="font-semibold pb-1.5 px-1 w-28">Tamanho (classe 0–5)</th>
              <th className="text-left font-semibold pb-1.5 pl-2">Observação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {testes.map((t, i) => (
              <tr key={t.letra}>
                <td className="py-1.5 font-semibold text-torg-dark">Teste {t.letra}</td>
                <td className="py-1.5 pr-2">
                  <input type="text" value={t.local ?? ""} disabled={travado} maxLength={120} onChange={(e) => setTeste(i, "local", e.target.value)} placeholder="ex.: alma, mesa superior"
                    className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50 placeholder:text-gray-300" />
                </td>
                <td className="py-1.5 px-1">{selClasse(t.quantidade, (v) => setTeste(i, "quantidade", v), "Quantidade de poeira (ISO 8502-3)")}</td>
                <td className="py-1.5 px-1">{selClasse(t.tamanho, (v) => setTeste(i, "tamanho", v), "Tamanho das partículas (ISO 8502-3)")}</td>
                <td className="py-1.5 pl-2">
                  <input type="text" value={t.obs ?? ""} disabled={travado} maxLength={200} onChange={(e) => setTeste(i, "obs", e.target.value)}
                    className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 grid sm:grid-cols-3 gap-3 text-[12px]">
          <div className="text-torg-gray">Avaliação da quantidade (média):{" "}
            <strong className="text-torg-dark">{media == null ? "—" : `classe ${media}`}</strong>
          </div>
          <label className="block">
            <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Classificação das partículas</span>
            <select value={res.classificacao ?? ""} disabled={travado} onChange={(e) => setResultado("classificacao", e.target.value)}
              className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 disabled:bg-gray-50">
              <option value="">{sugerida == null ? "—" : `classe ${sugerida} (maior encontrada)`}</option>
              {CLASSES_POEIRA.map((c) => <option key={c.classe} value={String(c.classe)}>classe {c.classe}</option>)}
            </select>
            {maior != null && (
              <span className="block text-[10px] text-amber-800 mt-0.5">abaixo da maior encontrada nos testes (classe {maior}) — o PDF mostra as duas</span>
            )}
          </label>
          <div className="text-[11px] text-torg-gray">
            <span className="block text-[10px] font-semibold mb-0.5">Laudo *</span>
            {/* ⚠ o laudo é o "Resultado da inspeção" do relatório, logo abaixo — um lugar só para dizer isso */}
            {rel.resultadoInspecao === "APROVADO" || rel.resultadoInspecao === "REPROVADO"
              ? <strong className={rel.resultadoInspecao === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{rel.resultadoInspecao}</strong>
              : <span>marque aprovado ou reprovado em <b>Resultado da inspeção</b>, abaixo</span>}
          </div>
        </div>
      </div>

      <details className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm text-[11px]">
        <summary className="cursor-pointer font-semibold text-torg-dark">Classificação — ISO 8502-3 (referência)</summary>
        <table className="w-full mt-2">
          <thead><tr className="text-torg-gray"><th className="text-left w-14">Classe</th><th className="text-left">Quantidade de poeira</th><th className="text-left">Tamanho das partículas</th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {CLASSES_POEIRA.map((c) => <tr key={c.classe}><td className="py-1 font-semibold">{c.classe}</td><td className="py-1">{c.quantidade}</td><td className="py-1">{c.tamanho}</td></tr>)}
          </tbody>
        </table>
      </details>

      {faltam.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={12} /> Para enviar para assinatura falta:</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">{faltam.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <p className="text-[11px] text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={12} /> Tudo o que o modelo pede está preenchido.</p>
      )}
    </div>
  );
}
