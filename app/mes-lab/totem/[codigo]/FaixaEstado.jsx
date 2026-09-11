"use client";

import { Pause, Play, Square, Wrench, Clock, Hammer, HelpCircle } from "lucide-react";

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
// ⚠ SEM EVENTO É "SEM REGISTRO", NÃO "PARADO". Conectividade é dimensão separada do estado
// produtivo (§7.3 do doc): máquina que nunca apontou não é máquina parada, e pintar de vermelho o
// que ninguém sabe envenena o Pareto e a Disponibilidade com tempo que ninguém viveu.

export const ESTADO_VISUAL = {
  PRODUCAO:   { rotulo: "PRODUZINDO",    fundo: "bg-emerald-600", Icone: Play },
  PARADA:     { rotulo: "PARADO",        fundo: "bg-red-600",     Icone: Pause },
  SETUP:      { rotulo: "EM SETUP",      fundo: "bg-amber-500",   Icone: Wrench },
  RETRABALHO: { rotulo: "RETRABALHO",    fundo: "bg-orange-600",  Icone: Hammer },
  MANUTENCAO: { rotulo: "EM MANUTENÇÃO", fundo: "bg-sky-600",     Icone: Wrench },
  FORA_TURNO: { rotulo: "FORA DE TURNO", fundo: "bg-slate-600",   Icone: Clock },
  ENCERRAMENTO: { rotulo: "ENCERRADO",   fundo: "bg-slate-700",   Icone: Square },
};

const DESCONHECIDO = { rotulo: "SEM REGISTRO", fundo: "bg-white/15", Icone: HelpCircle };

export const visualDo = (estado) => ESTADO_VISUAL[estado] || DESCONHECIDO;

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
  const { rotulo, fundo, Icone } = visualDo(estado);
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
