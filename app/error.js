"use client";
import { useEffect } from "react";

// Error boundary de segmento: substitui o "Application error" cru por uma tela amigável,
// com a mensagem técnica (útil pra suporte) e botões de recuperar/recarregar.
export default function Error({ error, reset }) {
  useEffect(() => { console.error("[app/error]", error); }, [error]);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#f5f7fa", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 460, width: "100%", background: "#fff", borderRadius: 16, boxShadow: "0 10px 40px rgba(0,0,0,.08)", padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#002945", margin: "0 0 6px" }}>Algo deu errado</h1>
        <p style={{ color: "#576d7e", fontSize: 14, margin: "0 0 18px" }}>Não foi possível carregar esta tela. Tente novamente.</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => reset()} style={{ background: "#006eab", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Tentar novamente</button>
          <button onClick={() => (typeof window !== "undefined" ? window.location.reload() : null)} style={{ background: "#fff", color: "#002945", border: "1px solid #d5dde5", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Recarregar página</button>
        </div>
        {(error?.message || error?.digest) && (
          <details style={{ marginTop: 18, textAlign: "left" }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#8496ad" }}>Detalhes técnicos</summary>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, color: "#c0392b", background: "#fdf0ef", border: "1px solid #f6d3ce", borderRadius: 8, padding: 10 }}>{error?.message || ""}{error?.digest ? `\n(digest: ${error.digest})` : ""}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
