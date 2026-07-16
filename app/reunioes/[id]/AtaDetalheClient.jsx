"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, NotebookPen, Loader2, Send, Trash2, Plus, X, CheckCircle2, Clock, AlertCircle, Users, Link2, Copy, Check, History, Pencil, Paperclip, Sparkles, FolderKanban, FileDown } from "lucide-react";
import AtaAtividadesEditor, { agruparSecoes, achatarSecoes } from "@/components/AtaAtividadesEditor";

const SETORES = ["COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "PCP", "PLANEJAMENTO", "EXPEDICAO", "QUALIDADE", "ALMOXARIFADO", "FINANCEIRO", "RH", "DIRETORIA"];
const SETOR_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", PRODUCAO: "Produção", PCP: "PCP", PLANEJAMENTO: "Planejamento", EXPEDICAO: "Expedição", QUALIDADE: "Qualidade", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", DIRETORIA: "Diretoria" };
const sl = (s) => SETOR_LABEL[s] || s || "—";
const STATUS = { RASCUNHO: { l: "Rascunho", c: "bg-gray-100 text-gray-700" }, ENVIADA: { l: "Enviada", c: "bg-blue-100 text-blue-700" }, CONCLUIDA: { l: "Concluída", c: "bg-emerald-100 text-emerald-700" } };
const numAta = (n) => `ATA-${String(n).padStart(3, "0")}`;
const rev = (n) => `R${String(n).padStart(2, "0")}`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const opNum = (a) => { const n = parseInt(String(a?.op || "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : Infinity; };
const ordenarPorOp = (list) => (list || []).slice().sort((a, b) => opNum(a) - opNum(b)); // ordem numérica de OP; sem OP por último (estável dentro da mesma OP)
function agrupaPorOp(atvs) {
  const map = new Map();
  for (const a of ordenarPorOp(atvs)) { const k = a.op || ""; if (!map.has(k)) map.set(k, []); map.get(k).push(a); }
  return [...map.entries()]; // já em ordem numérica de OP
}

export default function AtaDetalheClient({ id }) {
  const router = useRouter();
  const [ata, setAta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [modalRev, setModalRev] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/reunioes/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.ata) return setErro("Ata não encontrada");
      setAta(j.ata);
    }).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  async function enviar() {
    if (!confirm("Enviar a ata a todos os envolvidos por e-mail? Cada um receberá um link para confirmar o recebimento.")) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/reunioes/${id}/enviar`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao enviar");
      flash(`Enviada para ${j.enviados}/${j.total} envolvidos.`);
      carregar();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  async function excluir() {
    if (!confirm("Excluir esta ata? Esta ação não pode ser desfeita.")) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/reunioes/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
      router.push("/reunioes");
    } catch (e) { alert(e.message); setSalvando(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro || !ata) return <div className="py-20 text-center text-red-600 text-sm">{erro || "Ata não encontrada"} · <Link href="/reunioes" className="text-torg-blue underline">voltar</Link></div>;

  const isRascunho = ata.status === "RASCUNHO";
  const confMap = new Map((ata.confirmacoes || []).map((c) => [String(c.email).toLowerCase(), c]));
  const respondidas = (ata.atividades || []).filter((a) => a.status === "RESPONDIDO").length;
  const confirmados = (ata.confirmacoes || []).filter((c) => c.confirmadoEm).length;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/reunioes" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><ArrowLeft size={15} /> Atas de reunião</Link>
        <div className="flex items-center gap-2">
          <a href={`/api/reunioes/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5" title="Baixar a ata em PDF"><FileDown size={14} /> PDF</a>
          {!isRascunho && <button onClick={() => setModalRev(true)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5"><Pencil size={14} /> Revisar</button>}
          {isRascunho && <button onClick={enviar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar aos envolvidos</button>}
          {!isRascunho && <button onClick={enviar} disabled={salvando} className="px-3 py-1.5 border border-torg-blue text-torg-blue text-sm rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><Send size={14} /> Reenviar</button>}
          <button onClick={excluir} disabled={salvando} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-torg-gray"><Trash2 size={14} /></button>
        </div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-torg-blue text-lg">{numAta(ata.numero)}</span>
              <span className="font-mono text-torg-gray text-sm">{rev(ata.revisao)}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS[ata.status]?.c}`}>{STATUS[ata.status]?.l}</span>
            </div>
            <h1 className="text-xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><NotebookPen size={20} className="text-torg-blue" /> {ata.titulo}</h1>
            <p className="text-xs text-torg-gray mt-1">Semana ISO {ata.semanaIso}/{ata.ano} · Reunião em {fmtD(ata.dataReuniao)}{ata.enviadaEm ? ` · Enviada em ${fmtDT(ata.enviadaEm)}` : ""}</p>
          </div>
          {!isRascunho && (
            <div className="flex gap-4 text-center">
              <div><div className="text-2xl font-bold text-torg-blue">{confirmados}/{(ata.confirmacoes || []).length}</div><div className="text-[10px] text-torg-gray uppercase tracking-wide">Confirmaram</div></div>
              <div><div className="text-2xl font-bold text-emerald-600">{respondidas}/{(ata.atividades || []).length}</div><div className="text-[10px] text-torg-gray uppercase tracking-wide">Responderam</div></div>
            </div>
          )}
        </div>
        {ata.pauta && !isRascunho && <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-torg-dark whitespace-pre-wrap">{ata.pauta}</div>}
      </div>

      {isRascunho ? (
        <RascunhoEditor ata={ata} onSaved={carregar} />
      ) : (
        <>
          <EnvolvidosView ata={ata} confMap={confMap} onFlash={flash} />
          <AtividadesView ata={ata} />
        </>
      )}

      {/* Histórico de revisões */}
      {Array.isArray(ata.revisoes) && ata.revisoes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-torg-dark mb-2 flex items-center gap-1.5"><History size={15} /> Histórico de revisões</h3>
          <ul className="space-y-1.5 text-[12px]">
            {[...ata.revisoes].reverse().map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-torg-gray">
                <span className="font-mono font-semibold text-torg-dark">{rev(r.n)}</span>
                <span className="flex-1">{r.motivo} <span className="text-gray-400">· {r.por} · {fmtDT(r.em)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modalRev && <ModalRevisao ata={ata} onClose={() => setModalRev(false)} onSaved={() => { setModalRev(false); carregar(); flash("Revisão salva."); }} />}
    </div>
  );
}

/* ── Envolvidos (enviada): confirmação + link ─────────────────── */
function EnvolvidosView({ ata, confMap, onFlash }) {
  const [copiado, setCopiado] = useState("");
  const envolvidos = Array.isArray(ata.envolvidos) ? ata.envolvidos : [];
  async function copiar(token, key) {
    const url = `${window.location.origin}/ata/${token}`;
    try { await navigator.clipboard.writeText(url); setCopiado(key); onFlash("Link copiado."); setTimeout(() => setCopiado(""), 2000); } catch { }
  }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-torg-dark mb-3 flex items-center gap-1.5"><Users size={15} /> Envolvidos <span className="text-torg-gray font-normal">({envolvidos.length})</span></h3>
      <div className="space-y-1.5">
        {envolvidos.map((e, i) => {
          const c = confMap.get(String(e.email).toLowerCase());
          const ok = !!c?.confirmadoEm;
          return (
            <div key={i} className="flex items-center gap-3 text-[13px] py-1.5 border-b border-gray-50 last:border-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-500" : "bg-amber-400"}`} title={ok ? "Confirmou" : "Aguardando"} />
              <span className="font-medium text-torg-dark min-w-[140px]">{e.nome || "—"}</span>
              <span className="text-torg-gray flex-1 truncate">{e.email}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-torg-gray">{sl(e.setor)}</span>
              <span className={`text-[11px] inline-flex items-center gap-1 min-w-[130px] justify-end ${ok ? "text-emerald-600" : "text-amber-600"}`}>
                {ok ? <><Check size={12} /> {fmtDT(c.confirmadoEm)}</> : <><Clock size={12} /> aguardando</>}
              </span>
              {c?.token && <button onClick={() => copiar(c.token, e.email)} title="Copiar link da ata" className="text-gray-400 hover:text-torg-blue">{copiado === e.email ? <Check size={14} className="text-emerald-500" /> : <Link2 size={14} />}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Atividades (enviada): read-only + respostas ──────────────── */
function AtividadesView({ ata }) {
  const atvs = ata.atividades || [];
  const grupos = agrupaPorOp(atvs);
  const totalOk = atvs.filter((a) => a.status === "RESPONDIDO").length;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-torg-dark">Atividades por OP</h3>
        {atvs.length > 0 && <span className="text-[12px] text-torg-gray">{totalOk}/{atvs.length} respondidas</span>}
      </div>
      {atvs.length === 0 ? <p className="text-sm text-torg-gray">Nenhuma atividade cadastrada.</p> : (
        <div className="space-y-5">
          {grupos.map(([op, itens]) => {
            const nOk = itens.filter((x) => x.status === "RESPONDIDO").length;
            return (
              <div key={op || "_"} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3 bg-torg-blue-50/70 border-b border-torg-blue-100">
                  <FolderKanban size={17} className="text-torg-blue" />
                  <span className="text-[15px] font-bold text-torg-dark">{op ? `OP ${op}` : "Sem OP"}</span>
                  <span className={`ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-full ${nOk === itens.length ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{nOk}/{itens.length} respondidas</span>
                </div>
                <div className="p-3.5 sm:p-4 space-y-3">
                  {itens.map((a) => {
                    const ok = a.status === "RESPONDIDO";
                    return (
                      <div key={a.id} className={`rounded-lg border p-4 ${ok ? "border-emerald-100 bg-emerald-50/40" : "border-gray-100 bg-gray-50/50"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-[14px] text-torg-dark font-medium leading-snug">{a.descricao}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px]">
                              {a.setor ? <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-torg-gray font-medium">{sl(a.setor)}</span> : <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">sem setor</span>}
                              {a.responsavel && <span className="text-torg-gray">Resp.: {a.responsavel}</span>}
                              {a.prazo && <span className="text-torg-gray">prazo {fmtD(a.prazo)}</span>}
                            </div>
                          </div>
                          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{ok ? "Respondido" : "Pendente"}</span>
                        </div>
                        {ok && (
                          <div className="mt-3 pt-3 border-t border-emerald-100/70 text-[13px] space-y-1.5">
                            {a.resposta && <p className="text-torg-dark whitespace-pre-wrap leading-relaxed">{a.resposta}</p>}
                            {a.evidencia && <p className="text-torg-gray flex items-start gap-1.5"><Paperclip size={13} className="mt-0.5 flex-shrink-0" /> <span className="break-all">{a.evidencia}</span></p>}
                            <p className="text-[11px] text-gray-400">{a.respondidoPor || "—"} · {fmtDT(a.respondidoEm)}</p>
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
      )}
    </div>
  );
}

/* ── Editor de rascunho (edição livre + atividades) ───────────── */
function RascunhoEditor({ ata, onSaved }) {
  const [titulo, setTitulo] = useState(ata.titulo || "");
  const [dataReuniao, setDataReuniao] = useState(dISO(ata.dataReuniao));
  const [pauta, setPauta] = useState(ata.pauta || "");
  const [envolvidos, setEnvolvidos] = useState(Array.isArray(ata.envolvidos) && ata.envolvidos.length ? ata.envolvidos : [{ nome: "", email: "", setor: "" }]);
  const [secoes, setSecoes] = useState(agruparSecoes(ata.atividades || []));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  const setEnv = (i, k, v) => setEnvolvidos((p) => p.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  async function salvar() {
    setErro(""); setOk(false);
    if (!titulo.trim()) return setErro("Informe o título.");
    const envs = envolvidos.filter((e) => e.nome.trim() && e.email.trim());
    const atvs = achatarSecoes(secoes);
    if (!envs.length) return setErro("Adicione ao menos um envolvido.");
    setSalvando(true);
    try {
      const r = await fetch(`/api/reunioes/${ata.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: titulo.trim(), dataReuniao, pauta: pauta.trim() || null, envolvidos: envs, atividades: atvs }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setOk(true); setTimeout(() => setOk(false), 2500);
      onSaved();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-torg-dark">Editar rascunho</h3>
        <div className="flex items-center gap-2">
          {ok && <span className="text-[12px] text-emerald-600 inline-flex items-center gap-1"><Check size={13} /> salvo</span>}
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Salvar</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-torg-dark mb-1">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs font-medium text-torg-dark mb-1">Data da reunião</label>
          <input type="date" value={dataReuniao} onChange={(e) => setDataReuniao(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-torg-dark mb-1">Pauta / observações</label>
        <textarea value={pauta} onChange={(e) => setPauta(e.target.value)} rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-torg-dark mb-1.5">Envolvidos</label>
        <div className="space-y-2">
          {envolvidos.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={e.nome} onChange={(ev) => setEnv(i, "nome", ev.target.value)} placeholder="Nome" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
              <input value={e.email} onChange={(ev) => setEnv(i, "email", ev.target.value)} placeholder="e-mail" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
              <select value={e.setor || ""} onChange={(ev) => setEnv(i, "setor", ev.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white">
                <option value="">Setor</option>
                {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
              </select>
              <button onClick={() => setEnvolvidos((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setEnvolvidos((p) => [...p, { nome: "", email: "", setor: "" }])} className="mt-1.5 text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar envolvido</button>
      </div>

      <div>
        <label className="block text-xs font-semibold text-torg-dark mb-2">Atividades por OP</label>
        <AtaAtividadesEditor secoes={secoes} setSecoes={setSecoes} envolvidos={envolvidos} />
      </div>

      {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
      <p className="text-[11px] text-torg-gray border-t border-gray-100 pt-3">Enquanto está em <b>rascunho</b> você edita tudo livremente. Depois de <b>enviar</b>, qualquer alteração nos dados sobe a revisão (ISO) e as atividades ficam travadas para os setores responderem.</p>
    </div>
  );
}

/* ── Modal de revisão (pós-envio) ─────────────────────────────── */
function ModalRevisao({ ata, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(ata.titulo || "");
  const [dataReuniao, setDataReuniao] = useState(dISO(ata.dataReuniao));
  const [pauta, setPauta] = useState(ata.pauta || "");
  const [envolvidos, setEnvolvidos] = useState(Array.isArray(ata.envolvidos) && ata.envolvidos.length ? ata.envolvidos : [{ nome: "", email: "", setor: "" }]);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const setEnv = (i, k, v) => setEnvolvidos((p) => p.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  async function salvar() {
    setErro("");
    if (!motivo.trim()) return setErro("Descreva o motivo da revisão (fica registrado no histórico ISO).");
    const envs = envolvidos.filter((e) => e.nome.trim() && e.email.trim());
    setSalvando(true);
    try {
      const r = await fetch(`/api/reunioes/${ata.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo: titulo.trim(), dataReuniao, pauta: pauta.trim() || null, envolvidos: envs, motivoRevisao: motivo.trim() }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      onSaved();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">Nova revisão — {rev(ata.revisao + 1)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[12px] text-amber-800 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> Editar uma ata já enviada gera a revisão <b>{rev(ata.revisao + 1)}</b>. As atividades e respostas dos setores são preservadas.</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-torg-dark mb-1">Título</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data</label>
              <input type="date" value={dataReuniao} onChange={(e) => setDataReuniao(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Pauta / observações</label>
            <textarea value={pauta} onChange={(e) => setPauta(e.target.value)} rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-torg-dark mb-1.5">Envolvidos</label>
            <div className="space-y-2">
              {envolvidos.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={e.nome} onChange={(ev) => setEnv(i, "nome", ev.target.value)} placeholder="Nome" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                  <input value={e.email} onChange={(ev) => setEnv(i, "email", ev.target.value)} placeholder="e-mail" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                  <select value={e.setor || ""} onChange={(ev) => setEnv(i, "setor", ev.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white">
                    <option value="">Setor</option>
                    {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
                  </select>
                  <button onClick={() => setEnvolvidos((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setEnvolvidos((p) => [...p, { nome: "", email: "", setor: "" }])} className="mt-1.5 text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar envolvido</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Motivo da revisão *</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: correção de data, inclusão de envolvido…" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Salvar revisão {rev(ata.revisao + 1)}</button>
        </div>
      </div>
    </div>
  );
}
