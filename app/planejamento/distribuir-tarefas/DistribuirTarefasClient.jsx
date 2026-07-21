"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { Sparkles, Loader2, AlertCircle, FileUp, FileText, Trash2, Send, CheckCircle2, X, Mail, Building2 } from "lucide-react";

const SETORES = ["PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO"];
const LABEL = { PRODUCAO: "Produção", PINTURA: "Pintura", PCP: "PCP", EXPEDICAO: "Expedição", COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", PLANEJAMENTO: "Planejamento" };
const PRIORIDADES = ["ALTA", "MEDIA", "BAIXA"];
const PRIO_COR = { ALTA: "text-red-600", MEDIA: "text-amber-600", BAIXA: "text-torg-gray" };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim().toLowerCase());

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { semana: week, ano: date.getUTCFullYear() };
}

// semana/ano ISO a partir de uma data "AAAA-MM-DD" (parse local p/ não virar o dia)
function semanaDeData(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  if (isNaN(d)) return null;
  return isoWeek(d);
}

export default function DistribuirTarefasClient() {
  const sem = isoWeek(new Date());
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState([]);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState("");
  const [resumo, setResumo] = useState("");
  const [tarefas, setTarefas] = useState(null); // null = ainda não analisou
  const [semanaIso, setSemanaIso] = useState(sem.semana);
  const [ano, setAno] = useState(sem.ano);
  const [distribuindo, setDistribuindo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [dataProgramada, setDataProgramada] = useState("");
  const [opLote, setOpLote] = useState("");
  const [matriz, setMatriz] = useState(null);
  const [enviarEmail, setEnviarEmail] = useState(true);
  const [destinatarios, setDestinatarios] = useState({}); // { SETOR: [email] }
  const [novoEmail, setNovoEmail] = useState({}); // { SETOR: "digitando…" }
  const [confirmando, setConfirmando] = useState(false);

  // carrega a matriz de comunicação (pré-seleção dos destinatários por setor)
  useEffect(() => {
    fetch("/api/planejamento/comunicacao").then((r) => (r.ok ? r.json() : null)).then((j) => j && setMatriz(j.matriz)).catch(() => {});
  }, []);

  // para cada setor presente ainda sem seleção, usa os contatos da matriz como padrão
  useEffect(() => {
    if (!matriz || !tarefas) return;
    setDestinatarios((prev) => {
      const next = { ...prev };
      for (const t of tarefas) {
        if (t.incluir && next[t.setor] == null) next[t.setor] = (matriz[t.setor]?.contatos || []).map((c) => c.email);
      }
      return next;
    });
  }, [matriz, tarefas]);

  const toggleDest = (setor, email) => setDestinatarios((d) => {
    const cur = d[setor] || [];
    return { ...d, [setor]: cur.includes(email) ? cur.filter((e) => e !== email) : [...cur, email] };
  });
  const addDest = (setor) => {
    const e = String(novoEmail[setor] || "").trim().toLowerCase();
    if (!emailOk(e)) return;
    setDestinatarios((d) => ({ ...d, [setor]: [...new Set([...(d[setor] || []), e])] }));
    setNovoEmail((n) => ({ ...n, [setor]: "" }));
  };
  const setSectorAll = (setor, on) => setDestinatarios((d) => ({ ...d, [setor]: on ? (matriz?.[setor]?.contatos || []).map((c) => c.email) : [] }));

  function addFiles(e) {
    const novos = Array.from(e.target.files || []);
    setArquivos((prev) => {
      const out = [...prev];
      for (const f of novos) {
        if (out.length >= 10) break;
        if (!out.some((x) => x.name === f.name && x.size === f.size)) out.push(f);
      }
      return out;
    });
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
  }
  const removerArquivo = (i) => setArquivos((arr) => arr.filter((_, j) => j !== i));

  async function analisar() {
    if (!texto.trim() && arquivos.length === 0) { setErro("Cole o texto da ata/transcrição ou envie ao menos um arquivo (PDF/TXT)."); return; }
    setAnalisando(true); setErro(""); setResultado(null);
    try {
      const documentos = [];
      if (texto.trim()) documentos.push({ nome: "Texto colado", texto: texto.trim() });
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i];
        const safe = String(f.name || "ata").replace(/[^\w.\- ]/g, "_").slice(0, 80);
        const blob = await upload(`planejamento-atas/${Date.now()}-${i}-${safe}`, f, { access: "public", handleUploadUrl: "/api/planejamento/upload-token" });
        documentos.push({ nome: f.name, arquivoUrl: blob.url, arquivoTipo: f.type || null });
      }
      const r = await fetch("/api/planejamento/extrair-tarefas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentos }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao analisar");
      setResumo(j.resumo || "");
      setTarefas((j.tarefas || []).map((t) => ({ ...t, incluir: true, dataPrevista: t.prazo || "", clienteEmail: t.clienteEmail || "" })));
      if (!j.tarefas?.length) setErro("A IA não encontrou tarefas acionáveis nesse conteúdo.");
    } catch (e) { setErro(e.message); } finally { setAnalisando(false); }
  }

  const upd = (i, k, v) => setTarefas((arr) => arr.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const remover = (i) => setTarefas((arr) => arr.filter((_, j) => j !== i));

  // data programada do lote: ajusta a semana/ano e preenche o prazo das tarefas sem data
  function aplicarDataProgramada(v) {
    setDataProgramada(v);
    const w = semanaDeData(v);
    if (w) { setSemanaIso(w.semana); setAno(w.ano); }
    if (v) setTarefas((arr) => (arr ? arr.map((t) => (t.dataPrevista ? t : { ...t, dataPrevista: v })) : arr));
  }

  // OP do lote: preenche a OP das tarefas que ficaram SEM OP (não sobrescreve as
  // que a IA já detectou nem as editadas à mão) — pra reunião de uma OP só.
  function aplicarOpLote(v) {
    const op = String(v).replace(/\D/g, "").slice(0, 4);
    setOpLote(op);
    if (op) setTarefas((arr) => (arr ? arr.map((t) => (t.opNumero ? t : { ...t, opNumero: op })) : arr));
  }

  async function distribuir() {
    const incluidas = (tarefas || []).filter((t) => t.incluir && t.titulo.trim());
    if (!incluidas.length) { setErro("Selecione ao menos uma tarefa para distribuir."); return; }
    setDistribuindo(true); setErro("");
    try {
      const presentes = [...new Set(incluidas.map((t) => t.setor))];
      const destPorSetor = {};
      for (const s of presentes) destPorSetor[s] = destinatarios[s] || [];
      const r = await fetch("/api/planejamento/tarefas/distribuir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semanaIso, ano,
          tarefas: incluidas.map((t) => ({ titulo: t.titulo.trim(), descricao: t.descricao || null, setor: t.setor, prioridade: t.prioridade || "MEDIA", responsavel: t.responsavel || null, dataPrevista: t.dataPrevista || dataProgramada || null, opNumero: t.opNumero || null, doCliente: !!t.doCliente, clienteNome: t.clienteNome || null, clienteEmail: t.clienteEmail || null })),
          enviarEmail,
          destinatariosPorSetor: enviarEmail ? destPorSetor : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao distribuir");
      setResultado(j);
      setConfirmando(false);
      setTarefas(null); setTexto(""); setArquivos([]); setResumo(""); setDestinatarios({}); setDataProgramada("");
    } catch (e) { setErro(e.message); } finally { setDistribuindo(false); }
  }

  const incluidasCount = (tarefas || []).filter((t) => t.incluir).length;
  const setoresPresentes = [...new Set((tarefas || []).filter((t) => t.incluir).map((t) => t.setor))];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Sparkles size={20} className="text-torg-blue" /> Distribuir tarefas com IA</h1>
        <p className="text-[12px] text-torg-gray mt-0.5">Cole a ata/transcrição e/ou envie vários arquivos (PDF/TXT, até 10). A IA lê tudo em conjunto, extrai as tarefas, sugere o setor responsável e você revisa antes de distribuir.</p>
      </div>

      {erro && <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={() => setErro("")} className="ml-auto"><X size={14} /></button></div>}

      {resultado ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-3" />
          <p className="text-lg font-bold text-torg-dark">{resultado.criadas} tarefa(s) distribuída(s)</p>
          <p className="text-sm text-torg-gray mt-1">Semana {semanaIso}/{ano} · {Object.entries(resultado.porSetor || {}).map(([s, n]) => `${LABEL[s] || s} (${n})`).join(" · ")}</p>
          {resultado.emails?.enviados > 0 && <p className="text-[13px] text-emerald-700 mt-1.5 inline-flex items-center gap-1.5"><Mail size={14} /> {resultado.emails.enviados} e-mail(s) enviado(s) aos setores</p>}
          {resultado.emails?.falhas?.length > 0 && <p className="text-[12px] text-amber-600 mt-1">Falha no envio para: {resultado.emails.falhas.map((f) => LABEL[f.setor] || f.setor).join(", ")}</p>}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Link href="/planejamento/tarefas" className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-4 py-2 hover:bg-torg-dark">Ver no quadro de Tarefas</Link>
            <button onClick={() => setResultado(null)} className="text-sm text-torg-blue hover:underline">Analisar outra reunião</button>
          </div>
        </div>
      ) : tarefas ? (
        <div className="space-y-4">
          {resumo && <div className="bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg px-4 py-3 text-[13px] text-torg-dark"><b>Resumo da reunião:</b> {resumo}</div>}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-torg-dark">{tarefas.length} tarefa(s) extraída(s) · {incluidasCount} selecionada(s)</p>
            <button onClick={() => { setTarefas(null); setResumo(""); }} className="text-xs text-torg-blue hover:underline">← analisar outro texto</button>
          </div>

          <div className="space-y-2">
            {tarefas.map((t, i) => (
              <div key={i} className={`bg-white rounded-xl border shadow-sm p-3 ${t.incluir ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={t.incluir} onChange={(e) => upd(i, "incluir", e.target.checked)} className="mt-1.5 accent-torg-blue" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <input value={t.titulo} onChange={(e) => upd(i, "titulo", e.target.value)} className="w-full text-sm font-medium text-torg-dark border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="block">
                        <span className="block text-[10px] text-torg-gray mb-0.5">Setor</span>
                        <select value={t.setor} onChange={(e) => upd(i, "setor", e.target.value)} className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none">
                          {SETORES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-torg-gray mb-0.5">Prioridade</span>
                        <select value={t.prioridade} onChange={(e) => upd(i, "prioridade", e.target.value)} className={`w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none font-medium ${PRIO_COR[t.prioridade] || ""}`}>
                          {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-torg-gray mb-0.5">Prazo</span>
                        <input type="date" value={t.dataPrevista || ""} onChange={(e) => upd(i, "dataPrevista", e.target.value)} className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] text-torg-gray mb-0.5">OP (opcional)</span>
                        <input value={t.opNumero || ""} onChange={(e) => upd(i, "opNumero", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="ex: 085" className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
                      </label>
                    </div>
                    <input value={t.responsavel || ""} onChange={(e) => upd(i, "responsavel", e.target.value)} placeholder="Responsável (opcional)" className="w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-torg-dark cursor-pointer">
                        <input type="checkbox" checked={!!t.doCliente} onChange={(e) => upd(i, "doCliente", e.target.checked)} className="accent-torg-orange" />
                        <Building2 size={12} className="text-torg-orange" /> Tarefa do cliente
                      </label>
                      {t.doCliente && (
                        <input value={t.clienteEmail || ""} onChange={(e) => upd(i, "clienteEmail", e.target.value)} placeholder={t.opNumero ? "e-mail do cliente (vazio = usa o da OP)" : "e-mail do cliente"} className="flex-1 min-w-[180px] text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue outline-none" />
                      )}
                    </div>
                    {t.descricao && <p className="text-[11px] text-torg-gray">{t.descricao}</p>}
                  </div>
                  <button onClick={() => remover(i)} className="text-torg-gray hover:text-red-600 mt-1" title="Remover"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-end justify-between gap-3 flex-wrap sticky bottom-3">
            <div className="flex items-end gap-2 flex-wrap">
              <label className="block"><span className="block text-[10px] text-torg-gray mb-0.5">Data programada</span><input type="date" value={dataProgramada} onChange={(e) => aplicarDataProgramada(e.target.value)} title="Vira o prazo das tarefas sem data e ajusta a semana ISO" className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" /></label>
              <label className="block"><span className="block text-[10px] text-torg-gray mb-0.5">OP desta rodada</span><input value={opLote} onChange={(e) => aplicarOpLote(e.target.value)} placeholder="ex: 097" title="Preenche a OP das tarefas que ficaram sem OP (não altera as já preenchidas)" className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" /></label>
              <label className="block"><span className="block text-[10px] text-torg-gray mb-0.5">Semana ISO</span><input type="number" min={1} max={53} value={semanaIso} onChange={(e) => setSemanaIso(Number(e.target.value))} className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" /></label>
              <label className="block"><span className="block text-[10px] text-torg-gray mb-0.5">Ano</span><input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" /></label>
            </div>
            <button onClick={() => setConfirmando(true)} disabled={incluidasCount === 0} className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-5 py-2.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-2">
              <Send size={16} /> Revisar e distribuir {incluidasCount} tarefa(s)
            </button>
            <p className="w-full text-[10px] text-torg-gray">A <b>data programada</b> ajusta a semana e vira o prazo das tarefas sem data. A <b>OP desta rodada</b> preenche a OP das tarefas que ficaram sem — útil quando a reunião é toda de uma OP só. As duas só mexem no que está em branco; dá pra editar cada tarefa acima.</p>
          </div>

          {confirmando && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setConfirmando(false)}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
                  <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><Send size={16} className="text-torg-blue" /> Distribuir {incluidasCount} tarefa(s)</h3>
                  <button onClick={() => setConfirmando(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-torg-dark cursor-pointer">
                    <input type="checkbox" checked={enviarEmail} onChange={(e) => setEnviarEmail(e.target.checked)} className="accent-torg-blue" />
                    <Mail size={15} className="text-torg-blue" /> Enviar e-mail aos setores
                  </label>

                  {enviarEmail ? (
                    <div className="space-y-2">
                      <p className="text-[12px] text-torg-gray">Escolha quem recebe em cada setor — desmarque quem não deve receber:</p>
                      {setoresPresentes.map((setor) => {
                        const contatos = matriz?.[setor]?.contatos || [];
                        const sel = destinatarios[setor] || [];
                        const extras = sel.filter((e) => !contatos.some((c) => c.email === e));
                        return (
                          <div key={setor} className="border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-[12px] font-semibold text-torg-dark">{LABEL[setor]} <span className="font-normal text-torg-gray">· {sel.length} selecionado(s)</span></p>
                              {contatos.length > 0 && <span className="text-[10px] text-torg-blue flex gap-2"><button type="button" onClick={() => setSectorAll(setor, true)} className="hover:underline">todos</button><button type="button" onClick={() => setSectorAll(setor, false)} className="hover:underline">nenhum</button></span>}
                            </div>
                            <div className="space-y-1">
                              {contatos.map((c) => (
                                <label key={c.email} className="flex items-center gap-1.5 text-[12px] text-torg-dark cursor-pointer">
                                  <input type="checkbox" checked={sel.includes(c.email)} onChange={() => toggleDest(setor, c.email)} className="accent-torg-blue" />
                                  {c.nome ? `${c.nome} ` : ""}<span className="text-torg-gray">{c.email}</span>
                                </label>
                              ))}
                              {extras.map((e) => (
                                <label key={e} className="flex items-center gap-1.5 text-[12px] text-torg-dark cursor-pointer">
                                  <input type="checkbox" checked onChange={() => toggleDest(setor, e)} className="accent-torg-blue" />
                                  <span className="text-torg-gray">{e}</span>
                                </label>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <input value={novoEmail[setor] || ""} onChange={(e) => setNovoEmail((n) => ({ ...n, [setor]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDest(setor); } }} placeholder="adicionar e-mail avulso" className="flex-1 text-[12px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue outline-none" />
                              <button type="button" onClick={() => addDest(setor)} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark">adicionar</button>
                            </div>
                            {contatos.length === 0 && extras.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Sem contatos — adicione um e-mail avulso ou configure a <Link href="/planejamento/comunicacao" className="underline">Matriz</Link>.</p>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[12px] text-torg-gray bg-gray-50 rounded-lg px-3 py-2">Nenhum e-mail será enviado — as tarefas só serão criadas no quadro.</p>
                  )}

                  {tarefas.filter((t) => t.incluir && t.doCliente).length > 0 && (
                    <div className="border border-orange-200 bg-orange-50/50 rounded-lg p-3">
                      <p className="text-[12px] font-semibold text-torg-orange flex items-center gap-1.5"><Building2 size={13} /> Tarefas do cliente</p>
                      <p className="text-[11px] text-torg-gray mt-0.5 mb-1.5">O cliente <b>não</b> recebe e-mail agora — guarde o e-mail aqui para cobrar depois (painel da Diretoria ou botão “Avisar cliente” no quadro).</p>
                      {tarefas.map((t, i) => (t.incluir && t.doCliente) ? (
                        <div key={i} className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-torg-dark flex-1 truncate" title={t.titulo}>{t.titulo}</span>
                          <input value={t.clienteEmail || ""} onChange={(e) => upd(i, "clienteEmail", e.target.value)} placeholder="e-mail do cliente" className="w-48 text-[11px] border border-gray-200 rounded px-2 py-1 focus:border-torg-blue outline-none" />
                        </div>
                      ) : null)}
                    </div>
                  )}

                  <p className="text-[12px] text-torg-gray">Vai criar <b>{incluidasCount}</b> tarefa(s) na <b>Semana {semanaIso}/{ano}</b>{enviarEmail ? <> e enviar e-mail para <b>{setoresPresentes.reduce((n, s) => n + (destinatarios[s]?.length || 0), 0)}</b> destinatário(s).</> : "."}</p>
                </div>
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0">
                  <button onClick={() => setConfirmando(false)} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
                  <button onClick={distribuir} disabled={distribuindo} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">
                    {distribuindo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Confirmar e distribuir
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} placeholder="Cole aqui a ata ou a transcrição da reunião… (opcional se você anexar arquivos)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-torg-blue outline-none resize-y" />

          <div>
            <label className={`text-[12px] inline-flex items-center gap-2 ${arquivos.length >= 10 ? "text-torg-gray/40 cursor-not-allowed" : "text-torg-blue cursor-pointer hover:text-torg-dark"}`}>
              <FileUp size={15} /> {arquivos.length >= 10 ? "limite de 10 arquivos atingido" : "Adicionar arquivos (PDF/TXT) — pode selecionar vários"}
              <input type="file" accept=".pdf,.txt,.csv" multiple disabled={arquivos.length >= 10} className="hidden" onChange={addFiles} />
            </label>
            {arquivos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {arquivos.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px] text-torg-dark bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <FileText size={13} className="text-torg-blue shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-[10px] text-torg-gray shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removerArquivo(i)} className="text-torg-gray hover:text-red-600 shrink-0" title="Remover"><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 flex-wrap">
            {(texto.trim() || arquivos.length > 0) && <span className="text-[11px] text-torg-gray mr-auto">{[texto.trim() && "texto colado", arquivos.length > 0 && `${arquivos.length} arquivo(s)`].filter(Boolean).join(" + ")}</span>}
            <button onClick={analisar} disabled={analisando} className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-5 py-2.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-2">
              {analisando ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {analisando ? "Analisando…" : "Analisar com IA"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
