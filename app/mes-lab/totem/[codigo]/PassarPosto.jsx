"use client";

import { useState } from "react";
import { LogIn, Users } from "lucide-react";

// ─── A PASSAGEM DO POSTO ─────────────────────────────────────────────────────
//
// ⚠⚠ QUEM TEM MARCA ABERTA NÃO CONSEGUE LIBERAR O PRÓPRIO CRACHÁ, e isso é de propósito — é o que
// o impede de abrir a máquina ao lado com trabalho vivo aqui. Só que o turno vira, e a barra
// continua cortando: sem uma passagem explícita, o único caminho seria chamar um ADMIN todo fim de
// turno, e chamar ADMIN todo dia é como se aprende a contornar a regra.
//
// ⚠⚠ PASSAR NÃO ENCERRA NADA. Troca o vínculo do crachá e mais nada: a marca continua aberta, a
// máquina continua no estado em que está. Se a passagem encerrasse o trabalho, a troca de turno
// viraria uma parada que ninguém viveu — e é isso que envenena o OEE.
//
// ⚠ NÃO É CONSEQUÊNCIA DE BIPAR (pedido do Codex): bipar num posto que já tem outro operador não
// rende ninguém — os dois ficam. A rendição é sempre um toque deliberado, com o nome na tela.

export default function PassarPosto({ presencas = [], operador, ocupado, aoEntregar, aoAssumir }) {
  const [entregando, setEntregando] = useState(false);
  const [cracha, setCracha] = useState("");
  const outros = presencas.filter((p) => p.operador?.cracha !== operador?.cracha);

  return (
    <section className="max-w-4xl mx-auto mb-6">
      {/* ⚠ O CASO COMUM É ESTE: o turno anterior já foi embora e deixou o crachá preso. Quem está
          fisicamente no posto assume, e o nome de quem saiu fica gravado. */}
      {outros.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3">
          <p className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-widest mb-3">
            <Users size={16} /> também neste posto
          </p>
          <div className="grid gap-2">
            {outros.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-white/5 rounded-xl px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-lg font-semibold truncate">{p.operador?.nome?.trim()}</span>
                  <span className="block text-white/40 text-sm">desde {hora(p.abertaEm)}</span>
                </span>
                <button onClick={() => aoAssumir(p)} disabled={ocupado}
                        className="shrink-0 bg-torg-blue/80 hover:bg-torg-blue rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-50">
                  assumir o posto
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {entregando ? (
        // ⚠ O CAMPO SÓ SE LIMPA DEPOIS DO SUCESSO (achado do Codex). Limpando antes de saber o
        // resultado, uma recusa ou uma falha de rede apagava o crachá que o operador acabou de
        // bipar — e ele teria de pedir o crachá de volta para a pessoa que já foi embora.
        <form className="bg-white/5 border border-white/10 rounded-2xl p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!await aoEntregar(cracha.trim())) return;
                setCracha(""); setEntregando(false);
              }}>
          <p className="text-white/70 mb-3">Bipe o crachá de quem assume o posto.</p>
          {/* ⚠ O leitor emula teclado e manda Enter — por isso é `<form>` com submit, não botão. */}
          <input autoFocus value={cracha} onChange={(e) => setCracha(e.target.value)} disabled={ocupado}
                 className="w-full text-center text-3xl tracking-[0.3em] bg-white/10 rounded-xl px-5 py-4 outline-none focus:ring-4 ring-torg-blue/60"
                 placeholder="• • • •" autoComplete="off" />
          <button type="button" onClick={() => { setEntregando(false); setCracha(""); }}
                  className="mt-3 w-full text-white/50 hover:text-white py-2">cancelar</button>
        </form>
      ) : (
        <button onClick={() => setEntregando(true)} disabled={ocupado}
                className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 rounded-2xl px-4 py-4 text-white/70 text-lg disabled:opacity-50">
          <LogIn size={20} /> Passar o posto para outro operador
        </button>
      )}
    </section>
  );
}

const hora = (d) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
