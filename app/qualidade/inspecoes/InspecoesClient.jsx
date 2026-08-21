"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Loader2, ArrowLeft, Camera, FileText, Check, Send, AlertCircle,
  ChevronRight, ExternalLink, Plus, X, ShieldCheck,
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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Link href="/qualidade" className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 mb-3"><ArrowLeft size={13} /> Qualidade</Link>
      <h1 className="text-xl font-extrabold text-torg-dark tracking-tight">Inspeções</h1>
      <p className="text-[13px] text-torg-gray mt-0.5">
        O que a fábrica registrou pelo celular, virando relatório numerado e assinado.
      </p>

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
              <button onClick={() => setMontando(g)}
                className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                <Plus size={13} /> Montar relatório
              </button>
            </div>
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
              {g.fotos.slice(0, 14).map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f.id} src={f.url} alt={f.marca || "foto"} title={`${f.marca || "sem peça"} · ${f.autorNome || ""}`}
                  className="h-14 w-14 object-cover rounded shrink-0 border border-gray-100" />
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
          <p className="font-semibold text-torg-dark text-sm">
            <span className="font-mono">{r.codigo}</span> · OP-{r.opNumero} · {TIPO_LABEL[r.tipo] || r.tipo}
          </p>
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
