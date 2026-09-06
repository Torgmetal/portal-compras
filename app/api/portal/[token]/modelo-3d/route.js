// GET /api/portal/[token]/modelo-3d         → os modelos que ESTA obra publica ao cliente
// GET /api/portal/[token]/modelo-3d?rel=…   → baixa um deles (o visualizador consome daqui)
//
// Vitor (03/09/2026): "conseguimos ter a opção de disponibilizar esse painel no portal do cliente
// para eles conseguirem olhar e navegar no modelo".
//
// ⚠⚠ SÓ O QUE FOI MARCADO. Internamente o portal lê qualquer IFC da pasta 2.5 Projetos; aqui não.
// O cliente recebe exatamente os arquivos que alguém escolheu na seleção de documentos da
// Engenharia (Vitor, 03/09/2026: "quero selecionar qual IFC vamos colocar, pois temos o com telha e
// o sem telha"). Modelo de trabalho, revisão velha e estudo não aprovado ficam de fora porque
// ninguém os marcou — e é a mesma marcação que publica o download, então a decisão é uma só.
//
// ⚠ E só com a seção MODELO_3D ligada no portal da obra: publicar o modelo é decisão por obra.
import { comparacaoIfcPublicada } from "@/lib/ifc-comparacao-publicacao";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken } from "@/lib/sharepoint";
import { secoesDoPortal, tipoDoDocEng, portalExpirado } from "@/lib/portal-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TETO_MB = 60;

async function abrir(token) {
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO" || portalExpirado(portal)) return { erro: "Link inválido ou ainda não publicado.", status: 404 };
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
  const { op, portal } = ctx;

  // ⚠⚠ NÃO SE VARRE O SHAREPOINT PARA ABRIR O MODELO. Vitor (03/09/2026): "o modelo IFC do portal
  // está abrindo em branco, parece que não carrega". Não estava quebrado: estava esperando. A
  // listagem varria a árvore da Engenharia inteira (1.400 documentos na OP-118) só para achar dois
  // arquivos — vinte segundos de tela branca antes de a primeira coisa aparecer.
  //
  // E era varredura desnecessária: os IFCs que vão ao cliente são os que alguém MARCOU, e a marcação
  // já guarda id, nome e tamanho. A lista sai do próprio registro do portal, em milissegundos, e o
  // download vai pelo id do item — o mesmo caminho do download de documento (rota /eng).
  const escolhidos = (portal.docsPorArea?.ENGENHARIA || portal.docsEngenharia || [])
    .filter((d) => d?.id && /\.ifc$/i.test(String(d?.nome || "")) && tipoDoDocEng(d) === "MODELO_3D");

  const modelos = escolhidos.map((d) => ({
    ...(comparacaoIfcPublicada(d) ? { comparacao: { anteriorNome: d.comparacaoIfc.anterior.nome, anteriorEm: d.comparacaoIfc.anterior.em || null } } : {}),
    nome: d.nomeExibicao || d.nome,
    rel: String(d.id),
    kb: Number(d.tamanho) ? Math.round(Number(d.tamanho) / 1024) : null,
    em: d.em || null,
    grande: Number(d.tamanho) > TETO_MB * 1024 * 1024,
  }));

  const rel = new URL(req.url).searchParams.get("rel");
  if (!rel) {
    return NextResponse.json({
      obra: { numero: op.numero, cliente: op.cliente, obra: op.obra },
      modelos, tetoMb: TETO_MB,
    });
  }

  // ⚠ o id tem de estar na lista que acabamos de montar: o caminho nunca vem do navegador.
  let escolhido = modelos.find((m) => m.rel === rel);
  let arquivoId = rel;
  let fonte = escolhidos.find((d) => String(d.id) === rel);
  const comparando = new URL(req.url).searchParams.has("comparacao") || new URL(req.url).searchParams.get("revisao") === "anterior";
  if (comparando && !comparacaoIfcPublicada(fonte)) return NextResponse.json({ error: "Comparação não publicada." }, { status: 404 });
  if (new URL(req.url).searchParams.get("revisao") === "anterior") {
    const c = comparacaoIfcPublicada(escolhidos.find((d) => String(d.id) === rel));
    if (!c) return NextResponse.json({ error: "Comparação não publicada." }, { status: 404 });
    arquivoId = c.anterior.id;
    fonte = c.anterior;
    escolhido = { nome: c.anterior.nome, grande: Number(c.anterior.tamanho) > TETO_MB * 1024 * 1024 };
  }
  if (!escolhido) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
  if (escolhido.grande) return NextResponse.json({ error: "Modelo grande demais para abrir no navegador." }, { status: 413 });

  try {
    const auth = { Authorization: `Bearer ${await getAccessToken()}` };
    if (comparando && fonte?.etag) {
      const meta = await fetch(`https://graph.microsoft.com/v1.0/drives/${process.env.SHAREPOINT_DRIVE_ID}/items/${encodeURIComponent(arquivoId)}?$select=eTag`, { headers: auth, cache: "no-store" });
      if (!meta.ok || (await meta.json()).eTag !== fonte.etag) return NextResponse.json({ error: "Um IFC mudou desde a publicação. A Engenharia precisa republicar a comparação." }, { status: 409 });
    }
    const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${process.env.SHAREPOINT_DRIVE_ID}/items/${encodeURIComponent(arquivoId)}/content`,
      { headers: auth, redirect: "follow", cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers.get("content-length")) > TETO_MB * 1024 * 1024) return NextResponse.json({ error: "Modelo grande demais." }, { status: 413 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > TETO_MB * 1024 * 1024) return NextResponse.json({ error: "Modelo grande demais." }, { status: 413 });
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": comparando ? "private, no-store" : "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(escolhido.nome)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Não consegui abrir o modelo agora." }, { status: 502 });
  }
}
