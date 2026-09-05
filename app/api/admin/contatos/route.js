// GET /api/admin/contatos — a matriz completa { setor: { contatos, ativo } }
// PUT /api/admin/contatos — grava os contatos de UM setor
//
// Vitor (25/08/2026): "vamos criar essa função no painel do adm, assim se entrar ou sair pessoas
// conseguimos editar com mais facilidade". Saiu do Planejamento e virou cadastro do Admin, ao lado
// de Usuários — é o mesmo assunto: quem é quem na empresa.
//
// ⚠ ADMIN, não o módulo. Estes e-mails decidem quem recebe cobrança, ata e cronograma; quem edita
// isso está mexendo em oito fluxos de envio de uma vez.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminDoPortal } from "@/lib/session";
import { SETORES_COMUNICACAO, normalizarContatos, getMatrizCompleta, SETOR_LABEL } from "@/lib/comunicacao-setor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  setor: z.enum(SETORES_COMUNICACAO),
  contatos: z.array(z.object({
    nome: z.string().max(120).optional().nullable(),
    email: z.string().email("E-mail inválido"),
  })).max(30),
  ativo: z.boolean().optional(),
});

export async function GET() {
  try { await requireAdminDoPortal(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  return NextResponse.json({ matriz: await getMatrizCompleta(), setores: SETORES_COMUNICACAO, labels: SETOR_LABEL });
}

export async function PUT(req) {
  let user;
  try { user = await requireAdminDoPortal(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => null);
  const p = schema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });

  const contatos = normalizarContatos(p.data.contatos);
  const antes = await prisma.comunicacaoSetor.findUnique({ where: { setor: p.data.setor } });
  const reg = await prisma.comunicacaoSetor.upsert({
    where: { setor: p.data.setor },
    create: { setor: p.data.setor, contatos, ativo: p.data.ativo ?? true },
    update: { contatos, ...(p.data.ativo === undefined ? {} : { ativo: p.data.ativo }) },
  });

  // ⚠ trilha: tirar alguém daqui cala oito avisos silenciosamente. Sem registro, meses depois
  // ninguém sabe dizer quando aquele setor parou de receber e-mail.
  await prisma.auditLog.create({
    data: {
      userId: user?.id || null, action: "CONTATOS_SETOR_ALTERADOS",
      entity: "ComunicacaoSetor", entityId: reg.id,
      diff: {
        setor: p.data.setor,
        antes: (Array.isArray(antes?.contatos) ? antes.contatos : []).map((c) => c.email),
        depois: contatos.map((c) => c.email),
      },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, contatos: reg.contatos, ativo: reg.ativo });
}
