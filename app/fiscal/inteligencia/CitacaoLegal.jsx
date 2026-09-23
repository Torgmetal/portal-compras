"use client";
import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";

// ─── A CITAÇÃO VERIFICÁVEL ───────────────────────────────────────────────────
//
// ⚠⚠ ISTO É O QUE SEPARA "FUNDAMENTO" DE "FRASE QUE EU ESCREVI". Briefing de auditoria
// (22/09/2026): *"toda recomendação fiscal deverá possuir condições identificadas, documentos
// necessários e fundamento legal verificável"* e *"não considere um texto produzido por IA como
// fundamento jurídico"*. Clicando no fundamento, a tela mostra o **texto oficial guardado no
// banco**, com o rótulo do dispositivo, o hash da versão e a data da coleta.
//
// ⚠ Carrega sob demanda, não junto do resultado: a cadeia do art. 406 tem 5 documentos, e trazer
// o texto integral de todos em toda simulação seria despejar a lei inteira numa tela de operação.

export default function CitacaoLegal({ fundamento, cita, citaTambem }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const refs = [cita, citaTambem].filter(Boolean);
  if (!refs.length) return <p className="mt-0.5 text-[11px] text-torg-blue">{fundamento}</p>;

  async function abrir() {
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    if (dados || carregando) return;
    setCarregando(true);
    try {
      const rs = await Promise.all(refs.map(async (r) => {
        const resp = await fetch(`/api/fiscal/inteligencia/legislacao?norma=${encodeURIComponent(r.norma)}&rotulo=${encodeURIComponent(r.rotulo)}`);
        const d = await resp.json().catch(() => null);
        // ⚠⚠ "NÃO ACHEI O TEXTO" É RESULTADO, NÃO SILÊNCIO. Se a norma ainda não foi coletada, a
        // tela tem de dizer isso — senão o fundamento parece conferido quando não foi.
        if (!resp.ok || !d?.success) return { rotulo: r.rotulo, erro: d?.error || `HTTP ${resp.status}` };
        return { ...d.dispositivo, ressalva: d.ressalva };
      }));
      setDados(rs);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mt-0.5">
      <button type="button" onClick={abrir}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-torg-blue hover:underline">
        <BookOpen size={11} />
        {fundamento}
        {carregando && <Loader2 size={11} className="animate-spin" />}
      </button>

      {aberto && (
        <div className="mt-1 space-y-1.5 rounded-lg border border-gray-200 bg-white p-2.5">
          {erro && <p className="text-xs text-amber-700">Não foi possível carregar o texto: {erro}</p>}
          {(dados ?? []).map((d) => (
            <div key={d.rotulo}>
              {d.erro ? (
                <p className="text-xs text-amber-700">
                  <strong>{d.rotulo}</strong> — texto ainda não coletado no portal ({d.erro}). O fundamento acima <strong>não está conferido</strong> contra a fonte.
                </p>
              ) : (
                <>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-torg-dark">{d.rotulo}</span>
                    <span className="text-torg-gray">· {d.titulo}</span>
                    {/* ⚠⚠ O PESO FICA À VISTA: uma Resposta à Consulta não vincula outros
                        contribuintes, e isso não pode virar rodapé. */}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      d.peso === "VINCULANTE" ? "bg-torg-blue/10 text-torg-blue" : "bg-amber-50 text-amber-700"}`}>
                      {d.peso}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs leading-snug text-torg-dark">{d.texto}</p>
                  {d.ressalva && <p className="mt-1 text-[11px] text-amber-700">⚠ {d.ressalva}</p>}
                  {/* ⚠ Hash e data são a PROCEDÊNCIA: dizem contra qual versão do texto o portal
                      está falando, e quando ele a viu. */}
                  <p className="mt-1 text-[10px] text-torg-gray">
                    Coletado de <a href={d.url} target="_blank" rel="noreferrer" className="underline">{d.url}</a>
                    {" · sha256 "}<span className="font-mono">{d.sha256.slice(0, 12)}</span>
                    {" · "}{new Date(d.coletadoEm).toLocaleDateString("pt-BR")}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
