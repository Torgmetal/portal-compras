"use client";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { APARELHOS, ACOPLANTES, BLOCOS_PADRAO, TIPOS_CARREGAMENTO, cabecotesPorFabricante } from "@/lib/us-campos";
import { camposCabecalhoUS, detalhesCabecoteUS, progressoPreenchimentoUS } from "@/lib/us-relatorio";

const obrigatorio = <span className="text-red-600" aria-label="obrigatório"> *</span>;

function Select({ rotulo, valor, opcoes = null, grupos = null, mudar }) {
  return <label className="block"><span className="block text-[12px] font-semibold text-torg-dark mb-1">{rotulo}{obrigatorio}</span>
    <select value={valor || ""} onChange={e => mudar(e.target.value)} className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${valor ? "border-gray-200 focus:border-torg-blue" : "border-amber-300 bg-amber-50"}`}>
      {/* ⚠ `grupos`: a MARCA é o título do grupo, não prefixo de cada opção (Vitor, 22/09/2026) */}
      <option value="">Selecione…</option>{grupos
        ? grupos.map(g => <optgroup key={g.fabricante} label={g.fabricante}>{g.itens.map(i => <option key={`${g.fabricante}-${i.rotulo}`} value={i.rotulo}>{i.rotulo}</option>)}</optgroup>)
        : opcoes.map(o => <option key={o} value={o}>{o}</option>)}
    </select></label>;
}

function Texto({ rotulo, valor, mudar, numero = false, sufixo = "", opcional = false }) {
  return <label className="block"><span className="block text-[12px] font-semibold text-torg-dark mb-1">{rotulo}{opcional ? null : obrigatorio}</span>
    <div className="relative"><input type={numero ? "number" : "text"} inputMode={numero ? "decimal" : undefined} value={valor ?? ""} onChange={e => mudar(e.target.value)}
      className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${sufixo ? "pr-14" : ""} ${opcional || (valor !== "" && valor != null) ? "border-gray-200 focus:border-torg-blue" : "border-amber-300 bg-amber-50"}`} />
      {sufixo && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-torg-gray">{sufixo}</span>}</div></label>;
}

function Secao({ numero, titulo, ajuda, children }) {
  return <section className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm">
    <div className="flex gap-2.5 mb-3"><span className="w-7 h-7 rounded-full bg-torg-blue text-white text-sm font-bold flex items-center justify-center shrink-0">{numero}</span>
      <div><h3 className="text-[14px] font-bold text-torg-dark leading-tight">{titulo}</h3>{ajuda && <p className="text-[11px] text-torg-gray mt-0.5">{ajuda}</p>}</div></div>
    <div className="space-y-3">{children}</div>
  </section>;
}

export default function FormularioUSCampo({ rel, cond, setCond }) {
  const cabecalho = camposCabecalhoUS(rel);
  const cabecote = detalhesCabecoteUS(cond.cbModelo);
  const progresso = progressoPreenchimentoUS(cond);
  const mudar = (campo) => (valor) => setCond(c => ({ ...c, [campo]: valor }));
  return <div className="mt-3 space-y-3">
    <div className={`rounded-xl border px-3 py-2.5 ${progresso.faltando.length ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
      <p className={`text-[13px] font-bold flex items-center gap-1.5 ${progresso.faltando.length ? "text-amber-900" : "text-emerald-800"}`}>
        {progresso.faltando.length ? <AlertCircle size={15}/> : <CheckCircle2 size={15}/>} Preenchimento: {progresso.preenchidos} de {progresso.total}
      </p>
      {progresso.faltando.length > 0 && <p className="text-[11px] text-amber-800 mt-1">Falta: {progresso.faltando.join(" · ")}</p>}
    </div>

    <Secao numero="1" titulo="Identificação e documentos" ajuda="Confira antes de iniciar o ensaio.">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] text-torg-gray">PEÇA / TAG</p><p className="text-[13px] font-bold font-mono text-torg-dark">{cabecalho.tag || "—"}</p></div>
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] text-torg-gray">NORMA</p><p className="text-[13px] font-bold text-torg-dark">{cabecalho.norma}</p></div>
      </div>
      <div className="rounded-lg bg-torg-blue/5 border border-torg-blue/20 p-2"><p className="text-[10px] text-torg-gray">PROCEDIMENTO</p><p className="text-[13px] font-semibold text-torg-dark">{cabecalho.procedimento}</p><p className="text-[10px] text-torg-gray mt-0.5">Critério: {cabecalho.criterio}</p></div>
    </Secao>

    <Secao numero="2" titulo="Aparelho" ajuda="Identifique o aparelho de ultrassom utilizado.">
      <Select rotulo="Modelo do aparelho" valor={cond.apModelo} opcoes={APARELHOS} mudar={mudar("apModelo")} />
      <Texto rotulo="Número de série do aparelho" valor={cond.apSerie} mudar={mudar("apSerie")} />
    </Secao>

    <Secao numero="3" titulo="Cabeçote" ajuda="Escolha o conjunto completo; dimensão e frequência aparecem abaixo.">
      <Select rotulo="Modelo, ângulo e frequência" valor={cond.cbModelo} grupos={cabecotesPorFabricante()}
        mudar={(v) => setCond(c => ({ ...c, cbModelo: v, cbFabricante: cabecotesPorFabricante().find(g => g.itens.some(i => i.rotulo === v))?.fabricante || "" }))} />
      {cond.cbModelo && <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[9px] text-torg-gray">MODELO</p><p className="text-[11px] font-bold">{cabecote.modelo || "—"}</p></div>
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[9px] text-torg-gray">DIMENSÃO</p><p className="text-[11px] font-bold">{cabecote.dimensoes || "—"}</p></div>
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[9px] text-torg-gray">FREQUÊNCIA</p><p className="text-[11px] font-bold">{cabecote.frequencia || "—"}</p></div>
      </div>}
      <Texto rotulo="Número de série do cabeçote" valor={cond.cbSerie} mudar={mudar("cbSerie")} />
      <Texto rotulo="Ângulo real medido" valor={cond.cbAngulo} mudar={mudar("cbAngulo")} numero sufixo="graus" />
    </Secao>

    <Secao numero="4" titulo="Condições do ensaio" ajuda="Registre como o ensaio foi executado.">
      <Select rotulo="Tipo de estrutura" valor={cond.carregamento} opcoes={TIPOS_CARREGAMENTO.map(t => t.nome)} mudar={mudar("carregamento")} />
      <Texto rotulo="Local do ensaio" valor={cond.local} mudar={mudar("local")} />
      <Select rotulo="Acoplante" valor={cond.acoplante} opcoes={ACOPLANTES} mudar={mudar("acoplante")} />
      <Select rotulo="Bloco padrão" valor={cond.blocoPadrao} opcoes={BLOCOS_PADRAO} mudar={mudar("blocoPadrao")} />
      <Texto rotulo="Ganho de varredura" valor={cond.ganhoVarredura} mudar={mudar("ganhoVarredura")} numero sufixo="dB" />
    </Secao>

    {/* ⚠ Campos que o PDF do RUS já imprimia sem ter onde preencher (Vitor, 22/09/2026: "não tenho
        campo para informar o processo de soldagem"). Opcionais: nem todo ensaio é de junta soldada,
        e o progresso acima continua contando só o que o PI-QUA-003 exige. */}
    <Secao numero="5" titulo="A junta ensaiada" ajuda="Opcional — sai no cabeçalho do relatório.">
      <Texto rotulo="Processo de soldagem" valor={cond.processoSolda} mudar={mudar("processoSolda")} opcional />
      <Texto rotulo="Metal de adição" valor={cond.metalAdicao} mudar={mudar("metalAdicao")} opcional />
      <Texto rotulo="Tipo de junta" valor={cond.tipoJunta} mudar={mudar("tipoJunta")} opcional />
      <Texto rotulo="Tipo de chanfro" valor={cond.chanfro} mudar={mudar("chanfro")} opcional />
      <Texto rotulo="Técnica de ensaio" valor={cond.tecnica} mudar={mudar("tecnica")} opcional />
    </Secao>
  </div>;
}
