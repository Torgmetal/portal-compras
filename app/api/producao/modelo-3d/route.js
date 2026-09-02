// GET /api/producao/modelo-3d?opId=…            → os modelos IFC que a obra tem
// GET /api/producao/modelo-3d?opId=…&rel=…      → baixa um deles (o visualizador consome daqui)
//
// Vitor (03/09/2026): "quero que vejam dentro do portal deles, não quero que seja através de um
// link — eles precisam ver na tela do nosso portal".
//
// ⚠⚠ O ARQUIVO É NOSSO, E É POR ISSO QUE ISTO EXISTE. O IFC mora no SharePoint da Torg, não dentro
// do Trimble. Servindo daqui, o cliente abre o modelo da obra dele pelo token que já recebe — sem
// conta, sem cadastro, sem dividir licença de ninguém. E, mais importante: o clique fica no nosso
// código, que é o que permite ligar a peça ao R, ao croqui e ao andamento na fábrica.
//
// ⚠ SÓ LEITURA, e só dentro da pasta da OP: o `rel` é validado contra o inventário, nunca
// concatenado cru num caminho. Sem isso, um `rel` com "../" viraria uma porta para o SharePoint
// inteiro (mesmo cuidado de lib/blob-url).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { inventarioEngenharia } from "@/lib/pasta-engenharia";
import { downloadFileByPath, acharPastaOp } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA", "QUALIDADE", "COMERCIAL"];

// ⚠ Teto de tamanho. Um modelo de obra inteira pode passar de 100MB, e a função serverless não
// carrega isso — nem o navegador do usuário abriria. Medido na OP-089: 5,6 MB para 572 conjuntos,
// então 60MB dá muita folga; acima disso o certo é a Engenharia publicar o modelo por frente.
const TETO_MB = 60;

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId");
  const rel = searchParams.get("rel");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const inv = await inventarioEngenharia(op.numero);
  if (!inv.achou) return NextResponse.json({ error: inv.erro || "Pasta da OP não encontrada." }, { status: 404 });

  const modelos = (inv.ifc || []).map((a) => ({
    nome: a.nome,
    // ⚠ o `rel` é a chave que o cliente devolve para pedir o arquivo — e é ele que validamos.
    rel: a.rel ? `${a.rel}/${a.nome}` : a.nome,
    kb: a.kb ?? null, em: a.em || null,
    grande: (a.kb || 0) > TETO_MB * 1024,
  })).sort((a, b) => String(b.em).localeCompare(String(a.em)));

  // ── listagem ──
  if (!rel) {
    return NextResponse.json({
      op: { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra },
      modelos, tetoMb: TETO_MB,
    });
  }

  // ── download de um modelo ──
  // ⚠⚠ SÓ O QUE ESTÁ NO INVENTÁRIO. Comparação exata contra a lista que acabamos de montar: o
  // caminho nunca vem do que o navegador mandou, vem daqui.
  const escolhido = modelos.find((m) => m.rel === rel);
  if (!escolhido) return NextResponse.json({ error: "Modelo não encontrado nesta OP." }, { status: 404 });
  if (escolhido.grande) {
    return NextResponse.json({
      error: `O modelo tem ${(escolhido.kb / 1024).toFixed(0)} MB — acima do limite de ${TETO_MB} MB. Peça à Engenharia para publicar o modelo por frente.`,
    }, { status: 413 });
  }

  const base = await acharPastaOp(op.numero);
  if (!base) return NextResponse.json({ error: "Pasta da OP não encontrada." }, { status: 404 });
  const caminho = `${base}/2. Engenharia/2.5 Projetos/${escolhido.rel}`;

  let buf;
  try { buf = await downloadFileByPath({ driveId: process.env.SHAREPOINT_DRIVE_ID, fullPath: caminho }); }
  catch (e) { return NextResponse.json({ error: "Falha ao baixar o modelo: " + (e?.message || "erro") }, { status: 502 }); }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.length),
      // ⚠ o IFC de uma revisão não muda: cachear no navegador evita baixar 5 MB a cada abertura da
      // tela. Uma revisão nova muda o nome do arquivo, então o cache não mascara atualização.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${encodeURIComponent(escolhido.nome)}"`,
    },
  });
}
