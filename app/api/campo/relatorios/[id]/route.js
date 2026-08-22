// GET   — abre um relatório para medir no celular.
// PATCH — grava o que o inspetor mediu.
//
// ⚠ O INSPETOR DE CAMPO SÓ ESCREVE O QUE MEDIU. Dimensão de projeto, tolerância, cotas marcadas e
// cabeçalho são de quem montou o relatório no computador — chegam prontos e não são editáveis aqui.
// É o desenho que o Vitor descreveu: "alguém cria as informações iniciais, o inspetor informa as
// medidas encontradas".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO, TIPO_LABEL } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id },
    select: {
      id: true, codigo: true, tipo: true, titulo: true, opNumero: true, marcas: true,
      linhas: true, resultados: true, equipamentos: true, inspetor: true, envioAssinaturaId: true,
    },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (rel.envioAssinaturaId) return NextResponse.json({ error: "Este relatório já foi enviado para assinatura." }, { status: 409 });

  return NextResponse.json({ relatorio: { ...rel, tipoLabel: TIPO_LABEL[rel.tipo] || rel.tipo } });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id }, select: { id: true, codigo: true, linhas: true, resultados: true, envioAssinaturaId: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (rel.envioAssinaturaId) return NextResponse.json({ error: "Este relatório já foi enviado para assinatura." }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const originais = Array.isArray(rel.linhas) ? rel.linhas : [];
  const medidas = Array.isArray(body.medidas) ? body.medidas : [];

  // ⚠ MESCLA POR ÍNDICE, não substitui a lista. Se o celular mandasse as linhas inteiras, uma versão
  // antiga aberta no bolso apagaria a cota que a Qualidade acabou de acrescentar no computador.
  const linhas = originais.map((l, i) => {
    const m = medidas.find((x) => x.i === i);
    if (!m) return l;
    const novo = { ...l };
    if (m.encontradoMm !== undefined) novo.encontradoMm = num(m.encontradoMm);
    if (m.laudo !== undefined) novo.laudo = m.laudo ? String(m.laudo).slice(0, 10) : null;
    if (m.descontinuidade !== undefined) novo.descontinuidade = m.descontinuidade ? String(m.descontinuidade).slice(0, 40) : null;
    if (m.obs !== undefined) novo.obs = m.obs ? String(m.obs).slice(0, 160) : null;
    return novo;
  });

  const dados = { linhas };
  if (Array.isArray(body.equipamentos)) {
    dados.equipamentos = body.equipamentos.slice(0, 20).map((e) => ({
      id: e?.id || null, nome: String(e?.nome || "").slice(0, 120),
      certificado: e?.certificado ? String(e.certificado).slice(0, 60) : null,
      validade: e?.validade ? String(e.validade).slice(0, 10) : null,
      vencido: !!e?.vencido,
    }));
  }
  // quem mediu assina o campo do inspetor, se ainda estiver vazio
  if (body.assumirInspetor) dados.inspetor = user.name || null;
  if (body.iluminacao !== undefined) {
    dados.resultados = { ...(rel.resultados || {}), iluminacao: body.iluminacao == null ? null : String(body.iluminacao).slice(0, 20) };
  }

  const atualizado = await prisma.relatorioInspecao.update({ where: { id }, data: dados });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "MEDIR_RELATORIO_CAMPO", entity: "RelatorioInspecao", entityId: id,
      diff: { codigo: rel.codigo, medidas: medidas.length, equipamentos: dados.equipamentos?.length ?? null },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, relatorio: { id: atualizado.id, codigo: atualizado.codigo } });
}
