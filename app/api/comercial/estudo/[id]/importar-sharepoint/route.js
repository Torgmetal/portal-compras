import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { put } from "@vercel/blob";
import {
  parseSharePointUrl,
  listAllFilesRecursive,
  downloadFileById,
} from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tipos que podemos importar e analisar
const TIPOS_IMPORTAVEIS = ["pdf", "png", "jpg", "jpeg"];

// Extensao -> categoria automatica do documento
function categoriaPorPasta(folderName) {
  const nome = (folderName || "").toUpperCase();
  if (nome.includes("ESTRUTURA MET") || nome.includes("METALICA")) return "projeto";
  if (nome.includes("ESTRUTURAL")) return "projeto";
  if (nome.includes("ARQUITETURA")) return "projeto";
  if (nome.includes("PLANILHA") || nome.includes("ORCAMENT")) return "documento";
  if (nome.includes("EMAIL") || nome.includes("CORRESP")) return "email";
  if (nome.includes("COTAC")) return "cotacao";
  return "documento";
}

function getExtensao(nome) {
  return nome.split(".").pop()?.toLowerCase() || "";
}

// ── GET: Lista arquivos disponiveis na pasta do SharePoint ──

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      select: { sharepointUrl: true },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }
    if (!estudo.sharepointUrl) {
      return NextResponse.json(
        { success: false, error: "Estudo nao tem URL do SharePoint configurada" },
        { status: 400 }
      );
    }

    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    if (!driveId) {
      return NextResponse.json(
        { success: false, error: "SHAREPOINT_DRIVE_ID nao configurado" },
        { status: 500 }
      );
    }

    const folderPath = parseSharePointUrl(estudo.sharepointUrl);

    // Listar todos os arquivos suportados recursivamente
    const arquivos = await listAllFilesRecursive(driveId, folderPath, {
      maxDepth: 5,
      supportedTypes: TIPOS_IMPORTAVEIS,
    });

    // Buscar documentos ja importados pra marcar quais ja existem
    const docsExistentes = await prisma.propostaDocumento.findMany({
      where: { estudoId: id },
      select: { nome: true },
    });
    const nomesExistentes = new Set(docsExistentes.map((d) => d.nome));

    // Agrupar por pasta
    const porPasta = {};
    for (const arq of arquivos) {
      const pasta = arq.folder || "Raiz";
      if (!porPasta[pasta]) porPasta[pasta] = [];
      porPasta[pasta].push({
        ...arq,
        jaImportado: nomesExistentes.has(arq.name),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        folderPath,
        totalArquivos: arquivos.length,
        jaImportados: arquivos.filter((a) => nomesExistentes.has(a.name)).length,
        pastas: porPasta,
      },
    });
  } catch (e) {
    console.error("Erro ao listar SharePoint:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST: Importar arquivos selecionados do SharePoint ──

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    const estudo = await prisma.propostaEstudo.findUnique({
      where: { id },
      select: { sharepointUrl: true, orcamento: { select: { numero: true } } },
    });

    if (!estudo) {
      return NextResponse.json({ success: false, error: "Estudo nao encontrado" }, { status: 404 });
    }
    if (!estudo.sharepointUrl) {
      return NextResponse.json(
        { success: false, error: "Estudo nao tem URL do SharePoint" },
        { status: 400 }
      );
    }

    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    if (!driveId) {
      return NextResponse.json(
        { success: false, error: "SHAREPOINT_DRIVE_ID nao configurado" },
        { status: 500 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { success: false, error: "BLOB_READ_WRITE_TOKEN nao configurado" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { arquivos } = body; // [{ id, name, folder }]

    if (!arquivos?.length) {
      return NextResponse.json(
        { success: false, error: "Nenhum arquivo selecionado" },
        { status: 400 }
      );
    }

    // Limite de 30 arquivos por vez pra nao estourar timeout
    const batch = arquivos.slice(0, 30);

    // Verificar quais ja existem
    const docsExistentes = await prisma.propostaDocumento.findMany({
      where: { estudoId: id },
      select: { nome: true },
    });
    const nomesExistentes = new Set(docsExistentes.map((d) => d.nome));

    const importados = [];
    const falhas = [];

    // Processar em paralelo com concorrencia limitada
    const CONCORRENCIA = 3;
    for (let i = 0; i < batch.length; i += CONCORRENCIA) {
      const lote = batch.slice(i, i + CONCORRENCIA);
      const resultados = await Promise.allSettled(
        lote.map(async (arq) => {
          // Pular se ja existe
          if (nomesExistentes.has(arq.name)) {
            return { name: arq.name, status: "ja_existe" };
          }

          // 1. Baixar do SharePoint
          const { buffer, contentType } = await downloadFileById(driveId, arq.id);

          // 2. Upload pro Vercel Blob
          const ext = getExtensao(arq.name);
          const stamp = Date.now();
          const safeName = arq.name.replace(/[^\w\d.\- ]/g, "_").substring(0, 100);
          const pathname = `epc-docs/${id}/${stamp}-${safeName}`;

          const blob = await put(pathname, buffer, {
            access: "public",
            addRandomSuffix: false,
            contentType: contentType || "application/octet-stream",
          });

          // 3. Registrar no banco
          const doc = await prisma.propostaDocumento.create({
            data: {
              estudoId: id,
              nome: arq.name,
              tipo: ext,
              tamanho: buffer.length,
              blobUrl: blob.url,
              categoria: categoriaPorPasta(arq.folder),
              observacao: `Importado do SharePoint: ${arq.folder || "raiz"}`,
            },
          });

          return { name: arq.name, status: "importado", docId: doc.id };
        })
      );

      for (const r of resultados) {
        if (r.status === "fulfilled") {
          importados.push(r.value);
        } else {
          falhas.push({
            name: lote[resultados.indexOf(r)]?.name,
            error: r.reason?.message?.slice(0, 200) || "Erro desconhecido",
          });
        }
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "IMPORTAR_SHAREPOINT",
        entity: "PropostaEstudo",
        entityId: id,
        diff: {
          total: batch.length,
          importados: importados.filter((i) => i.status === "importado").length,
          jaExistiam: importados.filter((i) => i.status === "ja_existe").length,
          falhas: falhas.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        importados,
        falhas,
        restantes: arquivos.length - batch.length,
      },
    });
  } catch (e) {
    console.error("Erro ao importar SharePoint:", e);
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
