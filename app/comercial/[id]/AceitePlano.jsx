"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Send, CheckCircle2, Clock, Mail, Plus, X, AlertCircle, FileText, Save, Lock, FolderCheck } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * O caminho de um plano da obra (PIT ou PLP) até valer: elaborar → verificar → aceite do cliente.
 *
 * Vitor (26/08/2026): "precisa permitir gerar um PDF antes de enviar para vermos a formatação, e
 * deixar o campo de elaborado e verificado para poder ser preenchido e enviar para esses e-mails
 * antes, para depois ir até o cliente — isso vale para o PLP também".
 *
 * ⚠ A ORDEM É TRAVA, NÃO SUGESTÃO. O botão do cliente só abre depois da verificação interna
 * assinada NA MESMA REVISÃO — e o servidor recusa igual, porque esconder o botão não impede um
 * POST. Documento que chega ao cliente sem passar por quem elabora e verifica não tem volta.
 */
export default function AceitePlano({ opNumero, doc, nome }) {
  const [d, setD] = useState(null);
  const [resp, setResp] = useState({ elaboradoNome: "", elaboradoEmail: "", verificadoNome: "", verificadoEmail: "" });
  const [salvandoResp, setSalvandoResp] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const [marcados, setMarcados] = useState(() => new Set());
  const [novo, setNovo] = useState({ nome: "", email: "" });
  const [enviando, setEnviando] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(() => {
    fetch(`/api/qualidade/planos/${encodeURIComponent(opNumero)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return;
        setD(j);
        setMarcados(new Set((j.contatos || []).map((c) => c.email)));
        const r = j.responsaveis?.[doc];
        if (r) {
          setResp({
            elaboradoNome: r.elaborado?.nome || "", elaboradoEmail: r.elaborado?.email || "",
            verificadoNome: r.verificado?.nome || "", verificadoEmail: r.verificado?.email || "",
          });
        }
      })
      .catch(() => {});
  }, [opNumero, doc]);
  useEffect(() => { carregar(); }, [carregar]);

  const st = d?.status?.[doc];
  const interna = st?.interna;
  const cliente = st?.cliente;
  const r = d?.responsaveis?.[doc];
  const temResponsaveis = !!(resp.elaboradoNome && resp.elaboradoEmail && resp.verificadoNome && resp.verificadoEmail);

  async function salvarResp() {
    setSalvandoResp(true); setErro(""); setOk("");
    try {
      const rq = await fetch(`/api/qualidade/planos/${encodeURIComponent(opNumero)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, ...resp }),
      });
      const j = await rq.json();
      if (!rq.ok) throw new Error(j.error || "Erro ao salvar");
      setOk("Responsáveis salvos.");
      carregar();
    } catch (e) { setErro(e.message); } finally { setSalvandoResp(false); }
  }

  async function enviar(etapa) {
    setEnviando(etapa); setErro(""); setOk("");
    const escolhidos = etapa === "CLIENTE"
      ? [
          ...(d?.contatos || []).filter((c) => marcados.has(c.email)).map((c) => ({ nome: c.nome || c.email, email: c.email, setor: d?.cliente || null })),
          ...(novo.email.trim() ? [{ nome: novo.nome.trim() || novo.email.trim(), email: novo.email.trim(), setor: d?.cliente || null }] : []),
        ]
      : [];
    try {
      const rq = await fetch(`/api/qualidade/planos/${encodeURIComponent(opNumero)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, etapa, destinatarios: escolhidos }),
      });
      const j = await rq.json();
      if (!rq.ok) throw new Error(j.error || "Erro ao enviar");
      setOk(`${j.numero} enviado para ${j.enviados} de ${j.total} destinatário(s).`);
      setAbrir(false); setNovo({ nome: "", email: "" });
      carregar();
    } catch (e) { setErro(e.message); } finally { setEnviando(""); }
  }

  if (!d) return <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> lendo o aceite…</p>;

  const Campo = ({ rot, k }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-torg-gray-light w-20 shrink-0">{rot}</span>
      <input value={resp[`${k}Nome`]} onChange={(e) => setResp((v) => ({ ...v, [`${k}Nome`]: e.target.value }))} placeholder="Nome"
        className="text-[11px] border border-gray-200 rounded px-2 py-1 w-36 outline-none focus:border-torg-blue" />
      <input value={resp[`${k}Email`]} onChange={(e) => setResp((v) => ({ ...v, [`${k}Email`]: e.target.value }))} placeholder="e-mail" type="email"
        className="text-[11px] border border-gray-200 rounded px-2 py-1 flex-1 outline-none focus:border-torg-blue" />
      {r?.[k === "elaborado" ? "elaborado" : "verificado"]?.assinadoEm && (
        <span className="text-[10px] text-emerald-700 shrink-0 inline-flex items-center gap-1">
          <CheckCircle2 size={11} /> {fmtDT(r[k === "elaborado" ? "elaborado" : "verificado"].assinadoEm)}
        </span>
      )}
    </div>
  );

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
      {/* ── quem elabora e quem verifica ── */}
      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-torg-dark">Elaboração e verificação</p>
        <Campo rot="Elaborado" k="elaborado" />
        <Campo rot="Verificado" k="verificado" />
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={salvarResp} disabled={salvandoResp}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {salvandoResp ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Salvar
          </button>
          {/* ⚠ conferir a formatação ANTES de enviar — sai marcado como MINUTA enquanto não foi. */}
          <a href={`/api/qualidade/planos/${encodeURIComponent(opNumero)}/pdf?doc=${doc}`} target="_blank" rel="noreferrer"
            className="text-[11px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
            <FileText size={11} /> Ver o PDF
          </a>
        </div>
      </div>

      {/* ── etapa 1: verificação interna ── */}
      <div className="space-y-1.5">
        {interna?.aceito ? (
          <p className="text-[12px] text-emerald-700 inline-flex items-start gap-1.5">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span><b>Verificado internamente</b> — {interna.assinantes.filter((a) => a.assinadoEm).map((a) => `${a.nome} (${a.papel})`).join(" · ")}</span>
          </p>
        ) : interna?.enviado ? (
          <p className="text-[12px] text-amber-700 inline-flex items-start gap-1.5">
            <Clock size={14} className="mt-0.5 shrink-0" />
            <span><b>Em verificação interna</b> — falta {interna.pendentes.join(" e ")}</span>
          </p>
        ) : (
          <p className="text-[12px] text-torg-gray inline-flex items-start gap-1.5">
            <Mail size={14} className="mt-0.5 shrink-0" />
            <span>Passo 1: enviar para quem elabora e quem verifica assinarem.</span>
          </p>
        )}
        <button onClick={() => enviar("INTERNA")} disabled={!!enviando || !temResponsaveis}
          title={temResponsaveis ? "" : "Preencha nome e e-mail de quem elabora e de quem verifica"}
          className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 disabled:opacity-40 inline-flex items-center gap-1.5">
          {enviando === "INTERNA" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {interna?.enviado ? "Enviar de novo para verificação" : "Enviar para verificação interna"}
        </button>
      </div>

      {/* ── etapa 2: aceite do cliente ── */}
      <div className="space-y-1.5">
        {cliente?.aceito ? (
          <p className="text-[12px] text-emerald-700 inline-flex items-start gap-1.5">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span><b>Aceito pelo cliente</b> — {cliente.aceitoPor} em {fmtDT(cliente.aceitoEm)} · revisão R{String(cliente.revisao ?? 0).padStart(2, "0")}</span>
          </p>
        ) : cliente?.enviado ? (
          <p className="text-[12px] text-amber-700 inline-flex items-start gap-1.5">
            <Clock size={14} className="mt-0.5 shrink-0" />
            <span><b>Aguardando aceite</b> — enviado em {fmtDT(cliente.enviadoEm)} para {cliente.pendentes.join(", ")}</span>
          </p>
        ) : (
          <p className="text-[12px] text-torg-gray inline-flex items-start gap-1.5">
            {interna?.aceito ? <Mail size={14} className="mt-0.5 shrink-0" /> : <Lock size={14} className="mt-0.5 shrink-0 text-torg-gray-light" />}
            <span>Passo 2: {interna?.aceito ? `enviar ${nome} ao cliente para aceite.` : "libera quando a verificação interna estiver assinada."}</span>
          </p>
        )}

        {!abrir ? (
          <button onClick={() => setAbrir(true)} disabled={!interna?.aceito}
            title={interna?.aceito ? "" : "A verificação interna precisa estar assinada"}
            className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5">
            <Send size={12} /> {cliente?.enviado ? "Enviar de novo ao cliente" : "Enviar ao cliente para aceite"}
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
            <button onClick={() => enviar("CLIENTE")} disabled={!!enviando}
              className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
              {enviando === "CLIENTE" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Enviar por e-mail
            </button>
          </div>
        )}
      </div>

      {/* ⚠ arquivado sozinho quando todos aprovam — ver arquivarPlano em lib/planos-aceite. */}
      {interna?.aceito && cliente?.aceito && (
        <p className="text-[11px] text-emerald-700 inline-flex items-start gap-1.5">
          <FolderCheck size={12} className="mt-0.5 shrink-0" />
          Aprovado por todos: o documento foi guardado em <span className="font-mono">8. Qualidade</span> e anexado ao Data Book.
        </p>
      )}

      {erro && <p className="text-[11px] text-red-600 inline-flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0" /> {erro}</p>}
      {ok && <p className="text-[12px] text-emerald-700">{ok}</p>}
    </div>
  );
}
