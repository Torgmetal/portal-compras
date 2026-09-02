"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, CheckCircle2, AlertCircle, ListChecks, FileDown, Plus, Upload, X, FileText, Sparkles } from "lucide-react";
import { numRNC, TIPOS_RNC, ORIGEM_NC, DISPOSICAO_NC, NECESSITA_ACAO, STATUS_RNC, statusRncLabel } from "@/lib/nao-conformidade";
import { SETORES_AUDITORIA } from "@/lib/auditoria-interna";
import { SETORES_RETRABALHO } from "@/lib/retrabalho";
import SeletorPecasLE from "./SeletorPecasLE";

const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default function RncDetalheClient({ id }) {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [plano, setPlano] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [subindoRe, setSubindoRe] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [criandoPlano, setCriandoPlano] = useState(false);
  const [puxandoPeso, setPuxandoPeso] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/rnc/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.rnc) return setErro("RNC não encontrada");
      const r = j.rnc;
      setD({
        ...r, data: dISO(r.data), prazoResposta: dISO(r.prazoResposta), realizadoEm: dISO(r.realizadoEm),
        anexos: Array.isArray(r.anexos) ? r.anexos : [],
        reinspecaoEm: dISO(r.reinspecaoEm),
        reinspecaoFotos: Array.isArray(r.reinspecaoFotos) ? r.reinspecaoFotos : [],
        pecas: Array.isArray(r.pecas) ? r.pecas : [],
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
        tipo: d.tipo,
        data: d.data || null, cliente: d.cliente, opNumero: d.opNumero, desenhoProjetoMarca: d.desenhoProjetoMarca,
        origem: d.origem, fornecedor: d.fornecedor, processoArea: d.processoArea, descricao: d.descricao,
        disposicao: d.disposicao, pecas: Array.isArray(d.pecas) ? d.pecas : null, setorRetrabalho: d.setorRetrabalho || null,
        pesoRetrabalhoKg: Number.isFinite(Number(d.pesoRetrabalhoKg)) && d.pesoRetrabalhoKg !== "" && d.pesoRetrabalhoKg != null ? Number(d.pesoRetrabalhoKg) : null,
        elaborador: d.elaborador, resultadoReinspecao: d.resultadoReinspecao, abrangencia: d.abrangencia,
        necessitaAcao: d.necessitaAcao, motivoNaoAcao: d.motivoNaoAcao, causas: d.causas,
        cincoPorques: d.cincoPorques.map((x, i) => ({ porque: `${i + 1}º porquê`, resposta: (x.resposta || "").trim() })),
        prazoResposta: d.prazoResposta || null, realizadoEm: d.realizadoEm || null, acompanhadoPor: d.acompanhadoPor,
        acompanhamento: d.acompanhamento, avaliacaoEficacia: d.avaliacaoEficacia, encerradaPor: d.encerradaPor,
        pertinente: !!d.pertinente, recorrente: !!d.recorrente,
        numeroCliente: d.numeroCliente, programa: d.programa, jobCliente: d.jobCliente,
        respostaCliente: d.respostaCliente, anexos: d.anexos || [],
        reinspecaoPor: d.reinspecaoPor, reinspecaoEm: d.reinspecaoEm || null, reinspecaoFotos: d.reinspecaoFotos || [],
        ...extra,
      };
      const r = await fetch(`/api/qualidade/rnc/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      flash("RNC salva."); carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  // Tenta preencher o peso de retrabalho a partir das marcas da RNC (cadastro de peças).
  async function puxarPeso() {
    setPuxandoPeso(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/rnc/${id}/peso-marca`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao buscar peso");
      if (j.pesoKg != null) { set("pesoRetrabalhoKg", j.pesoKg); flash(j.aviso || `Peso sugerido: ${j.pesoKg} kg (${j.encontradas.length} marca(s)).`); }
      else flash(j.aviso || "Nenhuma marca localizada no cadastro — informe o peso manualmente.");
    } catch (e) { setErro(e.message); } finally { setPuxandoPeso(false); }
  }

  async function excluir() {
    if (!confirm("Excluir esta RNC? Esta ação não pode ser desfeita.")) return;
    setSalvando(true);
    try { const r = await fetch(`/api/qualidade/rnc/${id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); router.push("/qualidade/rnc"); }
    catch { setErro("Erro ao excluir"); setSalvando(false); }
  }

  // Anexos — sobem DIRETO pro Blob por token (evita o limite de ~4,5MB do corpo);
  // guardamos só {url, nome, tipo} e persistimos na hora.
  async function anexar(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setErro(""); setSubindo(true);
    try {
      const { upload } = await import("@vercel/blob/client");
      const novos = [];
      for (const file of files) {
        const safe = (file.name || "anexo").replace(/[^\w.-]+/g, "-");
        const blob = await upload(`qualidade/rnc/anexos/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
        novos.push({ url: blob.url, nome: file.name || "anexo", tipo: file.type || "" });
      }
      const anexos = [...(d.anexos || []), ...novos];
      setD((p) => ({ ...p, anexos }));
      await salvar({ anexos });
      // RNC de cliente: ao anexar o PDF/imagem, já extrai os dados (se ainda falta preencher).
      const alvo = novos.find((n) => n.tipo === "application/pdf") || novos.find((n) => String(n.tipo).startsWith("image/"));
      const precisa = !(d.cliente && d.cliente.trim()) || !(d.descricao && d.descricao.trim());
      if (d.tipo === "CLIENTE" && alvo && precisa) await extrairDoAnexo(alvo);
    } catch (e) { setErro("Falha no anexo: " + e.message); } finally { setSubindo(false); }
  }
  // ⚠⚠ FOTO DA REINSPEÇÃO É UM CAMPO À PARTE, NÃO MAIS UM ANEXO. Vitor (02/09/2026): "precisamos
  // criar nas RNCs a forma de evidenciar que foi reinspecionado (…) deixa o registro fotográfico
  // separado nesse caso para ficar melhor".
  // A foto do defeito e a foto do defeito RESOLVIDO contam histórias opostas; jogadas no mesmo
  // monte, o PDF mostra as duas embaixo de "REGISTRO FOTOGRÁFICO" e quem lê não sabe qual é o antes
  // e qual é o depois — que é exatamente a evidência que a reinspeção existe para dar.
  async function anexarReinspecao(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setErro(""); setSubindoRe(true);
    try {
      const { upload } = await import("@vercel/blob/client");
      const novos = [];
      for (const file of files) {
        const safe = (file.name || "foto").replace(/[^\w.-]+/g, "-");
        const blob = await upload(`qualidade/rnc/reinspecao/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
        novos.push({ url: blob.url, nome: file.name || "foto", tipo: file.type || "" });
      }
      const reinspecaoFotos = [...(d.reinspecaoFotos || []), ...novos];
      setD((p) => ({ ...p, reinspecaoFotos }));
      await salvar({ reinspecaoFotos });
    } catch (e) { setErro("Falha no anexo: " + e.message); } finally { setSubindoRe(false); }
  }
  function removerFotoRe(url) {
    const reinspecaoFotos = (d.reinspecaoFotos || []).filter((a) => a.url !== url);
    setD((p) => ({ ...p, reinspecaoFotos }));
    salvar({ reinspecaoFotos });
  }

  function removerAnexo(url) {
    const anexos = (d.anexos || []).filter((a) => a.url !== url);
    setD((p) => ({ ...p, anexos }));
    salvar({ anexos });
  }

  // Extrai (IA) os dados do documento do cliente e preenche os campos VAZIOS da RNC.
  async function extrairDoAnexo(anexo) {
    if (!anexo?.url) return;
    setErro(""); setExtraindo(true);
    try {
      const r = await fetch(`/api/qualidade/rnc/${id}/extrair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anexoUrl: anexo.url, tipo: anexo.tipo }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Falha na extração");
      const n = (j.preenchidos || []).length;
      flash(n ? `Preenchi ${n} campo(s) a partir do anexo — revise.` : "Não encontrei dados novos no anexo.");
      carregar();
    } catch (e) { setErro(e.message); } finally { setExtraindo(false); }
  }

  async function criarPlano() {
    setCriandoPlano(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/rnc/${id}/plano`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao criar plano");
      router.push(`/qualidade/planos-acao/${j.id}`);
    } catch (e) { setErro(e.message); setCriandoPlano(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro && !d) return <div className="py-20 text-center text-red-600 text-sm">{erro} · <Link href="/qualidade/rnc" className="text-torg-blue underline">voltar</Link></div>;

  const cliente = d.tipo === "CLIENTE";
  const improcedente = cliente && d.pertinente === false; // improcedente ⇒ só justificativa
  const mostrarAnalise = !improcedente;                   // tratamento, causa raiz, plano, acompanhamento
  const aceita = cliente ? ".pdf,image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,.pdf,.doc,.docx,.xls,.xlsx";
  const anexoIA = cliente ? ((d.anexos || []).find((x) => x.tipo === "application/pdf") || (d.anexos || []).find((x) => String(x.tipo || "").startsWith("image/"))) : null;

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
          {improcedente && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">improcedente</span>}
        </div>
        <h1 className="text-xl font-extrabold text-torg-dark tracking-tight">Relatório de Não Conformidade</h1>
      </div>

      {/* Procedência (só RNC de cliente) */}
      {cliente && (
        <Secao titulo="Procedência">
          <p className="text-[12px] text-torg-gray -mt-1">Avalie se o apontamento do cliente procede. <b>Improcedente</b> pede só a justificativa; <b>procedente</b> segue para causa raiz e plano de ação.</p>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {[{ v: true, l: "Procedente", dsc: "Cabe análise e plano de ação" }, { v: false, l: "Improcedente", dsc: "Só justificativa ao cliente" }].map((o) => {
              const on = !!d.pertinente === o.v;
              return (
                <button key={String(o.v)} type="button" onClick={() => set("pertinente", o.v)}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${on ? "border-torg-blue bg-torg-blue-50/50 ring-1 ring-torg-blue" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className={`text-sm font-semibold ${on ? "text-torg-blue" : "text-torg-dark"}`}>{o.l}</div>
                  <p className="text-[11px] text-torg-gray mt-0.5">{o.dsc}</p>
                </button>
              );
            })}
          </div>
        </Secao>
      )}

      {/* Identificação */}
      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Tipo da RNC">
            <select value={d.tipo || "INTERNA"} onChange={(e) => set("tipo", e.target.value)} className="inp">
              <option value="INTERNA">Interna (detectada pela Torg)</option>
              <option value="CLIENTE">De cliente (recebida do cliente)</option>
            </select>
          </Campo>
          <Campo label="Cliente"><input value={d.cliente || ""} onChange={(e) => set("cliente", e.target.value)} className="inp" /></Campo>
          <Campo label="OP / Obra"><input value={d.opNumero || ""} onChange={(e) => set("opNumero", e.target.value)} className="inp" /></Campo>
          {/* ⚠⚠ AS PEÇAS SAEM DA LISTA DE EXPEDIÇÃO, com peso e quantidade. Vitor (27/08/2026):
              "com base na lista LE trazer as marcas e deixar selecionar as peças e trazer as
              informações dela e o peso, assim como deixar eu selecionar a quantidade". O peso
              somado aqui é o que vira indicador de retrabalho do setor. */}
          <div className="sm:col-span-2">
            <Campo label="Desenho / Projeto / Marca">
              <SeletorPecasLE
                rncId={d.id}
                pecas={d.pecas}
                onChange={(pecas) => setD((x) => ({
                  ...x, pecas,
                  // o peso do retrabalho passa a ser a SOMA das peças — nada de digitar por fora
                  pesoRetrabalhoKg: pecas.length
                    ? Math.round(pecas.reduce((t, p2) => t + (Number(p2.pesoKg) || (Number(p2.qtd) || 0) * (Number(p2.pesoUnitKg) || 0)), 0) * 100) / 100
                    : x.pesoRetrabalhoKg,
                  desenhoProjetoMarca: pecas.length ? pecas.map((p2) => p2.marca).join(" / ") : x.desenhoProjetoMarca,
                }))}
                textoLivre={d.desenhoProjetoMarca}
                onTextoLivre={(v) => set("desenhoProjetoMarca", v)}
              />
            </Campo>
          </div>
          <Campo label="Processo / Área da ocorrência">
            <select value={d.processoArea || ""} onChange={(e) => set("processoArea", e.target.value)} className="inp">
              <option value="">— selecione o setor —</option>
              {SETORES_AUDITORIA.map((s) => <option key={s} value={s}>{s}</option>)}
              {d.processoArea && !SETORES_AUDITORIA.includes(d.processoArea) && <option value={d.processoArea}>{d.processoArea}</option>}
            </select>
          </Campo>
          {/* ⚠ QUEM GEROU, não quem vai refazer: é por este campo que o peso entra no indicador de
              cada setor. Sem ele, o portal deduz do "Processo / Área" — o que funciona para o
              histórico, mas erra quando a área da ocorrência não é a que causou. */}
          <Campo label="Setor que gerou o retrabalho">
            <select value={d.setorRetrabalho || ""} onChange={(e) => set("setorRetrabalho", e.target.value)} className="inp">
              <option value="">— deduzir do processo / área —</option>
              <optgroup label="Setores da Torg">
                {SETORES_RETRABALHO.filter((st) => !st.externo).map((st) => <option key={st.id} value={st.id}>{st.nome}</option>)}
              </optgroup>
              {/* ⚠ material fora de especificação ou serviço de terceiro refeito: as horas são
                  nossas, a causa não. Sem esta opção, quem preenche escolhe o setor que REFEZ e o
                  índice dele sobe por culpa alheia. */}
              <optgroup label="Externo">
                {SETORES_RETRABALHO.filter((st) => st.externo).map((st) => <option key={st.id} value={st.id}>{st.nome}</option>)}
              </optgroup>
            </select>
          </Campo>
          <Campo label="Origem da não conformidade">
            <select value={d.origem || ""} onChange={(e) => set("origem", e.target.value)} className="inp"><option value="">—</option>{Object.entries(ORIGEM_NC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Campo>
          {(d.origem === "FORNECEDOR" || d.setorRetrabalho === "FORNECEDOR") && (
            <Campo label="Fornecedor"><input value={d.fornecedor || ""} onChange={(e) => set("fornecedor", e.target.value)} className="inp" /></Campo>
          )}
          <Campo label="Data"><input type="date" value={d.data || ""} onChange={(e) => set("data", e.target.value)} className="inp" /></Campo>
          <Campo label="Prazo para resposta"><input type="date" value={d.prazoResposta || ""} onChange={(e) => set("prazoResposta", e.target.value)} className="inp" /></Campo>
          {cliente && <>
            <Campo label="Nº da RNC do cliente"><input value={d.numeroCliente || ""} onChange={(e) => set("numeroCliente", e.target.value)} placeholder="RTNC-010" className="inp" /></Campo>
            <Campo label="Programa"><input value={d.programa || ""} onChange={(e) => set("programa", e.target.value)} placeholder="ASME" className="inp" /></Campo>
            <Campo label="Job do cliente"><input value={d.jobCliente || ""} onChange={(e) => set("jobCliente", e.target.value)} className="inp" /></Campo>
          </>}
        </div>
      </Secao>

      {/* Descrição */}
      <Secao titulo="Não conformidade">
        <Campo label="Descrição da não conformidade"><textarea value={d.descricao || ""} onChange={(e) => set("descricao", e.target.value)} rows={3} className="inp" /></Campo>
        <Campo label="Elaborador / responsável"><input value={d.elaborador || ""} onChange={(e) => set("elaborador", e.target.value)} className="inp" /></Campo>
      </Secao>

      {/* Anexos — imagens/documentos para compor o relatório */}
      <Secao titulo="Anexos" acao={
        <label className={`text-[12px] font-medium inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${subindo ? "text-gray-400 border-gray-200 cursor-wait" : "text-torg-blue border-torg-blue/30 hover:bg-torg-blue-50 cursor-pointer"}`}>
          {subindo ? <><Loader2 size={13} className="animate-spin" /> enviando…</> : <><Upload size={13} /> anexar</>}
          <input type="file" accept={aceita} multiple disabled={subindo} className="hidden" onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
        </label>
      }>
        <p className="text-[12px] text-torg-gray -mt-1">{cliente ? "Anexe o PDF e as imagens que o cliente enviou — a IA já preenche cliente, nº da RNC, data, descrição e as causas apontadas." : "Anexe imagens e documentos (PDF, Word, Excel) para compor o relatório."}</p>
        {anexoIA && (
          <button onClick={() => extrairDoAnexo(anexoIA)} disabled={extraindo || subindo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-torg-blue-50 text-torg-blue text-[12px] font-medium hover:bg-torg-blue-100 disabled:opacity-50">
            {extraindo ? <><Loader2 size={13} className="animate-spin" /> lendo o documento…</> : <><Sparkles size={13} /> Preencher com IA a partir do anexo</>}
          </button>
        )}
        {(d.anexos || []).length === 0 ? (
          <p className="text-[13px] text-torg-gray">Nenhum anexo ainda.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {d.anexos.map((a) => <AnexoCard key={a.url} a={a} onRemover={() => removerAnexo(a.url)} />)}
          </div>
        )}
      </Secao>

      {improcedente && (
        <Secao titulo="Justificativa da improcedência">
          <Campo label="Por que a RNC é improcedente (resposta ao cliente)">
            <textarea value={d.respostaCliente || ""} onChange={(e) => set("respostaCliente", e.target.value)} rows={5} className="inp"
              placeholder="Explique tecnicamente por que o apontamento do cliente não procede — este texto é a resposta ao cliente." />
          </Campo>
        </Secao>
      )}

      {mostrarAnalise && (
        <>
          {/* Tratamento */}
          <Secao titulo="Tratamento">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Disposição"><select value={d.disposicao || ""} onChange={(e) => set("disposicao", e.target.value)} className="inp"><option value="">—</option>{Object.entries(DISPOSICAO_NC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
              <Campo label="Necessita de ação"><select value={d.necessitaAcao || ""} onChange={(e) => set("necessitaAcao", e.target.value)} className="inp"><option value="">—</option>{Object.entries(NECESSITA_ACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            </div>
            {d.disposicao === "RETRABALHAR" && (
              <Campo label="Peso de retrabalho (kg)">
                <div className="flex items-center gap-2">
                  <input type="number" step="0.01" min="0" value={d.pesoRetrabalhoKg ?? ""} onChange={(e) => set("pesoRetrabalhoKg", e.target.value)} placeholder="0" className="inp flex-1" />
                  <button type="button" onClick={puxarPeso} disabled={puxandoPeso} className="whitespace-nowrap px-3 py-2 text-sm rounded-lg border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50 disabled:opacity-50">
                    {puxandoPeso ? "Buscando…" : "Puxar da marca"}
                  </button>
                </div>
                <p className="text-xs text-torg-dark/50 mt-1">Base do indicador de Retrabalho da Produção. Tenta puxar do cadastro pela marca; ajuste se necessário.</p>
              </Campo>
            )}
            {d.necessitaAcao === "NAO_NECESSARIO" && <Campo label="Motivo de não necessitar de ação"><input value={d.motivoNaoAcao || ""} onChange={(e) => set("motivoNaoAcao", e.target.value)} className="inp" /></Campo>}
            <Campo label="Abrangência"><input value={d.abrangencia || ""} onChange={(e) => set("abrangencia", e.target.value)} className="inp" /></Campo>
          </Secao>

          {/* ⚠⚠ REINSPEÇÃO — O FORM 20 TEM ESSE CAMPO E A TELA NÃO TINHA. Vitor (02/09/2026):
              "precisamos ter todos os campos igual está lá, para evidenciar".
              O que faltava não era o texto (esse já existia solto dentro de Tratamento), era a
              EVIDÊNCIA: quem reinspecionou, quando, e a foto do resultado. Sem os três, o campo diz
              que alguém achou que está bom — não prova que foi conferido.
              ⚠ Bloco único, como no FORM 20: uma reinspeção por RNC. Se a peça voltar a reprovar, o
              caso é outra RNC, não uma segunda linha aqui. */}
          <Secao titulo="Reinspeção">
            <p className="text-[12px] text-torg-gray -mt-1">Evidência de que o tratamento foi conferido — sai no PDF em seção própria.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Reinspecionado por"><input value={d.reinspecaoPor || ""} onChange={(e) => set("reinspecaoPor", e.target.value)} placeholder="Nome de quem conferiu" className="inp" /></Campo>
              <Campo label="Data da reinspeção"><input type="date" value={d.reinspecaoEm || ""} onChange={(e) => set("reinspecaoEm", e.target.value)} className="inp" /></Campo>
            </div>
            <Campo label="Resultado da reinspeção"><textarea value={d.resultadoReinspecao || ""} onChange={(e) => set("resultadoReinspecao", e.target.value)} rows={2} className="inp" placeholder="O que foi conferido e qual o resultado." /></Campo>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Registro fotográfico da reinspeção</p>
                <label className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-torg-blue-200 text-torg-blue text-[12px] font-medium cursor-pointer hover:bg-torg-blue-50 ${subindoRe ? "opacity-50 pointer-events-none" : ""}`}>
                  {subindoRe ? <><Loader2 size={13} className="animate-spin" /> enviando…</> : <><Upload size={13} /> foto</>}
                  <input type="file" accept="image/*" multiple disabled={subindoRe} className="hidden" onChange={(e) => { anexarReinspecao(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              {(d.reinspecaoFotos || []).length === 0 ? (
                <p className="text-[13px] text-torg-gray">Nenhuma foto da reinspeção.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {d.reinspecaoFotos.map((a) => <AnexoCard key={a.url} a={a} onRemover={() => removerFotoRe(a.url)} />)}
                </div>
              )}
            </div>
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
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[13px] text-torg-gray">Sem plano de ação vinculado.</p>
                <button onClick={criarPlano} disabled={criandoPlano} className="px-3 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{criandoPlano ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar plano de ação</button>
              </div>
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
        </>
      )}

      {/* Situação + indicadores */}
      <Secao titulo="Situação e classificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Situação"><select value={d.status} onChange={(e) => set("status", e.target.value)} className="inp">{Object.keys(STATUS_RNC).map((k) => <option key={k} value={k}>{statusRncLabel(k)}</option>)}</select></Campo>
          <Campo label="Encerrada por"><input value={d.encerradaPor || ""} onChange={(e) => set("encerradaPor", e.target.value)} className="inp" /></Campo>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          {!cliente && <label className="inline-flex items-center gap-2 text-[13px] text-torg-dark cursor-pointer"><input type="checkbox" checked={!!d.pertinente} onChange={(e) => set("pertinente", e.target.checked)} /> Pertinente <span className="text-[11px] text-torg-gray">(conta no indicador de RNCs)</span></label>}
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

function AnexoCard({ a, onRemover }) {
  const img = String(a.tipo || "").startsWith("image/");
  return (
    <div className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block" title={a.nome}>
        {img ? (
          <img src={a.url} alt={a.nome} className="w-full h-24 object-cover" />
        ) : (
          <div className="h-24 flex flex-col items-center justify-center gap-1 text-torg-gray p-2">
            <FileText size={22} /><span className="text-[10px] text-center leading-tight line-clamp-2 break-all">{a.nome}</span>
          </div>
        )}
      </a>
      <button onClick={onRemover} title="Remover anexo" className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-gray-500 hover:text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"><X size={13} /></button>
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
