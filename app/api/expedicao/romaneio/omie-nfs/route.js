// GET /api/expedicao/romaneio/omie-nfs?opId=...
// Lista as NF-e de venda já emitidas no Omie para a OP — uma por pedido de
// venda (OPMedicao.codigoPedidoOmie). A Expedição escolhe uma para vincular ao
// romaneio. Consulta direta via ConsultarNF { nIdPedido } (ver lib/omie-nfe).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { consultarNFePorPedido } from "@/lib/omie-nfe";

export const runtime = "nodejs";
export const maxDuration = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "opId obrigatório" }, { status: 400 });

  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: {
      numero: true,
      medicoes: {
        where: { codigoPedidoOmie: { not: null } },
        select: { numeroPedidoOmie: true, codigoPedidoOmie: true, tipoDocumento: true },
      },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  // só pedidos de venda de produto (serviço = NFS-e, não tem DANFE de produto)
  const pedidos = (op.medicoes || []).filter((m) => (m.tipoDocumento || "VENDA") !== "SERVICO" && m.codigoPedidoOmie);
  if (pedidos.length === 0) {
    return NextResponse.json({ nfs: [], aviso: "Esta OP não tem pedido de venda vinculado no Omie (medição)." });
  }

  const nfs = [];
  let ultimoErro = null;
  for (let i = 0; i < pedidos.length; i++) {
    const r = await consultarNFePorPedido(pedidos[i].codigoPedidoOmie);
    if (r.error) ultimoErro = r.error;
    else if (r.nf) nfs.push({ ...r.nf, pedido: pedidos[i].numeroPedidoOmie });
    if (i < pedidos.length - 1) await sleep(350); // respeita limite do Omie
  }

  // dedup por chave/numero (a mesma NF pode aparecer em mais de um pedido)
  const seen = new Set();
  const dedup = nfs.filter((n) => {
    const k = n.chave || n.numero;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (dedup.length === 0) {
    return NextResponse.json({
      nfs: [],
      aviso: ultimoErro || "Nenhuma NF-e encontrada no Omie para os pedidos desta OP (ainda não faturado?).",
    });
  }
  return NextResponse.json({ nfs: dedup });
}
