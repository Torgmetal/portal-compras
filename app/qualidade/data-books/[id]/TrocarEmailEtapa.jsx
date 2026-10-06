"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";

// Troca o e-mail (e o nome) de uma etapa do fluxo de assinaturas que ainda não foi assinada.
// Vitor (06/10/2026): o inspetor estava com o e-mail do Alexandre Stival, e depois de criado o fluxo
// a tela só deixava "reenviar". A rota troca o link junto com o e-mail: o convite que foi para o
// endereço antigo deixa de valer.
const ROTULO = { ELABORADOR: "Elaborador", INSPETOR: "Inspetor responsável", RESP_TECNICO: "Responsável técnico", CLIENTE: "Cliente" };

/** O que a tela diz depois da troca. */
export function mensagemDaTroca(j, email) {
  if (!j?.mudou) return "O e-mail e o nome já eram esses — nada mudou.";
  if (j.reenviado) {
    return j.enviado
      ? `E-mail alterado. O convite foi enviado para ${email}; o link anterior deixou de valer.`
      : `E-mail alterado, mas o envio para ${email} falhou agora — use "reenviar".`;
  }
  return `E-mail alterado. O convite vai para ${email} quando chegar a vez desta etapa.`;
}

export default function TrocarEmailEtapa({ dataBookId, etapa, onTrocado, onCancelar }) {
  const [email, setEmail] = useState(etapa.email || "");
  const [nome, setNome] = useState(etapa.nome || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // o nome do RT é fixo no fluxo; só o e-mail troca
  const nomeFixo = etapa.papel === "RESP_TECNICO";
  const rotulo = ROTULO[etapa.papel] || etapa.papel;

  async function salvar() {
    const e = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) { setErro("Informe um e-mail válido."); return; }
    setSalvando(true);
    setErro("");
    try {
      const r = await fetch(`/api/qualidade/data-books/${dataBookId}/assinaturas`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordem: etapa.ordem, email: e, ...(nomeFixo ? {} : { nome: nome.trim() }) }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Não foi possível trocar o e-mail.");
      onTrocado?.(j, e.toLowerCase());
    } catch (x) {
      setErro(x.message);
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none";
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-[10px] font-medium text-torg-gray mb-0.5">Novo e-mail</span>
          <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} disabled={salvando}
            aria-label={`Novo e-mail — ${rotulo}`} className={campo} />
        </label>
        {!nomeFixo && (
          <label className="block">
            <span className="block text-[10px] font-medium text-torg-gray mb-0.5">Nome (opcional)</span>
            <input value={nome} onChange={(ev) => setNome(ev.target.value)} disabled={salvando}
              aria-label={`Nome — ${rotulo}`} className={campo} />
          </label>
        )}
      </div>
      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
      <p className="text-[10px] text-torg-gray">
        O link enviado ao e-mail anterior deixa de valer.{" "}
        {etapa.status === "ENVIADO" ? "O convite vai na hora para o e-mail novo." : "O convite sai para o e-mail novo quando chegar a vez desta etapa."}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={salvar} disabled={salvando}
          className="text-[11px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1">
          {salvando && <Loader2 size={11} className="animate-spin" />}Salvar e-mail
        </button>
        <button onClick={onCancelar} disabled={salvando} className="text-[11px] text-torg-gray hover:underline">Cancelar</button>
      </div>
    </div>
  );
}
