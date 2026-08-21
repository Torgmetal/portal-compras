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

/**
 * DELETE — apaga registros do celular que ainda não viraram relatório.
 *
 * Vitor (21/08/2026): "precisa ter a opção para excluir esses que foram emitidos na página da
 * qualidade". Foto de teste, foto tremida, foto na OP errada — sem isso ficam empilhando na fila e
 * a tela deixa de mostrar o que é trabalho de verdade.
 *
 * Aceita `{ ids: [...] }` (uma ou várias) ou `{ opNumero, tipo }` (o grupo inteiro).
 *
 * 🚫 FOTO QUE JÁ ESTÁ NUM RELATÓRIO NÃO SE APAGA POR AQUI. Ela virou evidência de um documento
 * numerado — some da folha e o relatório passa a mostrar uma inspeção que não bate com o que foi
 * assinado. Para tirar dali, é o relatório que tem de mudar.
 */
export async function DELETE(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
  const opNumero = String(body?.opNumero || "").trim();
  const tipo = String(body?.tipo || "").trim();
  if (!ids.length && !(opNumero && tipo)) {
    return NextResponse.json({ error: "Informe as fotos ou o grupo (OP + tipo)." }, { status: 400 });
  }

  const alvo = await prisma.fotoInspecao.findMany({
    where: {
      relatorioId: null, // ⚠ a trava: só o que ainda não é documento
      ...(ids.length ? { id: { in: ids } } : { opNumero, tipo }),
    },
    select: { id: true, url: true },
  });
  if (!alvo.length) return NextResponse.json({ error: "Nada para apagar (as fotos podem já estar num relatório)." }, { status: 409 });

  await prisma.fotoInspecao.deleteMany({ where: { id: { in: alvo.map((f) => f.id) } } });

  // o arquivo no Blob também sai — linha apagada com arquivo órfão é conta crescendo à toa
  try {
    const { del } = await import("@vercel/blob");
    await del(alvo.map((f) => f.url));
  } catch { /* o registro já saiu; o arquivo órfão não quebra nada */ }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "EXCLUIR_FOTO_INSPECAO", entity: "FotoInspecao",
      entityId: ids.length ? ids.join(",").slice(0, 200) : `${opNumero}|${tipo}`,
      diff: { apagadas: alvo.length, opNumero: opNumero || null, tipo: tipo || null },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, apagadas: alvo.length });
}
