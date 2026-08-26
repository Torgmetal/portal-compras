// GET /api/qualidade/plp/{opNumero}/excel — o PLP da obra no padrão Torg, em Excel.
//
// Vitor (26/08/2026): "precisamos criar um documento que seria nosso padrão para PLP (…) deixar ele
// no formato excel para ficar mais sério, preservar os campos de assinatura".
//
// ⚠ SAI DO QUE O PORTAL JÁ SABE — o PlanoPintura da obra (preparo, demãos, itens com a cor de cada
// um) e os dados da OP. O que o portal não sabe sai em branco COM A LINHA para preencher: num
// documento da Qualidade, campo preenchido errado é pior que campo vazio, porque o vazio alguém
// completa e o errado alguém assina.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarPlpExcel } from "@/lib/plp-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const [plp, op] = await Promise.all([
    prisma.planoPintura.findUnique({ where: { opNumero } }),
    prisma.oP.findFirst({ where: { numero: opNumero }, select: { numero: true, cliente: true, obra: true, refCliente: true } }),
  ]);
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const bytes = await gerarPlpExcel({
    plp: plp || {}, op,
    usuario: user?.name || user?.email || null,
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PLP-T${opNumero}.xlsx"`,
    },
  });
}
