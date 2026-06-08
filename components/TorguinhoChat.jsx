"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, MessageCircle, ChevronDown } from "lucide-react";
import { useSession } from "next-auth/react";
import { fraseDoDia } from "@/lib/torguinho-frases";

// ─── Renderiza markdown simples (negrito, listas, emojis) ─────────────────────
function MensagemTexto({ texto }) {
  // Converte **negrito**, listas e quebras de linha em JSX
  const linhas = texto.split("\n");
  return (
    <div className="space-y-1">
      {linhas.map((linha, i) => {
        if (!linha.trim()) return <div key={i} className="h-1" />;

        // Cabeçalhos ━━━ (separadores)
        if (/^━+$/.test(linha.trim())) {
          return <hr key={i} className="border-white/20 my-1" />;
        }

        // Itens de lista
        const isList = /^[-•*]\s/.test(linha) || /^\d+\.\s/.test(linha);

        // Processa negrito **texto**
        const partes = [];
        let resto = linha.replace(/^[-•*]\s/, "").replace(/^\d+\.\s/, "");
        const regexNegrito = /\*\*(.+?)\*\*/g;
        let lastIndex = 0;
        let match;
        while ((match = regexNegrito.exec(resto)) !== null) {
          if (match.index > lastIndex) partes.push(resto.slice(lastIndex, match.index));
          partes.push(<strong key={match.index}>{match[1]}</strong>);
          lastIndex = match.index + match[0].length;
        }
        if (lastIndex < resto.length) partes.push(resto.slice(lastIndex));

        return (
          <p key={i} className={isList ? "flex gap-1.5" : ""}>
            {isList && <span className="mt-0.5 shrink-0 opacity-60">•</span>}
            <span>{partes.length > 0 ? partes : linha}</span>
          </p>
        );
      })}
    </div>
  );
}

// ─── Bolha de mensagem ────────────────────────────────────────────────────────
function Bolha({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden mt-0.5 border-2 border-white shadow">
          <img src="/torguinho.png" alt="Torguinho" className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = "🤖"; }}
          />
        </div>
      )}

      {/* Conteúdo */}
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-torg-blue text-white rounded-tr-sm"
            : "bg-white text-gray-800 rounded-tl-sm border border-gray-100"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <MensagemTexto texto={msg.content} />
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TorguinhoChat() {
  const { data: session, status } = useSession();
  const [aberto,     setAberto]     = useState(false);
  const [mensagens,  setMensagens]  = useState([]);
  const [input,      setInput]      = useState("");
  const [carregando, setCarregando] = useState(false);
  const [iniciado,   setIniciado]   = useState(false);
  const [config,     setConfig]     = useState(null); // null = ainda carregando

  const fimRef   = useRef(null);
  const inputRef = useRef(null);

  // Carrega config ao montar
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/assistente/config")
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ ativo: true, modulosHabilitados: [] }));
  }, [status]);

  // Scroll automático para o fim
  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, aberto]);

  // Foca input ao abrir
  useEffect(() => {
    if (!aberto || !config) return;
    setTimeout(() => inputRef.current?.focus(), 150);
    // Mensagem de boas-vindas na primeira abertura
    if (!iniciado) {
      const nome = session?.user?.name?.split(" ")[0] || "colega";
      setIniciado(true);

      // Frase motivacional do dia — aparece TODA vez que abre o chat (rotaciona a cada dia)
      const frase = fraseDoDia();

      // Tudo numa única bolha: frase do dia + saudação
      const saudacao = `👷 Sou o **Torguinho**, seu parceiro aqui na Torg! Posso ajudar com dúvidas de metalurgia, processos e materiais, e consultar dados do portal — OPs, estoque, produção. O que você precisa? 🔩`;
      const content = `✨ **Frase do dia, ${nome}:**\n"${frase}"\n\n${saudacao}`;

      setMensagens([{ role: "assistant", meta: "intro", content }]);
    }
  }, [aberto, config]);

  // ─── Visibilidade (calculada APÓS todos os hooks) ─────────────────────────
  const user = session?.user;
  const temAcesso = !config?.modulosHabilitados?.length ||
    user?.tipo === "ADMIN" ||
    (user?.modulos ?? []).some(m => config.modulosHabilitados.includes(m));

  if (status !== "authenticated" || !config || !config.ativo || !temAcesso) return null;

  const nome = user?.name?.split(" ")[0] || "colega";

  async function enviar() {
    const texto = input.trim();
    if (!texto || carregando) return;

    const novasMensagens = [...mensagens, { role: "user", content: texto }];
    setMensagens(novasMensagens);
    setInput("");
    setCarregando(true);

    try {
      // Envia apenas as mensagens reais (sem boas-vindas/frase do dia)
      const historico = novasMensagens
        .filter((m) => !m.meta)
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/assistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: historico }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao obter resposta");
      }

      setMensagens((prev) => [...prev, { role: "assistant", content: data.resposta }]);
    } catch (e) {
      setMensagens((prev) => [
        ...prev,
        { role: "assistant", content: `Opa, deu um problema aqui! 😅 Tenta de novo: _${e.message}_` },
      ]);
    } finally {
      setCarregando(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  function limparChat() {
    setMensagens([]);
    setIniciado(false);
    setAberto(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Drawer do chat ── */}
      {aberto && (
        <div className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col bg-gray-50 rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ height: "520px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-torg-dark text-white shrink-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 shrink-0">
              <img src="/torguinho.png" alt="Torguinho" className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = "none"; e.target.parentElement.textContent = "🤖"; }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Torguinho</div>
              <div className="text-xs text-white/60">Assistente Torg Metal</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={limparChat}
                title="Limpar conversa"
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs"
              >
                Limpar
              </button>
              <button
                onClick={() => setAberto(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {mensagens.map((msg, i) => (
              <Bolha key={i} msg={msg} />
            ))}

            {/* Indicador de digitação */}
            {carregando && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-white shadow shrink-0">
                  <img src="/torguinho.png" alt="" className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = "none"; e.target.parentElement.textContent = "🤖"; }}
                  />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-100 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-torg-blue rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-torg-blue rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-torg-blue rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={fimRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-200 bg-white shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte algo ao Torguinho..."
                disabled={carregando}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-torg-blue disabled:opacity-50 max-h-24 overflow-y-auto"
                style={{ lineHeight: "1.4" }}
              />
              <button
                onClick={enviar}
                disabled={!input.trim() || carregando}
                className="p-2.5 rounded-xl bg-torg-blue text-white hover:bg-torg-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {carregando ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-1.5">
              Enter para enviar · Shift+Enter para nova linha
            </p>
          </div>
        </div>
      )}

      {/* ── Botão flutuante ── */}
      <button
        onClick={() => setAberto((v) => !v)}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
          aberto ? "bg-torg-dark" : "bg-torg-blue"
        }`}
        title="Falar com o Torguinho"
      >
        {aberto ? (
          <X size={22} className="text-white" />
        ) : (
          <div className="w-10 h-10 rounded-full overflow-hidden">
            <img src="/torguinho.png" alt="Torguinho" className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'; }}
            />
          </div>
        )}

        {/* Badge de notificação (pode ser ativado futuramente) */}
        {!aberto && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
        )}
      </button>
    </>
  );
}
