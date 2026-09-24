"use client";
import { useState } from "react";
import { Bot, User, AlertTriangle, Copy, Check, Wrench, ChevronDown, ChevronRight, FileCode2, Info } from "lucide-react";
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
  ler_documento_anexado: "leu a nota anexada",
};

export default function Mensagem({ m }) {
  const [abrir, setAbrir] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const meu = m.papel === "USUARIO";
  const semFonte = (m.avisos ?? []).filter((a) => !a.soDocumento);
  const soDocumento = (m.avisos ?? []).filter((a) => a.soDocumento);

  if (meu) {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-torg-blue px-4 py-2.5 text-sm text-white shadow-sm">
          {m.anexo && (
            <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-0.5 text-[11px]">
              <FileCode2 size={11} />{m.anexo}
            </p>
          )}
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
        {Boolean(semFonte.length) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} />Citação sem fonte</p>
            <p className="mt-1">
              O texto abaixo menciona {semFonte.map((a) => `${a.tipo} ${a.citado}`).join(", ")} sem que isso tenha vindo de
              nenhuma fonte consultada. <strong>Desconsidere esse trecho</strong> — vale o que está nos blocos.
            </p>
          </div>
        )}
        {/* ⚠⚠ O CÓDIGO QUE SÓ EXISTE NA NOTA ANEXADA TEM AVISO PRÓPRIO, em âmbar e não em vermelho. Ele
            pode estar sendo TRANSCRITO ("a nota foi emitida com o 5.915") — legítimo — ou RECOMENDADO
            ("use o 5.915 no retorno") — o erro que o §16 proíbe. O portal não distingue as duas frases,
            então não acusa de invenção nem cala: diz de onde o código veio e deixa a leitura com a pessoa. */}
        {Boolean(soDocumento.length) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold"><Info size={13} />Vem da nota anexada, não de uma regra</p>
            <p className="mt-1">
              {soDocumento.map((a) => `${a.tipo} ${a.citado}`).join(", ")} aparece{soDocumento.length > 1 ? "m" : ""} na nota que você anexou,
              mas nenhuma regra consultada {soDocumento.length > 1 ? "os" : "o"} recomenda para <strong>esta</strong> operação.
              Se o texto estiver sugerindo usar {soDocumento.length > 1 ? "esses códigos" : "esse código"} na próxima nota, confira antes.
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
