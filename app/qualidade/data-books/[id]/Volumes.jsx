"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Layers, FileDown, Play, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

// ─── O DATA BOOK COMO CONJUNTO DE VOLUMES ─────────────────────────────────────
// Vitor (22/08/2026): "pode ser que teremos data books com até 10 mil páginas".
//
// A geração não cabe num clique: cada chamada a /gerar/continuar fecha UM volume e
// grava o cursor no banco. Esta tela chama em laço enquanto está aberta — e se
// fechar no meio, o cron termina. Por isso o botão é "Gerar volumes" e não "Baixar":
// o download vem depois, de arquivo pronto.

const fmtMB = (b) => (!b ? "—" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

export default function Volumes({ id }) {
  const [estado, setEstado] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");
  // ⚠ o laço tem que parar quando o componente sai da tela, senão continua
  // disparando volume depois que o usuário navegou para outra página.
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/qualidade/data-books/${id}/gerar`);
      const j = await r.json();
      if (r.ok) setEstado(j);
    } catch { /* a tela continua com o último estado conhecido */ }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  // Um volume por chamada, até acabar. Cada volta atualiza a barra.
  const tocar = useCallback(async () => {
    setRodando(true); setErro("");
    try {
      for (let i = 0; i < 200 && vivo.current; i++) {
        const r = await fetch(`/api/qualidade/data-books/${id}/gerar/continuar`, { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Falha ao gerar o volume");
        await carregar();
        if (j.semJob || j.concluido) break;
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      if (vivo.current) { setRodando(false); carregar(); }
    }
  }, [id, carregar]);

  const gerar = useCallback(async () => {
    setRodando(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/data-books/${id}/gerar`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao enfileirar");
      await carregar();
      await tocar();
    } catch (e) {
      setErro(e.message); setRodando(false);
    }
  }, [id, carregar, tocar]);

  const g = estado?.geracao;
  const volumes = estado?.volumes || [];
  const emAndamento = g && (g.status === "NA_FILA" || g.status === "GERANDO");
  const pend = Array.isArray(g?.pendencias) ? g.pendencias : [];
  const pct = g?.totalItens ? Math.min(100, Math.round((g.cursor / g.totalItens) * 100)) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-torg-dark flex items-center gap-2">
            <Layers size={15} className="text-torg-blue" /> Volumes do Data Book
          </h2>
          <p className="text-[11px] text-torg-gray mt-0.5">
            O Volume 01 é o livro (capa, sumário e listas mestras); os seguintes são os anexos.
            É o que o cliente baixa no link de aceite.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {emAndamento && !rodando && (
            <button onClick={tocar}
              title="Continuar a geração de onde parou"
              className="text-[12px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-3 py-1.5 hover:bg-torg-blue-50 inline-flex items-center gap-1.5">
              <Play size={13} /> Continuar
            </button>
          )}
          <button onClick={gerar} disabled={rodando}
            title={volumes.length ? "Refaz todos os volumes desta revisão" : "Monta o data book em volumes"}
            className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
            {rodando ? <Loader2 size={13} className="animate-spin" /> : volumes.length ? <RefreshCw size={13} /> : <Play size={13} />}
            {rodando ? "Gerando…" : volumes.length ? "Gerar de novo" : "Gerar volumes"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {erro}
        </div>
      )}

      {(rodando || emAndamento) && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] text-torg-gray mb-1">
            <span>{g?.etapa || "Preparando…"}</span>
            <span>{fmtNum(g?.cursor)} / {fmtNum(g?.totalItens)} anexos · {fmtNum(g?.paginas)} págs</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-torg-blue transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-torg-gray mt-1">
            Pode fechar esta página: a geração continua sozinha e termina em segundo plano.
          </p>
        </div>
      )}

      {g?.status === "ERRO" && (
        <div className="mb-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          A geração parou: {g.erro}
        </div>
      )}

      {volumes.length > 0 ? (
        <>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {volumes.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-[11px] font-bold text-white bg-torg-dark rounded px-1.5 py-0.5 shrink-0">
                  {String(v.volume).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-torg-dark truncate">{v.titulo || "Anexos"}</p>
                  <p className="text-[10px] text-torg-gray">{fmtNum(v.paginas)} páginas · {fmtMB(v.tamanho)}</p>
                </div>
                <a href={`/api/qualidade/data-books/${id}/volume/${v.volume}?inline=1`} target="_blank" rel="noreferrer"
                  className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 inline-flex items-center gap-1 shrink-0">
                  <FileDown size={12} /> Abrir
                </a>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-torg-gray mt-2 flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-emerald-600" />
            {volumes.length} volume(s) · {fmtNum(estado?.totais?.paginas)} páginas · {fmtMB(estado?.totais?.tamanho)}
          </p>
        </>
      ) : !rodando && !emAndamento && (
        <p className="text-[12px] text-torg-gray">Nenhum volume gerado nesta revisão.</p>
      )}

      {/* ⚠ O QUE NÃO ENTROU APARECE. Data book é documento controlado: anexo que
          falhou tem que estar à vista, não escondido no log. */}
      {pend.length > 0 && (
        <div className="mt-3 text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} /> {pend.length} documento(s) não anexado(s)
          </p>
          <ul className="text-amber-900 space-y-0.5 max-h-32 overflow-y-auto">
            {pend.slice(0, 25).map((p, i) => (
              <li key={i} className="truncate">§{p.secao} · {p.nome} — {p.motivo}</li>
            ))}
          </ul>
          {pend.length > 25 && <p className="text-amber-700 mt-1">… e mais {pend.length - 25}.</p>}
        </div>
      )}
    </div>
  );
}
