"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";

export default function ToggleSidebar({ moduloAtual = "Portal Torg" }) {
  const [oculto, setOculto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [celular, setCelular] = useState(false);
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const controle = useRef(null);
  const abrir = useRef(null);

  useEffect(() => {
    setMontado(true);
    try { setOculto(localStorage.getItem("menuOculto") === "1"); } catch {}
    const media = window.matchMedia("(max-width: 1023px)");
    const atualizar = () => { setCelular(media.matches); setAberto(false); };
    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);
  useEffect(() => { setAberto(false); }, [pathname]);
  useEffect(() => {
    if (!montado) return;
    document.documentElement.classList.toggle("menu-oculto", oculto);
    try { localStorage.setItem("menuOculto", oculto ? "1" : "0"); } catch {}
  }, [oculto, montado]);

  useEffect(() => {
    const aside = controle.current?.closest("aside");
    if (!aside) return;
    const visivel = celular && aberto;
    document.documentElement.classList.toggle("menu-mobile-aberto", visivel);
    aside.inert = celular && !aberto;
    if (celular && !aberto) aside.setAttribute("aria-hidden", "true");
    else aside.removeAttribute("aria-hidden");
    const anterior = document.body.style.overflow;
    if (visivel) {
      document.body.style.overflow = "hidden";
      controle.current.focus();
    }
    const fechar = () => { setAberto(false); abrir.current?.focus(); };
    const teclado = (event) => {
      if (!visivel) return;
      if (event.key === "Escape") { event.preventDefault(); fechar(); }
      if (event.key === "Tab") {
        const itens = [...aside.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
        const primeiro = itens[0], ultimo = itens[itens.length - 1];
        if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
        else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
      }
    };
    const navegar = (event) => { if (visivel && event.target.closest("a[href]")) fechar(); };
    aside.addEventListener("click", navegar);
    document.addEventListener("keydown", teclado);
    return () => {
      aside.inert = false;
      aside.removeAttribute("aria-hidden");
      document.documentElement.classList.remove("menu-mobile-aberto");
      if (visivel) document.body.style.overflow = anterior;
      aside.removeEventListener("click", navegar);
      document.removeEventListener("keydown", teclado);
    };
  }, [celular, aberto]);

  return <>
    <button ref={controle} onClick={() => { if (celular) { setAberto(false); abrir.current?.focus(); } else setOculto(true); }}
      title={celular ? "Fechar menu" : "Ocultar menu"} aria-label={celular ? "Fechar menu" : "Ocultar menu"}
      className="p-1.5 rounded-lg text-torg-gray hover:text-torg-blue hover:bg-torg-blue-50 transition-colors">
      {celular ? <X size={22} /> : <PanelLeftClose size={18} />}
    </button>
    {montado && celular && createPortal(<>
      <header className="portal-barra-mobile">
        <button ref={abrir} onClick={() => setAberto(true)} aria-label="Abrir menu" aria-expanded={aberto}><Menu size={24} /></button>
        <span>{moduloAtual}</span>
      </header>
      {aberto && <button className="portal-fundo-mobile" aria-label="Fechar menu lateral" onClick={() => { setAberto(false); abrir.current?.focus(); }} />}
    </>, document.body)}
    {montado && !celular && oculto && createPortal(
      <button onClick={() => setOculto(false)} title="Mostrar menu" className="fixed left-0 top-4 z-[60] bg-torg-blue text-white rounded-r-lg shadow-lg py-2 pl-1.5 pr-2 hover:bg-torg-dark transition-colors"><PanelLeftOpen size={18} /></button>, document.body)}
  </>;
}
