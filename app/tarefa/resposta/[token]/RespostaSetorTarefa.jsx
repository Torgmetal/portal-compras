"use client";
import { useState, useEffect } from "react";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function RespostaSetorTarefa({ token }) {
  const [tarefa, setTarefa] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [autorNome, setAutorNome] = useState("");
  const [acao, setAcao] = useState("");
  const [novaData, setNovaData] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    fetch(`/api/tarefa/resposta/${token}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setTarefa(j.tarefa); else setErro(j.error || "Link inválido."); })
      .catch(() => setErro("Não foi possível carregar."))
      .finally(() => setLoading(false));
  }, [token]);

  async function enviar() {
    setErro("");
    if (!autorNome.trim()) return setErro("Informe seu nome.");
    if (!acao) return setErro("Escolha uma opção de resposta.");
    if (acao === "nova_data" && !novaData) return setErro("Informe a nova data.");
    if (acao === "comentario" && !comentario.trim()) return setErro("Escreva um comentário.");
    setEnviando(true);
    try {
      const r = await fetch(`/api/tarefa/resposta/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autorNome: autorNome.trim(), acao, novaData: acao === "nova_data" ? novaData : null, comentario: comentario.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao enviar.");
      setPronto(true);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  const Wrap = ({ children }) => (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>{children}</div>
    </div>
  );

  if (loading) return <Wrap><p style={{ textAlign: "center", color: "#576D7E", marginTop: 60 }}>carregando…</p></Wrap>;
  if (erro && !tarefa) return <Wrap><div style={{ background: "#fff", borderRadius: 12, padding: 28, textAlign: "center", color: "#b91c1c" }}>{erro}</div></Wrap>;

  const op = tarefa.opNumero ? `OP-${String(tarefa.opNumero).padStart(3, "0")}` : null;

  return (
    <Wrap>
      <div style={{ background: "#006EAB", color: "#fff", padding: "18px 22px", borderRadius: "12px 12px 0 0" }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Responder tarefa</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.9 }}>Torg Metal — Planejamento {tarefa.setorLabel ? `· ${tarefa.setorLabel}` : ""}</p>
      </div>
      <div style={{ background: "#fff", padding: 22, border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
        <div style={{ background: "#f8fafc", border: "1px solid #eef1f4", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#002945" }}>{tarefa.titulo}</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#576D7E" }}>
            {op ? `${op}${tarefa.cliente ? ` — ${tarefa.cliente}` : ""} · ` : ""}Prazo: <b>{fmt(tarefa.prazo)}</b> · {tarefa.status}
          </p>
          {tarefa.descricao && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#334155" }}>{tarefa.descricao}</p>}
        </div>

        {pronto ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: 40, margin: 0 }}>✅</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#059669", margin: "8px 0 0" }}>Resposta registrada!</p>
            <p style={{ fontSize: 13, color: "#576D7E", margin: "6px 0 0" }}>O Planejamento já foi avisado. Pode fechar esta página.</p>
          </div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#002945", marginBottom: 4 }}>Seu nome</label>
            <input value={autorNome} onChange={(e) => setAutorNome(e.target.value)} placeholder="Quem está respondendo" style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14 }} />

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#002945", marginBottom: 6 }}>Sua resposta</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {[
                { k: "concluido", t: "✅ Já concluímos", c: "#059669" },
                { k: "nova_data", t: "🗓️ Informar nova data", c: "#F4801F" },
                { k: "comentario", t: "💬 Só comentar", c: "#006EAB" },
              ].map((o) => (
                <button key={o.k} type="button" onClick={() => setAcao(o.k)}
                  style={{ textAlign: "left", padding: "11px 14px", fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                    border: acao === o.k ? `2px solid ${o.c}` : "1px solid #cbd5e1", background: acao === o.k ? `${o.c}12` : "#fff", color: acao === o.k ? o.c : "#334155" }}>
                  {o.t}
                </button>
              ))}
            </div>

            {acao === "nova_data" && (
              <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12 }} />
            )}
            {acao && (
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} placeholder={acao === "comentario" ? "Escreva seu comentário" : "Comentário (opcional)"} style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 12 }} />
            )}

            {erro && <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 10px" }}>{erro}</p>}

            <button type="button" onClick={enviar} disabled={enviando}
              style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#006EAB", border: "none", borderRadius: 8, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.6 : 1 }}>
              {enviando ? "Enviando…" : "Enviar resposta"}
            </button>
          </>
        )}

        {tarefa.respostas?.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #eef1f4" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#576D7E", margin: "0 0 8px" }}>Respostas anteriores</p>
            {tarefa.respostas.map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: "#334155", padding: "6px 0", borderBottom: i < tarefa.respostas.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <b>{r.autorNome || "—"}</b> · {r.texto} <span style={{ color: "#9aa5b1" }}>· {fmtDT(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Wrap>
  );
}
