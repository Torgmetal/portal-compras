"use client";

// ⚠⚠ PARADA SEM MOTIVO É RECUSADA no servidor, então a tela PERGUNTA antes — um botão que sempre dá
// erro é pior que um botão a menos. Parada sem motivo não vira Pareto nem OEE honesto: vira uma
// barra vermelha que ninguém sabe explicar, que é o que o Syneco entrega hoje.
//
// Saiu de `TotemClient.jsx` quando ele passou de 350 linhas.

/**
 * ⚠⚠ PARADA SEM MOTIVO NÃO EXISTE, E O BOTÃO NÃO PODE FINGIR QUE SIM. A primeira versão desta tela
 * mandava `motivoId: null` — e `mudarEstado` recusa parada sem motivo, então o botão vermelho
 * falharia SEMPRE, com uma mensagem que o operador não teria como resolver. Perguntar é o que
 * transforma a barra vermelha do monitor em Pareto: sem o motivo, sabe-se que parou e nunca por quê.
 *
 * ⚠ Os planejados vêm marcados porque não são o mesmo tipo de parada: refeição e setup TIRAM do
 * tempo planejado, em vez de contar contra a Disponibilidade. Quem escolhe precisa ver a diferença.
 */
export default function EscolherMotivo({ motivos, aoEscolher, aoFechar, ocupado }) {
  return (
    <div className="fixed inset-0 bg-black/70 grid place-items-center p-5 z-50" onClick={aoFechar}>
      <div className="bg-torg-dark border border-white/15 rounded-2xl p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-2xl font-bold mb-1">Por que a máquina parou?</h3>
        <p className="text-white/45 mb-5">A parada só é registrada com o motivo.</p>
        <div className="grid md:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto">
          {motivos.map((m) => (
            <button key={m.id} disabled={ocupado} onClick={() => aoEscolher(m)}
                    className="text-left bg-white/8 hover:bg-white/16 border border-white/10 rounded-xl px-4 py-4 text-lg disabled:opacity-50">
              {m.descricao}
              {m.planejada && <span className="block text-white/40 text-xs mt-0.5">parada planejada</span>}
            </button>
          ))}
          {!motivos.length && <p className="text-white/50 col-span-full">Nenhum motivo cadastrado.</p>}
        </div>
        <button onClick={aoFechar} className="mt-5 w-full bg-white/10 hover:bg-white/20 rounded-xl py-4 text-lg">
          Voltar
        </button>
      </div>
    </div>
  );
}
