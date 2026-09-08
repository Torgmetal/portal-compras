"use client";
import { useMemo, useRef, useState } from "react";
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";

// As peças da tela de conferência. Ficam num arquivo à parte porque a tela é para CELULAR: cada
// bloco é uma tela cheia no telefone, e misturá-los num componente só deixaria de caber no teto de
// 350 linhas antes de o formulário ficar pronto.

// ⚠⚠ SÓ SUGERE DEPOIS DE DIGITAR. Matheus (08/09/2026): "não é interessante aparecer a lista
// completa das marcas só de eu clicar dentro do campo de pesquisa MARCA; o ideal é ir aparecendo a
// marca no autocomplete conforme eu digito, assim não fica um número enorme".
//
// A OP-97 tem 537 marcas: abrir no clique despeja uma lista que ninguém lê e que empurra o resto do
// formulário para fora da tela do celular. Duas letras já cortam a lista para algo que se enxerga.
const MIN_BUSCA = 2;

/**
 * Escolher a marca sem digitar a marca inteira num teclado de celular.
 *
 * ⚠ A LISTA JÁ ESTÁ NA MÃO — as marcas vêm com a sessão, então filtrar é local e instantâneo. Uma
 * busca por rede a cada tecla seria inutilizável no 3G do pátio.
 *
 * ⚠ MOSTRA O SALDO EM CADA SUGESTÃO. É o que evita o erro antes de ele virar um aviso vermelho:
 * quem vê "T97-AC8 — completa" nem tenta lançar.
 */
export function CampoMarca({ marcas, valor, onChange, onEscolher, autoFocus }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef(null);

  const q = String(valor || "").trim().toUpperCase();
  const buscando = q.length >= MIN_BUSCA;

  const sugestoes = useMemo(() => {
    if (!buscando) return [];
    const base = marcas.filter((m) => m.marca.toUpperCase().includes(q)
      || String(m.descricao || "").toUpperCase().includes(q));
    // Pendentes primeiro: é o que se está conferindo. As completas continuam visíveis, mas no fim.
    return [...base].sort((a, b) => Number(a.completa) - Number(b.completa)).slice(0, 30);
  }, [marcas, q, buscando]);

  return (
    <div className="relative" ref={caixa}>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">Marca</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input
          value={valor} autoFocus={autoFocus}
          onChange={(e) => { onChange(e.target.value.toUpperCase()); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder={`Digite ${MIN_BUSCA}+ letras da marca`}
          autoComplete="off" autoCapitalize="characters" spellCheck={false}
          // ⚠ `placeholder:normal-case`: o `uppercase` é para o que a pessoa DIGITA (a marca é
          // maiúscula no cadastro) — sem isto ele grita a dica do campo junto, em caixa alta.
          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-3 text-base font-bold uppercase placeholder:normal-case placeholder:font-normal" />
      </div>

      {aberto && buscando && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {sugestoes.map((m) => (
            <li key={m.marca}>
              <button type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onEscolher(m); setAberto(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                <span className="font-bold text-torg-dark">{m.marca}</span>
                <span className="text-[12px] text-torg-gray truncate flex-1">{m.descricao}</span>
                <span className={`text-[11px] font-bold shrink-0 ${m.completa ? "text-emerald-600" : "text-torg-orange"}`}>
                  {m.completa ? "completa" : `faltam ${m.saldo}`}
                </span>
              </button>
            </li>
          ))}
          {!sugestoes.length && (
            <li className="px-3 py-4 text-[13px] text-torg-gray">Nenhuma marca da L.E. bate com &quot;{q}&quot;.</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** O formulário: MARCA, QUANTIDADE, OBSERVAÇÃO — os três campos pedidos, nessa ordem. */
export function FormLancamento({ marcas, onLancar, salvando, encerrada }) {
  const [marca, setMarca] = useState("");
  const [qte, setQte] = useState("1");
  const [obs, setObs] = useState("");

  const escolhida = useMemo(
    () => marcas.find((m) => m.marca.toUpperCase() === String(marca).trim().toUpperCase()) || null,
    [marcas, marca]);

  const enviar = async (e) => {
    e.preventDefault();
    const ok = await onLancar({ marca, qte: Number(qte), observacao: obs });
    // ⚠ SÓ LIMPA QUANDO GRAVOU. Limpar num erro apagaria o que a pessoa digitou junto com o aviso
    // que explica por que não deu — e ela teria de redigitar sem saber o que estava errado.
    if (ok) { setMarca(""); setQte("1"); setObs(""); }
  };

  if (encerrada) return null;

  return (
    <form onSubmit={enviar} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      {/* ⚠⚠ ESCOLHER A MARCA NÃO PREENCHE A QUANTIDADE. Matheus (08/09/2026): "quando eu selecionar a
          MARCA não deve preencher a quantidade total automática, deve vir com 1 por padrão".
          Preenchendo com o saldo, a tela transforma CONTAR em CONFIRMAR: um toque dá por conferidas
          10 peças que ninguém olhou, e o número que sai é o da lista — exatamente o que a
          conferência existe para checar. O saldo continua à vista no painel abaixo. */}
      <CampoMarca marcas={marcas} valor={marca} onChange={setMarca}
        onEscolher={(m) => { setMarca(m.marca); setQte("1"); }} autoFocus />

      {escolhida && (
        <div className={`text-[13px] rounded-lg px-3 py-2 ${escolhida.completa
          ? "bg-emerald-50 text-emerald-700" : "bg-torg-blue-50/60 text-torg-dark"}`}>
          <b>{escolhida.marca}</b> · L.E. prevê {escolhida.previsto} · já conferidas {escolhida.conferido} ·{" "}
          <b>{escolhida.completa ? "completa" : `faltam ${escolhida.saldo}`}</b>
        </div>
      )}

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">Quantidade</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setQte((q) => String(Math.max(1, Number(q) - 1)))}
            className="w-12 h-12 rounded-lg border border-gray-200 text-xl font-bold text-torg-gray shrink-0">−</button>
          {/* inputMode numeric: abre o teclado de números no celular sem virar <input type=number>,
              que na maioria dos telefones ganha setinhas inúteis e aceita "e" e "-". */}
          <input value={qte} onChange={(e) => setQte(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric" pattern="[0-9]*"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-3 text-center text-xl font-bold" />
          <button type="button" onClick={() => setQte((q) => String(Number(q || 0) + 1))}
            className="w-12 h-12 rounded-lg border border-gray-200 text-xl font-bold text-torg-gray shrink-0">+</button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">
          Observação <span className="font-normal normal-case">(opcional)</span>
        </label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={500}
          placeholder="Ex.: peça amassada, falta furo"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base" />
      </div>

      <button type="submit" disabled={!marca.trim() || !Number(qte) || salvando}
        className="w-full bg-torg-blue text-white font-semibold rounded-lg px-4 py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-40">
        {salvando ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        {salvando ? "Lançando…" : "Lançar conferência"}
      </button>
    </form>
  );
}

/**
 * Corrigir a quantidade de um lançamento sem apagar e refazer.
 *
 * ⚠ Matheus (08/09/2026): "depois de conferir uma marca, ser possível editar a quantidade dela lá
 * em CONFERIDO NESTA SESSÃO antes de encerrar a conferência". Apagar e relançar já dava o mesmo
 * resultado, mas custa quatro toques e perde a observação — e no pátio o que se corrige é um
 * número, não o lançamento inteiro.
 */
function EditorQte({ l, onSalvar, salvando, onCancelar }) {
  const [qte, setQte] = useState(String(l.qte));
  const salvar = () => onSalvar(Number(qte));
  // ⚠ DUAS LINHAS, NÃO UMA. Numa só, os cinco controles (−, número, +, ✓, ✕) mais o nome não cabem
  // em 390px e a marca quebra no meio ("T97-/AC1") — visto na validação em celular. A marca em cima,
  // os controles embaixo em largura cheia, e os alvos de toque continuam de 40px.
  return (
    <li className="py-2.5">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-bold text-torg-dark">{l.marca}</span>
        <span className="text-[11px] text-torg-gray">era {l.qte}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQte((q) => String(Math.max(1, Number(q) - 1)))}
          className="w-10 h-10 rounded-lg border border-gray-200 text-lg font-bold text-torg-gray shrink-0">−</button>
        <input value={qte} autoFocus inputMode="numeric" pattern="[0-9]*"
          onChange={(e) => setQte(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") onCancelar(); }}
          aria-label={`Quantidade de ${l.marca}`}
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-center text-lg font-bold" />
        <button type="button" onClick={() => setQte((q) => String(Number(q || 0) + 1))}
          className="w-10 h-10 rounded-lg border border-gray-200 text-lg font-bold text-torg-gray shrink-0">+</button>
        <button onClick={salvar} disabled={!Number(qte) || salvando} aria-label="Salvar quantidade"
          className="w-10 h-10 rounded-lg bg-torg-blue text-white flex items-center justify-center shrink-0 disabled:opacity-40">
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} />}
        </button>
        <button onClick={onCancelar} aria-label="Cancelar edição"
          className="w-10 h-10 rounded-lg border border-gray-200 text-torg-gray flex items-center justify-center shrink-0">
          <X size={16} />
        </button>
      </div>
    </li>
  );
}

/** Os últimos lançamentos, com corrigir e desfazer — errar no pátio é rotina. */
export function ListaLancamentos({ lancamentos, onApagar, onEditar, apagando, salvando, encerrada }) {
  const [editando, setEditando] = useState(null);
  if (!lancamentos.length) {
    return <p className="text-sm text-torg-gray text-center py-8">Nenhuma peça conferida ainda.</p>;
  }
  return (
    <ul className="divide-y divide-gray-50">
      {lancamentos.map((l) => (
        editando === l.id ? (
          <EditorQte key={l.id} l={l} salvando={salvando} onCancelar={() => setEditando(null)}
            onSalvar={async (qte) => { if (await onEditar(l.id, qte)) setEditando(null); }} />
        ) : (
          <li key={l.id} className="flex items-start gap-3 py-2.5">
            <span className="bg-torg-blue-50 text-torg-blue font-bold rounded-lg px-2.5 py-1 text-sm shrink-0 tabular-nums">
              {l.qte}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-torg-dark">{l.marca}</div>
              {l.observacao && <div className="text-[13px] text-torg-orange">{l.observacao}</div>}
              <div className="text-[11px] text-torg-gray">
                {new Date(l.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {l.criadoPorNome ? ` · ${l.criadoPorNome}` : ""}
              </div>
            </div>
            {!encerrada && (
              <>
                <button onClick={() => setEditando(l.id)} aria-label={`Editar quantidade de ${l.marca}`}
                  className="text-torg-gray hover:text-torg-blue shrink-0 p-2">
                  <Pencil size={16} />
                </button>
                <button onClick={() => onApagar(l.id)} disabled={apagando === l.id}
                  aria-label={`Apagar lançamento de ${l.marca}`}
                  className="text-torg-gray hover:text-red-600 shrink-0 p-2 disabled:opacity-40">
                  {apagando === l.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </>
            )}
          </li>
        )
      ))}
    </ul>
  );
}

/** A L.E. inteira, para saber o que ainda falta sem precisar lembrar de cabeça. */
export function PainelMarcas({ marcas }) {
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(true);

  const visiveis = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return marcas.filter((m) =>
      (!soPendentes || !m.completa) &&
      (!q || m.marca.toUpperCase().includes(q) || String(m.descricao || "").toUpperCase().includes(q)));
  }, [marcas, busca, soPendentes]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-base" />
        </div>
        <button onClick={() => setSoPendentes((v) => !v)}
          className={`shrink-0 text-[12px] font-semibold rounded-lg px-3 py-2.5 border ${soPendentes
            ? "bg-torg-orange/10 border-torg-orange/30 text-torg-orange"
            : "border-gray-200 text-torg-gray"}`}>
          {soPendentes ? "só pendentes" : "todas"}
        </button>
      </div>

      <ul className="divide-y divide-gray-50">
        {visiveis.map((m) => (
          <li key={m.marca} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-torg-dark flex items-center gap-1.5">
                {m.marca}
                {m.completa && <Check size={14} className="text-emerald-600 shrink-0" />}
              </div>
              <div className="text-[12px] text-torg-gray truncate">{m.descricao || "—"}</div>
            </div>
            <div className="text-right shrink-0 tabular-nums">
              <div className={`text-sm font-bold ${m.completa ? "text-emerald-600" : "text-torg-dark"}`}>
                {m.conferido}/{m.previsto}
              </div>
              {!m.completa && <div className="text-[11px] text-torg-orange">faltam {m.saldo}</div>}
            </div>
          </li>
        ))}
        {!visiveis.length && (
          <li className="py-8 text-center text-sm text-torg-gray">
            {soPendentes ? "Nada pendente — a obra está toda conferida." : "Nenhuma marca bate com a busca."}
          </li>
        )}
      </ul>
    </div>
  );
}
