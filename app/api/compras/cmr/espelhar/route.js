// POST /api/compras/cmr/espelhar { ano, indices: ["260123", …] }
// Anexa na planilha do SharePoint linhas que JÁ existem no portal. É a segunda metade do
// lançamento, separada para o botão "Lançar" não esperar o Graph.
//
// ⚠⚠ MATHEUS (11/09/2026): "está lento o botão de lançar; quando clicar já entrar na linha e ir
// carregando o que precisar nesse meio tempo". O que custava os segundos era o writeback: seis
// chamadas ao Graph presas na frente da resposta. Agora o POST responde quando o R existe no banco
// e a tela chama esta rota em seguida, com a linha já na tabela.
//
// ⚠⚠ OS DADOS SÃO RELIDOS DO BANCO, não recebidos do navegador. A rota aceita índices R, não linhas.
// Aceitar o conteúdo faria a planilha do servidor — que é documento de rastreabilidade — poder
// receber qualquer coisa de qualquer chamada; do jeito que está, ela só pode espelhar o que o portal
// já gravou.
//
// ⚠ NÃO É O ÚNICO CAMINHO. Se esta chamada não acontecer (aba fechada, rede caiu), a reconciliação
// diária reenvia os R que o portal tem e a planilha não. Isto é o caminho RÁPIDO, não o único.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT } from "@/lib/cmr";
import { appendLinhasCmr } from "@/lib/cmr-sharepoint";
import { parseObsCmr } from "@/lib/cmr-reconciliar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

const schema = z.object({
  ano: z.number().int(),
  indices: z.array(z.string().min(3).max(10)).min(1).max(500),
});

export async function POST(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const rows = await prisma.documentoQualidade.findMany({
    where: { categoria: CMR_CAT, importRef: { in: body.indices } },
    orderBy: { importRef: "asc" },
  });
  if (!rows.length) return NextResponse.json({ success: true, ok: true, anexadas: 0 });

  const linhas = rows.map((r) => {
    const { rc, obs } = parseObsCmr(r.observacao);
    return {
      rc, indiceR: r.importRef, descricao: r.nome, certificado: r.numeroDocumento,
      loteCorrida: r.numeroCorrida, especificacao: r.norma, pedidoCompra: r.pedidoCompra,
      dataRecebimento: r.dataRecebimento, nf: r.nfNumero, fornecedor: r.fornecedor,
      obra: r.opNumero, qtd: r.quantidade, pesoLitro: r.pesoKg, observacao: obs,
    };
  });

  try {
    const r = await appendLinhasCmr(body.ano, linhas);
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    // ⚠ 200 com `ok: false`, não 500: a linha ESTÁ gravada no portal. Um erro aqui é "a planilha
    // ainda não recebeu", e a tela precisa dizer isso sem sugerir que o lançamento falhou.
    return NextResponse.json({ success: true, ok: false, erro: e.message });
  }
}
