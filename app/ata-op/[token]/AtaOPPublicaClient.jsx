"use client";
import { useState, useEffect } from "react";

const C = { navy: "#0D1F3C", orange: "#F4801F", blue: "#006EAB", dark: "#00263F", gray: "#5C7285", bg: "#EEF3F8" };
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const nn = (n) => String(n).padStart(2, "0");

export default function AtaOPPublicaClient({ token }) {
  const [a, setA] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [aceitando, setAceitando] = useState(false);
  const [aceito, setAceito] = useState(false);

  const carregar = () => { setLoading(true); fetch(`/api/ata-op/${token}`).then((r) => r.json()).then((j) => { if (j.success) setA(j.ata); else setErro(j.error); }).catch(() => setErro("Não foi possível carregar.")).finally(() => setLoading(false)); };
  useEffect(() => { carregar(); }, [token]);

  async function aceitar() {
    if (!nome.trim()) { setErro("Informe seu nome."); return; }
    setAceitando(true); setErro("");
    try {
      const r = await fetch(`/api/ata-op/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      setAceito(true); carregar();
    } catch (e) { setErro(e.message); } finally { setAceitando(false); }
  }

  const wrap = { minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "Arial, sans-serif" };
  if (loading) return <div style={wrap}><p style={{ color: C.gray, marginTop: 60 }}>carregando…</p></div>;
  if (erro && !a) return <div style={wrap}><div style={{ background: "#fff", borderRadius: 12, padding: 24, marginTop: 40, color: "#b91c1c" }}>{erro}</div></div>;

  const cj = a.conteudoJson || {};
  const jaAceito = !!a.aceiteEm || aceito;

  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={{ background: C.navy, color: "#fff", borderRadius: "12px 12px 0 0", padding: "22px 24px" }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Torg Metal — Ata de reunião</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.85 }}>OP-{nn(a.opNumero)} · ATA #{nn(a.numero)}{a.obra ? ` · ${a.obra}` : ""}</p>
        </div>
        <div style={{ height: 4, background: C.orange }} />
        <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: 24 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 17, color: C.dark }}>{a.titulo}</h2>
          <p style={{ margin: 0, fontSize: 12, color: C.gray }}>{a.dataReuniao ? `Reunião em ${fmtD(a.dataReuniao)}` : ""}{a.participantes ? ` · ${a.participantes}` : ""}</p>

          {cj.resumo && <p style={{ fontSize: 14, color: C.dark, marginTop: 16, lineHeight: 1.55 }}>{cj.resumo}</p>}
          {!cj.resumo && a.pauta && <p style={{ fontSize: 14, color: C.dark, marginTop: 16, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{a.pauta}</p>}

          {cj.topicos?.length > 0 && (<>
            <h3 style={{ fontSize: 14, color: C.navy, marginTop: 18, marginBottom: 0 }}>Tópicos</h3>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: C.dark, lineHeight: 1.5 }}>{cj.topicos.map((t, i) => <li key={i} style={{ marginBottom: 4 }}><b>{t.titulo}</b>{t.discussao ? ` — ${t.discussao}` : ""}</li>)}</ul>
          </>)}
          {cj.acoes?.length > 0 && (<>
            <h3 style={{ fontSize: 14, color: C.navy, marginTop: 18, marginBottom: 0 }}>Ações e pendências</h3>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: C.dark, lineHeight: 1.5 }}>{cj.acoes.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x.descricao}{x.responsavel ? ` · ${x.responsavel}` : ""}{x.prazo ? ` · prazo ${fmtD(x.prazo)}` : ""}</li>)}</ul>
          </>)}

          <div style={{ marginTop: 24, borderTop: "1px solid #E2E9F0", paddingTop: 18 }}>
            {jaAceito ? (
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 14, color: "#047857", fontSize: 14 }}>✅ Ata aceita por <b>{a.aceiteNome || nome}</b>{a.aceiteEm ? ` em ${fmtDT(a.aceiteEm)}` : ""}. Obrigado!</div>
            ) : (<>
              <p style={{ fontSize: 13, color: C.dark, marginBottom: 10 }}>Revisou as informações acima? Registre o seu <b>aceite</b>:</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" style={{ flex: 1, minWidth: 200, padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box" }} />
                <button onClick={aceitar} disabled={aceitando} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, padding: "10px 22px", cursor: "pointer", opacity: aceitando ? 0.6 : 1 }}>{aceitando ? "registrando…" : "Aceitar a ata"}</button>
              </div>
              {erro && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{erro}</p>}
            </>)}
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 11, color: C.gray, marginTop: 14 }}>Torg Metal · Estruturas Metálicas</p>
      </div>
    </div>
  );
}
