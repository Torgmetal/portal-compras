"use client";
import { Loader2, X, FileText, CheckCircle2, Upload, Sparkles } from "lucide-react";

// Bloco de anexar PDF/imagem da proposta e ver o resultado do preenchimento por IA.
export function PropostaUploadIA({
  anexoPendente,
  arquivoNome,
  autoFilled,
  fileRef,
  parseInfo,
  parsing,
  setArquivoNome,
  setAutoFilled,
  setParseInfo,
  setRevisado,
  uploadProposta,
}) {
  return (
    <div className="bg-torg-blue-50/30 border border-torg-blue-100 rounded-lg p-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-1.5">
            <Sparkles size={14} className="text-torg-orange" /> Tem a proposta em PDF ou imagem?
          </p>
          <p className="text-xs text-torg-gray mt-0.5">
            Anexe o arquivo, a IA preenche os preços automaticamente E o arquivo fica salvo na cotação pra consulta.
          </p>
          {anexoPendente && (
            <p className="text-[11px] text-emerald-700 mt-1 inline-flex items-center gap-1">
              <CheckCircle2 size={11} /> Arquivo salvo — será vinculado à cotação ao salvar
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
        >
          {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {parsing ? "Lendo..." : arquivoNome ? "Trocar arquivo" : "Anexar PDF/imagem"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf,image/*"
          className="hidden"
          onChange={(e) => { uploadProposta(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {arquivoNome && (
        <div className="mt-2 flex items-center gap-2 bg-white border border-torg-blue-100 rounded px-2 py-1">
          <FileText size={12} className="text-torg-blue flex-shrink-0" />
          <p className="text-xs text-torg-dark flex-1 truncate">{arquivoNome}</p>
          <button
            type="button"
            onClick={() => { setArquivoNome(""); setParseInfo(null); setAutoFilled(new Set()); }}
            className="text-gray-400 hover:text-red-600"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {/* ⚠⚠ A LEITURA VEIO PELA METADE — E ISSO TEM DE SER A PRIMEIRA COISA QUE SE VÊ. Proposta
          grande estoura o teto de saída da IA e ela para no meio de um item; o portal aproveita o
          que fechou (antes devolvia zero), mas o que fechou NÃO é a proposta inteira. A tarja fica
          acima da contagem de propósito: lida na ordem errada, "47 itens preenchidos" é a frase que
          faz alguém dar a cotação por conferida. */}
      {parseInfo?.parcial && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-bold">⚠ Leitura incompleta — a proposta é maior do que o que foi lido.</p>
          <p className="mt-0.5">
            Vieram <strong>{parseInfo.parcial.lidos}</strong> {parseInfo.parcial.lidos === 1 ? "item" : "itens"} do arquivo.
            {" "}Confira a proposta e preencha à mão o que ficou de fora — ou envie o PDF em partes.
          </p>
        </div>
      )}
      {parseInfo && (
        <div className="mt-2 flex items-center justify-between flex-wrap gap-2 text-xs">
          {parseInfo.match > 0 ? (
            <p className="text-torg-dark">
              ✓ <strong>{parseInfo.match}</strong> {parseInfo.match === 1 ? "item preenchido" : "itens preenchidos"} via IA
              {parseInfo.total > parseInfo.match && (
                <span className="text-torg-gray"> ({parseInfo.total - parseInfo.match} do PDF não casaram — preencha manualmente)</span>
              )}
            </p>
          ) : (
            <p className="text-torg-orange-700">⚠ Lemos o arquivo mas não conseguimos casar os itens. Preencha manualmente.</p>
          )}
          {autoFilled.size > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = Array.from(autoFilled);
                setRevisado((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
                setAutoFilled(new Set());
              }}
              className="px-2 py-1 bg-torg-blue text-white text-xs rounded hover:bg-torg-blue-700 font-medium"
            >
              ✓ Conferi todos ({autoFilled.size})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
