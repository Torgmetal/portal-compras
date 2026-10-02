"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  N_DOLLIES, N_DEMAOS_PULLOFF, FALHAS, LEGENDA_ROMPIMENTO, CAMPOS_CABECALHO_PULLOFF, GRUPOS_CABECALHO_PULLOFF,
  avisosPullOff, camposCabecalhoPullOff, dolliesPullOff, esquemaPullOff, espessuraTotal, mediaAdesao, mediaEhMinima, pendenciasPullOff,
} from "@/lib/pulloff-campos";

/**
 * O ENSAIO DE ADERÊNCIA (PULL-OFF) NO CELULAR — o mesmo que o computador pede, das mesmas listas.
 *
 * Informações e condições da fixação, o esquema de pintura (três demãos e o total) e os cinco dollies,
 * com a média como a planilha. O laudo é o "Resultado da inspeção" do relatório, mais abaixo.
 */
const br = (v, casas) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));

export default function FormularioPullOffCampo({ rel, cond, setCond, resultado = null }) {
  const res = { ...(rel?.resultados || {}), ...cond };
  const efetivo = camposCabecalhoPullOff({ ...rel, resultados: res });
  const esquema = esquemaPullOff(res);
  const dollies = dolliesPullOff(res);
  const total = espessuraTotal(res);
  const media = mediaAdesao(res);
  // ⚠ o resultado da TELA, mesmo vazio (ver FormularioSaisCampo): desmarcar não pode voltar ao gravado
  const faltam = pendenciasPullOff({ ...rel, resultados: res, resultadoInspecao: resultado });
  const avisos = avisosPullOff({ ...rel, resultados: res });
  const mudar = (k) => (v) => setCond((c) => ({ ...c, [k]: v }));

  const setEsquema = (i, v) => setCond((c) => {
    const atual = Array.from({ length: N_DEMAOS_PULLOFF }, (_, k) => (Array.isArray(c.esquema) ? c.esquema[k] : esquema[k]) || "");
    atual[i] = v;
    return { ...c, esquema: atual };
  });
  const setDolly = (i, k, v) => setCond((c) => {
    const atual = Array.isArray(c.dollies) ? [...c.dollies] : [];
    while (atual.length < N_DOLLIES) atual.push({});
    atual[i] = { ...(atual[i] || {}), [k]: v };
    return { ...c, dollies: atual };
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
        {avisos.length > 0 && <ul className="text-[11px] text-amber-700 mt-1 list-disc pl-4 space-y-0.5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      </div>

      {GRUPOS_CABECALHO_PULLOFF.map((g, gi) => (
        <section key={g.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <h3 className="text-[14px] font-bold text-torg-dark mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-torg-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{gi + 1}</span>
            {g.titulo}
          </h3>
          <div className="space-y-3">
            {CAMPOS_CABECALHO_PULLOFF.filter((c) => c.grupo === g.id).map((c) => (
              <div key={c.k}>
                <label className="block">
                  <span className="block text-[12px] font-semibold text-torg-dark mb-1">{c.rotulo}{c.obrigatorio && <span className="text-red-600"> *</span>}</span>
                  <input type={c.data ? "date" : "text"} inputMode={c.numero ? "decimal" : undefined} list={c.sugestoes ? `po-campo-${c.k}` : undefined}
                    value={cond[c.k] ?? ""} placeholder={cond[c.k] ? "" : efetivo[c.k] || ""} maxLength={c.data ? undefined : c.max || 120}
                    onChange={(e) => mudar(c.k)(e.target.value)} className={caixa} />
                </label>
                {c.sugestoes && <datalist id={`po-campo-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
        <h3 className="text-[14px] font-bold text-torg-dark mb-3">Esquema de pintura</h3>
        <div className="grid grid-cols-3 gap-2">
          {esquema.map((e, i) => (
            <label key={i} className="block"><span className="block text-[11px] text-torg-gray mb-1">{i + 1}ª demão (µm)</span>
              <input type="text" inputMode="decimal" value={e} maxLength={20} onChange={(ev) => setEsquema(i, ev.target.value)} className={caixa} /></label>
          ))}
        </div>
        <p className="text-[13px] text-torg-gray mt-2">Espessura total: <strong className="text-torg-dark">{total == null ? "—" : `${br(total, 1)} µm`}</strong></p>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
        <h3 className="text-[14px] font-bold text-torg-dark mb-1">Resultados — rompimento</h3>
        <p className="text-[11px] text-torg-gray mb-3">{LEGENDA_ROMPIMENTO}</p>
        <div className="space-y-3">
          {dollies.map((d, i) => (
            <div key={d.numero} className="rounded-xl border border-gray-200 p-3">
              <p className="text-[13px] font-bold text-torg-dark mb-2">Dolly {d.numero}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Adesão (MPa)</span>
                  <input type="text" inputMode="decimal" value={d.adesao ?? ""} maxLength={20} onChange={(e) => setDolly(i, "adesao", e.target.value)} className={caixa} /></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Falha</span>
                  <select value={d.falha ?? ""} onChange={(e) => setDolly(i, "falha", e.target.value)} className={caixa}>
                    <option value="">—</option>{FALHAS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select></label>
              </div>
              <label className="block mt-2"><span className="block text-[11px] text-torg-gray mb-1">Análise do rompimento (%)</span>
                <input type="text" value={d.rompimento ?? ""} maxLength={60} placeholder="ex.: B 80% / C 20%" onChange={(e) => setDolly(i, "rompimento", e.target.value)} className={caixa} /></label>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-[13px] space-y-1">
          <p>Média: <strong>{media == null ? "—" : `${mediaEhMinima(res) ? "> " : ""}${br(media, 2)} MPa`}</strong></p>
          <p className="text-[12px] text-torg-gray">Laudo: marque aprovado ou reprovado em <b>Resultado da inspeção</b>, mais abaixo.</p>
        </div>
      </section>
    </div>
  );
}
