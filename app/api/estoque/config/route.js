// GET /api/estoque/config — retorna configuracao do estoque (categorias)
// PATCH — atualiza categorias do Omie controladas
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getConfigEstoque } from "@/lib/omie-estoque";

const patchSchema = z.object({
  categoriasOmie: z.array(z.string().min(1)).min(0),
});

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  const cfg = await getConfigEstoque();
  return NextResponse.json({ config: cfg });
}

export async function PATCH(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN." }, { status: 403 });
  }
  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }
  const cfg = await getConfigEstoque();
  const updated = await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: { categoriasOmie: body.categoriasOmie },
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_config_estoque",
      entity: "ConfigEstoque",
      entityId: cfg.id,
      diff: { antes: cfg.categoriasOmie, depois: body.categoriasOmie },
    },
  });
  return NextResponse.json({ config: updated });
}
