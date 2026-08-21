// GET  — fotos capturadas no celular (soltas) + relatórios já montados.
// POST — monta o relatório a partir das fotos escolhidas, numera e coloca na seção do data book.
//
// Vitor (21/08/2026): "não quero que só apareça no pdf, precisa aparecer na estruturação".
// Por isso o POST já vincula: o relatório vira DocumentoQualidade na seção, aparece na lista do
// data book e entra no PDF pelo mesmo caminho de qualquer outro anexo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarRelatorio, vincularNoDataBook } from "@/lib/relatorio-inspecao";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERFIS = ["ADMIN", "QUALIDADE"];

export async function GET(req) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const opNumero = url.searchParams.get("opNumero");

  const [soltas, relatorios] = await Promise.all([
    // fotos que ainda não viraram documento — é o trabalho pendente da Qualidade
    prisma.fotoInspecao.findMany({
      where: { relatorioId: null, ...(opNumero ? { opNumero } : {}) },
      select: {
        id: true, opId: true, opNumero: true, tipo: true, marca: true, origemMarca: true,
        observacao: true, url: true, autorNome: true, capturadaEm: true,
      },
      orderBy: { capturadaEm: "desc" },
      take: 400,
    }),
    prisma.relatorioInspecao.findMany({
      where: opNumero ? { opNumero } : {},
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
  ]);

  // contagem de fotos por relatório, numa consulta só
  const ids = relatorios.map((r) => r.id);
  const contagem = ids.length
    ? await prisma.fotoInspecao.groupBy({ by: ["relatorioId"], where: { relatorioId: { in: ids } }, _count: true })
    : [];
  const porRel = new Map(contagem.map((c) => [c.relatorioId, c._count]));

  // status de assinatura de cada relatório já enviado
  const envios = relatorios.map((r) => r.envioAssinaturaId).filter(Boolean);
  const assinaturas = envios.length
    ? await prisma.assinaturaDocumento.findMany({
        where: { envioId: { in: envios } },
        select: { envioId: true, nome: true, setor: true, email: true, assinadoEm: true },
      })
    : [];
  const porEnvio = new Map();
  for (const a of assinaturas) {
    const l = porEnvio.get(a.envioId) || [];
    l.push(a); porEnvio.set(a.envioId, l);
  }

  return NextResponse.json({
    soltas,
    relatorios: relatorios.map((r) => ({
      ...r,
      fotos: porRel.get(r.id) || 0,
      assinaturas: r.envioAssinaturaId ? porEnvio.get(r.envioAssinaturaId) || [] : [],
    })),
  });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  try {
    const rel = await criarRelatorio({
      opId: body?.opId, opNumero: String(body?.opNumero || "").trim(), tipo: String(body?.tipo || "").trim(),
      fotoIds: body?.fotoIds, titulo: body?.titulo, observacoes: body?.observacoes, inspetor: body?.inspetor,
      user,
    });

    // aparece na estruturação já na criação; o PDF é gerado sob demanda pela rota /pdf
    const vinculo = await vincularNoDataBook(rel, null);

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "CRIAR_RELATORIO_INSPECAO", entity: "RelatorioInspecao", entityId: rel.id,
        diff: { codigo: rel.codigo, opNumero: rel.opNumero, tipo: rel.tipo, fotos: rel.fotos, vinculo },
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, relatorio: rel, vinculo });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
