"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, FileText, Check, Send, AlertCircle, ChevronRight, ExternalLink, Plus, X, ShieldCheck, Trash2, Link2, Search, MoreHorizontal } from "lucide-react";
import { TIPO_LABEL, TIPOS_RELATORIO, usaCotas, pendenciasParaAssinatura, faltamAssinar, rotuloAssinante } from "@/lib/qualidade-campo";
import { textoDoVinculo } from "@/lib/relatorio-vinculo-texto";
import { rotuloFase } from "@/lib/fase-peca";
import FiltroFase from "@/components/qualidade/FiltroFase";

/**
 * INSPEÇÕES — as fotos do celular viram relatório aqui, no computador.
 *
 * Vitor (21/08/2026): "isso sobe para o portal, e depois por computador começa o fluxo das
 * assinaturas... não quero que só apareça no pdf, precisa aparecer na estruturação".
 *
 * A tela é dividida em duas: FOTOS SOLTAS (o que a fábrica mandou e ainda não virou documento) e
 * RELATÓRIOS (o que já foi montado, numerado e mandado assinar).
 */

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

// Quem assina. Vitor: "nós vamos assinar, o inspetor e o cliente".
const PAPEIS = ["Torg Metal", "Inspetor", "Cliente"];

// ⚠ `podeFechar` vem do servidor (ver page.js): o INSPETOR entra para preencher, mas enviar para
// assinatura e apagar continuam de quem responde pelo documento. O servidor barra de novo — isto
// aqui é para o botão não existir, e não para a pessoa clicar e levar um erro.
export default function InspecoesClient({ podeFechar = true }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [montando, setMontando] = useState(null); // { opNumero, tipo, opId }
  const [novoTipo, setNovoTipo] = useState(null); // qual tipo está sendo criado
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [opFiltro, setOpFiltro] = useState("");   // "" = todas as obras
  const [recolhidos, setRecolhidos] = useState(() => new Set());
  // ⚠ RELATÓRIO APROVADO SAI DA FILA. Vitor (22/08/2026): "relatórios aprovados precisam sair da
  // aba de relatórios para preencher". Documento aprovado não é trabalho pendente — deixá-lo na
  // lista faz o que falta preencher desaparecer no meio do que já acabou.
  // ⚠ DUAS ABAS, não uma caixinha. Vitor (22/08/2026): "criar uma aba de Relatórios Aprovados e
  // Relatórios aguardando aprovação no setor da qualidade". A caixinha "mostrar aprovados"
  // misturava as duas coisas numa lista só; a aba separa o que ainda dá trabalho do que já é
  // arquivo — e é assim que a Qualidade pensa a fila.
  const [aba, setAba] = useState("PENDENTES");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/qualidade/inspecoes");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div className="p-6"><p className="text-sm text-red-600 inline-flex items-center gap-2"><AlertCircle size={15} /> {erro}</p><button onClick={carregar} className="block mt-3 rounded-lg border px-4 py-2 text-torg-blue">Tentar novamente</button></div>;
  if (!dados) return <div className="p-6"><p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p></div>;

  // agrupa o que está solto por OP + tipo — é assim que vira um relatório
  // ⚠ FILTRO POR OP e grupos que recolhem. Vitor (22/08/2026): "deixe as abas dos nomes dos
  // relatórios com uma forma de minimizar para ficar mais clean a página de relatórios, e também
  // um filtro para selecionar todos os relatórios de uma única OP". Com cinco tipos e várias
  // obras, a página virava uma coluna de rolagem em que achar um relatório é sorte.
  const grupos = new Map();
  for (const f of dados.soltas) {
    const chave = `${f.opNumero}|${f.tipo}`;
    const g = grupos.get(chave) || { opNumero: f.opNumero, opId: f.opId, tipo: f.tipo, fotos: [] };
    g.fotos.push(f);
    grupos.set(chave, g);
  }
  [...grupos.values()].sort((a, b) => a.opNumero.localeCompare(b.opNumero));

  // ── o que a lista mostra ──────────────────────────────────────────────────────────────────
  // ⚠ APROVADO É CONCLUÍDO, e nada mais. Reprovado e "exame complementar" continuam na fila: os
  // dois ainda vão receber trabalho — reparo e reinspeção num, ensaio complementar no outro. É a
  // mesma regra que decide se o relatório fecha (lib/revisao-inspecao.js).
  const ehConcluido = (r) => r.resultadoInspecao === "APROVADO";
  const concluidos = dados.relatorios.filter(ehConcluido).length;
  const pendentes = dados.relatorios.length - concluidos;
  const opsComRelatorio = [...new Set(dados.relatorios.map((r) => r.opNumero))]
    .sort((a, b) => String(b).localeCompare(String(a), "pt-BR", { numeric: true }));
  const visiveis = dados.relatorios
    .filter((r) => !opFiltro || String(r.opNumero) === opFiltro)
    .filter((r) => !tipoFiltro || r.tipo === tipoFiltro)
    .filter((r) => !busca.trim() || [r.codigo, r.opNumero, r.inspetor, r.criadoPorNome, ...(r.marcas || [])].join(" ").toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR")))
    .filter((r) => (aba === "APROVADOS" ? ehConcluido(r) : !ehConcluido(r)));



  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-torg-dark tracking-tight">Inspeções</h1>
          <p className="text-[13px] text-torg-gray mt-0.5">
            Preencha as inspeções, acompanhe as assinaturas e consulte os relatórios aprovados.
          </p>
        </div>
        {/* ⚠ TODO TIPO PODE NASCER AQUI. Antes só o dimensional tinha entrada; os demais dependiam de
            alguém mandar foto do celular primeiro, e quem trabalha no computador ficava sem começo. */}
        <div className="relative w-full sm:w-auto">
          <select aria-label="Criar novo relatório" value="" onChange={(e) => e.target.value && setNovoTipo(e.target.value)}
            className="w-full sm:max-w-sm min-h-[44px] appearance-none text-sm font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg pl-8 pr-7 py-1.5 cursor-pointer outline-none">
            <option value="">Novo relatório</option>
            {TIPOS_RELATORIO.map((t) => <option key={t.id} value={t.id} className="text-torg-dark bg-white">{t.sigla} · {t.label}</option>)}
          </select>
          <Plus size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
          <ChevronRight size={13} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-white pointer-events-none" />
        </div>
      </div>

      {/* ⚠ O BLOCO "REGISTROS DO CELULAR" SAIU. Vitor (22/08/2026): "tire essa parte, pois agora
          o registro fica dentro do servidor". Desde que a foto passou a nascer amarrada ao
          relatório, a fila de fotos soltas virou um lugar por onde nada passa — e um painel que
          vive vazio ensina a ignorar o painel. O fluxo agora é: cria o relatório e fotografa
          dentro dele. */}

      {/* ── relatórios montados ──────────────────────────────────────────────────────────── */}
      <h2 className="text-sm font-bold text-torg-dark mt-7 mb-2 inline-flex items-center gap-1.5">
        <FileText size={15} className="text-torg-blue" /> Relatórios
      </h2>
      {!dados.relatorios.length && <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-torg-gray"><FileText size={28} className="mx-auto mb-3"/><p>Nenhum relatório criado ainda.</p><p className="text-sm mt-1">Selecione o tipo em Novo relatório para começar.</p></div>}

      {dados.relatorios.length > 0 && (
        <>
          <div className="flex gap-1 border-b border-gray-200 mb-3">
            {[["PENDENTES", "Em andamento", pendentes], ["APROVADOS", "Aprovados", concluidos]].map(([k, rot, n]) => (
              <button key={k} onClick={() => setAba(k)}
                className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${
                  aba === k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
                {rot} <span className="font-normal">{n}</span>
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_240px]">
              <label className="block text-xs font-semibold text-torg-gray">Buscar relatório
                <div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-torg-gray"/><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Código, marca ou inspetor" className="w-full min-h-[44px] rounded-lg border border-gray-200 pl-9 pr-3 text-sm font-normal"/></div>
              </label>
              <label className="block text-xs font-semibold text-torg-gray">Obra
                <select value={opFiltro} onChange={e=>setOpFiltro(e.target.value)} className="mt-1 w-full min-h-[44px] border border-gray-200 rounded-lg px-3 bg-white text-sm font-normal"><option value="">Todas as obras</option>{opsComRelatorio.map(n=><option key={n} value={n}>OP-{n}</option>)}</select>
              </label>
              <label className="block text-xs font-semibold text-torg-gray">Tipo de inspeção
                <select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)} className="mt-1 w-full min-h-[44px] border border-gray-200 rounded-lg px-3 bg-white text-sm font-normal"><option value="">Todos os tipos</option>{TIPOS_RELATORIO.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
              </label>
            </div>
            <div className="flex flex-wrap justify-between gap-2 mt-3 text-xs text-torg-gray"><span>{visiveis.length} relatório(s) nesta lista</span>{(busca||opFiltro||tipoFiltro)&&<button onClick={()=>{setBusca("");setOpFiltro("");setTipoFiltro("");}} className="text-torg-blue font-semibold">Limpar filtros</button>}</div>
          </div>
          <p className="text-xs text-torg-gray mb-4">{aba==="APROVADOS"?"Inspeções com resultado aprovado. Confira a situação das assinaturas em cada relatório.":"Abra o relatório para preencher ou revisar. O envio para assinatura é uma etapa separada."}</p>
        </>
      )}

      {dados.relatorios.length > 0 && !visiveis.length && (
        <p className="text-[13px] text-torg-gray">
          {aba === "APROVADOS" ? "Nenhum relatório aprovado ainda." : "Nenhum relatório em andamento com estes filtros."}
          {opFiltro ? " nesta obra." : ""}
        </p>
      )}
      {agruparRelatorios(visiveis).map((t) => (
        <div key={t.tipo} className="mb-4 bg-white border border-gray-100 rounded-xl shadow-sm">
          <button onClick={() => setRecolhidos((p) => {
              const n = new Set(p);
              if (n.has(t.tipo)) n.delete(t.tipo); else n.add(t.tipo);
              return n;
            })}
            aria-expanded={!recolhidos.has(t.tipo)} className="w-full flex items-center gap-2 bg-gray-50/60 rounded-t-xl px-4 py-3 text-left hover:bg-gray-50">
            <ChevronRight size={13} className={`text-torg-blue transition-transform ${recolhidos.has(t.tipo) ? "" : "rotate-90"}`} />
            <h3 className="text-[13px] font-bold text-torg-dark">{TIPO_LABEL[t.tipo] || t.tipo}</h3>
            <span className="ml-auto shrink-0 text-[11px] text-torg-gray">{t.total} relatório{t.total > 1 ? "s" : ""}</span>
          </button>
          {!recolhidos.has(t.tipo) && <div className="divide-y divide-gray-100">{t.ops.flatMap(o=>o.relatorios).map(r=><Relatorio key={r.id} r={r} onMudou={carregar} podeFechar={podeFechar}/>)}</div>}
        </div>
      ))}

      {montando && (
        <Montar grupo={montando} onFechar={() => setMontando(null)} onPronto={() => { setMontando(null); carregar(); }} />
      )}
      {novoTipo && <NovoRelatorio tipo={novoTipo} onFechar={() => setNovoTipo(null)} onPronto={() => { setNovoTipo(null); carregar(); }} />}
    </div>
  );
}

/**
 * Os relatórios em duas camadas: TIPO e, dentro dele, OP.
 *
 * Vitor (21/08/2026): "vamos deixar separado por tipo de relatórios e dentro dos tipos de relatórios
 * deixar separado por OP". Faz sentido — a lista chapada repetia "OP-089 · Inspeção dimensional e
 * visual" em toda linha, e o que distingue um relatório do outro (o código e as peças) ficava
 * espremido no meio da repetição.
 *
 * A ordem dos tipos é a de `TIPOS_RELATORIO`, não alfabética: é a ordem em que a inspeção acontece
 * (dimensional → solda → ensaio → pintura), e é a mesma que o data book usa.
 */
function agruparRelatorios(relatorios) {
  const porTipo = new Map();
  for (const r of relatorios) {
    const t = porTipo.get(r.tipo) || { tipo: r.tipo, total: 0, ops: new Map() };
    const o = t.ops.get(r.opNumero) || { opNumero: r.opNumero, relatorios: [] };
    o.relatorios.push(r);
    t.ops.set(r.opNumero, o);
    t.total++;
    porTipo.set(r.tipo, t);
  }
  const ordem = TIPOS_RELATORIO.map((t) => t.id);
  return [...porTipo.values()]
    .sort((a, b) => {
      const ia = ordem.indexOf(a.tipo), ib = ordem.indexOf(b.tipo);
      // tipo desconhecido (vindo de dado antigo) vai para o fim em vez de sumir
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map((t) => ({
      ...t,
      // OP mais recente primeiro; e o relatório mais novo no topo de cada OP
      ops: [...t.ops.values()]
        .sort((a, b) => String(b.opNumero).localeCompare(String(a.opNumero), "pt-BR", { numeric: true }))
        .map((o) => ({ ...o, relatorios: o.relatorios.sort((x, y) => (y.numero || 0) - (x.numero || 0)) })),
    }));
}

function Relatorio({ r, onMudou, podeFechar = true }) {
  const [abrindo, setAbrindo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const assinadas = r.assinaturas.filter((a) => a.assinadoEm).length;
  const resultado = { APROVADO: "Inspeção aprovada", REPROVADO: "Reprovado · revisar", REC: "Exame complementar" }[r.resultadoInspecao];
  const situacao = r.envioAssinaturaId ? (r.assinaturas.length > 0 && assinadas === r.assinaturas.length ? "Assinaturas concluídas" : "Aguardando assinaturas") : r.emitidoEm ? "Emitido · não enviado" : "Rascunho";
  // ⚠⚠ QUEM FALTA APARECE NA LINHA, com o e-mail do convite. Aprovado cai na aba "Aprovados" com
  // ou sem assinatura, e o nome de quem falta só se via abrindo "Gerenciar assinaturas" — em
  // 23/09/2026 eram 12 relatórios esperando, 4 deles com o convite num e-mail que não é o login
  // do inspetor, e nada na tela deixava perceber.
  const faltam = r.envioAssinaturaId ? faltamAssinar(r.assinaturas) : [];

  async function excluir() {
    // ⚠ o aviso diz o que ACONTECE, não só "tem certeza?": o relatório sai do data book e as fotos
    // voltam para a fila. Sem isso, apagar parece mais destrutivo do que é — ou menos.
    const aviso = `Apagar ${r.codigo}?\n\n`
      + "· sai do data book (o anexo da seção é removido)\n"
      + (r.fotos > 0 ? `· as ${r.fotos} foto(s) voltam para a fila de fotos soltas\n` : "")
      + (r.envioAssinaturaId ? "\n⚠ Este relatório JÁ FOI ENVIADO para assinatura.\n" : "")
      + "\nNão dá para desfazer.";
    if (!confirm(aviso)) return;
    setExcluindo(true);
    try {
      const res = await fetch(`/api/qualidade/inspecoes/${r.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      onMudou();
    } catch (e) { alert(e.message); setExcluindo(false); }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
            <span className="text-xs font-bold text-torg-gray">OP-{r.opNumero}</span>
            <Link href={`/qualidade/inspecoes/${r.id}`} className="font-semibold font-mono text-sm text-torg-blue hover:underline">{r.codigo}</Link>
            <span className={`text-[11px] rounded px-2 py-0.5 ${faltam.length ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-torg-gray"}`}>{situacao}</span>
            {resultado&&<span className={`text-[11px] ${r.resultadoInspecao==="APROVADO"?"text-emerald-700":"text-orange-700"}`}>{resultado}</span>}
          </div>
          <p className="text-xs text-torg-gray mt-1.5">{r.inspetor || r.criadoPorNome || "Inspetor não informado"}{r.fotos>0?` · ${r.fotos} fotos`:""}{r.emitidoEm?` · ${fmtDT(r.emitidoEm)}`:""}{r.envioAssinaturaId?` · ${assinadas}/${r.assinaturas.length} assinaturas`:""}</p>
          {faltam.length > 0 && <p className="text-xs text-amber-800 mt-1 break-words">Falta assinar: {faltam.map(rotuloAssinante).join(" · ")}</p>}
          {!!r.marcas?.length&&<details className="mt-1 text-xs text-torg-gray"><summary className="cursor-pointer py-1 w-fit">{r.marcas.length} marca{r.marcas.length>1?"s":""} · ver peças</summary><p className="mt-1 break-words text-torg-dark leading-relaxed">{r.marcas.join(", ")}</p></details>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link aria-label={`Abrir ${r.codigo}`} href={`/qualidade/inspecoes/${r.id}`} className="inline-flex items-center justify-center min-h-[44px] px-3 text-sm font-semibold text-torg-blue rounded-lg hover:bg-blue-50">Abrir <ChevronRight size={15}/></Link>
          <details className="relative" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==="Escape"){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
            <summary aria-label={`Ações de ${r.codigo}`} className="list-none [&::-webkit-details-marker]:hidden cursor-pointer min-h-[44px] w-9 flex items-center justify-center rounded-lg text-torg-gray hover:bg-gray-100"><MoreHorizontal size={20}/></summary>
            <div className="absolute right-0 top-full z-20 w-56 max-w-[75vw] bg-white rounded-xl border border-gray-200 shadow-lg p-1">
              <a href={`/api/qualidade/inspecoes/${r.id}/pdf`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-h-[44px] px-3 text-sm text-torg-dark rounded-lg hover:bg-gray-50"><ExternalLink size={15}/>Visualizar PDF</a>
              {podeFechar&&<><button onClick={e=>{e.currentTarget.closest('details').open=false;setAbrindo(v=>!v);}} className="w-full flex items-center gap-2 min-h-[44px] px-3 text-sm text-torg-dark rounded-lg hover:bg-gray-50"><Send size={15}/>{r.envioAssinaturaId?"Gerenciar assinaturas":"Enviar para assinatura"}</button><button onClick={excluir} disabled={excluindo} aria-label={`Excluir ${r.codigo}`} className="w-full flex items-center gap-2 min-h-[44px] px-3 text-sm text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">{excluindo?<Loader2 size={15} className="animate-spin"/>:<Trash2 size={15}/>}Excluir relatório</button></>}
            </div>
          </details>
        </div>
      </div>

      {r.assinaturas.length > 0 && abrindo && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.assinaturas.map((a) => (
            <span key={a.email} className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
              a.assinadoEm ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-torg-gray border-gray-200"
            }`}>
              {a.assinadoEm ? <Check size={9} className="inline mr-0.5" /> : null}
              {a.nome}{a.setor ? ` · ${a.setor}` : ""}
              {/* ⚠ O LINK VALE SOZINHO — quando o e-mail não sai (limite do provedor, endereço
                  errado), copiar e mandar por fora destrava o documento no mesmo minuto. Só quem
                  convida enxerga: o token É a assinatura daquela pessoa. */}
              {!a.assinadoEm && a.token && (
                <button title="Copiar o link de assinatura desta pessoa"
                  onClick={() => {
                    const url = `${window.location.origin}/assinar/${a.token}`;
                    navigator.clipboard?.writeText(url).then(
                      () => alert(`Link de ${a.nome} copiado:\n\n${url}`),
                      () => prompt("Copie o link de assinatura:", url),
                    );
                  }}
                  className="text-torg-blue hover:text-torg-dark">
                  <Link2 size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {abrindo && <EnviarAssinatura relatorio={r} onFechar={() => setAbrindo(false)} onEnviado={() => { setAbrindo(false); onMudou(); }} />}
    </div>
  );
}

function Montar({ grupo, onFechar, onPronto }) {
  const [sel, setSel] = useState(new Set(grupo.fotos.map((f) => f.id)));
  const [observacoes, setObs] = useState("");
  const [inspetor, setInspetor] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    if (!sel.size) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/inspecoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opId: grupo.opId, opNumero: grupo.opNumero, tipo: grupo.tipo,
          fotoIds: [...sel], observacoes, inspetor,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      // o vínculo com o data book pode falhar por motivo legítimo (OP sem data book ainda) — dizer
      // é melhor que deixar a pessoa achar que apareceu na estruturação quando não apareceu
      alert(
        `Relatório ${j.relatorio.codigo} criado.\n\n` +
        textoDoVinculo(j.vinculo)
      );
      onPronto();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-torg-dark">Montar relatório — OP-{grupo.opNumero}</p>
            <p className="text-[11px] text-torg-gray">{TIPO_LABEL[grupo.tipo]} · o número sai automático, sequencial da obra</p>
          </div>
          <button onClick={onFechar} className="text-torg-gray hover:text-torg-dark"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Inspetor</span>
              <input value={inspetor} onChange={(e) => setInspetor(e.target.value)} placeholder="quem executou a inspeção"
                className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            </label>
          </div>
          <label className="block">
            <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Observações</span>
            <textarea value={observacoes} onChange={(e) => setObs(e.target.value)} rows={3}
              className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
          </label>

          <p className="text-[11px] font-semibold text-torg-gray pt-1">
            Fotos ({sel.size} de {grupo.fotos.length} selecionadas)
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {grupo.fotos.map((f) => {
              const on = sel.has(f.id);
              return (
                <button key={f.id} onClick={() => setSel((p) => { const n = new Set(p); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}
                  className={`relative rounded-lg overflow-hidden aspect-square border-2 ${on ? "border-torg-blue" : "border-transparent opacity-50"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.marca || "foto"} className="w-full h-full object-cover" />
                  {on && <span className="absolute top-1 right-1 bg-torg-blue text-white rounded-full p-0.5"><Check size={10} /></span>}
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[8px] px-1 py-0.5 truncate">
                    {f.marca || "geral"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onFechar} className="text-[12px] text-torg-gray px-3 py-1.5">Cancelar</button>
          <button onClick={criar} disabled={!sel.size || salvando}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Criar relatório
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * NOVO RELATÓRIO DIMENSIONAL — do desenho, não de foto.
 *
 * Vitor: "onde você está deixando a prévia desses relatórios?" — aqui. O botão "Montar" busca o
 * desenho no servidor, lê a lista de materiais e MOSTRA o que veio ANTES de gravar. Isso importa
 * porque o número do relatório é sequencial e não se reaproveita: gravar pra depois descobrir que o
 * desenho era outro deixaria um buraco na série.
 */
/**
 * NOVO RELATÓRIO — de qualquer tipo.
 *
 * Vitor (21/08/2026): "não estou conseguindo criar outros tipos de relatório no portal". Não estava
 * mesmo: só o dimensional tinha caminho de criação. Os demais (solda, ultrassom, pintura) nasciam
 * apenas de foto do celular, e quem trabalha no computador não tinha por onde começar.
 *
 * ⚠ O DIMENSIONAL é o único que exige peça: o relatório é de UM conjunto, e é dele que sai o
 * desenho onde as cotas são marcadas. Nos outros a peça é opcional — um EVS pode cobrir várias, e
 * quais foram fica na tabela do próprio relatório.
 */
function NovoRelatorio({ tipo, onFechar, onPronto }) {
  const ehDimensional = usaCotas(tipo);
  const [ops, setOps] = useState(null);
  const [op, setOp] = useState(null);
  // ⚠ NA PRÉ-MONTAGEM NÃO SE ESCOLHE PEÇA, SE ESCOLHE PROJETO. Vitor (22/08/2026): "não trouxe os
  // projetos de montagem". A lista de peças vem da LPC (marcas do Tekla) e o diagrama de montagem
  // não está lá — ele é o desenho do arranjo, não de uma peça. Por isso o escopo muda de sentido
  // aqui: "Diagrama de montagem" ou "Conjunto", e a lista traz PDFs da pasta da obra.
  const ehPreMontagem = tipo === "PRE_MONTAGEM";
  const [escopo, setEscopo] = useState("CONJUNTO");
  const [projetos, setProjetos] = useState(null);
  const [q, setQ] = useState("");
  // ⚠⚠ FILTRO, NÃO PORTA DE ENTRADA. Vitor (03/09/2026): "preciso que permita que eu possa criar um
  // relatório mesmo que eu não selecione se é um conjunto ou um diagrama de montagem". A tela
  // obrigava escolher a família ANTES de ver qualquer projeto — quem não sabia de cabeça em qual
  // pasta o desenho vivia ficava travado num palpite. Agora a lista vem com as duas famílias
  // juntas, e este filtro só estreita a busca por quem já sabe o que quer.
  const [famFiltro, setFamFiltro] = useState("");
  const [pecas, setPecas] = useState(null);
  // ⚠ POR FASE. Vitor (14/09/2026): "precisamos que separe por fases (…) isso deve ter em todos os
  // tipos de relatórios". As fases vêm da API; em obra com mais de uma, a lista abre na PRIMEIRA
  // (relatório nasce de uma fase só) e o inspetor troca pelo chip. `faseDefinida` impede que
  // "Todas as fases" seja desfeito pela resposta seguinte.
  const [fases, setFases] = useState([]);
  const [fase, setFase] = useState(null);
  const faseDefinida = useRef(false);
  const [temMais, setTemMais] = useState(false);
  const [sel, setSel] = useState([]);
  const [inspetor, setInspetor] = useState("");
  // Vitor (21/08/2026): "traga eles no seletor para podermos escolher um deles para testarmos".
  // A marca com NC1 sai com a dimensão exata; sem ele, o portal lê o desenho.
  const [comNc1, setComNc1] = useState(null); // Set de marcas
  const [soNc1, setSoNc1] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // ⚠ A LISTA SE RECOLHE. Vitor (21/08/2026): "após eu selecionar as peças seria bom ter uma opção
  // de ocultar as demais peças, pois fica ruim ter que ficar acertando scroll para baixar até a
  // informação do inspetor". Uma OP tem centenas de marcas; depois de escolher, a lista só atrapalha.
  const [listaAberta, setListaAberta] = useState(true);

  useEffect(() => {
    fetch("/api/qualidade/inspecoes/ops").then((r) => r.json()).then((j) => setOps(j.ops || [])).catch(() => setOps([]));
  }, []);

  // quais peças desta OP têm NC1
  useEffect(() => {
    if (!op) { setComNc1(null); return; }
    let vivo = true;
    setComNc1(null);
    fetch(`/api/qualidade/inspecoes/nc1?opNumero=${encodeURIComponent(op.numero)}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setComNc1(new Set(j.marcas || [])); })
      .catch(() => vivo && setComNc1(new Set()));
    return () => { vivo = false; };
  }, [op]);

  // lista as peças da OP. Dimensional de CONJUNTO: só conjuntos (um por relatório, com desenho);
  // dimensional de AVULSAS: tudo, inclusive croqui (é onde se mede o que saiu do corte); os demais
  // tipos (pintura, solda, US, LP): produto final — conjunto e peça avulsa, sem croqui nem
  // acessório. Vitor (14/09/2026): "isso não pode aparecer na tela do inspetor".
  const modo = !ehDimensional || ehPreMontagem ? "&todas=1" : escopo === "AVULSAS" ? "&todas=1&croquis=1" : "";
  useEffect(() => {
    if (!op) { setPecas(null); setFases([]); return; }
    let vivo = true;
    setPecas(null);
    const t = setTimeout(() => {
      fetch(`/api/campo/pecas?opId=${op.id}&q=${encodeURIComponent(q)}${modo}${fase ? `&fase=${encodeURIComponent(fase)}` : ""}`)
        .then((r) => r.json()).then((j) => {
          if (!vivo) return;
          setPecas(j.pecas || []); setTemMais(!!j.temMais);
          const fs = j.fases || [];
          setFases(fs);
          if (!faseDefinida.current && fs.length >= 2) { faseDefinida.current = true; setFase(fs[0]); }
        }).catch(() => vivo && setPecas([]));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [op, q, modo, fase]);

  // os projetos da obra (pré-montagem): as duas famílias juntas — ver nota do famFiltro acima.
  useEffect(() => {
    if (!ehPreMontagem || !op) { setProjetos(null); return; }
    let vivo = true;
    setProjetos(null);
    fetch(`/api/qualidade/inspecoes/projetos?opNumero=${encodeURIComponent(op.numero)}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setProjetos(j.projetos || []); })
      .catch(() => vivo && setProjetos([]));
    return () => { vivo = false; };
  }, [ehPreMontagem, op]);

  // trocar de escopo/OP invalida a seleção e a prévia — e a fase volta a ser decidida pela obra
  useEffect(() => { setSel([]); setListaAberta(true); setFase(null); faseDefinida.current = false; }, [op, escopo]);
  const escolherFase = (f) => { faseDefinida.current = true; setFase(f); };

  // ⚠ SÓ O DIMENSIONAL DE CONJUNTO É UMA PEÇA SÓ. Vitor (21/08/2026): "precisa me dar opção de
  // selecionar mais de uma peça". O escopo (conjunto × avulsas) existe apenas no dimensional, mas a
  // regra de "um por relatório" estava presa ao valor de `escopo`, que nos outros tipos ficava em
  // CONJUNTO por ser o padrão — e travava a seleção em uma peça sem que nada na tela explicasse.
  // Um EVS cobre várias peças; um relatório de pintura, um lote inteiro.
  const umaSo = ehDimensional && !ehPreMontagem && escopo === "CONJUNTO";
  const alternar = (m) => setSel((p) => {
    if (p.includes(m)) return p.filter((x) => x !== m);
    // no conjunto, escolher troca em vez de somar — e a lista se fecha, porque não há mais o que
    // escolher
    if (umaSo) { setListaAberta(false); return [m]; }
    return [...p, m];
  });

  async function gravar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/inspecoes/dimensional", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opNumero: op.numero, tipo, escopo, marcas: sel, inspetor,
          // ⚠ o CAMINHO vai junto: assim o relatório de pré-montagem nasce com o desenho
          // vinculado, em vez de depender de uma varredura por marca que nunca acharia o
          // diagrama de montagem (ele não é uma peça da LPC).
          projetos: ehPreMontagem
            ? (projetos || []).filter((pr) => sel.includes(pr.nome)).map((pr) => ({ nome: pr.nome, caminho: pr.caminho }))
            : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert(
        `Relatório ${j.relatorio.codigo} criado.\n\n` +
        `${textoDoVinculo(j.vinculo)}\n\n` +
        "Abra o relatório para marcar as cotas A, B e C sobre o desenho."
      );
      onPronto();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onFechar}>
      {/* ⚠ largura de FORMULÁRIO, não de página. Vitor (21/08/2026): "tire esse espaço em branco".
          O modal era largo porque tinha um painel de prévia ao lado; a prévia saiu quando a criação
          passou a ser instantânea, e sobrou meia tela vazia. */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-torg-dark">Novo relatório · {TIPO_LABEL[tipo] || tipo}</p>
            <p className="text-[11px] text-torg-gray">
              {ehDimensional
                ? "As dimensões de projeto vêm do desenho; as encontradas ficam para o elaborador."
                : "Escolha a OP. As peças podem ser informadas agora ou depois, no próprio relatório."}
            </p>
          </div>
          <button onClick={onFechar} className="text-torg-gray hover:text-torg-dark"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-3">
            <label className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">OP</span>
              <select value={op?.id || ""} onChange={(e) => setOp((ops || []).find((o) => o.id === e.target.value) || null)}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue">
                <option value="">{ops === null ? "carregando…" : "selecione a OP"}</option>
                {(ops || []).map((o) => (
                  <option key={o.id} value={o.id}>OP-{o.numero} — {o.cliente}{o.obra ? ` · ${o.obra}` : ""}</option>
                ))}
              </select>
            </label>

            {ehDimensional && !ehPreMontagem && (
            <div>
              <span className="block text-[10px] font-semibold text-torg-gray mb-1">Escopo</span>
              <div className="grid grid-cols-2 gap-2">
                {[["CONJUNTO", "Conjunto", "um por relatório"], ["AVULSAS", "Peças avulsas", "agrupadas"]].map(([v, t, sub]) => (
                  <button key={v} onClick={() => setEscopo(v)}
                    className={`text-left rounded-lg border px-2.5 py-1.5 ${escopo === v ? "border-torg-blue bg-torg-blue/5" : "border-gray-200"}`}>
                    <span className="block text-[12px] font-semibold text-torg-dark">{t}</span>
                    <span className="block text-[10px] text-torg-gray">{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            )}

            {op && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-torg-gray">
                    {ehPreMontagem ? "Projetos" : ehDimensional && escopo === "CONJUNTO" ? "Conjunto" : "Peças"} {sel.length ? `· ${sel.length} selecionada(s)` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {sel.length > 0 && (
                      <button onClick={() => setListaAberta((v) => !v)} className="text-[10px] text-torg-blue hover:underline">
                        {listaAberta ? "ocultar lista" : "escolher outra"}
                      </button>
                    )}
                    {sel.length > 0 && <button onClick={() => { setSel([]); setListaAberta(true); }} className="text-[10px] text-torg-blue hover:underline">limpar</button>}
                  </span>
                </div>

                {/* o que já foi escolhido fica à vista mesmo com a lista fechada */}
                {sel.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {sel.map((m) => (
                      <span key={m} className="inline-flex items-center gap-1 text-[11px] font-semibold text-torg-dark bg-torg-blue/10 border border-torg-blue-200 rounded px-1.5 py-0.5">
                        {m}
                        <button onClick={() => alternar(m)} className="text-torg-gray hover:text-red-600"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
                {/* ── pré-montagem: a lista é de PROJETOS da pasta da obra ── */}
                {listaAberta && ehPreMontagem && (<>
                {/* ⚠ a pasta de conjunto tem 435 PDFs na OP-067. Lista sem busca ali é uma lista
                    que ninguém usa — rola-se até desistir. */}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar projeto…"
                  autoCorrect="off" spellCheck={false}
                  className="w-full text-[12px] font-mono border border-gray-200 rounded-lg px-2 py-1.5 mb-1.5 focus:border-torg-blue outline-none" />
                {/* ⚠ FILTRO OPCIONAL, não escolha obrigatória — a lista já veio com as duas
                    famílias. Quem sabe o que procura estreita aqui; quem não sabe, não precisa. */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  {[["", "Todos"], ["montagem", "Montagem"], ["conjunto", "Conjunto"]].map(([v, t]) => (
                    <button key={v || "todos"} onClick={() => setFamFiltro(v)}
                      className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${
                        famFiltro === v ? "border-torg-blue bg-torg-blue text-white" : "border-gray-200 text-torg-gray hover:bg-gray-50"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                  <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto">
                    {projetos === null && (
                      <p className="p-2 text-[12px] text-torg-gray inline-flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> procurando os projetos na pasta da obra…
                      </p>
                    )}
                    {projetos
                      ?.filter((pr) => !q || pr.nome.toLowerCase().includes(q.toLowerCase()))
                      .filter((pr) => !famFiltro || pr.familia === famFiltro)
                      .slice(0, 300).map((pr) => {
                      const on = sel.includes(pr.nome);
                      return (
                        <button key={pr.caminho} onClick={() => alternar(pr.nome)}
                          className={`w-full text-left px-2 py-1.5 text-[12px] border-b border-gray-50 last:border-0 flex items-center gap-1.5 ${on ? "bg-torg-blue/10 font-semibold text-torg-dark" : "text-torg-dark hover:bg-gray-50"}`}>
                          <span className="flex-1 truncate">{pr.nome}</span>
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-torg-gray-light">
                            {pr.familia === "montagem" ? "montagem" : "conjunto"}
                          </span>
                        </button>
                      );
                    })}
                    {projetos && !projetos.length && (
                      <p className="p-2 text-[12px] text-torg-gray">
                        Nenhum PDF nas pastas de montagem ou conjunto desta OP. Dá para anexar o projeto depois, dentro do relatório.
                      </p>
                    )}
                    {projetos && projetos.length > 300 && !q && (
                      <p className="p-2 text-[11px] text-torg-gray border-t border-gray-100">
                        Mostrando 300 de {projetos.length} — use a busca para achar o projeto.
                      </p>
                    )}
                  </div>
                </>)}

                {listaAberta && !ehPreMontagem && (<>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar marca…"
                  autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  className="w-full text-[12px] font-mono border border-gray-200 rounded-lg px-2 py-1.5 mb-1.5 focus:border-torg-blue outline-none" />
                {comNc1 !== null && comNc1.size > 0 && (
                  <label className="flex items-center gap-1.5 mb-1.5 text-[11px] text-torg-gray">
                    <input type="checkbox" checked={soNc1} onChange={(e) => setSoNc1(e.target.checked)} />
                    só peças com NC1 <span className="text-torg-gray/70">({comNc1.size} na OP)</span>
                  </label>
                )}
                <FiltroFase fases={fases} fase={fase} onChange={escolherFase} />
                <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto">
                  {pecas === null && <p className="p-2 text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> buscando…</p>}
                  {(pecas || []).filter((p) => !soNc1 || comNc1?.has(String(p.marca).toUpperCase())).map((p, i, arr) => {
                    const on = sel.includes(p.marca);
                    const nc = comNc1?.has(String(p.marca).toUpperCase());
                    // com "Todas as fases" a lista vem separada por cabeçalho de fase
                    const cabecalho = !fase && fases.length >= 2 && (i === 0 || arr[i - 1].fase !== p.fase);
                    return (<div key={p.marca}>
                      {cabecalho && <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-torg-gray bg-gray-50 border-b border-gray-100">{rotuloFase(p.fase)}</p>}
                      <button onClick={() => alternar(p.marca)}
                        className={`w-full text-left px-2 py-1.5 border-b border-gray-50 flex items-center gap-2 ${on ? "bg-torg-blue/5" : "hover:bg-gray-50"}`}>
                        <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${on ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
                          {on && <Check size={11} className="text-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-torg-dark">{p.marca}</span>
                          <span className="block text-[10px] text-torg-gray truncate">{[p.descricao, p.perfil].filter(Boolean).join(" · ") || "—"}</span>
                        </span>
                        {/* NC1 = dimensão exata (comprimento e posição de furo); sem ele, lê o desenho */}
                        {nc && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 shrink-0">NC1</span>}
                      </button>
                    </div>);
                  })}
                  {pecas && !pecas.length && <p className="p-2 text-[12px] text-torg-gray">Nada encontrado.</p>}
                  {temMais && <p className="p-2 text-[11px] text-torg-gray border-t border-gray-100">Mostrando as primeiras 60 marcas — busque pela marca{fases.length >= 2 ? " ou escolha a fase" : ""}.</p>}
                </div>
                </>)}
              </div>
            )}

            <label className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Inspetor</span>
              <input value={inspetor} onChange={(e) => setInspetor(e.target.value)}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            </label>

          </div>

        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onFechar} className="text-[12px] text-torg-gray px-3 py-1.5">Cancelar</button>
          <button onClick={gravar} disabled={!op || (ehDimensional && !sel.length) || salvando}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Criar relatório
          </button>
        </div>
      </div>
    </div>
  );
}

function EnviarAssinatura({ relatorio, onFechar, onEnviado }) {
  const [linhas, setLinhas] = useState([{ nome: "", email: "", papel: PAPEIS[0], assina: true }]);
  const [enviando, setEnviando] = useState(false);

  const set = (i, campo, v) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  async function enviar() {
    const dest = linhas.filter((l) => l.nome.trim() && /.+@.+\..+/.test(l.email.trim()));
    if (!dest.length) { alert("Preencha nome e e-mail de ao menos um destinatário."); return; }
    if (!dest.some((l) => l.assina)) { alert("Marque ao menos uma pessoa como assinante — só com cópias o documento nunca é assinado."); return; }
    setEnviando(true);
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${relatorio.id}/assinatura`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatarios: dest }),
      });
      const j = await r.json();
      if (r.status >= 400) throw new Error(j.error || "Erro");
      // ⚠⚠ NENHUM E-MAIL SAIU É ERRO, NÃO AVISO. Vitor (04/09/2026): "fui mandar um relatório para
      // assinar e não foi". A tela dizia "0 assinante(s) convidado(s)" — tecnicamente verdade, e
      // fácil de ler como sucesso. Agora diz o motivo do provedor e o que fazer: o link da
      // assinatura continua valendo e pode ser mandado por fora.
      if (!j.enviados && !j.emCopia) {
        const motivo = (j.falhas || []).map((f) => `· ${f.email}: ${f.erro}`).join("\n") || "sem detalhe do provedor";
        alert(`NENHUM e-mail saiu.\n\n${motivo}\n\nO envio ficou registrado e os links de assinatura estão válidos — dá para copiar o link de cada assinante no quadro do relatório e mandar por fora enquanto o e-mail não volta.`);
      } else {
        const parciais = (j.falhas || []).length ? `\n\nNão saíram:\n${j.falhas.map((f) => `· ${f.email}: ${f.erro}`).join("\n")}` : "";
        const semAnexo = j.semAnexo ? `\n\n${j.semAnexo} e-mail(s) foram sem o PDF anexo (o link tem o documento).` : "";
        alert(`${j.enviados} assinante(s) convidado(s)${j.emCopia ? ` e ${j.emCopia} em cópia` : ""}.${j.jaEstavam ? ` ${j.jaEstavam} já tinham sido convidados.` : ""}${semAnexo}${parciais}`);
      }
      onEnviado();
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  // ⚠⚠ AS PENDÊNCIAS APARECEM ANTES DO CLIQUE. Vitor (03/09/2026): "para os relatórios que não
  // estiverem definidas todas as medidas mencionadas para conferência e o quantitativo você precisa
  // bloquear para envio de assinatura". O servidor barra de qualquer jeito (é lá que a regra vale);
  // aqui a tela DIZ o que falta, senão a pessoa preenche os destinatários e leva um erro no fim.
  const pendencias = relatorio.envioAssinaturaId ? [] : pendenciasParaAssinatura(relatorio);

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-[11px] font-semibold text-torg-gray mb-2 inline-flex items-center gap-1.5">
        <ShieldCheck size={13} className="text-torg-blue" /> Enviar para assinatura eletrônica
      </p>
      {pendencias.length > 0 && (
        <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-[12px] font-semibold text-amber-900">Ainda não pode ir para assinatura:</p>
          <ul className="mt-1 space-y-0.5">
            {pendencias.map((p, i) => (
              <li key={i} className="text-[11.5px] text-amber-800">• {p}</li>
            ))}
          </ul>
          <p className="text-[11px] text-amber-700 mt-1">Abra o relatório para completar.</p>
        </div>
      )}
      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto_auto_auto] gap-2 items-center">
            <input value={l.nome} onChange={(e) => set(i, "nome", e.target.value)} placeholder="nome"
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            <input value={l.email} onChange={(e) => set(i, "email", e.target.value)} placeholder="e-mail" type="email"
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            <select value={l.papel} onChange={(e) => set(i, "papel", e.target.value)}
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue">
              {PAPEIS.map((p) => <option key={p}>{p}</option>)}
            </select>
            {/* ⚠ quem não assina vai EM CÓPIA: recebe o PDF e não ganha link nem linha no quadro
                de assinaturas. Sem isso o relatório ficaria eternamente "aguardando" alguém que
                nunca deveria assinar. */}
            <label className="flex items-center gap-1.5 text-[11px] text-torg-gray whitespace-nowrap cursor-pointer px-1">
              <input type="checkbox" checked={l.assina !== false} onChange={(e) => set(i, "assina", e.target.checked)}
                className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
              {l.assina !== false ? "assina" : "cópia"}
            </label>
            <button onClick={() => setLinhas((p) => p.filter((_, k) => k !== i))} disabled={linhas.length === 1}
              className="text-torg-gray hover:text-red-600 disabled:opacity-30 px-1"><X size={14} /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
        <button onClick={() => setLinhas((p) => [...p, { nome: "", email: "", papel: PAPEIS[Math.min(p.length, PAPEIS.length - 1)], assina: true }])}
          className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={11} /> outro destinatário</button>
        <div className="flex items-center gap-2">
          <button onClick={onFechar} className="text-[12px] text-torg-gray px-2 py-1">Fechar</button>
          <button onClick={enviar} disabled={enviando || pendencias.length > 0}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar
          </button>
        </div>
      </div>
      <p className="text-[10px] text-torg-gray mt-2">
        Quem está marcado como <strong>assina</strong> recebe o PDF e um link próprio; ao assinar ficam registrados a
        confirmação, a data/hora e o IP — é assinatura eletrônica, não certificado ICP-Brasil. Quem está em
        <strong> cópia</strong> recebe o mesmo PDF, sem link e sem entrar no quadro de assinaturas.
      </p>
    </div>
  );
}
