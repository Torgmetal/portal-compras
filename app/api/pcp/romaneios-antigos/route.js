// Importar os ROMANEIOS ANTIGOS das pastas da OP (SharePoint → portal).
// GET  ?opNumero=060           → PRÉVIA: o que a pasta tem, sem gravar nada.
// POST { opNumero, forcar? }   → grava Romaneio + RomaneioItem e marca as peças como EXPEDIDO.
//
// Só para as obras ANTIGAS: nas novas o registro nasce do fluxo do portal. O import recusa OP que
// já tenha romaneio emitido pelo fluxo novo (a não ser com `forcar`). (Vitor 19/08.)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { importarRomaneiosDaOp } from "@/lib/importar-romaneios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // baixar e ler dezenas de planilhas do SharePoint

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "EXPEDICAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = new URL(req.url).searchParams.get("opNumero");
  if (!opNumero) return NextResponse.json({ error: "Informe opNumero." }, { status: 400 });
  try {
    const r = await importarRomaneiosDaOp(opNumero, { gravar: false });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// `romaneios` = os que REALMENTE embarcaram. Obrigatório: romaneio emitido não é embarcado.
const schema = z.object({
  opNumero: z.string().min(1),
  romaneios: z.array(z.string()).min(1),
  forcar: z.boolean().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  try {
    const r = await importarRomaneiosDaOp(body.opNumero, { gravar: true, user, forcar: !!body.forcar, somente: body.romaneios });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "IMPORTAR_ROMANEIOS_PASTA", entity: "Romaneio", entityId: r.op.numero,
        diff: { op: r.op.numero, arquivos: r.arquivos, lidos: r.lidos, semTabela: r.semTabela.length, ...r.gravado } },
    }).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
