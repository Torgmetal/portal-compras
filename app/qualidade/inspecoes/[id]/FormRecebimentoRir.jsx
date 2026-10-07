"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, PackageCheck, Plus, Trash2 } from "lucide-react";
import EscolherCertificados from "@/components/qualidade/EscolherCertificados";
import {
  CAMPOS_CABECALHO_RIR, CAMPOS_ITEM_RIR, INSPECOES_RIR, MARCAS_RIR, N_ITENS_RIR,
  avisosRir, itensRir, pendenciasRir, resultadoExigidoRir, rotuloMarca,
} from "@/lib/recebimento-rir-campos";

/**
 * O PREENCHIMENTO DO RECEBIMENTO POR CERTIFICADO (penetrante/revelador e arame de solda), no computador.
 *
 * Vitor (07/10/2026): "selecionar apenas os certificados", sem peças. Cada certificado escolhido na criação
 * vira um item, já com NF, pedido, certificado, lote e quantidade do CMR; o inspetor confere, corrige e marca
 * a inspeção visual, dimensional e dos documentos (A, R ou N.A.).
 *
 * ⚠ O QUE NÃO ESTÁ NO CMR ENTRA À MÃO: do líquido penetrante só o revelador foi lançado até hoje — sem esta
 * saída, o relatório do penetrante não teria como listar o penetrante.
 */
const VAZIO = Object.fromEntries([...CAMPOS_ITEM_RIR.map((c) => [c.k, ""]), ["docId", ""], ["r", ""], ["validade", ""], ...INSPECOES_RIR.map((c) => [c.k, ""])]);
const semNumero = ({ numero: _numero, ...i }) => i;
// do que a busca devolve, só o que é campo do item (a busca traz também PDF, data e OP do lançamento)
const paraItem = (c) => Object.fromEntries(Object.keys(VAZIO).map((k) => [k, INSPECOES_RIR.some((x) => x.k === k) ? "" : String(c[k] ?? "")]));

const CORES = { A: "bg-emerald-600 border-emerald-600", R: "bg-red-600 border-red-600", NA: "bg-slate-500 border-slate-500" };

export default function FormRecebimentoRir({ rel, res, travado, setResultado }) {
  const itens = itensRir(res);
  const relAtual = { ...rel, resultados: res };
  const exigido = resultadoExigidoRir(relAtual);
  const faltam = pendenciasRir(relAtual);
  const avisos = avisosRir(relAtual);
  const [incluindo, setIncluindo] = useState(false);
  const [novos, setNovos] = useState([]);

  const gravar = (lista) => setResultado("itens", lista);
  const setItem = (idx, k, v) => gravar(itens.map((i, n) => (n === idx ? { ...semNumero(i), [k]: v } : semNumero(i))));
  const remover = (idx) => gravar(itens.filter((_, n) => n !== idx).map(semNumero));
  const incluirAMao = () => gravar([...itens.map(semNumero), { ...VAZIO }].slice(0, N_ITENS_RIR));
  const incluirCertificados = () => {
    const ja = new Set(itens.map((i) => i.docId).filter(Boolean));
    const extras = novos.filter((c) => !ja.has(c.docId)).map(paraItem);
    gravar([...itens.map(semNumero), ...extras].slice(0, N_ITENS_RIR));
    setNovos([]); setIncluindo(false);
  };

  const campo = "w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50";

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <p className="text-[12px] font-bold text-torg-dark mb-2">Identificação</p>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {CAMPOS_CABECALHO_RIR.map((c) => (
            <label key={c.k} className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{c.rotulo}</span>
              <input type={c.data ? "date" : "text"} value={res[c.k] ?? ""} disabled={travado} maxLength={c.data ? undefined : 120}
                onChange={(e) => setResultado(c.k, e.target.value)} className={campo} />
              {c.data && !res[c.k] && <span className="block text-[10px] text-torg-gray mt-0.5">vazio: sai a data de emissão do relatório</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5"><PackageCheck size={14} className="text-torg-blue" /> Itens recebidos · {itens.length}</p>
          {!travado && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIncluindo((v) => !v)} disabled={itens.length >= N_ITENS_RIR} className="text-[11px] text-torg-blue hover:underline disabled:opacity-40">Incluir certificados do CMR</button>
              <button type="button" onClick={incluirAMao} disabled={itens.length >= N_ITENS_RIR} className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1 disabled:opacity-40"><Plus size={11} />Incluir item à mão</button>
            </div>
          )}
        </div>

        {incluindo && !travado && (
          <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 space-y-2">
            <EscolherCertificados tipo={rel.tipo} opNumero={rel.opNumero} selecionados={novos} onChange={setNovos} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={incluirCertificados} disabled={!novos.length}
                className="text-[12px] font-semibold rounded-lg px-3 py-1.5 bg-torg-blue text-white disabled:opacity-40">Incluir {novos.length} certificado(s)</button>
              <button type="button" onClick={() => { setNovos([]); setIncluindo(false); }} className="text-[12px] text-torg-gray hover:underline">Cancelar</button>
            </div>
          </div>
        )}

        {!itens.length && <p className="text-[12px] text-torg-gray">Nenhum item. Inclua os certificados do CMR ou um item à mão.</p>}

        {itens.map((i, idx) => (
          <div key={`${i.docId || "mao"}-${idx}`} className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-bold text-torg-dark">
                Item {i.numero} <span className="text-[11px] font-mono font-normal text-torg-gray">{i.r ? <span>R {i.r}</span> : "· incluído à mão"}</span>
              </p>
              {!travado && (
                <button type="button" onClick={() => remover(idx)} aria-label={`Remover item ${i.numero}`} className="text-torg-gray hover:text-red-600"><Trash2 size={13} /></button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CAMPOS_ITEM_RIR.map((c) => (
                <label key={c.k} className={`block ${c.k === "descricao" ? "col-span-2" : ""}`}>
                  <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">{c.rotulo}</span>
                  <input value={i[c.k]} disabled={travado} maxLength={c.max} aria-label={`Item ${i.numero}, ${c.rotulo}`}
                    onChange={(e) => setItem(idx, c.k, e.target.value)} className={campo} />
                </label>
              ))}
              <label className="block">
                <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Validade</span>
                <input type="date" value={i.validade} disabled={travado} aria-label={`Item ${i.numero}, Validade`}
                  onChange={(e) => setItem(idx, "validade", e.target.value)} className={campo} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {INSPECOES_RIR.map((c) => (
                <div key={c.k} className="flex items-center gap-1">
                  <span className="text-[11px] text-torg-dark w-24">{c.rotulo}</span>
                  {MARCAS_RIR.map((v) => (
                    <button key={v} type="button" disabled={travado} aria-label={`Item ${i.numero}, ${c.rotulo}: ${rotuloMarca(v)}`}
                      onClick={() => setItem(idx, c.k, i[c.k] === v ? "" : v)}
                      className={`w-11 rounded-lg py-1 border text-[11px] font-semibold ${i[c.k] === v ? `${CORES[v]} text-white` : "text-torg-dark border-gray-200"} disabled:opacity-60`}>
                      {rotuloMarca(v)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}

        {itens.length > 0 && (
          <p className="text-[12px] text-torg-gray">
            Pelos itens: {exigido ? <strong className={exigido === "APROVADO" ? "text-emerald-700" : "text-red-700"}>{exigido}</strong> : "marque as três inspeções em todos os itens"}
            {exigido === "APROVADO" ? " — para reprovar por outro motivo (produto trocado, embalagem sem identificação…), marque Reprovado e escreva o motivo nas observações." : exigido === "REPROVADO" ? " — o Resultado da inspeção tem de ser Reprovado." : ""}
          </p>
        )}
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
        <p className="text-[11px] text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={12} /> Tudo o que o relatório pede está preenchido.</p>
      )}
    </div>
  );
}
