import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";
import { backupISODocumento } from "@/lib/rh-doc-backup";
import { z } from "zod";

const docSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  tipo: z.string().min(1, "Tipo obrigatório"),
  categoria: z.enum(["SAUDE_SEGURANCA", "PESSOAL", "TREINAMENTO", "EMPRESA"]),
  descricao: z.string().optional().nullable(),
  funcionarioId: z.string().optional().nullable(),
  dataEmissao: z.string().optional().nullable(),
  dataValidade: z.string().optional().nullable(),
  orgaoEmissor: z.string().optional().nullable(),
  numeroDocumento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  // Arquivo (já subiu pro Blob via upload-token; aqui só persiste a referência)
  arquivoUrl: z.string().url().optional().nullable(),
  arquivoNome: z.string().optional().nullable(),
  arquivoTamanho: z.number().int().optional().nullable(),
  arquivoTipo: z.string().optional().nullable(),
});

// GET — Lista documentos com filtros
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);

    const { searchParams } = new URL(req.url);
    const categoria = searchParams.get("categoria");
    const status = searchParams.get("status"); // VALIDO, VENCENDO_30, VENCENDO_60, VENCIDO
    const vinculo = searchParams.get("vinculo"); // FUNCIONARIO, EMPRESA
    const funcionarioId = searchParams.get("funcionarioId"); // documentos de um funcionário específico
    const busca = searchParams.get("busca");

    const where = { ativo: true };

    if (categoria) where.categoria = categoria;

    if (funcionarioId) {
      where.funcionarioId = funcionarioId;
    } else if (vinculo === "FUNCIONARIO") {
      where.funcionarioId = { not: null };
    } else if (vinculo === "EMPRESA") {
      where.funcionarioId = null;
    }

    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: "insensitive" } },
        { tipo: { contains: busca, mode: "insensitive" } },
        { numeroDocumento: { contains: busca, mode: "insensitive" } },
        { funcionario: { nome: { contains: busca, mode: "insensitive" } } },
      ];
    }

    // Filtro de status por data de validade
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em30 = new Date(hoje);
    em30.setDate(em30.getDate() + 30);
    const em60 = new Date(hoje);
    em60.setDate(em60.getDate() + 60);

    if (status === "VENCIDO") {
      where.dataValidade = { lt: hoje };
    } else if (status === "VENCENDO_30") {
      where.dataValidade = { gte: hoje, lte: em30 };
    } else if (status === "VENCENDO_60") {
      where.dataValidade = { gte: em30, lte: em60 };
    } else if (status === "VALIDO") {
      where.OR = [
        { dataValidade: { gt: em60 } },
        { dataValidade: null },
      ];
    }

    const documentos = await prisma.documento.findMany({
      where,
      include: {
        funcionario: { select: { id: true, nome: true, matricula: true, setor: { select: { nome: true } } } },
      },
      orderBy: [{ dataValidade: "asc" }],
    });

    // Estatísticas
    const todos = await prisma.documento.findMany({
      where: { ativo: true },
      select: { dataValidade: true, funcionarioId: true },
    });

    let totalDocs = todos.length;
    let vencidos = 0;
    let vencendo30 = 0;
    let vencendo60 = 0;
    let validos = 0;
    let semValidade = 0;
    let docsEmpresa = 0;
    let docsFuncionario = 0;

    for (const d of todos) {
      if (!d.funcionarioId) docsEmpresa++;
      else docsFuncionario++;

      if (!d.dataValidade) {
        semValidade++;
        continue;
      }
      const v = new Date(d.dataValidade);
      v.setHours(0, 0, 0, 0);
      if (v < hoje) vencidos++;
      else if (v <= em30) vencendo30++;
      else if (v <= em60) vencendo60++;
      else validos++;
    }

    // Privacidade: nunca devolver a arquivoUrl crua (Blob público). A tela vê/baixa
    // pelo proxy autenticado /api/rh/documentos/[id]/download.
    const dataOut = documentos.map(({ arquivoUrl, sharepointItemId, ...d }) => ({ ...d, temArquivo: !!(arquivoUrl || sharepointItemId) }));

    return NextResponse.json({
      success: true,
      data: dataOut,
      stats: { totalDocs, vencidos, vencendo30, vencendo60, validos, semValidade, docsEmpresa, docsFuncionario },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar documento
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = docSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    // Se veio arquivo, a URL precisa ser do nosso Blob (anti-SSRF / não aceitar
    // link externo arbitrário gravado como documento de RH).
    if (parsed.data.arquivoUrl && !isBlobUrlSegura(parsed.data.arquivoUrl)) {
      return NextResponse.json({ success: false, error: "URL de arquivo inválida." }, { status: 400 });
    }

    const data = {
      ...parsed.data,
      dataEmissao: parsed.data.dataEmissao ? new Date(parsed.data.dataEmissao) : null,
      dataValidade: parsed.data.dataValidade ? new Date(parsed.data.dataValidade) : null,
      funcionarioId: parsed.data.funcionarioId || null,
    };

    const doc = await prisma.documento.create({ data });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CRIAR_DOCUMENTO",
        entity: "Documento",
        entityId: doc.id,
        diff: { nome: data.nome, tipo: data.tipo, categoria: data.categoria, temArquivo: !!doc.arquivoUrl },
      },
    });

    // Backup ISO no SharePoint (com log; não quebra o cadastro se falhar).
    let backup = null;
    if (doc.arquivoUrl) backup = await backupISODocumento(doc, user.id);

    const { arquivoUrl, ...docSemUrl } = doc;
    return NextResponse.json({ success: true, data: { ...docSemUrl, temArquivo: !!arquivoUrl, sharepointUrl: backup?.sharepointUrl || doc.sharepointUrl }, backup }, { status: 201 });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
