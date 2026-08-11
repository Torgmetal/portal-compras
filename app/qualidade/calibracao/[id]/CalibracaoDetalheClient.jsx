"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, Loader2, Save, CheckCircle2, XCircle, RotateCcw, FileDown, AlertCircle, Upload, Paperclip, X, Plus, Trash2, Eye, ShieldCheck, ScanSearch, AlertTriangle } from "lucide-react";
import { numRAC, SITUACOES, CONCLUSAO, conclusaoLabel, criteriosPadrao, sugerirConclusao, fmtPercent } from "@/lib/calibracao";

const fmtNum = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }));

const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2";

export default function CalibracaoDetalheClient({ id }) {
  const [doc, setDoc] = useState(null);
  const [av, setAv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState("");
  const [analisando, setAnalisando] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/calibracao/${id}`).then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.error))))).then((j) => {
      setDoc(j.documento);
      setAv({ ...j.avaliacao, criterios: Array.isArray(j.avaliacao.criterios) && j.avaliacao.criterios.length ? j.avaliacao.criterios : criteriosPadrao() });
    }).catch((e) => setErro(e.message || "Erro ao carregar")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const setD = (k, v) => setDoc((p) => ({ ...p, [k]: v }));
  const setA = (k, v) => setAv((p) => ({ ...p, [k]: v }));
  const setCrit = (i, k, v) => setAv((p) => ({ ...p, criterios: p.criterios.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const addCrit = () => setAv((p) => ({ ...p, criterios: [...p.criterios, { criterio: "", situacao: "NA", observacao: "" }] }));
  const rmCrit = (i) => setAv((p) => ({ ...p, criterios: p.criterios.filter((_, j) => j !== i) }));

  const payload = (extra = {}) => ({
    documento: { nome: doc.nome, norma: doc.norma, numeroDocumento: doc.numeroDocumento, dataEmissao: toInput(doc.dataEmissao) || null, dataValidade: toInput(doc.dataValidade) || null },
    identificacao: av.identificacao, faixaUso: av.faixaUso, laboratorio: av.laboratorio,
    criterios: av.criterios.filter((c) => (c.criterio || "").trim()),
    criterioAceitacao: av.criterioAceitacao, parecer: av.parecer,
    erroMaxPercent: av.erroMaxPercent === "" || av.erroMaxPercent == null ? null : Number(av.erroMaxPercent),
    ...extra,
  });

  async function salvar(extra, msg) {
    setErro(""); setOk(""); setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/calibracao/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(extra)) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setOk(msg || "Salvo."); carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function subirAnexo(file, campo) {
    setErro(""); setEnviando(campo);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blob = await upload(`qualidade-calibracao/${campo}/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
      const key = campo === "foto" ? "fotoEquipamento" : "relatorio";
      const r = await fetch(`/api/qualidade/calibracao/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: { url: blob.url, nome: file.name } }) });
      if (!r.ok) throw new Error("Falha ao salvar anexo");
      carregar();
    } catch (e) { setErro("Falha no upload: " + (e.message || "erro")); } finally { setEnviando(""); }
  }
  async function removerAnexo(campo) {
    setEnviando(campo);
    try { await fetch(`/api/qualidade/calibracao/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campo === "foto" ? { removerFoto: true } : { removerRelatorio: true }) }); carregar(); }
    finally { setEnviando(""); }
  }
  async function analisar() {
    setErro(""); setOk(""); setAnalisando(true);
    try {
      const r = await fetch(`/api/qualidade/calibracao/${id}/analisar`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Falha ao analisar o certificado");
      const rp = j.analise?.resumoPontos || {};
      setOk(`Análise concluída — ${rp.total || 0} ponto(s), pior erro ${fmtPercent(rp.piorErroPercent)}, ${j.padroesVencidos || 0} padrão(ões) vencido(s).`);
      carregar();
    } catch (e) { setErro(e.message); } finally { setAnalisando(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin" /></div>;
  if (erro && !doc) return <div className="py-16 text-center"><p className="text-red-600 text-sm mb-3">{erro}</p><Link href="/qualidade/calibracao" className="text-torg-blue text-sm">← Voltar</Link></div>;

  const temFoto = !!av.fotoEquipamentoUrl, temRel = !!av.relatorioUrl;
  const podeAvaliar = temFoto && temRel;
  const temCertificado = !!(doc.arquivoUrl || doc.sharepointItemId);
  const sugestao = sugerirConclusao(av.criterios);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/qualidade/calibracao" className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2"><ArrowLeft size={12} /> Calibração</Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
              <span className="font-mono text-torg-blue">{numRAC(av.numero)}</span> {doc.nome}
            </h1>
            <p className="text-xs text-torg-gray mt-0.5">Avaliação do certificado de calibração · PO-20</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${CONCLUSAO[av.conclusao]?.cor}`}>{conclusaoLabel(av.conclusao)}</span>
            <a href={`/api/qualidade/calibracao/${id}/pdf`} target="_blank" rel="noreferrer" className="px-3 py-2 bg-white text-torg-dark border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2 text-sm"><FileDown size={15} /> Relatório PDF</a>
          </div>
        </div>
      </div>

      {av.conclusao !== "PENDENTE" && (
        <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${av.conclusao === "APROVADO" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {av.conclusao === "APROVADO" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          Certificado <strong>{conclusaoLabel(av.conclusao).toLowerCase()}</strong>{av.avaliadorNome ? ` por ${av.avaliadorNome}` : ""}{av.avaliadoEm ? ` em ${fmtDT(av.avaliadoEm)}` : ""}.
        </div>
      )}

      {/* Certificado + metadados */}
      <Secao titulo="Certificado">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs text-torg-gray">Dados do certificado de calibração (edite se precisar completar).</p>
          {(doc.arquivoUrl || doc.sharepointItemId) && <a href={`/api/qualidade/documentos/${id}/download?inline=1`} target="_blank" rel="noreferrer" className="text-sm text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5 font-medium shrink-0"><Eye size={15} /> Abrir certificado</a>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Campo label="Equipamento"><input value={doc.nome || ""} onChange={(e) => setD("nome", e.target.value)} className={inp} /></Campo></div>
          <Campo label="Identificação (tag / nº série)"><input value={av.identificacao || ""} onChange={(e) => setA("identificacao", e.target.value)} className={inp} /></Campo>
          <Campo label="Faixa de uso"><input value={av.faixaUso || ""} onChange={(e) => setA("faixaUso", e.target.value)} className={inp} /></Campo>
          <Campo label="Laboratório"><input value={av.laboratorio || ""} onChange={(e) => setA("laboratorio", e.target.value)} className={inp} /></Campo>
          <Campo label="Nº do certificado"><input value={doc.numeroDocumento || ""} onChange={(e) => setD("numeroDocumento", e.target.value)} className={inp} /></Campo>
          <Campo label="Data de calibração"><input type="date" value={toInput(doc.dataEmissao)} onChange={(e) => setD("dataEmissao", e.target.value)} className={inp} /></Campo>
          <Campo label="Validade"><input type="date" value={toInput(doc.dataValidade)} onChange={(e) => setD("dataValidade", e.target.value)} className={inp} /></Campo>
          <div className="sm:col-span-2"><Campo label="Norma / referência"><input value={doc.norma || ""} onChange={(e) => setD("norma", e.target.value)} className={inp} placeholder="ISO/IEC 17025 · NBR ISO 10012" /></Campo></div>
        </div>
      </Secao>

      {/* Análise do certificado (IA) */}
      <Secao titulo="Análise do certificado (IA)">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Erro máx. admissível (%)</label>
              <input type="number" step="0.1" min="0" value={av.erroMaxPercent ?? ""} onChange={(e) => setA("erroMaxPercent", e.target.value)} onBlur={() => salvar({}, "Limite aplicado.")} placeholder="20" className="w-36 text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <p className="text-[11px] text-torg-gray max-w-[240px] leading-tight">Padrão PO-20 = <strong>20%</strong> do valor nominal (erro + incerteza). Editável por equipamento; vazio usa o EMP do certificado.</p>
          </div>
          <button onClick={analisar} disabled={analisando || !temCertificado} title={!temCertificado ? "Certificado sem arquivo" : ""} className="px-4 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2 text-sm disabled:opacity-50">{analisando ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />} {av.analise ? "Reanalisar certificado" : "Analisar certificado"}</button>
        </div>
        {av.analise ? <AnaliseResultado a={av.analise} /> : (
          <div className="text-center py-6 text-torg-gray text-sm bg-gray-50/60 rounded-lg border border-dashed border-gray-200">
            <ScanSearch size={22} className="mx-auto mb-1.5 text-gray-300" />
            A IA lê o certificado, converte os erros em % (base = valor nominal) e confere se os padrões usados na calibração estão na validade. Os critérios abaixo são pré-preenchidos pelo resultado.
          </div>
        )}
      </Secao>

      {/* Anexos obrigatórios */}
      <Secao titulo="Anexos (obrigatórios para avaliar)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Anexo label="Foto do equipamento" campo="foto" url={av.fotoEquipamentoUrl} nome={av.fotoEquipamentoNome} img accept="image/*" enviando={enviando === "foto"} onPick={(f) => subirAnexo(f, "foto")} onRemove={() => removerAnexo("foto")} />
          <Anexo label="Relatório" campo="relatorio" url={av.relatorioUrl} nome={av.relatorioNome} accept="application/pdf,image/*" enviando={enviando === "relatorio"} onPick={(f) => subirAnexo(f, "relatorio")} onRemove={() => removerAnexo("relatorio")} />
        </div>
        {!podeAvaliar && <p className="text-[12px] text-amber-600 mt-3 flex items-center gap-1"><AlertCircle size={13} /> Anexe a foto do equipamento e o relatório para liberar Aprovar/Reprovar.</p>}
      </Secao>

      {/* Critérios */}
      <Secao titulo="Critérios de avaliação (PO-20)">
        <div className="space-y-2">
          {av.criterios.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start">
              <textarea value={c.criterio} onChange={(e) => setCrit(i, "criterio", e.target.value)} rows={1} className="col-span-6 text-[13px] border border-gray-300 rounded-lg px-2.5 py-2 resize-none" placeholder="Critério" />
              <select value={c.situacao || "NA"} onChange={(e) => setCrit(i, "situacao", e.target.value)} className={`col-span-2 text-[13px] border rounded-lg px-2 py-2 font-medium ${c.situacao === "CONFORME" ? "border-emerald-300 text-emerald-700" : c.situacao === "NAO_CONFORME" ? "border-red-300 text-red-700" : "border-gray-300 text-torg-gray"}`}>
                {SITUACOES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <input value={c.observacao || ""} onChange={(e) => setCrit(i, "observacao", e.target.value)} className="col-span-3 text-[13px] border border-gray-300 rounded-lg px-2.5 py-2" placeholder="Observação" />
              <button onClick={() => rmCrit(i)} className="col-span-1 text-gray-400 hover:text-red-500 flex justify-center pt-2" title="Remover"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button onClick={addCrit} className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 mt-3"><Plus size={13} /> Adicionar critério</button>
      </Secao>

      {/* Aceitação + parecer */}
      <Secao titulo="Critério de aceitação e parecer">
        <Campo label="Critério de aceitação (PO-20)"><textarea value={av.criterioAceitacao || ""} onChange={(e) => setA("criterioAceitacao", e.target.value)} rows={2} className={inp} /></Campo>
        <div className="mt-3"><Campo label="Parecer da avaliação"><textarea value={av.parecer || ""} onChange={(e) => setA("parecer", e.target.value)} rows={3} className={inp} placeholder="Conclusão técnica sobre a calibração do equipamento." /></Campo></div>
      </Secao>

      {erro && <p className="text-[13px] text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>}
      {ok && <p className="text-[13px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> {ok}</p>}

      {/* Ações */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-8 px-8 py-3 flex items-center justify-between gap-2 flex-wrap">
        <button onClick={() => salvar({}, "Alterações salvas.")} disabled={salvando} className="px-4 py-2 bg-white text-torg-dark border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2 text-sm disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar</button>
        <div className="flex items-center gap-2">
          {av.conclusao !== "PENDENTE" && <button onClick={() => salvar({ conclusao: "PENDENTE" }, "Reaberto.")} disabled={salvando} className="px-3 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"><RotateCcw size={14} /> Reabrir</button>}
          <button onClick={() => salvar({ conclusao: "REPROVADO" }, "Reprovado.")} disabled={salvando || !podeAvaliar} title={!podeAvaliar ? "Anexe foto e relatório" : ""} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold flex items-center gap-2 text-sm disabled:opacity-40"><XCircle size={16} /> Reprovar</button>
          <button onClick={() => salvar({ conclusao: "APROVADO" }, "Aprovado.")} disabled={salvando || !podeAvaliar} title={!podeAvaliar ? "Anexe foto e relatório" : ""} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold flex items-center gap-2 text-sm disabled:opacity-40"><CheckCircle2 size={16} /> Aprovar</button>
        </div>
      </div>
      {podeAvaliar && av.conclusao === "PENDENTE" && <p className="text-[11px] text-torg-gray text-right -mt-3 inline-flex items-center gap-1 justify-end w-full"><ShieldCheck size={12} className="text-emerald-600" /> Sugestão pelos critérios: <strong>{conclusaoLabel(sugestao)}</strong></p>}
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-sm font-bold text-torg-dark mb-3">{titulo}</h2>
      {children}
    </div>
  );
}
function Campo({ label, children }) { return <div><label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>{children}</div>; }

function AnaliseResultado({ a }) {
  const rp = a.resumoPontos || {}, rq = a.resumoPadroes || {};
  const dt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-[11px]">
        {a.acreditacao && <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">Acreditação: {a.acreditacao}</span>}
        <span className={`px-2 py-1 rounded-full font-medium ${rp.resultado === "REPROVADO" ? "bg-red-50 text-red-700" : rp.resultado === "APROVADO" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>Pontos: {rp.naoConformes || 0}/{rp.avaliados || 0} fora · pior {fmtPercent(rp.piorErroPercent)}</span>
        <span className={`px-2 py-1 rounded-full font-medium ${rq.vencidos > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>Padrões: {rq.vencidos || 0} vencido(s) de {rq.total || 0}</span>
      </div>
      {Array.isArray(a.pontos) && a.pontos.length > 0 && (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-[11.5px]">
            <thead className="bg-gray-50 text-torg-gray"><tr>
              <th className="text-left px-2.5 py-1.5 font-medium">Nominal{a.unidade ? ` (${a.unidade})` : ""}</th>
              <th className="text-left px-2.5 py-1.5 font-medium">Erro</th>
              <th className="text-left px-2.5 py-1.5 font-medium">Incerteza</th>
              <th className="text-left px-2.5 py-1.5 font-medium">Erro %</th>
              <th className="text-left px-2.5 py-1.5 font-medium">Limite %</th>
              <th className="text-center px-2.5 py-1.5 font-medium">Situação</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {a.pontos.map((p, i) => (
                <tr key={i} className={p.conforme === false ? "bg-red-50/40" : ""}>
                  <td className="px-2.5 py-1.5 text-torg-dark">{fmtNum(p.nominal)}</td>
                  <td className="px-2.5 py-1.5 text-torg-dark">{fmtNum(p.erro)}</td>
                  <td className="px-2.5 py-1.5 text-torg-gray">{p.incerteza != null ? fmtNum(p.incerteza) : "—"}</td>
                  <td className="px-2.5 py-1.5 text-torg-dark">{fmtPercent(p.erroPercent)}</td>
                  <td className="px-2.5 py-1.5 text-torg-gray">{p.limitePercent != null ? fmtPercent(p.limitePercent) : "—"}</td>
                  <td className="px-2.5 py-1.5 text-center font-semibold">{p.conforme === true ? <span className="text-emerald-600">Conforme</span> : p.conforme === false ? <span className="text-red-600">Fora</span> : <span className="text-gray-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(a.padroes) && a.padroes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-torg-dark mb-1.5">Padrões utilizados na calibração (rastreabilidade)</p>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[11.5px]">
              <thead className="bg-gray-50 text-torg-gray"><tr>
                <th className="text-left px-2.5 py-1.5 font-medium">Padrão / instrumento de referência</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Certificado</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Validade</th>
                <th className="text-center px-2.5 py-1.5 font-medium">Situação</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {a.padroes.map((p, i) => (
                  <tr key={i} className={p.vencido === true ? "bg-red-50/40" : ""}>
                    <td className="px-2.5 py-1.5 text-torg-dark">{p.nome}</td>
                    <td className="px-2.5 py-1.5 text-torg-gray">{p.certificado || "—"}</td>
                    <td className="px-2.5 py-1.5 text-torg-dark">{dt(p.validade)}</td>
                    <td className="px-2.5 py-1.5 text-center font-semibold">{p.vencido === true ? <span className="text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> Vencido</span> : p.vencido === false ? <span className="text-emerald-600">Em dia</span> : <span className="text-gray-400">sem data</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {a.extraidoEm && <p className="text-[10px] text-torg-gray">Analisado por IA em {new Date(a.extraidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · confira e ajuste os critérios abaixo se necessário.</p>}
    </div>
  );
}

function Anexo({ label, campo, url, nome, img, accept, enviando, onPick, onRemove }) {
  return (
    <div>
      <label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>
      {url ? (
        <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-3">
          {img && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="w-full max-h-44 object-contain rounded mb-2 bg-white border border-gray-100" /></a>}
          <div className="flex items-center gap-2 text-sm">
            <Paperclip size={14} className="text-emerald-600 shrink-0" />
            <a href={url} target="_blank" rel="noreferrer" className="truncate text-torg-dark hover:text-torg-blue flex-1">{nome || "arquivo"}</a>
            <button onClick={onRemove} disabled={enviando} className="text-gray-400 hover:text-red-500 disabled:opacity-50" title="Remover">{enviando ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}</button>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-1.5 text-sm border border-dashed border-gray-300 rounded-lg px-3 py-6 cursor-pointer hover:border-torg-blue ${enviando ? "opacity-60 pointer-events-none" : ""}`}>
          {enviando ? <Loader2 size={18} className="animate-spin text-torg-gray" /> : <Upload size={18} className="text-torg-gray" />}
          <span className="text-torg-gray text-[13px]">{enviando ? "Enviando…" : "Selecionar arquivo"}</span>
          <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}
