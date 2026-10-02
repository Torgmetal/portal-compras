"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  TESTES_POEIRA, CLASSES_POEIRA, CAMPOS_CABECALHO_POEIRA, GRUPOS_CABECALHO_POEIRA,
  camposCabecalhoPoeira, testesPoeira, mediaQuantidade, classificacaoParticulas, pendenciasPoeira, maiorTamanhoAcima,
} from "@/lib/poeira-campos";

/**
 * O TESTE DE POEIRA (ISO 8502-3) NO CELULAR — o mesmo que o computador pede, das mesmas listas.
 *
 * Cinco testes (A a E), cada um com local e as duas classes da norma (quantidade e tamanho, de 0 a 5).
 * A média sai da conta da planilha; a classificação das partículas vem sugerida pela maior classe
 * encontrada. O laudo é o "Resultado da inspeção" do relatório, mais abaixo — um lugar só para dizer.
 */
export default function FormularioPoeiraCampo({ rel, cond, setCond, resultado = null }) {
  const res = { ...(rel?.resultados || {}), ...cond };
  const efetivo = camposCabecalhoPoeira({ ...rel, resultados: res });
  const testes = testesPoeira(res);
  const media = mediaQuantidade(res);
  const sugerida = classificacaoParticulas({ ...res, classificacao: "" });
  // ⚠ o resultado da TELA, mesmo vazio (ver FormularioSaisCampo): desmarcar não pode voltar ao gravado
  const faltam = pendenciasPoeira({ ...rel, resultados: res, resultadoInspecao: resultado });
  const maior = maiorTamanhoAcima(res);
  const mudar = (k) => (v) => setCond((c) => ({ ...c, [k]: v }));

  const setTeste = (i, k, v) => setCond((c) => {
    const atual = Array.isArray(c.testes) ? [...c.testes] : [];
    while (atual.length < TESTES_POEIRA.length) atual.push({});
    atual[i] = { ...(atual[i] || {}), [k]: v };
    return { ...c, testes: atual };
  });

  const caixa = "w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 outline-none focus:border-torg-blue placeholder:text-gray-400";
  const opcoesClasse = CLASSES_POEIRA.map((c) => <option key={c.classe} value={String(c.classe)}>{c.classe}</option>);

  return (
    <div className="mt-3 space-y-3">
      <div className={`rounded-xl border px-3 py-2.5 ${faltam.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
        <p className={`text-[13px] font-bold flex items-center gap-1.5 ${faltam.length ? "text-amber-900" : "text-emerald-800"}`}>
          {faltam.length ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {faltam.length ? `Falta preencher: ${faltam.length}` : "Tudo o que o modelo pede está preenchido"}
        </p>
        {faltam.length > 0 && <ul className="text-[11px] text-amber-800 mt-1 list-disc pl-4 space-y-0.5">{faltam.map((f) => <li key={f}>{f}</li>)}</ul>}
      </div>

      {GRUPOS_CABECALHO_POEIRA.map((g, gi) => (
        <section key={g.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <h3 className="text-[14px] font-bold text-torg-dark mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-torg-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{gi + 1}</span>
            {g.titulo}
          </h3>
          <div className="space-y-3">
            {CAMPOS_CABECALHO_POEIRA.filter((c) => c.grupo === g.id).map((c) => (
              <div key={c.k}>
              <label className="block">
                <span className="block text-[12px] font-semibold text-torg-dark mb-1">{c.rotulo}{c.obrigatorio && <span className="text-red-600"> *</span>}</span>
                <input type={c.data ? "date" : "text"} list={c.sugestoes ? `poeira-campo-${c.k}` : undefined}
                  value={cond[c.k] ?? ""} placeholder={cond[c.k] ? "" : efetivo[c.k] || ""} maxLength={c.data ? undefined : c.max || 120}
                  onChange={(e) => mudar(c.k)(e.target.value)} className={caixa} />
              </label>
              {c.data && !cond[c.k] && <span className="block text-[11px] text-torg-gray mt-1">vazio: sai a data de emissão do relatório</span>}
              {c.sugestoes && <datalist id={`poeira-campo-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
        <h3 className="text-[14px] font-bold text-torg-dark mb-1">Ensaio — testes A a E</h3>
        <p className="text-[11px] text-torg-gray mb-3">Classes da ISO 8502-3: 0 (nada visível) a 5 (muita poeira / partículas acima de 2,5 mm).</p>
        <div className="space-y-3">
          {testes.map((t, i) => (
            <div key={t.letra} className="rounded-xl border border-gray-200 p-3">
              <p className="text-[13px] font-bold text-torg-dark mb-2">Teste {t.letra}</p>
              <label className="block mb-2"><span className="block text-[11px] text-torg-gray mb-1">Local (opcional)</span>
                <input type="text" value={t.local ?? ""} maxLength={120} placeholder="ex.: alma, mesa superior" onChange={(e) => setTeste(i, "local", e.target.value)} className={caixa} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Quantidade (0–5)</span>
                  <select value={t.quantidade ?? ""} onChange={(e) => setTeste(i, "quantidade", e.target.value)} className={caixa}><option value="">—</option>{opcoesClasse}</select></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Tamanho (0–5)</span>
                  <select value={t.tamanho ?? ""} onChange={(e) => setTeste(i, "tamanho", e.target.value)} className={caixa}><option value="">—</option>{opcoesClasse}</select></label>
              </div>
              <label className="block mt-2"><span className="block text-[11px] text-torg-gray mb-1">Observação</span>
                <input type="text" value={t.obs ?? ""} maxLength={200} onChange={(e) => setTeste(i, "obs", e.target.value)} className={caixa} /></label>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-[13px] space-y-2">
          <p>Avaliação da quantidade (média): <strong>{media == null ? "—" : `classe ${media}`}</strong></p>
          <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Classificação das partículas</span>
            <select value={cond.classificacao ?? ""} onChange={(e) => mudar("classificacao")(e.target.value)} className={caixa}>
              <option value="">{sugerida == null ? "—" : `classe ${sugerida} (maior encontrada)`}</option>
              {CLASSES_POEIRA.map((c) => <option key={c.classe} value={String(c.classe)}>classe {c.classe}</option>)}
            </select>
            {maior != null && <span className="block text-[12px] text-amber-800 mt-1">Abaixo da maior encontrada nos testes (classe {maior}) — o PDF mostra as duas.</span>}
          </label>
          <p className="text-[12px] text-torg-gray">Laudo: marque aprovado ou reprovado em <b>Resultado da inspeção</b>, mais abaixo.</p>
        </div>
      </section>
    </div>
  );
}
