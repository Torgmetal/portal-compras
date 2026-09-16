"use client";
import { useState } from "react";
import { X, Loader2, Save, Receipt } from "lucide-react";
import { PAPEIS_CONTATO } from "@/lib/cliente-faturamento";

// Quem, entre os contatos da OP, vê o que no LOGIN do cliente. Vitor (16/09/2026): "nem todos devem
// ter acesso a essa área" — o papel "Pedidos e faturamento" é marcado aqui, pessoa a pessoa, obra a
// obra. Padrão: ninguém vê. Nome, função, telefone e e-mail são editados na tela de contatos; aqui
// só o acesso — e a rota preserva todo o resto do contato.
export default function ModalContatosCliente({ opId, contatos: iniciais, onClose, onSaved }) {
  const [acessos, setAcessos] = useState(Object.fromEntries((iniciais || []).map((c) => [String(c.email || "").toLowerCase(), Array.isArray(c.papeis) ? c.papeis : []])));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const toggle = (email, papel) => setAcessos((p) => { const atual = p[email] || []; return { ...p, [email]: atual.includes(papel) ? atual.filter((x) => x !== papel) : [...atual, papel] }; });

  const salvar = async () => {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/contatos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acessos: Object.entries(acessos).map(([email, papeis]) => ({ email, papeis })) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível salvar.");
      onSaved?.(j.contatos);
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-torg-dark">Acessos no portal do cliente</h3>
            <p className="text-xs text-torg-gray">Todos os contatos veem documentos e assinaturas. Marque <b>Pedidos e faturamento</b> só para quem deve ver OCs, previsões e notas desta obra.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-1.5">
          {(iniciais || []).map((c) => {
            const email = String(c.email || "").toLowerCase();
            return (
              <div key={email} className="grid grid-cols-12 gap-2 items-center rounded-lg border border-gray-100 px-3 py-2">
                <div className="col-span-7 min-w-0">
                  <p className="text-sm font-medium text-torg-dark truncate">{c.nome || "—"}{c.funcao ? <span className="text-torg-gray font-normal"> · {c.funcao}</span> : null}</p>
                  <p className="text-[12px] text-torg-gray truncate">{email}</p>
                </div>
                <div className="col-span-5 flex flex-wrap gap-1.5 justify-end">
                  {PAPEIS_CONTATO.map((p) => {
                    const ativo = (acessos[email] || []).includes(p.valor);
                    return (
                      <label key={p.valor} title={p.descricao} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11.5px] cursor-pointer ${ativo ? "border-[#F4801F] bg-orange-50 text-orange-800 font-medium" : "border-gray-200 text-torg-gray"}`}>
                        <input type="checkbox" className="sr-only" checked={ativo} onChange={() => toggle(email, p.valor)} />
                        <Receipt size={12} /> {p.rotulo}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-torg-gray pt-1">O acesso vale só para esta obra. Para entrar, a pessoa precisa de um login de cliente (Admin › Usuários) com este mesmo e-mail.</p>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={salvando} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-torg-gray">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm rounded-lg bg-torg-blue text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar</button>
        </div>
      </div>
    </div>
  );
}
