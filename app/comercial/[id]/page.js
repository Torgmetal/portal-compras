import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft } from "lucide-react";
import OPDetailClient from "./OPDetailClient";
import PedidosOmieSection from "@/components/PedidosOmieSection";

// Sempre busca dados frescos do banco
export const dynamic = "force-dynamic";


export default async function OPDetailPage({ params }) {
  const user = await requireRole(["ADMIN", "COMERCIAL"]);

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { name: true, email: true } },
      itens: {
        orderBy: { ordem: "asc" },
        include: {
          solicitacoesVerba: {
            where: { status: "PENDENTE" },
            select: { id: true, valorProposto: true },
          },
        },
      },
      aditivos: {
        orderBy: { numero: "asc" },
        include: {
          createdBy: { select: { name: true } },
          itens: {
            orderBy: { ordem: "asc" },
            include: {
              solicitacoesVerba: {
                where: { status: "PENDENTE" },
                select: { id: true, valorProposto: true },
              },
            },
          },
        },
      },
      revisoes: {
        orderBy: { numero: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      ajustesPrazo: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      _count: { select: { rms: true } },
      rms: {
        select: { id: true, numero: true, tipoRM: true, categoriasOP: true, status: true },
      },
    },
  });

  if (!op) notFound();

  // Cobertura por categoria: pra cada categoria da OP, lista RMs (apenas ENGENHARIA) que cobrem
  const categoriasNoEscopo = new Set();
  for (const it of op.itens) categoriasNoEscopo.add(it.categoria);
  for (const ad of op.aditivos) for (const it of ad.itens) categoriasNoEscopo.add(it.categoria);

  const cobertura = {};
  for (const cat of categoriasNoEscopo) cobertura[cat] = [];
  for (const rm of op.rms) {
    if (rm.tipoRM !== "ENGENHARIA") continue;
    for (const cat of rm.categoriasOP || []) {
      if (cobertura[cat]) cobertura[cat].push({ id: rm.id, numero: rm.numero, status: rm.status });
    }
  }

  // Pedidos no Omie vinculados a essa OP (via cotacao -> rm -> opId)
  const pedidosRaw = await prisma.pedidoOmie.findMany({
    where: { cotacao: { rm: { opId: params.id } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codigoPedido: true,
      numeroPedido: true,
      total: true,
      faturamentoDireto: true,
      status: true,
      erroOmie: true,
      fornecedorNome: true,
      createdAt: true,
      cotacao: { select: { rm: { select: { numero: true } } } },
    },
  });
  const pedidos = pedidosRaw.map((p) => ({
    id: p.id,
    codigoPedido: p.codigoPedido,
    numeroPedido: p.numeroPedido,
    total: p.total,
    faturamentoDireto: p.faturamentoDireto,
    status: p.status,
    erroOmie: p.erroOmie,
    fornecedorNome: p.fornecedorNome,
    createdAt: p.createdAt.toISOString(),
    rmNumero: p.cotacao?.rm?.numero || null,
  }));

  // KPIs de verba: estimada (base + aditivos) vs ja em pedidos (Omie status=CRIADO)
  const verbaBase = op.itens.reduce((s, i) => s + (i.valorVerba || 0), 0);
  const verbaAditivos = op.aditivos.reduce(
    (s, a) => s + a.itens.reduce((ss, i) => ss + (i.valorVerba || 0), 0),
    0
  );
  const verbaTotal = verbaBase + verbaAditivos;
  const totalEmPedidos = pedidos
    .filter((p) => p.status === "CRIADO")
    .reduce((s, p) => s + (p.total || 0), 0);
  const saldo = verbaTotal - totalEmPedidos;
  const consumoPct = verbaTotal > 0 ? (totalEmPedidos / verbaTotal) * 100 : 0;

  // Transformar pra plain object (Date → string)
  const opData = JSON.parse(JSON.stringify(op));
  opData.cobertura = cobertura;
  opData.kpisFinanceiros = { verbaTotal, totalEmPedidos, saldo, consumoPct };

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/comercial" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pra lista de OPs
      </Link>

      <OPDetailClient op={opData} userRole={user.role} userId={user.id} />

      <PedidosOmieSection pedidos={pedidos} />
    </div>
  );
}
