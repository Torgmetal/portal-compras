"use client";

// ─── SINCRONIZAR AGORA ───────────────────────────────────────────────────────
//
// Matheus (17/09/2026): "para quando eu receber alguns pedidos e quiser sincronizar eu conseguir
// sem precisar esperar o cron". Os crons rodam 7h20 (encerrados) e 8/11/14/17h (entregas) — quem
// dá entrada numa NF às 11h05 esperaria três horas para a tela parar de cobrar aquele pedido.
//
// ⚠⚠ O RESULTADO FICA NA TELA ATÉ ALGUÉM FECHAR, não é um toast. "Nada mudou" é a resposta mais
// comum e a mais importante de ler: some em três segundos e quem clicou conclui que o botão não
// funcionou — e clica de novo, gastando outra rodada de chamadas ao Omie.
//
// ⚠ A conta do que dizer mora em `lib/sincronismo-prazos.js` (`resumoDoSincronismo`); aqui é só
// o desenho e o estado do clique.
import { useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { houveMudanca } from "@/lib/sincronismo-resultado";

const TOM = {
  ok: "bg-emerald-50 border-emerald-200 text-emerald-800",
  nada: "bg-gray-50 border-gray-200 text-torg-gray",
  aviso: "bg-amber-50 border-amber-200 text-amber-800",
  erro: "bg-red-50 border-red-200 text-red-700",
};

const ICONE = { ok: CheckCircle2, nada: CheckCircle2, aviso: Clock, erro: AlertCircle };

export default function BotaoSincronizar({ onPronto }) {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null); // { tom, texto }

  const sincronizar = async () => {
    setRodando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/compras/prazos-rm/sincronizar", { method: "POST" });
      // ⚠ A resposta pode não ser JSON: se a Vercel matar a função no `maxDuration`, vem uma
      // página de erro em HTML e o `.json()` estoura com "Unexpected token 'A'" — erro que não
      // diz nada a quem clicou.
      const j = await res.json().catch(() => null);

      if (res.status === 429) {
        setResultado({ tom: "aviso", texto: j?.error || "Sincronizado há pouco — tente em instantes." });
        return;
      }
      if (!j) throw new Error("A sincronização demorou demais. O cron continua rodando sozinho.");
      if (!res.ok || !j.success) throw new Error(j.error || j.mensagem || "Não foi possível sincronizar.");

      setResultado({ tom: houveMudanca(j) ? "ok" : "nada", texto: j.mensagem });
      // ⚠ Recarrega SEMPRE que deu certo, inclusive quando "nada mudou": outra aba pode ter
      // mexido, e a tela velha ao lado de um "pronto" é o que faz duvidar do botão.
      await onPronto?.();
    } catch (e) {
      setResultado({ tom: "erro", texto: e.message });
    } finally {
      setRodando(false);
    }
  };

  const Icone = resultado ? ICONE[resultado.tom] : null;

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-2">
      <button
        type="button"
        onClick={sincronizar}
        disabled={rodando}
        title="Busca no Omie o que chegou e o que foi encerrado desde a última sincronização"
        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-torg-dark hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <RefreshCw size={15} className={rodando ? "animate-spin" : ""} />
        {rodando ? "Sincronizando com o Omie…" : "Sincronizar"}
      </button>

      {/* ⚠ O aviso de demora aparece SÓ enquanto roda: a varredura fala com o Omie pedido a
          pedido e passa de um minuto com folga (medido: ~110 s contra a produção). Sem ele, quem
          clica acha que travou e vai embora da tela. */}
      {rodando && (
        <span className="text-xs text-torg-gray">Costuma levar cerca de dois minutos.</span>
      )}

      {resultado && !rodando && (
        <div className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 max-w-md ${TOM[resultado.tom]}`}>
          <Icone size={14} className="mt-px shrink-0" />
          <span className="flex-1">{resultado.texto}</span>
          <button type="button" onClick={() => setResultado(null)}
            className="opacity-50 hover:opacity-100 leading-none" aria-label="Fechar">&times;</button>
        </div>
      )}
    </div>
  );
}
