// GET  /api/qualidade/documentos/importar?url=...  — pré-visualização do CMR
// POST /api/qualidade/documentos/importar  { url }  — importa (dedupe por importRef)
//
// Lê a planilha de rastreabilidade (CMR) direto do SharePoint pela URL de
// compartilhamento (ou env SHAREPOINT_CMR_URL), mapeia e valida (§4.4: sinaliza
// linhas sem corrida; não inventa o dado). Cada linha vira um DocumentoQualidade
// categoria MATERIAL.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { downloadSharedFile } from "@/lib/sharepoint";
import { parseCMR } from "@/lib/parse-cmr";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ url: z.string().url().optional() });

async function baixarEParsear(url) {
  const { buffer, name } = await downloadSharedFile(url);
  const parsed = await parseCMR(buffer);
  return { name, parsed };
}

async function refsExistentes(refs) {
  const existentes = await prisma.documentoQualidade.findMany({
    where: { origem: "importacao_planilha", importRef: { in: refs } },
    select: { importRef: true },
  });
  return new Set(existentes.map((e) => e.importRef));
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const url = new URL(req.url).searchParams.get("url") || process.env.SHAREPOINT_CMR_URL;
  if (!url) return NextResponse.json({ success: false, error: "Informe a URL de compartilhamento do CMR." }, { status: 400 });

  let r;
  try {
    r = await baixarEParsear(url);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }
  if (!r.parsed.ok) return NextResponse.json({ success: false, error: r.parsed.erro }, { status: 400 });

  const refs = r.parsed.linhas.map((l) => l.importRef).filter(Boolean);
  const setExist = await refsExistentes(refs);
  const novos = r.parsed.linhas.filter((l) => l.importRef && !setExist.has(l.importRef)).length;

  return NextResponse.json({
    success: true,
    arquivo: r.name,
    sheet: r.parsed.sheet,
    mapeamento: r.parsed.mapeamento,
    resumo: { ...r.parsed.resumo, novos, jaImportados: setExist.size },
    amostra: r.parsed.linhas.slice(0, 8),
  });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const url = body.url || process.env.SHAREPOINT_CMR_URL;
  if (!url) return NextResponse.json({ success: false, error: "Informe a URL de compartilhamento do CMR." }, { status: 400 });

  let r;
  try {
    r = await baixarEParsear(url);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }
  if (!r.parsed.ok) return NextResponse.json({ success: false, error: r.parsed.erro }, { status: 400 });

  const refs = r.parsed.linhas.map((l) => l.importRef).filter(Boolean);
  const setExist = await refsExistentes(refs);
  const semIndice = r.parsed.linhas.filter((l) => !l.importRef).length;
  const aCriar = r.parsed.linhas.filter((l) => l.importRef && !setExist.has(l.importRef));

  const data = aCriar.map((l) => ({
    nome: String(l.nome).slice(0, 300),
    categoria: "MATERIAL",
    tipo: l.tipo,
    norma: l.norma ? String(l.norma).slice(0, 200) : null,
    vinculo: l.obra ? String(l.obra).slice(0, 200) : null,
    opNumero: l.opNumero,
    numeroCorrida: l.numeroCorrida ? String(l.numeroCorrida).slice(0, 100) : null,
    numeroDocumento: l.numeroDocumento ? String(l.numeroDocumento).slice(0, 100) : null,
    fornecedor: l.fornecedor ? String(l.fornecedor).slice(0, 200) : null,
    observacao: l.observacao ? String(l.observacao).slice(0, 500) : null,
    origem: "importacao_planilha",
    importRef: l.importRef,
    createdById: user.id,
  }));

  // createMany em lotes (mitiga pressão de memória do Neon — ver CLAUDE.md)
  let criados = 0;
  for (let i = 0; i < data.length; i += 200) {
    const lote = data.slice(i, i + 200);
    const res = await prismaDirect.documentoQualidade.createMany({ data: lote });
    criados += res.count;
  }

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "IMPORTAR_CMR_QUALIDADE", entity: "DocumentoQualidade", entityId: "-", diff: { criados, jaExistiam: setExist.size, semIndice, arquivo: r.name } } })
    .catch(() => {});

  return NextResponse.json({
    success: true,
    criados,
    jaExistiam: setExist.size,
    semIndice,
    semCorrida: r.parsed.resumo.semCorrida,
    total: r.parsed.linhas.length,
  });
}
