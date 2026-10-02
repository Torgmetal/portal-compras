"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  COMPONENTES, CAMPOS_CABECALHO_RECEBIMENTO, GRUPOS_CABECALHO_RECEBIMENTO, camposCabecalhoRecebimento,
  avisosRecebimento, checklistRecebimento, lotesRecebimento, pendenciasRecebimento, preencherDoCmr, resultadoExigidoRecebimento,
} from "@/lib/recebimento-tinta-campos";

/**
 * O RECEBIMENTO DE TINTAS NO CELULAR — o mesmo que o computador pede, das mesmas listas.
 *
 * Os lotes do CMR da obra preenchem material, fabricante, certificado, lote e validade (o que veio só
 * PREENCHE); os nove itens da embalagem são aprovado/reprovado, e o resultado sai deles.
 */
export default function FormularioRecebimentoTintaCampo({ rel, cond, setCond, resultado = null, observacoes }) {
  const res = { ...(rel?.resultados || {}), ...cond };
  const efetivo = camposCabecalhoRecebimento({ ...rel, resultados: res });
  const lotes = lotesRecebimento(res);
  const itens = checklistRecebimento(res);
  // ⚠ o resultado e as observações da TELA, mesmo vazios (ver FormularioSaisCampo): o motivo de reprovar
  // escrito agora conta antes de gravar
  const atual = { ...rel, resultados: res, resultadoInspecao: resultado, observacoes: observacoes ?? rel?.observacoes };
  const exigido = resultadoExigidoRecebimento(atual);
  const faltam = pendenciasRecebimento(atual);
  const avisos = avisosRecebimento(atual);
  const mudar = (k) => (v) => setCond((c) => ({ ...c, [k]: v }));
  const [tintas, setTintas] = useState([]);
  const [escolha, setEscolha] = useState({});

  useEffect(() => {
    if (!rel?.opNumero) return;
    fetch(`/api/qualidade/plp/${encodeURIComponent(rel.opNumero)}`).then((r) => r.json())
      .then((j) => setTintas(Array.isArray(j.tintas) ? j.tintas : [])).catch(() => setTintas([]));
  }, [rel?.opNumero]);

  const aplicarCmr = () => {
    const escolhidos = Object.fromEntries(COMPONENTES.map((c) => [c, tintas.find((t) => t.id === escolha[c])]).filter(([, t]) => t));
    setCond((c) => {
      const novo = preencherDoCmr({ ...(rel?.resultados || {}), ...c }, escolhidos);
      return { ...c, material: novo.material, fabricante: novo.fabricante, certificado: novo.certificado, norma: novo.norma, lotes: novo.lotes };
    });
  };
  const setLote = (i, k, v) => setCond((c) => {
    const atual = lotesRecebimento({ ...(rel?.resultados || {}), ...c }).map(({ componente, ...resto }) => resto);
    atual[i] = { ...atual[i], [k]: v };
    return { ...c, lotes: atual };
  });
  const setItem = (n, v) => setCond((c) => ({ ...c, checklist: { ...(c.checklist || rel?.resultados?.checklist || {}), [n]: v } }));

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

      {tintas.length > 0 && (
        <section className="bg-sky-50 border border-sky-100 rounded-2xl p-3.5">
          <h3 className="text-[14px] font-bold text-torg-dark mb-2">Lotes do CMR desta obra</h3>
          <div className="space-y-2">
            {COMPONENTES.map((c) => (
              <label key={c} className="block"><span className="block text-[11px] text-torg-gray mb-1">Componente {c}</span>
                <select value={escolha[c] || ""} onChange={(e) => setEscolha((x) => ({ ...x, [c]: e.target.value }))} className={caixa}>
                  <option value="">—</option>
                  {tintas.map((t) => <option key={t.id} value={t.id}>{t.produto}{t.lote ? ` · lote ${t.lote}` : ""}</option>)}
                </select></label>
            ))}
          </div>
          <button type="button" onClick={aplicarCmr} disabled={!Object.values(escolha).some(Boolean)}
            className="mt-2 w-full rounded-xl py-3 bg-torg-blue text-white text-[14px] font-semibold disabled:opacity-40">Preencher com estes lotes</button>
        </section>
      )}

      {GRUPOS_CABECALHO_RECEBIMENTO.map((g, gi) => (
        <section key={g.id} className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
          <h3 className="text-[14px] font-bold text-torg-dark mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-torg-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{gi + 1}</span>
            {g.titulo}
          </h3>
          <div className="space-y-3">
            {CAMPOS_CABECALHO_RECEBIMENTO.filter((c) => c.grupo === g.id).map((c) => (
              <div key={c.k}>
                <label className="block">
                  <span className="block text-[12px] font-semibold text-torg-dark mb-1">{c.rotulo}{c.obrigatorio && <span className="text-red-600"> *</span>}</span>
                  <input type={c.data ? "date" : "text"} list={c.sugestoes ? `rt-campo-${c.k}` : undefined}
                    value={cond[c.k] ?? ""} placeholder={cond[c.k] ? "" : efetivo[c.k] || ""} maxLength={c.data ? undefined : c.max || 120}
                    onChange={(e) => mudar(c.k)(e.target.value)} className={caixa} />
                </label>
                {c.sugestoes && <datalist id={`rt-campo-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
        <h3 className="text-[14px] font-bold text-torg-dark mb-3">Lotes</h3>
        <div className="space-y-3">
          {lotes.map((l, i) => (
            <div key={l.componente} className="rounded-xl border border-gray-200 p-3">
              <p className="text-[13px] font-bold text-torg-dark mb-2">Componente {l.componente}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block col-span-2"><span className="block text-[11px] text-torg-gray mb-1">Nº do lote</span>
                  <input value={l.lote ?? ""} maxLength={60} onChange={(e) => setLote(i, "lote", e.target.value)} className={caixa} /></label>
                <label className="block col-span-2"><span className="block text-[11px] text-torg-gray mb-1">Quantidade</span>
                  <input value={l.quantidade ?? ""} maxLength={30} onChange={(e) => setLote(i, "quantidade", e.target.value)} className={caixa} /></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Fabricação</span>
                  <input type="date" value={l.fabricacao ?? ""} onChange={(e) => setLote(i, "fabricacao", e.target.value)} className={caixa} /></label>
                <label className="block"><span className="block text-[11px] text-torg-gray mb-1">Validade</span>
                  <input type="date" value={l.validade ?? ""} onChange={(e) => setLote(i, "validade", e.target.value)} className={caixa} /></label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
        <h3 className="text-[14px] font-bold text-torg-dark mb-3">Itens inspecionados</h3>
        <div className="space-y-2">
          {itens.map((it) => (
            <div key={it.numero}>
              <p className="text-[13px] text-torg-dark mb-1">{it.numero}. {it.item}</p>
              <div className="grid grid-cols-2 gap-2">
                {[["A", "Aprovado", "bg-emerald-600 border-emerald-600"], ["R", "Reprovado", "bg-red-600 border-red-600"]].map(([v, rot, cor]) => (
                  <button key={v} type="button" aria-label={`Item ${it.numero}: ${rot}`} onClick={() => setItem(it.numero, it.valor === v ? "" : v)}
                    className={`rounded-xl py-2.5 border text-[13px] font-semibold ${it.valor === v ? `${cor} text-white` : "text-torg-dark border-gray-200"}`}>{rot}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-torg-gray">Pelos itens e validades: {exigido ? <strong className={exigido === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{exigido}</strong> : "marque os nove itens"}{exigido === "APROVADO" ? " — para reprovar por outro motivo (produto trocado, sem certificado…), marque Reprovado e escreva o motivo nas observações." : exigido === "REPROVADO" ? " — o Resultado da inspeção tem de ser Reprovado." : ""}</p>
      </section>
    </div>
  );
}
