// GET /api/portal/[token]/rm?numero=T97-001-R00
//   → a requisição de material da obra, SEM VALOR NENHUM, para o cliente ver de onde o material foi
//     pedido.
//
// Vitor (04/09/2026): "uma vista da RM sem valores seria ótimo" — depois de eu levantar que o
// `RMItem` guarda `valorTotal`, `valorDiaria` e `atendidoEstoquePreco`, e que abrir a RM inteira no
// portal entregaria o nosso custo de compra.
//
// ⚠⚠ A ESCOLHA DOS CAMPOS É A REGRA DE SEGURANÇA, e por isso ela é campo a campo: nunca
// `select: undefined`, nunca espalhamento do objeto. Um `...item` aqui vaza preço no dia em que
// alguém acrescentar uma coluna.
//
// ⚠⚠ E A RM TEM DE SER DESTA OBRA. O token abre o portal de UMA OP; aceitar qualquer número de RM
// deixaria o cliente ler a requisição da obra do concorrente com o link dele. O filtro por `opId`
// não é conforto, é o que separa um portal de um vazamento.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal, portalExpirado } from "@/lib/portal-cliente";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limitar = createRateLimiter({ janelaMs: 60_000, max: 60 });

export async function GET(req, { params }) {
  const { token } = await params;
  const rl = limitar(`rm:${token}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Muitas consultas seguidas. Aguarde um instante." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO" || portalExpirado(portal)) {
    return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  }
  if (!secoesDoPortal(portal).includes("MODELO_NAVEGAVEL")) {
    return NextResponse.json({ error: "Indisponível." }, { status: 403 });
  }

  const numero = String(new URL(req.url).searchParams.get("numero") || "").trim();
  if (!numero) return NextResponse.json({ error: "Informe a RM." }, { status: 400 });

  const op = await prisma.oP.findFirst({ where: { numero: portal.opNumero }, select: { id: true } });
  if (!op) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });

  const rm = await prisma.rM.findFirst({
    where: { numero, opId: op.id },
    select: {
      numero: true, descricao: true, tipo: true, createdAt: true,
      // ⚠ quem pediu é o SETOR, não a pessoa: o nome de quem digitou a requisição é assunto
      // interno, e para o cliente o que responde "de onde foi solicitado" é a área.
      setor: true,
      itens: {
        where: { status: { not: "CANCELADO" } },
        // ⚠ SEM valorTotal, valorDiaria, atendidoEstoquePreco, pedidoOmieId nem fornecedor.
        select: { descricao: true, material: true, qtd: true, unidade: true, peso: true, tratamento: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  if (!rm) return NextResponse.json({ error: "Esta requisição não é desta obra." }, { status: 404 });

  return NextResponse.json({
    numero: rm.numero,
    descricao: rm.descricao,
    tipo: rm.tipo,
    setor: rm.setor || null,
    solicitadaEm: rm.createdAt ? rm.createdAt.toISOString() : null,
    itens: rm.itens.map((i) => ({
      descricao: i.descricao, material: i.material || null, tratamento: i.tratamento || null,
      qtd: i.qtd ?? null, unidade: i.unidade || null, pesoKg: i.peso ?? null,
    })),
    // ⚠ o total em kg é o que o cliente consegue conferir contra a lista da obra dele
    pesoTotalKg: Math.round(rm.itens.reduce((s, i) => s + (Number(i.peso) || 0), 0)),
  });
}
