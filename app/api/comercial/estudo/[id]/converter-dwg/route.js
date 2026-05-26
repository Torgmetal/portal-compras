// Converte um documento DWG/DXF do estudo para PDF via CloudConvert.
// Mantém o DWG original e cria um novo PropostaDocumento com o PDF convertido.
//
// POST body: { docId: "id-do-documento-dwg" }
// Responde com o novo documento PDF criado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { convertDwgToPdf } from "@/lib/dwg-converter";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 120; // DWG grande pode demorar

export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;

    if (!process.env.CLOUDCONVERT_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CLOUDCONVERT_API_KEY nao configurado. Acesse cloudconvert.com para gerar uma API key.",
        },
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
    const { docId } = body;

    if (!docId) {
      return NextResponse.json(
        { success: false, error: "docId e obrigatorio" },
        { status: 400 }
      );
    }

    // Buscar documento DWG/DXF
    const doc = await prisma.propostaDocumento.findFirst({
      where: { id: docId, estudoId: id },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Documento nao encontrado" },
        { status: 404 }
      );
    }

    const ext = doc.tipo?.toLowerCase();
    if (ext !== "dwg" && ext !== "dxf") {
      return NextResponse.json(
        { success: false, error: `Tipo "${ext}" nao suportado. Apenas DWG e DXF.` },
        { status: 400 }
      );
    }

    // Verificar se ja existe um PDF convertido para este DWG
    const pdfName = doc.nome.replace(/\.(dwg|dxf)$/i, ".pdf");
    const jaConvertido = await prisma.propostaDocumento.findFirst({
      where: {
        estudoId: id,
        nome: pdfName,
        observacao: { contains: "Convertido de DWG" },
      },
    });

    if (jaConvertido) {
      return NextResponse.json({
        success: true,
        data: jaConvertido,
        jaExistia: true,
      });
    }

    // 1. Baixar o DWG do Vercel Blob
    const dwgRes = await fetch(doc.blobUrl);
    if (!dwgRes.ok) {
      throw new Error(`Falha ao baixar DWG do Blob: HTTP ${dwgRes.status}`);
    }
    const dwgBuffer = Buffer.from(await dwgRes.arrayBuffer());

    // 2. Converter para PDF via CloudConvert
    const { pdfBuffer, pdfName: convertedName } = await convertDwgToPdf(
      dwgBuffer,
      doc.nome
    );

    // 3. Upload do PDF convertido para Vercel Blob
    const stamp = Date.now();
    const safeName = convertedName
      .replace(/[^\w\d.\- ]/g, "_")
      .substring(0, 100);
    const pathname = `epc-docs/${id}/converted/${stamp}-${safeName}`;

    const blob = await put(pathname, pdfBuffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/pdf",
    });

    // 4. Registrar o PDF no banco
    const pdfDoc = await prisma.propostaDocumento.create({
      data: {
        estudoId: id,
        nome: convertedName,
        tipo: "pdf",
        tamanho: pdfBuffer.length,
        blobUrl: blob.url,
        categoria: "projeto",
        observacao: `Convertido de DWG: ${doc.nome}`,
      },
    });

    // 5. Audit log
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CONVERTER_DWG",
        entity: "PropostaDocumento",
        entityId: pdfDoc.id,
        diff: {
          origem: doc.nome,
          originDocId: doc.id,
          pdfGerado: convertedName,
          tamanhoOriginal: doc.tamanho,
          tamanhoPdf: pdfBuffer.length,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: pdfDoc,
      jaExistia: false,
    });
  } catch (e) {
    console.error("Erro ao converter DWG:", e);

    // Erros especificos do CloudConvert
    if (e.message?.includes("CloudConvert")) {
      return NextResponse.json(
        { success: false, error: e.message },
        { status: 502 }
      );
    }

    const status =
      e.message === "Unauthorized"
        ? 401
        : e.message === "Forbidden"
          ? 403
          : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
