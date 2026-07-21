"use client";
import { useState, useEffect } from "react";

const C = { navy: "#0D1F3C", orange: "#F4801F", blue: "#006EAB", dark: "#00263F", gray: "#5C7285", line: "#E2E9F0", bg: "#EEF3F8", soft: "#F5F8FB" };
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

  const wrap = { minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "Arial, Helvetica, sans-serif" };
  if (loading) return <div style={wrap}><p style={{ color: C.gray, marginTop: 60 }}>carregando…</p></div>;
  if (erro && !a) return <div style={wrap}><div style={{ background: "#fff", borderRadius: 12, padding: 24, marginTop: 40, color: "#b91c1c" }}>{erro}</div></div>;

  const cj = a.conteudoJson || {};
  const anexos = Array.isArray(a.anexos) ? a.anexos : [];
  const jaAceito = !!a.aceiteEm || aceito;
  const obraLinha = [a.obra, a.cliente].filter(Boolean).join(" · ");

  const sectionH = { fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: C.gray, fontWeight: 700, margin: "22px 0 8px" };

  return (
    <div style={wrap}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        {/* Cabeçalho */}
        <div style={{ background: C.navy, color: "#fff", borderRadius: "12px 12px 0 0", padding: "22px 26px" }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>Torg Metal · Estruturas Metálicas</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700 }}>Ata de Reunião</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.9 }}>OP-{nn(a.opNumero)} · ATA #{nn(a.numero)}{obraLinha ? ` · ${obraLinha}` : ""}</p>
        </div>
        <div style={{ height: 4, background: C.orange }} />

        {/* Corpo */}
        <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: "26px 28px", boxShadow: "0 1px 3px rgba(13,31,60,.06)" }}>
          {a.titulo && <h2 style={{ margin: "0 0 14px", fontSize: 19, color: C.dark, lineHeight: 1.3 }}>{a.titulo}</h2>}

          {/* Metadados */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
            <MetaRow label="Reunião" value={a.dataReuniao ? fmtD(a.dataReuniao) : "—"} />
            <MetaRow label="Participantes" value={a.participantes || "—"} />
            {obraLinha && <MetaRow label="Obra / Cliente" value={obraLinha} last />}
          </div>

          {/* Resumo */}
          {cj.resumo && (<>
            <p style={sectionH}>Resumo</p>
            <div style={{ borderLeft: `3px solid ${C.orange}`, background: C.soft, borderRadius: "0 8px 8px 0", padding: "12px 16px", fontSize: 14, color: C.dark, lineHeight: 1.6 }}>{cj.resumo}</div>
          </>)}
          {!cj.resumo && a.pauta && (<>
            <p style={sectionH}>Pauta</p>
            <div style={{ fontSize: 14, color: C.dark, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{a.pauta}</div>
          </>)}

          {/* Tópicos */}
          {cj.topicos?.length > 0 && (<>
            <p style={sectionH}>Tópicos discutidos</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cj.topicos.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: C.navy, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.dark }}>{t.titulo}</p>
                    {t.discussao && <p style={{ margin: "3px 0 0", fontSize: 13, color: C.gray, lineHeight: 1.55 }}>{t.discussao}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {/* Ações */}
          {cj.acoes?.length > 0 && (<>
            <p style={sectionH}>Ações e pendências</p>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.navy, color: "#fff" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Ação</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>Responsável</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {cj.acoes.map((x, i) => (
                    <tr key={i} style={{ background: i % 2 ? C.soft : "#fff", borderTop: `1px solid ${C.line}` }}>
                      <td style={{ padding: "8px 12px", color: C.dark, lineHeight: 1.45 }}>{x.descricao}</td>
                      <td style={{ padding: "8px 12px", color: C.gray, whiteSpace: "nowrap" }}>{x.responsavel || "—"}</td>
                      <td style={{ padding: "8px 12px", color: C.gray, whiteSpace: "nowrap" }}>{x.prazo ? fmtD(x.prazo) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* Anexos */}
          {anexos.length > 0 && (<>
            <p style={sectionH}>Anexos</p>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
              {anexos.map((a2, i) => (
                <a key={a2.seq ?? i} href={a2.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", fontSize: 13, color: C.blue, textDecoration: "none", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: C.gray }}>#{nn(a2.seq ?? i + 1)}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a2.nome}</span>
                  <span style={{ fontSize: 11, color: C.gray, whiteSpace: "nowrap" }}>abrir ↗</span>
                </a>
              ))}
            </div>
          </>)}

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
        </div>
        <p style={{ textAlign: "center", fontSize: 11, color: C.gray, marginTop: 16 }}>Torg Metal · Estruturas Metálicas — este link é exclusivo desta ata.</p>
      </div>
    </div>
  );
}

function MetaRow({ label, value, last }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "9px 14px", borderBottom: last ? "none" : "1px solid #E2E9F0" }}>
      <span style={{ width: 118, flexShrink: 0, fontSize: 12, color: "#5C7285", fontWeight: 600, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 14, color: "#00263F", lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}
