"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2, AlertCircle, ArrowLeft, Weight, ShieldAlert, Plus, X,
  FileText, CheckCircle2, Lock, BookCheck, FileDown,
} from "lucide-react";
import { FONTE_LABEL, ESTADO_DATABOOK } from "@/lib/databook-secoes";
import { STATUS_COR } from "@/lib/qualidade-status";
import { TIPO_DATABOOK_LABEL } from "@/lib/op-opcoes";

const fmtKg = (v) => (!v ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");
const ESTADOS = ["PENDENTE", "ANEXADO", "NA"];

export default function DataBookDetalheClient({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState(null); // secaoId em ação
  const [emitindo, setEmitindo] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao carregar");
      setData(json.data);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function setEstado(secao, estado) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function vincular(secao, documentoId) {
    if (!documentoId) return;
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/doc`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentoId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function desvincular(secao, documentoId) {
    setAcao(secao.id);
    try {
      await fetch(`/api/qualidade/data-books/secao/${secao.id}/doc?documentoId=${encodeURIComponent(documentoId)}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function popularMaterial(secao) {
    setAcao(secao.id);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secao.id}/popular-material`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      if (json.semDocs) {
        alert("Nenhum certificado de material desta OP no Controle de Documentos. Importe o CMR (aba Rastreabilidade) e confira a OP dos certificados.");
      }
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAcao(null);
    }
  }

  async function emitir() {
    if (!confirm("Emitir o data book? (a geração do PDF entra na próxima fase)")) return;
    setEmitindo(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "EMITIDO" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      setData(json.data);
    } catch (e) {
      alert(e.message);
    } finally {
      setEmitindo(false);
    }
  }

  if (loading) return <div className="flex flex-col items-center justify-center py-24 text-torg-gray"><Loader2 size={26} className="animate-spin mb-3" /><p className="text-sm">Carregando data book…</p></div>;
  if (erro) return <div className="flex flex-col items-center justify-center py-20 text-center"><AlertCircle size={26} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>;
  if (!data) return null;

  const r = data.resumo;

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/qualidade/data-books" className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2"><ArrowLeft size={12} /> Data Books</Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-torg-dark flex items-center gap-2">
              <BookCheck size={18} className="text-torg-blue" /> {fmtOP(data.opNumero)} <span className="text-torg-gray font-normal">· {data.cliente || "—"}</span>
            </h1>
            <p className="text-xs text-torg-gray mt-0.5">
              {data.obra ? `${data.obra} · ` : ""}<span className="inline-flex items-center gap-1"><Weight size={11} /> {fmtKg(data.pesoTotalKg)}</span>{data.pecas ? ` · ${data.pecas} peças` : ""}
            </p>
            {data.tipo && (
              <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue font-medium">
                {TIPO_DATABOOK_LABEL[data.tipo] || data.tipo}
              </span>
            )}
          </div>
          <div className="text-right shrink-0 flex items-center gap-2">
            <a href={`/api/qualidade/data-books/${id}/pdf?inline=1`} target="_blank" rel="noreferrer"
              title="Gerar e baixar o PDF do data book (rascunho se ainda incompleto)"
              className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
              <FileDown size={13} /> Baixar PDF
            </a>
            {data.status === "EMITIDO" ? (
              <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Emitido</span>
            ) : (
              <button onClick={emitir} disabled={emitindo || !r.podeEmitir}
                title={r.podeEmitir ? "Emitir data book" : `Faltam ${r.pendentes} seção(ões) e ${r.bloqueadas} com documento vencido`}
                className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                {emitindo ? <Loader2 size={13} className="animate-spin" /> : r.podeEmitir ? <CheckCircle2 size={13} /> : <Lock size={13} />} Emitir data book
              </button>
            )}
          </div>
        </div>

        {/* Progresso */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-torg-gray mb-1">
            <span>{r.anexadas} de {r.obrigatorias} seções obrigatórias · {r.na} N/A</span>
            <span className="font-semibold text-torg-dark">{r.progresso}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-torg-blue rounded-full transition-all" style={{ width: `${r.progresso}%` }} /></div>
          {(r.pendentes > 0 || r.bloqueadas > 0) && data.status !== "EMITIDO" && (
            <p className="text-[11px] text-amber-700 mt-1.5 inline-flex items-center gap-1">
              <Lock size={11} /> Emissão travada: {r.pendentes} pendente(s){r.bloqueadas > 0 ? ` · ${r.bloqueadas} com documento vencido` : ""}.
            </p>
          )}
        </div>
      </div>

      {/* Seções */}
      <p className="text-[11px] text-torg-gray mb-2">
        Selecione as seções que <strong>compõem</strong> este data book — marque como <strong>N/A</strong> as que não se aplicam a esta obra/cliente (não entram no PDF).
      </p>
      <div className="space-y-2">
        {data.secoes.map((s) => (
          <SecaoCard key={s.id} secao={s} candidatos={data.candidatos} acaoLoading={acao === s.id}
            onEstado={(e) => setEstado(s, e)} onVincular={(docId) => vincular(s, docId)} onDesvincular={(docId) => desvincular(s, docId)}
            onPopularMaterial={() => popularMaterial(s)} />
        ))}
      </div>
    </div>
  );
}

function SecaoCard({ secao, candidatos, acaoLoading, onEstado, onVincular, onDesvincular, onPopularMaterial }) {
  const [picker, setPicker] = useState(false);
  const linkedIds = new Set(secao.documentos.map((d) => d.id));
  const disponiveis = candidatos.filter((c) => !linkedIds.has(c.id));

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 ${secao.bloqueada ? "border-red-200" : "border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-torg-dark">
            <span className="text-torg-gray font-mono">{secao.numero}</span> · {secao.titulo}
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            {secao.norma} · <span className="italic">{FONTE_LABEL[secao.fonte] || secao.fonte}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {acaoLoading && <Loader2 size={13} className="animate-spin text-torg-gray" />}
          {ESTADOS.map((e) => (
            <button key={e} onClick={() => onEstado(e)} disabled={acaoLoading}
              className={`text-[10px] px-2 py-1 rounded-lg font-medium border transition-colors disabled:opacity-50 ${
                secao.estado === e ? `${ESTADO_DATABOOK[e].cor} border-transparent` : "border-gray-200 text-torg-gray hover:bg-gray-50"
              }`}>{ESTADO_DATABOOK[e].label}</button>
          ))}
        </div>
      </div>

      {/* Documentos vinculados (seções do Módulo 1) */}
      {secao.usaModulo1 && (
        <div className="mt-2 pt-2 border-t border-gray-50">
          {secao.documentos.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {secao.documentos.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                  <div className="min-w-0 flex items-center gap-2">
                    <FileText size={13} className="text-torg-blue shrink-0" />
                    <span className="text-torg-dark truncate">{d.nome}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.numeroCorrida && <span className="text-torg-gray font-mono text-[11px] whitespace-nowrap">corrida {d.numeroCorrida}</span>}
                    {d.status !== "SEM_VALIDADE" && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COR[d.status]}`}>{d.statusLabel}</span>}
                    {!d.validado && <span className="text-[10px] text-amber-600 whitespace-nowrap">a validar</span>}
                    <button onClick={() => onDesvincular(d.id)} disabled={acaoLoading} className="text-torg-gray hover:text-red-600 disabled:opacity-50"><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-torg-gray italic">Nenhum documento vinculado.</p>
          )}

          {secao.bloqueada && (
            <p className="text-[11px] text-red-700 mt-1 inline-flex items-center gap-1"><ShieldAlert size={12} /> Documento vencido vinculado — renove no Controle de Documentos.</p>
          )}

          {!picker ? (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button onClick={() => setPicker(true)} className="text-[11px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={12} /> Vincular documento</button>
              {secao.numero === "04" && (
                <button onClick={onPopularMaterial} disabled={acaoLoading}
                  className="text-[11px] text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">
                  <FileText size={12} /> Trazer certificados de material desta OP
                </button>
              )}
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <select autoFocus onChange={(e) => { onVincular(e.target.value); setPicker(false); }} defaultValue=""
                className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue">
                <option value="" disabled>Selecione um documento da OP…</option>
                {disponiveis.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}{c.numeroCorrida ? ` (corrida ${c.numeroCorrida})` : ""}{c.status !== "SEM_VALIDADE" ? ` — ${c.statusLabel}` : ""}</option>
                ))}
              </select>
              <button onClick={() => setPicker(false)} className="text-torg-gray hover:text-torg-dark"><X size={14} /></button>
            </div>
          )}
          {picker && disponiveis.length === 0 && <p className="text-[10px] text-torg-gray mt-1">Nenhum documento desta OP no Controle de Documentos. Cadastre na aba “Controle de Documentos” com a OP no campo correspondente.</p>}
        </div>
      )}
    </div>
  );
}
