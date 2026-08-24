"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { ClipboardList, Search, ChevronRight, ChevronLeft, Building2, Info, Truck } from "lucide-react";
import ConsultaExpedicao from "@/app/comercial/[id]/ConsultaExpedicao";

// ⚠ Mesmo desenho da Programação de Cargas: escolhe a obra, depois trabalha. Duas telas do
// Planejamento que fazem "escolher OP e montar entrega" com layouts diferentes só ensinam duas
// vezes a mesma coisa.
export default function RomaneiosPreviosPlanejamentoClient({ ops }) {
  const [opSel, setOpSel] = useState(null);
  const [busca, setBusca] = useState("");

  const opsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return ops;
    return ops.filter((o) => `${o.numero} ${o.cliente || ""} ${o.obra || ""}`.toLowerCase().includes(q));
  }, [ops, busca]);

  const opAtual = ops.find((o) => o.id === opSel);

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      <div className="bg-torg-dark text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <ClipboardList size={20} className="text-torg-orange" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Romaneios prévios</h1>
              <p className="text-xs text-white/70">
                Marque as peças que vão numa carga e feche o romaneio prévio. A Expedição confere e emite.
              </p>
            </div>
          </div>
          <Link href="/planejamento/programacao-cargas"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors">
            <Truck size={14} /> Programação de cargas
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {!opSel ? (
          <>
            <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <Info size={16} className="text-torg-blue mt-0.5 shrink-0" />
              {/* ⚠ o texto diz o que o romaneio prévio É, porque o nome sozinho não diz: ele não
                  expede nada — é a carga proposta, que a Expedição confere antes de emitir. */}
              <p className="text-sm text-torg-dark">
                Escolha a obra. Você marca as peças que devem ir na carga — uma a uma ou importando a
                relação em Excel/PDF — e fecha o <strong>romaneio prévio</strong>. Ele não expede nada:
                é a carga proposta, que a Expedição confere e emite.
              </p>
            </div>

            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar OP por número, cliente ou obra…"
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-torg-blue focus:border-transparent outline-none" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {opsFiltradas.map((op) => (
                <button key={op.id} onClick={() => setOpSel(op.id)}
                  className="group bg-white border border-gray-100 rounded-xl px-4 py-3 text-left hover:border-torg-blue hover:shadow-sm transition-all flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-bold text-torg-dark">OP {op.numero}</span>
                    <p className="text-xs text-torg-gray truncate flex items-center gap-1 mt-0.5">
                      <Building2 size={12} className="shrink-0" />
                      {op.cliente || "—"}{op.obra ? ` · ${op.obra}` : ""}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-torg-blue shrink-0" />
                </button>
              ))}
              {opsFiltradas.length === 0 && (
                <p className="text-sm text-torg-gray col-span-full text-center py-8">Nenhuma OP encontrada.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setOpSel(null)}
              className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:text-torg-dark mb-4">
              <ChevronLeft size={16} /> Trocar de obra
            </button>

            {opAtual && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-4">
                <h2 className="font-bold text-torg-dark flex items-center gap-2">
                  <Building2 size={16} className="text-torg-blue" /> OP {opAtual.numero}
                </h2>
                <p className="text-sm text-torg-gray mt-0.5">
                  {opAtual.cliente || "—"}{opAtual.obra ? ` · ${opAtual.obra}` : ""}
                </p>
              </div>
            )}

            {/* ⚠ `key` força remontar ao trocar de obra: o componente guarda seleção e marcas em
                estado próprio, e sem isso a seleção da obra anterior vazaria para a nova. */}
            <ConsultaExpedicao key={opSel} opId={opSel} />
          </>
        )}
      </div>
    </div>
  );
}
