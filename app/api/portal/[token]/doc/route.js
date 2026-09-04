// GET — o cliente baixa UM documento do portal, pelo token do portal + id do documento.
//
// Vitor (22/08/2026): "o certificado deve ficar de acesso para ele poder visualizar, baixar".
//
// ⚠ O TOKEN É DO PORTAL, NÃO DO DOCUMENTO, e a checagem é dupla: o portal tem de estar publicado
// E o documento tem de ser da OP daquele portal. Sem a segunda, quem tivesse um link válido leria
// qualquer certificado do servidor trocando o id na barra de endereço.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { baixarDocumento, resolverDriveServidor } from "@/lib/databook-arquivo";
import { secoesDoPortal, portalExpirado } from "@/lib/portal-cliente";
import { registrarAcesso } from "@/lib/portal-acesso";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const { token } = await params;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new NextResponse("Documento não informado.", { status: 400 });

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO" || portalExpirado(portal)) return new NextResponse("Link inválido.", { status: 404 });

  const doc = await prisma.documentoQualidade.findFirst({
    where: { id, opNumero: portal.opNumero, ativo: true },
    select: { id: true, nome: true, categoria: true, tipo: true, arquivoUrl: true, sharepointItemId: true, sharepointUrl: true, origem: true },
  });
  if (!doc) return new NextResponse("Documento não encontrado nesta obra.", { status: 404 });

  // ⚠ e a SEÇÃO tem de estar ligada: certificado só sai se a obra publicou os certificados.
  // Desligar uma seção precisa desligar também o que se baixa por ela, senão o botão some da tela
  // mas o arquivo continua ao alcance de quem souber o endereço.
  const ativas = secoesDoPortal(portal);
  // ⚠ PLANO DE CONTROLE TEM SEÇÃO PRÓPRIA (Qualidade). Sem tratá-lo aqui, o PIT/PLP aparecia na
  // aba e o download batia na checagem de DOCUMENTOS — obra que publicou só os planos veria o
  // botão e levaria 403.
  const ehPlano = /\b(PIT|PLP)\b|plano de (inspe|pintura)/i.test(`${doc.tipo || ""} ${doc.nome || ""}`);
  const permitido = doc.categoria === "MATERIAL"
    ? ativas.includes("CERTIFICADOS")
    : ehPlano ? (ativas.includes("PLANOS") || ativas.includes("DOCUMENTOS")) : ativas.includes("DOCUMENTOS");
  if (!permitido) return new NextResponse("Este documento não faz parte do portal desta obra.", { status: 403 });

  try {
    const drive = await resolverDriveServidor([doc]);
    const buf = await baixarDocumento(doc, drive);
    const nome = `${String(doc.nome).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120)}.pdf`;
    // ⚠ o nome do DOCUMENTO vai no registro, não só a contagem: "3 downloads" não responde se o
    // cliente pegou o certificado que ele está cobrando por telefone.
    await registrarAcesso(req, {
      portal, codigo: new URL(req.url).searchParams.get("d"), evento: "DOWNLOAD",
      documento: doc.nome, documentoId: doc.id,
      secao: doc.categoria === "MATERIAL" ? "CERTIFICADOS" : "DOCUMENTOS",
    });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": dispArquivo(nome, "inline"),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    // ⚠ `e.message` VAI PARA O NAVEGADOR DO CLIENTE. Já saiu daqui coisa como "Failed to parse PDF
    // document (line:582 col:436): No PDF header found" e "Falha ao baixar item 012SCVJY…: HTTP
    // 404" — id interno do SharePoint e stack de parser, em inglês, na tela de quem comprou a
    // obra. O motivo continua existindo no log do servidor, que é onde ele serve.
    console.error("[portal/doc] falha ao servir documento:", e);
    return new NextResponse("Não foi possível abrir este documento agora. Fale com a Qualidade da Torg.", { status: 502 });
  }
}
