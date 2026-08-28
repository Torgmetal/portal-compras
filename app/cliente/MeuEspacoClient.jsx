"use client";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { FileText, Loader2, CheckCircle2, Clock, ExternalLink, Globe, LogOut, PenLine, AlertCircle, RotateCcw } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : null);

export default function MeuEspacoClient() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/cliente/meu-espaco", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Não consegui carregar seus documentos."))))
      .then(setD).catch((e) => setErro(e.message));
  }, []);

  const pendentes = (d?.documentos || []).filter((x) => !x.assinadoEm);
  const assinados = (d?.documentos || []).filter((x) => x.assinadoEm);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0D1F3C]">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-7 shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{d?.nome || "Seus documentos"}</p>
              <p className="text-[11px] text-white/60 truncate">{d?.email || ""}</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/entrar" })}
            className="text-[12px] text-white/70 hover:text-white inline-flex items-center gap-1.5 shrink-0">
            <LogOut size={14} /> sair
          </button>
        </div>
        <div className="h-1 bg-[#F4801F]" />
      </div>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
        {erro && <p className="text-sm text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={15} /> {erro}</p>}
        {!d && !erro && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>}

        {d && (
          <>
            <section>
              <h2 className="text-sm font-bold text-torg-dark mb-2 inline-flex items-center gap-2"><PenLine size={15} className="text-torg-blue" /> Esperando a sua assinatura</h2>
              {!pendentes.length ? (
                <p className="text-[13px] text-torg-gray bg-white border border-gray-200 rounded-xl p-4">Nenhum documento esperando por você agora.</p>
              ) : (
                <div className="space-y-2">
                  {pendentes.map((x) => (
                    <a key={x.link} href={x.link} className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-torg-blue hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-torg-dark truncate">{x.titulo}</p>
                          <p className="text-[11.5px] text-torg-gray mt-0.5">
                            {[fmtOP(x.opNumero), x.papel, x.enviadoEm ? `enviado em ${fmtDT(x.enviadoEm)}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {x.revisaoPedida
                          ? <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700 inline-flex items-center gap-1"><RotateCcw size={11} /> em revisão</span>
                          : x.aguardandoVez
                            ? <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-torg-gray inline-flex items-center gap-1"><Clock size={11} /> aguardando a vez</span>
                            : <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-torg-blue text-white inline-flex items-center gap-1"><FileText size={11} /> abrir e assinar</span>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold text-torg-dark mb-2 inline-flex items-center gap-2"><Globe size={15} className="text-torg-blue" /> Portais das suas obras</h2>
              {!d.portais.length ? (
                <p className="text-[13px] text-torg-gray bg-white border border-gray-200 rounded-xl p-4">
                  Você ainda não recebeu o portal de nenhuma obra. Quando a Torg publicar, o link chega no seu e-mail e aparece aqui.
                </p>
              ) : (
                <div className="space-y-2">
                  {d.portais.map((p) => (
                    <a key={p.link} href={p.link} className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-torg-blue hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-torg-dark truncate">{p.obra || fmtOP(p.opNumero)}</p>
                          <p className="text-[11.5px] text-torg-gray mt-0.5">
                            {[fmtOP(p.opNumero), p.cliente, p.ultimoAcessoEm ? `último acesso ${fmtDT(p.ultimoAcessoEm)}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <ExternalLink size={15} className="text-torg-gray shrink-0" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>

            {assinados.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-torg-dark mb-2 inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-600" /> Já assinados por você</h2>
                <div className="space-y-1.5">
                  {assinados.map((x) => (
                    <a key={x.link} href={x.link} className="block bg-white border border-gray-100 rounded-lg px-4 py-2.5 hover:border-gray-300">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12.5px] text-torg-dark truncate">{x.titulo}</p>
                        <span className="text-[11px] text-emerald-700 shrink-0">{fmtDT(x.assinadoEm)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
