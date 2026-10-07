"use client";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import EscolherCertificados from "@/components/qualidade/EscolherCertificados";
import {
  CAMPOS_CABECALHO_RIR, CAMPOS_ITEM_RIR, INSPECOES_RIR, MARCAS_RIR, N_ITENS_RIR,
  avisosRir, itensRir, pendenciasRir, resultadoExigidoRir, rotuloMarca,
} from "@/lib/recebimento-rir-campos";

/**
 * O RECEBIMENTO POR CERTIFICADO NO CELULAR (penetrante/revelador e arame de solda, 07/10/2026) — o mesmo que
 * o computador pede, das mesmas listas: cada certificado com a inspeção visual, dimensional e dos documentos.
 *
 * ⚠ No celular se confere, marca e inclui certificado do CMR. Item que não está no CMR (o penetrante, até
 * hoje) entra pelo computador: são dez campos para digitar, e no telefone isso vira campo esquecido.
 */
const ITEM_VAZIO = [...CAMPOS_ITEM_RIR.map((c) => c.k), "docId", "r", "validade"];
const semNumero = ({ numero: _numero, ...i }) => i;
const paraItem = (c) => ({ ...Object.fromEntries(ITEM_VAZIO.map((k) => [k, String(c[k] ?? "")])), ...Object.fromEntries(INSPECOES_RIR.map((x) => [x.k, ""])) });
const CORES = { A: "bg-emerald-600 border-emerald-600", R: "bg-red-600 border-red-600", NA: "bg-slate-500 border-slate-500" };
// os dois campos do item que se editam no celular — o resto vem do CMR e se confere
const EDITAVEIS = CAMPOS_ITEM_RIR.filter((c) => ["quantidade", "rnc"].includes(c.k));

export default function FormularioRecebimentoRirCampo({ rel, cond, setCond, resultado = null, observacoes }) {
  const res = { ...(rel?.resultados || {}), ...cond };
  const itens = itensRir(res);
  // ⚠ o resultado e as observações da TELA, mesmo vazios: o motivo de reprovar escrito agora conta antes de gravar
  const atual = { ...rel, resultados: res, resultadoInspecao: resultado, observacoes: observacoes ?? rel?.observacoes };
  const exigido = resultadoExigidoRir(atual);
  const faltam = pendenciasRir(atual);
  const avisos = avisosRir(atual);
  const [incluindo, setIncluindo] = useState(false);
  const [novos, setNovos] = useState([]);

  const gravar = (lista) => setCond((c) => ({ ...c, itens: lista }));
  const setItem = (idx, k, v) => gravar(itens.map((i, n) => (n === idx ? { ...semNumero(i), [k]: v } : semNumero(i))));
  const remover = (idx) => gravar(itens.filter((_, n) => n !== idx).map(semNumero));
  const incluir = () => {
    const ja = new Set(itens.map((i) => i.docId).filter(Boolean));
    gravar([...itens.map(semNumero), ...novos.filter((c) => !ja.has(c.docId)).map(paraItem)].slice(0, N_ITENS_RIR));
    setNovos([]); setIncluindo(false);
  };

  const caixa = "w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 outline-none focus:border-torg-blue";

  return (
    <div className="mt-3 space-y-3">
      <div className={`rounded-xl border px-3 py-2.5 ${faltam.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
        <p className={`text-[13px] font-bold flex items-center gap-1.5 ${faltam.length ? "text-amber-900" : "text-emerald-800"}`}>
          {faltam.length ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
          {faltam.length ? `Falta preencher: ${faltam.length}` : "Tudo o que o relatório pede está preenchido"}
        </p>
        {faltam.length > 0 && <ul className="text-[11px] text-amber-800 mt-1 list-disc pl-4 space-y-0.5">{faltam.map((f) => <li key={f}>{f}</li>)}</ul>}
        {avisos.length > 0 && <ul className="text-[11px] text-amber-700 mt-1 list-disc pl-4 space-y-0.5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      </div>

      {CAMPOS_CABECALHO_RIR.map((c) => (
        <label key={c.k} className="block">
          <span className="block text-[12px] font-semibold text-torg-gray mb-1">{c.rotulo}</span>
          <input type={c.data ? "date" : "text"} value={res[c.k] ?? ""} maxLength={c.data ? undefined : 120}
            onChange={(e) => setCond((x) => ({ ...x, [c.k]: e.target.value }))} className={caixa} />
        </label>
      ))}

      {itens.map((i, idx) => (
        <div key={`${i.docId || "mao"}-${idx}`} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-torg-gray font-mono">Item {i.numero}{i.r ? ` · R ${i.r}` : ""}</p>
              <p className="text-[14px] font-semibold text-torg-dark">{i.descricao || "(sem descrição)"}</p>
              <p className="text-[12px] text-torg-gray">{[i.nf && `NF ${i.nf}`, i.certificado && `cert. ${i.certificado}`, i.lote && `lote ${i.lote}`].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <button type="button" onClick={() => remover(idx)} aria-label={`Remover item ${i.numero}`} className="min-h-11 px-2 text-torg-gray active:text-red-600"><Trash2 size={16} /></button>
          </div>
          {INSPECOES_RIR.map((c) => (
            <div key={c.k}>
              <span className="block text-[12px] text-torg-dark mb-1">{c.rotulo}</span>
              <div className="grid grid-cols-3 gap-2">
                {MARCAS_RIR.map((v) => (
                  <button key={v} type="button" aria-label={`Item ${i.numero}, ${c.rotulo}: ${rotuloMarca(v)}`}
                    onClick={() => setItem(idx, c.k, i[c.k] === v ? "" : v)}
                    className={`min-h-11 rounded-xl border-2 text-[14px] font-semibold ${i[c.k] === v ? `${CORES[v]} text-white` : "border-gray-200 text-torg-dark"}`}>
                    {rotuloMarca(v)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {EDITAVEIS.map((c) => (
              <label key={c.k} className="block">
                <span className="block text-[12px] text-torg-gray mb-1">{c.rotulo}</span>
                <input value={i[c.k]} maxLength={c.max} aria-label={`Item ${i.numero}, ${c.rotulo}`}
                  onChange={(e) => setItem(idx, c.k, e.target.value)} className={caixa} />
              </label>
            ))}
          </div>
        </div>
      ))}

      {itens.length > 0 && (
        <p className="text-[12px] text-torg-gray">
          Pelos itens: {exigido ? <strong className={exigido === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{exigido}</strong> : "marque as três inspeções em todos os itens"}
        </p>
      )}

      {incluindo ? (
        <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 space-y-2">
          <EscolherCertificados tipo={rel?.tipo} opNumero={rel?.opNumero} selecionados={novos} onChange={setNovos} />
          <button type="button" onClick={incluir} disabled={!novos.length}
            className="w-full min-h-11 rounded-xl bg-torg-blue text-white text-[15px] font-semibold disabled:opacity-40">Incluir {novos.length} certificado(s)</button>
          <button type="button" onClick={() => { setNovos([]); setIncluindo(false); }} className="w-full min-h-11 text-[14px] text-torg-gray">Cancelar</button>
        </div>
      ) : (
        <button type="button" onClick={() => setIncluindo(true)} disabled={itens.length >= N_ITENS_RIR}
          className="w-full min-h-11 rounded-xl border-2 border-torg-blue/40 text-torg-blue text-[15px] font-semibold disabled:opacity-40">Incluir certificados do CMR</button>
      )}
      <p className="text-[11px] text-torg-gray">Item que não está no CMR entra pelo computador, em Qualidade › Inspeções.</p>
    </div>
  );
}
