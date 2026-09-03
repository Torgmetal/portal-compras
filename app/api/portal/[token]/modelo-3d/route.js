// GET /api/portal/[token]/modelo-3d         → os modelos que ESTA obra publica ao cliente
// GET /api/portal/[token]/modelo-3d?rel=…   → baixa um deles (o visualizador consome daqui)
//
// Vitor (03/09/2026): "conseguimos ter a opção de disponibilizar esse painel no portal do cliente
// para eles conseguirem olhar e navegar no modelo".
//
// ⚠⚠ SÓ O QUE ESTÁ NA PASTA DO CLIENTE. Internamente o portal lê qualquer IFC de 2.5 Projetos;
// aqui não. A Engenharia já tem uma pasta que significa "isto vai para o cliente" — a 2.5.5 — e é
// só dela que este endpoint serve. O modelo de trabalho, a revisão velha e o estudo que ninguém
// aprovou ficam de fora por construção, não por lembrança de quem publica.
//
// ⚠ E só com a seção MODELO_3D ligada no portal da obra: publicar o modelo é decisão por obra.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inventarioEngenharia } from "@/lib/pasta-engenharia";
import { downloadFileByPath, acharPastaOp } from "@/lib/sharepoint";
import { secoesDoPortal, tipoDoDocEng } from "@/lib/portal-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TETO_MB = 60;
// o modelo do cliente mora aqui — o caminho casa por código, não pelo nome da pasta
const RX_CLIENTE = /2\.5\.5/;

async function abrir(token) {
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return { erro: "Link inválido ou ainda não publicado.", status: 404 };
  const ativas = secoesDoPortal(portal);
  if (!ativas.includes("MODELO_NAVEGAVEL")) return { erro: "Esta obra não publica o modelo 3D.", status: 403 };
  const op = await prisma.oP.findFirst({ where: { numero: portal.opNumero }, select: { id: true, numero: true, obra: true, cliente: true } });
  if (!op) return { erro: "Obra não encontrada.", status: 404 };
  return { portal, op };
}

export async function GET(req, { params }) {
  const { token } = await params;
  const ctx = await abrir(token);
  if (ctx.erro) return NextResponse.json({ error: ctx.erro }, { status: ctx.status });
  const { op } = ctx;

  const rel = new URL(req.url).searchParams.get("rel");
  const inv = await inventarioEngenharia(op.numero);
  if (!inv.achou) return NextResponse.json({ error: "Modelo não disponível." }, { status: 404 });

  // ⚠⚠ QUAL IFC VAI, QUEM ESCOLHE É QUEM PUBLICA. Vitor (03/09/2026): "quero selecionar qual IFC
  // vamos colocar, pois temos o com telha e o sem telha, então preciso selecionar o correto".
  // E a escolha não ganhou tela nova: vale a MESMA marcação de documentos da Engenharia (a que já
  // publica o arquivo para download). Um lugar só para decidir — marcar o arquivo publica o
  // download E abre o modelo; desmarcar tira os dois. Duas telas para a mesma decisão é como uma
  // obra acaba com o modelo errado aberto e o certo disponível para baixar.
  const escolhidos = new Set(
    (ctx.portal.docsPorArea?.ENGENHARIA || ctx.portal.docsEngenharia || [])
      .filter((d) => /\.ifc$/i.test(String(d?.nome || "")) && tipoDoDocEng(d) === "MODELO_3D")
      .map((d) => String(d.nome).trim().toLowerCase())
  );

  const modelos = (inv.ifc || [])
    .filter((a) => RX_CLIENTE.test(String(a.rel || "")))
    // ⚠ sem nenhum IFC marcado, a seção não mostra modelo: publicar tudo o que estiver na pasta é
    // exatamente o que ele não quer.
    .filter((a) => escolhidos.has(String(a.nome || "").trim().toLowerCase()))
    .map((a) => ({
      nome: a.nome,
      rel: a.rel ? `${a.rel}/${a.nome}` : a.nome,
      kb: a.kb ?? null, em: a.em || null,
      grande: (a.kb || 0) > TETO_MB * 1024,
    }))
    .sort((a, b) => String(b.em).localeCompare(String(a.em)));

  if (!rel) {
    return NextResponse.json({
      obra: { numero: op.numero, cliente: op.cliente, obra: op.obra },
      modelos, tetoMb: TETO_MB,
    });
  }

  // ⚠ comparação exata contra a lista que acabamos de montar: o caminho nunca vem do navegador.
  const escolhido = modelos.find((m) => m.rel === rel);
  if (!escolhido) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
  if (escolhido.grande) return NextResponse.json({ error: "Modelo grande demais para abrir no navegador." }, { status: 413 });

  const base = await acharPastaOp(op.numero);
  if (!base) return NextResponse.json({ error: "Modelo não disponível." }, { status: 404 });

  let buf;
  try { buf = await downloadFileByPath({ driveId: process.env.SHAREPOINT_DRIVE_ID, fullPath: `${base}/2. Engenharia/2.5 Projetos/${escolhido.rel}` }); }
  catch { return NextResponse.json({ error: "Não consegui abrir o modelo agora." }, { status: 502 }); }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${encodeURIComponent(escolhido.nome)}"`,
    },
  });
}
