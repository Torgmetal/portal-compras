// Documento visual da ata (cabeçalho + metadados + resumo + tópicos + ações +
// anexos). Compartilhado entre a PÁGINA PÚBLICA (o cliente vê + aceita) e a
// PRÉVIA no editor (antes de enviar) — assim os dois nunca divergem. O slot
// `children` cai no rodapé do corpo branco (ex.: box de aceite ou nota da prévia).
const C = { navy: "#0D1F3C", orange: "#F4801F", blue: "#006EAB", dark: "#00263F", gray: "#5C7285", line: "#E2E9F0", soft: "#F5F8FB" };
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");
const nn = (n) => String(n ?? 0).padStart(2, "0");
const sectionH = { fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: C.gray, fontWeight: 700, margin: "22px 0 8px" };

function MetaRow({ label, value, last }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "9px 14px", borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <span style={{ width: 118, flexShrink: 0, fontSize: 12, color: C.gray, fontWeight: 600, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 14, color: C.dark, lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

export default function AtaDocumento({ ata, children }) {
  const cj = ata.conteudoJson || {};
  const anexos = Array.isArray(ata.anexos) ? ata.anexos : [];
  const obraLinha = [ata.obra, ata.cliente].filter(Boolean).join(" · ");
  const metaRows = [
    { label: "Reunião", value: ata.dataReuniao ? fmtD(ata.dataReuniao) : "—" },
    { label: "Participantes", value: ata.participantes || "—" },
  ];
  if (obraLinha) metaRows.push({ label: "Obra / Cliente", value: obraLinha });
  if (ata.refCliente) metaRows.push({ label: "Ref. do cliente", value: ata.refCliente });

  return (
    <>
      {/* Cabeçalho */}
      <div style={{ background: C.navy, color: "#fff", borderRadius: "12px 12px 0 0", padding: "22px 26px" }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>Torg Metal · Estruturas Metálicas</p>
        <h1 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 700 }}>Ata de Reunião</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.9 }}>OP-{nn(ata.opNumero)} · ATA #{nn(ata.numero)}{obraLinha ? ` · ${obraLinha}` : ""}</p>
      </div>
      <div style={{ height: 4, background: C.orange }} />

      {/* Corpo */}
      <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: "26px 28px", boxShadow: "0 1px 3px rgba(13,31,60,.06)" }}>
        {ata.titulo && <h2 style={{ margin: "0 0 14px", fontSize: 19, color: C.dark, lineHeight: 1.3 }}>{ata.titulo}</h2>}

        {/* Metadados */}
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          {metaRows.map((r, i) => <MetaRow key={r.label} label={r.label} value={r.value} last={i === metaRows.length - 1} />)}
        </div>

        {/* Resumo ou pauta bruta */}
        {cj.resumo ? (<>
          <p style={sectionH}>Resumo</p>
          <div style={{ borderLeft: `3px solid ${C.orange}`, background: C.soft, borderRadius: "0 8px 8px 0", padding: "12px 16px", fontSize: 14, color: C.dark, lineHeight: 1.6 }}>{cj.resumo}</div>
        </>) : ata.pauta ? (<>
          <p style={sectionH}>Pauta</p>
          <div style={{ fontSize: 14, color: C.dark, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{ata.pauta}</div>
        </>) : null}

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

        {children}
      </div>
    </>
  );
}
