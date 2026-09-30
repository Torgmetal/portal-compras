"use client";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { campanhaExibida, rotaDeCliente } from "@/lib/campanha";
import { usarPrevia } from "@/lib/campanha-previa";

// ─── A FAIXA NAS TELAS DO CLIENTE ─────────────────────────────────────────────
// Vitor (30/08/2026): "precisa que na página do cliente tbm traga alguma propaganda mostrando o
// quanto estamos preocupados com isso" e, sobre o texto: "eu não colocaria o CVV 188 e as
// informações na frente, apenas o slogan da Torg". Vale para toda campanha do mês (lib/campanha.js).
//
// ⚠ SÓ O LAÇO E O SLOGAN. Sem telefone, sem explicação da campanha, sem o Torguinho. Na frente do
// cliente, um mascote sorrindo ao lado de uma causa de saúde mudaria o registro da mensagem — de
// "a Torg se preocupa" para "a Torg está fazendo marketing". Internamente o Torguinho funciona,
// porque lá ele é o personagem da casa.
//
// ⚠ ACIMA DO RODAPÉ, não dentro. No rodapé o cliente já parou de ler; a mensagem precisa estar onde
// ele ainda está olhando, e a cor da campanha sobre o fundo claro é o que faz ela ser reconhecida.
//
// ⚠ TROCA SOZINHA na virada do mês (horário de Brasília) — ninguém precisa lembrar de mexer.
export default function FaixaCampanha() {
  const path = usePathname();
  const campanha = campanhaExibida(usarPrevia());
  if (!rotaDeCliente(path) || !campanha) return null;
  const { cor } = campanha;

  return (
    <div className="border-t-[3px]" style={{ borderColor: cor.faixaBorda, background: cor.faixaFundo }}>
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4 sm:px-8">
        <Image src={campanha.laco} alt="" width={34} height={34} className="shrink-0" aria-hidden="true" />
        <p className="text-[13px] leading-relaxed sm:text-sm" style={{ color: cor.faixaTexto }}>
          <span className="font-semibold" style={{ color: cor.faixaTitulo }}>{campanha.nome}</span> — {campanha.slogan}
        </p>
      </div>
    </div>
  );
}
