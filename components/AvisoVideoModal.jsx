"use client";
import { useEffect, useRef, useState } from "react";
import { Headphones } from "lucide-react";
import { LACO } from "@/lib/campanha";

// ─── COMUNICADO EM VÍDEO, COM CIÊNCIA OBRIGATÓRIA ─────────────────────────────
// Vitor (30/08/2026): "não poderia dar para adiar, e registrar seria maravilhoso pois isso conta
// muito"; depois de ver a primeira versão: "o aviso da tela poderia ser maior e mais bem feito no
// sentido artístico, e não precisa aparecer em nada o canal 188 CVV".
//
// ⚠ NÃO TOCA SOZINHO. O tema é prevenção ao suicídio; quem chega às 7h e está pessoalmente
// atravessando isso não deve ser pego de surpresa por um vídeo começando. A abertura diz o que é, e
// o vídeo só começa no clique — obrigatório continua sendo, mas com aviso.
//
// ⚠⚠ SE O VÍDEO NÃO CARREGAR, LIBERA. O modal é obrigatório e não fecha; num wifi de fábrica que
// falha, isso trancaria a pessoa fora do portal para trabalhar. Na falha de carregamento a ciência é
// gravada com `assistiu: false` e o motivo — a lista de quem viu continua honesta, e ninguém fica
// impedido de trabalhar por causa de um vídeo.
//
// ⚠ A ABERTURA ENCOLHE QUANDO O VÍDEO COMEÇA. Em tela de notebook, a capa cheia mais um vídeo 16:9
// não cabem juntos: ou o vídeo sai cortado, ou o botão de concluir fica abaixo da dobra e a pessoa
// acha que travou.
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050B16]/90 p-4 backdrop-blur-md sm:p-6">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">

        {/* ── abertura ── */}
        <div className="relative overflow-hidden bg-[#0D1F3C]">
          {/* o brilho amarelo atrás do laço: dá profundidade sem virar gradiente de banner */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 60% 90% at 18% 50%, rgba(244,192,0,0.20), transparent 70%)" }}
          />
          <div
            className={`relative flex items-center gap-6 px-8 transition-all duration-500 sm:gap-8 sm:px-12 ${
              tocando ? "py-5" : "py-10 sm:py-12"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LACO}
              alt=""
              aria-hidden="true"
              className={`shrink-0 drop-shadow-[0_6px_18px_rgba(244,192,0,0.35)] transition-all duration-500 ${
                tocando ? "h-12 w-12" : "h-24 w-24 sm:h-28 sm:w-28"
              }`}
            />
            <div className="min-w-0">
              <h2
                className={`font-light leading-none tracking-tight text-white transition-all duration-500 ${
                  tocando ? "text-xl" : "text-3xl sm:text-5xl"
                }`}
              >
                Setembro <span className="font-bold text-[#F4C000]">Amarelo</span>
              </h2>
              {!tocando ? (
                <>
                  <div className="mt-5 h-[3px] w-16 rounded-full bg-[#F4801F]" />
                  <p className="mt-4 text-sm text-[#9FB6D4]">Torg Metal · comunicado interno</p>
                </>
              ) : (
                <p className="mt-1 text-xs text-[#9FB6D4]">Torg Metal · comunicado interno</p>
              )}
            </div>
          </div>
        </div>

        {/* ── corpo ── */}
        <div className={tocando ? "p-5 sm:p-7" : "px-8 py-10 sm:px-12 sm:py-12"}>
          {!tocando ? (
            <>
              {aviso.corpo ? (
                <p className="max-w-2xl whitespace-pre-wrap text-[17px] leading-[1.75] text-[#1B2A44]">
                  {aviso.corpo}
                </p>
              ) : null}
              {/* ⚠ o aviso do fone vem ANTES do play: depois que o vídeo começou já é tarde, e quem
                  está no meio do escritório fecha o som em vez de assistir. */}
              <div className="mt-8 flex items-center gap-3 rounded-xl border border-[#F0DCA0] bg-[#FFFBEE] px-5 py-4">
                <Headphones size={20} className="shrink-0 text-[#9A6B00]" aria-hidden="true" />
                <p className="text-[15px] font-medium text-[#6B4A00]">
                  Use fone de ouvido — o vídeo tem áudio.
                </p>
              </div>
              <p className="mt-5 text-sm text-[#6B7C96]">
                Assista ao vídeo para continuar. Sua participação fica registrada.
              </p>
              <button
                onClick={() => setTocando(true)}
                className="mt-6 w-full rounded-xl bg-[#006EAB] px-6 py-4 text-base font-semibold text-white shadow-lg shadow-[#006EAB]/25 transition hover:bg-[#005A8C] sm:w-auto sm:px-10"
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
                className="w-full rounded-xl bg-black"
              />
              {falhou ? (
                <div className="mt-6">
                  <p className="text-[15px] leading-relaxed text-[#1B2A44]">
                    O vídeo não carregou — pode ser a conexão. Você pode seguir para o portal; isso
                    fica registrado e o RH reapresenta o comunicado.
                  </p>
                  <button
                    disabled={saindo}
                    onClick={() => registrar({ assistiu: false, motivo: "vídeo não carregou" })}
                    className="mt-5 w-full rounded-xl border border-[#C9D6E6] px-6 py-4 font-semibold text-[#1B2A44] transition hover:bg-[#F2F6FB] disabled:opacity-50"
                  >
                    Continuar para o portal
                  </button>
                </div>
              ) : (
                <button
                  disabled={!fim || saindo}
                  onClick={() => registrar({ assistiu: true })}
                  className="mt-6 w-full rounded-xl bg-[#006EAB] px-6 py-4 text-base font-semibold text-white shadow-lg shadow-[#006EAB]/25 transition hover:bg-[#005A8C] disabled:cursor-not-allowed disabled:bg-[#DCE5EF] disabled:text-[#8496AD] disabled:shadow-none"
                >
                  {fim ? "Concluir e entrar no portal" : "Assista até o final para continuar"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
