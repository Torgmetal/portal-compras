"use client";
import { useComponenteEstavel } from "@/lib/react-estavel";
import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import {
  N_AMOSTRAS, CAMPOS_CABECALHO_SAIS, GRUPOS_CABECALHO_SAIS, amostrasCalculadas, camposCabecalhoSais,
  laudoSais, mediaDensidade, pendenciasSais, numeroCurtoBR, arredondar, divergenciasDensidade,
} from "@/lib/sais-campos";

/**
 * O PREENCHIMENTO DO RELATÓRIO DE SAIS (ISO 8502-6/9), no computador.
 *
 * Vitor (02/10/2026): "garanta que todos os campos de informações tenham como preencher com alguma
 * informação, até mesmo ver informações que já possam vir pré-preenchidas". Todo campo que o modelo
 * imprime está aqui; vazio, a caixa mostra apagado o que vai sair no documento (o Bresle de 3 ml e
 * 12,5 cm², a peça do relatório). Δ, densidade, média e laudo saem da conta — a mesma do PDF.
 */
export default function FormSais({ rel, res, travado, setResultado }) {
  const efetivo = camposCabecalhoSais({ ...rel, resultados: res });
  const amostras = amostrasCalculadas(res);
  const media = mediaDensidade(res);
  const laudo = laudoSais(res);
  const faltam = pendenciasSais({ ...rel, resultados: res });
  const avisos = divergenciasDensidade(res);

  const setAmostra = (i, k, v) => {
    const atual = Array.isArray(res.amostras) ? [...res.amostras] : [];
    while (atual.length < N_AMOSTRAS) atual.push({});
    atual[i] = { ...(atual[i] || {}), [k]: v };
    // ⚠ AQUI a hora NÃO nasce sozinha, ao contrário do celular: no computador o inspetor passa a limpo
    // depois do ensaio, e a hora do relógio seria a da digitação — registro errado com cara de certo
    setResultado("amostras", atual);
  };

  const Campo = useComponenteEstavel(({ c }) => (
    <div>
    <label className="block">
      <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{c.rotulo}{c.obrigatorio ? " *" : ""}</span>
      <input type={c.data ? "date" : "text"} inputMode={c.numero ? "decimal" : undefined} list={c.sugestoes ? `sais-pc-${c.k}` : undefined}
        value={res[c.k] ?? ""} placeholder={res[c.k] ? "" : efetivo[c.k] || ""} disabled={travado}
        maxLength={c.data ? undefined : c.max || 120}
        onChange={(e) => setResultado(c.k, e.target.value)}
        className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50 placeholder:text-gray-400" />
    </label>
    {c.data && !res[c.k] && <span className="block text-[10px] text-torg-gray mt-0.5">vazio: sai a data de emissão do relatório</span>}
    {c.sugestoes && <datalist id={`sais-pc-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  ));

  const celula = "w-full text-[12px] text-center border border-gray-200 rounded px-1 py-1 disabled:bg-gray-50";
  const n1 = (v) => (v == null ? "—" : numeroCurtoBR(arredondar(v, 1), 1));

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        {GRUPOS_CABECALHO_SAIS.map((g, gi) => (
          <div key={g.id} className={gi ? "mt-3" : ""}>
            <p className="text-[12px] font-bold text-torg-dark mb-2">{g.titulo}</p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {CAMPOS_CABECALHO_SAIS.filter((c) => c.grupo === g.id).map((c) => <Campo key={c.k} c={c} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm overflow-x-auto">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Ensaio — cinco amostras</p>
        <table className="w-full min-w-[620px] text-[12px]">
          <thead>
            <tr className="text-[10px] text-torg-gray">
              <th className="text-left font-semibold pb-1.5 pr-2">Descrição</th>
              {Array.from({ length: N_AMOSTRAS }, (_, i) => <th key={i} className="font-semibold pb-1.5 px-1">Amostra {i + 1}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[["condAgua", "Condutividade da água deionizada (µS/cm)"], ["condAmostra", "Condutividade da amostra (µS/cm)"]].map(([k, rot]) => (
              <tr key={k}>
                <td className="py-1.5 pr-2 text-torg-dark">{rot}</td>
                {amostras.map((a, i) => (
                  <td key={i} className="py-1.5 px-1">
                    <input type="text" inputMode="decimal" value={a[k] ?? ""} disabled={travado} onChange={(e) => setAmostra(i, k, e.target.value)} className={celula} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-gray-50/60">
              <td className="py-1.5 pr-2 text-torg-gray">Δ Condutividade (µS/cm) <span className="text-[10px]">· calculado</span></td>
              {amostras.map((a, i) => <td key={i} className="py-1.5 px-1 text-center font-semibold text-torg-dark tabular-nums">{n1(a.delta)}</td>)}
            </tr>
            <tr>
              <td className="py-1.5 pr-2 text-torg-dark">Densidade de sais (mg/m²)
                <span className="block text-[10px] text-torg-gray">vazio = calculada pela ISO 8502-9 (5·V·Δ/A); digite se o aparelho der o valor</span>
              </td>
              {amostras.map((a, i) => (
                <td key={i} className="py-1.5 px-1">
                  <input type="text" inputMode="decimal" value={(Array.isArray(res.amostras) ? res.amostras[i]?.densidade : "") ?? ""}
                    placeholder={a.densidadeCalculada ? n1(a.densidade) : ""} disabled={travado}
                    onChange={(e) => setAmostra(i, "densidade", e.target.value)} className={`${celula} placeholder:text-gray-400`} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-1.5 pr-2 text-torg-dark inline-flex items-center gap-1"><Clock size={11} className="text-torg-gray" /> Hora do ensaio</td>
              {amostras.map((a, i) => (
                <td key={i} className="py-1.5 px-1">
                  <input type="time" value={a.hora ?? ""} disabled={travado} onChange={(e) => setAmostra(i, "hora", e.target.value)} className={celula} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
          <span className="text-torg-gray">Média: <strong className="text-torg-dark tabular-nums">{media == null ? "—" : `${n1(media)} mg/m²`}</strong></span>
          <span className="text-torg-gray">Requisito: <strong className="text-torg-dark">{res.requisito ? `${res.requisito} mg/m²` : "—"}</strong></span>
          <span className="text-torg-gray">Laudo:{" "}
            {laudo
              ? <strong className={laudo === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{laudo}</strong>
              : <span className="text-torg-gray">sai sozinho com o requisito e uma amostra</span>}
          </span>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-[11px] text-sky-900">
          <p className="font-semibold flex items-center gap-1.5"><Info size={12} /> Confira (não impede o envio):</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

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
