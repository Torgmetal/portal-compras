"use client";
import { useState } from "react";
import { Ban, Copy, Check, Info, ExternalLink } from "lucide-react";

// ─── O BLOCO QUE O SERVIDOR RENDERIZOU ───────────────────────────────────────
//
// ⚠⚠ ISTO NÃO É "FORMATAÇÃO BONITA DA RESPOSTA" — É A AFIRMAÇÃO FISCAL. O CFOP, a alíquota e o
// texto legal saem daqui, do resultado estruturado da ferramenta, e não da prosa do modelo. É a
// fronteira que o parecer do Codex exigiu: *"renderize os trechos fiscais decisivos a partir desses
// resultados, com valores e citações preenchidos pelo servidor"*.
//
// ⚠⚠ A RESSALVA FICA DENTRO DA LINHA, colada no valor. Ressalva em rodapé é ressalva que ninguém
// lê — e quem copia o CFOP copia justamente a linha.

const CORES = {
  NCM: "border-torg-blue/20 bg-torg-blue/5",
  CFOP: "border-torg-blue/20 bg-torg-blue/5",
  LEGISLACAO: "border-violet-200 bg-violet-50/60",
  REGRA: "border-amber-200 bg-amber-50/60",
  SIMULACAO: "border-emerald-200 bg-emerald-50/50",
  CLASSIFICACAO: "border-gray-200 bg-gray-50",
  CADEIA: "border-gray-200 bg-gray-50",
};

function Copiar({ texto }) {
  const [feito, setFeito] = useState(false);
  if (!texto) return null;
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setFeito(true); setTimeout(() => setFeito(false), 1600); }); }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-torg-gray transition hover:bg-white hover:text-torg-dark"
      title="Copiar"
    >
      {feito ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      {feito ? "copiado" : "copiar"}
    </button>
  );
}

export default function BlocoFiscal({ bloco }) {
  if (!bloco) return null;
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${CORES[bloco.tipo] ?? "border-gray-200 bg-gray-50"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-torg-dark">{bloco.titulo}</p>
        <Copiar texto={(bloco.linhas ?? []).map((l) => `${l.rotulo}: ${l.valor}`).join("\n")} />
      </div>

      {/* ⚠⚠ O BLOQUEIO VEM ANTES DO CONTEÚDO. Se a contabilidade contestou a regra, quem lê precisa
          saber disso ANTES de bater o olho no CFOP e copiar. */}
      {bloco.bloqueio && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
          <Ban size={13} className="mt-0.5 shrink-0" />
          <span>{bloco.bloqueio}</span>
        </p>
      )}

      <dl className="space-y-1.5">
        {(bloco.linhas ?? []).map((l, i) => (
          <div key={i} className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-torg-gray/80">{l.rotulo}</dt>
            <dd className="text-sm text-torg-dark">
              <span className="whitespace-pre-wrap">{l.valor}</span>
              {l.ressalva && (
                <span className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-amber-700">
                  <Info size={11} className="mt-0.5 shrink-0" />{l.ressalva}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {bloco.aviso && <p className="mt-2 border-t border-black/5 pt-2 text-[11px] text-torg-gray">{bloco.aviso}</p>}

      {/* ⚠ A FONTE SEMPRE À VISTA, com o sha do arquivo: é o que permite conferir que o portal leu
          o documento que diz ter lido. */}
      {Boolean(bloco.fontes?.length) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/5 pt-2 text-[11px] text-torg-gray">
          {bloco.fontes.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {f.url
                ? <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-torg-blue hover:underline">{f.rotulo}<ExternalLink size={10} /></a>
                : <span>{f.rotulo}</span>}
              {f.sha256 && <span className="font-mono text-[10px] text-gray-400">sha {String(f.sha256).slice(0, 10)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
