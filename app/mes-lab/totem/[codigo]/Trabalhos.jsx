"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";

// ─── AS MARCAS ABERTAS NESTE POSTO ───────────────────────────────────────────
//
// ⚠⚠ Desde 13/09/2026 o posto pode ter VÁRIAS (o nesting abre a barra inteira). Esta é a tela que o
// operador vê entre abrir a barra e lançar quantidade: ele toca na marca que acabou de cortar.
//
// ⚠ Feita para dois metros de distância e luva: cartão grande, número grande, e o que falta em
// destaque — é o número que ele confere antes de lançar.

const Numero = ({ rotulo, valor, cor = "text-white" }) => (
  <div>
    <p className="text-[11px] uppercase tracking-widest text-white/40">{rotulo}</p>
    <p className={`text-3xl font-black tabular-nums ${cor}`}>{valor}</p>
  </div>
);

export default function Trabalhos({ trabalhos, aoEscolher, aoEncerrarLote, ocupado }) {
  // ⚠ O lote só pode ser encerrado inteiro quando todas as marcas vieram do MESMO comando; com
  // marcas soltas por cima, encerrar tudo fecharia o que ninguém mandou fechar.
  const lote = trabalhos[0]?.sessao?.lotes?.[0] || null;
  const mesmoLote = lote && trabalhos.every((t) => t.sessao.lotes?.includes(lote));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-white/50 text-sm uppercase tracking-widest">
          {trabalhos.length} marcas abertas neste posto
        </h2>
        {mesmoLote ? (
          <button
            onClick={() => aoEncerrarLote(lote)}
            disabled={ocupado}
            className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 text-sm font-bold"
          >
            Encerrar a barra inteira
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {trabalhos.map(({ sessao, apontado, saldo }) => {
          const pronta = saldo && !saldo.semTeto && saldo.saldo === 0;
          return (
            <button
              key={sessao.id}
              onClick={() => aoEscolher(sessao.id)}
              disabled={ocupado}
              className={`text-left rounded-2xl p-5 ring-1 transition ${
                pronta
                  ? "bg-emerald-500/15 ring-emerald-400/40"
                  : "bg-white/5 ring-white/10 hover:bg-white/10 active:bg-white/15"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-3xl font-black truncate">{sessao.marca}</span>
                {pronta
                  ? <CheckCircle2 size={26} className="text-emerald-300 shrink-0" />
                  : <ArrowRight size={26} className="text-white/40 shrink-0" />}
              </div>
              <p className="text-white/40 text-sm">obra {sessao.opNumero || "—"}</p>

              <div className="flex gap-6 mt-3">
                <Numero rotulo="Planejado" valor={sessao.planejadoQtd || "—"} cor="text-white/70" />
                <Numero rotulo="Feitas" valor={apontado.boas} cor="text-emerald-300" />
                <Numero rotulo="Falta" valor={saldo?.semTeto ? "—" : saldo?.saldo ?? "—"}
                        cor={pronta ? "text-emerald-300" : "text-torg-orange"} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
