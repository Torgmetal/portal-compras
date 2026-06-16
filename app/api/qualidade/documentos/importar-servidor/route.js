// GET  /api/qualidade/documentos/importar-servidor?pasta=Inspetores — pré-visualiza
// POST /api/qualidade/documentos/importar-servidor  { pasta }        — importa a subpasta
//
// Lê a pasta do servidor (/Qualidade/Workspace/<subpasta> no SharePoint), recursivo
// (pula subpastas OBSOLETO), e para cada arquivo cria um DocumentoQualidade
// APONTANDO pro arquivo que já está no SharePoint (sharepointItemId/webUrl, sem
// re-upload). Categoria/tipo vêm da subpasta; emissão/validade/nº/norma são
// extraídos com o Claude. Dedupe por sharepointItemId (re-rodar continua de onde parou).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { listChildrenByPath, downloadFileById } from "@/lib/sharepoint";
import { extrairDadosDocumento } from "@/lib/extrair-doc-qualidade";

export const runtime = "nodejs";
export const maxDuration = 300; // dezenas de PDFs × extração Claude; re-rodar continua (dedupe)

const BASE = process.env.SHAREPOINT_QUALIDADE_WORKSPACE || "/Qualidade/Workspace";

// Subpasta do servidor → categoria + tipo do documento
const MAPA = {
  "Certificado de Calibração - Equipamentos": { categoria: "EQUIPAMENTOS", tipo: "Certificado de calibração" },
  CQS: { categoria: "FUNCIONARIOS", tipo: "Qualificação de soldador (CQS)" },
  Funcionários: { categoria: "FUNCIONARIOS", tipo: "Qualificação de funcionário" },
  Inspetores: { categoria: "FUNCIONARIOS", tipo: "Qualificação de inspetor" },
  "EPS + RQPS": { categoria: "SISTEMA", tipo: "EPS / RQPS" },
  Procedimentos: { categoria: "SISTEMA", tipo: "Procedimento" },
  "Documentos SNQC": { categoria: "SISTEMA", tipo: "Procedimento SNQC" },
  "ISO 9001": { categoria: "SISTEMA", tipo: "Certificação ISO 9001" },
  Documentos: { categoria: "SISTEMA", tipo: null },
};
const mapaDe = (pasta) => MAPA[pasta] || { categoria: "SISTEMA", tipo: null };

const EXT_OK = /\.(pdf|png|jpe?g|webp)$/i;

function driveId() {
  const d = process.env.SHAREPOINT_DRIVE_ID;
  if (!d) throw new Error("SHAREPOINT_DRIVE_ID não configurado");
  return d;
}

// Coleta recursiva de arquivos (pula subpastas com "obsoleto" no nome).
async function coletarArquivos(dId, absPath) {
  const filhos = await listChildrenByPath(dId, absPath);
  const out = [];
  for (const it of filhos) {
    if (it.folder) {
      if (/obsoleto/i.test(it.name)) continue;
      out.push(...(await coletarArquivos(dId, `${absPath}/${it.name}`)));
    } else if (it.file && EXT_OK.test(it.name)) {
      out.push({ id: it.id, name: it.name, webUrl: it.webUrl || null, contentType: it.file.mimeType || "application/octet-stream" });
    }
  }
  return out;
}

async function refsExistentes(ids) {
  if (!ids.length) return new Set();
  const ex = await prisma.documentoQualidade.findMany({ where: { sharepointItemId: { in: ids } }, select: { sharepointItemId: true } });
  return new Set(ex.map((e) => e.sharepointItemId));
}

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const pasta = new URL(req.url).searchParams.get("pasta");
  if (!pasta) return NextResponse.json({ success: false, error: "Informe a pasta" }, { status: 400 });

  let arquivos;
  try {
    arquivos = await coletarArquivos(driveId(), `${BASE}/${pasta}`);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }
  const setExist = await refsExistentes(arquivos.map((a) => a.id));
  const map = mapaDe(pasta);
  return NextResponse.json({
    success: true,
    pasta,
    categoria: map.categoria,
    tipo: map.tipo,
    total: arquivos.length,
    novos: arquivos.filter((a) => !setExist.has(a.id)).length,
    jaImportados: setExist.size,
    amostra: arquivos.slice(0, 10).map((a) => a.name),
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
    body = z.object({ pasta: z.string().min(1) }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const { pasta } = body;
  const map = mapaDe(pasta);
  const dId = (() => { try { return driveId(); } catch (e) { return null; } })();
  if (!dId) return NextResponse.json({ success: false, error: "SHAREPOINT_DRIVE_ID não configurado" }, { status: 500 });

  let arquivos;
  try {
    arquivos = await coletarArquivos(dId, `${BASE}/${pasta}`);
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao ler do SharePoint: " + e.message }, { status: 502 });
  }
  const setExist = await refsExistentes(arquivos.map((a) => a.id));
  const aImportar = arquivos.filter((a) => !setExist.has(a.id));

  let criados = 0, comExtracao = 0, semLeitura = 0;
  for (const a of aImportar) {
    let dados = {};
    try {
      const { buffer, contentType } = await downloadFileById(dId, a.id);
      dados = await extrairDadosDocumento(buffer, contentType || a.contentType);
      if (dados.dataEmissao || dados.dataValidade || dados.numeroDocumento) comExtracao++;
      else semLeitura++;
    } catch {
      semLeitura++; // segue e cria o doc mesmo sem a extração (datas podem ser preenchidas depois)
    }
    try {
      await prisma.documentoQualidade.create({
        data: {
          nome: a.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 300),
          categoria: map.categoria,
          tipo: map.tipo,
          norma: dados.norma || null,
          numeroDocumento: dados.numeroDocumento || null,
          dataEmissao: dados.dataEmissao ? new Date(dados.dataEmissao) : null,
          dataValidade: dados.dataValidade ? new Date(dados.dataValidade) : null,
          origem: "importacao_servidor",
          sharepointItemId: a.id,
          sharepointUrl: a.webUrl,
          arquivoNome: a.name,
          arquivoTipo: a.contentType,
          validado: false,
          createdById: user.id,
        },
      });
      criados++;
    } catch {
      /* falha ao criar uma linha não aborta o lote */
    }
  }

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "IMPORTAR_SERVIDOR_QUALIDADE", entity: "DocumentoQualidade", entityId: "-", diff: { pasta, criados, jaExistiam: setExist.size, comExtracao, semLeitura } } })
    .catch(() => {});

  return NextResponse.json({ success: true, pasta, criados, jaExistiam: setExist.size, comExtracao, semLeitura, total: arquivos.length });
}
