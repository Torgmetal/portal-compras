"use client";
// ─── A CARGA JÁ PROGRAMADA, POR DIA ───────────────────────────────────────────
//
// Vitor (03/09/2026): "não precisa ser apenas de uma OP, mostre tudo que foi para aquele dia" e
// "deixe isso travado logo acima do seletor de OP, não para aparecer quando clicarmos na OP".
//
// ⚠⚠ ISTO NÃO É DADO DA OBRA, É DA FÁBRICA — e por isso vive ACIMA do seletor, sempre à vista.
// A meta é do SETOR: a máquina é uma só. Enquanto o painel morava dentro da obra escolhida, ele
// respondia "quanto ESTA obra colocou no dia", que é a pergunta errada — medido em 03/09: o corte
// de 02/09 tinha 3.358 kg de duas obras (OP-105 e OP-113) e a tela mostrava 1.856.
//
// ⚠ A BARRA VEM ANTES DO NÚMERO porque a pergunta é "cabe no dia?". Faixa escura é a obra aberta
// (quando há uma), clara são as outras, e o traço é a meta.
import { useEffect, useState, Fragment } from "react";
import { Loader2 } from "lucide-react";

// ⚠⚠ SÓ OS DOIS QUE SE PROGRAMAM AQUI. Vitor (03/09/2026): "esses setores pode tirar" (solda,
// acabamento, jato e pintura) — nenhum deles recebe liberação por esta tela, então cada botão era
// um clique que só podia dar lista vazia.
//
// ⚠ E CORTE É PREPARAÇÃO. Vitor, na mesma mensagem: "corte e preparação são a mesma coisa — usar
// preparação como nome e unificar os dois". O banco grava CORTE desde sempre; o nome que a fábrica
// fala é preparação. A rota trata os dois como um só (ver /api/planejamento/liberacao/carga), então
// aqui fica só o nome certo, sem mexer em registro nenhum.
const SETORES = [
  { key: "PREPARACAO", nome: "Preparação" },
  { key: "MONTAGEM", nome: "Montagem" },
];
const fmtN = (n) => new Intl.NumberFormat("pt-BR").format(Math.round(Number(n) || 0));
const fmtKg = (n) => `${fmtN(n)} kg`;
const fmtD = (iso) => { try { const [a, m, d] = iso.split("-"); return `${d}/${m}`; } catch { return iso; } };

export default function CargaDosDias({ opId, recarga }) {
  const [setor, setSetor] = useState("PREPARACAO");
  const [metaKg, setMetaKg] = useState(12000);
  const [carga, setCarga] = useState(null);
  const [limpando, setLimpando] = useState(false);
  const [recarregou, setRecarregou] = useState(0);
  // ⚠⚠ ABRIR O DIA PARA CONSERTÁ-LO. Vitor (03/09/2026), sobre a OP-105 com 35 t num dia de meta
  // 12 t: "precisamos corrigir isso". Ver que o dia estourou não adianta se a tela não diz QUAIS
  // lotes o encheram nem deixa remarcá-los — a saída era cancelar a liberação e refazer, o que
  // perde o registro de quem liberou e quando.
  const [aberto, setAberto] = useState(null);   // dia expandido
  const [movendo, setMovendo] = useState(null); // id do lote em gravação
  const [tirando, setTirando] = useState(null); // id do lote sendo cancelado

  useEffect(() => {
    let vivo = true;
    setCarga(null);
    const q = new URLSearchParams({ setor });
    if (opId) q.set("opId", opId);
    fetch(`/api/planejamento/liberacao/carga?${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setCarga(j?.dias ? j : { dias: [] }))
      .catch(() => vivo && setCarga({ dias: [] }));
    return () => { vivo = false; };
  }, [setor, opId, recarga, recarregou]);

  // ⚠⚠ O AVISO PASSA A TER SAÍDA. O ponteiro morto não dá para reconstruir com honestidade (na
  // OP-113 são 126 ids perdidos e só 73 peças hoje sem programação — nada diz quais eram), então o
  // que se faz é TIRAR o ponteiro: a liberação para de contar peça que não existe e as afetadas
  // seguem em "a fazer", para serem liberadas de novo pelo caminho normal. Nada é apagado e nenhuma
  // programação é inventada.
  async function limparOrfaos() {
    const total = (carga?.dias || []).reduce((a, x) => a + (x.orfas || 0), 0);
    if (!confirm(
      `Isto remove ${total} ponteiro(s) para peças que não existem mais.\n\n` +
      "As peças afetadas continuam em \"a fazer\" e precisam ser liberadas de novo — o que muda é " +
      "que o dia para de contá-las e o aviso sai da tela.\n\nConfirma?"
    )) return;
    setLimpando(true);
    try {
      const r = await fetch("/api/planejamento/liberacao/carga", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "limparOrfaos" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui limpar.");
      setRecarregou((v) => v + 1);
    } catch (e) { alert(e.message); } finally { setLimpando(false); }
  }

  /**
   * Remarca UM lote para outro dia — é como se desafoga um dia estourado.
   *
   * ⚠ Move o lote INTEIRO, não parte dele. Partir a liberação em duas mudaria o registro do que
   * desceu junto para a fábrica; quem precisa dividir libera de novo pela obra, que é o caminho que
   * já existe e deixa rastro.
   */
  async function moverLote(lote, novoDia) {
    if (!novoDia || novoDia === aberto) return;
    setMovendo(lote.id);
    try {
      const r = await fetch("/api/planejamento/liberacao", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lote.id, dataProgramada: novoDia }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui remarcar.");
      setRecarregou((v) => v + 1);
    } catch (e) { alert(e.message); } finally { setMovendo(null); }
  }

  /**
   * Tira o lote do dia de vez — o lançamento que não devia ter acontecido.
   *
   * ⚠ Não é o mesmo que remarcar: remarcar move trabalho real para outro dia; isto CANCELA o lote.
   * Vitor (03/09/2026), sobre os dois lotes de montagem da OP-105: "foi um teste, nem começamos
   * nada dela na montagem".
   *
   * ⚠ E as peças voltam para o corte junto (só as que não têm produção lançada) — senão ficariam
   * paradas em "MONTAGEM" e a rota que redistribui, que só pega peça em CORTE, as pularia.
   */
  async function tirarLote(lote, dia) {
    if (!confirm(
      `Tirar ${lote.obra}${lote.frente ? ` · ${lote.frente}` : ""} do dia ${fmtD(dia)}?\n\n` +
      `São ${fmtN(lote.pecas)} peça(s) · ${fmtKg(lote.kg)}.\n\n` +
      "O lote é CANCELADO (não remarcado) e as peças que ainda não começaram voltam para o corte, " +
      "prontas para serem liberadas de novo. Peça com produção lançada no Syneco não é mexida."
    )) return;
    setTirando(lote.id);
    try {
      const r = await fetch("/api/planejamento/liberacao/carga", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "cancelarLote", id: lote.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui tirar o lote.");
      if (j.comProducao > 0) {
        alert(`${j.comProducao} peça(s) já têm produção lançada e ficaram como estavam. As outras ${j.revertidas} voltaram para o corte.`);
      }
      setRecarregou((v) => v + 1);
    } catch (e) { alert(e.message); } finally { setTirando(null); }
  }

  const todosDias = carga?.dias || [];
  // ⚠⚠ DIA VAZIO NÃO É DIA. Vitor (03/09/2026), vendo 09/09 e 30/09 com "0 kg · 0 pç": "precisamos
  // ajustar essas coisas aqui, teve lançamentos errado".
  //
  // Esses dias não têm carga nenhuma: existem só porque a liberação da OP-113 aponta para 95 peças
  // que a reimportação da lista apagou. A linha some do gráfico, mas o AVISO continua contando —
  // ele é quem explica o que houve, e é ele que tem o botão de limpar.
  //
  // ⚠ E some depois de limpar também: com `pecaIds` vazio a liberação continua gerando o dia no
  // servidor, então sem este filtro o "tirar da contagem" zeraria o aviso e deixaria as duas
  // linhas fantasmas na tela — parecendo que não resolveu.
  //
  // ⚠ `pecas > 0` com `kg === 0` FICA: é peça sem peso cadastrado, que é problema de cadastro, não
  // linha fantasma — e escondê-la sumiria com trabalho que existe de verdade.
  const dias = todosDias.filter((x) => (x.kg || 0) > 0 || (x.pecas || 0) > 0);
  const meta = Number(metaKg) || 0;
  const teto = Math.max(meta, ...dias.map((x) => x.kg || 0)) || 1;
  const larg = (v) => `${Math.min(100, Math.round((v / teto) * 100))}%`;
  const totalKg = dias.reduce((a, x) => a + (x.kg || 0), 0);
  const totalPc = dias.reduce((a, x) => a + (x.pecas || 0), 0);
  const orfas = todosDias.reduce((a, x) => a + (x.orfas || 0), 0);

  return (
    <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-[11px] uppercase tracking-wide text-torg-gray-light font-bold">Carga já programada</span>
        <span className="text-[11.5px] text-torg-gray">a fábrica inteira</span>

        {/* ⚠ o setor é escolha da tela: somar corte com montagem misturaria esteiras com metas
            diferentes, e a barra deixaria de significar alguma coisa. */}
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          {SETORES.map((s) => (
            <button key={s.key} onClick={() => setSetor(s.key)}
              className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-md border ${
                setor === s.key ? "bg-torg-blue text-white border-torg-blue" : "border-gray-200 text-torg-gray hover:border-torg-blue-300 hover:text-torg-blue"}`}>
              {s.nome}
            </button>
          ))}
          <label className="ml-2 text-[11px] text-torg-gray inline-flex items-center gap-1.5">
            meta
            <input type="number" value={metaKg} onChange={(e) => setMetaKg(e.target.value)}
              className="w-[86px] border border-gray-200 rounded-md px-2 py-1 text-[11.5px] text-right tabular-nums outline-none focus:border-torg-blue" />
            kg/dia
          </label>
        </div>
      </div>

      {!carga ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray inline-flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> lendo o que já desceu…
        </p>
      ) : !dias.length && !orfas ? (
        <p className="px-4 py-4 text-[12.5px] text-torg-gray">Nada programado neste setor.</p>
      ) : (
        <>
          {/* ⚠ o aviso das órfãs vive FORA do `if` da tabela: quando todos os dias do setor são
              fantasmas (o caso da OP-113, 95 peças mortas em 09/09 e 30/09), a lista fica vazia e
              era justamente aí que o aviso — e o botão de limpar — sumiam da tela. */}
          {!dias.length ? (
            <p className="px-4 py-4 text-[12.5px] text-torg-gray">Nada programado neste setor.</p>
          ) : (<>
          <table className="w-full text-[12px]">
            <tbody>
              {dias.map((x) => {
                const pct = meta > 0 ? Math.round((x.kg / meta) * 100) : null;
                const passou = meta > 0 && x.kg > meta;
                const abrivel = x.dia && (x.lotes?.length || 0) > 0;
                return (
                  <Fragment key={x.dia || "sem"}>
                  <tr onClick={() => abrivel && setAberto(aberto === x.dia ? null : x.dia)}
                    title={abrivel ? "abrir para remarcar os lotes deste dia" : undefined}
                    className={`border-b border-gray-50 last:border-0 ${abrivel ? "cursor-pointer hover:bg-gray-50/70" : ""} ${aberto === x.dia ? "bg-torg-blue-50/40" : ""}`}>
                    <td className="px-4 py-1.5 whitespace-nowrap font-bold">
                      {x.dia ? fmtD(x.dia) : <span className="text-torg-gray-light font-normal">sem data</span>}
                    </td>
                    <td className="py-1.5 w-full">
                      <div className="relative h-4 rounded bg-gray-100 overflow-hidden min-w-[160px]"
                        title={x.obras.map((o) => `${o.obra}: ${fmtKg(o.kg)}`).join(" · ")}>
                        <span className={`absolute inset-y-0 left-0 ${passou ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: larg(x.minhaKg) }} />
                        <span className={`absolute inset-y-0 ${passou ? "bg-amber-300" : "bg-emerald-300"}`}
                          style={{ left: larg(x.minhaKg), width: larg(Math.max(0, x.kg - x.minhaKg)) }} />
                        {meta > 0 && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-torg-gray-light" style={{ left: larg(meta) }} />}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums whitespace-nowrap">{fmtKg(x.kg)}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums text-torg-gray-light whitespace-nowrap w-12">{pct == null ? "—" : `${pct}%`}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-torg-gray whitespace-nowrap">{fmtN(x.pecas)} pç</td>
                    <td className="px-4 py-1.5 text-torg-gray-light whitespace-nowrap max-w-[240px] truncate">
                      {x.obras.map((o) => o.obra).join(" · ")}
                    </td>
                  </tr>
                  {/* ⚠ os lotes do dia, para remarcar. Só abre no clique: aberto sempre, a tabela
                      viraria uma parede de linhas e a leitura "cabe no dia?" se perderia. */}
                  {aberto === x.dia && (
                    <tr className="bg-torg-blue-50/40 border-b border-gray-100">
                      <td colSpan={6} className="px-4 py-2">
                        <p className="text-[11px] text-torg-gray mb-1.5">
                          O que foi liberado para {fmtD(x.dia)}
                          {passou && <span className="text-amber-700 font-semibold"> — o dia passou da meta; remarque um lote para aliviar.</span>}
                        </p>
                        <div className="space-y-1">
                          {x.lotes.map((lo) => (
                            <div key={lo.id} className="flex items-center gap-2 flex-wrap bg-white border border-gray-100 rounded-md px-2.5 py-1.5">
                              <span className="font-semibold text-torg-dark">{lo.obra}</span>
                              {lo.frente && <span className="text-torg-gray-light">{lo.frente}</span>}
                              <span className="tabular-nums text-torg-gray">{fmtKg(lo.kg)} · {fmtN(lo.pecas)} pç</span>
                              <span className="ml-auto text-[11px] text-torg-gray">mover para</span>
                              <input type="date" defaultValue={x.dia} disabled={movendo === lo.id}
                                onChange={(e) => moverLote(lo, e.target.value)}
                                className="border border-gray-200 rounded-md px-2 py-1 text-[11.5px] outline-none focus:border-torg-blue disabled:opacity-50" />
                              {movendo === lo.id && <Loader2 size={12} className="animate-spin text-torg-blue" />}
                              {/* ⚠ separado do "mover": remarcar é trabalho real que muda de dia;
                                  tirar é lançamento que não devia existir. Confundir os dois faz
                                  alguém cancelar carga de verdade achando que só mudou a data. */}
                              <button onClick={() => tirarLote(lo, x.dia)} disabled={tirando === lo.id}
                                title="cancelar este lote e devolver as peças ao corte"
                                className="text-[11px] font-semibold text-torg-gray hover:text-red-700 border border-gray-200 hover:border-red-200 rounded-md px-2 py-1 disabled:opacity-50 inline-flex items-center gap-1">
                                {tirando === lo.id && <Loader2 size={11} className="animate-spin" />} tirar do dia
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center gap-4 flex-wrap px-4 py-2 border-t border-gray-100 text-[11.5px] text-torg-gray">
            <span><b className="text-torg-dark">{fmtKg(totalKg)}</b> programados · {fmtN(totalPc)} peças</span>
            {meta > 0 && <span>{fmtN(Math.round((totalKg / meta) * 10) / 10)} dias de meta</span>}
            {opId && <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" /> obra aberta</span>}
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" /> {opId ? "outras obras" : "todas as obras"}</span>
          </div>
          </>)}

          {orfas > 0 && (
            <div className="px-4 py-2 border-t border-amber-200 bg-amber-50 text-[11.5px] text-amber-800 flex items-start gap-3 flex-wrap">
              <span className="flex-1 min-w-[280px]">
                <b>{fmtN(orfas)} peça(s) perderam a programação</b> — a lista foi reimportada depois da
                liberação e elas voltaram para "a fazer".
                {" "}({todosDias.filter((x) => x.orfas > 0).map((x) => `${x.dia ? fmtD(x.dia) : "sem data"}: ${fmtN(x.orfas)}`).join(" · ")})
                {" "}Libere-as de novo pela obra; o importador já não perde mais a programação nas próximas listas.
              </span>
              <button onClick={limparOrfaos} disabled={limpando}
                className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50 inline-flex items-center gap-1.5">
                {limpando && <Loader2 size={11} className="animate-spin" />} tirar da contagem
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
