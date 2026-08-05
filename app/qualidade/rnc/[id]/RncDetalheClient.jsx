"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, CheckCircle2, AlertCircle, ListChecks, FileDown } from "lucide-react";
import { numRNC, TIPOS_RNC, ORIGEM_NC, DISPOSICAO_NC, NECESSITA_ACAO, STATUS_RNC, statusRncLabel } from "@/lib/nao-conformidade";
import { SETORES_AUDITORIA } from "@/lib/auditoria-interna";

const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function RncDetalheClient({ id }) {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [plano, setPlano] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/rnc/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.rnc) return setErro("RNC não encontrada");
      const r = j.rnc;
      setD({
        ...r, data: dISO(r.data), prazoResposta: dISO(r.prazoResposta), realizadoEm: dISO(r.realizadoEm),
        cincoPorques: Array.from({ length: 5 }, (_, i) => ({ porque: `${i + 1}º porquê`, resposta: (Array.isArray(r.cincoPorques) ? r.cincoPorques[i]?.resposta : "") || "" })),
      });
      setPlano(j.plano || null);
    }).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2600); };
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const setPq = (i, k, v) => setD((p) => ({ ...p, cincoPorques: p.cincoPorques.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  async function salvar(extra = {}) {
    setSalvando(true); setErro("");
    try {
      const body = {
        data: d.data || null, cliente: d.cliente, opNumero: d.opNumero, desenhoProjetoMarca: d.desenhoProjetoMarca,
        origem: d.origem, fornecedor: d.fornecedor, processoArea: d.processoArea, descricao: d.descricao,
        disposicao: d.disposicao, elaborador: d.elaborador, resultadoReinspecao: d.resultadoReinspecao, abrangencia: d.abrangencia,
        necessitaAcao: d.necessitaAcao, motivoNaoAcao: d.motivoNaoAcao, causas: d.causas,
        cincoPorques: d.cincoPorques.map((x, i) => ({ porque: `${i + 1}º porquê`, resposta: (x.resposta || "").trim() })),
        prazoResposta: d.prazoResposta || null, realizadoEm: d.realizadoEm || null, acompanhadoPor: d.acompanhadoPor,
        acompanhamento: d.acompanhamento, avaliacaoEficacia: d.avaliacaoEficacia, encerradaPor: d.encerradaPor,
        pertinente: !!d.pertinente, recorrente: !!d.recorrente,
        ...extra,
      };
      const r = await fetch(`/api/qualidade/rnc/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      flash("RNC salva."); carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function excluir() {
    if (!confirm("Excluir esta RNC? Esta ação não pode ser desfeita.")) return;
    setSalvando(true);
    try { const r = await fetch(`/api/qualidade/rnc/${id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); router.push("/qualidade/rnc"); }
    catch { setErro("Erro ao excluir"); setSalvando(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro && !d) return <div className="py-20 text-center text-red-600 text-sm">{erro} · <Link href="/qualidade/rnc" className="text-torg-blue underline">voltar</Link></div>;

  return (
    <div className="space-y-5 max-w-4xl pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/qualidade/rnc" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><ArrowLeft size={15} /> RNCs</Link>
        <div className="flex items-center gap-2">
          <a href={`/api/qualidade/rnc/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5"><FileDown size={14} /> PDF</a>
          <button onClick={excluir} disabled={salvando} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-torg-gray"><Trash2 size={14} /></button>
        </div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-mono font-bold text-torg-blue text-lg">{numRNC(d.numero, d.ano)}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-torg-blue-50 text-torg-blue">{TIPOS_RNC[d.tipo]?.label || "RNC"}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_RNC[d.status]?.cor}`}>{statusRncLabel(d.status)}</span>
        </div>
        <h1 className="text-xl font-extrabold text-torg-dark tracking-tight">Relatório de Não Conformidade</h1>
      </div>

      {/* Identificação */}
      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Cliente"><input value={d.cliente || ""} onChange={(e) => set("cliente", e.target.value)} className="inp" /></Campo>
          <Campo label="OP / Obra"><input value={d.opNumero || ""} onChange={(e) => set("opNumero", e.target.value)} className="inp" /></Campo>
          <Campo label="Desenho / Projeto / Marca"><input value={d.desenhoProjetoMarca || ""} onChange={(e) => set("desenhoProjetoMarca", e.target.value)} className="inp" /></Campo>
          <Campo label="Processo / Área da ocorrência">
            <select value={d.processoArea || ""} onChange={(e) => set("processoArea", e.target.value)} className="inp">
              <option value="">— selecione o setor —</option>
              {SETORES_AUDITORIA.map((s) => <option key={s} value={s}>{s}</option>)}
              {d.processoArea && !SETORES_AUDITORIA.includes(d.processoArea) && <option value={d.processoArea}>{d.processoArea}</option>}
            </select>
          </Campo>
          <Campo label="Origem da não conformidade">
            <select value={d.origem || ""} onChange={(e) => set("origem", e.target.value)} className="inp"><option value="">—</option>{Object.entries(ORIGEM_NC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Campo>
          {d.origem === "FORNECEDOR" && <Campo label="Fornecedor"><input value={d.fornecedor || ""} onChange={(e) => set("fornecedor", e.target.value)} className="inp" /></Campo>}
          <Campo label="Data"><input type="date" value={d.data || ""} onChange={(e) => set("data", e.target.value)} className="inp" /></Campo>
          <Campo label="Prazo para resposta"><input type="date" value={d.prazoResposta || ""} onChange={(e) => set("prazoResposta", e.target.value)} className="inp" /></Campo>
        </div>
      </Secao>

      {/* Descrição + disposição */}
      <Secao titulo="Não conformidade">
        <Campo label="Descrição da não conformidade"><textarea value={d.descricao || ""} onChange={(e) => set("descricao", e.target.value)} rows={3} className="inp" /></Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Disposição"><select value={d.disposicao || ""} onChange={(e) => set("disposicao", e.target.value)} className="inp"><option value="">—</option>{Object.entries(DISPOSICAO_NC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo label="Necessita de ação"><select value={d.necessitaAcao || ""} onChange={(e) => set("necessitaAcao", e.target.value)} className="inp"><option value="">—</option>{Object.entries(NECESSITA_ACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        </div>
        {d.necessitaAcao === "NAO_NECESSARIO" && <Campo label="Motivo de não necessitar de ação"><input value={d.motivoNaoAcao || ""} onChange={(e) => set("motivoNaoAcao", e.target.value)} className="inp" /></Campo>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Elaborador / responsável"><input value={d.elaborador || ""} onChange={(e) => set("elaborador", e.target.value)} className="inp" /></Campo>
          <Campo label="Abrangência"><input value={d.abrangencia || ""} onChange={(e) => set("abrangencia", e.target.value)} className="inp" /></Campo>
        </div>
        <Campo label="Resultado da reinspeção"><textarea value={d.resultadoReinspecao || ""} onChange={(e) => set("resultadoReinspecao", e.target.value)} rows={2} className="inp" /></Campo>
      </Secao>

      {/* Causa raiz */}
      <Secao titulo="Análise de causa raiz">
        <Campo label="Causas da não conformidade"><textarea value={d.causas || ""} onChange={(e) => set("causas", e.target.value)} rows={2} className="inp" /></Campo>
        <div className="space-y-2 mt-1">
          <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Ferramenta dos 5 porquês <span className="normal-case font-normal text-[10px] text-torg-gray">— preencha os 5</span></p>
          {d.cincoPorques.map((pq, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-torg-gray w-6 shrink-0">{i + 1}º</span>
              <input value={pq.resposta || ""} onChange={(e) => setPq(i, "resposta", e.target.value)} placeholder={`Por que… (${i + 1}º porquê)`} className="flex-1 text-[13px] border border-gray-200 rounded px-2.5 py-1.5" />
            </div>
          ))}
        </div>
      </Secao>

      {/* Plano de ação (5W2H) */}
      <Secao titulo="Plano de ação (5W2H)">
        {plano ? (
          <Link href={`/qualidade/planos-acao/${plano.id}`} className="flex items-center justify-between gap-2 bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg px-3 py-2.5 hover:bg-torg-blue-50">
            <span className="text-[13px] text-torg-dark font-medium inline-flex items-center gap-2"><ListChecks size={15} className="text-torg-blue" /> {plano.titulo} · {(plano.itens || []).length} ação(ões)</span>
            <span className="text-[11px] text-torg-blue">abrir →</span>
          </Link>
        ) : (
          <p className="text-[13px] text-torg-gray">Sem plano de ação vinculado. A geração do 5W2H pela IA entra na próxima etapa.</p>
        )}
      </Secao>

      {/* Acompanhamento + eficácia */}
      <Secao titulo="Acompanhamento e eficácia">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Realizado em"><input type="date" value={d.realizadoEm || ""} onChange={(e) => set("realizadoEm", e.target.value)} className="inp" /></Campo>
          <Campo label="Acompanhado por"><input value={d.acompanhadoPor || ""} onChange={(e) => set("acompanhadoPor", e.target.value)} className="inp" /></Campo>
        </div>
        <Campo label="Acompanhamento da implementação"><textarea value={d.acompanhamento || ""} onChange={(e) => set("acompanhamento", e.target.value)} rows={2} className="inp" /></Campo>
        <Campo label="Avaliação da eficácia"><textarea value={d.avaliacaoEficacia || ""} onChange={(e) => set("avaliacaoEficacia", e.target.value)} rows={2} className="inp" /></Campo>
      </Secao>

      {/* Situação + indicadores */}
      <Secao titulo="Situação e classificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Situação"><select value={d.status} onChange={(e) => set("status", e.target.value)} className="inp">{Object.keys(STATUS_RNC).map((k) => <option key={k} value={k}>{statusRncLabel(k)}</option>)}</select></Campo>
          <Campo label="Encerrada por"><input value={d.encerradaPor || ""} onChange={(e) => set("encerradaPor", e.target.value)} className="inp" /></Campo>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="inline-flex items-center gap-2 text-[13px] text-torg-dark cursor-pointer"><input type="checkbox" checked={!!d.pertinente} onChange={(e) => set("pertinente", e.target.checked)} /> Pertinente <span className="text-[11px] text-torg-gray">(conta no indicador de RNCs)</span></label>
          <label className="inline-flex items-center gap-2 text-[13px] text-torg-dark cursor-pointer"><input type="checkbox" checked={!!d.recorrente} onChange={(e) => set("recorrente", e.target.checked)} /> Recorrente <span className="text-[11px] text-torg-gray">(reincidência)</span></label>
        </div>
      </Secao>

      {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      <div className="fixed bottom-0 left-64 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-8 py-3 flex justify-end z-20">
        <button onClick={() => salvar({ status: d.status })} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Salvar RNC</button>
      </div>

      <style jsx>{`.inp{width:100%;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;background:#fff}`}</style>
    </div>
  );
}

function Secao({ titulo, acao, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-torg-dark">{titulo}</h3>{acao}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Campo({ label, children }) {
  return <div><label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>{children}</div>;
}
