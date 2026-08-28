"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { History, ArrowLeft, Loader2, PlusCircle, PencilLine, MinusCircle, FileDown, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const fmtRev = (n) => `R${String(n ?? 0).padStart(2, "0")}`;
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Uma linha do "o que mudou": inclusão, alteração campo a campo ou exclusão.
function Mudancas({ diff }) {
  if (!diff || !diff.total) return <p className="text-[12px] text-torg-gray">Nenhuma alteração no cronograma — o documento foi reenviado sem mudança.</p>;
  return (
    <div className="space-y-1.5">
      {diff.incluidas.map((a) => (
        <div key={`i${a.numero}`} className="flex items-start gap-2 text-[12px]">
          <PlusCircle size={14} className="text-emerald-600 mt-px shrink-0" />
          <span><strong className="text-torg-dark">{a.rotulo}</strong> incluída no cronograma <span className="text-torg-gray">· {a.data}{a.responsavel !== "—" ? ` · ${a.responsavel}` : ""}</span></span>
        </div>
      ))}
      {diff.alteradas.map((a) => (
        <div key={`a${a.numero}`} className="flex items-start gap-2 text-[12px]">
          <PencilLine size={14} className="text-amber-600 mt-px shrink-0" />
          <span>
            <strong className="text-torg-dark">{a.rotulo}</strong>{" "}
            {a.mudancas.map((m, i) => (
              <span key={i} className="text-torg-gray">{i > 0 ? " · " : ""}{m.campo}: <span className="line-through">{m.de}</span> → <strong className="text-torg-dark no-underline">{m.para}</strong></span>
            ))}
          </span>
        </div>
      ))}
      {diff.removidas.map((a) => (
        <div key={`r${a.numero}`} className="flex items-start gap-2 text-[12px]">
          <MinusCircle size={14} className="text-red-500 mt-px shrink-0" />
          <span><strong className="text-torg-dark">{a.rotulo}</strong> excluída do cronograma <span className="text-torg-gray">· era {a.data}</span></span>
        </div>
      ))}
    </div>
  );
}

export default function RevisoesClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/qualidade/auditorias-internas/revisoes").then((r) => (r.ok ? r.json() : Promise.reject(new Error("Erro ao carregar"))))
      .then(setDados).catch((e) => setErro(e.message)).finally(() => setLoading(false));
  }, []);

  const revisoes = dados?.revisoes || [];

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/qualidade/auditorias-internas" className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 mb-2"><ArrowLeft size={14} /> Voltar ao cronograma</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><History className="text-torg-blue" /> Revisões do cronograma</h1>
            <p className="text-xs text-torg-gray mt-0.5">O documento sobe de revisão quando é enviado para assinatura. Aqui fica o registro do que mudou em cada emissão.</p>
          </div>
          <a href="/api/qualidade/auditorias-internas/pdf" target="_blank" rel="noopener noreferrer" className="px-3.5 py-2.5 bg-white text-torg-dark border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2 text-sm"><FileDown size={16} /> Cronograma atual</a>
        </div>
      </div>

      {loading && <p className="text-sm text-torg-gray flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Carregando…</p>}
      {erro && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>}

      {!loading && dados && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-torg-gray font-semibold">Revisão vigente</p>
              <p className="text-2xl font-extrabold text-torg-dark">{fmtRev(dados.revisaoAtual)}</p>
            </div>
            <div className="h-9 w-px bg-gray-200" />
            <p className="text-[12px] text-torg-gray">
              {dados.emitido
                ? <>{revisoes.length} emissão(ões) para assinatura · {dados.nAuditorias} auditoria(s) no cronograma de hoje.</>
                : <>Documento ainda <strong className="text-torg-dark">não emitido</strong> — {dados.nAuditorias} auditoria(s) no cronograma. A revisão passa a contar a partir do primeiro envio para assinatura.</>}
            </p>
          </div>

          {dados.pendentes && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Clock size={15} className="text-amber-600" /> Alterações ainda não emitidas</p>
              <p className="text-[11px] text-torg-gray mt-0.5 mb-2.5">Mudou depois da {fmtRev(dados.pendentes.desdeRevisao)} ({fmtDT(dados.pendentes.desdeEm)}) — {dados.pendentes.resumo}. Vai virar a próxima revisão quando o cronograma for enviado para assinatura.</p>
              <Mudancas diff={dados.pendentes.diff} />
            </div>
          )}

          {!revisoes.length && (
            <p className="text-sm text-torg-gray bg-white border border-gray-200 rounded-xl p-6 text-center">O cronograma ainda não foi enviado para assinatura — por isso não há revisões registradas.</p>
          )}

          <div className="space-y-3">
            {revisoes.map((r) => {
              const assinadas = r.assinaturas.filter((a) => a.assinadoEm).length;
              return (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                    <div>
                      <p className="text-sm font-bold text-torg-dark">{fmtRev(r.revisao)} <span className="font-normal text-torg-gray">· {r.resumo}</span></p>
                      <p className="text-[11px] text-torg-gray mt-0.5">Enviado em {fmtDT(r.enviadoEm)}{r.enviadoPor ? ` por ${r.enviadoPor}` : ""} · {r.nAuditorias} auditoria(s)</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${assinadas === r.assinaturas.length && r.assinaturas.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {assinadas}/{r.assinaturas.length} assinatura(s)
                    </span>
                  </div>

                  {r.inicial
                    ? <p className="text-[12px] text-torg-gray">Emissão inicial do documento.</p>
                    : <Mudancas diff={r.diff} />}

                  {r.assinaturas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                      {r.assinaturas.map((a) => (
                        <span key={a.id} className={`px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ${a.assinadoEm ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-torg-gray"}`}
                          title={a.assinadoEm ? `Assinado ${fmtDT(a.assinadoEm)}${a.ip ? " · IP " + a.ip : ""}` : "Aguardando assinatura"}>
                          {a.assinadoEm ? <CheckCircle2 size={11} /> : <Clock size={11} />} {a.nome}{a.setor ? ` · ${a.setor}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
