"use client";
import { useState } from "react";
import { Loader2, Plus, Trash2, X, Users } from "lucide-react";

// A AGENDA de contatos do cliente na OP — nome, função, e-mail e telefones — editada na própria
// aba Obra. Vitor (21/09/2026), na OP-122 com 12 contatos da TMSA: "eu não consigo adicionar novos
// e-mails". Até aqui a tela só mostrava a lista; contato novo entrava pelo envio do cronograma.
//
// ⚠ É o contato que liga a obra ao login do cliente: e-mail que entra aqui passa a ver a obra em
// "Meus documentos". Os ACESSOS (Pedidos e faturamento) continuam no outro botão, por pessoa.
// ⚠ `emailAnterior` viaja junto para a rota não perder papéis e restrições de quem teve o e-mail
// corrigido (regra em lib/contatos-cliente.js).
const CAMPOS = [
  ["nome", "Nome", "text", "Nome do contato"],
  ["funcao", "Função", "text", "Ex.: Fiscal da obra"],
  ["email", "E-mail", "email", "nome@cliente.com.br"],
  ["telefone", "Telefone fixo", "text", "(11) 3333-0000"],
  ["celular", "Celular", "text", "(11) 9 9999-0000"],
];

export default function ModalEditarContatosCliente({ opId, contatos: iniciais, onClose, onSaved }) {
  const [linhas, setLinhas] = useState(() => (iniciais || []).map((c) => ({
    nome: c.nome || "", funcao: c.funcao || "", email: c.email || "", telefone: c.telefone || "", celular: c.celular || "",
    emailAnterior: c.email || "",
  })));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const set = (i, campo, v) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));
  const adicionar = () => setLinhas((p) => [...p, { nome: "", funcao: "", email: "", telefone: "", celular: "", emailAnterior: "" }]);
  const remover = (i) => setLinhas((p) => p.filter((_, k) => k !== i));

  const salvar = async () => {
    setErro("");
    const contatos = linhas
      .map((l) => ({ ...l, email: l.email.trim().toLowerCase(), nome: l.nome.trim() }))
      .filter((l) => l.email || l.nome);
    const semEmail = contatos.find((l) => !l.email);
    if (semEmail) return setErro(`Informe o e-mail de "${semEmail.nome}" — é por ele que o contato entra no portal.`);
    const invalido = contatos.find((l) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email));
    if (invalido) return setErro(`E-mail inválido: "${invalido.email}".`);
    const vistos = new Set();
    for (const l of contatos) { if (vistos.has(l.email)) return setErro(`E-mail repetido: "${l.email}".`); vistos.add(l.email); }
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/contatos`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contatos: contatos.map((l) => ({
          nome: l.nome, email: l.email, funcao: l.funcao, telefone: l.telefone, celular: l.celular,
          ...(l.emailAnterior && l.emailAnterior !== l.email ? { emailAnterior: l.emailAnterior } : {}),
        })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível salvar.");
      onSaved?.(j.contatos);
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><Users size={18} className="text-torg-blue" /> Contatos do cliente</h3>
            <p className="text-xs text-torg-gray mt-0.5">Quem entra aqui passa a ver esta obra no login dele. Nome e e-mail são obrigatórios; o resto é agenda.</p>
          </div>
          <button onClick={onClose} disabled={salvando} className="text-torg-gray hover:text-torg-dark"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {erro && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-torg-gray"><tr>{CAMPOS.map(([k, t]) => <th key={k} className="text-left font-medium px-2 py-1.5">{t}</th>)}<th className="w-8" /></tr></thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    {CAMPOS.map(([campo, , type, ph]) => (
                      <td key={campo} className="px-2 py-1">
                        <input type={type} value={l[campo]} onChange={(e) => set(i, campo, e.target.value)} placeholder={ph}
                          aria-label={`${CAMPOS.find(([k]) => k === campo)[1]} do contato ${i + 1}`}
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => remover(i)} title="Remover contato" className="text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-torg-gray text-sm">Nenhum contato. Adicione o primeiro.</td></tr>}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={adicionar} className="mt-3 text-sm text-torg-blue font-medium inline-flex items-center gap-1.5 hover:underline">
            <Plus size={14} /> Adicionar contato
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} disabled={salvando} className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 text-sm bg-torg-blue text-white rounded-lg font-medium hover:bg-torg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar contatos
          </button>
        </div>
      </div>
    </div>
  );
}
