// Detalhe e edição da Matriz de Competências de um cargo (FORM-11).
// GET  → cargo + competências (com nível esperado) + funcionários com nível atual.
// PATCH → salva descrição/área, metadados da matriz, o conjunto de competências
//         (upsert por nome) e as avaliações dos funcionários (nível atual).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";
import { checarRegraDocumento, REGRAS_DOCUMENTOS } from "@/lib/regras-documentos";
import { documentosDeProntuarioSeguro, mesclarDocs, nrDoArquivo, NR_PARA_TIPO } from "@/lib/prontuario-certificados";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cargo = await prisma.cargo.findUnique({
    where: { id: params.cargoId },
    select: {
      id: true, nome: true, nivel: true, categoria: true, area: true, descricao: true, matriz: true,
      competencias: { select: { competenciaId: true, nivelEsperado: true, competencia: { select: { nome: true, descricao: true, categoria: true } } } },
      funcionarios: {
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: {
          id: true, nome: true, matricula: true,
          competencias: { select: { competenciaId: true, nivelAtual: true, avaliadoEm: true } },
          documentos: { where: { ativo: true }, select: { tipo: true, dataEmissao: true, dataValidade: true, createdAt: true } },
        },
      },
    },
  });
  if (!cargo) return NextResponse.json({ error: "Cargo não encontrado" }, { status: 404 });

  const competencias = cargo.competencias
    .map((cc) => ({ competenciaId: cc.competenciaId, nome: cc.competencia.nome, descricao: cc.competencia.descricao, categoria: cc.competencia.categoria, nivelEsperado: cc.nivelEsperado }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // Qualificações da matriz (seção 4) que viram documento/certificado (NR-12, NR-06, NR-35…):
  // cada uma vira uma regra da CCT e a conformidade de cada funcionário é checada nos documentos
  // dele — RH + certificados do Prontuário Eletrônico (complementando, sem duplicar tipo).
  const qualifMatriz = Array.isArray(cargo.matriz?.qualificacoes) ? cargo.matriz.qualificacoes : [];
  const docQualifs = new Map(); // tipo -> { tipo, nome, evidencia, regra }
  for (const q of qualifMatriz) {
    const tipo = NR_PARA_TIPO[nrDoArquivo(q.item || "")];
    if (!tipo || docQualifs.has(tipo)) continue;
    const regra = REGRAS_DOCUMENTOS.find((r) => r.tipo === tipo);
    if (regra) docQualifs.set(tipo, { tipo, nome: q.item, evidencia: q.evidencia || null, regra });
  }
  const qualifs = [...docQualifs.values()];

  let docsPorFunc = new Map();
  if (qualifs.length) {
    ({ docsPorFunc } = await documentosDeProntuarioSeguro(cargo.funcionarios.map((f) => ({ id: f.id, nome: f.nome }))));
  }

  const funcionarios = cargo.funcionarios.map((f) => {
    const niveis = {};
    for (const fc of f.competencias) niveis[fc.competenciaId] = fc.nivelAtual;
    const docsF = mesclarDocs(f.documentos, docsPorFunc.get(f.id));
    const itens = qualifs.map((q) => ({ tipo: q.tipo, nome: q.nome, status: checarRegraDocumento(q.regra, docsF).status }));
    const emDia = itens.filter((i) => i.status === "OK" || i.status === "VENCENDO").length;
    const conformidade = { itens, emDia, total: itens.length, percentual: itens.length ? Math.round((emDia / itens.length) * 100) : null };
    return { id: f.id, nome: f.nome, matricula: f.matricula, niveis, conformidade };
  });

  const qualificacoesDoc = qualifs.map((q) => ({ tipo: q.tipo, nome: q.nome, evidencia: q.evidencia }));

  return NextResponse.json({
    cargo: { id: cargo.id, nome: cargo.nome, nivel: cargo.nivel, categoria: cargo.categoria, area: cargo.area, descricao: cargo.descricao, matriz: cargo.matriz || null },
    competencias, funcionarios, qualificacoesDoc,
  });
}

const schema = z.object({
  descricao: z.string().max(8000).optional().nullable(),
  area: z.string().max(200).optional().nullable(),
  matriz: z.any().optional().nullable(),
  competencias: z.array(z.object({
    nome: z.string().min(1).max(200),
    descricao: z.string().max(1000).optional().nullable(),
    categoria: z.string().max(80).optional().nullable(),
    nivelEsperado: z.coerce.number().int().min(1).max(5),
  })).optional(),
  avaliacoes: z.array(z.object({
    funcionarioId: z.string().min(1),
    competenciaId: z.string().min(1),
    nivelAtual: z.coerce.number().int().min(1).max(5),
  })).optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cargo = await prisma.cargo.findUnique({ where: { id: params.cargoId }, select: { id: true } });
  if (!cargo) return NextResponse.json({ error: "Cargo não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // Campos simples do cargo + metadados da matriz.
  const data = {};
  if (body.descricao !== undefined) data.descricao = body.descricao?.trim() || null;
  if (body.area !== undefined) data.area = body.area?.trim() || null;
  if (body.matriz !== undefined) data.matriz = body.matriz || null;
  if (Object.keys(data).length) await prisma.cargo.update({ where: { id: cargo.id }, data });

  // Conjunto de competências do cargo: upsert das Competências (por nome) e sincronismo
  // dos vínculos CargoCompetencia (remove o que saiu, cria/atualiza o resto).
  if (body.competencias !== undefined) {
    const limpas = body.competencias.filter((c) => (c.nome || "").trim());
    const ids = [];
    for (const c of limpas) {
      const nome = c.nome.trim();
      const comp = await prisma.competencia.upsert({
        where: { nome },
        update: { descricao: c.descricao?.trim() || null, categoria: c.categoria?.trim() || null },
        create: { nome, descricao: c.descricao?.trim() || null, categoria: c.categoria?.trim() || null },
      });
      ids.push(comp.id);
      await prisma.cargoCompetencia.upsert({
        where: { cargoId_competenciaId: { cargoId: cargo.id, competenciaId: comp.id } },
        update: { nivelEsperado: c.nivelEsperado },
        create: { cargoId: cargo.id, competenciaId: comp.id, nivelEsperado: c.nivelEsperado },
      });
    }
    await prisma.cargoCompetencia.deleteMany({ where: { cargoId: cargo.id, competenciaId: { notIn: ids.length ? ids : ["-"] } } });
  }

  // Avaliações dos funcionários (nível atual por competência).
  if (body.avaliacoes !== undefined) {
    for (const a of body.avaliacoes) {
      await prisma.funcionarioCompetencia.upsert({
        where: { funcionarioId_competenciaId: { funcionarioId: a.funcionarioId, competenciaId: a.competenciaId } },
        update: { nivelAtual: a.nivelAtual, avaliadoEm: new Date(), avaliadoPor: user.name || user.email || null },
        create: { funcionarioId: a.funcionarioId, competenciaId: a.competenciaId, nivelAtual: a.nivelAtual, avaliadoEm: new Date(), avaliadoPor: user.name || user.email || null },
      });
    }
  }

  return NextResponse.json({ success: true });
}
