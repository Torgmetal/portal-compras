"use client";

import { useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { CAMPOS } from "./campos";

// O FORMULÁRIO DE UM CADASTRO — o mesmo para os quatro.
//
// ⚠ AS DICAS APARECEM ANTES DO ERRO, não depois. "O código congela no primeiro apontamento" é
// informação que muda o que a pessoa digita; dita só na recusa, ela já digitou errado e agora tem de
// desfazer — e a recusa parece capricho do sistema em vez de consequência.

const rotuloDoBotao = (editando) => (editando ? "Salvar" : "Cadastrar");

export default function FormularioCadastro({ tipo, registro, setores, aoFechar, aoGravar }) {
  const editando = Boolean(registro?.id);
  const [valores, setValores] = useState(registro);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  // ⚠ O código congela quando o posto já tem histórico — o campo fica travado na tela, com o motivo
  // à vista. Deixar editar e recusar no servidor faria a pessoa digitar para nada.
  const codigoTravado = editando && tipo === "recursos" && registro.usos > 0;

  async function enviar(e) {
    e.preventDefault();
    setGravando(true);
    setErro("");
    try {
      const r = await aoGravar({ ...valores, tipo, ...(editando ? { id: registro.id } : {}) });
      if (r?.erro) setErro(r.erro);
      else aoFechar();
    } finally { setGravando(false); }
  }

  const trocar = (chave, v) => setValores((a) => ({ ...a, [chave]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center p-4 z-50" onClick={aoFechar}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={enviar}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">
            {editando ? "Editar" : "Novo"} {tipo === "recursos" ? "posto" : tipo.slice(0, -1)}
          </h2>
          <button type="button" onClick={aoFechar} className="text-torg-gray hover:text-torg-dark">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {CAMPOS[tipo].map((c) => (
            <Campo key={c.chave} campo={c} valor={valores[c.chave]} setores={setores}
                   travado={c.chave === "codigo" && codigoTravado}
                   aoMudar={(v) => trocar(c.chave, v)} />
          ))}
          {codigoTravado && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Este posto já tem {registro.usos} apontamento(s). O código não muda mais — ele é o
              vínculo com a programação do PCP e com o histórico. Para trocar, crie outro posto e
              desative este.
            </p>
          )}
          {erro && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" /> {erro}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={aoFechar}
                  className="px-4 py-2 rounded-lg text-torg-gray hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={gravando}
                  className="px-5 py-2 rounded-lg bg-torg-blue text-white font-semibold hover:bg-torg-dark disabled:opacity-50 flex items-center gap-2">
            {gravando && <Loader2 size={16} className="animate-spin" />}
            {rotuloDoBotao(editando)}
          </button>
        </div>
      </form>
    </div>
  );
}

const entrada = "w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 ring-torg-blue/40";

function Campo({ campo, valor, aoMudar, setores, travado }) {
  const comum = { id: campo.chave, className: entrada, disabled: travado };
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-torg-dark mb-1">
        {campo.rotulo}{campo.obrigatorio && <span className="text-red-500"> *</span>}
      </span>
      {campo.tipo === "setor" ? (
        <select {...comum} value={valor || ""} onChange={(e) => aoMudar(e.target.value)}>
          <option value="">Escolha o setor…</option>
          {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      ) : campo.tipo === "opcoes" ? (
        <select {...comum} value={valor || campo.opcoes[0].valor} onChange={(e) => aoMudar(e.target.value)}>
          {campo.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      ) : campo.tipo === "sim-nao" ? (
        <span className="flex items-center gap-2">
          <input type="checkbox" checked={!!valor} onChange={(e) => aoMudar(e.target.checked)}
                 className="w-5 h-5 accent-torg-blue" />
          <span className="text-sm text-torg-gray">Sim</span>
        </span>
      ) : campo.tipo === "cor" ? (
        <input type="color" value={valor || "#576D7E"} onChange={(e) => aoMudar(e.target.value)}
               className="h-10 w-20 rounded border border-gray-200" />
      ) : (
        <input {...comum} type={campo.tipo === "numero" ? "number" : "text"}
               value={valor ?? ""} onChange={(e) => aoMudar(e.target.value)} autoComplete="off" />
      )}
      {campo.dica && <span className="block text-xs text-torg-gray mt-1">{campo.dica}</span>}
    </label>
  );
}
