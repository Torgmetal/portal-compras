"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, ChevronRight, Search, ArrowUpDown } from "lucide-react";

// ─── A LISTA DE OPs DO COMPRAS ────────────────────────────────────────────────
// Vitor (30/08/2026): "melhore a visualização dessa tela, me traga um filtro para selecionar a OP;
// e OPs finalizadas pode tirar dessa lista, aqui só fica obras em andamento".
//
// ⚠ CARTÃO VIROU LINHA. Cada OP ocupava um cartão alto com cinco números embaixo — com 32 obras
// ativas, achar uma exigia rolar a página inteira. Em linha, cabem todas na tela e a comparação
// entre obras (quem tem RM parada, quem não cotou nada) fica possível de bater o olho.
//
// ⚠ O FILTRO É NO CLIENTE, não por `searchParams`: quem procura uma OP quer o resultado enquanto
// digita, não a página recarregando a cada tecla.
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function ListaOPsClient({ ops, statusCfg }) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState({ campo: "numero", dir: "desc" });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    // a busca cobre número, cliente e obra: o comprador procura por qualquer um dos três
    const f = !q ? ops : ops.filter((o) =>
      [o.numero, o.cliente, o.obra].some((v) => String(v ?? "").toLowerCase().includes(q))
    );
    const val = (o) => {
      switch (ordem.campo) {
        case "cliente": return String(o.cliente || "").toLowerCase();
        case "fim": return o.dataFimPrevista ? new Date(o.dataFimPrevista).getTime() : Infinity;
        case "rms": return o.stats.rms;
        case "itens": return o.stats.itensPedido;
        // ⚠ número como NÚMERO: como texto, "OP-9" viria depois de "OP-112"
        default: return Number(String(o.numero).replace(/\D/g, "")) || 0;
      }
    };
    return [...f].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb) : (va === vb ? 0 : va < vb ? -1 : 1);
      return ordem.dir === "asc" ? c : -c;
    });
  }, [ops, busca, ordem]);

  const Th = ({ campo, children, className = "" }) => (
    <th className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-torg-gray ${className}`}>
      <button
        onClick={() => setOrdem((o) => ({ campo, dir: o.campo === campo && o.dir === "asc" ? "desc" : "asc" }))}
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-torg-blue"
      >
        {children}
        <ArrowUpDown size={11} className={ordem.campo === campo ? "text-torg-blue" : "text-gray-300"} />
      </button>
    </th>
  );

  return (
    <>
      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por OP, cliente ou obra…"
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-torg-blue focus:ring-1 focus:ring-torg-blue"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2.5 text-xs text-torg-gray">
          {lista.length} obra{lista.length !== 1 ? "s" : ""} em andamento
          {busca && <span> · filtrando por “{busca}”</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <Th campo="numero" className="w-[110px]">OP</Th>
                <Th campo="cliente">Cliente / obra</Th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-torg-gray w-[120px]">Status</th>
                <Th campo="fim" className="w-[110px]">Fim previsto</Th>
                <Th campo="rms" className="w-[70px]">RMs</Th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-torg-gray w-[100px]">Cotações</th>
                <Th campo="itens" className="w-[110px]">Em pedido</Th>
                <th className="w-[30px] px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-torg-gray">
                  <FolderKanban size={28} className="mx-auto mb-2 text-gray-300" />
                  Nenhuma obra em andamento com esse filtro.
                </td></tr>
              )}
              {lista.map((op) => {
                const s = statusCfg[op.statusCalc] || statusCfg.ABERTA;
                return (
                  <tr key={op.id} className="group hover:bg-torg-blue-50/40">
                    <td className="px-3 py-3 align-middle">
                      <Link href={`/compras/painel-ops/${op.id}`} className="font-mono text-sm font-semibold text-torg-blue hover:underline">
                        OP-{String(op.numero).replace(/\D/g, "").padStart(3, "0")}
                      </Link>
                    </td>
                    <td className="max-w-[320px] px-3 py-3 align-middle">
                      <Link href={`/compras/painel-ops/${op.id}`} className="block">
                        <p className="truncate text-sm font-medium text-torg-dark">{op.cliente}</p>
                        {op.obra && <p className="truncate text-xs text-torg-gray">{op.obra}</p>}
                      </Link>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-torg-dark tabular-nums">{fmtData(op.dataFimPrevista)}</td>
                    <td className="px-3 py-3 align-middle tabular-nums text-sm text-torg-dark">{op.stats.rms}</td>
                    <td className="px-3 py-3 align-middle tabular-nums text-sm text-torg-dark">
                      {op.stats.cotacoesRecebidas}/{op.stats.cotacoesEnviadas}
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums text-sm text-torg-dark">
                      {op.stats.itensPedido}/{op.stats.itensTotais}
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-torg-blue" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
