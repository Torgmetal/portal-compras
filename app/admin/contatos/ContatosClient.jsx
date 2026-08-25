"use client";
// CONTATOS POR SETOR — quem recebe os e-mails do portal em nome de cada área.
//
// Vitor (25/08/2026): "vamos criar essa função no painel do adm, assim se entrar ou sair pessoas
// conseguimos editar com mais facilidade". Veio do Planejamento, onde ficava escondida como
// "Matriz de comunicação" e não era o lugar de cadastrar gente.
//
// ⚠ SALVA UM SETOR POR VEZ. Um botão "salvar tudo" faria uma linha errada derrubar as outras onze,
// e o erro voltaria sem dizer qual setor recusou.
import { useEffect, useState } from "react";
import { Users, Plus, Trash2, Loader2, AlertCircle, Check, Mail } from "lucide-react";

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

export default function ContatosClient() {
  const [matriz, setMatriz] = useState(null);
  const [setores, setSetores] = useState([]);
  const [labels, setLabels] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState("");
  const [salvo, setSalvo] = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setErro("");
    try {
      const r = await fetch("/api/admin/contatos", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setMatriz(j.matriz); setSetores(j.setores); setLabels(j.labels);
    } catch (e) { setErro(e.message); }
  }

  const setContatos = (setor, contatos) => setMatriz((m) => ({ ...m, [setor]: { ...m[setor], contatos } }));
  const addRow = (setor) => setContatos(setor, [...(matriz[setor]?.contatos || []), { nome: "", email: "" }]);
  const updRow = (setor, i, k, v) => setContatos(setor, matriz[setor].contatos.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const rmRow = (setor, i) => setContatos(setor, matriz[setor].contatos.filter((_, j) => j !== i));

  async function salvar(setor) {
    const contatos = (matriz[setor]?.contatos || []).filter((c) => String(c.email || "").trim());
    const invalido = contatos.find((c) => !emailOk(c.email));
    if (invalido) { setErro(`E-mail inválido em ${labels[setor]}: "${invalido.email}"`); return; }
    setSalvando(setor); setErro(""); setSalvo("");
    try {
      const r = await fetch("/api/admin/contatos", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setor, contatos }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setContatos(setor, j.contatos);
      setSalvo(setor); setTimeout(() => setSalvo((s) => (s === setor ? "" : s)), 2500);
    } catch (e) { setErro(e.message); } finally { setSalvando(""); }
  }

  if (!matriz) {
    return <div className="flex items-center justify-center py-20 gap-3 text-torg-gray"><Loader2 size={22} className="animate-spin" /> Carregando…</div>;
  }

  const vazios = setores.filter((s) => !(matriz[s]?.contatos || []).length);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Users size={20} className="text-torg-blue" /> Contatos por setor</h1>
        {/* ⚠ dizer o ALCANCE: quem edita aqui está mexendo em oito envios de uma vez, e isso não é
            óbvio numa tela que parece um cadastro simples de e-mails. */}
        <p className="text-sm text-torg-gray mt-1">
          Quem recebe os e-mails do portal em nome de cada área: lembrete de tarefa, cronograma,
          cobrança de atraso, ata, lista de expedição e as respostas por link. É a fonte única —
          entrou ou saiu alguém, muda aqui e vale em todos.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {erro}
        </div>
      )}

      {vazios.length > 0 && (
        /* ⚠ setor sem contato não dá erro — simplesmente não manda e-mail para ninguém. Sem este
           aviso, o silêncio parece funcionamento normal. */
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800">
          <b>Sem ninguém cadastrado:</b> {vazios.map((s) => labels[s]).join(", ")}. Aviso destinado a
          esses setores não é enviado a ninguém — e não dá erro em lugar nenhum.
        </div>
      )}

      <div className="space-y-3">
        {setores.map((setor) => {
          const contatos = matriz[setor]?.contatos || [];
          return (
            <div key={setor} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <h2 className="text-sm font-bold text-torg-dark flex items-center gap-2">
                  <Mail size={15} className="text-torg-blue" /> {labels[setor] || setor}
                  <span className={`text-[11px] font-normal ${contatos.length ? "text-torg-gray" : "text-amber-700"}`}>
                    · {contatos.length} contato{contatos.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  {salvo === setor && <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1"><Check size={13} /> salvo</span>}
                  <button onClick={() => salvar(setor)} disabled={salvando === setor}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-torg-blue text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5">
                    {salvando === setor && <Loader2 size={12} className="animate-spin" />} Salvar
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {contatos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={c.nome || ""} onChange={(e) => updRow(setor, i, "nome", e.target.value)}
                      placeholder="Nome" aria-label={`Nome do contato ${i + 1} de ${labels[setor]}`}
                      className="w-44 text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-torg-blue outline-none" />
                    <input value={c.email || ""} onChange={(e) => updRow(setor, i, "email", e.target.value)}
                      placeholder="email@torg.com.br" aria-label={`E-mail do contato ${i + 1} de ${labels[setor]}`}
                      className={`flex-1 text-[13px] border rounded-lg px-2.5 py-1.5 outline-none ${c.email && !emailOk(c.email) ? "border-red-300 bg-red-50" : "border-gray-200 focus:border-torg-blue"}`} />
                    <button onClick={() => rmRow(setor, i)} aria-label={`Remover ${c.email || "contato"}`}
                      className="text-torg-gray hover:text-red-600 p-1"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => addRow(setor)} className="text-[12px] text-torg-blue hover:underline inline-flex items-center gap-1">
                  <Plus size={13} /> adicionar contato
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
