"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Check, X, AlertCircle, Plus, Trash2, Users, ClipboardList } from "lucide-react";

const ESCALA = [
  "Não possui conhecimento", "Conhecimento básico", "Executa com supervisão",
  "Executa com autonomia", "Domina e pode treinar outros",
];
const RAMP = ["#cdd8e1", "#98b6cd", "#5a91bb", "#1b72a8", "#093f66"];
const GRUPOS = [["TECNICA", "Técnica / Segurança", "#006EAB"], ["QUALIDADE", "Qualidade", "#F4801F"], ["DESEMPENHO", "Desempenho", "#1e9e6a"]];
const GRUPO_LABEL = Object.fromEntries(GRUPOS.map((g) => [g[0], g[1]]));
const LEGENDA = [["AA", "Avaliação anual"], ["AS", "Atestado pelo supervisor"], ["C", "Certificado"], ["CV", "Currículo"], ["CP", "Cópia da CTPS"], ["LP", "Lista de presença"], ["OS", "Ordem de serviço"], ["E", "Forma de evidência"]];
const fmtD = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("pt-BR", { timeZone: "UTC" }); };

function LevelBar({ n }) {
  return (
    <span className="inline-flex gap-[3px]" title={`Nível ${n}`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className="w-3.5 h-4 rounded-[3px]" style={{ background: i <= n ? RAMP[n - 1] : "#e5e9ee" }} />)}
    </span>
  );
}
function NivelPicker({ value, onChange, size = 26 }) {
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)} title={ESCALA[i - 1]}
          className="rounded-md text-[11px] font-extrabold grid place-items-center border transition-all"
          style={{ width: size, height: size, ...(i === value ? { background: RAMP[i - 1], color: i < 3 ? "#33475a" : "#fff", borderColor: RAMP[i - 1] } : { background: "#fff", color: "#94a3b8", borderColor: "#e2e8f0" }) }}>
          {i}
        </button>
      ))}
    </span>
  );
}

export default function CargoMatrizClient({ cargoId }) {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/rh/competencias/${cargoId}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!j?.cargo) return setErro("Cargo não encontrado"); setD(j); })
      .catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [cargoId]);
  useEffect(() => { carregar(); }, [carregar]);

  function entrarEdicao() {
    const m = d.cargo.matriz || {};
    setDraft({
      descricao: d.cargo.descricao || "",
      area: d.cargo.area || "",
      competencias: d.competencias.map((c) => ({ nome: c.nome, descricao: c.descricao || "", categoria: c.categoria || "", nivelEsperado: c.nivelEsperado })),
      matriz: {
        revisao: m.revisao || "", revisadaEm: m.revisadaEm ? String(m.revisadaEm).slice(0, 10) : "", status: m.status || "",
        escolaridadeObrigatoria: m.escolaridadeObrigatoria || "", escolaridadeDesejavel: m.escolaridadeDesejavel || "",
        experienciaAdmissao: m.experienciaAdmissao || "", experienciaPromocao: m.experienciaPromocao || "",
        qualificacoes: Array.isArray(m.qualificacoes) ? m.qualificacoes.map((q) => ({ grupo: q.grupo, item: q.item || "", evidencia: q.evidencia || "" })) : [],
        emitidoPor: m.emitidoPor || "", aprovadoPor: m.aprovadoPor || "",
      },
    });
    setErro(""); setEdit(true);
  }

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const competencias = draft.competencias.filter((c) => (c.nome || "").trim())
        .map((c) => ({ nome: c.nome.trim(), descricao: (c.descricao || "").trim() || null, categoria: (c.categoria || "").trim() || null, nivelEsperado: c.nivelEsperado }));
      const matriz = { ...draft.matriz, qualificacoes: draft.matriz.qualificacoes.filter((q) => (q.item || "").trim()).map((q) => ({ grupo: q.grupo, item: q.item.trim(), evidencia: (q.evidencia || "").trim() || null })) };
      const r = await fetch(`/api/rh/competencias/${cargoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descricao: draft.descricao, area: draft.area, competencias, matriz }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setEdit(false); carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  // helpers de edição do draft
  const setC = (i, k, v) => setDraft((p) => ({ ...p, competencias: p.competencias.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const addC = () => setDraft((p) => ({ ...p, competencias: [...p.competencias, { nome: "", descricao: "", categoria: "", nivelEsperado: 3 }] }));
  const rmC = (i) => setDraft((p) => ({ ...p, competencias: p.competencias.filter((_, j) => j !== i) }));
  const setM = (k, v) => setDraft((p) => ({ ...p, matriz: { ...p.matriz, [k]: v } }));
  const setQ = (i, k, v) => setDraft((p) => ({ ...p, matriz: { ...p.matriz, qualificacoes: p.matriz.qualificacoes.map((q, j) => (j === i ? { ...q, [k]: v } : q)) } }));
  const addQ = (grupo) => setDraft((p) => ({ ...p, matriz: { ...p.matriz, qualificacoes: [...p.matriz.qualificacoes, { grupo, item: "", evidencia: "" }] } }));
  const rmQ = (idx) => setDraft((p) => ({ ...p, matriz: { ...p.matriz, qualificacoes: p.matriz.qualificacoes.filter((_, j) => j !== idx) } }));

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro && !d) return <div className="py-20 text-center text-red-600 text-sm">{erro} · <Link href="/rh/competencias" className="text-torg-blue underline">voltar</Link></div>;

  const { cargo, competencias, funcionarios } = d;
  const matriz = cargo.matriz || {};
  const temMatriz = competencias.length > 0;
  const media = temMatriz ? (competencias.reduce((s, c) => s + c.nivelEsperado, 0) / competencias.length) : 0;
  const somaEsp = competencias.reduce((s, c) => s + c.nivelEsperado, 0) || 1;
  const qualif = Array.isArray(matriz.qualificacoes) ? matriz.qualificacoes : [];
  const grupos = GRUPOS.map(([g]) => [g, qualif.filter((q) => q.grupo === g)]).filter(([, l]) => l.length);
  const dist = [1, 2, 3, 4, 5].map((lv) => competencias.filter((c) => c.nivelEsperado === lv).length);
  const pctFunc = (f) => { let a = 0; for (const c of competencias) a += Math.min(f.niveis[c.competenciaId] || 0, c.nivelEsperado); return Math.round((a / somaEsp) * 100); };

  return (
    <div className="space-y-5 max-w-5xl pb-24">
      <div className="flex items-center justify-between gap-3">
        <Link href="/rh/competencias" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><ArrowLeft size={15} /> Matriz de competências</Link>
        {!edit && <button onClick={entrarEdicao} className="px-3.5 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5"><Pencil size={14} /> Editar matriz</button>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Masthead FORM-11 */}
        <div className="bg-torg-dark text-white px-7 py-5 flex justify-between gap-5 flex-wrap items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg grid place-items-center font-extrabold text-lg" style={{ background: "linear-gradient(135deg,#006EAB,#0a4e7a)" }}>T</div>
            <div>
              <div className="text-[11px] tracking-[0.15em] font-semibold uppercase text-sky-200">Torg Metal · Sistema de Gestão da Qualidade</div>
              <div className="text-[17px] font-extrabold mt-0.5">Matriz de Competências e Qualificações</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {(edit ? draft.matriz.status : matriz.status) && !edit && <span className="bg-torg-orange text-[#3a1c00] text-[10px] font-extrabold tracking-wider px-2.5 py-1.5 rounded-full">{matriz.status}</span>}
            <RevBox k="Documento" v="FORM-11" />
            <RevBox k="Revisão" v={(edit ? draft.matriz.revisao : matriz.revisao) || "—"} />
            <RevBox k="Revisado" v={edit ? (draft.matriz.revisadaEm ? fmtD(draft.matriz.revisadaEm) : "—") : (matriz.revisadaEm ? fmtD(matriz.revisadaEm) : "—")} />
          </div>
        </div>
        <div className="h-[5px] bg-torg-orange" />

        {/* Identificação */}
        <div className="px-7 pt-5 pb-1 flex justify-between gap-5 flex-wrap items-end">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10.5px] tracking-[0.16em] uppercase text-torg-gray font-semibold">Função</div>
            <h1 className="text-[26px] font-extrabold text-torg-dark tracking-tight mt-0.5">{cargo.nome}</h1>
            {edit ? (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] text-torg-gray">Área:</span>
                <input value={draft.area} onChange={(e) => setDraft((p) => ({ ...p, area: e.target.value }))} placeholder="Área / setor" className="text-[12px] border border-gray-300 rounded-md px-2 py-1 w-64" />
              </div>
            ) : (
              <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-torg-dark/80 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-torg-blue" /> {cargo.area || "Sem área"}</span>
                {cargo.nivel && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">{cargo.nivel}</span>}
              </div>
            )}
          </div>
          {!edit && (
            <div className="flex gap-2.5">
              <Kpi n={competencias.length} l="Competências" />
              <Kpi n={temMatriz ? media.toFixed(1).replace(".", ",") : "—"} l="Nível médio" tone="blue" />
              <Kpi n={funcionarios.length} l="Funcionários" />
            </div>
          )}
        </div>

        {/* Descrição */}
        <Sec title="Descrição da função" n="1">
          {edit
            ? <textarea value={draft.descricao} onChange={(e) => setDraft((p) => ({ ...p, descricao: e.target.value }))} rows={5} className="w-full text-[13px] border border-gray-300 rounded-lg px-3 py-2" placeholder="Descrição da função…" />
            : <p className="text-[13px] text-torg-dark/85 leading-relaxed whitespace-pre-line">{cargo.descricao || <span className="text-torg-gray italic">Sem descrição.</span>}</p>}
        </Sec>

        {/* Competências */}
        <Sec title="Competências da função" n="2" action={edit && <button onClick={addC} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar</button>}>
          {edit ? (
            <div className="space-y-2">
              {draft.competencias.length === 0 && <p className="text-[12px] text-torg-gray">Nenhuma competência. Clique em “Adicionar”.</p>}
              {draft.competencias.map((c, i) => (
                <div key={i} className="flex gap-2 items-start bg-gray-50/60 border border-gray-200 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input value={c.nome} onChange={(e) => setC(i, "nome", e.target.value)} placeholder="Competência" className="w-full text-[13px] font-semibold border border-gray-200 rounded px-2 py-1.5 bg-white" />
                    <input value={c.descricao} onChange={(e) => setC(i, "descricao", e.target.value)} placeholder="Descrição (o que se espera)" className="w-full text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5 pt-0.5">
                    <NivelPicker value={c.nivelEsperado} onChange={(v) => setC(i, "nivelEsperado", v)} />
                    <button onClick={() => rmC(i)} className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : temMatriz ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_230px] gap-5">
              <div className="flex flex-col">
                {competencias.map((c, i) => (
                  <div key={c.competenciaId} className={`grid grid-cols-[1fr_auto] gap-4 items-center px-2.5 py-2 rounded-lg ${i % 2 ? "" : "bg-gray-50/70"}`}>
                    <div>
                      <div className="font-bold text-[13.5px] text-torg-dark">{c.nome}</div>
                      {c.descricao && <div className="text-[11.5px] text-torg-gray mt-0.5">{c.descricao}</div>}
                    </div>
                    <div className="flex items-center gap-2.5"><LevelBar n={c.nivelEsperado} /><span className="text-[15px] font-extrabold text-torg-dark tabular-nums w-3.5 text-center">{c.nivelEsperado}</span></div>
                  </div>
                ))}
              </div>
              <aside className="space-y-3.5">
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
                  <h4 className="text-[10.5px] tracking-wider uppercase text-torg-gray font-bold mb-3">Distribuição</h4>
                  <div className="flex h-2.5 rounded-md overflow-hidden mb-1.5">{dist.map((n, i) => n ? <span key={i} style={{ flex: n, background: RAMP[i] }} title={`nível ${i + 1}: ${n}`} /> : null)}</div>
                  <div className="flex justify-between text-[10.5px] text-torg-gray tabular-nums"><span>nível 1</span><span>nível 5</span></div>
                </div>
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4">
                  <h4 className="text-[10.5px] tracking-wider uppercase text-torg-gray font-bold mb-3">Escala de avaliação</h4>
                  <div className="flex flex-col gap-2">
                    {ESCALA.map((e, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-[12px] text-torg-dark/80">
                        <span className="w-5 h-5 rounded-md grid place-items-center font-extrabold text-[11px] shrink-0" style={{ background: RAMP[i], color: i < 2 ? "#33475a" : "#fff" }}>{i + 1}</span> {e}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          ) : (
            <p className="text-[13px] text-torg-gray">Sem competências. Clique em <b>Editar matriz</b> para começar.</p>
          )}
        </Sec>

        {/* Requisitos */}
        <Sec title="Requisitos admissionais ou de promoção" n="3">
          {edit ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-torg-gray">Grau de escolaridade</p>
                <LabeledInput tag="Obrigatório" value={draft.matriz.escolaridadeObrigatoria} onChange={(v) => setM("escolaridadeObrigatoria", v)} />
                <LabeledInput tag="Desejável" value={draft.matriz.escolaridadeDesejavel} onChange={(v) => setM("escolaridadeDesejavel", v)} />
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-torg-gray">Experiência mínima</p>
                <LabeledInput tag="Admissão" value={draft.matriz.experienciaAdmissao} onChange={(v) => setM("experienciaAdmissao", v)} />
                <LabeledInput tag="Promoção" value={draft.matriz.experienciaPromocao} onChange={(v) => setM("experienciaPromocao", v)} />
              </div>
            </div>
          ) : (matriz.escolaridadeObrigatoria || matriz.experienciaAdmissao) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <ReqCard titulo="Grau de escolaridade" itens={[["Obrigatório", matriz.escolaridadeObrigatoria, "obr"], ["Desejável", matriz.escolaridadeDesejavel, "des"]]} />
              <ReqCard titulo="Experiência mínima" itens={[["Admissão", matriz.experienciaAdmissao, "exp"], ["Promoção", matriz.experienciaPromocao, "exp"]]} />
            </div>
          ) : <p className="text-[13px] text-torg-gray">Não informado.</p>}
        </Sec>

        {/* Qualificações */}
        <Sec title="Competências e qualificações exigidas" n="4">
          {edit ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {GRUPOS.map(([g, label, cor]) => (
                <div key={g}>
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-[11px] tracking-wide uppercase font-bold text-torg-dark flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: cor }} /> {label}</h5>
                    <button onClick={() => addQ(g)} className="text-torg-blue hover:text-torg-dark"><Plus size={14} /></button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {draft.matriz.qualificacoes.map((q, idx) => q.grupo === g ? (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <input value={q.item} onChange={(e) => setQ(idx, "item", e.target.value)} placeholder="Item" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                        <input value={q.evidencia} onChange={(e) => setQ(idx, "evidencia", e.target.value)} placeholder="Evid." title="Forma de evidência (CV, C, LP, AA…)" className="w-16 text-[11px] border border-gray-200 rounded px-1.5 py-1.5" />
                        <button onClick={() => rmQ(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    ) : null)}
                  </div>
                </div>
              ))}
            </div>
          ) : grupos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {grupos.map(([g, itens]) => (
                <div key={g}>
                  <h5 className="text-[11px] tracking-wide uppercase font-bold text-torg-dark flex items-center gap-1.5 mb-2.5"><span className="w-2 h-2 rounded-sm" style={{ background: GRUPOS.find((x) => x[0] === g)[2] }} /> {GRUPO_LABEL[g]}</h5>
                  <div className="flex flex-col gap-1.5">
                    {itens.map((q, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-[12px] text-torg-dark/80 px-2.5 py-1.5 bg-gray-50/70 border border-gray-200 rounded-lg">
                        {q.item} {q.evidencia && <span className="text-[9px] font-extrabold text-torg-gray bg-white border border-gray-200 rounded px-1.5 py-0.5 shrink-0">{q.evidencia}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-[13px] text-torg-gray">Não informado.</p>}
        </Sec>

        {/* Revisão (edição) / Matriz de qualificação (leitura) */}
        {edit ? (
          <Sec title="Controle de revisão" n="5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Revisão nº"><input value={draft.matriz.revisao} onChange={(e) => setM("revisao", e.target.value)} placeholder="00" className="inp" /></Field>
              <Field label="Revisado em"><input type="date" value={draft.matriz.revisadaEm} onChange={(e) => setM("revisadaEm", e.target.value)} className="inp" /></Field>
              <Field label="Situação"><input value={draft.matriz.status} onChange={(e) => setM("status", e.target.value)} placeholder="NOVO / REVISADO" className="inp" /></Field>
              <Field label="Emitido por"><input value={draft.matriz.emitidoPor} onChange={(e) => setM("emitidoPor", e.target.value)} className="inp" /></Field>
              <Field label="Aprovado por"><input value={draft.matriz.aprovadoPor} onChange={(e) => setM("aprovadoPor", e.target.value)} className="inp" /></Field>
            </div>
          </Sec>
        ) : (
          <Sec title="Matriz de qualificação — funcionários × competências" n="5" icon={<Users size={13} className="text-torg-blue" />}>
            {!temMatriz ? (
              <div className="text-center py-6"><ClipboardList size={30} className="mx-auto text-gray-300 mb-2" /><p className="text-[13px] text-torg-gray">Adicione competências (Editar matriz) para qualificar os funcionários.</p></div>
            ) : funcionarios.length === 0 ? (
              <p className="text-[13px] text-torg-gray">Nenhum funcionário ativo neste cargo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[560px] border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-2.5 py-2 bg-gray-50 text-[10px] uppercase tracking-wide text-torg-gray font-bold border-b border-gray-200 whitespace-nowrap">Funcionário</th>
                      {competencias.map((c, i) => <th key={c.competenciaId} title={c.nome} className="px-2 py-2 bg-gray-50 text-[10px] text-torg-gray font-bold border-b border-gray-200 tabular-nums">{i + 1}</th>)}
                      <th className="px-2.5 py-2 bg-gray-50 text-[10px] uppercase tracking-wide text-torg-gray font-bold border-b border-gray-200">Qualif.</th>
                    </tr>
                    <tr>
                      <th className="text-left px-2.5 py-1.5 text-[10px] text-torg-gray font-semibold border-b border-gray-200">Nível esperado →</th>
                      {competencias.map((c) => <th key={c.competenciaId} className="px-2 py-1.5 text-[11px] text-torg-dark/70 font-bold border-b border-gray-200 tabular-nums">{c.nivelEsperado}</th>)}
                      <th className="border-b border-gray-200" />
                    </tr>
                  </thead>
                  <tbody>
                    {funcionarios.map((f) => {
                      const p = pctFunc(f); const ok = p >= 85;
                      return (
                        <tr key={f.id}>
                          <td className="px-2.5 py-2 font-bold text-torg-dark whitespace-nowrap border-b border-gray-100">{f.nome}</td>
                          {competencias.map((c) => {
                            const v = f.niveis[c.competenciaId];
                            return <td key={c.competenciaId} className="px-2 py-2 text-center border-b border-gray-100">{v ? <span className="inline-grid place-items-center w-6 h-6 rounded-md text-[11px] font-extrabold tabular-nums" style={{ background: RAMP[v - 1], color: v < 3 ? "#33475a" : "#fff" }}>{v}</span> : <span className="text-gray-300">–</span>}</td>;
                          })}
                          <td className="px-2.5 py-2 border-b border-gray-100 min-w-[92px]">
                            <span className="font-extrabold tabular-nums" style={{ color: ok ? "#1e9e6a" : "#F4801F" }}>{p}%</span>
                            <div className="h-1.5 rounded bg-gray-200 overflow-hidden mt-1"><span className="block h-full" style={{ width: `${p}%`, background: ok ? "#1e9e6a" : "#F4801F" }} /></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-torg-gray mt-2.5">A avaliação do nível atual de cada funcionário será lançada pelo RH — as células “–” ainda não foram avaliadas.</p>
              </div>
            )}
          </Sec>
        )}

        {!edit && (
          <>
            <div className="px-7 py-4 bg-gray-50/70 border-t border-gray-200 flex flex-wrap gap-x-5 gap-y-2">
              {LEGENDA.map(([k, v]) => <span key={k} className="text-[11px] text-torg-gray"><b className="text-torg-dark/80">{k}</b> {v}</span>)}
            </div>
            <div className="px-7 py-3.5 border-t border-gray-200 flex justify-between gap-4 flex-wrap text-[11px] text-torg-gray">
              <div className="flex gap-7 flex-wrap">
                <div><div className="text-[9.5px] tracking-wider uppercase">Emitido por</div><div className="text-torg-dark font-bold text-[12px]">{matriz.emitidoPor || "—"}</div></div>
                <div><div className="text-[9.5px] tracking-wider uppercase">Aprovado por</div><div className="text-torg-dark font-bold text-[12px]">{matriz.aprovadoPor || "—"}</div></div>
              </div>
              <div className="self-end">FORM-11 · documento controlado (ISO 9001 §7.2) · Torg Metal</div>
            </div>
          </>
        )}
      </div>

      {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {edit && (
        <div className="fixed bottom-0 left-64 right-0 bg-white/95 backdrop-blur border-t border-gray-200 px-8 py-3 flex justify-end gap-2 z-20">
          <button onClick={() => { setEdit(false); setErro(""); }} className="px-4 py-2 border border-gray-300 text-torg-gray text-sm rounded-lg hover:bg-gray-50 inline-flex items-center gap-1.5"><X size={15} /> Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar matriz</button>
        </div>
      )}

      <style jsx>{`.inp{width:100%;font-size:12px;border:1px solid #d1d5db;border-radius:8px;padding:6px 10px}`}</style>
    </div>
  );
}

function Sec({ title, n, action, icon, children }) {
  return (
    <div className="px-7 py-5 border-t border-gray-200">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-[11px] font-extrabold text-torg-blue bg-torg-blue-50 w-6 h-6 rounded-md grid place-items-center">{n}</span>
        {icon}
        <h3 className="text-[12.5px] tracking-wider uppercase text-torg-dark font-bold">{title}</h3>
        <div className="flex-1 h-px bg-gray-200" />
        {action}
      </div>
      {children}
    </div>
  );
}
function RevBox({ k, v }) {
  return <div className="bg-white/[0.06] border border-white/15 rounded-lg px-3 py-1.5 min-w-[76px] text-right"><div className="text-[9.5px] tracking-wider uppercase text-sky-200/80">{k}</div><div className="text-[13px] font-bold tabular-nums">{v}</div></div>;
}
function Kpi({ n, l, tone }) {
  return <div className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-center min-w-[74px]"><div className={`text-xl font-extrabold tabular-nums leading-none ${tone === "blue" ? "text-torg-blue" : "text-torg-dark"}`}>{n}</div><div className="text-[9.5px] tracking-wide uppercase text-torg-gray mt-1 font-semibold">{l}</div></div>;
}
function ReqCard({ titulo, itens }) {
  const cor = { obr: "bg-torg-blue text-white", des: "bg-torg-blue-50 text-torg-blue", exp: "bg-emerald-50 text-emerald-700" };
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-torg-dark text-white text-[11px] tracking-wider uppercase font-bold px-3.5 py-2">{titulo}</div>
      <div className="p-3.5 flex flex-col gap-2.5">
        {itens.filter(([, v]) => v).map(([tag, v, t]) => (
          <div key={tag} className="flex gap-2.5 items-start"><span className={`text-[9px] font-extrabold tracking-wide px-2 py-1 rounded shrink-0 ${cor[t]}`}>{tag.toUpperCase()}</span><span className="text-[12.5px] text-torg-dark/80">{v}</span></div>
        ))}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <div><label className="block text-[10.5px] font-semibold text-torg-gray uppercase tracking-wide mb-1">{label}</label>{children}</div>;
}
function LabeledInput({ tag, value, onChange }) {
  return (
    <div className="flex gap-2 items-center">
      <span className="text-[9px] font-extrabold tracking-wide px-2 py-1 rounded shrink-0 bg-gray-100 text-torg-gray w-20 text-center">{tag.toUpperCase()}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
    </div>
  );
}
