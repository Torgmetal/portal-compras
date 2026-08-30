"use client";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { emSetembroAmarelo, rotaDeCliente, LACO, SLOGAN } from "@/lib/campanha";

// ─── A FAIXA NAS TELAS DO CLIENTE ─────────────────────────────────────────────
// Vitor (30/08/2026): "precisa que na página do cliente tbm traga alguma propaganda mostrando o
// quanto estamos preocupados com isso" e, sobre o texto: "eu não colocaria o CVV 188 e as
// informações na frente, apenas o slogan da Torg".
//
// ⚠ SÓ O LAÇO E O SLOGAN. Sem telefone, sem explicação da campanha, sem o Torguinho. Na frente do
// cliente, um mascote sorrindo ao lado de prevenção ao suicídio mudaria o registro da mensagem — de
// "a Torg se preocupa" para "a Torg está fazendo marketing". Internamente o Torguinho funciona,
// porque lá ele é o personagem da casa.
//
// ⚠ ACIMA DO RODAPÉ, não dentro. No rodapé o cliente já parou de ler; a mensagem precisa estar onde
// ele ainda está olhando, e o amarelo sobre o fundo claro é o que faz a campanha ser reconhecida.
//
// ⚠ SAI SOZINHA em 01/10 (horário de Brasília) — ninguém precisa lembrar de desligar.
export default function FaixaSetembroAmarelo() {
  const path = usePathname();
  if (!rotaDeCliente(path) || !emSetembroAmarelo()) return null;

  return (
    <div className="border-t-[3px] border-[#F4C000] bg-[#FFF8E1]">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4 sm:px-8">
        <Image src={LACO} alt="" width={34} height={34} className="shrink-0" aria-hidden="true" />
        <p className="text-[13px] leading-relaxed text-[#7a4a06] sm:text-sm">
          <span className="font-semibold text-[#412402]">Setembro Amarelo</span> — {SLOGAN}
        </p>
      </div>
    </div>
  );
}
