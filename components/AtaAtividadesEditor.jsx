"use client";
import { useState } from "react";
import { Sparkles, Loader2, Plus, Trash2, AlertCircle, FolderKanban } from "lucide-react";

const SETORES = ["COMERCIAL", "ENGENHARIA", "COMPRAS", "PRODUCAO", "PCP", "PLANEJAMENTO", "EXPEDICAO", "QUALIDADE", "ALMOXARIFADO", "FINANCEIRO", "RH", "DIRETORIA"];
const SETOR_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", PRODUCAO: "Produção", PCP: "PCP", PLANEJAMENTO: "Planejamento", EXPEDICAO: "Expedição", QUALIDADE: "Qualidade", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", DIRETORIA: "Diretoria" };

const opNum = (op) => { const n = parseInt(String(op || "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : Infinity; };
const toDateInput = (d) => { if (!d) return ""; const s = String(d); return s.length >= 10 ? s.slice(0, 10) : ""; };
const novoItem = () => ({ descricao: "", setor: "", responsavel: "", prazo: "" });
export const novaSecaoVazia = () => [{ op: "", itens: [novoItem()] }];

// flat atividades -> seções por OP (ordenadas por número de OP; "sem OP" por último)
export function agruparSecoes(atvs) {
  const map = new Map();
  for (const a of atvs || []) {
    const k = (a.op || "").toString().trim();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ descricao: a.descricao || "", setor: a.setor || "", responsavel: a.responsavel || "", prazo: toDateInput(a.prazo) });
  }
  const secoes = [...map.entries()]
    .sort((x, y) => opNum(x[0]) - opNum(y[0]))
    .map(([op, itens]) => ({ op, itens: itens.length ? itens : [novoItem()] }));
  return secoes.length ? secoes : novaSecaoVazia();
}

// seções -> flat atividades (para salvar); mantém a ordem das seções
export function achatarSecoes(secoes) {
  const out = [];
  for (const s of secoes || []) {
    for (const it of s.itens || []) {
      if (!(it.descricao || "").trim()) continue;
      out.push({ op: (s.op || "").trim() || null, descricao: it.descricao.trim(), setor: it.setor || null, responsavel: (it.responsavel || "").trim() || null, prazo: it.prazo || null });
    }
  }
  return out;
}

export default function AtaAtividadesEditor({ secoes, setSecoes, envolvidos }) {
  const [rascunho, setRascunho] = useState("");
  const [organizando, setOrganizando] = useState(false);
  const [erroIA, setErroIA] = useState("");

  async function organizar() {
    if (!rascunho.trim()) return;
    setOrganizando(true); setErroIA("");
    try {
      const r = await fetch("/api/reunioes/parse-rascunho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rascunho, envolvidos: (envolvidos || []).filter((e) => e.nome?.trim() || e.email?.trim()) }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao organizar");
      const novas = j.atividades || [];
      if (!novas.length) { setErroIA("A IA não encontrou atividades no rascunho."); return; }
      setSecoes((prev) => agruparSecoes([...achatarSecoes(prev), ...novas]));
      setRascunho("");
    } catch (e) { setErroIA(e.message); } finally { setOrganizando(false); }
  }

  const setSecaoOp = (i, v) => setSecoes((p) => p.map((s, k) => (k === i ? { ...s, op: v } : s)));
  const addItem = (i) => setSecoes((p) => p.map((s, k) => (k === i ? { ...s, itens: [...s.itens, novoItem()] } : s)));
  const setItem = (i, j, key, v) => setSecoes((p) => p.map((s, k) => (k === i ? { ...s, itens: s.itens.map((it, m) => (m === j ? { ...it, [key]: v } : it)) } : s)));
  const removeItem = (i, j) => setSecoes((p) => p.map((s, k) => (k === i ? { ...s, itens: s.itens.length === 1 ? s.itens : s.itens.filter((_, m) => m !== j) } : s)));
  const addSecao = () => setSecoes((p) => [...p, { op: "", itens: [novoItem()] }]);
  const removeSecao = (i) => setSecoes((p) => (p.length === 1 ? p : p.filter((_, k) => k !== i)));

  return (
    <div>
      {/* Rascunho → IA */}
      <div className="bg-torg-blue-50/50 border border-torg-blue-100 rounded-lg p-3.5 mb-4">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={15} className="text-torg-blue" />
          <span className="text-[13px] font-semibold text-torg-dark">Organizar rascunho com IA</span>
        </div>
        <p className="text-[12px] text-torg-gray mb-2.5 leading-relaxed">Cole o rascunho da reunião (texto livre). A IA separa as atividades, <b>agrupa por OP</b> e já traz o setor/responsável quando dá pra deduzir dos envolvidos — o resto fica em branco pra você completar.</p>
        <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={4} placeholder={"Ex.:\nOP 085 — engenharia termina o detalhamento das marcas até sexta\nComprar chapa A572 pra obra 112 (Matheus)\nAgendar carga da 067"} className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 mb-2.5" />
        <div className="flex items-center gap-2">
          <button type="button" onClick={organizar} disabled={organizando || !rascunho.trim()} className="px-3.5 py-2 bg-torg-blue text-white text-[13px] rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{organizando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Organizar com IA</button>
          {erroIA && <span className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erroIA}</span>}
        </div>
      </div>

      {/* Seções por OP */}
      <div className="space-y-3.5">
        {secoes.map((s, i) => {
          const nItens = s.itens.filter((it) => it.descricao.trim()).length;
          return (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-torg-blue-50/70 border-b border-torg-blue-100">
                <FolderKanban size={15} className="text-torg-blue flex-shrink-0" />
                <span className="text-[12px] font-bold text-torg-blue uppercase tracking-wide">OP</span>
                <input value={s.op} onChange={(e) => setSecaoOp(i, e.target.value)} placeholder="nº da OP (vazio = sem OP)" className="w-52 text-[13px] font-semibold text-torg-dark border border-torg-blue-100 rounded-md px-2.5 py-1.5 bg-white" />
                <span className="text-[11px] text-torg-gray">{nItens} atividade{nItens === 1 ? "" : "s"}</span>
                <button type="button" onClick={() => removeSecao(i)} className="ml-auto text-gray-400 hover:text-red-500 p-1" title="Remover esta OP"><Trash2 size={15} /></button>
              </div>
              <div className="p-3 space-y-2.5 bg-gray-50/40">
                {s.itens.map((it, j) => (
                  <div key={j} className="bg-white border border-gray-200 rounded-lg p-3">
                    <input value={it.descricao} onChange={(e) => setItem(i, j, "descricao", e.target.value)} placeholder="Descrição da atividade" className="w-full text-[13px] border border-gray-200 rounded-md px-2.5 py-2 mb-2.5" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-[10px] text-torg-gray uppercase tracking-wide">Setor</label>
                      <select value={it.setor} onChange={(e) => setItem(i, j, "setor", e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1.5 bg-white">
                        <option value="">— a definir —</option>
                        {SETORES.map((x) => <option key={x} value={x}>{SETOR_LABEL[x]}</option>)}
                      </select>
                      <input value={it.responsavel} onChange={(e) => setItem(i, j, "responsavel", e.target.value)} placeholder="Responsável" className="flex-1 min-w-[130px] text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                      <label className="text-[10px] text-torg-gray uppercase tracking-wide">Prazo</label>
                      <input type="date" value={it.prazo} onChange={(e) => setItem(i, j, "prazo", e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                      <button type="button" onClick={() => removeItem(i, j)} className="text-gray-300 hover:text-red-500 p-1" title="Remover atividade"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => addItem(i)} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Atividade nesta OP</button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addSecao} className="mt-3 text-[13px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5 font-semibold"><Plus size={15} /> Nova OP</button>
    </div>
  );
}
