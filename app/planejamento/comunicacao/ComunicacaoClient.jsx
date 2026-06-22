"use client";
import { useEffect, useState } from "react";
import { Mail, Plus, Trash2, Loader2, AlertCircle, Check, Users } from "lucide-react";

const SETORES = ["PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO"];
const LABEL = { PRODUCAO: "Produção", PINTURA: "Pintura", PCP: "PCP", EXPEDICAO: "Expedição", COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", COMPRAS: "Compras", ALMOXARIFADO: "Almoxarifado", FINANCEIRO: "Financeiro", RH: "RH", PLANEJAMENTO: "Planejamento" };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

export default function ComunicacaoClient() {
  const [matriz, setMatriz] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState("");
  const [salvo, setSalvo] = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setErro("");
    try {
      const r = await fetch("/api/planejamento/comunicacao");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setMatriz(j.matriz);
    } catch (e) { setErro(e.message); }
  }

  const setContatos = (setor, contatos) => setMatriz((m) => ({ ...m, [setor]: { ...m[setor], contatos } }));
  const addRow = (setor) => setContatos(setor, [...(matriz[setor]?.contatos || []), { nome: "", email: "" }]);
  const updRow = (setor, i, k, v) => setContatos(setor, matriz[setor].contatos.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const rmRow = (setor, i) => setContatos(setor, matriz[setor].contatos.filter((_, j) => j !== i));

  async function salvar(setor) {
    const contatos = (matriz[setor]?.contatos || []).filter((c) => c.email.trim());
    const invalido = contatos.find((c) => !emailOk(c.email));
    if (invalido) { setErro(`E-mail inválido em ${LABEL[setor]}: "${invalido.email}"`); return; }
    setSalvando(setor); setErro(""); setSalvo("");
    try {
      const r = await fetch("/api/planejamento/comunicacao", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor, contatos }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setContatos(setor, j.contatos);
      setSalvo(setor); setTimeout(() => setSalvo((s) => (s === setor ? "" : s)), 2500);
    } catch (e) { setErro(e.message); } finally { setSalvando(""); }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Mail size={20} className="text-torg-blue" /> Matriz de comunicação por setor</h1>
        <p className="text-[12px] text-torg-gray mt-0.5">Defina quem recebe por e-mail as tarefas de cada setor. É a lista padrão usada ao distribuir tarefas (você ainda pode escolher/ajustar na hora do envio) e para avisar quando uma tarefa é concluída.</p>
      </div>

      {erro && <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}</div>}

      {!matriz ? (
        <div className="flex items-center gap-2 text-torg-gray text-sm py-10 justify-center"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
      ) : (
        <div className="space-y-3">
          {SETORES.map((setor) => {
            const contatos = matriz[setor]?.contatos || [];
            return (
              <div key={setor} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-torg-dark flex items-center gap-2"><Users size={15} className="text-torg-blue" /> {LABEL[setor]} <span className="text-[11px] font-normal text-torg-gray">· {contatos.length} contato(s)</span></h2>
                  <div className="flex items-center gap-2">
                    {salvo === setor && <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1"><Check size={13} /> salvo</span>}
                    <button onClick={() => salvar(setor)} disabled={salvando === setor} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
                      {salvando === setor ? <Loader2 size={13} className="animate-spin" /> : null} Salvar
                    </button>
                  </div>
                </div>

                {contatos.length === 0 && <p className="text-[12px] text-torg-gray italic mb-2">Nenhum contato — este setor não receberá e-mail até você adicionar.</p>}

                <div className="space-y-1.5">
                  {contatos.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={c.nome || ""} onChange={(e) => updRow(setor, i, "nome", e.target.value)} placeholder="Nome (opcional)" className="w-40 text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
                      <input value={c.email || ""} onChange={(e) => updRow(setor, i, "email", e.target.value)} placeholder="email@torg.com.br" className={`flex-1 text-[12px] border rounded-lg px-2 py-1.5 outline-none ${c.email && !emailOk(c.email) ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-torg-blue"}`} />
                      <button onClick={() => rmRow(setor, i)} className="text-torg-gray hover:text-red-600 shrink-0" title="Remover"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>

                <button onClick={() => addRow(setor)} className="mt-2 text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Plus size={13} /> adicionar contato</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
