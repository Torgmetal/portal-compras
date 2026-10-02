"use client";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import {
  N_AMOSTRAS, CAMPOS_CABECALHO_SAIS, GRUPOS_CABECALHO_SAIS, amostrasCalculadas, camposCabecalhoSais,
  laudoSais, mediaDensidade, pendenciasSais, numeroCurtoBR, arredondar, divergenciasDensidade,
} from "@/lib/sais-campos";

/**
 * O RELATÓRIO DE SAIS (ISO 8502-6/9) NO CELULAR — o mesmo que o computador pede, das mesmas listas.
 *
 * Vitor (02/10/2026): "preciso incluir na aba inspeções e na aba inspeção de campo os relatórios de
 * salinidade e poeira (…) garanta que todos os campos de informações tenham como preencher". Cada
 * campo do modelo tem caixa aqui; vazio, mostra apagado o que vai sair no PDF. A hora da amostra nasce
 * sozinha quando a condutividade dela é lançada, e Δ, densidade, média e laudo saem da conta.
 */
const n1 = (v) => (v == null ? "—" : numeroCurtoBR(arredondar(v, 1), 1));

export default function FormularioSaisCampo({ rel, cond, setCond, resultado = null }) {
  const res = { ...(rel?.resultados || {}), ...cond };
  const efetivo = camposCabecalhoSais({ ...rel, resultados: res });
  const amostras = amostrasCalculadas(res);
  const media = mediaDensidade(res);
  const laudo = laudoSais(res);
  // ⚠ o resultado da TELA, mesmo vazio: com `?? rel.resultadoInspecao`, desmarcar o resultado fazia o resumo
  // voltar ao valor gravado e dizer que estava tudo certo (Medir já carrega o gravado no estado)
  const faltam = pendenciasSais({ ...rel, resultados: res, resultadoInspecao: resultado });
  const avisos = divergenciasDensidade(res);
  const mudar = (k) => (v) => setCond((c) => ({ ...c, [k]: v }));

  const setAmostra = (i, k, v) => setCond((c) => {
    const atual = Array.isArray(c.amostras) ? [...c.amostras] : [];
    while (atual.length < N_AMOSTRAS) atual.push({});
    atual[i] = { ...(atual[i] || {}), [k]: v };
    if (k === "condAmostra" && String(v).trim() && !String(atual[i].hora || "").trim()) {
      atual[i].hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return { ...c, amostras: atual };
  });

  const caixa = "w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 outline-none focus:border-torg-blue placeholder:text-gray-400";

  return (
    <div className="mt-3 space-y-3">
      <div className={`rounded-xl border px-3 py-2.5 ${faltam.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
        <p className={`text-[13px] font-bold flex items-center gap-1.5 ${faltam.length ? "text-amber-900" : "text-emerald-800"}`}>
          {faltam.length ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {faltam.length ? `Falta preencher: ${faltam.length}` : "Tudo o que o modelo pede está preenchido"}
        </p>
        {faltam.length > 0 && <ul className="text-[11px] text-amber-800 mt-1 list-disc pl-4 space-y-0.5">{faltam.map((f) => <li key={f}>{f}</li>)}</ul>}
      </div>

      {GRUPOS_CABECALHO_SAIS.map((g, gi) => (
        <section key={g.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <h3 className="text-[14px] font-bold text-torg-dark mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-torg-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{gi + 1}</span>
            {g.titulo}
          </h3>
          <div className="space-y-3">
            {CAMPOS_CABECALHO_SAIS.filter((c) => c.grupo === g.id).map((c) => (
              <div key={c.k}>
              <label className="block">
                <span className="block text-[12px] font-semibold text-torg-dark mb-1">{c.rotulo}{c.obrigatorio && <span className="text-red-600"> *</span>}</span>
                <input type={c.data ? "date" : "text"} inputMode={c.numero ? "decimal" : undefined} list={c.sugestoes ? `sais-campo-${c.k}` : undefined}
                  value={cond[c.k] ?? ""} placeholder={cond[c.k] ? "" : efetivo[c.k] || ""} maxLength={c.data ? undefined : c.max || 120}
                  onChange={(e) => mudar(c.k)(e.target.value)} className={caixa} />
              </label>
              {c.data && !cond[c.k] && <span className="block text-[11px] text-torg-gray mt-1">vazio: sai a data de emissão do relatório</span>}
              {c.sugestoes && <datalist id={`sais-campo-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
        <h3 className="text-[14px] font-bold text-torg-dark mb-1">Ensaio — cinco amostras</h3>
        <p className="text-[11px] text-torg-gray mb-3">A hora entra sozinha ao lançar a condutividade da amostra. Densidade vazia = calculada pela ISO 8502-9.</p>
        <div className="space-y-3">
          {amostras.map((a, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-3">
              <p className="text-[13px] font-bold text-torg-dark mb-2">Amostra {i + 1}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Água deionizada (µS/cm)</span>
                  <input type="text" inputMode="decimal" value={a.condAgua ?? ""} onChange={(e) => setAmostra(i, "condAgua", e.target.value)} className={caixa} /></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Amostra (µS/cm)</span>
                  <input type="text" inputMode="decimal" value={a.condAmostra ?? ""} onChange={(e) => setAmostra(i, "condAmostra", e.target.value)} className={caixa} /></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Hora do ensaio</span>
                  <input type="time" value={a.hora ?? ""} onChange={(e) => setAmostra(i, "hora", e.target.value)} className={caixa} /></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Densidade (mg/m²)</span>
                  <input type="text" inputMode="decimal" value={(Array.isArray(cond.amostras) ? cond.amostras[i]?.densidade : "") ?? ""}
                    placeholder={a.densidadeCalculada ? n1(a.densidade) : ""} onChange={(e) => setAmostra(i, "densidade", e.target.value)} className={caixa} /></label>
              </div>
              <p className="text-[12px] text-torg-gray mt-2">Δ condutividade: <strong className="text-torg-dark">{n1(a.delta)}</strong> µS/cm</p>
            </div>
          ))}
        </div>
        {avisos.length > 0 && (
          <div className="mt-3 rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 text-[12px] text-sky-900">
            <p className="font-semibold flex items-center gap-1.5"><Info size={14} /> Confira (não impede o envio):</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}
        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-[13px] space-y-1">
          <p>Média: <strong>{media == null ? "—" : `${n1(media)} mg/m²`}</strong> · requisito: <strong>{res.requisito ? `${res.requisito} mg/m²` : "—"}</strong></p>
          <p>Laudo: {laudo
            ? <strong className={laudo === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{laudo}</strong>
            : <span className="text-torg-gray">sai sozinho com o requisito e uma amostra</span>}</p>
        </div>
      </section>
    </div>
  );
}
