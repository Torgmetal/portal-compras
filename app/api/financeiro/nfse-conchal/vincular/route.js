// POST /api/financeiro/nfse-conchal/vincular
// Vincula (ou desvincula) uma NFS-e avulsa de Conchal a um projeto/obra do Omie.
// codProj = 0 ou null → desvincula.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  numero:      z.string().min(1),
  serie:       z.string().default(""),
  codProj:     z.union([z.number(), z.string()]).nullable(),
  projetoNome: z.string().nullable().optional(),
  valor:       z.number().optional(),
  data:        z.string().nullable().optional(),
  tomadorNome: z.string().nullable().optional(),
  descricao:   z.string().nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "FINANCEIRO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const chave = { numero: body.numero, serie: body.serie || "" };
  const codProj = (body.codProj == null || body.codProj === "" || body.codProj === 0) ? null : String(body.codProj);

  try {
    // Desvincular
    if (!codProj) {
      const existente = await prismaDirect.nfseConchalVinculo.findUnique({ where: { numero_serie: chave } });
      if (existente) {
        await prismaDirect.nfseConchalVinculo.delete({ where: { numero_serie: chave } });
        await prisma.auditLog.create({
          data: {
            userId: user.id, action: "nfse_conchal_desvincular", entity: "NfseConchalVinculo",
            entityId: existente.id, diff: { antes: { codProj: existente.codProj }, depois: null, nota: `${chave.numero}/${chave.serie}` },
          },
        }).catch(() => {});
      }
      return NextResponse.json({ ok: true, vinculo: null });
    }

    // Vincular / atualizar
    const dataDt = body.data ? new Date(body.data) : null;
    const vinculo = await prismaDirect.nfseConchalVinculo.upsert({
      where: { numero_serie: chave },
      create: {
        ...chave, codProj, projetoNome: body.projetoNome ?? null,
        valor: body.valor ?? 0, data: (dataDt && !isNaN(dataDt.getTime())) ? dataDt : null,
        tomadorNome: body.tomadorNome ?? null, descricao: body.descricao ?? null,
        vinculadoPor: user.id,
      },
      update: {
        codProj, projetoNome: body.projetoNome ?? null,
        valor: body.valor ?? 0, tomadorNome: body.tomadorNome ?? null,
        descricao: body.descricao ?? null, vinculadoPor: user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "nfse_conchal_vincular", entity: "NfseConchalVinculo",
        entityId: vinculo.id,
        diff: { nota: `${chave.numero}/${chave.serie}`, codProj, projeto: body.projetoNome, valor: body.valor },
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, vinculo });
  } catch (e) {
    return NextResponse.json({ error: "Erro ao salvar vínculo: " + (e?.message || e) }, { status: 500 });
  }
}
