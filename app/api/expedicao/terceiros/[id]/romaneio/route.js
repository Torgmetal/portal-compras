// GET — baixa o romaneio terceirizado em Excel (estilo FORM 22).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRomaneioTerceiroExcel } from "@/lib/romaneio-terceiro-excel";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ALMOXARIFADO"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rom = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id } });
  if (!rom) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });

  const buf = await gerarRomaneioTerceiroExcel(rom);
  const nome = `Romaneio-Terceiro-RT-${String(rom.numero).padStart(3, "0")}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
