"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, FileCheck2, Loader2, Search, X } from "lucide-react";
import { componentesDosCertificados, MAX_CERTIFICADOS } from "@/lib/recebimento-certificados";

/**
 * ESCOLHER OS CERTIFICADOS DO CMR — a criação dos recebimentos, no computador e no celular.
 *
 * Vitor (07/10/2026): "relatório de recebimento de tintas: está para selecionar as peças, mas nesse eu
 * preciso apenas selecionar os certificados das tintas e diluentes" — e o mesmo no de penetrante/revelador
 * e no de arame de solda. A lista abre com os certificados da classe (o arame no recebimento de arame),
 * os desta obra primeiro; digitar procura no CMR inteiro (pelo R, NF, produto, certificado ou lote).
 *
 * ⚠ NO DE TINTAS CADA CERTIFICADO É UM COMPONENTE (A, B ou C) e a tela mostra qual — a MESMA regra que a
 * criação usa (`componentesDosCertificados`), para o relatório não nascer diferente do que se viu aqui.
 */
export default function EscolherCertificados({ tipo, opNumero, selecionados = [], onChange }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(null);
  const [classe, setClasse] = useState("");
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const max = MAX_CERTIFICADOS[tipo] || 0;
  const ehTinta = tipo === "RECEBIMENTO_TINTA";
  const escolhidos = new Set(selecionados.map((c) => c.docId));
  const cheio = selecionados.length >= max;
  const posicoes = ehTinta ? componentesDosCertificados(selecionados) : [];

  useEffect(() => {
    let vivo = true;
    setLista(null); setErro("");
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ tipo, opNumero: opNumero || "", q });
      fetch(`/api/qualidade/inspecoes/certificados?${qs.toString()}`)
        .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Não foi possível buscar no CMR."); return j; })
        .then((j) => { if (vivo) { setLista(j.certificados || []); setClasse(j.classe || ""); } })
        .catch((e) => { if (vivo) { setLista([]); setErro(e.message); } });
    }, q ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [tipo, opNumero, q, tentativa]);

  const alternar = (c) => onChange(escolhidos.has(c.docId) ? selecionados.filter((s) => s.docId !== c.docId) : cheio ? selecionados : [...selecionados, c]);
  const linhaDados = (c) => [c.nf && `NF ${c.nf}`, c.certificado && `cert. ${c.certificado}`, c.lote && `lote ${c.lote}`, c.quantidade, c.recebidoEm && `recebido ${c.recebidoEm.split("-").reverse().join("/")}`].filter(Boolean).join(" · ");
  const daObra = (c) => opNumero && String(c.opNumero || "").replace(/^0+/, "") === String(opNumero).replace(/^0+/, "");

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-torg-gray">
        Certificados do CMR{classe ? ` — ${classe}` : ""}. {ehTinta ? "Até 3: tinta (A), endurecedor (B) e diluente (C)." : "Uma linha do relatório por certificado."}
      </p>

      {selecionados.length > 0 && (
        <div className="space-y-1">
          {selecionados.map((c, i) => (
            <div key={c.docId} className="flex items-center gap-2 bg-torg-blue/5 border border-torg-blue/20 rounded-lg px-2 py-1.5">
              <FileCheck2 size={13} className="text-torg-blue shrink-0" />
              <span className="min-w-0 flex-1 text-[12px] text-torg-dark truncate">{ehTinta && posicoes[i] ? `${posicoes[i]} · ` : ""}{c.descricao}</span>
              <span className="text-[10px] text-torg-gray font-mono shrink-0">{c.r ? `R ${c.r}` : ""}</span>
              <button type="button" onClick={() => alternar(c)} aria-label={`Tirar R${String(c.r || c.docId).replace(/^R/, "")}`} className="text-torg-gray hover:text-red-600 shrink-0"><X size={13} /></button>
            </div>
          ))}
          {cheio && <p className="text-[10px] text-amber-700">Máximo de {max}{ehTinta ? " (A, B e C)" : ""} por relatório.</p>}
        </div>
      )}

      <label className="relative block">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="R, NF, produto, certificado ou lote"
          aria-label="Buscar certificado no CMR"
          className="w-full text-[13px] border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 focus:border-torg-blue outline-none" />
      </label>

      <div className="border border-gray-100 rounded-lg max-h-64 overflow-y-auto">
        {lista === null && <p className="p-2 text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> buscando no CMR…</p>}
        {erro && (
          <div className="p-2 text-[12px] text-red-600 flex items-center gap-2">
            <AlertCircle size={13} /> <span className="flex-1">{erro}</span>
            <button type="button" onClick={() => setTentativa((n) => n + 1)} className="text-torg-blue hover:underline">Tentar novamente</button>
          </div>
        )}
        {lista && !erro && !lista.length && (
          <p className="p-2 text-[12px] text-torg-gray">
            Nenhum certificado {q ? "com esse texto" : "desta classe"} no CMR. Busque pelo R, NF ou produto — o que não estiver no CMR dá para incluir à mão depois, no relatório.
          </p>
        )}
        {(lista || []).map((c) => {
          const on = escolhidos.has(c.docId);
          const bloqueado = !on && cheio;
          return (
            <label key={c.docId} className={`flex items-start gap-2 px-2 py-1.5 border-b border-gray-50 ${bloqueado ? "opacity-50" : "cursor-pointer hover:bg-gray-50"} ${on ? "bg-torg-blue/5" : ""}`}>
              <input type="checkbox" checked={on} disabled={bloqueado} onChange={() => alternar(c)}
                aria-label={`Escolher R${String(c.r || c.docId).replace(/^R/, "")}`} className="mt-0.5 accent-torg-blue" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-torg-dark">{c.descricao}</span>
                <span className="block text-[10px] text-torg-gray">{linhaDados(c) || "—"}</span>
              </span>
              <span className="shrink-0 text-right">
                {c.r && <span className="block text-[10px] font-mono text-torg-gray">R {c.r}</span>}
                {daObra(c) && <span className="inline-block text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1">desta obra</span>}
                {on && <Check size={12} className="inline text-torg-blue ml-1" />}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
