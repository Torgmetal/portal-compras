"use client";
import { useEffect, useState } from "react";
import { useComponenteEstavel } from "@/lib/react-estavel";
import { AlertTriangle, CheckCircle2, PackageCheck } from "lucide-react";
import {
  COMPONENTES, CAMPOS_CABECALHO_RECEBIMENTO, GRUPOS_CABECALHO_RECEBIMENTO, camposCabecalhoRecebimento,
  avisosRecebimento, checklistRecebimento, lotesRecebimento, pendenciasRecebimento, preencherDoCmr, resultadoExigidoRecebimento,
} from "@/lib/recebimento-tinta-campos";
import { componentesDosCertificados } from "@/lib/recebimento-certificados";

/**
 * O PREENCHIMENTO DO RECEBIMENTO DE TINTAS, no computador.
 *
 * ⚠ O MATERIAL JÁ ESTÁ NO CMR: a tela oferece os lotes da obra (os mesmos que o RIP usa) para escolher o
 * A, o B e o C — produto, fabricante, lote, validade e certificado vêm de lá. O que veio só PREENCHE; o
 * inspetor confere e corrige. A data de fabricação não está no CMR e é digitada.
 */
export default function FormRecebimentoTinta({ rel, res, travado, setResultado }) {
  const efetivo = camposCabecalhoRecebimento({ ...rel, resultados: res });
  const lotes = lotesRecebimento(res);
  const itens = checklistRecebimento(res);
  const exigido = resultadoExigidoRecebimento({ ...rel, resultados: res });
  const faltam = pendenciasRecebimento({ ...rel, resultados: res });
  const avisos = avisosRecebimento({ ...rel, resultados: res });
  const [tintas, setTintas] = useState([]);
  const [escolha, setEscolha] = useState({});

  useEffect(() => {
    if (!rel?.opNumero) return;
    fetch(`/api/qualidade/plp/${encodeURIComponent(rel.opNumero)}`).then((r) => r.json())
      .then((j) => setTintas(Array.isArray(j.tintas) ? j.tintas : [])).catch(() => setTintas([]));
  }, [rel?.opNumero]);

  const aplicarCmr = () => {
    const escolhidos = Object.fromEntries(COMPONENTES.map((c) => [c, tintas.find((t) => t.id === escolha[c])]).filter(([, t]) => t));
    const novo = preencherDoCmr(res, escolhidos);
    for (const k of ["material", "fabricante", "certificado", "norma", "lotes"]) if (novo[k] !== undefined && novo[k] !== res[k]) setResultado(k, novo[k]);
  };
  const setLote = (i, k, v) => {
    const atual = lotes.map(({ componente, ...resto }) => resto);
    atual[i] = { ...atual[i], [k]: v };
    setResultado("lotes", atual);
  };
  const setItem = (n, v) => setResultado("checklist", { ...(res.checklist || {}), [n]: v });

  const Campo = useComponenteEstavel(({ c }) => (
    <div>
      <label className="block">
        <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{c.rotulo}{c.obrigatorio ? " *" : ""}</span>
        <input type={c.data ? "date" : "text"} list={c.sugestoes ? `rt-pc-${c.k}` : undefined}
          value={res[c.k] ?? ""} placeholder={res[c.k] ? "" : efetivo[c.k] || ""} disabled={travado}
          maxLength={c.data ? undefined : c.max || 120}
          onChange={(e) => setResultado(c.k, e.target.value)}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50 placeholder:text-gray-400" />
      </label>
      {c.data && !res[c.k] && <span className="block text-[10px] text-torg-gray mt-0.5">vazio: sai a data de emissão do relatório</span>}
      {c.sugestoes && <datalist id={`rt-pc-${c.k}`}>{c.sugestoes.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  ));

  const celula = "w-full text-[12px] border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50";

  // os certificados escolhidos na criação (07/10/2026) — e a posição de cada um, pela mesma regra da criação
  const certificados = Array.isArray(res.certificados) ? res.certificados : [];
  const posicoes = componentesDosCertificados(certificados);

  return (
    <div className="space-y-3">
      {certificados.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-[12px] font-bold text-torg-dark mb-1.5">Certificados do CMR escolhidos na criação</p>
          <ul className="space-y-1">
            {certificados.map((c, i) => (
              <li key={c.docId || i} className="text-[12px]">
                <span className="font-semibold text-torg-dark">{`${posicoes[i] || "—"} · ${c.descricao || "—"}`}</span>
                <span className="block text-[11px] text-torg-gray">{[c.r && `R ${c.r}`, c.certificado && `cert. ${c.certificado}`, c.lote && `lote ${c.lote}`, c.nf && `NF ${c.nf}`].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!travado && (
        <div className="bg-sky-50 border border-sky-100 rounded-xl p-3">
          <p className="text-[12px] font-bold text-torg-dark flex items-center gap-1.5"><PackageCheck size={14} /> Preencher com os lotes do CMR desta obra</p>
          {tintas.length ? (
            <div className="mt-2 grid sm:grid-cols-4 gap-2 items-end">
              {COMPONENTES.map((c) => (
                <label key={c} className="block">
                  <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Componente {c}</span>
                  <select aria-label={`Lote do CMR para o componente ${c}`} value={escolha[c] || ""} onChange={(e) => setEscolha((x) => ({ ...x, [c]: e.target.value }))} className={celula}>
                    <option value="">—</option>
                    {tintas.map((t) => <option key={t.id} value={t.id}>{t.produto}{t.lote ? ` · lote ${t.lote}` : ""}</option>)}
                  </select>
                </label>
              ))}
              <button type="button" onClick={aplicarCmr} disabled={!Object.values(escolha).some(Boolean)}
                className="text-[12px] font-semibold rounded-lg px-3 py-1.5 bg-torg-blue text-white disabled:opacity-40">Preencher</button>
            </div>
          ) : <p className="text-[11px] text-torg-gray mt-1">Nenhum lote de tinta no CMR desta obra — preencha à mão abaixo.</p>}
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        {GRUPOS_CABECALHO_RECEBIMENTO.map((g, gi) => (
          <div key={g.id} className={gi ? "mt-3" : ""}>
            <p className="text-[12px] font-bold text-torg-dark mb-2">{g.titulo}</p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {CAMPOS_CABECALHO_RECEBIMENTO.filter((c) => c.grupo === g.id).map((c) => <Campo key={c.k} c={c} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm overflow-x-auto">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Lotes</p>
        <table className="w-full min-w-[560px] text-[12px]">
          <thead><tr className="text-[10px] text-torg-gray"><th className="text-left font-semibold pb-1.5 w-24">Componente</th><th className="text-left font-semibold pb-1.5 px-1">Nº do lote</th><th className="font-semibold pb-1.5 px-1">Quantidade</th><th className="font-semibold pb-1.5 px-1">Fabricação</th><th className="font-semibold pb-1.5 px-1">Validade</th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {lotes.map((l, i) => (
              <tr key={l.componente}>
                <td className="py-1.5 font-semibold text-torg-dark">{l.componente}</td>
                <td className="py-1.5 px-1"><input aria-label={`Lote do componente ${l.componente}`} value={l.lote ?? ""} disabled={travado} maxLength={60} onChange={(e) => setLote(i, "lote", e.target.value)} className={celula} /></td>
                <td className="py-1.5 px-1"><input aria-label={`Quantidade do componente ${l.componente}`} value={l.quantidade ?? ""} disabled={travado} maxLength={30} onChange={(e) => setLote(i, "quantidade", e.target.value)} className={celula} /></td>
                <td className="py-1.5 px-1"><input type="date" aria-label={`Fabricação do componente ${l.componente}`} value={l.fabricacao ?? ""} disabled={travado} onChange={(e) => setLote(i, "fabricacao", e.target.value)} className={celula} /></td>
                <td className="py-1.5 px-1"><input type="date" aria-label={`Validade do componente ${l.componente}`} value={l.validade ?? ""} disabled={travado} onChange={(e) => setLote(i, "validade", e.target.value)} className={celula} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Itens inspecionados</p>
        <div className="space-y-1">
          {itens.map((it) => (
            <div key={it.numero} className="flex items-center gap-2 text-[12px]">
              <span className="flex-1 text-torg-dark">{it.numero}. {it.item}</span>
              {[["A", "Aprovado", "bg-emerald-600 border-emerald-600"], ["R", "Reprovado", "bg-red-600 border-red-600"]].map(([v, rot, cor]) => (
                <button key={v} type="button" disabled={travado} aria-label={`Item ${it.numero}: ${rot}`} onClick={() => setItem(it.numero, it.valor === v ? "" : v)}
                  className={`w-24 rounded-lg py-1 border text-[11px] font-semibold ${it.valor === v ? `${cor} text-white` : "text-torg-dark border-gray-200"} disabled:opacity-60`}>{rot}</button>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-torg-gray">Pelos itens e validades: {exigido ? <strong className={exigido === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{exigido}</strong> : "marque os nove itens"}{exigido === "APROVADO" ? " — para reprovar por outro motivo (produto trocado, sem certificado…), marque Reprovado e escreva o motivo nas observações." : exigido === "REPROVADO" ? " — o Resultado da inspeção tem de ser Reprovado." : ""}</p>
      </div>

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
