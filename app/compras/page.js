import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FileText } from "lucide-react";
import RMsTabelaSeletor from "./RMsTabelaSeletor";

// Sempre busca dados frescos do banco (sem cache de Server Component)

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const TIPO_RM_LABELS = {
  ENGENHARIA: "Engenharia",
  INTERNA:    "Interna",
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function PainelCompras({ searchParams }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);
  const verArquivadas = searchParams?.arquivadas === "1";

  const where = {
    tipoRM: "ENGENHARIA",
    ...(verArquivadas
      ? { status: { in: ["PEDIDO_GERADO", "CANCELADA"] } }
      : { status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] } }),
  };

  const [rms, categoriasCustom] = await Promise.all([
    prisma.rM.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        op: { select: { numero: true, cliente: true } },
        createdBy: { select: { name: true } },
        itens: {
          orderBy: { ordem: "asc" },
          select: { id: true, descricao: true, status: true, qtd: true, unidade: true, peso: true },
        },
        _count: { select: { cotacoes: true, itens: true } },
      },
    }),
    // Carrega categorias customizadas de fornecedor pra disponibilizar
    // nos filtros do modal de envio de cotacao (alem das built-in)
    prisma.categoriaFornecedor.findMany({
      where: { ativa: true },
      orderBy: [{ ordem: "asc" }, { label: "asc" }],
    }),
  ]);

  // Conta cotacoes por RM e agrega status (RECEBIDA/PENDENTE/atrasada).
  // Usa CotacaoItem como ponte leve pra identificar cotacaoIds, evitando
  // OR com subquery aninhada que causa OOM no Neon.
  try {
    const rmIdsListados = rms.map((r) => r.id);
    if (rmIdsListados.length > 0) {
      // 1) CotacaoItem -> mapa rmId -> Set<cotacaoId>
      const cotItensRelacionados = await prisma.cotacaoItem.findMany({
        where: { rmItem: { rmId: { in: rmIdsListados } } },
        select: { cotacaoId: true, rmItem: { select: { rmId: true } } },
      });
      const cotacoesPorRm = new Map();
      const todosCotsIds = new Set();
      for (const ci of cotItensRelacionados) {
        const rid = ci.rmItem?.rmId;
        if (!rid) continue;
        if (!cotacoesPorRm.has(rid)) cotacoesPorRm.set(rid, new Set());
        cotacoesPorRm.get(rid).add(ci.cotacaoId);
        todosCotsIds.add(ci.cotacaoId);
      }
      for (const rm of rms) {
        if (rm._count) {
          rm._count.cotacoes = cotacoesPorRm.get(rm.id)?.size ?? rm._count.cotacoes;
        }
      }

      // 2) Busca status/prazo das cotacoes por ID direto (sem OR+subquery)
      if (todosCotsIds.size > 0) {
        const cotsRelacionadas = await prisma.cotacao.findMany({
          where: { id: { in: [...todosCotsIds] } },
          select: { id: true, status: true, prazoResposta: true },
        });
        const cotsMap = new Map();
        for (const c of cotsRelacionadas) cotsMap.set(c.id, c);

        const agora = Date.now();
        const infoPorRm = new Map();
        const upsert = (rmId) => {
          if (!infoPorRm.has(rmId)) {
            infoPorRm.set(rmId, { recebidas: new Set(), pendentes: new Set(), atrasadas: new Set() });
          }
          return infoPorRm.get(rmId);
        };
        for (const [rmId, cotIds] of cotacoesPorRm) {
          if (!rmIdsListados.includes(rmId)) continue;
          for (const cotId of cotIds) {
            const cot = cotsMap.get(cotId);
            if (!cot) continue;
            const info = upsert(rmId);
            if (cot.status === "RECEBIDA") info.recebidas.add(cot.id);
            else if (cot.status === "PENDENTE") {
              info.pendentes.add(cot.id);
              if (cot.prazoResposta && new Date(cot.prazoResposta).getTime() < agora) {
                info.atrasadas.add(cot.id);
              }
            }
          }
        }
        for (const rm of rms) {
          const info = infoPorRm.get(rm.id);
          rm.recebidas = info ? info.recebidas.size : 0;
          rm.pendentes = info ? info.pendentes.size : 0;
          rm.atrasadas = info ? info.atrasadas.size : 0;
        }
      }
    }
  } catch (e) {
    console.error("[/compras] Falha agregando cotacoes:", e?.message);
    for (const rm of rms) {
      rm.recebidas = 0; rm.pendentes = 0; rm.atrasadas = 0;
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">RMs — Materiais</h2>
          <p className="text-sm text-torg-gray mt-1">RMs de Engenharia · Vinculadas a OPs</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              !verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Ativas
          </Link>
          <Link
            href="/compras?arquivadas=1"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Histórico
          </Link>
        </div>
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verArquivadas ? "Nenhuma RM arquivada" : "Nenhuma RM ativa no momento"}
          </p>
        </div>
      ) : (
        <RMsTabelaSeletor
          rms={JSON.parse(JSON.stringify(rms))}
          isAdmin={user.role === "ADMIN"}
          categoriasCustom={JSON.parse(JSON.stringify(categoriasCustom))}
        />
      )}
    </div>
  );
}
