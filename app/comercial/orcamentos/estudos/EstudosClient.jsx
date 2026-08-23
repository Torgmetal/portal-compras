"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Plus, FileSpreadsheet } from "lucide-react";
import { useStore } from "@/lib/store";

const fmtR$ = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const cod = (e) => `LQC-${String(e.numero || 0).padStart(3, "0")}-${String(e.ano).slice(-2)}-R${String(e.revisao || 0).padStart(2, "0")}`;

/**
 * ESTUDOS DE FABRICAÇÃO — a LQC dentro do portal.
 *
 * Vitor (22/08/2026): "que você transforme cada aba da geração de custo igual está na nossa LQC, e
 * quando eu pedir para extrair uma planilha você iria trazer exatamente o mesmo modelo preenchido".
 */
export default function EstudosClient() {
  const { showToast } = useStore();
  const [lista, setLista] = useState(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({ cliente: "", obra: "" });

  const carregar = () => fetch("/api/comercial/estudos").then((r) => r.json()).then((j) => setLista(j.estudos || []));
  useEffect(() => { carregar(); }, []);

  const criar = async (e) => {
    e.preventDefault();
    if (!form.cliente.trim()) return;
    setCriando(true);
    try {
      const r = await fetch("/api/comercial/estudos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      window.location.href = `/comercial/orcamentos/estudos/${j.estudo.id}`;
    } catch (e2) { showToast(e2.message, "error"); setCriando(false); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-torg-dark">Estudos de fabricação</h1>
      <p className="text-[12px] text-torg-gray mt-1 mb-5">
        A composição de custo no mesmo formato da LQC. A planilha extraída sai no modelo de verdade,
        com as fórmulas vivas.
      </p>

      <form onSubmit={criar} className="bg-white border border-gray-100 rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-torg-dark mb-1">Cliente</label>
          <input value={form.cliente} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] w-56" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-torg-dark mb-1">Obra</label>
          <input value={form.obra} onChange={(e) => setForm((f) => ({ ...f, obra: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] w-56" />
        </div>
        <button type="submit" disabled={criando}
          className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50">
          {criando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />} Novo estudo
        </button>
      </form>

      {!lista && <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> carregando…</p>}
      {lista?.length === 0 && <p className="text-[13px] text-torg-gray">Nenhum estudo ainda.</p>}

      {lista?.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-torg-gray">
              <tr><th className="text-left px-4 py-2">Estudo</th><th className="text-left px-4 py-2">Cliente / obra</th>
                <th className="text-right px-4 py-2">Peso</th><th className="text-right px-4 py-2">Preço</th>
                <th className="text-right px-4 py-2">R$/kg</th><th className="text-left px-4 py-2">Atualizado</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">
                    <Link href={`/comercial/orcamentos/estudos/${e.id}`}>{cod(e)}</Link>
                  </td>
                  <td className="px-4 py-2">{e.cliente}{e.obra ? <span className="text-torg-gray"> · {e.obra}</span> : null}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(e.resultado?.pesoTotal || 0).toLocaleString("pt-BR")} kg</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtR$(e.resultado?.preco)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtR$(e.resultado?.precoPorKg)}</td>
                  <td className="px-4 py-2 text-torg-gray whitespace-nowrap">{fmtD(e.updatedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <a href={`/api/comercial/estudos/${e.id}/planilha`}
                      className="text-[11px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
                      <FileSpreadsheet size={12} /> planilha
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
