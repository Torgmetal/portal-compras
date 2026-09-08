"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Send, Plus, Trash2, AlertCircle, CheckCircle2, Building2, Users, Clock, Pencil, Check, Eye, FileDown } from "lucide-react";

import { TIPOS_ENVIO_CRONOGRAMA } from "@/lib/cronograma-envio-opcoes";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const norm = (e) => String(e || "").trim().toLowerCase();

/**
 * Envia o cronograma (PDF anexo) pelos e-mails. Espelha o "Enviar lembrete" das
 * tarefas: setores da Torg numa lista fixa + os contatos do CLIENTE, que ficam
 * registrados na OP no primeiro envio e voltam marcados nos próximos.
 */
export default function ModalEnviarCronograma({ cronogramaId, onClose, onEnviado }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState({}); // email -> { nome, email, tipo }
  const [novos, setNovos] = useState([]); // contatos do cliente adicionados agora
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState("");

  const [tipoEnvio, setTipoEnvio] = useState("INICIAL");
  const [tituloCliente, setTituloCliente] = useState("");
  const [revisao, setRevisao] = useState("");
  const [resumoAlteracoes, setResumoAlteracoes] = useState("");
  const [previa, setPrevia] = useState(null);
  const [previando, setPreviando] = useState(false);
  const [anexosPrevia, setAnexosPrevia] = useState([]);
  const configurado = useRef(null);
  const previaController = useRef(null);
  const opcoes = { tipoEnvio, tituloCliente: tituloCliente.trim(), revisao: revisao.trim(), resumoAlteracoes: resumoAlteracoes.trim(), mensagem: mensagem.trim() || null };

  useEffect(() => {
    previaController.current?.abort();
    setPrevia(null); setPreviando(false);
  }, [tipoEnvio, tituloCliente, revisao, resumoAlteracoes, mensagem]);
  useEffect(() => () => previaController.current?.abort(), []);
  useEffect(() => {
    const anexos = (previa?.anexos || []).map(a => ({ ...a, url: URL.createObjectURL(new Blob([Uint8Array.from(atob(a.content), c => c.charCodeAt(0))], { type: a.contentType })) }));
    setAnexosPrevia(anexos);
    return () => anexos.forEach(a => URL.revokeObjectURL(a.url));
  }, [previa]);

  async function conferirPrevia() {
    setErro("");
    if (!tituloCliente.trim()) return setErro("Informe o título para o cliente.");
    if (tipoEnvio === "REVISAO" && (!revisao.trim() || !resumoAlteracoes.trim())) return setErro("Informe a identificação da revisão e o resumo das alterações.");
    previaController.current?.abort();
    const controller = new AbortController(); previaController.current = controller;
    setPreviando(true); setPrevia(null);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/enviar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ acao: "PREVIA", opcoes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível gerar a prévia.");
      if (!controller.signal.aborted) setPrevia(j);
    } catch (e) { if (e.name !== "AbortError") setErro(e.message); }
    finally { if (!controller.signal.aborted) setPreviando(false); }
  }

  const carregar = useCallback(() => {
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/enviar`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return setErro(j.error || "Erro ao carregar");
        setDados(j);
        if (configurado.current !== cronogramaId) {
          configurado.current = cronogramaId;
          setTipoEnvio(j.tipoEnvioSugerido || "INICIAL");
          setTituloCliente(j.cronograma?.titulo || `Cronograma OP ${j.cronograma?.opNumero || ""}`);
        }
        // já vem marcado quem é do cliente — é o alvo do envio
        const pre = {};
        for (const c of j.clientes || []) pre[norm(c.email)] = { nome: c.nome || "", email: norm(c.email), tipo: "CLIENTE" };
        setSel(pre);
      })
      .catch(() => setErro("Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [cronogramaId]);
  useEffect(() => { carregar(); }, [carregar]);

  const marcado = (email) => !!sel[norm(email)];
  const alternar = (nome, email, tipo) => {
    const k = norm(email);
    setSel((s) => {
      const n = { ...s };
      if (n[k]) delete n[k]; else n[k] = { nome: nome || "", email: k, tipo };
      return n;
    });
  };

  const addCliente = () => setNovos((n) => [...n, { nome: "", email: "" }]);
  const setNovo = (i, k, v) => setNovos((n) => n.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const rmNovo = (i) => setNovos((n) => n.filter((_, j) => j !== i));

  // Editar/remover os contatos do cliente JÁ registrados na OP (ex.: corrigir um
  // e-mail digitado errado). Grava a lista inteira em OP.clienteContatos.
  const [editKey, setEditKey] = useState(null); // e-mail (norm) do contato em edição
  const [editForm, setEditForm] = useState({ nome: "", email: "" });
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const registrados = () => (dados?.clientes || []).filter((c) => !c.doCadastro);

  async function salvarContatos(lista) {
    const r = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/contatos-cliente`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contatos: lista.map((c) => ({ nome: c.nome || "", email: norm(c.email) })) }),
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
    carregar();
  }
  async function confirmarEdicao(origEmail) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editForm.email.trim())) return setErro("E-mail inválido.");
    setErro(""); setSalvandoEdit(true);
    try {
      const lista = registrados().map((c) => (norm(c.email) === norm(origEmail) ? { nome: editForm.nome.trim(), email: norm(editForm.email) } : c));
      await salvarContatos(lista);
      setEditKey(null);
    } catch (e) { setErro(e.message); } finally { setSalvandoEdit(false); }
  }
  async function removerContato(c) {
    if (!confirm(`Remover ${c.nome || c.email} da lista de contatos do cliente?`)) return;
    setErro("");
    try { await salvarContatos(registrados().filter((x) => norm(x.email) !== norm(c.email))); }
    catch (e) { setErro(e.message); }
  }

  async function enviar() {
    setErro("");
    const extras = novos.filter((n) => n.email.trim()).map((n) => ({ nome: n.nome.trim(), email: norm(n.email), tipo: "CLIENTE" }));
    const porEmail = new Map();
    for (const d of [...Object.values(sel), ...extras]) if (d.email) porEmail.set(d.email, d);
    const destinatarios = [...porEmail.values()];
    if (!destinatarios.length) return setErro("Escolha ao menos um destinatário.");
    const invalido = destinatarios.find((d) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email));
    if (invalido) return setErro(`E-mail inválido: ${invalido.email}`);

    if (!previa) return setErro("Confira a prévia do envio antes de confirmar.");
    setEnviando(true);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/enviar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "ENVIAR", destinatarios, opcoes, previaHash: previa.previaHash }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) { if (r.status === 409) setPrevia(null); throw new Error(j.error || "Erro ao enviar"); }
      setOkMsg(`Cronograma enviado para ${j.enviados} de ${j.total} destinatário${j.total === 1 ? "" : "s"}.${j.registrados ? ` ${j.registrados} contato(s) do cliente registrado(s) na OP.` : ""}`);
      setNovos([]);
      onEnviado?.(j);
      setTimeout(() => onClose(), 2200);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  const nSel = Object.keys(sel).length + novos.filter((n) => n.email.trim()).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Send size={15} className="text-torg-blue" /> Enviar cronograma</h3>
            {dados?.cronograma && <p className="text-[11px] text-torg-gray mt-0.5">OP {dados.cronograma.opNumero}{dados.cronograma.cliente ? ` · ${dados.cronograma.cliente}` : ""} — vão 2 anexos: o PDF do Gantt e o .xml do MS Project</p>}
          </div>
          <button onClick={onClose} disabled={enviando} aria-label="Fechar envio" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-torg-gray text-sm"><Loader2 size={22} className="mx-auto animate-spin mb-2" /> Carregando…</div>
        ) : !dados ? (
          <div className="py-12 text-center text-red-600 text-sm">{erro || "Erro"}</div>
        ) : (
          <>
            <fieldset disabled={enviando} className="min-w-0 w-full px-5 py-4 space-y-4 max-h-[68vh] overflow-y-auto">
              <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-torg-dark mb-3">1. Escolha o tipo de e-mail</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {TIPOS_ENVIO_CRONOGRAMA.map(tipo => (
                    <label key={tipo.id} className={`cursor-pointer rounded-lg border p-3 ${tipoEnvio === tipo.id ? "border-torg-blue bg-white ring-1 ring-torg-blue" : "border-gray-200 bg-white"}`}>
                      <span className="flex items-center gap-2 text-xs font-semibold text-torg-dark"><input type="radio" name="tipoEnvio" value={tipo.id} checked={tipoEnvio === tipo.id} onChange={() => setTipoEnvio(tipo.id)} className="accent-torg-blue" />{tipo.titulo}</span>
                      <span className="block text-[11px] leading-relaxed text-torg-gray mt-2">{tipo.descricao}</span>
                    </label>
                  ))}
                </div>
                <label htmlFor="cronograma-titulo-cliente" className="block text-xs font-semibold text-torg-dark mt-4 mb-1">Título para o cliente</label>
                <input id="cronograma-titulo-cliente" value={tituloCliente} maxLength={180} onChange={e => setTituloCliente(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-xs" />
                <p className="text-[10px] text-torg-gray mt-1">Este título aparece no e-mail e nos anexos. Confira também qualquer referência à revisão escrita manualmente no título ou na mensagem.</p>
                {tipoEnvio === "REVISAO" ? <div className="mt-3 space-y-2">
                  <label htmlFor="cronograma-revisao" className="block text-xs font-semibold text-torg-dark">Identificação da revisão</label>
                  <input id="cronograma-revisao" value={revisao} maxLength={30} placeholder="Ex.: R02" onChange={e => setRevisao(e.target.value)} className="w-full sm:w-48 border border-gray-200 rounded px-3 py-2 text-xs" />
                  <label htmlFor="cronograma-alteracoes" className="block text-xs font-semibold text-torg-dark">O que mudou para o cliente</label>
                  <textarea id="cronograma-alteracoes" value={resumoAlteracoes} maxLength={3000} rows={3} placeholder="Informe as mudanças de datas, escopo ou sequência e seus motivos." onChange={e => setResumoAlteracoes(e.target.value)} className="w-full border border-gray-200 rounded px-3 py-2 text-xs" />
                  {!dados.temLinhaBase && <p className="text-[11px] text-amber-700">Sem linha de base cadastrada: serão enviados a revisão identificada e o resumo informado, sem inventar um comparativo de datas.</p>}
                </div> : <p className="text-[11px] text-torg-gray mt-3">Sem identificação automática de revisão ou linha de base nos anexos. O histórico interno permanece registrado.</p>}
              </div>
              {/* Cliente */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-torg-dark mb-1.5"><Building2 size={13} className="text-torg-blue" /> Cliente</label>
                {dados.clientes?.length > 0 ? (
                  <div className="space-y-1.5 mb-2">
                    {dados.clientes.map((c, i) => (
                      editKey === norm(c.email) ? (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-torg-blue bg-torg-blue-50/30">
                          <input value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome do contato" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                          <input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="e-mail do cliente" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                          <button onClick={() => confirmarEdicao(c.email)} disabled={salvandoEdit} title="Salvar" className="text-emerald-600 hover:text-emerald-700 p-1 disabled:opacity-50">{salvandoEdit ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}</button>
                          <button onClick={() => setEditKey(null)} disabled={salvandoEdit} title="Cancelar" className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
                        </div>
                      ) : (
                        <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12px] ${marcado(c.email) ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                          <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                            <input type="checkbox" checked={marcado(c.email)} onChange={() => alternar(c.nome, c.email, "CLIENTE")} className="accent-torg-blue" />
                            <span className="font-medium text-torg-dark whitespace-nowrap">{c.nome || "—"}</span>
                            <span className="text-torg-gray flex-1 truncate">{c.email}</span>
                          </label>
                          {c.doCadastro ? (
                            <span className="text-[10px] text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">do cadastro da OP</span>
                          ) : (<>
                            <button onClick={() => { setEditKey(norm(c.email)); setEditForm({ nome: c.nome || "", email: c.email || "" }); setErro(""); }} title="Editar e-mail" className="text-gray-400 hover:text-torg-blue p-1"><Pencil size={13} /></button>
                            <button onClick={() => removerContato(c)} title="Remover contato" className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                          </>)}
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-torg-gray mb-2">Nenhum contato do cliente registrado nesta OP ainda — adicione abaixo.</p>
                )}

                {novos.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <input value={n.nome} onChange={(e) => setNovo(i, "nome", e.target.value)} placeholder="Nome do contato" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                    <input value={n.email} onChange={(e) => setNovo(i, "email", e.target.value)} placeholder="e-mail do cliente" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                    <button onClick={() => rmNovo(i)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={addCliente} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar e-mail do cliente</button>
                {dados.temOp
                  ? <p className="text-[10px] text-torg-gray mt-1">Ao enviar, os contatos do cliente ficam registrados nesta OP e voltam prontos no próximo envio.</p>
                  : <p className="text-[10px] text-amber-600 mt-1">Este cronograma não está vinculado a uma OP — dá pra enviar, mas os contatos não ficam registrados.</p>}
              </div>

              {/* Setores da Torg */}
              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-torg-dark mb-1.5"><Users size={13} className="text-torg-blue" /> Equipe Torg <span className="font-normal text-torg-gray">(opcional)</span></label>
                <div className="space-y-2.5">
                  {(dados.setores || []).map((g) => (
                    <div key={g.area}>
                      <p className="text-[10px] font-semibold text-torg-gray uppercase tracking-wide mb-1">{g.area}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {g.contatos.map((ct) => (
                          <label key={ct.email} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-[12px] ${marcado(ct.email) ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                            <input type="checkbox" checked={marcado(ct.email)} onChange={() => alternar(ct.nome, ct.email, "SETOR")} className="accent-torg-blue" />
                            <span className="text-torg-dark truncate">{ct.nome}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mensagem */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-semibold text-torg-dark mb-1.5">Mensagem <span className="font-normal text-torg-gray">(opcional)</span></label>
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={2000} rows={3} placeholder="Ex.: Segue o cronograma atualizado após a reunião de hoje. Qualquer dúvida, estamos à disposição." className="w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-2" />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-torg-dark mb-3">2. Confira antes de enviar</h4>
                <button type="button" onClick={conferirPrevia} disabled={previando || !tituloCliente.trim()} className="inline-flex items-center gap-2 text-xs font-semibold rounded-lg border border-torg-blue text-torg-blue px-3 py-2 disabled:opacity-50">
                  {previando ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}{previando ? "Preparando e-mail e anexos…" : previa ? "Atualizar prévia" : "Gerar prévia do envio"}
                </button>
                {previa && <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 p-3"><p className="text-xs text-torg-dark"><strong>Assunto:</strong> {previa.assunto}</p>
                    <div className="flex flex-wrap gap-2 mt-3">{anexosPrevia.map(a => <a key={a.filename} href={a.url} target="_blank" rel="noopener noreferrer" download={a.contentType === "application/xml" ? a.filename : undefined} className="inline-flex gap-1.5 items-center text-[11px] text-torg-blue border border-gray-200 bg-white rounded px-2 py-1.5"><FileDown size={13} />{a.filename}</a>)}</div>
                  </div>
                  <iframe title="Prévia do e-mail de cronograma" srcDoc={previa.html} sandbox="" className="w-full h-[520px] border-0 bg-slate-100" />
                </div>}
                {!previa && <p className="text-[11px] text-torg-gray mt-2">O envio será habilitado após gerar a prévia. Alterar o tipo, título ou texto exige conferir novamente.</p>}
              </div>
              {/* Histórico */}
              {dados.historico?.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-torg-dark mb-1.5"><Clock size={13} /> Envios anteriores</label>
                  <div className="space-y-1">
                    {dados.historico.map((h) => (
                      <div key={h.id} className="text-[11px] text-torg-gray flex items-start gap-2">
                        <span className="whitespace-nowrap">{fmtDT(h.createdAt)}</span>
                        <span className="text-gray-300">·</span>
                        <span className="flex-1">{h.assunto && <strong className="block font-medium text-torg-dark">{h.assunto}</strong>}{h.enviados} e-mail{h.enviados === 1 ? "" : "s"} — {h.destinatarios.map((d) => d.email).join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
              {okMsg && <p className="text-[12px] text-emerald-700 flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"><CheckCircle2 size={13} /> {okMsg}</p>}
            </fieldset>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-xl">
              <span className="text-[11px] text-torg-gray">{nSel} destinatário{nSel === 1 ? "" : "s"} selecionado{nSel === 1 ? "" : "s"}</span>
              <div className="flex gap-2">
                <button onClick={onClose} disabled={enviando} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
                <button onClick={enviar} disabled={enviando || previando || !nSel || !previa} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar cronograma
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
