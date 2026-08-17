// GET — baixa o 2º romaneio (MATERIAL a cortar/mandar, agrupado por perfil) no modelo FORM 22.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRomaneioTerceiroForm22 } from "@/lib/romaneio-terceiro-form22";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ALMOXARIFADO", "PCP", "PLANEJAMENTO"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const rom = await prisma.romaneioTerceiro.findUnique({ where: { id: params.id } });
  if (!rom) return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });
  if (!Array.isArray(rom.materiais) || !rom.materiais.length) return NextResponse.json({ error: "Este romaneio não tem lista de material (só peças)." }, { status: 400 });

  const buf = await gerarRomaneioTerceiroForm22(rom, { material: true });
  const nome = `Romaneio-Terceiro-RT-${String(rom.numero).padStart(3, "0")}-MATERIAL.xlsx`;
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
