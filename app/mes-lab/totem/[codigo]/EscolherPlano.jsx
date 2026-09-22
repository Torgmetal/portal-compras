"use client";

import { Layers, Check, ArrowRightLeft } from "lucide-react";

// ─── O PLANO DE CORTE, NA MÃO DO OPERADOR ────────────────────────────────────
//
// Matheus (13/09/2026): *"o operador apenas seleciona o NESTING que ele vai cortar e já puxa todas
// as MARCAS para abrir na tela do operador (…) sem que ele precise abrir uma por uma"*.
//
// ⚠⚠ É O MESMO PAPEL QUE ELE JÁ TEM NA MÃO. A lista do operador é o PDF que vem na pasta da máquina
// — plano, barra, marcas — e a tela mostra na mesma ordem e com os mesmos nomes. Reorganizar faria
// ele conferir a tela contra o papel em vez de confiar nela.
//
// ⚠ A BARRA JÁ ABERTA APARECE MARCADA e não abre de novo: duas barras iguais abertas em dois turnos
// dividiriam o apontamento da mesma peça em dois lugares.
//
// ⚠⚠ E DESDE 22/09/2026 A TELA DIZ *ONDE* ELA ESTÁ. A posse da barra passou a ser exclusiva
// (`lib/mes/unidade-reserva.js`): sem o nome do posto, o operador via um botão morto e não sabia se
// a barra estava nesta máquina ou na do vizinho — nem que existe caminho. Quando está em OUTRO
// posto, o botão vira **Trazer para cá**, que encerra lá e abre aqui sem mover o que já foi
// produzido.

export default function EscolherPlano({ planos = [], aoAbrir, aoTrazer, ocupado }) {
  if (!planos.length) return null;

  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 text-white/50 text-sm uppercase tracking-widest mb-3">
        <Layers size={16} /> Planos de corte
      </h2>

      <div className="space-y-4">
        {planos.map((p) => (
          <div key={p.id} className="bg-white/5 rounded-2xl p-4 ring-1 ring-white/10">
            <p className="text-xl font-bold">{p.nome}</p>
            <p className="text-white/40 text-sm mb-3">
              obra {p.opNumero || "—"}{p.descricao ? ` · ${p.descricao}` : ""}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {p.unidades.map((u) => {
                // ⚠ "Em outro posto" é DIFERENTE de "aberta aqui": uma é impedimento com saída, a
                // outra é o trabalho que já está na sua mão.
                const fora = u.dono && !u.dono.aqui;
                const aqui = Boolean(u.loteAberto) && !fora;
                return (
                <button
                  key={u.id}
                  disabled={ocupado || aqui}
                  onClick={() => (fora ? aoTrazer(u) : aoAbrir(u))}
                  className={`text-left rounded-xl px-4 py-3 transition ${
                    aqui
                      ? "bg-emerald-500/15 ring-1 ring-emerald-400/40 cursor-default"
                      : fora
                        ? "bg-amber-500/15 ring-1 ring-amber-400/40 hover:bg-amber-500/25"
                        : "bg-white/10 hover:bg-white/20 active:bg-white/25"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xl font-black">
                      {u.tipo === "CHAPA" ? "Chapa" : "Barra"} {u.indice}
                    </span>
                    {aqui ? <Check size={22} className="text-emerald-300 shrink-0" /> : null}
                    {fora ? <ArrowRightLeft size={22} className="text-amber-300 shrink-0" /> : null}
                  </div>
                  <p className="text-white/60 text-sm mt-0.5">
                    {u.pecas} peças · {u.marcas.length} marcas
                  </p>
                  {/* ⚠ As marcas aparecem aqui porque é o que o operador confere contra o papel
                      ANTES de abrir — depois de aberto, conferir já é tarde. */}
                  <p className="text-white/35 text-xs mt-1 leading-snug line-clamp-2">
                    {u.marcas.map((m) => `${m.qtd}× ${m.marca}`).join("  ·  ")}
                  </p>
                  {aqui ? (
                    <p className="text-emerald-300 text-sm font-bold mt-1.5">já aberta neste posto</p>
                  ) : null}
                  {fora ? (
                    <p className="text-amber-300 text-sm font-bold mt-1.5">
                      está em {u.dono.codigo || "outro posto"} · toque para trazer
                    </p>
                  ) : null}
                </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
