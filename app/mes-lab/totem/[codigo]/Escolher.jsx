"use client";

import { useState } from "react";
import { Search, ChevronDown, CheckCircle2 } from "lucide-react";
import { ordenarLotes, visiveis, QUANTAS } from "./lista-marcas";

// ─── ESCOLHER O TRABALHO: A LISTA DO PCP, OU BIPAR ───────────────────────────
//
// ⚠⚠ A LISTA VEM DO GANTT — é o que o nosso MES faz e o Syneco não pode. O totem dele PERGUNTA qual
// marca o operador vai produzir; o nosso MOSTRA o que o PCP programou para este posto hoje. Bipar
// continua como atalho, e é a única saída quando não há programação — o caso comum, não a exceção.
//
// Saiu de `TotemClient.jsx` quando ele passou de 350 linhas.

export default function Escolher({ dados, codigo, busca, setBusca, aoAbrir, ocupado }) {
  const [termo, setTermo] = useState("");
  async function procurar(e) {
    e.preventDefault();
    const r = await fetch(`/api/mes-lab/totem/${encodeURIComponent(codigo)}?buscar=${encodeURIComponent(termo)}`);
    const j = await r.json();
    setBusca(j.marcas || []);
  }
  const [abertas, setAbertas] = useState({});   // quais obras o operador mandou mostrar por inteiro
  const lotes = ordenarLotes(dados.lotes);
  const temProgramacao = lotes.length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={procurar} className="flex gap-2 mb-6">
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Bipe ou digite a marca"
               className="flex-1 bg-white/10 rounded-xl px-5 py-4 text-xl outline-none focus:ring-2 ring-torg-blue/60" autoComplete="off" />
        <button className="bg-white/10 hover:bg-white/20 rounded-xl px-5"><Search size={22} /></button>
      </form>

      {busca.length > 0 && (
        <Secao titulo="Encontradas">
          {busca.map((m) => <Cartao key={m.id} m={m} onClick={() => aoAbrir(m)} ocupado={ocupado} />)}
        </Secao>
      )}

      {/* ⚠ QUANDO A LISTA É DO SETOR, A TELA DIZ ISSO. No Acabamento e na Pintura o PCP planeja em
          balde e o posto físico é mais fino que o planejamento: a lista é a do setor inteiro. Sem o
          aviso, o operador acha que aquele trabalho todo é dele e dois postos pegam a mesma marca. */}
      {temProgramacao && dados.doSetor && (
        <p className="bg-white/8 border border-white/15 rounded-xl px-4 py-3 mb-4 text-white/70">
          Esta é a programação de <b className="text-white">{dados.recurso.setor.nome}</b> — o PCP
          programa o setor, não cada posto. Confira com o time quem pega o quê.
        </p>
      )}

      {temProgramacao ? lotes.map((lote) => {
        const tudo = Boolean(abertas[lote.opNumero]);
        const mostradas = visiveis(lote.marcas, tudo);
        return (
          <Secao key={lote.opNumero} titulo={`Obra ${lote.opNumero}`}
                 nota={`${lote.concluidas || 0} de ${lote.marcas.length} marca(s) prontas · ${lote.pecas} peça(s) · ${Math.round(lote.kg)} kg`}>
            {mostradas.map((m) => <Cartao key={m.id} m={{ ...m, opNumero: lote.opNumero, opId: lote.opId }}
                                          onClick={() => aoAbrir({ ...m, opNumero: lote.opNumero, opId: lote.opId })} ocupado={ocupado} />)}
            {/* ⚠ A lista da máquina é o BACKLOG inteiro (730 marcas no Laser Cantoneira): despejá-la
                é o mesmo que não mostrar nada. O resto fica a um toque, e a busca acha qualquer uma. */}
            {lote.marcas.length > mostradas.length ? (
              <button onClick={() => setAbertas((a) => ({ ...a, [lote.opNumero]: true }))}
                      className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 text-white/60 text-lg">
                <ChevronDown size={20} /> mais {lote.marcas.length - QUANTAS} marca(s) desta obra
              </button>
            ) : null}
          </Secao>
        );
      }) : (
        // ⚠ SEM PROGRAMAÇÃO É O CASO COMUM, e a tela diz isso sem parecer defeito. O Gantt programa
        // o horizonte próximo; a maioria dos postos, na maioria dos dias, não está nele.
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-xl text-white/70 mb-1">Nada programado para este posto hoje.</p>
          <p className="text-white/40">Bipe a marca que você vai produzir no campo acima.</p>
        </div>
      )}
    </div>
  );
}

const Secao = ({ titulo, nota, children }) => (
  <section className="mb-6">
    <h3 className="text-xs uppercase tracking-widest text-white/50 mb-2">
      {titulo} {nota && <span className="normal-case tracking-normal text-white/35">— {nota}</span>}
    </h3>
    <div className="grid gap-2">{children}</div>
  </section>
);

/**
 * ⚠⚠ A MARCA PRONTA CONTINUA NA LISTA, MARCADA — não some. Sumindo, o operador que terminou procura
 * o que fez e não acha; e quem precisa lançar RETRABALHO depois (que não consome o planejado) ficaria
 * sem caminho nenhum até a marca. Ela fica clicável, só deixa de parecer trabalho pendente.
 *
 * ⚠ O PARCIAL TAMBÉM APARECE ("3 de 7 feitas"). Marca começada por outro turno parecia intocada, e
 * o operador só descobria o que já existia depois de abrir a sessão.
 */
const Cartao = ({ m, onClick, ocupado }) => (
  <button onClick={onClick} disabled={ocupado}
          className={`w-full text-left border rounded-xl px-5 py-4 flex items-center justify-between gap-4 disabled:opacity-50 ${
            m.concluida
              ? "bg-emerald-500/15 border-emerald-400/40 hover:bg-emerald-500/25"
              : "bg-white/8 border-white/10 hover:bg-white/15"
          }`}>
    <span className="min-w-0">
      <span className="flex items-center gap-2">
        <span className="text-2xl font-bold leading-tight">{m.marca}</span>
        {m.concluida && (
          <span className="flex items-center gap-1 text-emerald-300 text-xs font-bold uppercase tracking-wide">
            <CheckCircle2 size={16} /> produzida
          </span>
        )}
      </span>
      <span className="block text-white/50 text-sm truncate">{m.descricao || "—"}</span>
    </span>
    <span className="text-right shrink-0">
      <span className="block text-xl font-semibold">{m.qte} pç</span>
      {m.feitas > 0 && !m.concluida
        ? <span className="block text-amber-300 text-sm">{m.feitas} de {m.qte} feitas</span>
        : <span className="block text-white/40 text-sm">{Math.round(m.kg || 0)} kg</span>}
    </span>
  </button>
);
