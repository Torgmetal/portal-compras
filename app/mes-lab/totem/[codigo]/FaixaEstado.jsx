"use client";

import { Pause, Play, Square, Wrench, Clock, Hammer, HelpCircle } from "lucide-react";
import { visualDo } from "./estado-visual";

// ─── O ESTADO DO POSTO, VISÍVEL DO CORREDOR ───────────────────────────────────
//
// ⚠⚠ ANTES O ESTADO ESTAVA ESCRITO EM DOIS LUGARES, E UM DELES MENTIA. O card da sessão trazia o
// rótulo "PRODUZINDO" FIXO no código: o operador apertava Parada, o evento era gravado certo, e a
// tela continuava anunciando "PRODUZINDO" — só uma bolinha de 12 px no canto virava vermelha.
// Matheus (11/09/2026): "é importante evidenciar mais os status de PRODUZINDO, PARADO, ENCERRADO".
//
// ⚠⚠ A COR SOZINHA NÃO SERVE. Quem confere o posto de longe pode não distinguir verde de vermelho
// (daltonismo é comum no chão de fábrica), e o reflexo do galpão come saturação. Por isso a faixa
// tem COR + PALAVRA + ÍCONE — três sinais para a mesma informação.
//
// ⚠ Os NOMES e as CORES moram em `estado-visual.js`, que é neutro: a lista de bancadas do setor é
// Server Component e não consegue importar função de um arquivo `"use client"`.

const ICONES = {
  play: Play, pause: Pause, chave: Wrench, martelo: Hammer,
  relogio: Clock, quadrado: Square, duvida: HelpCircle,
};

const hora = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(+t) ? null : t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

/**
 * A faixa larga que diz o que o posto está fazendo AGORA.
 *
 * ⚠ O horário de início vem junto porque "PARADO" sem desde quando não deixa ninguém decidir se
 * corre até a máquina. É o mesmo `desde` que o monitor usa para saber se o dado está velho demais.
 */
export default function FaixaEstado({ estado, desde, detalhe }) {
  const { rotulo, fundo, icone } = visualDo(estado);
  const Icone = ICONES[icone] || HelpCircle;
  const inicio = hora(desde);

  return (
    <div className={`${fundo} rounded-2xl px-6 py-5 mb-5 flex items-center justify-between gap-4 shadow-lg`}>
      <span className="flex items-center gap-4 min-w-0">
        <Icone size={40} className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-3xl md:text-5xl font-extrabold leading-none tracking-tight">{rotulo}</span>
          {detalhe && <span className="block text-white/85 text-lg truncate mt-1">{detalhe}</span>}
        </span>
      </span>
      {inicio && (
        <span className="text-right shrink-0">
          <span className="block text-white/70 text-xs uppercase tracking-widest">desde</span>
          <span className="block text-2xl md:text-3xl font-bold tabular-nums">{inicio}</span>
        </span>
      )}
    </div>
  );
}
