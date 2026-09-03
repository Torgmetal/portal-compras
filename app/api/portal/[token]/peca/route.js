// GET /api/portal/[token]/peca?marca=…   → o que o cliente pode saber daquela peça
// GET /api/portal/[token]/peca?panorama=1 → o resumo da obra por etapa
//
// ⚠⚠ TUDO PASSA POR lib/portal-obra-consulta. Esta rota não consulta o banco por conta própria: a
// regra do que o cliente vê mora num arquivo só, e é o mesmo que o Torguinho do cliente vai usar.
// Rota que monta a própria query é rota que um dia devolve custo por engano.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pecaParaCliente, panoramaDaObra } from "@/lib/portal-obra-consulta";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ⚠ o link do portal é público por natureza (quem tem o endereço entra). Limite por TOKEN evita que
// um link vazado vire uma varredura da obra inteira, marca por marca.
const limiter = createRateLimiter({ name: "portal-peca", maxRequests: 90, windowMs: 60_000 });

export async function GET(req, { params }) {
  const { token } = await params;
  const rl = limiter(req, `portal:${token}`);
  if (!rl.success) return NextResponse.json({ error: "Muitas consultas seguidas. Aguarde um instante." }, { status: 429, headers: rateLimitHeaders(rl) });

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (!secoesDoPortal(portal).includes("MODELO_NAVEGAVEL")) return NextResponse.json({ error: "Indisponível." }, { status: 403 });

  const op = await prisma.oP.findFirst({ where: { numero: portal.opNumero }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  try {
    if (searchParams.get("panorama")) {
      return NextResponse.json(await panoramaDaObra({ opId: op.id, opNumero: op.numero }));
    }
    const marca = searchParams.get("marca");
    if (!marca) return NextResponse.json({ error: "Informe a marca." }, { status: 400 });
    const d = await pecaParaCliente({ opId: op.id, opNumero: op.numero, marca });
    if (!d) return NextResponse.json({ error: "Esta marca não está nas listas desta obra." }, { status: 404 });
    return NextResponse.json(d);
  } catch {
    // ⚠ mensagem neutra: erro nosso não vira texto técnico na tela do cliente.
    return NextResponse.json({ error: "Não consegui consultar agora." }, { status: 500 });
  }
}
