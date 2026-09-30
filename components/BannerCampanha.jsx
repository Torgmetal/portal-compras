"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { campanhaExibida } from "@/lib/campanha";
import { usarPrevia } from "@/lib/campanha-previa";
import { hojeBRT } from "@/lib/data-br";

// ─── O BANNER DO PRIMEIRO ACESSO ──────────────────────────────────────────────
// Vitor (30/09/2026): "consegue criar um banner com a informação e uma mensagem para todos que fizerem
// o primeiro acesso, incluindo clientes". O texto e as cores moram na campanha (lib/campanha.js,
// `banner`); campanha sem `banner` não abre nada.
//
// ⚠ UMA VEZ POR APARELHO, por campanha e ano (localStorage). Não é o vídeo obrigatório do mural: aqui
// ninguém precisa provar que leu, então não há registro no banco — e o cliente, que não tem login,
// também recebe.
//
// ⚠ NÃO ABRE ONDE A PESSOA ESTÁ NO MEIO DE UMA TAREFA: login, assinatura, ata, aceite do data book
// (mesma regra da faixa, ver lib/campanha.js) e a conferência de peça no pátio, que é tela cheia no
// celular com o caminhão esperando.
const FORA = [
  "/entrar", "/esqueci-senha", "/assinar/", "/ata/", "/ata-op/",
  "/data-book/assinar/", "/data-book/aceite/", "/expedicao/conferencia/",
];

export const chaveVisto = (id, ano) => `torg:campanha-vista:${id}:${ano}`;

export default function BannerCampanha() {
  const path = usePathname() || "";
  const previa = usarPrevia();
  const campanha = campanhaExibida(previa);
  const banner = campanha?.banner;
  const chave = campanha ? chaveVisto(campanha.id, hojeBRT().slice(0, 4)) : null;
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!banner || FORA.some((p) => path.startsWith(p))) { setAberto(false); return; }
    // a prévia mostra sempre — é para validar, e já ter fechado uma vez não pode esconder o que se quer ver
    if (previa) { setAberto(true); return; }
    let visto = false;
    try { visto = localStorage.getItem(chave) === "1"; } catch { /* sem storage: mostra */ }
    setAberto(!visto);
  }, [banner, chave, path, previa]);

  const fechar = useCallback(() => {
    try { if (chave) localStorage.setItem(chave, "1"); } catch { /* sem storage: fecha só agora */ }
    setAberto(false);
  }, [chave]);

  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (e) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, fechar]);

  if (!aberto || !banner) return null;
  const { cor } = campanha;

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="banner-campanha-titulo"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#050B16]/70 p-4 backdrop-blur-sm"
      onClick={fechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="grid max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] sm:grid-cols-[250px_1fr]"
      >
        <div className="flex items-center justify-center p-5 sm:p-8" style={{ background: cor.bannerFundo }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={campanha.laco} alt="" aria-hidden="true" className="h-20 w-20 sm:h-36 sm:w-36" />
        </div>
        <div className="p-6 sm:p-9">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: cor.bannerTag }}>{campanha.nome}</p>
          <h2 id="banner-campanha-titulo" className="mt-2 text-balance text-2xl font-bold leading-tight text-torg-dark sm:text-3xl">
            {banner.titulo}
          </h2>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[#33475b]">
            {banner.paragrafos.map((p, i) => (
              <p key={i}>
                {p.destaque ? <b style={{ color: cor.faixaTexto }}>{p.destaque} </b> : null}
                {p.texto}
              </p>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <span className="text-[12.5px] text-torg-gray">Torg Metal · {campanha.nome}</span>
            <button type="button" autoFocus onClick={fechar}
              className="rounded-lg px-6 py-2.5 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: cor.botao }}>
              {banner.botao}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
