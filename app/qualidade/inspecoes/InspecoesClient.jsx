"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2, ArrowLeft, Camera, FileText, Check, Send, AlertCircle,
  ChevronRight, ExternalLink, Plus, X, ShieldCheck, Ruler, Trash2,
} from "lucide-react";
import { TIPO_LABEL, TIPOS_RELATORIO, usaCotas } from "@/lib/qualidade-campo";

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

export default function InspecoesClient() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [montando, setMontando] = useState(null); // { opNumero, tipo, opId }
  const [novoTipo, setNovoTipo] = useState(null); // qual tipo está sendo criado

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/qualidade/inspecoes");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) return <div className="p-6"><p className="text-sm text-red-600 inline-flex items-center gap-2"><AlertCircle size={15} /> {erro}</p></div>;
  if (!dados) return <div className="p-6"><p className="text-sm text-torg-gray inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> carregando…</p></div>;

  // agrupa o que está solto por OP + tipo — é assim que vira um relatório
  const grupos = new Map();
  for (const f of dados.soltas) {
    const chave = `${f.opNumero}|${f.tipo}`;
    const g = grupos.get(chave) || { opNumero: f.opNumero, opId: f.opId, tipo: f.tipo, fotos: [] };
    g.fotos.push(f);
    grupos.set(chave, g);
  }
  const lista = [...grupos.values()].sort((a, b) => a.opNumero.localeCompare(b.opNumero));

  async function excluirGrupo(g) {
    if (!confirm(`Excluir ${g.fotos.length} registro(s) de OP-${g.opNumero} · ${TIPO_LABEL[g.tipo] || g.tipo}?\n\nAs fotos saem do portal. Isso não afeta relatórios já montados.`)) return;
    try {
      const r = await fetch("/api/qualidade/inspecoes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: g.opNumero, tipo: g.tipo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      carregar();
    } catch (e) { alert(e.message); }
  }

  async function excluirFoto(f) {
    if (!confirm("Excluir esta foto?")) return;
    try {
      const r = await fetch("/api/qualidade/inspecoes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [f.id] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      carregar();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Link href="/qualidade" className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 mb-3"><ArrowLeft size={13} /> Qualidade</Link>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-torg-dark tracking-tight">Inspeções</h1>
          <p className="text-[13px] text-torg-gray mt-0.5">
            O que a fábrica registrou pelo celular, virando relatório numerado e assinado.
          </p>
        </div>
        {/* ⚠ TODO TIPO PODE NASCER AQUI. Antes só o dimensional tinha entrada; os demais dependiam de
            alguém mandar foto do celular primeiro, e quem trabalha no computador ficava sem começo. */}
        <div className="relative">
          <select value="" onChange={(e) => e.target.value && setNovoTipo(e.target.value)}
            className="appearance-none text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg pl-8 pr-7 py-1.5 cursor-pointer outline-none">
            <option value="">Novo relatório</option>
            {TIPOS_RELATORIO.map((t) => <option key={t.id} value={t.id} className="text-torg-dark bg-white">{t.sigla} · {t.label}</option>)}
          </select>
          <Plus size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
          <ChevronRight size={13} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-white pointer-events-none" />
        </div>
      </div>

      {/* ── fotos soltas ─────────────────────────────────────────────────────────────────── */}
      <h2 className="text-sm font-bold text-torg-dark mt-6 mb-2 inline-flex items-center gap-1.5">
        <Camera size={15} className="text-torg-blue" /> Registros do celular
        <span className="text-[11px] font-normal text-torg-gray">({dados.soltas.length} foto(s) sem relatório)</span>
      </h2>
      {!lista.length && <p className="text-[13px] text-torg-gray">Nada pendente — todas as fotos já viraram relatório.</p>}
      <div className="space-y-2">
        {lista.map((g) => (
          <div key={`${g.opNumero}|${g.tipo}`} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-torg-dark text-sm">OP-{g.opNumero} · {TIPO_LABEL[g.tipo] || g.tipo}</p>
                <p className="text-[11px] text-torg-gray">
                  {g.fotos.length} foto(s) · {[...new Set(g.fotos.map((f) => f.marca).filter(Boolean))].length} peça(s) · último em {fmtDT(g.fotos[0]?.capturadaEm)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setMontando(g)}
                  className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                  <Plus size={13} /> Montar relatório
                </button>
                {/* Vitor (21/08): "precisa ter a opção para excluir esses". Foto de teste ou na OP
                    errada empilha na fila e esconde o trabalho de verdade. */}
                <button onClick={() => excluirGrupo(g)} title="Excluir estes registros"
                  className="text-[12px] text-torg-gray hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1.5 inline-flex items-center gap-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
              {g.fotos.slice(0, 14).map((f) => (
                <span key={f.id} className="relative shrink-0 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.marca || "foto"} title={`${f.marca || "sem peça"} · ${f.autorNome || ""}`}
                    className="h-14 w-14 object-cover rounded border border-gray-100" />
                  <button onClick={() => excluirFoto(f)} title="Excluir esta foto"
                    className="absolute top-0.5 right-0.5 bg-black/55 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-600">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {g.fotos.length > 14 && <span className="text-[11px] text-torg-gray self-center shrink-0">+{g.fotos.length - 14}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── relatórios montados ──────────────────────────────────────────────────────────── */}
      <h2 className="text-sm font-bold text-torg-dark mt-7 mb-2 inline-flex items-center gap-1.5">
        <FileText size={15} className="text-torg-blue" /> Relatórios
      </h2>
      {!dados.relatorios.length && <p className="text-[13px] text-torg-gray">Nenhum relatório montado ainda.</p>}
      {agruparRelatorios(dados.relatorios).map((t) => (
        <div key={t.tipo} className="mb-5">
          <div className="flex items-center gap-2 bg-torg-blue/5 border-l-[3px] border-torg-blue rounded-r-lg px-2.5 py-1.5 mb-2">
            <h3 className="text-[13px] font-bold text-torg-dark">{TIPO_LABEL[t.tipo] || t.tipo}</h3>
            <span className="text-[11px] text-torg-gray">{t.total} relatório{t.total > 1 ? "s" : ""}</span>
          </div>
          {t.ops.map((o) => (
            <div key={o.opNumero} className="mb-2.5">
              <p className="mb-1 pl-0.5">
                <span className="text-[11px] font-bold text-torg-dark bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                  OP-{o.opNumero}
                </span>
                <span className="text-[11px] text-torg-gray ml-1.5">{o.relatorios.length} relatório{o.relatorios.length > 1 ? "s" : ""}</span>
              </p>
              <div className="space-y-2">
                {o.relatorios.map((r) => <Relatorio key={r.id} r={r} onMudou={carregar} />)}
              </div>
            </div>
          ))}
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

function Relatorio({ r, onMudou }) {
  const [abrindo, setAbrindo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const assinadas = r.assinaturas.filter((a) => a.assinadoEm).length;

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
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href={`/qualidade/inspecoes/${r.id}`} className="font-semibold text-torg-blue hover:text-torg-dark text-sm">
            <span className="font-mono">{r.codigo}</span>
            {r.marcas?.length ? <span className="font-normal text-torg-dark"> · {r.marcas.slice(0, 4).join(", ")}{r.marcas.length > 4 ? ` +${r.marcas.length - 4}` : ""}</span> : null}
          </Link>
          <p className="text-[11px] text-torg-gray">
            {r.fotos > 0 ? `${r.fotos} foto${r.fotos > 1 ? "s" : ""} · ` : ""}
            {/* ⚠ o tipo identifica melhor que "sem título". Vitor (22/08/2026): "essa parte de
                título não há necessidade de ter em nenhum dos relatórios... seria um campo a
                mais para termos que pensar em preencher". Relatório antigo com título mantém
                o dele. */}
            {r.titulo || TIPO_LABEL[r.tipo] || r.tipo} · {r.inspetor || r.criadoPorNome || "—"}
            {r.emitidoEm ? ` · emitido ${fmtDT(r.emitidoEm)}` : " · rascunho"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.envioAssinaturaId && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              assinadas === r.assinaturas.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>
              {assinadas}/{r.assinaturas.length} assinaram
            </span>
          )}
          <a href={`/api/qualidade/inspecoes/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium">
            <ExternalLink size={13} /> PDF
          </a>
          <button onClick={() => setAbrindo((v) => !v)}
            className="text-[12px] text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 font-medium">
            <Send size={13} /> {r.envioAssinaturaId ? "Assinaturas" : "Enviar p/ assinatura"}
          </button>
          <button onClick={excluir} disabled={excluindo} title="Apagar relatório"
            className="text-torg-gray hover:text-red-600 disabled:opacity-40 p-1">
            {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {r.assinaturas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.assinaturas.map((a) => (
            <span key={a.email} className={`text-[10px] px-2 py-0.5 rounded-full border ${
              a.assinadoEm ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-torg-gray border-gray-200"
            }`}>
              {a.assinadoEm ? <Check size={9} className="inline mr-0.5" /> : null}
              {a.nome}{a.setor ? ` · ${a.setor}` : ""}
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
        (j.vinculo?.vinculado
          ? `Entrou na seção ${j.vinculo.secao} do data book (${j.vinculo.secaoTitulo}).`
          : `⚠ Não entrou no data book: ${j.vinculo?.motivo || "seção não encontrada"}.`)
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
  const [escopo, setEscopo] = useState(tipo === "PRE_MONTAGEM" ? "MONTAGEM" : "CONJUNTO");
  const [projetos, setProjetos] = useState(null);
  const [q, setQ] = useState("");
  const [pecas, setPecas] = useState(null);
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

  // lista as peças da OP — CONJUNTO mostra conjuntos, AVULSAS mostra todas
  useEffect(() => {
    if (!op) { setPecas(null); return; }
    let vivo = true;
    setPecas(null);
    const t = setTimeout(() => {
      fetch(`/api/campo/pecas?opId=${op.id}&q=${encodeURIComponent(q)}${escopo === "AVULSAS" ? "&todas=1" : ""}`)
        .then((r) => r.json()).then((j) => { if (vivo) setPecas(j.pecas || []); }).catch(() => vivo && setPecas([]));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [op, q, escopo]);

  // os projetos da obra (pré-montagem): montagem ou conjunto, conforme o escopo
  useEffect(() => {
    if (!ehPreMontagem || !op) { setProjetos(null); return; }
    let vivo = true;
    setProjetos(null);
    const familia = escopo === "CONJUNTO" ? "conjunto" : "montagem";
    fetch(`/api/qualidade/inspecoes/projetos?opNumero=${encodeURIComponent(op.numero)}&familia=${familia}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setProjetos(j.projetos || []); })
      .catch(() => vivo && setProjetos([]));
    return () => { vivo = false; };
  }, [ehPreMontagem, op, escopo]);

  // trocar de escopo/OP invalida a seleção e a prévia
  useEffect(() => { setSel([]); setListaAberta(true); }, [op, escopo]);

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
        (j.vinculo?.vinculado ? `Entrou na seção ${j.vinculo.secao} do data book.\n\n` : `⚠ Não entrou no data book: ${j.vinculo?.motivo || "seção não encontrada"}.\n\n`) +
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

            {ehDimensional && (
            <div>
              <span className="block text-[10px] font-semibold text-torg-gray mb-1">
                {ehPreMontagem ? "Projeto a inspecionar" : "Escopo"}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(ehPreMontagem
                  ? [["MONTAGEM", "Diagrama de montagem", "pasta Montagem"], ["CONJUNTO", "Conjunto", "pasta Conjunto"]]
                  : [["CONJUNTO", "Conjunto", "um por relatório"], ["AVULSAS", "Peças avulsas", "agrupadas"]]
                ).map(([v, t, sub]) => (
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
                    {ehPreMontagem ? "Projetos" : escopo === "CONJUNTO" ? "Conjunto" : "Peças"} {sel.length ? `· ${sel.length} selecionada(s)` : ""}
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
                  <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto">
                    {projetos === null && (
                      <p className="p-2 text-[12px] text-torg-gray inline-flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> procurando os projetos na pasta da obra…
                      </p>
                    )}
                    {projetos?.filter((pr) => !q || pr.nome.toLowerCase().includes(q.toLowerCase())).slice(0, 300).map((pr) => {
                      const on = sel.includes(pr.nome);
                      return (
                        <button key={pr.caminho} onClick={() => alternar(pr.nome)}
                          className={`w-full text-left px-2 py-1.5 text-[12px] border-b border-gray-50 last:border-0 ${on ? "bg-torg-blue/10 font-semibold text-torg-dark" : "text-torg-dark hover:bg-gray-50"}`}>
                          {pr.nome}
                        </button>
                      );
                    })}
                    {projetos && !projetos.length && (
                      <p className="p-2 text-[12px] text-torg-gray">
                        Nenhum PDF nessa pasta desta OP. Dá para anexar o projeto depois, dentro do relatório.
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
                <div className="border border-gray-100 rounded-lg max-h-56 overflow-y-auto">
                  {pecas === null && <p className="p-2 text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> buscando…</p>}
                  {(pecas || []).filter((p) => !soNc1 || comNc1?.has(String(p.marca).toUpperCase())).map((p) => {
                    const on = sel.includes(p.marca);
                    const nc = comNc1?.has(String(p.marca).toUpperCase());
                    return (
                      <button key={p.marca} onClick={() => alternar(p.marca)}
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
                    );
                  })}
                  {pecas && !pecas.length && <p className="p-2 text-[12px] text-torg-gray">Nada encontrado.</p>}
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
  const [linhas, setLinhas] = useState([{ nome: "", email: "", papel: PAPEIS[0] }]);
  const [enviando, setEnviando] = useState(false);

  const set = (i, campo, v) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  async function enviar() {
    const dest = linhas.filter((l) => l.nome.trim() && /.+@.+\..+/.test(l.email.trim()));
    if (!dest.length) { alert("Preencha nome e e-mail de ao menos um assinante."); return; }
    setEnviando(true);
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${relatorio.id}/assinatura`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatarios: dest }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert(`${j.enviados} e-mail(s) enviado(s).${j.jaEstavam ? ` ${j.jaEstavam} já tinham sido convidados.` : ""}`);
      onEnviado();
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-[11px] font-semibold text-torg-gray mb-2 inline-flex items-center gap-1.5">
        <ShieldCheck size={13} className="text-torg-blue" /> Enviar para assinatura eletrônica
      </p>
      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto_auto] gap-2">
            <input value={l.nome} onChange={(e) => set(i, "nome", e.target.value)} placeholder="nome"
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            <input value={l.email} onChange={(e) => set(i, "email", e.target.value)} placeholder="e-mail" type="email"
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            <select value={l.papel} onChange={(e) => set(i, "papel", e.target.value)}
              className="text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue">
              {PAPEIS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <button onClick={() => setLinhas((p) => p.filter((_, k) => k !== i))} disabled={linhas.length === 1}
              className="text-torg-gray hover:text-red-600 disabled:opacity-30 px-1"><X size={14} /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
        <button onClick={() => setLinhas((p) => [...p, { nome: "", email: "", papel: PAPEIS[Math.min(p.length, PAPEIS.length - 1)] }])}
          className="text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1"><Plus size={11} /> outro assinante</button>
        <div className="flex items-center gap-2">
          <button onClick={onFechar} className="text-[12px] text-torg-gray px-2 py-1">Fechar</button>
          <button onClick={enviar} disabled={enviando}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar
          </button>
        </div>
      </div>
      <p className="text-[10px] text-torg-gray mt-2">
        Cada um recebe o PDF por e-mail e um link próprio. Ao assinar ficam registrados a confirmação, a data/hora e o IP —
        é assinatura eletrônica, não certificado ICP-Brasil.
      </p>
    </div>
  );
}
