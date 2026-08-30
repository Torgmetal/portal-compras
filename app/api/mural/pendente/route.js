// GET  /api/mural/pendente — o comunicado em vídeo que ESTE usuário ainda não viu (ou null).
// POST /api/mural/pendente — registra a ciência.
//
// Vitor (30/08/2026): "quando as pessoas fossem fazer o login no dia 01/09 aparecesse um vídeo (…)
// não poderia dar para adiar, e registrar seria maravilhoso pois isso conta muito".
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ⚠ SAI DO AR SOZINHO. `exibirLoginAte` é o que encerra a campanha — ninguém precisa lembrar de
 * desligar no dia 02, e um aviso obrigatório esquecido no ar seria um estorvo diário para 30
 * pessoas. Se a data passou, nem consulta a ciência.
 */
export async function GET() {
  const session = await getSession();
  const userId = session?.user?.id;
  // Sem sessão não é erro: o layout raiz também envolve a tela de login. Só não há nada a mostrar.
  if (!userId) return NextResponse.json({ aviso: null });

  const agora = new Date();
  const aviso = await prisma.muralAviso.findFirst({
    // ⚠ JANELA COM COMEÇO E FIM. Só `exibirLoginAte` faria o aviso aparecer no instante em que a
    // linha fosse criada — e ele é para o dia 01, não para o dia em que o RH cadastrou.
    where: {
      ativo: true, videoUrl: { not: null },
      exibirLoginAte: { gte: agora },
      OR: [{ exibirLoginDe: null }, { exibirLoginDe: { lte: agora } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, titulo: true, corpo: true, videoUrl: true },
  });
  if (!aviso) return NextResponse.json({ aviso: null });

  // ⚠⚠ SÓ QUEM ASSISTIU DE FATO SAI DA LISTA. Vitor (30/08/2026): "quem abrir uma única vez já tira
  // o vídeo para ele; agora quem não abrir, deixar lá para mostrar até o dia que o camarada for
  // abrir". Quem caiu no caminho de falha (vídeo não carregou, wifi da fábrica) tem `assistiu:false`
  // — esse volta a ver no próximo login, que é o certo: ele não viu a campanha, só foi liberado
  // para trabalhar. Antes, uma falha de conexão apagava o comunicado para sempre.
  const visto = await prisma.muralCiencia.findUnique({
    where: { avisoId_userId: { avisoId: aviso.id, userId } },
    select: { assistiu: true },
  });
  if (visto?.assistiu) return NextResponse.json({ aviso: null });

  return NextResponse.json({ aviso });
}

const schema = z.object({
  avisoId: z.string().min(1),
  assistiu: z.boolean().optional(),
  motivo: z.string().max(300).optional(),
});

export async function POST(req) {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400 }); }

  // ⚠ upsert e não create: dois cliques, duas abas ou um retry de rede não podem virar erro na cara
  // de quem acabou de assistir. A unique (avisoId,userId) garante uma linha por pessoa.
  // ⚠ o `update` agora escreve: quem falhou na primeira vez e assistiu na segunda precisa passar de
  // assistiu=false para true. Com `update: {}` a segunda tentativa era ignorada em silêncio e a
  // pessoa ficaria vendo o comunicado até o fim da campanha, mesmo tendo assistido.
  const assistiu = body.assistiu !== false;
  await prisma.muralCiencia.upsert({
    where: { avisoId_userId: { avisoId: body.avisoId, userId } },
    create: { avisoId: body.avisoId, userId, assistiu, motivo: body.motivo?.trim() || null },
    update: assistiu
      ? { assistiu: true, motivo: null, vistoEm: new Date() }
      : {}, // uma falha não sobrescreve um "assistiu" anterior
  });
  return NextResponse.json({ success: true });
}
