// GET  /api/pcp/fila-setor?setor=ACABAMENTO|JATO|PINTURA → a fila de entrada do setor
// ⚠ o POST aceita `especificacao` na pintura: dado informado na hora para destravar obra sem PLP,
//   guardado só no AuditLog. Ver a nota no schema.
// POST /api/pcp/fila-setor { setor, ids[], bancada|null, dia? } → manda para a bancada
//
// ⚠⚠ ISTO É INTENÇÃO, NÃO ORDEM — a mesma regra que o Vitor definiu para a solda em 01/09/2026:
// quem manda na bancada é o líder no chão. O portal organiza a fila e anota a decisão do PCP; o que
// de fato aconteceu volta pelo Syneco. Não medir aderência contra estes campos.
//
// ⚠ `bancada: null` tira da bancada e devolve à fila (é o "desfazer" da tela).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { filaDoSetor, CAMPOS, BANCADAS } from "@/lib/fila-setor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const SETORES = ["ACABAMENTO", "JATO", "PINTURA"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const setor = String(new URL(req.url).searchParams.get("setor") || "").toUpperCase();
  if (!SETORES.includes(setor)) {
    return NextResponse.json({ error: `Setor inválido. Use: ${SETORES.join(" ou ")}.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await filaDoSetor(setor));
  } catch (e) {
    return NextResponse.json({ error: e.message || "Erro ao montar a fila" }, { status: 500 });
  }
}

const schema = z.object({
  setor: z.enum(["ACABAMENTO", "JATO", "PINTURA"]),
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  bancada: z.string().trim().max(40).nullable(),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable().optional(),
  // ⚠⚠ ESPECIFICAÇÃO INFORMADA NA HORA — NÃO VIRA REGISTRO DA OBRA. Vitor (07/09/2026): "não grava
  // não, é apenas para conseguir liberar para pintura e não ficar amarrado; esse PLP deve vir
  // preenchido desde o início da OP".
  //
  // Obra antiga entra na fila da pintura sem PLP (4 das 5 hoje) e a liberação travava por falta de
  // um dado que a engenharia é que deveria ter posto lá. Isto destrava — e MORRE AQUI: vai só para
  // o AuditLog da liberação, para existir a resposta a "quem mandou pintar sem plano, e com base em
  // quê". Nada é escrito no PlanoPintura; o documento continua sendo da Qualidade.
  especificacao: z.object({
    demaos: z.number().int().min(1).max(9).optional(),
    produto: z.string().trim().max(160).optional(),
    cor: z.string().trim().max(80).optional(),
    espessuraSeca: z.number().min(1).max(2000).optional(),
    solidosVol: z.number().min(1).max(100).optional(),
    diluicaoPct: z.number().min(0).max(100).optional(),
    secagem: z.string().trim().max(80).optional(),
  }).nullable().optional(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const campos = CAMPOS[body.setor];
  // ⚠ a bancada tem de ser uma das do setor: digitar "JATO 3" criaria uma faixa fantasma no Gantt,
  // que desenha o que encontra no campo.
  if (body.bancada && !BANCADAS[body.setor].some((b) => b.k === body.bancada)) {
    return NextResponse.json({
      error: `Bancada desconhecida em ${body.setor}. Use: ${BANCADAS[body.setor].map((b) => b.k).join(", ")}.`,
    }, { status: 400 });
  }

  const dados = { [campos.bancada]: body.bancada };
  // ⚠ sem bancada não há dia: a peça volta inteira para a fila, senão sobra um dia órfão que o
  // Gantt desenha na faixa "sem bancada" como se alguém tivesse programado.
  if (body.bancada === null) dados[campos.dia] = null;
  else if (body.dia !== undefined) dados[campos.dia] = body.dia ? new Date(`${body.dia}T00:00:00Z`) : null;

  const r = await prisma.pecaConjunto.updateMany({ where: { id: { in: body.ids } }, data: dados });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: `FILA_${body.setor}_BANCADA`, entity: "PecaConjunto",
      entityId: `${r.count} peça(s)`,
      diff: { setor: body.setor, bancada: body.bancada, dia: body.dia ?? null, pecas: r.count,
              // ⚠ o que foi informado na hora, quando a obra não tinha PLP. É o ÚNICO lugar onde
              // isso fica — de propósito.
              ...(body.especificacao ? { especificacaoInformada: body.especificacao } : {}) },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, atualizadas: r.count });
}
