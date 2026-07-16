"use client";
import { useState, useEffect, useCallback } from "react";
import { situacaoAtividade, SITUACAO_LABEL, respondida as jaRespondida } from "@/lib/ata-status";

const SETOR_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", PRODUCAO: "Produção", PCP: "PCP", PLANEJAMENTO: "Planejamento", EXPEDICAO: "Expedição", QUALIDADE: "Qualidade", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", DIRETORIA: "Diretoria" };
const sl = (s) => SETOR_LABEL[s] || s || "—";
const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const opNum = (a) => { const n = parseInt(String(a?.op || "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : Infinity; };
const ordenarPorOp = (list) => (list || []).slice().sort((a, b) => opNum(a) - opNum(b));
function agrupaPorOp(atvs) {
  const map = new Map();
  for (const a of ordenarPorOp(atvs)) { const k = a.op || ""; if (!map.has(k)) map.set(k, []); map.get(k).push(a); }
  return [...map.entries()];
}

const C = { blue: "#006EAB", dark: "#002945", gray: "#576D7E", bg: "#f1f5f9", line: "#e5e7eb", green: "#059669", amber: "#d97706" };

// cores por SITUAÇÃO (atrasada é derivada do prazo — ver lib/ata-status.js)
const STATUS_COR = {
  PENDENTE: { bg: "#fef3c7", fg: "#92400e", card: "#fafafa", borda: "#e5e7eb" },
  ATRASADA: { bg: "#fee2e2", fg: "#b91c1c", card: "#fef2f2", borda: "#fecaca" },
  EM_ANDAMENTO: { bg: "#dbeafe", fg: "#1e40af", card: "#eff6ff", borda: "#bfdbfe" },
  CONCLUIDA: { bg: "#d1fae5", fg: "#065f46", card: "#f0fdf4", borda: "#a7f3d0" },
};
const stc = (s) => STATUS_COR[s] || STATUS_COR.PENDENTE;
const stl = (s) => SITUACAO_LABEL[s] || SITUACAO_LABEL.PENDENTE;

export default function AtaPublicaClient({ token }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [nome, setNome] = useState("");
  const [resp, setResp] = useState({}); // { [atvId]: { resposta, evidencia } }
  const [enviandoId, setEnviandoId] = useState("");
  const [msgId, setMsgId] = useState("");
  const [editando, setEditando] = useState({}); // { [atvId]: true } — reabre o form de uma já respondida

  const carregar = useCallback(() => {
    fetch(`/api/ata/${token}`).then((r) => r.json()).then((j) => {
      if (j.success) setDados(j); else setErro(j.error || "Link inválido.");
    }).catch(() => setErro("Não foi possível carregar.")).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { carregar(); }, [carregar]);

  const setR = (id, patch) => setResp((r) => ({ ...r, [id]: { ...(r[id] || {}), ...patch } }));

  async function confirmar() {
    setConfirmando(true); setErro("");
    try {
      const r = await fetch(`/api/ata/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "confirmar" }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao confirmar.");
      setLoading(true); carregar();
    } catch (e) { setErro(e.message); } finally { setConfirmando(false); }
  }

  const abrirEdicao = (atv) => {
    setR(atv.id, { resposta: atv.resposta || "", evidencia: atv.evidencia || "", status: atv.status === "CONCLUIDA" ? "CONCLUIDA" : "EM_ANDAMENTO" });
    setEditando((e) => ({ ...e, [atv.id]: true }));
  };

  async function responder(atv) {
    const a = resp[atv.id] || {};
    if (!(a.resposta || "").trim() && !(a.evidencia || "").trim()) { setMsgId(atv.id + ":erro"); return; }
    setEnviandoId(atv.id); setMsgId("");
    try {
      const r = await fetch(`/api/ata/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "responder", atividadeId: atv.id, resposta: a.resposta || "", evidencia: a.evidencia || "", respondidoPor: nome || "", status: a.status || "EM_ANDAMENTO" }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao enviar.");
      setEditando((e) => ({ ...e, [atv.id]: false }));
      carregar();
    } catch (e) { alert(e.message); } finally { setEnviandoId(""); }
  }

  const Wrap = ({ children }) => (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 640 }}>{children}</div>
    </div>
  );
  const card = { background: "#fff", borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06)" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8 };

  if (loading) return <Wrap><p style={{ textAlign: "center", color: C.gray, marginTop: 60 }}>carregando…</p></Wrap>;
  if (erro && !dados) return <Wrap><div style={{ ...card, textAlign: "center", color: "#b91c1c", marginTop: 40 }}>{erro}</div></Wrap>;

  const { ata, confirmacao } = dados;
  const confirmado = !!confirmacao.confirmadoEm;

  const Header = (
    <div style={{ background: C.blue, color: "#fff", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, letterSpacing: .5 }}>{ata.codigo}</span>
        <span style={{ fontSize: 12, opacity: .9 }}>Semana ISO {ata.semanaIso}/{ata.ano}</span>
      </div>
      <h1 style={{ margin: "8px 0 4px", fontSize: 20 }}>{ata.titulo}</h1>
      <p style={{ margin: 0, fontSize: 13, opacity: .9 }}>Torg Metal · Reunião em {fmt(ata.dataReuniao)}</p>
    </div>
  );

  // Gate: ainda não confirmou o recebimento
  if (!confirmado) return (
    <Wrap>
      {Header}
      <div style={{ ...card, textAlign: "center" }}>
        <p style={{ fontSize: 40, margin: "4px 0 8px" }}>📋</p>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: C.dark }}>Confirme o recebimento</h2>
        <p style={{ fontSize: 14, color: C.gray, lineHeight: 1.5, margin: "0 auto 20px", maxWidth: 440 }}>
          {confirmacao.nome ? <>Olá, <b>{confirmacao.nome}</b>. </> : null}
          Você está entre os envolvidos nesta ata de reunião{confirmacao.setor ? <> pelo setor <b>{sl(confirmacao.setor)}</b></> : null}. Ao confirmar, você terá acesso ao conteúdo completo e poderá preencher as atividades do seu setor com as informações e evidências.
        </p>
        {erro && <p style={{ color: "#b91c1c", fontSize: 13 }}>{erro}</p>}
        <button onClick={confirmar} disabled={confirmando} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, padding: "12px 28px", cursor: "pointer", opacity: confirmando ? .6 : 1 }}>
          {confirmando ? "confirmando…" : "Confirmar recebimento e abrir a ata"}
        </button>
      </div>
    </Wrap>
  );

  // Confirmado: ata completa
  const envolvidos = Array.isArray(ata.envolvidos) ? ata.envolvidos : [];
  const atividades = ordenarPorOp(Array.isArray(ata.atividades) ? ata.atividades : []);
  const nMeuSetor = atividades.filter((a) => a.meuSetor).length;
  const nOk = atividades.filter((a) => a.status === "CONCLUIDA").length;

  return (
    <Wrap>
      {Header}
      <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>✅ Recebimento confirmado em {fmtDT(confirmacao.confirmadoEm)}.</span>
        <a href={`/api/ata/${token}/pdf`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", background: C.blue, color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, whiteSpace: "nowrap" }}>Baixar ata em PDF</a>
      </div>

      {ata.pauta && (
        <div style={card}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, color: C.dark }}>Pauta</h3>
          <p style={{ margin: 0, fontSize: 14, color: C.dark, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{ata.pauta}</p>
        </div>
      )}

      <div style={card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, color: C.dark }}>Envolvidos ({envolvidos.length})</h3>
        {envolvidos.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 0", borderBottom: i < envolvidos.length - 1 ? `1px solid ${C.line}` : "none" }}>
            <span style={{ fontWeight: 600, color: C.dark, minWidth: 150 }}>{e.nome || "—"}</span>
            <span style={{ color: C.gray, flex: 1 }}>{e.email}</span>
            <span style={{ fontSize: 11, background: "#f1f5f9", color: C.gray, padding: "2px 8px", borderRadius: 6 }}>{sl(e.setor)}</span>
          </div>
        ))}
      </div>

      {/* Atividades por OP — qualquer envolvido que confirmou pode preencher */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, color: C.dark }}>Atividades por OP</h3>
          <span style={{ fontSize: 12, color: C.gray }}>{nOk}/{atividades.length} respondidas</span>
        </div>
        <p style={{ margin: "6px 0 14px", fontSize: 12, color: C.gray, lineHeight: 1.5 }}>
          Preencha a informação e a evidência de cada atividade.{" "}
          {nMeuSetor > 0
            ? <>As do seu setor (<b>{sl(confirmacao.setor)}</b>) estão destacadas, mas você pode responder qualquer uma.</>
            : <>Você pode responder qualquer atividade da ata.</>}
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: C.dark, fontWeight: 600, display: "block", marginBottom: 4 }}>Seu nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Quem está respondendo" style={{ ...inp, maxWidth: 280 }} />
        </div>

        {agrupaPorOp(atividades).map(([op, itens]) => {
          const gOk = itens.filter((x) => x.status === "RESPONDIDO").length;
          return (
            <div key={op || "_"} style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#eff6ff", borderBottom: "1px solid #dbeafe" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{op ? `OP ${op}` : "Sem OP"}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: gOk === itens.length ? "#d1fae5" : "#fef3c7", color: gOk === itens.length ? "#065f46" : "#92400e" }}>{gOk}/{itens.length} ok</span>
              </div>
              <div style={{ padding: 12 }}>
                {itens.map((a) => {
                  const sKey = situacaoAtividade(a, ata);
                  const respondida = jaRespondida(a);
                  const aberto = !respondida || editando[a.id];
                  const cur = resp[a.id] || {};
                  const cor = stc(sKey);
                  return (
                    <div key={a.id} style={{ border: `1px solid ${!respondida && sKey === "PENDENTE" && a.meuSetor ? "#bfdbfe" : cor.borda}`, background: !respondida && sKey === "PENDENTE" && a.meuSetor ? "#f8fbff" : cor.card, borderRadius: 10, padding: 13, marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <p style={{ margin: 0, fontSize: 14, color: C.dark, fontWeight: 600, lineHeight: 1.4 }}>{a.descricao}</p>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap", background: cor.bg, color: cor.fg }}>{stl(sKey)}</span>
                      </div>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: C.gray }}>
                        {a.meuSetor && <span style={{ background: "#dbeafe", color: "#1e40af", fontWeight: 700, padding: "2px 7px", borderRadius: 20, marginRight: 6 }}>seu setor</span>}
                        {a.origemAtaNumero != null && <span style={{ background: "#f3e8ff", color: "#6b21a8", fontWeight: 700, padding: "2px 7px", borderRadius: 20, marginRight: 6 }}>em aberto desde a ATA-{String(a.origemAtaNumero).padStart(3, "0")}</span>}
                        {[a.setor ? sl(a.setor) : "sem setor", a.responsavel || null, a.prazo ? `prazo ${fmt(a.prazo)}` : null].filter(Boolean).join(" · ")}
                      </p>

                      {respondida && !aberto && (
                        <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${cor.borda}`, fontSize: 13 }}>
                          {a.resposta && <p style={{ margin: "0 0 4px", color: C.dark, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.resposta}</p>}
                          {a.evidencia && <p style={{ margin: 0, color: C.gray, wordBreak: "break-all" }}>📎 {a.evidencia}</p>}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>{a.respondidoPor || "—"} · {fmtDT(a.respondidoEm)}</span>
                            <button onClick={() => abrirEdicao(a)} style={{ background: "none", border: "none", color: C.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }}>editar resposta</button>
                          </div>
                        </div>
                      )}

                      {aberto && (
                        <div style={{ marginTop: 10 }}>
                          <textarea value={cur.resposta || ""} onChange={(e) => setR(a.id, { resposta: e.target.value })} rows={2} placeholder="Informação / status da atividade" style={{ ...inp, marginBottom: 8, resize: "vertical" }} />
                          <input value={cur.evidencia || ""} onChange={(e) => setR(a.id, { evidencia: e.target.value })} placeholder="Evidência (link do arquivo, nº do documento, observação…)" style={{ ...inp, marginBottom: 8 }} />
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>Situação:</span>
                            {[{ v: "EM_ANDAMENTO", l: "Em andamento" }, { v: "CONCLUIDA", l: "Concluída" }].map((o) => {
                              const sel = (cur.status || "EM_ANDAMENTO") === o.v;
                              const oc = stc(o.v);
                              return (
                                <button key={o.v} type="button" onClick={() => setR(a.id, { status: o.v })}
                                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, cursor: "pointer", border: `1px solid ${sel ? oc.fg : C.line}`, background: sel ? oc.fg : "#fff", color: sel ? "#fff" : C.gray }}>
                                  {o.l}
                                </button>
                              );
                            })}
                          </div>
                          {msgId === a.id + ":erro" && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 6px" }}>Preencha a informação e/ou a evidência.</p>}
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button onClick={() => responder(a)} disabled={enviandoId === a.id} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer", opacity: enviandoId === a.id ? .6 : 1 }}>{enviandoId === a.id ? "enviando…" : respondida ? "Salvar alteração" : "Enviar resposta"}</button>
                            {respondida && <button onClick={() => setEditando((e) => ({ ...e, [a.id]: false }))} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.gray, fontSize: 13, padding: "8px 14px", cursor: "pointer" }}>cancelar</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "6px 0 24px" }}>Ata {ata.codigo} · Torg Metal · documento controlado (ISO)</p>
    </Wrap>
  );
}
