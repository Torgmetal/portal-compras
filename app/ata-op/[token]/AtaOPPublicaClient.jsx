"use client";
import { useState, useEffect } from "react";
import AtaDocumento from "@/components/comercial/AtaDocumento";

const C = { orange: "#F4801F", dark: "#00263F", gray: "#5C7285", line: "#E2E9F0", bg: "#EEF3F8" };
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

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

  const wrap = { minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "Arial, Helvetica, sans-serif" };
  if (loading) return <div style={wrap}><p style={{ color: C.gray, marginTop: 60 }}>carregando…</p></div>;
  if (erro && !a) return <div style={wrap}><div style={{ background: "#fff", borderRadius: 12, padding: 24, marginTop: 40, color: "#b91c1c" }}>{erro}</div></div>;

  const jaAceito = !!a.aceiteEm || aceito;

  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <AtaDocumento ata={a}>
          {/* Aceite */}
          <div style={{ marginTop: 26, borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
            {jaAceito ? (
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 16, color: "#047857", fontSize: 14 }}>✅ Ata <strong>aceita</strong> por <b>{a.aceiteNome || nome}</b>{a.aceiteEm ? ` em ${fmtDT(a.aceiteEm)}` : ""}. Obrigado!</div>
            ) : (<>
              <p style={{ fontSize: 14, color: C.dark, margin: "0 0 12px", lineHeight: 1.55 }}>Revisou as informações acima? Registre o seu <b>aceite</b> — isso confirma que você está de acordo com o conteúdo desta ata.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" style={{ flex: 1, minWidth: 220, padding: "11px 13px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box" }} />
                <button onClick={aceitar} disabled={aceitando} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, padding: "11px 24px", cursor: "pointer", opacity: aceitando ? 0.6 : 1 }}>{aceitando ? "registrando…" : "Aceitar a ata"}</button>
              </div>
              {erro && <p style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>{erro}</p>}
            </>)}
          </div>
        </AtaDocumento>
        <p style={{ textAlign: "center", fontSize: 11, color: C.gray, marginTop: 16 }}>Torg Metal · Estruturas Metálicas — este link é exclusivo desta ata.</p>
      </div>
    </div>
  );
}
