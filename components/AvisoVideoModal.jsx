"use client";
import { useEffect, useRef, useState } from "react";
import { LACO } from "@/lib/campanha";

// ─── COMUNICADO EM VÍDEO, COM CIÊNCIA OBRIGATÓRIA ─────────────────────────────
// Vitor (30/08/2026): "não poderia dar para adiar, e registrar seria maravilhoso pois isso conta
// muito". Campanha do Setembro Amarelo, 01/09.
//
// ⚠ NÃO TOCA SOZINHO. O tema é prevenção ao suicídio; quem chega às 7h e está pessoalmente
// atravessando isso não deve ser pego de surpresa por um vídeo começando. A primeira tela diz o que
// é e quanto dura, e o vídeo só começa no clique — obrigatório continua sendo, mas com aviso.
//
// ⚠⚠ SE O VÍDEO NÃO CARREGAR, LIBERA. O modal é obrigatório e não fecha; num wifi de fábrica que
// falha, isso trancaria a pessoa fora do portal para trabalhar. Na falha de carregamento a ciência é
// gravada com `assistiu: false` e o motivo — a lista de quem viu continua honesta, e ninguém fica
// impedido de trabalhar por causa de um vídeo.
export default function AvisoVideoModal() {
  const [aviso, setAviso] = useState(null);
  const [tocando, setTocando] = useState(false);
  const [fim, setFim] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/mural/pendente")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.aviso) setAviso(d.aviso); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  // ⚠ trava o scroll do fundo enquanto está aberto: sem isso dá para rolar a página atrás do modal
  // e a sensação é de que o aviso é opcional.
  useEffect(() => {
    if (!aviso) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [aviso]);

  async function registrar({ assistiu, motivo }) {
    setSaindo(true);
    try {
      await fetch("/api/mural/pendente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avisoId: aviso.id, assistiu, motivo }),
      });
    } catch { /* a ciência não pode travar a saída; o modal já cumpriu o papel */ }
    setAviso(null);
  }

  if (!aviso) return null;

  return (
    // sem onClick de fechar no fundo e sem tecla ESC: é obrigatório de propósito
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-torg-blue-900/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-[#0D1F3C] px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LACO} alt="" aria-hidden="true" className="h-10 w-10 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-white">{aviso.titulo}</h2>
            <p className="text-xs text-torg-blue-100">Torg Metal · comunicado interno</p>
          </div>
        </div>

        <div className="p-6">
          {!tocando ? (
            <>
              {aviso.corpo ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-torg-blue-800">{aviso.corpo}</p>
              ) : null}
              <p className="mt-4 text-sm text-torg-blue-600">
                Assista ao vídeo para continuar. Sua participação fica registrada.
              </p>
              <button
                onClick={() => setTocando(true)}
                className="mt-5 w-full rounded-lg bg-[#006EAB] px-5 py-3 font-semibold text-white transition hover:bg-[#005A8C]"
              >
                Assistir agora
              </button>
            </>
          ) : (
            <>
              <video
                ref={videoRef}
                src={aviso.videoUrl}
                controls
                autoPlay
                playsInline
                onEnded={() => setFim(true)}
                onError={() => setFalhou(true)}
                className="w-full rounded-lg bg-black"
              />
              {falhou ? (
                <div className="mt-5">
                  <p className="text-sm text-torg-blue-800">
                    O vídeo não carregou — pode ser a conexão. Você pode seguir para o portal; isso
                    fica registrado e o RH reapresenta o comunicado.
                  </p>
                  <button
                    disabled={saindo}
                    onClick={() => registrar({ assistiu: false, motivo: "vídeo não carregou" })}
                    className="mt-4 w-full rounded-lg border border-torg-blue-200 px-5 py-3 font-semibold text-torg-blue-800 transition hover:bg-torg-blue-50 disabled:opacity-50"
                  >
                    Continuar para o portal
                  </button>
                </div>
              ) : (
                <button
                  disabled={!fim || saindo}
                  onClick={() => registrar({ assistiu: true })}
                  className="mt-5 w-full rounded-lg bg-[#006EAB] px-5 py-3 font-semibold text-white transition hover:bg-[#005A8C] disabled:cursor-not-allowed disabled:bg-torg-blue-200 disabled:text-torg-blue-500"
                >
                  {fim ? "Concluir e entrar no portal" : "Assista até o final para continuar"}
                </button>
              )}
            </>
          )}
        </div>

        <div className="border-t border-torg-blue-100 bg-torg-blue-50/40 px-6 py-3 text-center text-xs text-torg-blue-600">
          Se você precisar conversar, o <strong>CVV</strong> atende 24 h pelo <strong>188</strong> —
          ligação gratuita e sigilosa.
        </div>
      </div>
    </div>
  );
}
