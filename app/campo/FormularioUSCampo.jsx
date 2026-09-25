"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { TIPOS_CARREGAMENTO, CAMPOS_CABECALHO_US, GRUPOS_CABECALHO_US } from "@/lib/us-campos";
import { camposCabecalhoUS, progressoPreenchimentoUS, ehObrigatorioUS } from "@/lib/us-relatorio";

const obrigatorio = <span className="text-red-600" aria-label="obrigatório"> *</span>;

function Select({ rotulo, valor, opcoes, mudar }) {
  return <label className="block"><span className="block text-[12px] font-semibold text-torg-dark mb-1">{rotulo}{obrigatorio}</span>
    <select value={valor || ""} onChange={e => mudar(e.target.value)} className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${valor ? "border-gray-200 focus:border-torg-blue" : "border-amber-300 bg-amber-50"}`}>
      <option value="">Selecione…</option>
      {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
    </select></label>;
}

/**
 * Campo de texto com a lista da casa como SUGESTÃO (Vitor, 25/09/2026: "todos os campos precisamos
 * deixar para ser possível ajustar"). Escolhe-se da lista ou digita-se outro valor — chanfro "K",
 * processo "SMAW". Vazio, mostra apagado o que vai sair no PDF (`padrao`).
 */
// o campo exigido e vazio fica âmbar, como os outros obrigatórios do celular
const bordaDoCampo = (exigido, valor) => (!exigido || (valor !== "" && valor != null) ? "border-gray-200 focus:border-torg-blue" : "border-amber-300 bg-amber-50");

function Sugestoes({ id, sugestoes, rotulos }) {
  if (!sugestoes) return null;
  return <datalist id={id}>{sugestoes.map(s => <option key={s} value={s}>{rotulos?.[s] || null}</option>)}</datalist>;
}

// campo com unidade (graus, dB) é numérico, e a unidade fica dentro da caixa
const tipoDoCampo = (sufixo) => (sufixo ? { type: "number", inputMode: "decimal" } : { type: "text" });
function Unidade({ sufixo }) {
  return sufixo ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-torg-gray">{sufixo}</span> : null;
}

function Livre({ id, rotulo, valor, mudar, sugestoes = null, rotulos = null, padrao = "", sufixo = "", exigido = false }) {
  return <label className="block"><span className="block text-[12px] font-semibold text-torg-dark mb-1">{rotulo}{exigido && obrigatorio}</span>
    <div className="relative"><input {...tipoDoCampo(sufixo)} list={sugestoes && id}
      value={valor ?? ""} placeholder={padrao} onChange={e => mudar(e.target.value)}
      className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none placeholder:text-gray-400 ${sufixo && "pr-14"} ${bordaDoCampo(exigido, valor)}`} />
      <Unidade sufixo={sufixo} /></div>
    <Sugestoes id={id} sugestoes={sugestoes} rotulos={rotulos} />
  </label>;
}

function Secao({ numero, titulo, ajuda, children }) {
  return <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
    <div className="flex gap-2.5 mb-3"><span className="w-7 h-7 rounded-full bg-torg-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{numero}</span>
      <div><h3 className="text-[14px] font-bold text-torg-dark leading-tight">{titulo}</h3>{ajuda && <p className="text-[11px] text-torg-gray mt-0.5">{ajuda}</p>}</div></div>
    <div className="space-y-3">{children}</div>
  </section>;
}

const AJUDA = {
  identificacao: "Vazio, sai o que aparece apagado no campo.",
  aparelho: "Identifique o aparelho de ultrassom utilizado.",
  cabecote: "Escolha da lista ou digite; dimensão e frequência saem do modelo quando ficam vazias.",
  ensaio: "Registre como o ensaio foi executado.",
  junta: "Sai no cabeçalho do relatório.",
};

/**
 * O CABEÇALHO DO ULTRASSOM NO CELULAR — todo campo que o PDF imprime (`CAMPOS_CABECALHO_US`).
 *
 * ⚠⚠ Vitor (25/09/2026): "no campo de desenho e metal de adição não está sendo possível preencher
 * (…) tipo de chanfro tbm, todos os campos precisamos deixar para ser possível ajustar". O celular
 * não tinha desenho, material nem espessura, e o chanfro e o processo eram listas fechadas.
 */
export default function FormularioUSCampo({ rel, cond, setCond }) {
  const efetivo = camposCabecalhoUS({ ...rel, resultados: { ...(rel?.resultados || {}), ...cond } });
  const progresso = progressoPreenchimentoUS(cond);
  const mudar = (campo) => (valor) => setCond(c => ({ ...c, [campo]: valor }));
  return <div className="mt-3 space-y-3">
    <div className={`rounded-xl border px-3 py-2.5 ${progresso.faltando.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
      <p className={`text-[13px] font-bold flex items-center gap-1.5 ${progresso.faltando.length ? "text-amber-900" : "text-emerald-800"}`}>
        {progresso.faltando.length ? <AlertCircle size={15}/> : <CheckCircle2 size={15}/>} Preenchimento: {progresso.preenchidos} de {progresso.total}
      </p>
      {progresso.faltando.length > 0 && <p className="text-[11px] text-amber-800 mt-1">Falta: {progresso.faltando.join(" · ")}</p>}
    </div>

    {GRUPOS_CABECALHO_US.map((g, i) => (
      <Secao key={g.id} numero={String(i + 1)} titulo={g.titulo} ajuda={AJUDA[g.id]}>
        {g.id === "ensaio" && <>
          {/* ⚠ obrigatório pelo item 18.1 do PI-QUA-003, e o critério muda com ele (15.6 × 15.7) */}
          <Select rotulo="Tipo de estrutura" valor={cond.carregamento} opcoes={TIPOS_CARREGAMENTO.map(t => t.nome)} mudar={mudar("carregamento")} />
          <Livre id="us-campo-ganho" rotulo="Ganho de varredura" valor={cond.ganhoVarredura} mudar={mudar("ganhoVarredura")} sufixo="dB" exigido />
        </>}
        {CAMPOS_CABECALHO_US.filter(c => c.grupo === g.id).map(c => (
          <Livre key={c.k} id={`us-campo-${c.k}`} rotulo={c.rotulo} valor={cond[c.k]} mudar={mudar(c.k)}
            sugestoes={c.sugestoes} rotulos={c.rotulos} padrao={cond[c.k] ? "" : efetivo[c.k] || ""}
            sufixo={c.k === "cbAngulo" ? "graus" : ""} exigido={ehObrigatorioUS(c.k)} />
        ))}
      </Secao>
    ))}
  </div>;
}
