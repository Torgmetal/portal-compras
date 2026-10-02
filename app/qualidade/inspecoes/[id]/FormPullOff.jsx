"use client";
import { useComponenteEstavel } from "@/lib/react-estavel";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  N_DOLLIES, N_DEMAOS_PULLOFF, FALHAS, LEGENDA_ROMPIMENTO, CAMPOS_CABECALHO_PULLOFF, GRUPOS_CABECALHO_PULLOFF,
  avisosPullOff, camposCabecalhoPullOff, dolliesPullOff, esquemaPullOff, espessuraTotal, mediaAdesao, mediaEhMinima, pendenciasPullOff,
} from "@/lib/pulloff-campos";

/**
 * O PREENCHIMENTO DO ENSAIO DE ADERÊNCIA (PULL-OFF, ASTM D4541), no computador.
 *
 * Vitor (02/10/2026): "pode criar também, vamos deixar tudo funcionando". Todo campo que o modelo imprime:
 * informações, condições da fixação, o esquema de pintura (três demãos e o total), os cinco dollies
 * (adesão, análise do rompimento, falha) e a média — calculados como a planilha. O laudo é o "Resultado
 * da inspeção" do relatório, porque o modelo não traz requisito de aceitação.
 */
export default function FormPullOff({ rel, res, travado, setResultado }) {
  const efetivo = camposCabecalhoPullOff({ ...rel, resultados: res });
  const esquema = esquemaPullOff(res);
  const dollies = dolliesPullOff(res);
  const total = espessuraTotal(res);
  const media = mediaAdesao(res);
  const faltam = pendenciasPullOff({ ...rel, resultados: res });
  const avisos = avisosPullOff({ ...rel, resultados: res });

  const setEsquema = (i, v) => {
    const atual = Array.from({ length: N_DEMAOS_PULLOFF }, (_, k) => esquema[k] || "");
    atual[i] = v;
    setResultado("esquema", atual);
  };
  const setDolly = (i, k, v) => {
    const atual = Array.isArray(res.dollies) ? [...res.dollies] : [];
    while (atual.length < N_DOLLIES) atual.push({});
    atual[i] = { ...(atual[i] || {}), [k]: v };
    setResultado("dollies", atual);
  };

  const Campo = useComponenteEstavel(({ c }) => (
    <div>
      <label className="block">
        <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{c.rotulo}{c.obrigatorio ? " *" : ""}</span>
        <input type={c.data ? "date" : "text"} inputMode={c.numero ? "decimal" : undefined} list={c.sugestoes ? `po-pc-${c.k}` : undefined}
          value={res[c.k] ?? ""} placeholder={res[c.k] ? "" : efetivo[c.k] || ""} disabled={travado}
          maxLength={c.data ? undefined : c.max || 120}
          onChange={(e) => setResultado(c.k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50 placeholder:text-gray-400" />
      </label>
      {c.k === "rncNumero" && !res[c.k] && <span className="block text-[10px] text-torg-gray mt-0.5">vazio: com o laudo Reprovado, sai o nº da RNC aberta pela reprovação, se houver</span>}
      {c.sugestoes && <datalist id={`po-pc-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  ));

  const celula = "w-full text-[12px] text-center border border-gray-200 rounded px-1 py-1 disabled:bg-gray-50";
  const br = (v, casas) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        {GRUPOS_CABECALHO_PULLOFF.map((g, gi) => (
          <div key={g.id} className={gi ? "mt-3" : ""}>
            <p className="text-[12px] font-bold text-torg-dark mb-2">{g.titulo}</p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {CAMPOS_CABECALHO_PULLOFF.filter((c) => c.grupo === g.id).map((c) => <Campo key={c.k} c={c} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-[12px] font-bold text-torg-dark mb-2">Esquema de pintura</p>
          <table className="w-full text-[12px]">
            <thead><tr className="text-[10px] text-torg-gray"><th className="text-left font-semibold pb-1.5">Demão</th><th className="font-semibold pb-1.5">Espessura (µm)</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {esquema.map((e, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-torg-dark">{i + 1}ª demão</td>
                  <td className="py-1.5"><input type="text" inputMode="decimal" aria-label={`Espessura da ${i + 1}ª demão`} value={e} disabled={travado} maxLength={20} onChange={(ev) => setEsquema(i, ev.target.value)} className={celula} /></td>
                </tr>
              ))}
              <tr className="bg-gray-50/60"><td className="py-1.5 font-semibold text-torg-dark">Espessura total</td><td className="py-1.5 text-center font-semibold tabular-nums">{total == null ? "—" : `${br(total, 1)} µm`}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm overflow-x-auto">
          <p className="text-[12px] font-bold text-torg-dark mb-2">Resultados — rompimento</p>
          <table className="w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="text-[10px] text-torg-gray">
                <th className="font-semibold pb-1.5 w-12">Dolly</th>
                <th className="font-semibold pb-1.5 px-1">Adesão (MPa)</th>
                <th className="font-semibold pb-1.5 px-1">Análise do rompimento (%)</th>
                <th className="font-semibold pb-1.5 px-1">Falha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dollies.map((d, i) => (
                <tr key={d.numero}>
                  <td className="py-1.5 text-center font-semibold text-torg-dark">{d.numero}</td>
                  <td className="py-1.5 px-1"><input type="text" inputMode="decimal" aria-label={`Adesão do dolly ${d.numero}`} value={d.adesao ?? ""} disabled={travado} maxLength={20} onChange={(e) => setDolly(i, "adesao", e.target.value)} className={celula} /></td>
                  <td className="py-1.5 px-1"><input type="text" aria-label={`Rompimento do dolly ${d.numero}`} value={d.rompimento ?? ""} disabled={travado} maxLength={60} placeholder="ex.: B 80% / C 20%" onChange={(e) => setDolly(i, "rompimento", e.target.value)} className={`${celula} placeholder:text-gray-300`} /></td>
                  <td className="py-1.5 px-1">
                    <select aria-label={`Falha do dolly ${d.numero}`} value={d.falha ?? ""} disabled={travado} onChange={(e) => setDolly(i, "falha", e.target.value)} className={celula}>
                      <option value="">—</option>
                      {FALHAS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-torg-gray">Média: <strong className="text-torg-dark tabular-nums">{media == null ? "—" : `${mediaEhMinima(res) ? "> " : ""}${br(media, 2)} MPa`}</strong>{mediaEhMinima(res) && <span className="ml-1">— dolly sem ruptura entra pelo limite</span>}</p>
          <p className="mt-1 text-[10px] text-torg-gray">{LEGENDA_ROMPIMENTO}</p>
        </div>
      </div>

      <p className="text-[11px] text-torg-gray">
        Laudo: {rel.resultadoInspecao === "APROVADO" || rel.resultadoInspecao === "REPROVADO"
          ? <strong className={rel.resultadoInspecao === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{rel.resultadoInspecao}</strong>
          : <span>marque aprovado ou reprovado em <b>Resultado da inspeção</b>, abaixo</span>}
      </p>

      {avisos.length > 0 && (
        <ul className="bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 text-[11px] text-amber-800 list-disc pl-6 space-y-0.5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
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
