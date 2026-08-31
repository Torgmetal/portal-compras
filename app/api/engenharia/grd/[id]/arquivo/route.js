// GET /api/engenharia/grd/[id]/arquivo — serve o FORM 09 ORIGINAL, direto do SharePoint.
//
// Vitor (31/08/2026): "quando clico no número da GRD preciso que traga o formulário da GRD
// preenchido, para podermos comprovar no caso de uma auditoria da ISO".
//
// ⚠⚠ O ORIGINAL, NÃO UMA RECONSTRUÇÃO. A tentação é gerar um PDF bonito a partir do que eu li da
// planilha — e seria a coisa errada num contexto de auditoria. O que vale como evidência é o
// documento que a Engenharia emitiu e salvou na pasta; um PDF montado por mim é a MINHA leitura
// dele, e qualquer campo que o meu parser tenha errado apareceria para o auditor como se fosse o
// que a Torg registrou. Aqui o portal é só o caminho até o arquivo, não uma segunda versão dele.
//
// ⚠ O ARQUIVO NÃO É PÚBLICO. Ele mora no SharePoint e o link direto exigiria conta da Torg — por
// isso o download passa pelo servidor, que já tem o token do Graph. Quem pede precisa ter perfil de
// Engenharia/PCP/Qualidade: é documento interno.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { downloadFileById } from "@/lib/sharepoint";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "QUALIDADE"]); }
  catch (e) { return new NextResponse(e.message, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const g = await prisma.grdEngenharia.findUnique({
    where: { id },
    select: { itemId: true, arquivo: true, numero: true, revisao: true },
  });
  if (!g) return new NextResponse("GRD não encontrada.", { status: 404 });

  let arq;
  try {
    arq = await downloadFileById(process.env.SHAREPOINT_DRIVE_ID, g.itemId);
  } catch (e) {
    // ⚠ ARQUIVO MOVIDO OU APAGADO É INFORMAÇÃO, não erro genérico. Numa auditoria, "não consegui
    // abrir" e "o documento não está mais na pasta" são coisas muito diferentes — e a segunda é
    // uma não conformidade que alguém precisa tratar, não um bug do portal.
    return new NextResponse(
      `Não consegui abrir o FORM 09 desta GRD no SharePoint (${g.arquivo}). ` +
      `Verifique se o arquivo continua na pasta 13. GRD. Detalhe: ${e.message}`,
      { status: 502 },
    );
  }

  // nome estável e legível para quem baixa: é o que o auditor vai ver no arquivo salvo
  const nome = g.arquivo || `FORM 09 - GRD-${g.numero}_R${String(g.revisao).padStart(2, "0")}.xlsx`;
  return new NextResponse(arq.buffer, {
    headers: {
      "Content-Type": arq.contentType,
      "Content-Disposition": dispArquivo(nome, "attachment"),
      "Cache-Control": "private, max-age=300",
    },
  });
}
