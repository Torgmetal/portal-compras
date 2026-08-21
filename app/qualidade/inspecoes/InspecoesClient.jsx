"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2, ArrowLeft, Camera, FileText, Check, Send, AlertCircle,
  ChevronRight, ExternalLink, Plus, X, ShieldCheck, Ruler, Trash2,
} from "lucide-react";
import { TIPO_LABEL, TIPOS_RELATORIO } from "@/lib/qualidade-campo";

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
  const [novoDim, setNovoDim] = useState(false);

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
        {/* o dimensional não vem de foto: monta-se do desenho, então tem entrada própria */}
        <button onClick={() => setNovoDim(true)}
          className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
          <Ruler size={13} /> Novo relatório dimensional
        </button>
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
      <div className="space-y-2">
        {dados.relatorios.map((r) => (
          <Relatorio key={r.id} r={r} onMudou={carregar} />
        ))}
      </div>

      {montando && (
        <Montar grupo={montando} onFechar={() => setMontando(null)} onPronto={() => { setMontando(null); carregar(); }} />
      )}
      {novoDim && <NovoDimensional onFechar={() => setNovoDim(false)} onPronto={() => { setNovoDim(false); carregar(); }} />}
    </div>
  );
}

function Relatorio({ r, onMudou }) {
  const [abrindo, setAbrindo] = useState(false);
  const assinadas = r.assinaturas.filter((a) => a.assinadoEm).length;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link href={`/qualidade/inspecoes/${r.id}`} className="font-semibold text-torg-blue hover:text-torg-dark text-sm">
            <span className="font-mono">{r.codigo}</span> · OP-{r.opNumero} · {TIPO_LABEL[r.tipo] || r.tipo}
          </Link>
          <p className="text-[11px] text-torg-gray">
            {r.fotos} foto(s) · {r.titulo || "sem título"} · {r.inspetor || r.criadoPorNome || "—"}
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
  const [titulo, setTitulo] = useState("");
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
          fotoIds: [...sel], titulo, observacoes, inspetor,
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
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Título (opcional)</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Inspeção das longarinas do eixo 4"
                className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            </label>
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
function NovoDimensional({ onFechar, onPronto }) {
  const [ops, setOps] = useState(null);
  const [op, setOp] = useState(null);
  const [escopo, setEscopo] = useState("CONJUNTO");
  const [q, setQ] = useState("");
  const [pecas, setPecas] = useState(null);
  const [sel, setSel] = useState([]);
  const [titulo, setTitulo] = useState("");
  const [inspetor, setInspetor] = useState("");
  const [previa, setPrevia] = useState(null); // { linhas, desenhos, erros, tolerancia }
  // Vitor (21/08/2026): "traga eles no seletor para podermos escolher um deles para testarmos".
  // A marca com NC1 sai com a dimensão exata; sem ele, o portal lê o desenho.
  const [comNc1, setComNc1] = useState(null); // Set de marcas
  const [soNc1, setSoNc1] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [salvando, setSalvando] = useState(false);

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

  // trocar de escopo/OP invalida a seleção e a prévia
  useEffect(() => { setSel([]); setPrevia(null); setPdfUrl(""); }, [op, escopo]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const alternar = (m) => setSel((p) => {
    if (p.includes(m)) return p.filter((x) => x !== m);
    // conjunto é UM por relatório — trocar em vez de somar
    return escopo === "CONJUNTO" ? [m] : [...p, m];
  });

  // relógio: montar varre o servidor e pode levar dezenas de segundos. Sem ver o tempo correndo,
  // uma espera longa é indistinguível de tela travada — foi o que aconteceu com o Vitor.
  useEffect(() => {
    if (!carregando) { setSegundos(0); return; }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [carregando]);

  async function montar() {
    if (!op || !sel.length) { alert("Escolha a OP e ao menos uma peça."); return; }
    setCarregando(true); setPrevia(null); setPdfUrl("");
    // ⚠ corta em 100 s: sem isto, quando a rota morre calada o botão fica girando para sempre.
    const ctrl = new AbortController();
    const corta = setTimeout(() => ctrl.abort(), 100000);
    try {
      // uma chamada só: dados + a folha em base64. Duas idas refaziam a montagem inteira (que varre
      // o servidor) e a tela ficava meio minuto parada, parecendo travada.
      const r = await fetch("/api/qualidade/inspecoes/dimensional", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: op.numero, escopo, marcas: sel, titulo, inspetor }),
        signal: ctrl.signal,
      });
      // resposta que não é JSON (erro do gateway, timeout da plataforma) precisa aparecer como
      // mensagem, não como "unexpected token" — ou o usuário fica sem saber o que houve
      const bruto = await r.text();
      let j;
      try { j = JSON.parse(bruto); }
      catch { throw new Error(r.ok ? "Resposta inesperada do servidor." : `Falha no servidor (${r.status}). Tente de novo.`); }
      if (!r.ok) throw new Error(j.error || "Erro");
      setPrevia(j);
      if (j.pdf) {
        const bin = Uint8Array.from(atob(j.pdf), (c) => c.charCodeAt(0));
        setPdfUrl(URL.createObjectURL(new Blob([bin], { type: "application/pdf" })));
      }
    } catch (e) {
      alert(e.name === "AbortError"
        ? "A montagem passou de 100 segundos e foi interrompida. Tente de novo — a segunda vez costuma ser rápida, porque as pastas ficam em cache."
        : e.message);
    } finally { clearTimeout(corta); setCarregando(false); }
  }

  async function gravar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/inspecoes/dimensional", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: op.numero, escopo, marcas: sel, salvar: true, titulo, inspetor, linhas: previa.linhas }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      alert(
        `Relatório ${j.relatorio.codigo} criado.\n\n` +
        (j.vinculo?.vinculado ? `Entrou na seção ${j.vinculo.secao} do data book.` : `⚠ Não entrou no data book: ${j.vinculo?.motivo || "seção não encontrada"}.`)
      );
      onPronto();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-torg-dark">Novo relatório dimensional</p>
            <p className="text-[11px] text-torg-gray">As dimensões de projeto vêm do desenho; as encontradas ficam para o elaborador.</p>
          </div>
          <button onClick={onFechar} className="text-torg-gray hover:text-torg-dark"><X size={18} /></button>
        </div>

        <div className="flex-1 grid lg:grid-cols-[380px_1fr] min-h-0">
          {/* ── escolhas ─────────────────────────────────────────────────────── */}
          <div className="border-r border-gray-100 overflow-y-auto p-4 space-y-3">
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

            {op && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-torg-gray">
                    {escopo === "CONJUNTO" ? "Conjunto" : "Peças"} {sel.length ? `· ${sel.length} selecionada(s)` : ""}
                  </span>
                  {sel.length > 0 && <button onClick={() => setSel([])} className="text-[10px] text-torg-blue hover:underline">limpar</button>}
                </div>
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
              </div>
            )}

            <label className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Inspetor</span>
              <input value={inspetor} onChange={(e) => setInspetor(e.target.value)}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            </label>
            <label className="block">
              <span className="block text-[10px] font-semibold text-torg-gray mb-0.5">Título (opcional)</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                className="w-full text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
            </label>

            <button onClick={montar} disabled={carregando || !sel.length}
              className="w-full text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
              {carregando ? <Loader2 size={13} className="animate-spin" /> : <Ruler size={13} />} Gerar prévia
            </button>

            {previa?.erros?.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                {previa.erros.map((e, i) => <p key={i} className="text-[11px] text-amber-800">{e}</p>)}
              </div>
            )}
            {previa && (
              <p className="text-[11px] text-torg-gray">
                {previa.linhas.length} linha(s) · {previa.desenhos.length} desenho(s) · tolerâncias conforme {previa.tolerancia}
              </p>
            )}
          </div>

          {/* ── a folha ──────────────────────────────────────────────────────── */}
          <div className="min-h-0 flex flex-col bg-gray-50">
            {pdfUrl ? (
              <iframe src={pdfUrl} title="Prévia do relatório" className="flex-1 w-full" style={{ border: "none" }} />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <p className="text-[13px] text-torg-gray max-w-xs">
                  {carregando
                    ? `montando a folha… ${segundos}s${segundos > 12 ? " (a primeira peça da OP demora mais: o portal varre o servidor)" : ""}`
                    : "Escolha a OP e a peça e toque em “Gerar prévia” — a folha aparece aqui, igual à que vai para o data book."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onFechar} className="text-[12px] text-torg-gray px-3 py-1.5">Cancelar</button>
          <button onClick={gravar} disabled={!previa?.linhas?.length || salvando}
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
