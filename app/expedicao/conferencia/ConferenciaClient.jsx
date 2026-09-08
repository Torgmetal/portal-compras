"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, Play } from "lucide-react";
import { lerJson } from "@/lib/ler-json";

// CONFERÊNCIA DE PEÇA — a porta de entrada: começar uma, ou voltar para uma que já está aberta.
//
// Matheus (08/09/2026): "clicar em iniciar conferência, seleciona a OP (…) a ideia é usar essa tela
// em um celular em campo ou tablet para ele conferir as peças antes de ir para pintura e
// etiquetagem".

const quando = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

function Cartao({ c }) {
  const aberta = c.status === "ABERTA";
  return (
    <Link href={`/expedicao/conferencia/${c.id}`}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-torg-blue transition-colors">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${aberta ? "text-torg-orange" : "text-emerald-600"}`}>
          {aberta ? <Play size={18} /> : <CheckCircle2 size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-torg-dark">
            OP-{c.opNumero}{c.cliente ? ` · ${c.cliente}` : ""}
          </div>
          {c.obra && <div className="text-[13px] text-torg-gray truncate">{c.obra}</div>}
          <div className="text-[12px] text-torg-gray mt-1">
            {aberta ? "Aberta" : "Finalizada"} · {c.lancamentos} lançamento(s) ·{" "}
            {quando(aberta ? c.iniciadaEm : c.finalizadaEm)}
            {c.iniciadaPorNome ? ` · ${c.iniciadaPorNome}` : ""}
          </div>
        </div>
        <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg ${
          aberta ? "bg-torg-orange/10 text-torg-orange" : "bg-emerald-50 text-emerald-700"}`}>
          {aberta ? "EM ANDAMENTO" : "OK"}
        </span>
      </div>
    </Link>
  );
}

function Iniciar({ ops, onIniciar, iniciando }) {
  const [opId, setOpId] = useState("");
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-torg-gray mb-1.5">Obra</label>
      <select value={opId} onChange={(e) => setOpId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base bg-white mb-3">
        <option value="">Selecione a OP…</option>
        {ops.map((o) => (
          <option key={o.id} value={o.id}>
            OP-{o.numero} · {o.cliente}{o.obra ? ` — ${o.obra}` : ""}
          </option>
        ))}
      </select>
      {/* py-3.5 e text-base: isto é dedo em tela de celular, não mouse. */}
      <button onClick={() => onIniciar(opId)} disabled={!opId || iniciando}
        className="w-full bg-torg-blue text-white font-semibold rounded-lg px-4 py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-40">
        {iniciando ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
        {iniciando ? "Abrindo…" : "Iniciar conferência"}
      </button>
    </div>
  );
}

export default function ConferenciaClient() {
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      setDados(await lerJson(await fetch("/api/expedicao/conferencia", { cache: "no-store" }), "Conferências"));
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const iniciar = async (opId) => {
    if (!opId) return;
    setIniciando(true); setErro("");
    try {
      const j = await lerJson(await fetch("/api/expedicao/conferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId }),
      }), "Iniciar conferência");
      router.push(`/expedicao/conferencia/${j.id}`);
    } catch (e) { setErro(e.message); setIniciando(false); }
  };

  const abertas = (dados?.conferencias || []).filter((c) => c.status === "ABERTA");
  const fechadas = (dados?.conferencias || []).filter((c) => c.status !== "ABERTA");

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="text-torg-orange mt-1 shrink-0" size={26} />
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">Conferência de peça</h1>
          <p className="text-torg-gray text-sm">
            Conferir as peças da obra antes da pintura e da etiquetagem. A quantidade é comparada
            com a <b>Lista de Expedição</b> — o que passa do previsto é recusado na hora.
          </p>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">{erro}</div>
          <button onClick={carregar} className="text-sm font-semibold underline shrink-0">Tentar de novo</button>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center py-16 gap-3 text-torg-gray">
          <Loader2 size={22} className="animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <Iniciar ops={dados?.ops || []} onIniciar={iniciar} iniciando={iniciando} />

          {abertas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-torg-gray">Em andamento</h2>
              {abertas.map((c) => <Cartao key={c.id} c={c} />)}
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-torg-gray">Finalizadas</h2>
            {fechadas.length
              ? fechadas.map((c) => <Cartao key={c.id} c={c} />)
              : <p className="text-sm text-torg-gray py-4">Nenhuma conferência finalizada ainda.</p>}
          </section>
        </>
      )}
    </div>
  );
}
