"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, ListOrdered, RefreshCw, Search, Lock, CheckCircle2, ExternalLink, PauseCircle, Users } from "lucide-react";
import { ETAPA_LABEL } from "@/lib/etapa-projeto";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");

/**
 * SEQUÊNCIA — o que o setor faz, em ordem.
 *
 * Vitor (19/08/2026): "no portal da engenharia seria possível criarmos uma aba chamada Sequência?
 * Lá teremos todas as tarefas de acordo com os cronogramas".
 *
 * Ordena por PRAZO, não por OP: a pergunta de quem trabalha é "o que eu faço primeiro", e isso
 * atravessa as obras. Atrasada primeiro, depois o que está liberado, por último o que espera
 * outro setor — tarefa bloqueada no topo só ocuparia a vista de quem não pode fazê-la agora.
 *
 * Só aparece cronograma cujas tarefas o Planejamento ENVIOU. Enquanto não envia, é rascunho.
 */
export default function SequenciaClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [impacto, setImpacto] = useState([]);
  const [abertoImp, setAbertoImp] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const [pessoas, setPessoas] = useState([]);
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [salvandoDono, setSalvandoDono] = useState(null);
  const [salvandoDias, setSalvandoDias] = useState(null);
  const [busca, setBusca] = useState("");
  const [concluidas, setConcluidas] = useState(false);

  const carregar = () => {
    setLoading(true); setErro("");
    fetch(`/api/engenharia/sequencia?setor=ENGENHARIA${concluidas ? "&concluidas=1" : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then(setData).catch((e) => setErro(e.message)).finally(() => setLoading(false));
    // ⚠ o impacto vem em separado: é conta pesada (percorre o grafo de antecessoras de todos os
    // cronogramas afetados) e não pode segurar a lista, que é o que a pessoa veio ver.
    fetch("/api/engenharia/sequencia/pessoas?modulo=ENGENHARIA")
      .then((r) => r.json()).then((j) => setPessoas(j.pessoas || [])).catch(() => setPessoas([]));
    fetch("/api/engenharia/sequencia/impacto?setor=ENGENHARIA")
      .then((r) => r.json()).then((j) => setImpacto(j.impacto || [])).catch(() => setImpacto([]));
  };
  useEffect(carregar, [concluidas]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠ grava a data da EVIDÊNCIA (quando a lista entrou), não a de hoje — é o que faz o indicador de
  // aderência medir a entrega em vez do dia em que alguém lembrou de clicar.
  async function darBaixa(t, quando) {
    setBaixando(t.id);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataFimReal: new Date(quando).toISOString(), percentualRealizado: 100 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao dar baixa");
      carregar();
    } catch (e) { alert(e.message); } finally { setBaixando(null); }
  }

  // ⚠ o dono grava direto — sem modal e sem botão de salvar. Atribuir 52 tarefas com dois cliques
  // cada ninguém faz; com um select que salva sozinho, faz.
  async function definirDono(t, responsavelId) {
    setSalvandoDono(t.id);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsavelId: responsavelId || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao definir o responsável");
      carregar();
    } catch (e) { alert(e.message); } finally { setSalvandoDono(null); }
  }

  // ⚠ grava ao SAIR do campo (onBlur), não a cada tecla: digitar "12" dispararia duas gravações,
  // e a primeira ("1") ficaria registrada como estimativa por um instante.
  async function definirDias(t, valor) {
    const n = valor === "" ? null : Math.max(0, Math.min(999, parseInt(valor, 10) || 0));
    if (n === (t.diasParaConcluir ?? null)) return;
    setSalvandoDias(t.id);
    try {
      const r = await fetch(`/api/planejamento/cronogramas/tarefas/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diasParaConcluir: n }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar a estimativa");
      carregar();
    } catch (e) { alert(e.message); } finally { setSalvandoDias(null); }
  }

  const tarefas = useMemo(() => {
    let lista = data?.tarefas || [];
    // "sem dono" é um filtro de verdade: é a fila que precisa ser distribuída
    if (filtroPessoa === "__SEM__") lista = lista.filter((x) => !x.responsavelId);
    else if (filtroPessoa) lista = lista.filter((x) => x.responsavelId === filtroPessoa);
    const t = busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((x) =>
      [x.nome, x.opNumero, x.cliente, x.obra, x.area, x.responsavel].some((v) => String(v || "").toLowerCase().includes(t))
    );
  }, [data, busca, filtroPessoa]);

  // ⚠⚠ O BACKLOG POR PESSOA. Vitor (29/08/2026): "para podermos ajustar as datas disponíveis para
  // novas coisas e ir vendo o backlog da engenharia". Duas perguntas por pessoa: quanto ela tem em
  // aberto, e ATÉ QUANDO já está comprometida — é a segunda que diz quando cabe coisa nova.
  const carga = useMemo(() => {
    const todas = data?.tarefas || [];
    const linhas = pessoas.map((p) => {
      const minhas = todas.filter((t) => t.responsavelId === p.id && !t.concluida);
      const prazos = minhas.map((t) => t.fim).filter(Boolean).sort();
      return {
        id: p.id, nome: p.name, n: minhas.length,
        atrasadas: minhas.filter((t) => t.atrasada).length,
        espera: minhas.filter((t) => t.emEspera).length,
        ate: prazos.length ? prazos[prazos.length - 1] : null,
      };
    });
    const semDono = todas.filter((t) => !t.responsavelId && !t.concluida).length;
    return { linhas: linhas.filter((l) => l.n > 0 || filtroPessoa === l.id), semDono };
  }, [data, pessoas, filtroPessoa]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
            <ListOrdered size={26} className="text-torg-blue" /> Sequência
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            As tarefas da Engenharia nos cronogramas, na ordem em que precisam sair. Só aparece
            cronograma cujas tarefas o Planejamento <b>enviou</b> — enquanto não envia, é rascunho.
          </p>
        </div>
        <button onClick={carregar} disabled={loading}
          className="text-[12px] font-semibold text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      {data?.resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {/* ⚠ "Em espera" ganhou card próprio: é um terço da lista, e enquanto vivia dentro de
              "Atrasadas" o setor aparecia devendo o que depende de decisão do cliente. */}
          <Kpi rotulo="Atrasadas" valor={fmtN(data.resumo.atrasadas)} cor="text-red-600" />
          <Kpi rotulo="Em espera do cliente" valor={fmtN(data.resumo.emEspera)} cor="text-amber-700" />
          <Kpi rotulo="Esperando outro setor" valor={fmtN(data.resumo.bloqueadas)} cor="text-torg-gray" />
          <Kpi rotulo="No total" valor={fmtN(data.resumo.total)} cor="text-torg-dark" />
        </div>
      )}

      {/* ⚠⚠ MOSTRA, NÃO APLICA. Vitor (29/08/2026): "vamos no ponto 2; se caso avaliarmos ser
          necessário passarmos para o cronograma, aí atualizamos depois". Empurrar as datas
          atravessa três setores — na TMSA uma revisão parada aqui move Preparação, Montagem,
          Solda, Pintura e Expedição —, e essa decisão é do Planejamento. */}
      {impacto.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60">
            <p className="text-[13px] font-semibold text-torg-dark">O que estas esperas empurrariam</p>
            <p className="text-[11.5px] text-torg-gray mt-0.5">
              Cálculo do atraso que a espera do cliente causaria nas tarefas seguintes. <b>Nenhuma data foi alterada</b> — é só a conta.
            </p>
          </div>
          {impacto.map((imp) => (
            <div key={imp.cronogramaId} className="px-4 py-3 border-b border-gray-100 last:border-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-torg-dark">OP-{imp.opNumero}</span>
                <span className="text-[12px] text-torg-gray">{imp.cliente || ""}{imp.obra ? ` · ${imp.obra}` : ""}</span>
                <span className="ml-auto text-[12px]">
                  {imp.diasNaEntrega > 0 ? (
                    <>entrega <span className="text-torg-gray">{fmtData(imp.fimAtual)}</span> → <b className="text-amber-700">{fmtData(imp.fimNovo)}</b>{" "}
                      <span className="text-amber-700 font-semibold">(+{imp.diasNaEntrega} dias)</span></>
                  ) : (
                    // ⚠ sem mudança na entrega não é "sem impacto": as tarefas se mexem por dentro,
                    // a obra é que tem folga para absorver. Dizer "0 dias" sem explicar confunde.
                    <span className="text-green-700">a entrega não muda — há folga no cronograma</span>
                  )}
                </span>
              </div>
              <p className="text-[11.5px] text-torg-gray mt-1">
                {imp.tarefasMovidas} tarefa(s) se moveriam · {imp.porSetor.map((p) => `${p.setor.toLowerCase()} +${p.dias}d`).join(" · ")}
                {imp.estimado && <span className="text-amber-700"> · duração estimada pelo prazo vencido (a espera não tinha data de início)</span>}
              </p>
              <button onClick={() => setAbertoImp(abertoImp === imp.cronogramaId ? null : imp.cronogramaId)}
                className="text-[11.5px] text-torg-blue hover:underline mt-1">
                {abertoImp === imp.cronogramaId ? "esconder o detalhe" : "ver tarefa a tarefa"}
              </button>
              {abertoImp === imp.cronogramaId && (
                <div className="mt-2 space-y-1">
                  {imp.esperas.map((e, i) => (
                    <p key={i} className="text-[11.5px] text-amber-800">
                      ⏸ <b>{e.nome}</b> — {e.motivo} · parada há {e.dias} dia(s)
                    </p>
                  ))}
                  <table className="w-full text-[11.5px] mt-1">
                    <tbody>
                      {imp.detalhe.map((d, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="py-1 pr-2 text-torg-gray-light uppercase text-[10px]">{d.setor}</td>
                          <td className="py-1 pr-2 text-torg-dark">{d.nome}</td>
                          <td className="py-1 pr-2 text-torg-gray tabular-nums whitespace-nowrap">{fmtData(d.de)} → {fmtData(d.para)}</td>
                          <td className="py-1 text-amber-700 tabular-nums whitespace-nowrap">+{d.dias}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ⚠ O BACKLOG: quanto cada um tem e até quando está comprometido. A coluna "até" é a que
          responde "quando cabe coisa nova" — que foi o pedido. */}
      {(carga.linhas.length > 0 || carga.semDono > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
            <Users size={14} className="text-torg-gray" />
            <p className="text-[12.5px] font-semibold text-torg-dark">Carga da equipe</p>
            <p className="text-[11px] text-torg-gray">clique para ver só as tarefas da pessoa</p>
          </div>
          <div className="flex flex-wrap divide-x divide-gray-100">
            {carga.linhas.map((l) => (
              <button key={l.id} onClick={() => setFiltroPessoa(filtroPessoa === l.id ? "" : l.id)}
                className={`px-4 py-2.5 text-left flex-1 min-w-[10rem] hover:bg-torg-blue-50/50 ${filtroPessoa === l.id ? "bg-torg-blue-50" : ""}`}>
                <p className="text-[12.5px] font-semibold text-torg-dark">{l.nome}</p>
                <p className="text-[11.5px] text-torg-gray tabular-nums">
                  <b className="text-torg-dark">{l.n}</b> em aberto
                  {l.atrasadas ? <span className="text-red-600"> · {l.atrasadas} atrasada(s)</span> : null}
                  {l.espera ? <span className="text-amber-700"> · {l.espera} em espera</span> : null}
                </p>
                <p className="text-[11px] text-torg-gray-light">
                  {l.ate ? `comprometido até ${fmtData(l.ate)}` : "sem prazo em aberto"}
                </p>
              </button>
            ))}
            {carga.semDono > 0 && (
              <button onClick={() => setFiltroPessoa(filtroPessoa === "__SEM__" ? "" : "__SEM__")}
                className={`px-4 py-2.5 text-left flex-1 min-w-[10rem] hover:bg-amber-50 ${filtroPessoa === "__SEM__" ? "bg-amber-50" : ""}`}>
                <p className="text-[12.5px] font-semibold text-amber-800">Sem dono</p>
                <p className="text-[11.5px] text-torg-gray tabular-nums"><b className="text-amber-800">{carga.semDono}</b> em aberto</p>
                <p className="text-[11px] text-torg-gray-light">a distribuir</p>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por tarefa, OP, cliente ou área…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-torg-gray cursor-pointer">
          <input type="checkbox" checked={concluidas} onChange={(e) => setConcluidas(e.target.checked)} /> mostrar concluídas
        </label>
      </div>

      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
          <p className="text-sm text-torg-gray">Montando a sequência...</p>
        </div>
      )}

      {erro && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6 flex items-start gap-2 text-red-600 text-sm">
          <AlertCircle size={16} className="mt-0.5" />
          <div><p className="font-medium">Erro ao carregar</p><p className="text-xs mt-1">{erro}</p></div>
        </div>
      )}

      {!loading && !erro && tarefas.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-torg-dark font-medium">
            {busca ? "Nenhuma tarefa bate com o filtro." : "Nenhuma tarefa enviada ainda."}
          </p>
          {!busca && (
            <p className="text-[12px] text-torg-gray mt-1.5">
              As tarefas aparecem aqui quando o Planejamento clicar em <b>Enviar tarefas</b> no
              cronograma da obra — em <Link href="/planejamento/cronogramas" className="text-torg-blue underline">Planejamento › Cronogramas</Link>.
            </p>
          )}
        </div>
      )}

      {!loading && !erro && tarefas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[860px]">
              <thead className="bg-gray-50 text-torg-gray">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-10">#</th>
                  <th className="px-3 py-2 text-left font-medium w-24">Etapa</th>
                  <th className="px-3 py-2 text-left font-medium">Tarefa</th>
                  <th className="px-3 py-2 text-left font-medium">OP / obra</th>
                  <th className="px-3 py-2 text-left font-medium">Área</th>
                  <th className="px-3 py-2 text-left font-medium w-36">Responsável</th>
                  <th className="px-3 py-2 text-left font-medium">Início</th>
                  <th className="px-3 py-2 text-left font-medium">Prazo</th>
                  <th className="px-3 py-2 text-center font-medium w-16" title="Dias úteis que ainda faltam, na conta de quem faz">Faltam</th>
                  <th className="px-3 py-2 text-left font-medium w-32">Previsão</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 text-left font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tarefas.map((t, i) => (
                  <tr key={t.id} className={`hover:bg-gray-50 ${t.emEspera ? "bg-amber-50/40" : t.atrasada ? "bg-red-50/40" : t.bloqueada ? "bg-gray-50/60" : ""}`}>
                    <td className="px-3 py-2 text-torg-gray tabular-nums">{i + 1}</td>
                    {/* a etapa da esteira: Modelo → Aprovação → Detalhamento → Diagrama → Listas →
                        Liberação. Deduzida do nome enquanto não existe o campo (ver lib/etapa-projeto). */}
                    <td className="px-3 py-2">
                      {t.etapa ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-torg-blue-50 text-torg-blue rounded px-1.5 py-0.5">
                          {ETAPA_LABEL[t.etapa]}
                        </span>
                      ) : <span className="text-torg-gray-light text-[11px]">—</span>}
                    </td>
                    <td className="px-3 py-2 font-medium text-torg-dark">
                      {t.nome}
                      {/* ⚠ O PORTAL JÁ SABE. A etapa de listas se comprova na importação — e a
                          baixa usa a DATA DA EVIDÊNCIA, não a de hoje: as listas da 115 entraram
                          em 25/08 com prazo 21/08, e dar baixa hoje registraria 8 dias de atraso
                          onde houve 4. */}
                      {t.evidencia && (
                        <span className={`block text-[11px] font-normal mt-0.5 ${t.evidencia.completa ? "text-green-700" : "text-amber-700"}`}>
                          {t.evidencia.completa ? "✓" : "⚠"} {t.evidencia.resumo}
                          {t.evidencia.completa && (
                            <>
                              {" "}em {fmtData(t.evidencia.atendidaEm)}
                              <button onClick={() => darBaixa(t, t.evidencia.atendidaEm)} disabled={baixando === t.id}
                                className="ml-1.5 text-torg-blue hover:underline font-medium disabled:opacity-50">
                                {baixando === t.id ? "dando baixa…" : "dar baixa nesta data"}
                              </button>
                            </>
                          )}
                        </span>
                      )}
                      {t.proximaEtapa && (
                        <span className="block text-[11px] text-torg-gray-light font-normal">
                          próxima: {ETAPA_LABEL[t.proximaEtapa]}
                        </span>
                      )}
                      {t.observacao && <span className="block text-[11px] text-torg-gray font-normal">{t.observacao}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {t.opId ? (
                        <Link href={`/comercial/${t.opId}`} className="text-torg-blue hover:underline inline-flex items-center gap-1">
                          OP-{t.opNumero} <ExternalLink size={11} />
                        </Link>
                      ) : <span className="text-torg-dark">OP-{t.opNumero || "—"}</span>}
                      <span className="block text-[11px] text-torg-gray">{t.cliente || ""}{t.obra ? ` · ${t.obra}` : ""}</span>
                    </td>
                    <td className="px-3 py-2 text-torg-gray">{t.area || "—"}</td>
                    <td className="px-3 py-2">
                      {/* salva no onChange — ver definirDono */}
                      <select value={t.responsavelId || ""} disabled={salvandoDono === t.id}
                        onChange={(e) => definirDono(t, e.target.value)}
                        className={`w-full text-[11.5px] border rounded px-1.5 py-1 outline-none focus:border-torg-blue disabled:opacity-50 ${t.responsavelId ? "border-gray-200 text-torg-dark" : "border-amber-200 bg-amber-50/60 text-amber-800"}`}>
                        <option value="">sem dono</option>
                        {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-torg-gray tabular-nums whitespace-nowrap">{fmtData(t.inicio)}</td>
                    <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${t.atrasada ? "text-red-600 font-semibold" : "text-torg-dark"}`}>
                      {fmtData(t.fim)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {t.concluida ? <span className="text-torg-gray-light">—</span> : (
                        <input type="number" min="0" max="999" defaultValue={t.diasParaConcluir ?? ""}
                          onBlur={(e) => definirDias(t, e.target.value)} disabled={salvandoDias === t.id}
                          placeholder="—" title="Dias úteis que ainda faltam"
                          className="w-12 text-[12px] text-center border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-torg-blue disabled:opacity-50" />
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {/* ⚠ o que a estimativa REVELA: em dia vira "vai atrasar N dias"; atrasada
                          vira a data em que de fato termina. */}
                      {t.previsaoFim ? (
                        <>
                          <span className={t.atrasoPrevisto > 0 ? "text-red-600 font-semibold" : "text-green-700 font-medium"}>
                            {fmtData(t.previsaoFim)}
                          </span>
                          <span className="block text-[11px]">
                            {t.atrasoPrevisto > 0
                              ? <span className="text-red-600">{t.atrasada ? "termina" : "vai atrasar"} {t.atrasoPrevisto}d {t.atrasada ? "depois do prazo" : "além do prazo"}</span>
                              : <span className="text-green-700">dentro do prazo</span>}
                          </span>
                          {t.estimativaVelha && <span className="block text-[10.5px] text-amber-700">estimativa de mais de 7 dias — revisar</span>}
                        </>
                      ) : <span className="text-torg-gray-light text-[11px]">informe os dias</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.percentual}%</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {t.concluida ? (
                        <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> concluída</span>
                      ) : t.emEspera ? (
                        // ⚠ ESPERA NÃO É ATRASO (Vitor, 29/08/2026): indefinição do projeto não é
                        // dívida da Engenharia. Os dias contam para quem deve a resposta.
                        <span className="text-amber-700 font-medium inline-flex items-center gap-1" title={t.motivoBloqueio || ""}>
                          <PauseCircle size={12} /> em espera{t.diasEmEspera ? ` · ${t.diasEmEspera}d` : ""}
                        </span>
                      ) : t.atrasada ? (
                        <span className="text-red-600 font-semibold">atrasada {Math.abs(t.diasParaPrazo)}d</span>
                      ) : t.bloqueada ? (
                        <span className="text-torg-gray inline-flex items-center gap-1"
                          title={`Esperando: ${t.esperando.map((e) => `${e.nome} (${e.setor})`).join(" · ")}`}>
                          <Lock size={12} /> esperando {t.esperando[0]?.setor?.toLowerCase() || "outro setor"}
                        </span>
                      ) : (
                        <span className="text-green-700 font-medium">
                          liberada{t.diasParaPrazo != null ? ` · ${t.diasParaPrazo}d` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, cor }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">{rotulo}</p>
      <p className={`text-xl font-extrabold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}
