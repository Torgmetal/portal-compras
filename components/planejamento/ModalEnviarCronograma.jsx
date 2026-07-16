"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Send, Plus, Trash2, AlertCircle, CheckCircle2, Building2, Users, Clock } from "lucide-react";

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

  const carregar = useCallback(() => {
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/enviar`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) return setErro(j.error || "Erro ao carregar");
        setDados(j);
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

  async function enviar() {
    setErro("");
    const extras = novos.filter((n) => n.email.trim()).map((n) => ({ nome: n.nome.trim(), email: norm(n.email), tipo: "CLIENTE" }));
    const porEmail = new Map();
    for (const d of [...Object.values(sel), ...extras]) if (d.email) porEmail.set(d.email, d);
    const destinatarios = [...porEmail.values()];
    if (!destinatarios.length) return setErro("Escolha ao menos um destinatário.");
    const invalido = destinatarios.find((d) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email));
    if (invalido) return setErro(`E-mail inválido: ${invalido.email}`);

    setEnviando(true);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/enviar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatarios, mensagem: mensagem.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao enviar");
      setOkMsg(`Cronograma enviado para ${j.enviados} de ${j.total} destinatário${j.total === 1 ? "" : "s"}.${j.registrados ? ` ${j.registrados} contato(s) do cliente registrado(s) na OP.` : ""}`);
      setNovos([]);
      onEnviado?.(j);
      setTimeout(() => onClose(), 2200);
    } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  const nSel = Object.keys(sel).length + novos.filter((n) => n.email.trim()).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Send size={15} className="text-torg-blue" /> Enviar cronograma</h3>
            {dados?.cronograma && <p className="text-[11px] text-torg-gray mt-0.5">OP {dados.cronograma.opNumero}{dados.cronograma.cliente ? ` · ${dados.cronograma.cliente}` : ""} — vai o PDF do Gantt em anexo</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-torg-gray text-sm"><Loader2 size={22} className="mx-auto animate-spin mb-2" /> Carregando…</div>
        ) : !dados ? (
          <div className="py-12 text-center text-red-600 text-sm">{erro || "Erro"}</div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Cliente */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-torg-dark mb-1.5"><Building2 size={13} className="text-torg-blue" /> Cliente</label>
                {dados.clientes?.length > 0 ? (
                  <div className="space-y-1.5 mb-2">
                    {dados.clientes.map((c, i) => (
                      <label key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer text-[12px] ${marcado(c.email) ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={marcado(c.email)} onChange={() => alternar(c.nome, c.email, "CLIENTE")} className="accent-torg-blue" />
                        <span className="font-medium text-torg-dark">{c.nome || "—"}</span>
                        <span className="text-torg-gray flex-1 truncate">{c.email}</span>
                        {c.doCadastro && <span className="text-[10px] text-torg-gray bg-gray-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">do cadastro da OP</span>}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-torg-gray mb-2">Nenhum contato do cliente registrado nesta OP ainda — adicione abaixo.</p>
                )}

                {novos.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <input value={n.nome} onChange={(e) => setNovo(i, "nome", e.target.value)} placeholder="Nome do contato" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                    <input value={n.email} onChange={(e) => setNovo(i, "email", e.target.value)} placeholder="e-mail do cliente" className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
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
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} placeholder="Ex.: Segue o cronograma atualizado após a reunião de hoje. Qualquer dúvida, estamos à disposição." className="w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-2" />
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
                        <span className="flex-1">{h.enviados} e-mail{h.enviados === 1 ? "" : "s"} — {h.destinatarios.map((d) => d.email).join(", ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
              {okMsg && <p className="text-[12px] text-emerald-700 flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"><CheckCircle2 size={13} /> {okMsg}</p>}
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-xl">
              <span className="text-[11px] text-torg-gray">{nSel} destinatário{nSel === 1 ? "" : "s"} selecionado{nSel === 1 ? "" : "s"}</span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
                <button onClick={enviar} disabled={enviando || !nSel} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">
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
