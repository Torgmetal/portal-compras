// GET   — o relatório para a tela de edição/prévia.
// PATCH  — salva o que o elaborador preencheu (dimensões encontradas, resultados, observações).
//
// Vitor (21/08/2026): "as dimensões encontradas você deve deixar para o elaborador do relatório
// preencher". É este PATCH que recebe isso.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { vincularNoDataBook } from "@/lib/relatorio-inspecao";

export const runtime = "nodejs";

const PERFIS = ["ADMIN", "QUALIDADE"];
const RESULTADOS = new Set(["APROVADO", "REPROVADO", "RETRABALHAR", null]);

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  const [fotos, assinaturas] = await Promise.all([
    prisma.fotoInspecao.findMany({
      where: { relatorioId: id },
      select: { id: true, url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
      orderBy: { capturadaEm: "asc" },
    }),
    rel.envioAssinaturaId
      ? prisma.assinaturaDocumento.findMany({
          where: { envioId: rel.envioAssinaturaId },
          select: { nome: true, email: true, setor: true, assinadoEm: true, ip: true },
          orderBy: { nome: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ relatorio: rel, fotos, assinaturas });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  // ⚠ relatório JÁ ENVIADO para assinatura não se edita. Quem assinou validou um conteúdo; mudar
  // por baixo faz a assinatura valer para um documento que a pessoa não viu — o mesmo raciocínio
  // da revisão do data book.
  if (rel.envioAssinaturaId) {
    return NextResponse.json({ error: "Este relatório já foi enviado para assinatura e não pode mais ser alterado." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const dados = {};

  if (body.titulo !== undefined) dados.titulo = String(body.titulo || "").trim() || null;
  if (body.observacoes !== undefined) dados.observacoes = String(body.observacoes || "").trim() || null;
  if (body.inspetor !== undefined) dados.inspetor = String(body.inspetor || "").trim() || null;

  if (Array.isArray(body.linhas)) {
    dados.linhas = body.linhas.slice(0, 400).map((l) => ({
      marca: String(l?.marca || "").slice(0, 60),
      conjunto: l?.conjunto ? String(l.conjunto).slice(0, 60) : null,
      qtd: Number.isFinite(Number(l?.qtd)) ? Number(l.qtd) : null,
      descricao: l?.descricao ? String(l.descricao).slice(0, 120) : null,
      material: l?.material ? String(l.material).slice(0, 60) : null,
      projetoMm: Number.isFinite(Number(l?.projetoMm)) ? Number(l.projetoMm) : null,
      tolerancia: l?.tolerancia ? String(l.tolerancia).slice(0, 40) : null,
      encontradoMm: Number.isFinite(Number(l?.encontradoMm)) ? Number(l.encontradoMm) : null,
      obs: l?.obs ? String(l.obs).slice(0, 160) : null,
    }));
  }

  if (body.resultados && typeof body.resultados === "object") {
    const r = body.resultados;
    const ok = (v) => (v == null || RESULTADOS.has(v) ? v ?? null : null);
    dados.resultados = {
      ...(rel.resultados || {}),
      dimensional: ok(r.dimensional),
      alinhamento: ok(r.alinhamento),
      acabamento: ok(r.acabamento),
      resultado: ok(r.resultado),
    };
  }

  const atualizado = await prisma.relatorioInspecao.update({ where: { id }, data: dados });

  // o nome do documento na seção acompanha o título
  if (dados.titulo !== undefined && atualizado.documentoId) {
    await vincularNoDataBook(atualizado, null).catch(() => {});
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_RELATORIO_INSPECAO", entity: "RelatorioInspecao", entityId: id, diff: { campos: Object.keys(dados) } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, relatorio: atualizado });
}

/**
 * DELETE — apaga um relatório de inspeção.
 *
 * Vitor (21/08/2026): "preciso de permissão para poder apagar esses relatórios".
 *
 * ⚠ APAGAR TEM DE LIMPAR O DATA BOOK JUNTO. O relatório cria um DocumentoQualidade e o amarra na
 * seção; deixar isso para trás encheria o data book de anexo apontando para relatório inexistente —
 * e o data book é documento que vai ao cliente.
 *
 * ⚠ Já ENVIADO PARA ASSINATURA não se apaga. Ali existem convites por e-mail e possivelmente
 * assinaturas de terceiros; sumir com o documento por baixo de quem assinou é o tipo de coisa que
 * não se desfaz. Só ADMIN passa, e ainda assim o registro fica no log.
 *
 * ⚠ As FOTOS não são apagadas: voltam a ser fotos soltas, na tela de inspeções, e podem virar outro
 * relatório. Quem tira foto na fábrica não deveria perder o trabalho por causa de um relatório
 * montado errado.
 */
export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id: params.id },
    select: { id: true, codigo: true, opNumero: true, tipo: true, documentoId: true, envioAssinaturaId: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const ehAdmin = user.tipo === "ADMIN" || user.role === "ADMIN";
  if (rel.envioAssinaturaId && !ehAdmin) {
    return NextResponse.json(
      { error: "Este relatório já foi enviado para assinatura. Só um administrador pode apagá-lo." },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1) solta as fotos — elas voltam para a fila de fotos soltas
      await tx.fotoInspecao.updateMany({ where: { relatorioId: rel.id }, data: { relatorioId: null } });

      // 2) tira o anexo do data book e apaga o documento que este relatório criou
      if (rel.documentoId) {
        await tx.dataBookSecaoDoc.deleteMany({ where: { documentoId: rel.documentoId } });
        await tx.documentoQualidade.deleteMany({ where: { id: rel.documentoId, origem: "inspecao_campo" } });
      }

      // 3) e o próprio relatório
      await tx.relatorioInspecao.delete({ where: { id: rel.id } });
    });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui apagar: ${e.message}` }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "EXCLUIR_RELATORIO_INSPECAO", entity: "RelatorioInspecao", entityId: rel.id,
      diff: { codigo: rel.codigo, opNumero: rel.opNumero, tipo: rel.tipo, tinhaAssinatura: !!rel.envioAssinaturaId },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, codigo: rel.codigo });
}
