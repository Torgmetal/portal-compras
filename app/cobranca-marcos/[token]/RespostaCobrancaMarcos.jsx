"use client";
import { useState, useEffect } from "react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

export default function RespostaCobrancaMarcos({ token }) {
  const [cobranca, setCobranca] = useState(null);
  const [marcos, setMarcos] = useState([]);
  const [resp, setResp] = useState({}); // { [tarefaId]: { status, novaData, dataConclusao, evidencia } }
  const [autor, setAutor] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    fetch(`/api/cobranca-marcos/${token}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) { setCobranca(j.cobranca); setMarcos(j.marcos || []); } else setErro(j.error || "Link inválido."); })
      .catch(() => setErro("Não foi possível carregar."))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (id, patch) => setResp((r) => ({ ...r, [id]: { ...(r[id] || {}), ...patch } }));

  async function enviar() {
    setErro("");
    if (!autor.trim()) return setErro("Informe seu nome.");
    for (const m of marcos) {
      const a = resp[m.id];
      if (!a || !a.status) return setErro(`Responda o marco: ${m.nome}`);
      if (a.status === "FINALIZADO" && (!a.dataConclusao || !(a.evidencia || "").trim())) return setErro(`No marco "${m.nome}", informe a data de conclusão e a evidência.`);
      if (a.status === "NAO_FINALIZADO" && !a.novaData) return setErro(`No marco "${m.nome}", informe a nova data prevista.`);
    }
    setEnviando(true);
    try {
      const respostas = marcos.map((m) => ({ tarefaId: m.id, ...resp[m.id] }));
      const r = await fetch(`/api/cobranca-marcos/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respondidoPor: autor.trim(), respostas }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao enviar.");
      setPronto(true);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  const Wrap = ({ children }) => (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>{children}</div>
    </div>
  );
  const inp = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8 };

  if (loading) return <Wrap><p style={{ textAlign: "center", color: "#576D7E", marginTop: 60 }}>carregando…</p></Wrap>;
  if (erro && !cobranca) return <Wrap><div style={{ background: "#fff", borderRadius: 12, padding: 28, textAlign: "center", color: "#b91c1c" }}>{erro}</div></Wrap>;

  if (pronto || cobranca.respondido) return (
    <Wrap><div style={{ background: "#fff", borderRadius: 12, padding: 32, textAlign: "center", marginTop: 40 }}>
      <p style={{ fontSize: 40, margin: 0 }}>✅</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: "#059669", margin: "8px 0 0" }}>Cobrança respondida!</p>
      <p style={{ fontSize: 13, color: "#576D7E", margin: "6px 0 0" }}>{cobranca.respondido && !pronto ? `Já respondida${cobranca.respondidoPor ? ` por ${cobranca.respondidoPor}` : ""}.` : "O Planejamento foi avisado e o cronograma atualizado. Pode fechar."}</p>
    </div></Wrap>
  );

  return (
    <Wrap>
      <div style={{ background: "#006EAB", color: "#fff", padding: "18px 22px", borderRadius: "12px 12px 0 0" }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Cobrança de marcos — {cobranca.departamentoLabel}</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.9 }}>Torg Metal — Planejamento. Responda cada marco abaixo.</p>
      </div>
      <div style={{ background: "#fff", padding: 20, border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#002945", marginBottom: 4 }}>Seu nome</label>
        <input value={autor} onChange={(e) => setAutor(e.target.value)} placeholder="Quem está respondendo" style={{ ...inp, marginBottom: 16 }} />

        {marcos.map((m) => {
          const a = resp[m.id] || {};
          return (
            <div key={m.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#002945" }}>{m.nome}</p>
              <p style={{ margin: "3px 0 10px", fontSize: 12, color: "#576D7E" }}>
                {m.opNumero ? `OP-${String(m.opNumero).padStart(3, "0")} · ` : ""}Previsto: <b>{fmt(m.dataPrevista)}</b>
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: a.status ? 10 : 0 }}>
                {[["FINALIZADO", "✅ Finalizado", "#059669"], ["NAO_FINALIZADO", "🗓️ Não finalizado", "#F4801F"]].map(([k, t, c]) => (
                  <button key={k} type="button" onClick={() => set(m.id, { status: k })}
                    style={{ flex: 1, padding: "9px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                      border: a.status === k ? `2px solid ${c}` : "1px solid #cbd5e1", background: a.status === k ? `${c}12` : "#fff", color: a.status === k ? c : "#334155" }}>{t}</button>
                ))}
              </div>

              {a.status === "FINALIZADO" && (
                <>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#576D7E", margin: "0 0 3px" }}>Data em que foi finalizado *</label>
                  <input type="date" value={a.dataConclusao || ""} onChange={(e) => set(m.id, { dataConclusao: e.target.value })} style={{ ...inp, marginBottom: 8 }} />
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#576D7E", margin: "0 0 3px" }}>Evidência — o que aconteceu para concluir (e quando) *</label>
                  <textarea value={a.evidencia || ""} onChange={(e) => set(m.id, { evidencia: e.target.value })} rows={3} placeholder="Ex.: peças liberadas na inspeção do dia 12/07, romaneio 452 emitido…" style={inp} />
                </>
              )}
              {a.status === "NAO_FINALIZADO" && (
                <>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#576D7E", margin: "0 0 3px" }}>Nova data prevista de conclusão *</label>
                  <input type="date" value={a.novaData || ""} onChange={(e) => set(m.id, { novaData: e.target.value })} style={{ ...inp, marginBottom: 8 }} />
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#576D7E", margin: "0 0 3px" }}>Motivo (opcional)</label>
                  <textarea value={a.evidencia || ""} onChange={(e) => set(m.id, { evidencia: e.target.value })} rows={2} placeholder="Por que atrasou / o que falta" style={inp} />
                </>
              )}
            </div>
          );
        })}

        {marcos.length === 0 && <p style={{ fontSize: 13, color: "#576D7E" }}>Nenhum marco nesta cobrança.</p>}
        {erro && <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 10px" }}>{erro}</p>}

        <button type="button" onClick={enviar} disabled={enviando || marcos.length === 0}
          style={{ width: "100%", padding: 12, fontSize: 15, fontWeight: 700, color: "#fff", background: "#006EAB", border: "none", borderRadius: 8, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.6 : 1 }}>
          {enviando ? "Enviando…" : "Enviar resposta"}
        </button>
      </div>
    </Wrap>
  );
}
