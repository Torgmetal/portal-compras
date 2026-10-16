// POST /api/engenharia-ia/aparelho/iniciar — o app pede um código para ligar o PC à conta (F1, pareamento).
// Público: o app ainda não tem credencial nenhuma. Devolve o código curto (que o projetista digita no portal) e o
// segredo de espera (com que o app consulta o status). No banco, só o hash do segredo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gerarTokenForte } from "@/lib/token";
import { gerarCodigoPareamento, hashToken } from "@/lib/ia-engenharia";

export const runtime = "nodejs";
const VALIDADE_MS = 10 * 60_000;
const MAX_POR_HORA = 50; // anti-enxurrada: a rota é pública

const schema = z.object({ nome: z.string().trim().min(1, "Informe o nome do computador").max(60) });

export async function POST(req) {
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e?.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const recentes = await prisma.iaAparelho.count({ where: { status: "PAREANDO", createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recentes >= MAX_POR_HORA) return NextResponse.json({ error: "Muitos pedidos de pareamento agora. Tente em alguns minutos." }, { status: 429 });

  const espera = gerarTokenForte();
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoPareamento();
    try {
      const ap = await prisma.iaAparelho.create({ data: { nome: body.nome, status: "PAREANDO", codigo, codigoExpiraEm: new Date(Date.now() + VALIDADE_MS), esperaHash: hashToken(espera) } });
      return NextResponse.json({ codigo: ap.codigo, espera, expiraEm: ap.codigoExpiraEm, vincularEm: "/engenharia/ia/vincular" }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e?.code !== "P2002") throw e; // código repetido: sorteia outro
    }
  }
  return NextResponse.json({ error: "Não consegui gerar um código livre. Tente de novo." }, { status: 503 });
}
