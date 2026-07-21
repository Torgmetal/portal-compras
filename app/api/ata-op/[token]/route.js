// Público (sem login, via token) — o CLIENTE vê a ata da OP e registra o ACEITE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const ata = await prisma.ataOP.findUnique({
    where: { tokenCliente: params.token },
    include: { op: { select: { numero: true, cliente: true, obra: true } } },
  });
  if (!ata) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({
    success: true,
    ata: {
      numero: ata.numero, opNumero: ata.opNumero, cliente: ata.op?.cliente, obra: ata.op?.obra,
      titulo: ata.titulo, dataReuniao: ata.dataReuniao, participantes: ata.participantes,
      conteudoJson: ata.conteudoJson, pauta: ata.pauta, anexos: ata.anexos,
      status: ata.status, aceiteEm: ata.aceiteEm, aceiteNome: ata.aceiteNome,
    },
  });
}

export async function POST(req, { params }) {
  const ata = await prisma.ataOP.findUnique({ where: { tokenCliente: params.token }, select: { id: true, aceiteEm: true } });
  if (!ata) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  if (ata.aceiteEm) return NextResponse.json({ success: true, jaAceito: true });

  const body = await req.json().catch(() => ({}));
  const nome = String(body.nome || "").trim();
  if (!nome) return NextResponse.json({ success: false, error: "Informe seu nome para registrar o aceite." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  await prisma.ataOP.update({ where: { id: ata.id }, data: { status: "ACEITA", aceiteEm: new Date(), aceiteNome: nome.slice(0, 100), aceiteIp: ip } });
  return NextResponse.json({ success: true });
}
