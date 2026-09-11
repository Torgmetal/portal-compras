"use client";

import { AlertCircle, CheckCircle2, Pause, Play, Square } from "lucide-react";
import FaixaEstado from "./FaixaEstado";

// ─── A TELA DE QUEM ESTÁ PRODUZINDO ───────────────────────────────────────────
//
// Saiu do `TotemClient` quando ganhou a faixa de estado e o teto do planejado: o arquivo passou de
// 350 linhas e esta é a parte que se lê sozinha — ela não sabe carregar nem gravar nada, só recebe
// o que a sessão é e avisa o que o operador tocou.

/**
 * O lançamento cabe no que falta?
 *
 * ⚠ Sem planejado (marca bipada à mão, fora do Gantt) não há teto — e é o caso COMUM, não a
 * exceção. Tratar 0 como teto proibiria todo apontamento não programado.
 */
export function passouDoPlanejado(saldo, digitado) {
  if (!saldo || saldo.semTeto) return false;
  return (Number(digitado) || 0) > saldo.saldo;
}

export default function Produzindo({ dados, qtd, setQtd, aoApontar, aoParar, aoProduzir, aoEncerrar, ocupado }) {
  const { sessao, apontado, estado, desde, saldo } = dados;
  const parado = estado === "PARADA";

  // ⚠ A tela confere o teto ANTES de gastar uma ida ao servidor, mas ela NÃO é a trava: o saldo que
  // ela mostra tem alguns segundos, e dois totens lançando juntos leriam o mesmo número. A recusa
  // que vale é a de `apontarQuantidade`, dentro da trava do recurso.
  const estoura = passouDoPlanejado(saldo, qtd.produzidas);

  return (
    <div className="max-w-4xl mx-auto">
      <FaixaEstado estado={estado} desde={desde} detalhe={sessao.marca ? `${sessao.marca} · obra ${sessao.opNumero || "—"}` : null} />

      <div className="bg-white/8 border border-white/10 rounded-2xl p-6 mb-5">
        <p className="text-white/50 text-sm uppercase tracking-widest">Marca</p>
        <p className="text-4xl md:text-5xl font-bold leading-tight">{sessao.marca || "—"}</p>
        <Saldo saldo={saldo} />
        <div className="flex gap-6 mt-4 text-lg">
          <Contador rotulo="Produzidas" valor={apontado?.boas} destaque />
          <Contador rotulo="Retrabalho" valor={apontado?.retrabalho} />
        </div>
      </div>

      <div className="bg-white/8 border border-white/10 rounded-2xl p-6 mb-5">
        <p className="text-white/60 mb-3">Apontar quantidade</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[["produzidas", "Produzidas"], ["retrabalho", "Retrabalho"]].map(([k, r]) => (
            <label key={k} className="block">
              <span className="block text-white/45 text-sm mb-1">{r}</span>
              <input inputMode="numeric" value={qtd[k]} onChange={(e) => setQtd({ ...qtd, [k]: e.target.value })}
                     className={`w-full bg-white/10 rounded-xl px-4 py-4 text-2xl text-center outline-none focus:ring-2 ${
                       k === "produzidas" && estoura ? "ring-2 ring-red-400 bg-red-500/15" : "ring-torg-blue/60"
                     }`} placeholder="0" />
            </label>
          ))}
        </div>
        {estoura && (
          <p className="text-red-300 text-lg mb-3 flex items-center gap-2">
            <AlertCircle size={20} className="shrink-0" />
            {saldo.saldo === 0
              ? `As ${saldo.planejado} peças planejadas já foram lançadas.`
              : `Só faltam ${saldo.saldo} peça(s) para fechar o planejado.`}
          </p>
        )}
        <button onClick={aoApontar} disabled={ocupado || estoura}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl py-5 text-xl font-bold flex items-center justify-center gap-2">
          <CheckCircle2 size={24} /> Lançar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {parado ? (
          <Botao cor="bg-emerald-600 hover:bg-emerald-500" onClick={aoProduzir} ocupado={ocupado}><Play size={22} /> Retomar</Botao>
        ) : (
          <Botao cor="bg-red-600 hover:bg-red-500" onClick={aoParar} ocupado={ocupado}><Pause size={22} /> Parada</Botao>
        )}
        <Botao cor="bg-white/10 hover:bg-white/20" onClick={aoEncerrar} ocupado={ocupado}><Square size={20} /> Encerrar</Botao>
      </div>
    </div>
  );
}


/**
 * O PLANEJADO DA MARCA — planejado, feito e o que falta.
 *
 * ⚠⚠ MOSTRA O TOTAL DA MARCA, NÃO O DESTA SESSÃO. É o número que a trava usa: se a recusa disser
 * "faltam 2" e a tela estiver exibindo só as 0 peças deste turno, a recusa parece arbitrária e o
 * operador fica tentando de novo.
 *
 * ⚠ Sem planejado (marca bipada à mão, fora da programação) não há o que mostrar — e uma linha
 * dizendo "planejado 0" faria parecer que o posto não pode produzir nada.
 */
const Saldo = ({ saldo }) => {
  if (!saldo || saldo.semTeto) return <p className="text-white/50">Sem quantidade planejada para esta marca.</p>;
  const fechou = saldo.saldo === 0;
  return (
    <p className="text-white/60 mt-1 text-lg">
      Planejado <b className="text-white">{saldo.planejado}</b> pç ·
      {" "}lançadas <b className="text-white">{saldo.boas}</b> ·{" "}
      <b className={fechou ? "text-emerald-400" : "text-amber-300"}>
        {fechou ? "planejado cumprido" : `faltam ${saldo.saldo}`}
      </b>
    </p>
  );
};

const Contador = ({ rotulo, valor, destaque }) => (
  <span>
    <span className="block text-white/45 text-xs uppercase tracking-wide">{rotulo}</span>
    <span className={`block font-bold ${destaque ? "text-3xl text-emerald-400" : "text-2xl text-white/80"}`}>{valor ?? 0}</span>
  </span>
);

const Botao = ({ cor, onClick, ocupado, children }) => (
  <button onClick={onClick} disabled={ocupado}
          className={`${cor} disabled:opacity-50 rounded-xl py-5 text-xl font-bold flex items-center justify-center gap-2`}>
    {children}
  </button>
);
