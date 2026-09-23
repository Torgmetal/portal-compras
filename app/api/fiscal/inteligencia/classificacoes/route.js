import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAcesso } from "@/lib/session";
import { listar, propor } from "@/lib/fiscal/registro-classificacao";
import { STATUS } from "@/lib/fiscal/classificacao-produto";

// O REGISTRO DE CLASSIFICAÇÃO DE PRODUTO (§14 do briefing).
//
// ⚠⚠ ISTO NÃO É UMA TELA DE CADASTRO, É UM LIVRO DE DECISÕES. Matheus (22/09/2026): *"utilizamos o
// item ARMAÇÃO DE ESTRUTURA METÁLICA para todos os faturamentos, só alteramos o NCM conforme o
// cliente solicita"*. Enquanto isso vive na cabeça de quem emite, não existe o que auditar. O que
// esta rota guarda é a decisão: qual peça, qual NCM, com que fundamento, aprovada por quem e quando.
//
// ⚠⚠ E NÃO EXISTE CAMPO DE CLIENTE, DE PROPÓSITO. A classificação segue a natureza do produto;
// gravar "NCM X para o cliente Y" seria o portal carimbando como regra exatamente a prática que o
// briefing manda questionar.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

const esquema = z.object({
  codigoProduto: z.string().trim().max(60).optional().nullable(),
  padraoDescricao: z.string().trim().min(3, "O padrão precisa de pelo menos 3 caracteres.").max(200),
  ncm: z.string().trim().regex(/^\d{4}\.?\d{2}\.?\d{2}$/, "O NCM tem 8 dígitos."),
  // ⚠⚠ FUNDAMENTO OBRIGATÓRIO. Sem ele o registro vira uma lista de NCMs sem quem responda por
  // eles — e a auditoria continuaria sem ter contra o quê comparar, só que com mais telas.
  fundamento: z.string().trim().min(10, "Escreva o fundamento — é ele que sustenta a decisão."),
  normaChave: z.string().trim().max(120).optional().nullable(),
  observacao: z.string().trim().max(1000).optional().nullable(),
});

export async function GET(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) { return negado(e); }

  const status = new URL(req.url).searchParams.get("status");
  const filtro = Object.values(STATUS).includes(status) ? status : undefined;
  return NextResponse.json({ success: true, classificacoes: await listar({ status: filtro }) });
}

export async function POST(req) {
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) { return negado(e); }

  let dados;
  try {
    dados = esquema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    // ⚠ Nasce PROPOSTA e não orienta ninguém até ser aprovada — propor é barato de propósito.
    return NextResponse.json({ success: true, classificacao: await propor(dados, user) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}
