"use client";
import { emSetembroAmarelo, usarPrevia, LACO, SLOGAN } from "@/lib/campanha";

// ─── O SELO, PARA FUNDO ESCURO ────────────────────────────────────────────────
// Vitor (30/08/2026), apontando o canto superior direito do portal da obra: "aqui no portal do
// cliente eu colocaria aqui".
//
// ⚠ AQUI É MELHOR QUE A FAIXA, nesta tela. O cabeçalho já carrega as duas marcas e o nome da obra;
// o selo entra na mesma linha, equilibra o canto vazio à direita e não empurra o conteúdo para
// baixo — a faixa no topo empurrava. Nas outras telas do cliente (apresentação, ata, assinatura,
// fornecedor) não existe um cabeçalho assim, e lá a faixa continua sendo a resposta certa.
//
// ⚠ O SLOGAN VAI JUNTO, não só o laço. Laço sozinho no canto o cliente não liga a nada — quem não
// acompanha a campanha vê um enfeite amarelo. É a frase que diz por que ele está ali.
export default function SeloSetembroAmarelo({ className = "" }) {
  const previa = usarPrevia();
  if (!(emSetembroAmarelo() || previa)) return null;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LACO}
        alt=""
        aria-hidden="true"
        className="h-11 w-11 shrink-0 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] sm:h-14 sm:w-14"
      />
      {/* no celular fica só o laço: ao lado das duas marcas, o texto quebraria o cabeçalho */}
      <div className="hidden text-right sm:block">
        <p className="text-[13px] font-semibold leading-tight text-[#F4C000]">Setembro Amarelo</p>
        {/* ⚠ `text-balance` + largura folgada: em 15rem a frase quebrava em três linhas com
            "vida." sozinha na última. Duas linhas equilibradas é o que cabe ao lado do logo. */}
        <p className="mt-0.5 max-w-[19rem] text-balance text-[12px] leading-snug text-[#cfe0ef]">{SLOGAN}</p>
      </div>
    </div>
  );
}
