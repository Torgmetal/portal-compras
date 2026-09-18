"use client";

// ─── A DATA QUE O FORNECEDOR PROPÔS, ESPERANDO COMPRAS ───────────────────────
//
// Matheus (18/09/2026): "sim, o Compras precisa aprovar a alteração depois".
//
// ⚠⚠ ARQUIVO PRÓPRIO, e não mais um bloco dentro do `CartaoRM`. Este é o único pedaço da tela que
// ESCREVE — tem estado, chamada e erro próprios; o resto do cartão é desenho puro. Misturado lá,
// o cartão passaria do teto de 350 linhas e ganharia um motivo de re-renderizar que nada mais
// tem.
import { useState } from "react";
import { Loader2, Check, X, CalendarClock } from "lucide-react";
import { useStore } from "@/lib/store";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtEm = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default function PropostaDePrazo({ pedido, onDecidido }) {
  const proposta = pedido.propostaPendente;
  const { showToast } = useStore();
  const [enviando, setEnviando] = useState(null); // "aprovar" | "recusar"
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!proposta) return null;

  const decidir = async (acao) => {
    setEnviando(acao);
    try {
      const res = await fetch("/api/compras/prazos-rm/prazo-proposto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId: pedido.id,
          // ⚠⚠ O ID DA PROPOSTA QUE ESTA TELA LEU. O servidor compara e devolve 409 se o
          // fornecedor tiver mandado outra no meio — ninguém aprova data que não viu.
          propostaId: proposta.id,
          acao,
          motivo: motivo.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível registrar a decisão");
      if (acao === "aprovar") {
        showToast(`Prazo do pedido ${pedido.numeroPedido || ""} atualizado para ${fmt(proposta.prazo)}`.trim(), "success");
      } else if (data.semEmail) {
        // ⚠ A recusa vale de qualquer jeito, mas quem recusou precisa saber que o fornecedor NÃO
        // foi avisado — senão ele segue achando que a data dele está combinada.
        showToast("Proposta recusada. Este fornecedor não tem e-mail cadastrado — avise por fora.", "error");
      } else if (!data.avisoOk) {
        showToast("Proposta recusada, mas o e-mail ao fornecedor falhou. Avise por fora.", "error");
      } else {
        showToast("Proposta recusada e fornecedor avisado.", "success");
      }
      onDecidido?.();
    } catch (e) {
      showToast(e.message, "error");
      setEnviando(null);
    }
  };

  return (
    <div className="mt-1.5 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2">
      <p className="text-[11px] text-violet-900 flex items-start gap-1.5">
        <CalendarClock size={11} className="mt-0.5 shrink-0" />
        {/* ⚠⚠ "PROPÔS", E A DATA ATUAL FICA À VISTA AO LADO. Mostrar só a data nova faria parecer
            que o prazo já mudou — que é exatamente o que este fluxo existe para impedir. */}
        <span>
          <b>{pedido.fornecedorNome || "O fornecedor"} propôs {fmt(proposta.prazo)}</b> em {fmtEm(proposta.em)}
          {proposta.motivo ? <> — <i>“{proposta.motivo}”</i></> : null}
          {". "}
          <span className="text-violet-700">A previsão só muda se você aprovar; até lá o pedido segue cobrável.</span>
        </span>
      </p>

      {recusando && (
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          placeholder="Por que não dá (vai no e-mail ao fornecedor) — opcional"
          className="mt-2 w-full text-xs px-2 py-1.5 rounded border border-violet-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => decidir("aprovar")}
          disabled={!!enviando}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {enviando === "aprovar" ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Aprovar {fmt(proposta.prazo)}
        </button>
        <button
          onClick={() => (recusando ? decidir("recusar") : setRecusando(true))}
          disabled={!!enviando}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-violet-300 text-violet-800 hover:bg-violet-100 disabled:opacity-50"
        >
          {enviando === "recusar" ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
          {recusando ? "Confirmar recusa" : "Recusar"}
        </button>
        {recusando && !enviando && (
          <button onClick={() => { setRecusando(false); setMotivo(""); }} className="text-[11px] text-violet-700 hover:underline">
            cancelar
          </button>
        )}
      </div>
    </div>
  );
}
