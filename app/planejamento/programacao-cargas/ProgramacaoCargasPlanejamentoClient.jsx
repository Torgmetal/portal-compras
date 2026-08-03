"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Truck, Search, ChevronRight, ChevronLeft, Loader2, AlertCircle,
  Building2, ListChecks, Info,
} from "lucide-react";
import PlanejamentoCargaSection from "@/app/expedicao/checklist/PlanejamentoCargaSection";

export default function ProgramacaoCargasPlanejamentoClient({ ops }) {
  const [opSel, setOpSel] = useState(null);
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState(null); // { op, pecas, acessorios, ... }
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // Carrega peças/acessórios da OP escolhida (mesmo endpoint do checklist da Expedição)
  useEffect(() => {
    if (!opSel) { setDados(null); return; }
    setLoading(true); setErro("");
    fetch(`/api/expedicao/checklist?opId=${opSel}`)
      .then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setDados(d); })
      .catch((e) => setErro(e.message || "Erro ao carregar as peças da OP."))
      .finally(() => setLoading(false));
  }, [opSel]);

  const opsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return ops;
    return ops.filter((o) =>
      `${o.numero} ${o.cliente || ""} ${o.obra || ""}`.toLowerCase().includes(q)
    );
  }, [ops, busca]);

  const opAtual = ops.find((o) => o.id === opSel) || dados?.op;

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      {/* Cabeçalho */}
      <div className="bg-torg-dark text-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <Truck size={20} className="text-torg-orange" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Programação de Cargas</h1>
              <p className="text-xs text-white/70">
                Defina as entregas que vão pra obra — peças e datas. A Expedição certifica e emite o romaneio.
              </p>
            </div>
          </div>
          <Link
            href="/expedicao/programacao-cargas"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
          >
            <ListChecks size={14} /> Ver todas as cargas
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Passo 1: escolher a OP */}
        {!opSel && (
          <>
            <div className="bg-torg-blue-50 border border-torg-blue-100 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
              <Info size={16} className="text-torg-blue mt-0.5 flex-shrink-0" />
              <p className="text-sm text-torg-dark">
                Escolha a obra para programar as entregas. Cada carga é uma remessa —
                nem tudo cabe numa viagem só, então programe quantas forem necessárias.
              </p>
            </div>

            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar OP por número, cliente ou obra…"
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-torg-blue focus:border-transparent outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {opsFiltradas.map((op) => (
                <button
                  key={op.id}
                  onClick={() => setOpSel(op.id)}
                  className="group bg-white border border-gray-100 rounded-xl px-4 py-3 text-left hover:border-torg-blue hover:shadow-sm transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-torg-dark">OP {op.numero}</span>
                    </div>
                    <p className="text-xs text-torg-gray truncate flex items-center gap-1 mt-0.5">
                      <Building2 size={12} className="flex-shrink-0" />
                      {op.cliente || "—"}{op.obra ? ` · ${op.obra}` : ""}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 group-hover:text-torg-blue flex-shrink-0" />
                </button>
              ))}
              {opsFiltradas.length === 0 && (
                <p className="text-sm text-torg-gray col-span-full text-center py-8">
                  Nenhuma OP encontrada.
                </p>
              )}
            </div>
          </>
        )}

        {/* Passo 2: programar as cargas da OP */}
        {opSel && (
          <>
            <button
              onClick={() => setOpSel(null)}
              className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:text-torg-dark mb-4"
            >
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

            {loading ? (
              <div className="py-12 text-center text-torg-gray">
                <Loader2 size={26} className="animate-spin mx-auto mb-2" />
                <p className="text-sm">Carregando peças da OP…</p>
              </div>
            ) : erro ? (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{erro}</span>
              </div>
            ) : dados ? (
              <PlanejamentoCargaSection
                key={opSel}
                opId={opSel}
                pecas={dados.pecas}
                acessorios={dados.acessorios}
                defaultAberta
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
