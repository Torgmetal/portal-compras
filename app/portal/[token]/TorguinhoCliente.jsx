"use client";
// ─── O TORGUINHO NA PÁGINA DO CLIENTE ─────────────────────────────────────────
//
// Vitor (03/09/2026): "colocar o Torguinho na tela do cliente para ele conseguir perguntar sobre
// uma peça (…) claro que vamos limitar a isso para eles, nada além disso".
//
// ⚠ O limite não está aqui: está nas ferramentas da rota (lib/portal-assistente). Esta tela é só a
// conversa — e é assim que tem de ser, porque o que protege o dado não pode depender do que a tela
// manda.
//
// ⚠ SUGESTÕES SÃO O MANUAL. Campo de conversa em branco não ensina ninguém o que dá para perguntar;
// três exemplos clicáveis ensinam em dois segundos, e ainda calibram a expectativa do que ele
// responde.
import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";

const SUGESTOES = [
  "Quanto pesa a peça …?",
  "O que já foi expedido?",
  "Quais peças estão na pintura?",
];

export default function TorguinhoCliente({ token }) {
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, pensando]);

  async function enviar(pergunta) {
    const p = String(pergunta ?? texto).trim();
    if (!p || pensando) return;
    const novas = [...msgs, { role: "user", content: p }];
    setMsgs(novas); setTexto(""); setPensando(true);
    try {
      const r = await fetch(`/api/portal/${token}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: novas }),
      });
      const j = await r.json();
      setMsgs([...novas, { role: "assistant", content: j.resposta || j.error || "Não consegui responder agora." }]);
    } catch {
      setMsgs([...novas, { role: "assistant", content: "Não consegui responder agora. Tente de novo em instantes." }]);
    } finally { setPensando(false); }
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="max-h-[420px] overflow-y-auto p-4 space-y-3">
        {!msgs.length && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-gray-600">
              Pergunte sobre as peças desta obra — peso, quantidade, em que etapa estão, o que já
              embarcou e em qual romaneio, a rastreabilidade do material e os relatórios de inspeção.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => setTexto(s)}
                  className="text-[12px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#006EAB] hover:text-[#006EAB]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] whitespace-pre-wrap leading-relaxed ${
              m.role === "user" ? "bg-[#0D1F3C] text-white" : "bg-gray-50 text-[#0D1F3C] border border-gray-100"}`}>
              {m.content}
            </div>
          </div>
        ))}

        {pensando && (
          <p className="text-[12.5px] text-gray-400 inline-flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> consultando a obra…
          </p>
        )}
        <div ref={fim} />
      </div>

      <div className="border-t border-gray-100 p-2.5 flex items-center gap-2">
        <input
          value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Pergunte sobre uma peça, o andamento ou o que já embarcou…"
          maxLength={1000}
          className="flex-1 text-[13.5px] px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#006EAB]"
        />
        <button onClick={() => enviar()} disabled={pensando || !texto.trim()}
          className="shrink-0 px-3 py-2 rounded-lg bg-[#006EAB] text-white disabled:opacity-40 hover:bg-[#005A8C]">
          <Send size={15} />
        </button>
      </div>

      {/* ⚠ o aviso é honesto e é curto: o cliente precisa saber que fala com um assistente, e a
          quem recorrer quando a pergunta for de contrato ou de prazo. */}
      <p className="px-3 pb-2.5 text-[11px] text-gray-400">
        Assistente automático — responde sobre as peças e o andamento desta obra. Prazo, contrato e
        comercial: fale com o contato da Torg nesta página.
      </p>
    </div>
  );
}
