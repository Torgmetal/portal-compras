"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from "lucide-react";

// AJUSTES PENDENTES DO BANCO, com um clique.
//
// ⚠ Existe para a correção não ficar esperando alguém abrir o console do banco. Vitor
// (04/09/2026): "como vamos corrigir isso de uma vez". Cada tarefa é aditiva e idempotente — ver
// app/api/admin/manutencao/route.js, que é quem decide o que existe e o que falta.
export default function ManutencaoClient() {
  const [tarefas, setTarefas] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");
  const [feitos, setFeitos] = useState(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/admin/manutencao");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao conferir.");
      setTarefas(j.tarefas || []);
    } catch (e) { setErro(e.message); setTarefas([]); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function aplicar() {
    setRodando(true); setErro(""); setFeitos(null);
    try {
      const r = await fetch("/api/admin/manutencao", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao aplicar.");
      setFeitos(j.feitos || []);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setRodando(false); }
  }

  const pendentes = (tarefas || []).filter((t) => t.falta);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2">
        <Wrench size={20} className="text-torg-blue" /> Manutenção do banco
      </h1>
      <p className="text-[13px] text-torg-gray mt-1 mb-5">
        Ajustes que uma correção precisa aplicar no banco: coluna nova ou acerto de dado que ficou
        para trás. Tudo aditivo e sem apagar nada — aplicar duas vezes não faz mal.
      </p>

      {erro && (
        <p className="mb-4 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {erro}
        </p>
      )}

      {tarefas === null ? (
        <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> conferindo…</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {tarefas.map((t) => (
              <div key={t.id} className={`border rounded-xl p-3.5 ${t.falta ? "border-amber-300 bg-amber-50/50" : "border-gray-100 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-torg-dark">{t.titulo}</p>
                    <p className="text-[12px] text-torg-gray mt-0.5">{t.porque}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    t.falta === null ? "bg-gray-50 text-torg-gray border-gray-200"
                      : t.falta ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                    {t.falta === null ? "?" : t.falta ? "pendente" : "em dia"}
                  </span>
                </div>
                <p className="text-[11px] text-torg-gray mt-1.5 font-mono">{t.detalhe}</p>
              </div>
            ))}
          </div>

          <button onClick={aplicar} disabled={rodando || !pendentes.length}
            className="mt-5 bg-torg-blue text-white hover:bg-torg-dark rounded-xl px-5 py-3 text-[14px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {rodando ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
            {pendentes.length ? `Aplicar ${pendentes.length} ajuste(s)` : "Nada pendente"}
          </button>

          {feitos && (
            <div className="mt-4 border border-gray-100 rounded-xl p-3.5 bg-white">
              <p className="text-[12px] font-semibold text-torg-dark mb-1.5">O que foi feito</p>
              <ul className="space-y-1">
                {feitos.map((f) => (
                  <li key={f.id} className="text-[12px] inline-flex items-center gap-1.5">
                    {f.ok ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-red-600" />}
                    <span className="text-torg-dark">{f.titulo}</span>
                    <span className="text-torg-gray">— {f.resultado}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
