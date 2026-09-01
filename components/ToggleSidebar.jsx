"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

// Oculta/mostra o menu lateral pra ampliar a área de trabalho. Aplica a classe
// `menu-oculto` no <html> (o CSS em globals.css esconde o aside e zera a margem do
// conteúdo). A seta de "mostrar" vai via portal pro body — senão sumiria junto com
// o aside oculto. Estado lembrado no localStorage.
export default function ToggleSidebar() {
  const [oculto, setOculto] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    try { setOculto(localStorage.getItem("menuOculto") === "1"); } catch {}
  }, []);
  useEffect(() => {
    if (!montado) return;
    document.documentElement.classList.toggle("menu-oculto", oculto);
    try { localStorage.setItem("menuOculto", oculto ? "1" : "0"); } catch {}
  }, [oculto, montado]);

  return (
    <>
      <button
        onClick={() => setOculto(true)}
        title="Ocultar menu"
        className="p-1.5 rounded-lg text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 transition-colors"
      >
        <PanelLeftClose size={18} />
      </button>
      {montado && oculto && createPortal(
        <button
          onClick={() => setOculto(false)}
          title="Mostrar menu"
          className="fixed left-0 top-4 z-[60] bg-torg-blue text-white rounded-r-lg shadow-lg py-2 pl-1.5 pr-2 hover:bg-torg-dark transition-colors"
        >
          <PanelLeftOpen size={18} />
        </button>,
        document.body
      )}
    </>
  );
}
