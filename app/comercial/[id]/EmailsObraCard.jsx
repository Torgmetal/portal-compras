"use client";
// Card na aba RESUMO da OP (só diretoria): marcos e TAGS do projeto por e-mail — IFC,
// liberação, envio p/ aprovação, aprovação, reprovação, revisões, pendências do cliente e
// RFIs — + tempo de resposta da Engenharia e a troca de e-mails com LEITOR dentro do portal.
import { useState, useEffect, useCallback } from "react";
import {
  Mail, Loader2, AlertCircle, ChevronDown, ChevronRight, FileBox, Paperclip,
  ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, PlayCircle, Send, ExternalLink, Circle,
  XCircle, PencilRuler, HelpCircle, AlertTriangle, X, FileText, MailQuestion } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDur = (h) => {
  if (h == null) return "—";
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24), r = h % 24;
  return r ? `${d}d ${r}h` : `${d}d`;
};

// Metadados de cada TAG (rótulo, cor, ícone) — fonte única p/ badges e checklist.
const TAG_META = {
  IFC_RECEBIDO: { label: "IFC recebido", Icon: FileBox, txt: "text-torg-orange", bg: "bg-torg-orange", chip: "bg-orange-50 text-orange-700 border-orange-200" },
  LIBERACAO_INICIO: { label: "Liberação p/ início", Icon: PlayCircle, txt: "text-torg-blue", bg: "bg-torg-blue", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  PROJETO_ENVIADO: { label: "Projeto enviado", Icon: Send, txt: "text-indigo-600", bg: "bg-indigo-600", chip: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  APROVADO_CLIENTE: { label: "Aprovado", Icon: CheckCircle2, txt: "text-emerald-600", bg: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REPROVADO_CLIENTE: { label: "Reprovado / ressalvas", Icon: XCircle, txt: "text-red-600", bg: "bg-red-600", chip: "bg-red-50 text-red-700 border-red-200" },
  REVISAO_CLIENTE: { label: "Revisão do cliente", Icon: PencilRuler, txt: "text-amber-600", bg: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  PENDENCIA_CLIENTE: { label: "Pendência / cobrança", Icon: AlertTriangle, txt: "text-rose-600", bg: "bg-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  RFI_TECNICO: { label: "Dúvida / RFI", Icon: HelpCircle, txt: "text-cyan-600", bg: "bg-cyan-600", chip: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};

// Checklist de marcos únicos (ordem do fluxo).
const MARCOS = ["IFC_RECEBIDO", "LIBERACAO_INICIO", "PROJETO_ENVIADO", "APROVADO_CLIENTE"];
// Ocorrências que podem se repetir na obra → contadores.
const CONTADORES = [
  { key: "REVISAO_CLIENTE", src: "tags" },
  { key: "REPROVADO_CLIENTE", src: "marco" },
  { key: "PENDENCIA_CLIENTE", src: "tags" },
  { key: "RFI_TECNICO", src: "tags" },
];

export default function EmailsObraCard({ opId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ver, setVer] = useState(null); // e-mail aberto no leitor { id }
  const [corpo, setCorpo] = useState(null); // { carregando, erro, ...corpo }
  // ⚠⚠ A FILA MORA AQUI, NÃO NA ENGENHARIA. Vitor (29/08/2026): "o ideal é na aba de resumo da OP;
  // não pode ter essa informação na engenharia". E funciona melhor: quem está na OP-072 reconhece
  // o e-mail dela de bate-pronto; quem olha uma lista solta de 22 assuntos, não. O contexto da
  // obra faz o trabalho que o seletor tentava fazer.
  const [pendentes, setPendentes] = useState([]);
  const [verPendentes, setVerPendentes] = useState(false);
  const [vinculando, setVinculando] = useState(null);

  const carregarPendentes = () =>
    fetch("/api/engenharia/emails/pendentes")
      .then((r) => r.json()).then((j) => setPendentes(j.pendentes || [])).catch(() => setPendentes([]));
  useEffect(() => { carregarPendentes(); }, []);

  // ⚠ vincular daqui é sempre "é DESTA obra": o opId vem do card, não de um seletor que a pessoa
  // pode errar. E a thread inteira acompanha.
  // ⚠ desfazer é tão necessário quanto vincular: sem ele o e-mail errado fica no dossiê da obra
  // errada, e o dossiê é o que vai para o cliente.
  async function desvincular(email) {
    setVinculando(email.id);
    try {
      const r = await fetch(`/api/engenharia/emails/${email.id}/vincular`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desvincular: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao desvincular");
      carregarPendentes(); carregar();
    } catch (e) { alert(e.message); } finally { setVinculando(null); }
  }

  async function vincularAqui(email, ehDaObra) {
    setVinculando(email.id);
    try {
      const r = await fetch(`/api/engenharia/emails/${email.id}/vincular`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId: ehDaObra ? opId : null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao vincular");
      carregarPendentes();
      if (ehDaObra) carregar();
    } catch (e) { alert(e.message); } finally { setVinculando(null); }
  }

  const carregar = useCallback(() => {
    setErro("");
    fetch(`/api/comercial/op/${opId}/emails`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro"); })
      .catch(() => setErro("Não foi possível carregar."));
  }, [opId]);
  useEffect(() => { setDados(null); carregar(); }, [opId, carregar]);

  const abrirEmail = useCallback((e) => {
    setVer(e); setCorpo({ carregando: true });
    fetch(`/api/comercial/op/${opId}/emails/${e.id}/corpo`)
      .then((r) => r.json())
      .then((j) => setCorpo(j.success ? { ...j } : { erro: j.error || "Falha ao abrir" }))
      .catch(() => setCorpo({ erro: "Falha ao abrir o e-mail" }));
  }, [opId]);

  const r = dados?.resumo;
  const marcos = dados?.marcos || {};
  const tags = dados?.tags || {};
  const eventos = dados?.eventos || [];
  const contarOcorrencia = (c) => (c.src === "tags" ? (tags[c.key] || []).length : (marcos[c.key] ? 1 : 0));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Mail size={18} className="text-indigo-600" /> E-mails do Projeto</h3>
        <div className="flex items-center gap-2">
          {/* ⚠⚠ O DOSSIÊ DA OBRA. Vitor (29/08/2026), sobre a TMSA: "temos que mostrar um histórico
              para ele do problema que a engenharia deles causou (...) e tenho que buscar informação
              com uma equipe que não marca nada". O portal marca — envio do cronograma com data,
              hora e nomes, tarefa com data real, bloqueio com motivo, correspondência arquivada.
              Este botão junta tudo num documento só, sem ninguém digitar nada. */}
          <a href={`/api/comercial/op/${opId}/posicao-cronograma`} target="_blank" rel="noopener noreferrer"
            className="text-[11.5px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1.5 hover:bg-torg-dark inline-flex items-center gap-1.5"
            title="PDF com os envios do cronograma ao cliente, o que a Torg entregou, o que está parado esperando ele, o efeito na entrega e a correspondência item a item">
            <FileText size={13} /> Posição do cronograma
          </a>
          <span className="text-[10px] font-semibold text-torg-gray border border-gray-200 rounded px-1.5 py-0.5">diretoria</span>
        </div>
      </div>
      {/* ⚠ e-mails de fora que nenhuma regra casou: quem está NESTA obra reconhece o que é dela */}
      {pendentes.length > 0 && (
        <div className="border border-amber-200 bg-amber-50/40 rounded-lg mb-3">
          <button onClick={() => setVerPendentes((v) => !v)} className="w-full px-3 py-2 flex items-center gap-2 text-left">
            <MailQuestion size={14} className="text-amber-700" />
            <span className="text-[12.5px] font-semibold text-torg-dark">
              {pendentes.length} e-mail(s) de fora ainda sem obra
            </span>
            <span className="text-[11.5px] text-torg-gray">— algum é desta?</span>
            <span className="ml-auto text-[11.5px] text-torg-blue">{verPendentes ? "esconder" : "ver"}</span>
          </button>
          {verPendentes && (
            <div className="divide-y divide-amber-100 max-h-[45vh] overflow-y-auto border-t border-amber-100">
              {pendentes.map((e) => (
                <div key={e.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[11px] text-torg-gray tabular-nums">{fmtDT(e.recebidoEm)}</span>
                    <span className="text-[12px] font-semibold text-torg-dark">{e.deNome || e.de}</span>
                    <span className="text-[11px] text-torg-gray">{e.de}</span>
                    {e.naThread > 0 && (
                      <span className="text-[10.5px] text-amber-800 border border-amber-200 rounded px-1.5 py-0.5">
                        +{e.naThread} na conversa
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-torg-dark">{e.assunto || <span className="italic text-gray-400">(sem assunto)</span>}</p>
                  {e.snippet && <p className="text-[11px] text-torg-gray truncate">{e.snippet}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => vincularAqui(e, true)} disabled={vinculando === e.id}
                      className="text-[11.5px] font-semibold text-white bg-torg-blue rounded px-2 py-0.5 hover:bg-torg-dark disabled:opacity-50">
                      é desta obra
                    </button>
                    {/* ⚠ "não é de obra" também é resposta — sem ela o e-mail volta amanhã */}
                    <button onClick={() => vincularAqui(e, false)} disabled={vinculando === e.id}
                      className="text-[11.5px] text-torg-gray hover:text-torg-dark underline disabled:opacity-50">
                      não é de obra nenhuma
                    </button>
                    {vinculando === e.id && <Loader2 size={12} className="animate-spin text-torg-blue" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-torg-gray mb-4">Marcos e tags detectados nos e-mails da Engenharia — IFC, liberação, envio/aprovação, revisões e pendências do cliente. Clique num e-mail para ler aqui dentro.</p>

      {dados === null && !erro ? (
        <div className="py-8 text-center text-torg-gray"><Loader2 size={20} className="mx-auto animate-spin" /></div>
      ) : erro ? (
        <p className="text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>
      ) : eventos.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center">
          <Mail size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Nenhum e-mail vinculado a esta obra ainda</p>
          <p className="text-xs text-torg-gray mt-1">Os e-mails são casados automaticamente pelo nº da OP, código/nome da obra ou pela thread.</p>
        </div>
      ) : (<>
        {/* Checklist de marcos — o destaque */}
        <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 mb-3">
          {MARCOS.map((key) => {
            const meta = TAG_META[key];
            const m = marcos[key];
            const ok = !!m;
            return (
              <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ok ? meta.bg : "bg-gray-100"}`}>
                  <meta.Icon size={15} className={ok ? "text-white" : "text-gray-300"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${ok ? "text-torg-dark" : "text-gray-400"}`}>{meta.label}</p>
                  {ok
                    ? <button onClick={() => abrirEmail(m)} className="text-[11px] text-torg-gray hover:text-torg-blue truncate block max-w-full text-left">{fmtDT(m.em)} · {m.direcao === "SAIDA" ? "por" : "de"} {m.por}{m.assunto ? ` · ${m.assunto}` : ""}</button>
                    : <p className="text-[11px] text-gray-400">pendente / não identificado</p>}
                </div>
                {ok ? <CheckCircle2 size={16} className={`${meta.txt} shrink-0`} /> : <Circle size={16} className="text-gray-200 shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Contadores de ocorrências (revisões, reprovações, pendências, RFIs) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {CONTADORES.map((c) => {
            const meta = TAG_META[c.key];
            const n = contarOcorrencia(c);
            return (
              <div key={c.key} className={`rounded-lg border px-3 py-2 ${n > 0 ? meta.chip : "border-gray-100 bg-gray-50/50 text-gray-400"}`}>
                <div className="flex items-center gap-1.5">
                  <meta.Icon size={13} className={n > 0 ? meta.txt : "text-gray-300"} />
                  <span className="text-lg font-bold tabular-nums leading-none">{n}</span>
                </div>
                <p className="text-[10px] font-medium mt-1 leading-tight">{meta.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tempo de resposta + volume */}
        <div className="grid sm:grid-cols-2 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3">
          <div className="bg-white p-3">
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide">1ª resposta da Engenharia</p>
            {r?.resposta ? (<>
              <p className="text-sm font-bold text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={14} /> em {fmtDur(r.tempoRespostaHoras)}</p>
              <p className="text-[11px] text-torg-gray truncate">por {r.resposta.por} · {fmtDT(r.resposta.em)}</p>
            </>) : r?.semRespostaHoras != null ? (
              <p className="text-sm font-bold text-red-600 inline-flex items-center gap-1"><Clock size={14} /> sem resposta há {fmtDur(r.semRespostaHoras)}</p>
            ) : <p className="text-sm text-torg-gray">—</p>}
          </div>
          <div className="bg-white p-3">
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide">Volume</p>
            <p className="text-sm font-bold text-torg-dark tabular-nums">{r?.totalEventos ?? 0} e-mails</p>
            <p className="text-[11px] text-torg-gray">{r?.entradas ?? 0} entradas · {r?.saidas ?? 0} saídas</p>
          </div>
        </div>

        {/* Timeline expansível — ver/abrir cada e-mail */}
        <button onClick={() => setAberto((v) => !v)} className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1">
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {aberto ? "Ocultar" : "Ver"} a troca de e-mails ({eventos.length})
        </button>
        {aberto && (
          <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {eventos.map((e) => {
              const entrada = e.direcao === "ENTRADA";
              const contraparte = entrada ? e.de : (Array.isArray(e.para) ? e.para[0] : null);
              const meta = e.tipoGatilho && e.tipoGatilho !== "OUTRO" ? TAG_META[e.tipoGatilho] : null;
              return (
                // ⚠ vira <div>: o desfazer é um botão DENTRO da linha, e botão dentro de botão não
                // é HTML válido — o clique interno vazaria para o de fora e abriria o e-mail.
                <div key={e.id} className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-gray-50/60 cursor-pointer" onClick={() => abrirEmail(e)}>
                  {entrada ? <ArrowDownLeft size={14} className="text-emerald-600 mt-0.5 shrink-0" /> : <ArrowUpRight size={14} className="text-torg-blue mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {meta && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${meta.chip} inline-flex items-center gap-0.5 shrink-0`}><meta.Icon size={9} /> {meta.label}</span>}
                      <p className="text-[13px] text-torg-dark truncate">{e.assunto || <span className="italic text-gray-400">(sem assunto)</span>}</p>
                    </div>
                    <p className="text-[11px] text-torg-gray truncate">{e.deNome || contraparte || "—"}{contraparte && e.deNome ? ` · ${contraparte}` : ""}{e.snippet ? ` — ${e.snippet}` : ""}</p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                    <p className="text-[11px] text-torg-gray whitespace-nowrap">{fmtDT(e.recebidoEm || e.enviadoEm)}</p>
                    {e.temAnexoIfc ? <span className="text-[10px] font-semibold text-torg-orange inline-flex items-center gap-0.5"><FileBox size={11} /> IFC</span>
                      : e.temAnexo ? <Paperclip size={11} className="inline text-torg-gray" /> : null}
                    {/* ⚠ e-mail na obra errada entra no dossiê que vai para o cliente — o desfazer
                        precisa estar à mão, não numa tela de administração. */}
                    <button onClick={(ev) => { ev.stopPropagation(); if (confirm("Tirar este e-mail desta obra? Ele volta para a fila.")) desvincular(e); }}
                      disabled={vinculando === e.id}
                      className="text-[10px] text-torg-gray-light hover:text-red-600 underline disabled:opacity-50"
                      title="Não é desta obra — devolver para a fila">
                      não é desta obra
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {ver && <LeitorEmail email={ver} corpo={corpo} onClose={() => { setVer(null); setCorpo(null); }} />}
    </div>
  );
}

// ── Modal leitor de e-mail (corpo puxado do Graph sob demanda) ─────────────────
function LeitorEmail({ email, corpo, onClose }) {
  useEffect(() => {
    const onEsc = (ev) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const meta = email.tipoGatilho && email.tipoGatilho !== "OUTRO" ? TAG_META[email.tipoGatilho] : null;
  const c = corpo && !corpo.carregando && !corpo.erro ? corpo : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {meta && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.chip} inline-flex items-center gap-0.5`}><meta.Icon size={10} /> {meta.label}</span>}
              {email.direcao && <span className="text-[10px] text-torg-gray">{email.direcao === "ENTRADA" ? "recebido" : "enviado"}</span>}
            </div>
            <h4 className="text-base font-semibold text-torg-dark truncate">{c?.assunto || email.assunto || "(sem assunto)"}</h4>
            <p className="text-xs text-torg-gray mt-0.5">
              {c ? (<>{c.deNome ? `${c.deNome} <${c.de}>` : c.de}{c.para?.length ? ` → ${c.para.join(", ")}` : ""}</>) : (email.por || email.de || "")}
              {c?.em ? ` · ${fmtDT(c.em)}` : (email.em ? ` · ${fmtDT(email.em)}` : "")}
            </p>
          </div>
          <button onClick={onClose} className="text-torg-gray hover:text-torg-dark shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!corpo || corpo.carregando ? (
            <div className="py-16 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin mb-2" /> Abrindo o e-mail…</div>
          ) : corpo.erro ? (
            <div className="p-6">
              <p className="text-sm text-red-600 inline-flex items-center gap-1 mb-3"><AlertCircle size={14} /> {corpo.erro}</p>
              {(corpo.webLink || email.webLink) && <a href={corpo.webLink || email.webLink} target="_blank" rel="noopener noreferrer" className="text-sm text-torg-blue inline-flex items-center gap-1">Abrir no Outlook <ExternalLink size={13} /></a>}
            </div>
          ) : c.contentType === "html" ? (
            <iframe title="corpo" sandbox="" className="w-full min-h-[45vh] border-0" srcDoc={`<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,Arial,sans-serif;font-size:13px;color:#1f2937;padding:16px;margin:0}img{max-width:100%;height:auto}</style>${c.corpo || ""}`} />
          ) : (
            <pre className="whitespace-pre-wrap break-words text-[13px] text-gray-800 p-5 font-sans">{c.corpo || "(sem conteúdo)"}</pre>
          )}
        </div>

        {(c?.anexos?.length || c?.webLink || email.webLink) && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {(c?.anexos || []).map((a, i) => (
                <span key={i} className="text-[11px] text-torg-gray border border-gray-200 rounded px-2 py-1 inline-flex items-center gap-1">
                  <Paperclip size={11} /> {a.nome || "anexo"}
                </span>
              ))}
            </div>
            {(c?.webLink || email.webLink) && <a href={c?.webLink || email.webLink} target="_blank" rel="noopener noreferrer" className="text-xs text-torg-blue inline-flex items-center gap-1 shrink-0">Abrir no Outlook <ExternalLink size={12} /></a>}
          </div>
        )}
      </div>
    </div>
  );
}
