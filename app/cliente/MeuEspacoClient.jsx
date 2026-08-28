"use client";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import {
  FileText, Loader2, CheckCircle2, Clock, ExternalLink, Globe, LogOut, PenLine,
  AlertCircle, RotateCcw, Download, ChevronDown, ChevronRight, Building2,
} from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");
const PADRAO_PIT = { PINTURA: "Pintura", GALVANIZACAO: "Galvanização", GALV_PINTURA: "Galvanização + pintura", SNQC: "SNQC", BASICO: "Básico" };
const TIPO_DB = { PADRAO_TORG: "Padrão Torg", SNQC: "SNQC", RELATORIO_ACOMPANHAMENTO: "Relatório de acompanhamento" };

/** Um dado da obra — só aparece quando tem valor: campo vazio em documento de cliente é ruído. */
function Dado({ rot, v }) {
  if (!v) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-torg-gray-light">{rot}</p>
      <p className="text-[12.5px] text-torg-dark truncate" title={String(v)}>{v}</p>
    </div>
  );
}

function Documento({ d }) {
  const assinado = !!d.assinadoEm;
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2.5 hover:border-gray-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-torg-dark truncate">{d.titulo}</p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            {[
              d.papel,
              d.revisao != null ? `R${String(d.revisao).padStart(2, "0")}` : null,
              assinado ? `assinado em ${fmtDT(d.assinadoEm)}` : d.enviadoEm ? `enviado em ${fmtDT(d.enviadoEm)}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        {assinado
          ? <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={11} /> assinado</span>
          : d.revisaoPedida
            ? <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700 inline-flex items-center gap-1"><RotateCcw size={11} /> em revisão</span>
            : d.aguardandoVez
              ? <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-torg-gray inline-flex items-center gap-1"><Clock size={11} /> aguardando a vez</span>
              : <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-torg-blue text-white inline-flex items-center gap-1"><PenLine size={11} /> a assinar</span>}
      </div>

      {/* ⚠ ABRIR E BAIXAR valem antes e depois de assinar: quem assina precisa ler antes, e quem
          assinou precisa da cópia do que assinou. (Vitor, 28/08/2026.) */}
      <div className="flex items-center gap-3 mt-2">
        <a href={d.pdf} target="_blank" rel="noreferrer"
          className="text-[11.5px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
          <FileText size={12} /> abrir o PDF
        </a>
        <a href={d.pdf} download
          className="text-[11.5px] font-semibold text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
          <Download size={12} /> baixar
        </a>
        {!assinado && (
          <a href={d.link} className="text-[11.5px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1 ml-auto">
            <PenLine size={12} /> abrir para assinar
          </a>
        )}
      </div>
    </div>
  );
}

export default function MeuEspacoClient() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null); // OP expandida

  useEffect(() => {
    fetch("/api/cliente/meu-espaco", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Não consegui carregar as suas obras."))))
      .then((j) => { setD(j); setAberta(j.obras?.[0]?.opNumero || null); })
      .catch((e) => setErro(e.message));
  }, []);

  const totalPendentes = (d?.obras || []).reduce((t, o) => t + o.pendentes, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#0D1F3C]">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/torg-logo-white.png" alt="Torg Metal" className="h-7 shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{d?.nome || "Suas obras"}</p>
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

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-4">
        {erro && <p className="text-sm text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={15} /> {erro}</p>}
        {!d && !erro && <p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p>}

        {d && !d.obras.length && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <Building2 size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-[13.5px] font-medium text-torg-dark">Nenhuma obra vinculada a você ainda</p>
            <p className="text-[12px] text-torg-gray mt-1">
              Assim que a Torg enviar um documento ou publicar o portal de uma obra para <b>{d.email}</b>, ela aparece aqui.
            </p>
          </div>
        )}

        {d && d.obras.length > 0 && (
          <p className="text-[12.5px] text-torg-gray">
            {d.obras.length} {d.obras.length === 1 ? "obra" : "obras"}
            {totalPendentes > 0 && <> · <b className="text-torg-dark">{totalPendentes}</b> {totalPendentes === 1 ? "documento espera" : "documentos esperam"} a sua assinatura</>}
          </p>
        )}

        {(d?.obras || []).map((o) => {
          const aberto = aberta === o.opNumero;
          return (
            <section key={o.opNumero} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setAberta(aberto ? null : o.opNumero)} className="w-full text-left px-5 py-4 hover:bg-gray-50/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-torg-dark truncate">
                      <span className="font-mono text-torg-blue">{fmtOP(o.opNumero)}</span>
                      {o.obra ? ` · ${o.obra}` : ""}
                    </p>
                    <p className="text-[11.5px] text-torg-gray mt-0.5 truncate">{[o.cliente, o.refCliente ? `ref. ${o.refCliente}` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {o.pendentes > 0 && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-torg-blue text-white">{o.pendentes} a assinar</span>
                    )}
                    {aberto ? <ChevronDown size={16} className="text-torg-gray" /> : <ChevronRight size={16} className="text-torg-gray" />}
                  </div>
                </div>
              </button>

              {aberto && (
                <div className="px-5 pb-5 space-y-4">
                  {/* ⚠ os dados da obra como foram registrados na abertura da OP — é o que o cliente
                      confere para saber que está olhando a obra certa. */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50/70 border border-gray-100 rounded-lg p-3">
                    <Dado rot="Obra" v={o.obra} />
                    <Dado rot="Ref. do cliente" v={o.refCliente} />
                    <Dado rot="Nº do pedido" v={o.pedidoCliente} />
                    <Dado rot="Local de entrega" v={o.local} />
                    <Dado rot="Contato" v={o.contato} />
                    <Dado rot="Início" v={fmtD(o.dataInicio)} />
                    <Dado rot="Previsão de término" v={fmtD(o.dataFimPrevista)} />
                    <Dado rot="Data Book" v={TIPO_DB[o.tipoDataBook] || o.tipoDataBook} />
                    <Dado rot="Padrão de inspeção" v={PADRAO_PIT[o.pitPadrao] || o.pitPadrao} />
                    <Dado rot="Descrição" v={o.descricao} />
                  </div>

                  {o.portal && (
                    <a href={o.portal.link} className="flex items-center justify-between gap-3 border border-torg-blue-300 bg-torg-blue-50/40 rounded-lg px-3 py-2.5 hover:bg-torg-blue-50">
                      <span className="text-[12.5px] font-semibold text-torg-blue inline-flex items-center gap-1.5">
                        <Globe size={14} /> Abrir o portal desta obra
                      </span>
                      <ExternalLink size={14} className="text-torg-blue shrink-0" />
                    </a>
                  )}

                  {!o.documentos.length ? (
                    <p className="text-[12.5px] text-torg-gray">Nenhum documento seu nesta obra ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {o.documentos.map((doc) => <Documento key={doc.link} d={doc} />)}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
