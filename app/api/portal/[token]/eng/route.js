// GET — o cliente baixa UM documento de ENGENHARIA do portal (os escolhidos da pasta 2.5.5).
//
// ⚠ O TOKEN É DO PORTAL e a checagem é TRIPLA: o portal tem de estar publicado, a seção
// DOCUMENTOS tem de estar ligada, E o arquivo tem de estar na LISTA ESCOLHIDA daquela obra.
//
// A terceira é a que importa aqui. Nos certificados, "ser da OP" basta porque tudo que é da OP
// pode ser visto; na 2.5.5 NÃO — a pasta tem revisão obsoleta e arquivo de trabalho, e o que sai é
// só o que alguém marcou. Sem esta checagem, quem tivesse um link válido baixaria qualquer arquivo
// da pasta trocando o id na barra de endereço, incluindo o que foi deliberadamente não publicado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/sharepoint";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { registrarAcesso } from "@/lib/portal-acesso";

export const runtime = "nodejs";
export const maxDuration = 60;
const GRAPH = "https://graph.microsoft.com/v1.0";

export async function GET(req, { params }) {
  const { token } = await params;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new NextResponse("Documento não informado.", { status: 400 });

  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return new NextResponse("Link inválido.", { status: 404 });
  if (!secoesDoPortal(portal).includes("DOCUMENTOS")) {
    return new NextResponse("Este documento não faz parte do portal desta obra.", { status: 403 });
  }

  const escolhidos = Array.isArray(portal.docsEngenharia) ? portal.docsEngenharia : [];
  const doc = escolhidos.find((d) => String(d.id) === String(id));
  if (!doc) return new NextResponse("Documento não encontrado nesta obra.", { status: 404 });

  try {
    const auth = { Authorization: `Bearer ${await getAccessToken()}` };
    const r = await fetch(`${GRAPH}/drives/${process.env.SHAREPOINT_DRIVE_ID}/items/${encodeURIComponent(id)}/content`, { headers: auth, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await prisma.portalCliente.update({ where: { id: portal.id }, data: { ultimoAcessoEm: new Date() } }).catch(() => {});
    await registrarAcesso(req, {
      portal, codigo: new URL(req.url).searchParams.get("d"), evento: "DOWNLOAD",
      documento: doc.nome, documentoId: String(id), secao: "ENGENHARIA",
    });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": r.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.nome)}"`,
      },
    });
  } catch (e) {
    return new NextResponse(`Não consegui abrir o arquivo: ${e?.message || e}`, { status: 502 });
  }
}
