"use client";
// ─── O TORGUINHO NA PÁGINA DO CLIENTE ─────────────────────────────────────────
//
// Vitor (03/09/2026): "e se ao invés de ficar um chat bot vc só deixar a informação que o Torguinho
// pode ajudar eles e automaticamente ele aparece lá embaixo para eles? não fica mais limpo?".
//
// Fica — e por dois motivos. A caixa de conversa dentro da página competia com o conteúdo: o
// cliente entra no portal para ver o modelo e os documentos, não para conversar, e um campo de
// texto no meio disso pede atenção que ele não quis dar. Como bolha no canto, o Torguinho está
// sempre à mão e nunca no caminho — é o mesmo lugar em que ele vive no portal interno, então quem
// já o conhece o encontra por reflexo.
//
// ⚠ O limite do que ele responde não está aqui: está nas ferramentas da rota
// (lib/portal-assistente). Esta tela é só a conversa.
import { useEffect, useRef, useState } from "react";
import { Send, Loader2, X, MessageCircle } from "lucide-react";
import { emSetembroAmarelo, TORGUINHO_LACO } from "@/lib/campanha";

const AVATAR = emSetembroAmarelo() ? TORGUINHO_LACO : "/torguinho.png";

const SUGESTOES = [
  "O que já foi expedido?",
  "Quais peças estão na pintura?",
  "Quanto pesa a peça …?",
];

export default function TorguinhoCliente({ token, obra }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  // ⚠ o convite aparece uma vez, sozinho, e some ao primeiro clique: é a "informação de que ele pode
  // ajudar" que o Vitor pediu. Balão que volta a cada visita vira propaganda.
  const [convite, setConvite] = useState(false);
  const fim = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setConvite(true), 2500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, pensando, aberto]);

  async function enviar(pergunta) {
    const p = String(pergunta ?? texto).trim();
    if (!p || pensando) return;
    const novas = [...msgs, { role: "user", content: p }];
    setMsgs(novas); setTexto(""); setPensando(true);
    try {
      const r = await fetch(`/api/portal/${token}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: novas }),
      });
      const j = await r.json();
      setMsgs([...novas, { role: "assistant", content: j.resposta || j.error || "Não consegui responder agora." }]);
    } catch {
      setMsgs([...novas, { role: "assistant", content: "Não consegui responder agora. Tente de novo em instantes." }]);
    } finally { setPensando(false); }
  }

  const abrir = () => { setAberto(true); setConvite(false); };

  return (
    <>
      {aberto && (
        <div className="fixed bottom-24 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ height: "min(560px, calc(100vh - 8rem))" }}>
          <div className="flex items-center gap-3 px-4 py-3 bg-[#0D1F3C] text-white shrink-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 shrink-0 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={AVATAR} alt="Torguinho" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[13.5px]">Torguinho</div>
              <div className="text-[11.5px] text-white/60 truncate">{obra ? `Assistente da obra ${obra}` : "Assistente da Torg Metal"}</div>
            </div>
            <button onClick={() => setAberto(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!msgs.length && (
              <div className="space-y-3">
                <p className="text-[13px] text-gray-600 leading-relaxed">
                  Posso ajudar com as peças desta obra: peso, quantidade, em que etapa estão, o que já
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
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start items-end gap-2"}>
                {m.role !== "user" && (
                  <div className="w-7 h-7 rounded-full overflow-hidden border border-gray-200 shrink-0 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATAR} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] whitespace-pre-wrap leading-relaxed ${
                  m.role === "user" ? "bg-[#0D1F3C] text-white" : "bg-gray-50 text-[#0D1F3C] border border-gray-100"}`}>
                  {m.content}
                </div>
              </div>
            ))}

            {pensando && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden border border-gray-200 shrink-0 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={AVATAR} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-[12.5px] text-gray-400 inline-flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> consultando a obra…
                </p>
              </div>
            )}
            <div ref={fim} />
          </div>

          <div className="border-t border-gray-100 p-2.5 flex items-center gap-2 shrink-0">
            <input
              value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Pergunte sobre uma peça…" maxLength={1000}
              className="flex-1 text-[13px] px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#006EAB]"
            />
            <button onClick={() => enviar()} disabled={pensando || !texto.trim()}
              className="shrink-0 px-3 py-2 rounded-lg bg-[#006EAB] text-white disabled:opacity-40 hover:bg-[#005A8C]">
              <Send size={15} />
            </button>
          </div>

          <p className="px-3 pb-2.5 text-[10.5px] text-gray-400 shrink-0">
            Assistente automático — peças e andamento desta obra. Prazo e contrato: fale com o contato da Torg.
          </p>
        </div>
      )}

      {/* ⚠ o convite é uma frase, não um pop-up: diz o que ele faz e sai do caminho no primeiro
          clique — em qualquer lugar da tela, inclusive nele mesmo. */}
      {convite && !aberto && (
        <button onClick={abrir}
          className="fixed bottom-[5.5rem] right-4 z-40 max-w-[260px] text-left bg-white border border-gray-200 rounded-2xl rounded-br-sm shadow-lg px-3.5 py-2.5 hover:border-[#006EAB]">
          <span className="block text-[12.5px] font-semibold text-[#0D1F3C]">Precisa de algo desta obra?</span>
          <span className="block text-[11.5px] text-gray-500 leading-snug">
            Pergunte ao Torguinho: peso, etapa, o que já embarcou e a rastreabilidade de cada peça.
          </span>
        </button>
      )}

      <button onClick={() => (aberto ? setAberto(false) : abrir())}
        title="Falar com o Torguinho"
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg border-2 border-white bg-white overflow-hidden flex items-center justify-center transition-transform hover:scale-110 active:scale-95">
        {aberto
          ? <MessageCircle size={22} className="text-[#0D1F3C]" />
          /* eslint-disable-next-line @next/next/no-img-element */
          : <img src={AVATAR} alt="Torguinho" className="w-full h-full object-cover" />}
      </button>
    </>
  );
}
