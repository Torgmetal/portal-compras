"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Send, CheckCircle2, Clock, Mail, Plus, X, AlertCircle } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * O aceite do cliente num plano da obra (PIT ou PLP).
 *
 * Vitor (26/08/2026): "não quero que gere apenas o excel, quero que mande para assinatura como te
 * disse, e será através de um e-mail que será enviado, e já fique mostrando o status no portal do
 * cliente; o PIT também deve conter o aceite por parte do cliente, não pode deixar de ter esse
 * aceite".
 *
 * ⚠ O CONTATO VEM PRONTO. São os contatos do cliente já registrados na OP (os mesmos do cronograma
 * e do Kick Off). Redigitar o e-mail do inspetor a cada envio é como se erra o destinatário de um
 * documento controlado.
 */
export default function AceitePlano({ opNumero, doc, nome, onEnviado }) {
  const [d, setD] = useState(null);
  const [abrir, setAbrir] = useState(false);
  const [marcados, setMarcados] = useState(() => new Set());
  const [novo, setNovo] = useState({ nome: "", email: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(() => {
    fetch(`/api/qualidade/planos/${encodeURIComponent(opNumero)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!j.error) { setD(j); setMarcados(new Set((j.contatos || []).map((c) => c.email))); } })
      .catch(() => {});
  }, [opNumero]);
  useEffect(() => { carregar(); }, [carregar]);

  const st = d?.status?.[doc];

  async function enviar() {
    setEnviando(true); setErro(""); setOk("");
    const escolhidos = (d?.contatos || []).filter((c) => marcados.has(c.email)).map((c) => ({ nome: c.nome || c.email, email: c.email, setor: d?.cliente || null }));
    if (novo.email.trim()) escolhidos.push({ nome: novo.nome.trim() || novo.email.trim(), email: novo.email.trim(), setor: d?.cliente || null });
    try {
      const r = await fetch(`/api/qualidade/planos/${encodeURIComponent(opNumero)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, destinatarios: escolhidos }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao enviar");
      setOk(`${j.numero} enviado para ${j.enviados} de ${j.total} destinatário(s).`);
      setAbrir(false); setNovo({ nome: "", email: "" });
      carregar(); onEnviado?.();
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  if (!d) return <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> lendo o aceite…</p>;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      {/* ── o estado do aceite ── */}
      {st?.aceito ? (
        <p className="text-[12px] text-emerald-700 inline-flex items-start gap-1.5">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <span><b>Aceito pelo cliente</b> — {st.aceitoPor} em {fmtDT(st.aceitoEm)} · revisão R{String(st.revisao ?? 0).padStart(2, "0")}</span>
        </p>
      ) : st?.enviado ? (
        <p className="text-[12px] text-amber-700 inline-flex items-start gap-1.5">
          <Clock size={14} className="mt-0.5 shrink-0" />
          <span><b>Aguardando aceite</b> — enviado em {fmtDT(st.enviadoEm)} para {st.pendentes.join(", ")}</span>
        </p>
      ) : (
        <p className="text-[12px] text-torg-gray inline-flex items-start gap-1.5">
          <Mail size={14} className="mt-0.5 shrink-0" />
          <span>Ainda não enviado ao cliente. O {doc} precisa do aceite antes de valer como plano da obra.</span>
        </p>
      )}

      {!abrir ? (
        <button onClick={() => setAbrir(true)}
          className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
          <Send size={12} /> {st?.enviado ? "Enviar de novo" : `Enviar ${nome} para aceite do cliente`}
        </button>
      ) : (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-torg-dark">Quem assina pelo cliente</p>
            <button onClick={() => setAbrir(false)} className="text-torg-gray"><X size={13} /></button>
          </div>
          {(d.contatos || []).length ? (
            <div className="space-y-1">
              {d.contatos.map((c) => (
                <label key={c.email} className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" className="accent-torg-orange" checked={marcados.has(c.email)}
                    onChange={(e) => setMarcados((m) => { const n = new Set(m); if (e.target.checked) n.add(c.email); else n.delete(c.email); return n; })} />
                  <span className="text-torg-dark">{c.nome || "—"}</span>
                  <span className="text-torg-gray">{c.email}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-torg-gray">Esta obra ainda não tem contatos do cliente registrados. Informe abaixo.</p>
          )}
          <div className="flex items-center gap-1.5">
            <Plus size={12} className="text-torg-gray-light shrink-0" />
            <input value={novo.nome} onChange={(e) => setNovo((v) => ({ ...v, nome: e.target.value }))} placeholder="Nome"
              className="text-[11px] border border-gray-200 rounded px-2 py-1 w-32 outline-none focus:border-torg-blue" />
            <input value={novo.email} onChange={(e) => setNovo((v) => ({ ...v, email: e.target.value }))} placeholder="e-mail" type="email"
              className="text-[11px] border border-gray-200 rounded px-2 py-1 flex-1 outline-none focus:border-torg-blue" />
          </div>
          {erro && <p className="text-[11px] text-red-600 inline-flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0" /> {erro}</p>}
          <button onClick={enviar} disabled={enviando}
            className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
            {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Enviar por e-mail
          </button>
        </div>
      )}
      {ok && <p className="text-[12px] text-emerald-700">{ok}</p>}
      {erro && !abrir && <p className="text-[11px] text-red-600">{erro}</p>}
    </div>
  );
}
