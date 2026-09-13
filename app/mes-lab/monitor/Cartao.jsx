"use client";

import { TriangleAlert } from "lucide-react";
import { visualDo } from "@/lib/mes/estado-visual";
import { decorrido } from "./decorrido";

// O CARD DE UM POSTO. Feito para ser lido de longe: o estado é a faixa colorida inteira, não um
// pontinho no canto. Mesmo princípio da tela do operador — e o mesmo mapa de cores
// (`lib/mes/estado-visual.js`), para as duas telas nunca discordarem sobre o que é "produzindo".

const Linha = ({ rotulo, valor }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[11px] uppercase tracking-wide text-white/40">{rotulo}</span>
    <span className="truncate text-sm font-semibold text-white/90">{valor}</span>
  </div>
);

/** ⚠ Zero aparece como "—": "0 rejeitadas" numa coluna cheia de zeros só faz ruído. */
const Numero = ({ rotulo, valor, cor = "text-white" }) => (
  <div className="min-w-0 flex-1">
    <div className="text-[10px] uppercase tracking-wide text-white/40">{rotulo}</div>
    <div className={`text-2xl font-black tabular-nums ${valor ? cor : "text-white/25"}`}>
      {valor || "—"}
    </div>
  </div>
);

/** Tem sessão em cima? É o que decide o card curto (só nome e estado) e o card cheio. */
const temTrabalho = (p) => Boolean(p.operador || p.obra || p.marca || p.planejado || p.produzido);

export default function Cartao({ posto, agora }) {
  const visual = visualDo(posto.estado);
  return (
    <div className="overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
      <div className={`flex items-center justify-between gap-3 px-4 py-2.5 ${visual.fundo}`}>
        <span className="truncate text-lg font-black tracking-tight text-white">{visual.rotulo}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-white/80">
          {decorrido(posto.desde, agora)}
        </span>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-xl font-extrabold text-white">{posto.nome}</h3>
          <span className="shrink-0 text-xs font-semibold text-white/40">{posto.codigo}</span>
        </div>

        {posto.detalhe ? (
          <p className="mt-1 truncate text-sm font-semibold text-amber-300">{posto.detalhe}</p>
        ) : null}

        {/* ⚠⚠ POSTO SEM TRABALHO NÃO MOSTRA AS LINHAS VAZIAS, e isso é o que faz a TV servir. Com
            31 postos sem sessão, eram 31 cards de sete linhas de "—" empurrando para fora da tela
            justamente os poucos que estão produzindo — o supervisor rolaria a página para achar o
            que interessa, numa tela feita para ser lida de longe e sem mouse. */}
        {temTrabalho(posto) ? (
          <>
            <div className="mt-3 space-y-1">
              <Linha rotulo="Operador" valor={posto.operador || "—"} />
              <Linha rotulo="Obra" valor={posto.obra || "—"} />
              <Linha rotulo="Marca" valor={posto.marca || "—"} />
            </div>

            <div className="mt-3 flex gap-3 border-t border-white/10 pt-3">
              <Numero rotulo="Planejado" valor={posto.planejado} cor="text-white/70" />
              <Numero rotulo="Produzido" valor={posto.produzido} cor="text-emerald-400" />
              <Numero rotulo="Rejeit." valor={posto.rejeitado} cor="text-red-400" />
              <Numero rotulo="Retrab." valor={posto.retrabalho} cor="text-orange-400" />
            </div>
          </>
        ) : null}

        {posto.alerta ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-400/10 px-2.5 py-2 text-xs font-semibold text-amber-200">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{posto.alerta}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
