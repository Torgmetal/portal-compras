"use client";
import { useState } from "react";
import { Bot, User, AlertTriangle, Copy, Check, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import TextoFormatado from "./TextoFormatado";
import BlocoFiscal from "./BlocoFiscal";

const ROTULO_FERRAMENTA = {
  consultar_ncm: "consultou a TIPI",
  buscar_ncm: "procurou o NCM pela descrição",
  consultar_cfop: "consultou a tabela de CFOP",
  buscar_legislacao: "procurou o fundamento legal",
  consultar_regra_e_situacao: "conferiu a situação da regra",
  simular_operacao: "simulou a operação",
  consultar_classificacao: "consultou o registro de classificação",
};

export default function Mensagem({ m }) {
  const [abrir, setAbrir] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const meu = m.papel === "USUARIO";

  if (meu) {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-torg-blue px-4 py-2.5 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{m.conteudo}</p>
        </div>
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-torg-dark/10 text-torg-dark"><User size={14} /></span>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-torg-blue/10 text-torg-blue"><Bot size={15} /></span>
      <div className="min-w-0 flex-1 space-y-2">
        {/* ⚠⚠ INTERROMPIDA É UM ESTADO VISÍVEL. Sem isto, a execução que morreu no meio ficaria
            indistinguível de uma resposta curta — e ninguém saberia que pode perguntar de novo. */}
        {m.estado === "EM_ANDAMENTO" && <p className="text-sm italic text-torg-gray">Consultando…</p>}
        {(m.estado === "INTERROMPIDA" || m.estado === "FALHOU") && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{m.erro || "A resposta não chegou a ser produzida. Pergunte de novo."}</span>
          </p>
        )}

        {/* ⚠⚠⚠ A TARJA DE CITAÇÃO SEM LASTRO. É o resultado de `conferirProsa`: o portal conferiu o
            que o modelo escreveu contra as fontes que ele consultou, e este número não estava lá. */}
        {Boolean(m.avisos?.length) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} />Citação sem fonte</p>
            <p className="mt-1">
              O texto abaixo menciona {m.avisos.map((a) => `${a.tipo} ${a.citado}`).join(", ")} sem que isso tenha vindo de
              nenhuma fonte consultada. <strong>Desconsidere esse trecho</strong> — vale o que está nos blocos.
            </p>
          </div>
        )}

        {m.conteudo && (
          <div className="group rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
            <TextoFormatado texto={m.conteudo} />
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(m.conteudo).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1600); }); }}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-torg-gray opacity-0 transition hover:text-torg-dark group-hover:opacity-100"
            >
              {copiado ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}{copiado ? "copiado" : "copiar resposta"}
            </button>
          </div>
        )}

        {(m.blocos ?? []).map((b, i) => <BlocoFiscal key={i} bloco={b} />)}

        {/* ⚠ O QUE FOI CONSULTADO FICA À VISTA, recolhido. É o §22 na tela: quem lê precisa poder
            ver que a resposta passou pela TIPI e pela legislação, não só acreditar. */}
        {Boolean(m.ferramentas?.length) && (
          <div>
            <button type="button" onClick={() => setAbrir((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-torg-gray hover:text-torg-dark">
              {abrir ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Wrench size={11} />
              {m.ferramentas.length} consulta{m.ferramentas.length > 1 ? "s" : ""} à base fiscal
            </button>
            {abrir && (
              <ul className="mt-1 space-y-0.5 pl-5 text-[11px] text-torg-gray">
                {m.ferramentas.map((f, i) => {
                  const nome = typeof f === "string" ? f : f.nome;
                  return <li key={i}>· {ROTULO_FERRAMENTA[nome] ?? nome}</li>;
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
