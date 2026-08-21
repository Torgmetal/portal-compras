"use client";
// Card na aba RESUMO da OP (só diretoria): e-mails da Engenharia vinculados a esta
// obra — início do projeto (IFC/1º contato), tempo até a 1ª resposta e quem respondeu.
// Fase 2 do agente de e-mails. Dados de /api/comercial/op/[id]/emails.
import { useState, useEffect } from "react";
import { Mail, Loader2, AlertCircle, ChevronDown, ChevronRight, FileBox, Paperclip, ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2 } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtDur = (h) => {
  if (h == null) return "—";
  if (h < 1) return "< 1h";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24), r = h % 24;
  return r ? `${d}d ${r}h` : `${d}d`;
};

export default function EmailsObraCard({ opId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setDados(null); setErro("");
    fetch(`/api/comercial/op/${opId}/emails`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro"); })
      .catch(() => setErro("Não foi possível carregar."));
  }, [opId]);

  const r = dados?.resumo;
  const eventos = dados?.eventos || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Mail size={18} className="text-indigo-600" /> E-mails da Engenharia</h3>
        <span className="text-[10px] font-semibold text-torg-gray border border-gray-200 rounded px-1.5 py-0.5">diretoria</span>
      </div>
      <p className="text-sm text-torg-gray mb-4">Início do projeto e tempo de resposta da Engenharia, a partir das caixas de e-mail. Vínculo automático por nº da OP / código da obra.</p>

      {dados === null && !erro ? (
        <div className="py-8 text-center text-torg-gray"><Loader2 size={20} className="mx-auto animate-spin" /></div>
      ) : erro ? (
        <p className="text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>
      ) : eventos.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center">
          <Mail size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Nenhum e-mail vinculado a esta obra ainda</p>
          <p className="text-xs text-torg-gray mt-1">Os e-mails são casados automaticamente quando trazem o nº da OP ou o código da obra no assunto/corpo.</p>
        </div>
      ) : (<>
        {/* Resumo em 3 blocos */}
        <div className="grid sm:grid-cols-3 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3">
          <div className="bg-white p-3">
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide">Início do projeto</p>
            {r?.inicioProjeto ? (<>
              <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-1">
                {r.inicioProjeto.tipo === "IFC_RECEBIDO" ? <><FileBox size={14} className="text-torg-orange" /> IFC recebido</> : "1º contato"}
              </p>
              <p className="text-[11px] text-torg-gray">{fmtDT(r.inicioProjeto.em)}</p>
              {r.primeiroContato?.de && <p className="text-[11px] text-torg-gray truncate">de {r.primeiroContato.de}</p>}
            </>) : <p className="text-sm text-torg-gray">—</p>}
          </div>
          <div className="bg-white p-3">
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wide">1ª resposta da Engenharia</p>
            {r?.resposta ? (<>
              <p className="text-sm font-bold text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={14} /> em {fmtDur(r.tempoRespostaHoras)}</p>
              <p className="text-[11px] text-torg-gray truncate">por {r.resposta.por}</p>
              <p className="text-[11px] text-torg-gray">{fmtDT(r.resposta.em)}</p>
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

        {/* Timeline expansível */}
        <button onClick={() => setAberto((v) => !v)} className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1">
          {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {aberto ? "Ocultar" : "Ver"} a troca de e-mails ({eventos.length})
        </button>
        {aberto && (
          <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {eventos.map((e) => {
              const entrada = e.direcao === "ENTRADA";
              const contraparte = entrada ? e.de : (Array.isArray(e.para) ? e.para[0] : null);
              return (
                <div key={e.id} className="px-3 py-2 flex items-start gap-2.5 hover:bg-gray-50/60">
                  {entrada ? <ArrowDownLeft size={14} className="text-emerald-600 mt-0.5 shrink-0" title="Entrada" /> : <ArrowUpRight size={14} className="text-torg-blue mt-0.5 shrink-0" title="Saída" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-torg-dark truncate">{e.assunto || <span className="italic text-gray-400">(sem assunto)</span>}</p>
                    <p className="text-[11px] text-torg-gray truncate">{e.deNome || contraparte || "—"}{contraparte && e.deNome ? ` · ${contraparte}` : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-torg-gray whitespace-nowrap">{fmtDT(e.recebidoEm || e.enviadoEm)}</p>
                    {e.temAnexoIfc ? <span className="text-[10px] font-semibold text-torg-orange inline-flex items-center gap-0.5"><FileBox size={11} /> IFC</span>
                      : e.temAnexo ? <Paperclip size={11} className="inline text-torg-gray" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );
}
