"use client";
import { Hash } from "lucide-react";

// Mostra as referências do cliente já gravadas (árvore de `agruparReferencias`), com os rótulos
// fotografados na época — o que a Engenharia, o PCP e a Expedição precisam ver de relance.
const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100 text-xs font-medium";
const fmtR$ = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);

export default function ReferenciasClienteResumo({ arvore, vazio = "Nenhuma referência do cliente registrada." }) {
  const a = arvore || { projetos: [], pedidos: [], outros: [] };
  const nada = !a.projetos?.length && !a.pedidos?.length && !a.outros?.length;
  if (nada) return <p className="text-sm text-torg-gray">{vazio}</p>;
  return (
    <div className="space-y-3">
      {a.projetos?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {a.projetos.map((p) => <span key={p.id || p.codigo} className={chip}><Hash size={12} /> {p.rotulo} {p.codigo}</span>)}
        </div>
      )}
      {a.pedidos?.map((p) => (
        <div key={p.id || p.codigo} className="rounded-lg border border-gray-100 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold text-torg-dark">{p.rotulo} {p.codigo}</span>
            {p.descricao && <span className="text-sm text-torg-gray">{p.descricao}</span>}
            {p.valor != null && <span className="text-xs text-torg-gray">{fmtR$(p.valor)}</span>}
            {p.data && <span className="text-xs text-torg-gray">{fmtData(p.data)}</span>}
            {p.revisao && <span className="text-xs text-torg-gray">rev. {p.revisao}</span>}
          </div>
          {(p.itens?.length > 0 || p.tags?.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.itens?.map((i) => <span key={i.id || i.codigo} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px]">{i.rotulo}: {i.codigo}</span>)}
              {p.tags?.map((tg) => <span key={tg.id || tg.codigo} className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px]">{tg.rotulo} {tg.codigo}{tg.frente ? ` · frente ${tg.frente}` : ""}</span>)}
            </div>
          )}
        </div>
      ))}
      {a.outros?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.outros.map((o) => <span key={o.id || o.codigo} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px]">{o.rotulo}: {o.codigo}</span>)}
        </div>
      )}
    </div>
  );
}
