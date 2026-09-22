"use client";

import { TriangleAlert } from "lucide-react";
import { visualDo } from "@/lib/mes/estado-visual";
import { decorrido } from "./decorrido";

// O CARD DE UM POSTO, no padrão das telas de TV do portal: fundo claro, cartão branco com borda
// fina, e a cor entrando como FAIXA — não como fundo do cartão inteiro.
//
// ⚠ O estado sai do mesmo mapa do totem (`lib/mes/estado-visual.js`). Duas tabelas de cor foram o
// que fez a tela do operador dizer "PRODUZINDO" com a máquina parada.

const Linha = ({ rotulo, valor }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[11px] uppercase tracking-wide text-torg-gray">{rotulo}</span>
    <span className="truncate text-sm font-bold text-torg-dark">{valor}</span>
  </div>
);

/** ⚠ Zero aparece como "—": uma coluna de zeros só faz ruído numa tela lida de longe. */
const Numero = ({ rotulo, valor, cor }) => (
  <div className="min-w-0 flex-1">
    <div className="text-[10px] uppercase tracking-wide text-torg-gray">{rotulo}</div>
    <div className={`text-2xl font-black tabular-nums ${valor ? cor : "text-gray-300"}`}>
      {valor || "—"}
    </div>
  </div>
);

/** Tem sessão em cima? É o que decide o card curto (só nome e estado) e o card cheio. */
const temTrabalho = (p) => Boolean(p.operador || p.obra || p.marca || p.planejado || p.produzido);

export default function Cartao({ posto, agora }) {
  const visual = visualDo(posto.estado);
  // ⚠ Esta tela é CLARA (padrão das TVs do portal); o totem é escuro. Onde o estado tem variante
  // clara, é ela que vale — senão a faixa some no branco.
  const fundo = visual.fundoClaro || visual.fundo;
  const texto = visual.textoClaro || "text-white";
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className={`flex items-center justify-between gap-3 px-4 py-2 ${fundo}`}>
        <span className={`truncate text-base font-black tracking-tight ${texto}`}>{visual.rotulo}</span>
        <span className={`shrink-0 text-sm font-bold tabular-nums opacity-85 ${texto}`}>
          {decorrido(posto.desde, agora)}
        </span>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-xl font-extrabold text-torg-dark">{posto.nome}</h3>
          <span className="shrink-0 text-[11px] font-semibold text-torg-gray-light">{posto.codigo}</span>
        </div>

        {posto.detalhe ? (
          <p className="mt-1 truncate text-sm font-bold text-torg-orange">{posto.detalhe}</p>
        ) : null}

        {/* ⚠⚠ POSTO SEM TRABALHO NÃO MOSTRA AS LINHAS VAZIAS, e isso é o que faz a TV servir. Com
            31 postos sem sessão, eram 31 cards de sete linhas de "—" empurrando para fora da tela
            justamente os poucos que estão produzindo. */}
        {temTrabalho(posto) ? (
          <>
            <div className="mt-3 space-y-1">
              <Linha rotulo="Operador" valor={posto.operador || "—"} />
              <Linha rotulo="Obra" valor={posto.obra || "—"} />
              <Linha rotulo="Marca" valor={posto.marca || "—"} />
            </div>

            <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3">
              <Numero rotulo="Planejado" valor={posto.planejado} cor="text-torg-dark" />
              <Numero rotulo="Produzido" valor={posto.produzido} cor="text-emerald-600" />
              <Numero rotulo="Rejeit." valor={posto.rejeitado} cor="text-red-600" />
              <Numero rotulo="Retrab." valor={posto.retrabalho} cor="text-torg-orange" />
            </div>
          </>
        ) : null}

        {posto.alerta ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{posto.alerta}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
