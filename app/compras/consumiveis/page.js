import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FileText, BarChart3, Truck, ClipboardList } from "lucide-react";
import RMsTabelaSeletor from "../RMsTabelaSeletor";

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotacao",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "--");

export default async function PainelConsumiveis({ searchParams }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);
  const verArquivadas = searchParams?.arquivadas === "1";

  const where = {
    tipoRM: "INTERNA",
    ...(verArquivadas
      ? { status: { in: ["PEDIDO_GERADO", "CANCELADA"] } }
      : { status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] } }),
  };

  const [rms, totais, categoriasCustom] = await Promise.all([
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
    prisma.rM.groupBy({
      by: ["status"],
      where: { tipoRM: "INTERNA" },
      _count: { _all: true },
    }),
    prisma.categoriaFornecedor.findMany({
      where: { ativa: true },
      orderBy: [{ ordem: "asc" }, { label: "asc" }],
    }),
  ]);

  // Conta cotacoes por RM considerando consolidadas
  // Conta cotacoes por RM e agrega status (RECEBIDA/PENDENTE/atrasada).
  // Usa CotacaoItem como ponte leve pra identificar cotacaoIds, evitando
  // OR com subquery aninhada que causa OOM no Neon.
  try {
    const rmIdsListados = rms.map((r) => r.id);
    if (rmIdsListados.length > 0) {
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
    console.error("[/compras/consumiveis] Falha agregando cotacoes:", e?.message);
    for (const rm of rms) {
      rm.recebidas = 0; rm.pendentes = 0; rm.atrasadas = 0;
    }
  }

  const statusCount = totais.reduce((acc, t) => {
    acc[t.status] = t._count._all;
    return acc;
  }, {});

  const emCotacao = (statusCount.EM_COTACAO || 0) + (statusCount.COTADA || 0);
  const totalAtivas = (statusCount.ABERTA || 0) + emCotacao;

  const cards = [
    { label: "RMs ativas", value: totalAtivas, color: "bg-torg-blue", Icon: FileText },
    { label: "Abertas", value: statusCount.ABERTA || 0, color: "bg-torg-orange", Icon: ClipboardList },
    { label: "Em cotacao", value: emCotacao, color: "bg-torg-blue-700", Icon: BarChart3 },
    { label: "Pedido gerado", value: statusCount.PEDIDO_GERADO || 0, color: "bg-torg-dark", Icon: Truck },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">RMs — Consumiveis / Servicos</h2>
          <p className="text-sm text-torg-gray mt-1">RMs internas · Almoxarifado e demais setores</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras/consumiveis"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              !verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Ativas
          </Link>
          <Link
            href="/compras/consumiveis?arquivadas=1"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Historico
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
            <div className={`${c.color} p-2.5 rounded-lg`}>
              <c.Icon size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-torg-gray truncate">{c.label}</p>
              <p className="text-xl font-extrabold text-torg-dark tabular-nums">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verArquivadas ? "Nenhuma RM de consumivel no historico" : "Nenhuma RM de consumivel ativa"}
          </p>
          {!verArquivadas && (
            <p className="text-sm text-torg-gray mt-2">
              O Almoxarifado pode criar RMs internas em <strong>/rm/nova</strong> escolhendo o tipo &quot;Interna Torg&quot;.
            </p>
          )}
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
