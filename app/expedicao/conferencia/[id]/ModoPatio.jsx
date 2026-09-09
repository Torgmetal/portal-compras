"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Maximize2, Minimize2, X } from "lucide-react";
import { usarModoPatio } from "../modo-patio";

const CHAVE_DICA = "torg-conferencia-dica-tela-cheia";

/**
 * A moldura de campo — cobre a viewport inteira no celular, sem a sidebar por trás.
 *
 * ⚠⚠ SAIR EXIGE CONFIRMAÇÃO. Matheus (08/09/2026): "não ter chance do operador sair sem querer".
 * O único jeito de voltar pra lista é o botão ✕, que abre uma folha de confirmação — não um
 * `Link` normal, que sairia num toque só.
 */
export default function ModoPatio({ titulo, children }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const [dica, setDica] = useState(false);
  const { telaCheia, suporta, standalone, alternar } = usarModoPatio();

  useEffect(() => {
    // Sem tela cheia de verdade disponível (iPhone) e ainda não é standalone: avisa uma vez só
    // como sair da barra do navegador — não promete o que o navegador não entrega.
    if (suporta || standalone) return;
    try { if (!localStorage.getItem(CHAVE_DICA)) setDica(true); } catch { /* privado: sem dica */ }
  }, [suporta, standalone]);

  const dispensarDica = () => {
    setDica(false);
    try { localStorage.setItem(CHAVE_DICA, "1"); } catch { /* melhor-esforço, não trava a tela */ }
  };

  const sair = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push("/expedicao/conferencia");
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50" style={{ height: "100dvh" }}>
      <header className="shrink-0 bg-torg-dark text-white px-3 flex items-center justify-between"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}>
        <div className="min-w-0 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/50">Modo pátio</div>
          {titulo && <div className="text-[13.5px] font-semibold truncate">{titulo}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {suporta && (
            <button onClick={alternar} aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10">
              {telaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          <button onClick={() => setSaindo(true)} aria-label="Sair do modo pátio"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
      </header>

      {dica && (
        <div className="shrink-0 bg-torg-orange/10 text-torg-dark text-[12px] px-3 py-2 flex items-center gap-2">
          <span className="flex-1 leading-snug">
            Pra abrir sem a barra do navegador: toque em Compartilhar → Adicionar à Tela de Início.
          </span>
          <button onClick={dispensarDica} className="font-semibold underline shrink-0">ok</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {children}
      </div>

      {saindo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setSaindo(false)}>
          <div className="w-full bg-white rounded-t-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-semibold text-torg-dark">Sair do modo pátio?</p>
            <p className="text-[13px] text-torg-gray">
              A conferência continua aberta — o que já foi lançado está salvo.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setSaindo(false)}
                className="border border-gray-200 text-torg-gray font-semibold rounded-lg py-3 text-sm">
                Continuar
              </button>
              <button onClick={sair}
                className="bg-torg-dark text-white font-semibold rounded-lg py-3 text-sm flex items-center justify-center gap-1.5">
                <LogOut size={15} /> Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
