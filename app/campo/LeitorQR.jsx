"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Loader2, AlertCircle } from "lucide-react";

/**
 * LEITOR DE QR DO DESENHO.
 *
 * O QR impresso pelo Tekla traz a MARCA em texto puro — conferido nos desenhos da OP-083:
 * `T83A13.pdf` → "T83A13", `T83A-P1 - CROQUI.pdf` → "T83A-P1". Nada de URL.
 *
 * ⚠ Por que jsQR e não a API do navegador: `BarcodeDetector` existe no Chrome do Android e NÃO
 * existe no Safari do iPhone. Como não dá pra escolher o aparelho do inspetor, o decodificador vai
 * em JavaScript e funciona nos dois.
 *
 * ⚠ Câmera exige HTTPS. Em produção é https; em `localhost` o navegador também libera. Num IP de
 * rede local (http://192.168…) o navegador bloqueia — daí a mensagem explicando, em vez de uma
 * tela preta sem motivo.
 */
export default function LeitorQR({ onLer, onFechar }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  // ⚠ `onLer` NÃO pode entrar nas dependências do efeito. Ele chega como função criada a cada
  // render do pai, então o efeito refaria — e refazer aqui significa PARAR E REABRIR A CÂMERA. Na
  // prática seria a imagem piscando enquanto o inspetor tenta mirar o QR. A ref guarda sempre a
  // versão mais nova sem mexer no ciclo de vida da câmera.
  const onLerRef = useRef(onLer);
  useEffect(() => { onLerRef.current = onLer; }, [onLer]);

  useEffect(() => {
    let vivo = true;
    let raf = null;

    const parar = () => {
      if (raf) cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este navegador não abre a câmera. Use a busca pela marca.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // facingMode traseira: a câmera frontal não alcança o desenho na bancada
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true"); // sem isso o iOS abre em tela cheia e some com a UI
        await v.play();
        setPronto(true);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const varrer = () => {
          if (!vivo) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const achou = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (achou?.data) {
              parar();
              onLerRef.current?.(achou.data);
              return;
            }
          }
          raf = requestAnimationFrame(varrer);
        };
        raf = requestAnimationFrame(varrer);
      } catch (e) {
        setErro(
          e?.name === "NotAllowedError"
            ? "Permissão de câmera negada. Libere nas configurações do navegador."
            : "Não foi possível abrir a câmera. Use a busca pela marca."
        );
      }
    })();

    // sem dependências: a câmera abre UMA vez, e só fecha quando o componente sai
    return () => { vivo = false; parar(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-semibold">Aponte para o QR do desenho</span>
        <button onClick={onFechar} className="p-1"><X size={22} /></button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {/* mira: dá ao usuário onde encaixar, e o QR do desenho é pequeno */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 border-4 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {!pronto && !erro && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> abrindo a câmera…
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-white text-sm text-center inline-flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erro}
            </p>
          </div>
        )}
      </div>

      <p className="text-white/70 text-xs text-center px-6 py-4 shrink-0">
        Chegue perto: o código fica no canto do carimbo, ao lado do logo.
      </p>
    </div>
  );
}
