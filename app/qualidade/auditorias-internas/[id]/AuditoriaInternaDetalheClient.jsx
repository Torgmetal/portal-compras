"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Loader2, FileDown, Send, Trash2, Plus, X, CheckCircle2, AlertCircle, Check, ImagePlus, Paperclip, Lock, Unlock, CircleDot } from "lucide-react";
import { numRAI, SETORES_AUDITORIA, TIPO_CONSTATACAO, TIPOS, STATUS_AI, statusAiLabel, acoesPendentes, podeFinalizar } from "@/lib/auditoria-interna";

const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Reduz a imagem no navegador (canvas → JPEG) — mantém Blob e PDF leves e só
// deixa JPG/PNG entrarem (HEIC/webp não vão pro pdf-lib).
async function reduzImagem(file, maxDim = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Formato não suportado — use JPG ou PNG")); img.src = url; });
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale); height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Falha ao processar a imagem");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export default function AuditoriaInternaDetalheClient({ id }) {
  const router = useRouter();
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [modalDiv, setModalDiv] = useState(false);

  // campos editáveis
  const [ident, setIdent] = useState({ setor: "", dataAuditoria: "", responsavelAcompanhamento: "", auditor: "", norma: "", escopo: "" });
  const [constatacoes, setConstatacoes] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [subindoFoto, setSubindoFoto] = useState(0);
  const [evidUp, setEvidUp] = useState({}); // { [indiceAcao]: nº subindo }
  const [conclusao, setConclusao] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/auditorias-internas/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.auditoria) return setErro("Auditoria não encontrada");
      const x = j.auditoria;
      setA(x);
      setIdent({ setor: x.setor || "", dataAuditoria: dISO(x.dataAuditoria), responsavelAcompanhamento: x.responsavelAcompanhamento || "", auditor: x.auditor || "", norma: x.norma || "", escopo: x.escopo || "" });
      setConstatacoes(Array.isArray(x.constatacoes) ? x.constatacoes : []);
      setAcoes(Array.isArray(x.acoes) ? x.acoes : []);
      setFotos(Array.isArray(x.fotos) ? x.fotos : []);
      setConclusao(x.conclusao || "");
    }).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2800); };
  const setId = (k, v) => setIdent((p) => ({ ...p, [k]: v }));
  const setC = (i, k, v) => setConstatacoes((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const setAc = (i, k, v) => setAcoes((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  const addFotos = async (files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    setErro(""); setSubindoFoto((n) => n + lista.length);
    for (const file of lista) {
      try {
        const reduzida = await reduzImagem(file);
        const fd = new FormData();
        fd.append("file", reduzida, "foto.jpg");
        const r = await fetch("/api/qualidade/auditorias-internas/foto", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha no upload");
        setFotos((p) => [...p, { url: d.url, legenda: "" }]);
      } catch (e) { setErro(e.message || "Falha ao subir foto"); }
      finally { setSubindoFoto((n) => n - 1); }
    }
  };
  const setLegenda = (i, v) => setFotos((p) => p.map((f, j) => (j === i ? { ...f, legenda: v } : f)));
  const rmFoto = (i) => setFotos((p) => p.filter((_, j) => j !== i));

  // Evidências de uma ação (fotos que comprovam a resposta) — mesmo fluxo das fotos.
  const addEvidencias = async (i, files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    setErro(""); setEvidUp((p) => ({ ...p, [i]: (p[i] || 0) + lista.length }));
    for (const file of lista) {
      try {
        const reduzida = await reduzImagem(file);
        const fd = new FormData();
        fd.append("file", reduzida, "evidencia.jpg");
        const r = await fetch("/api/qualidade/auditorias-internas/foto", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha no upload");
        setAcoes((p) => p.map((ac, j) => (j === i ? { ...ac, evidencias: [...(ac.evidencias || []), { url: d.url, legenda: "" }] } : ac)));
      } catch (e) { setErro(e.message || "Falha ao subir evidência"); }
      finally { setEvidUp((p) => ({ ...p, [i]: Math.max(0, (p[i] || 1) - 1) })); }
    }
  };
  const rmEvidencia = (i, k) => setAcoes((p) => p.map((ac, j) => (j === i ? { ...ac, evidencias: (ac.evidencias || []).filter((_, m) => m !== k) } : ac)));
  const toggleConcluida = (i) => setAcoes((p) => p.map((ac, j) => (j === i ? { ...ac, concluida: !ac.concluida, respondidoEm: !ac.concluida ? (ac.respondidoEm || new Date().toISOString()) : null } : ac)));

  // PATCH único: manda o estado atual do relatório + ação extra (finalizar/reabrir).
  async function enviar(extra = {}, okMsg = "Relatório salvo.") {
    if (!ident.setor.trim()) { setErro("Informe o setor auditado."); return false; }
    setErro(""); setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias-internas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ident,
          constatacoes: constatacoes.filter((c) => (c.descricao || "").trim()),
          acoes: acoes.filter((c) => (c.oque || "").trim()),
          fotos,
          conclusao,
          ...extra,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      flash(okMsg);
      carregar();
      return true;
    } catch (e) { setErro(e.message); return false; } finally { setSalvando(false); }
  }
  const salvar = () => enviar();
  const finalizarRelatorio = () => { if (confirm("Finalizar o relatório? Todas as ações do plano serão encerradas e a auditoria vai para o histórico.")) enviar({ finalizar: true }, "Relatório finalizado."); };
  const reabrirRelatorio = () => { if (confirm("Reabrir o relatório para acompanhamento das ações?")) enviar({ reabrir: true }, "Relatório reaberto."); };

  async function excluir() {
    if (!confirm("Excluir esta auditoria e o relatório? Esta ação não pode ser desfeita.")) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias-internas/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
      router.push("/qualidade/auditorias-internas");
    } catch (e) { alert(e.message); setSalvando(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro && !a) return <div className="py-20 text-center text-red-600 text-sm">{erro} · <Link href="/qualidade/auditorias-internas" className="text-torg-blue underline">voltar</Link></div>;

  const acoesFiltradas = acoes.filter((c) => (c.oque || "").trim());
  const pendentes = acoesFiltradas.filter((c) => !c.concluida).length;
  const emitido = a?.status === "EMITIDO";
  const finalizado = a?.status === "FINALIZADO";
  const podeFin = emitido && pendentes === 0;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/qualidade/auditorias-internas" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><ArrowLeft size={15} /> Auditorias internas</Link>
        <div className="flex items-center gap-2">
          <a href={`/api/qualidade/auditorias-internas/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5"><FileDown size={14} /> PDF</a>
          <button onClick={() => setModalDiv(true)} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5"><Send size={14} /> {a?.divulgadoEm ? "Reenviar ao setor" : "Divulgar ao setor"}</button>
          <button onClick={excluir} disabled={salvando} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-torg-gray"><Trash2 size={14} /></button>
        </div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono font-bold text-torg-blue text-lg">{numRAI(a.numero)}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_AI[a.status]?.cor}`}>{statusAiLabel(a.status)}</span>
          {a.divulgadoEm && <span className="text-[11px] text-torg-gray">· divulgado em {fmtDT(a.divulgadoEm)}</span>}
        </div>
        <h1 className="text-xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><ClipboardList size={20} className="text-torg-blue" /> Relatório de Auditoria Interna</h1>
      </div>

      {/* Identificação */}
      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Setor auditado *">
            <input list="setores-ai" value={ident.setor} onChange={(e) => setId("setor", e.target.value)} className="inp" />
            <datalist id="setores-ai">{SETORES_AUDITORIA.map((s) => <option key={s} value={s} />)}</datalist>
          </Campo>
          <Campo label="Data da auditoria"><input type="date" value={ident.dataAuditoria} onChange={(e) => setId("dataAuditoria", e.target.value)} className="inp" /></Campo>
          <Campo label="Responsável pelo acompanhamento *"><input value={ident.responsavelAcompanhamento} onChange={(e) => setId("responsavelAcompanhamento", e.target.value)} className="inp" /></Campo>
          <Campo label="Auditor"><input value={ident.auditor} onChange={(e) => setId("auditor", e.target.value)} className="inp" /></Campo>
          <Campo label="Norma / referência"><input value={ident.norma} onChange={(e) => setId("norma", e.target.value)} placeholder="ISO 9001:2015, NBR 16775…" className="inp" /></Campo>
        </div>
        <Campo label="Objetivo / escopo"><textarea value={ident.escopo} onChange={(e) => setId("escopo", e.target.value)} rows={2} className="inp" /></Campo>
      </Secao>

      {/* Constatações */}
      <Secao titulo="Constatações" acao={<button onClick={() => setConstatacoes((p) => [...p, { tipo: "CONFORME", descricao: "" }])} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar</button>}>
        {constatacoes.length === 0 ? <p className="text-sm text-torg-gray">Nenhuma constatação. Adicione conformidades, não-conformidades e oportunidades de melhoria.</p> : (
          <div className="space-y-2.5">
            {constatacoes.map((c, i) => {
              const t = TIPO_CONSTATACAO[c.tipo] || TIPO_CONSTATACAO.CONFORME;
              return (
                <div key={i} className="rounded-lg border p-3" style={{ borderColor: t.borda, background: t.bg }}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {TIPOS.map((tp) => {
                      const sel = c.tipo === tp; const info = TIPO_CONSTATACAO[tp];
                      return (
                        <button key={tp} type="button" onClick={() => setC(i, "tipo", tp)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors"
                          style={sel ? { background: info.cor, color: "#fff", borderColor: info.cor } : { background: "#fff", color: "#576D7E", borderColor: "#e5e7eb" }}>
                          {info.label}
                        </button>
                      );
                    })}
                    <button onClick={() => setConstatacoes((p) => p.filter((_, j) => j !== i))} className="ml-auto text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                  </div>
                  <textarea value={c.descricao} onChange={(e) => setC(i, "descricao", e.target.value)} rows={2} placeholder="Descreva a constatação (o que foi observado, evidência)…" className="w-full text-[13px] border border-gray-200 rounded-md px-2.5 py-2 bg-white" />
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      {/* Registro fotográfico */}
      <Secao titulo="Registro fotográfico" acao={
        <label className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium cursor-pointer">
          <ImagePlus size={13} /> Adicionar fotos
          <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => { addFotos(e.target.files); e.target.value = ""; }} />
        </label>
      }>
        {subindoFoto > 0 && <p className="text-[12px] text-torg-gray flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> subindo {subindoFoto} foto{subindoFoto > 1 ? "s" : ""}…</p>}
        {fotos.length === 0 && subindoFoto === 0 ? (
          <p className="text-sm text-torg-gray">Nenhuma foto. Anexe evidências da auditoria (JPG ou PNG) — elas entram no PDF.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fotos.map((f, i) => (
              <div key={i} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                <div className="relative">
                  <img src={f.url} alt={`Foto ${i + 1}`} className="w-full h-32 object-cover" />
                  <button onClick={() => rmFoto(i)} title="Remover" className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-gray-500 hover:text-red-600 shadow"><X size={13} /></button>
                </div>
                <input value={f.legenda || ""} onChange={(e) => setLegenda(i, e.target.value)} placeholder="Legenda…" className="w-full text-[11px] border-0 border-t border-gray-100 px-2 py-1.5 bg-white" />
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* Plano de ação */}
      <Secao titulo="Plano de ação" acao={
        <div className="flex items-center gap-3">
          {acoesFiltradas.length > 0 && <span className={`text-[11px] font-medium ${pendentes ? "text-amber-600" : "text-emerald-600"}`}>{pendentes ? `${pendentes} em aberto` : "todas concluídas"}</span>}
          <button onClick={() => setAcoes((p) => [...p, { oque: "", responsavel: "", prazo: "", resposta: "", evidencias: [], concluida: false }])} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar</button>
        </div>
      }>
        {acoes.length === 0 ? <p className="text-sm text-torg-gray">Sem ações. Registre o que precisa ser feito, por quem e até quando. O relatório fica em aberto até todas as ações serem concluídas.</p> : (
          <div className="space-y-2.5">
            {acoes.map((ac, i) => {
              const done = !!ac.concluida;
              return (
                <div key={i} className={`rounded-lg border p-3 ${done ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-gray-50/40"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 text-[11px] font-semibold text-torg-gray w-4 text-right shrink-0">{i + 1}.</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <input value={ac.oque} onChange={(e) => setAc(i, "oque", e.target.value)} placeholder="Ação a executar" className="w-full text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white" />
                      <div className="flex gap-2 flex-wrap">
                        <input value={ac.responsavel || ""} onChange={(e) => setAc(i, "responsavel", e.target.value)} placeholder="Responsável" className="w-40 text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white" />
                        <input type="date" value={ac.prazo || ""} onChange={(e) => setAc(i, "prazo", e.target.value)} className="w-36 text-[12px] border border-gray-200 rounded px-1.5 py-1.5 bg-white" title="Prazo" />
                      </div>
                    </div>
                    <button onClick={() => setAcoes((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 p-1 shrink-0"><Trash2 size={13} /></button>
                  </div>

                  {/* Resposta / evidência do responsável */}
                  <div className="mt-2.5 pt-2.5 border-t border-dashed border-gray-200 pl-6">
                    <p className="text-[10px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">Resposta / evidência do responsável</p>
                    <textarea value={ac.resposta || ""} onChange={(e) => setAc(i, "resposta", e.target.value)} rows={2} placeholder="O que foi feito para tratar esta ação…" className="w-full text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white" />
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {(ac.evidencias || []).map((ev, k) => (
                        <div key={k} className="relative">
                          <img src={ev.url} alt={`Evidência ${k + 1}`} className="w-16 h-16 object-cover rounded border border-gray-200" />
                          <button onClick={() => rmEvidencia(i, k)} title="Remover" className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 text-gray-400 hover:text-red-600 shadow border border-gray-200"><X size={11} /></button>
                        </div>
                      ))}
                      {evidUp[i] > 0 && <span className="text-[11px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> subindo…</span>}
                      <label className="w-16 h-16 rounded border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:text-torg-blue hover:border-torg-blue cursor-pointer text-[10px] gap-0.5">
                        <Paperclip size={13} /> anexar
                        <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => { addEvidencias(i, e.target.files); e.target.value = ""; }} />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <button onClick={() => toggleConcluida(i)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${done ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-torg-gray border-gray-300 hover:border-emerald-400 hover:text-emerald-600"}`}>
                        {done ? <CheckCircle2 size={13} /> : <CircleDot size={13} />} {done ? "Concluída" : "Marcar como concluída"}
                      </button>
                      {done && ac.respondidoEm && <span className="text-[10px] text-emerald-700">em {fmtDT(ac.respondidoEm)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      {/* Conclusão */}
      <Secao titulo="Conclusão">
        <textarea value={conclusao} onChange={(e) => setConclusao(e.target.value)} rows={3} placeholder="Parecer geral da auditoria…" className="inp" />
      </Secao>

      {/* Encerramento — só após emitido; fica em aberto enquanto houver ação pendente */}
      {(emitido || finalizado) && (
        <div className={`rounded-xl border p-4 ${finalizado || podeFin ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          {finalizado ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-emerald-800 inline-flex items-center gap-2"><Lock size={16} /> <span><b>Relatório finalizado</b>{a.finalizadoEm ? ` em ${fmtDT(a.finalizadoEm)}` : ""}. As ações do plano foram concluídas.</span></span>
              <button onClick={reabrirRelatorio} disabled={salvando} className="px-3 py-1.5 text-[12px] border border-emerald-300 text-emerald-800 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1.5 disabled:opacity-50"><Unlock size={13} /> Reabrir</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm">
                {podeFin
                  ? <span className="text-emerald-800 inline-flex items-center gap-2"><CheckCircle2 size={16} /> {acoesFiltradas.length ? "Todas as ações concluídas" : "Sem ações pendentes"} — o relatório pode ser finalizado.</span>
                  : <span className="text-amber-800 inline-flex items-center gap-2"><AlertCircle size={16} /> Relatório <b>em acompanhamento</b> — {pendentes} ação(ões) em aberto no plano.</span>}
              </span>
              <button onClick={finalizarRelatorio} disabled={salvando || !podeFin} title={podeFin ? "" : "Conclua todas as ações antes de finalizar"} className="px-4 py-1.5 text-[13px] rounded-lg font-medium inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"><Lock size={14} /> Finalizar relatório</button>
            </div>
          )}
        </div>
      )}

      {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {/* Barra salvar (sticky) */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 -mx-8 px-8 py-3 flex justify-end">
        <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Salvar relatório</button>
      </div>

      {modalDiv && <ModalDivulgar auditoria={a} onClose={() => setModalDiv(false)} onEnviado={() => { setModalDiv(false); flash("Relatório divulgado ao setor."); carregar(); }} />}

      <style jsx>{`.inp{width:100%;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px}`}</style>
    </div>
  );
}

function Secao({ titulo, acao, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-torg-dark">{titulo}</h3>
        {acao}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Campo({ label, children }) {
  return <div><label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>{children}</div>;
}

function ModalDivulgar({ auditoria, onClose, onEnviado }) {
  const [emails, setEmails] = useState(auditoria?.divulgadoPara?.length ? [...new Set(auditoria.divulgadoPara.map((d) => d.email))].join(", ") : "");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar() {
    setErro("");
    const lista = emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!lista.length) return setErro("Informe ao menos um e-mail.");
    const inval = lista.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (inval) return setErro(`E-mail inválido: ${inval}`);
    setEnviando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias-internas/${auditoria.id}/divulgar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails: lista, mensagem: mensagem.trim() || null }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao divulgar");
      onEnviado();
    } catch (e) { setErro(e.message); setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Send size={15} className="text-torg-blue" /> Divulgar ao setor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-torg-gray">Salve o relatório antes de divulgar. Vai o <b>PDF em anexo</b> por e-mail e a auditoria é marcada como <b>emitida</b>.</p>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">E-mails do setor *</label>
            <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="email1@torg.com.br, email2@torg.com.br" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            <p className="text-[10px] text-torg-gray mt-1">Separe por vírgula. Cada pessoa recebe individualmente.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Mensagem (opcional)</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} placeholder="Ex.: Segue o relatório da auditoria realizada no setor. Favor tratar as ações no prazo." className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={enviar} disabled={enviando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar</button>
        </div>
      </div>
    </div>
  );
}
