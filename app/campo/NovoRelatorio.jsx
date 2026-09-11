"use client";
import { useState, useEffect } from "react";
import { Loader2, Check, Plus } from "lucide-react";
import QuantidadesPecas from "./QuantidadesPecas";
import {usaQuantidadeInspecao, pecasInformadasSchema} from "@/lib/inspecao-pecas";
import { TIPOS_RELATORIO, usaCotas } from "@/lib/qualidade-campo";

// ─── CRIAR O RELATÓRIO PELO CELULAR ───────────────────────────────────────────
// Vitor (22/08/2026): "podemos deixar ele criar relatórios do celular dele, sem a
// necessidade de alguém criar antes — apenas o de dimensional que ele seleciona a peça,
// e se caso precisar o responsável da nossa parte limpa as cotas que precisa".
//
// Antes o relatório nascia no computador e o inspetor só preenchia: ele chegava na peça
// e esperava alguém abrir o documento. Agora abre ele mesmo. Criar não é emitir — quem
// confere e manda para assinatura continua sendo a Qualidade.
//
// ⚠ SÓ OS TIPOS DA OBRA. A lista vem do escopo de qualidade da OP (`op.tipos`), o mesmo
// que já filtra o resto do portal de campo: obra que só faz certificado e pintura não
// oferece ultrassom nem por engano.
export default function NovoRelatorio({ op, onCriado, onSair, Tela }) {
  const [tipo, setTipo] = useState(null);
  const [pecas, setPecas] = useState(null);
  const [q, setQ] = useState("");
  const [quantidades, setQuantidades] = useState({});
  const [erroBusca, setErroBusca] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [sel, setSel] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const tipos = TIPOS_RELATORIO.filter((t) => !op.tipos || op.tipos.includes(t.id));

  useEffect(() => {
    if (!tipo) { setPecas(null); return; }
    let vivo = true;
    setPecas(null); setErroBusca("");
    const t = setTimeout(() => {
      fetch(`/api/campo/pecas?opId=${op.id}&q=${encodeURIComponent(q)}&todas=1`)
        .then(async r => {const j=await r.json(); if(!r.ok) throw new Error(j.error || "Erro ao buscar peças."); return j;}).then(j => {if(vivo){setPecas(j.pecas || []);setTemMais(!!j.temMais);}})
        .catch(e => {if(vivo){setPecas([]);setErroBusca(e.message);}});
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [tipo, op.id, q, tentativa]);

  const comQuantidade = usaQuantidadeInspecao(tipo);
  const selecionadas = sel.map(marca => ({marca, quantidade: quantidades[marca] ?? ""}));

  async function criar() {
    if (!sel.length) { setErro("Escolha ao menos uma peça."); return; }
    let pecasInformadas;
    if (comQuantidade) {
      const v = pecasInformadasSchema.safeParse(selecionadas.map(p=>({...p,quantidade:Number(p.quantidade)})));
      if(!v.success){setErro(v.error.issues[0].message);return;}
      pecasInformadas=v.data;
    }
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/qualidade/inspecoes/dimensional", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: op.numero, tipo, escopo: "AVULSAS", marcas: sel, pecasInformadas }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao criar.");
      onCriado?.(j.relatorio);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  // ── passo 1: o tipo ──
  if (!tipo) {
    return (
      <Tela titulo="Novo relatório" sub={`OP-${op.numero}`} voltar={onSair}>
        <p className="text-sm text-torg-gray mb-3">Que inspeção você vai fazer?</p>
        <div className="space-y-2">
          {tipos.map((t) => (
            <button key={t.id} onClick={() => { setTipo(t.id); setSel([]); setQuantidades({}); }}
              className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 active:bg-gray-50">
              <span className="block text-base font-semibold text-torg-dark">{t.label}</span>
              <span className="block text-[12px] text-torg-gray font-mono">{t.sigla}</span>
            </button>
          ))}
          {!tipos.length && (
            <p className="text-sm text-torg-gray">
              Esta obra não tem relatório de inspeção previsto no escopo de qualidade.
            </p>
          )}
        </div>
      </Tela>
    );
  }

  // ── passo 2: a peça ──
  const rotulo = TIPOS_RELATORIO.find((t) => t.id === tipo)?.label || tipo;
  return (
    <Tela titulo={rotulo} sub={`OP-${op.numero}`} voltar={() => setTipo(null)}>
      {/* ⚠ o dimensional nasce com as cotas do desenho; os demais, com a peça. Em todos, a
          Qualidade ajusta depois no computador — "se caso precisar o responsável da nossa parte
          limpa as cotas que precisa". */}
      <p className="text-sm text-torg-gray mb-2">
        {usaCotas(tipo) ? "Escolha a peça — as cotas vêm do desenho." : "Escolha a peça ou o conjunto."}
      </p>

      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {sel.map((m) => (
            <span key={m} className="text-[13px] font-semibold text-torg-dark bg-torg-blue/10 border border-torg-blue-200 rounded-lg px-2 py-1">
              {m}
            </span>
          ))}
        </div>
      )}

      {comQuantidade && sel.length > 0 && <QuantidadesPecas pecas={selecionadas} onChange={ps=>setQuantidades(Object.fromEntries(ps.map(p=>[p.marca,p.quantidade])))} disabled={salvando} />}
      {erroBusca && <p className="text-sm text-red-600">{erroBusca} <button onClick={()=>setTentativa(v=>v+1)} className="min-h-11 underline">Tentar novamente</button></p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar marca…"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        className="w-full text-base font-mono border-2 border-gray-200 rounded-xl px-3 py-3 mb-2 focus:border-torg-blue outline-none" />

      <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
        {pecas === null && (
          <p className="p-3 text-sm text-torg-gray inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> buscando…
          </p>
        )}
        {pecas?.slice(0, 80).map((p) => {
          const on = sel.includes(p.marca);
          return (
            <button key={p.marca} disabled={salvando} onClick={() => {setSel(s => on ? s.filter(x=>x!==p.marca) : [...s,p.marca]); if(!on) setQuantidades(v=>({...v,[p.marca]:v[p.marca] ?? (p.quantidade || "")}));}}
              className={`w-full text-left px-3 py-3 border-b border-gray-100 last:border-0 flex items-center gap-2 ${on ? "bg-torg-blue/10" : "active:bg-gray-50"}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>
                {on && <Check size={11} className="text-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-mono font-semibold text-torg-dark">{p.marca}</span>
                {comQuantidade && <span className="block text-sm text-torg-blue">{p.quantidade || "Sem quantidade na lista"}{p.quantidade ? " peças na lista" : ""}</span>}
                {p.descricao && <span className="block text-[12px] text-torg-gray truncate">{p.descricao}</span>}
              </span>
            </button>
          );
        })}
        {pecas && !pecas.length && <p className="p-3 text-sm text-torg-gray">Nenhuma peça encontrada.</p>}
      </div>

      {temMais && <p className="text-xs text-torg-gray mb-2">Mostrando as primeiras 60 marcas. Use a busca para localizar outras.</p>}
      {erro && <p className="text-[13px] text-red-600 mb-2">{erro}</p>}

      <button onClick={criar} disabled={salvando || !sel.length}
        className="w-full bg-torg-blue text-white active:bg-torg-dark rounded-xl py-4 text-[16px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
        {salvando ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
        Criar e começar a preencher
      </button>
    </Tela>
  );
}
