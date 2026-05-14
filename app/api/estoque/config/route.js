// GET /api/estoque/config — retorna configuracao do estoque (categorias + palavras-chave)
// PATCH — atualiza categorias e/ou palavras-chave
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getConfigEstoque } from "@/lib/omie-estoque";

const patchSchema = z.object({
  categoriasOmie: z.array(z.string().min(1)).optional(),
  palavrasChave: z.array(z.string().min(1)).optional(),
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
  const dataUpdate = {};
  const diff = { antes: {}, depois: {} };
  if (body.categoriasOmie !== undefined) {
    dataUpdate.categoriasOmie = body.categoriasOmie;
    diff.antes.categoriasOmie = cfg.categoriasOmie;
    diff.depois.categoriasOmie = body.categoriasOmie;
  }
  if (body.palavrasChave !== undefined) {
    // Normaliza: trim, upper-case, dedupe
    const limpo = Array.from(new Set(
      body.palavrasChave.map((p) => String(p).trim().toUpperCase()).filter(Boolean)
    ));
    dataUpdate.palavrasChave = limpo;
    diff.antes.palavrasChave = cfg.palavrasChave;
    diff.depois.palavrasChave = limpo;
  }
  if (Object.keys(dataUpdate).length === 0) {
    return NextResponse.json({ error: "Nenhuma alteracao." }, { status: 400 });
  }
  const updated = await prisma.configEstoque.update({
    where: { id: cfg.id },
    data: dataUpdate,
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_config_estoque",
      entity: "ConfigEstoque",
      entityId: cfg.id,
      diff,
    },
  });
  return NextResponse.json({ config: updated });
}
