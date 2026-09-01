// CMR — lançamento de recebimentos de matéria-prima (Controle de Materiais Rastreáveis).
//   GET ?ano=2026&q=  → lista os lançamentos do ano (DocumentoQualidade categoria MATERIAL).
//   POST { lancamentos: [ {...} ] } → grava 1..N lançamentos com índice R automático por ano.
// Estoque/Almoxarifado lança; concilia com as RMs (lib/recebimento-cmr.js).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CMR_CAT, prefixoAno, proximoIndiceR, mapearLancamento, aprenderReferencias } from "@/lib/cmr";
import { appendLinhasCmr } from "@/lib/cmr-sharepoint";
import { ehCascaVazia } from "@/lib/cmr-reconciliar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ALMOXARIFADO", "COMPRAS", "PCP", "PLANEJAMENTO", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const sp = new URL(req.url).searchParams;
  const ano = Number(sp.get("ano")) || new Date().getFullYear();
  const q = (sp.get("q") || "").trim();
  const pre = prefixoAno(ano);

  const where = { categoria: CMR_CAT, importRef: { startsWith: pre } };
  if (q) where.OR = [
    { nome: { contains: q, mode: "insensitive" } },
    { fornecedor: { contains: q, mode: "insensitive" } },
    { opNumero: { contains: q, mode: "insensitive" } },
    { nfNumero: { contains: q, mode: "insensitive" } },
    { importRef: { contains: q } },
    { numeroCorrida: { contains: q, mode: "insensitive" } },
  ];

  const [rows, total, anosRaw] = await Promise.all([
    prisma.documentoQualidade.findMany({
      where, orderBy: { importRef: "desc" }, take: 6000,
      select: {
        id: true, importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true,
        numeroDocumento: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true,
        pesoKg: true, quantidade: true, observacao: true, arquivoUrl: true, origem: true,
      },
    }),
    prisma.documentoQualidade.count({ where: { categoria: CMR_CAT, importRef: { startsWith: pre } } }),
    prisma.documentoQualidade.findMany({ where: { categoria: CMR_CAT, importRef: { not: null } }, select: { importRef: true }, distinct: ["importRef"], take: 20000 }),
  ]);
  const anos = [...new Set(anosRaw.map((r) => 2000 + Number(String(r.importRef).slice(0, 2))).filter((a) => a >= 2000 && a < 2100))].sort((a, b) => b - a);
  // Esconde as "cascas" — R reservado, sem NENHUMA informação (só o índice). Aparecem quando
  // o material chega e a linha é preenchida (na planilha ou aqui). Não são deletadas.
  const itens = rows.filter((r) => !ehCascaVazia(r));
  return NextResponse.json({ success: true, ano, total: itens.length, itens, anos: anos.length ? anos : [ano] });
}

const lancSchema = z.object({
  rc: z.string().max(10).nullable().optional(),
  descricao: z.string().min(1, "Descrição obrigatória").max(300),
  especificacao: z.string().max(120).nullable().optional(),
  certificado: z.string().max(120).nullable().optional(),
  loteCorrida: z.string().max(120).nullable().optional(),
  pedidoCompra: z.string().max(60).nullable().optional(),
  dataRecebimento: z.union([z.string(), z.number()]).nullable().optional(),
  nf: z.string().max(60).nullable().optional(),
  fornecedor: z.string().max(120).nullable().optional(),
  obra: z.string().max(60).nullable().optional(),
  qtd: z.union([z.string(), z.number()]).nullable().optional(),
  pesoLitro: z.union([z.string(), z.number()]).nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
  arquivoUrl: z.string().max(500).nullable().optional(),
  arquivoNome: z.string().max(200).nullable().optional(),
}).passthrough();

const schema = z.object({ ano: z.number().int().optional(), lancamentos: z.array(lancSchema).min(1).max(500) });

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ano = body.ano || new Date().getFullYear();
  const pre = prefixoAno(ano);
  // Sequencial inicial do ano; incrementa em memória (evita corrida entre as linhas do lote).
  let base = await proximoIndiceR(ano); // ex.: 261206
  let seq = Number(String(base).slice(2));

  const criados = [];
  const linhasSP = []; // p/ espelhar na planilha do SharePoint (mesma ordem/índice R)
  for (const l of body.lancamentos) {
    const indiceR = `${pre}${String(seq).padStart(4, "0")}`;
    seq++;
    const data = mapearLancamento(l, indiceR, user.id);
    try {
      const doc = await prisma.documentoQualidade.create({ data, select: { id: true, importRef: true } });
      criados.push(doc);
      linhasSP.push({
        rc: l.rc, indiceR, descricao: l.descricao, certificado: l.certificado, loteCorrida: l.loteCorrida,
        especificacao: l.especificacao, pedidoCompra: l.pedidoCompra, dataRecebimento: l.dataRecebimento,
        nf: l.nf, fornecedor: l.fornecedor, obra: l.obra, qtd: l.qtd, pesoLitro: l.pesoLitro, observacao: l.observacao,
      });
    } catch (e) { return NextResponse.json({ error: `Falha ao gravar (${indiceR}): ${e.message}`, criados: criados.length }, { status: 500 }); }
  }
  await aprenderReferencias(body.lancamentos).catch(() => {});
  await prisma.auditLog.create({ data: { userId: user.id, action: "CMR_LANCAR", entity: "DocumentoQualidade", entityId: String(criados.length), diff: { ano, qtd: criados.length, de: criados[0]?.importRef, ate: criados[criados.length - 1]?.importRef } } }).catch(() => {});

  // Espelha na planilha do SharePoint (best-effort — NUNCA trava o lançamento no portal).
  let planilha = null;
  try { planilha = await appendLinhasCmr(ano, linhasSP); }
  catch (e) { planilha = { ok: false, erro: e.message }; }

  return NextResponse.json({ success: true, criados: criados.length, indices: criados.map((c) => c.importRef), planilha });
}
