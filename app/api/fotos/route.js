// GET  /api/fotos?opId=…            → o banco de fotos (as da obra primeiro, depois as demais)
// POST /api/fotos {url, legenda, opId, opNumero, origem}  → registra uma foto no banco
// PATCH/DELETE                       → legenda e remoção
//
// ⚠⚠ O BANCO NÃO SUBSTITUI A ESCOLHA DE CADA TELA. Vitor (03/09/2026): "quando adicionarmos uma
// foto em algum lugar quero que ela fique em todos os lugares que temos para colocar foto". A foto
// entra aqui uma vez; o portal do cliente e o relatório continuam guardando QUAIS fotos eles usam.
// Fosse o contrário, ligar o banco publicaria no portal toda foto que alguém subisse num relatório.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGENS = new Set(["PORTAL", "RELATORIO", "AVULSA"]);

export async function GET(req) {
  const s = await getSession();
  if (!s?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId") || null;
  // ⚠ o relatório de status conhece a obra pelo NÚMERO, não pelo id — aceitar os dois evita
  // obrigar cada tela a fazer uma consulta só para abrir um seletor de foto.
  const opNumero = searchParams.get("opNumero") || null;
  const daObraOnde = opId ? { opId } : opNumero ? { opNumero } : null;
  const busca = (searchParams.get("q") || "").trim();

  // ⚠ as da obra na frente: quem está montando o portal da OP-118 quer as fotos da 118, mas a foto
  // institucional (fachada, equipe) serve a qualquer obra — por isso o resto vem junto, depois.
  const [daObra, outras] = await Promise.all([
    daObraOnde ? prisma.fotoObra.findMany({ where: daObraOnde, orderBy: { criadoEm: "desc" }, take: 120 }) : [],
    prisma.fotoObra.findMany({
      where: { ...(daObraOnde ? { NOT: daObraOnde } : {}), ...(busca ? { legenda: { contains: busca, mode: "insensitive" } } : {}) },
      orderBy: { criadoEm: "desc" }, take: 120,
      include: { op: { select: { numero: true } } },
    }),
  ]);

  const item = (f) => ({
    id: f.id, url: f.url, legenda: f.legenda || "", origem: f.origem,
    op: f.op?.numero || f.opNumero || null, criadoEm: f.criadoEm,
  });
  return NextResponse.json({ daObra: daObra.map(item), outras: outras.map(item) });
}

export async function POST(req) {
  const s = await getSession();
  if (!s?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // aceita uma foto ou várias de uma vez — subir 8 fotos do celular é um POST só
  const brutas = Array.isArray(body?.fotos) ? body.fotos : [body];
  const opId = body?.opId || null;
  const opNumero = body?.opNumero || null;
  const origem = ORIGENS.has(body?.origem) ? body.origem : "AVULSA";

  const novas = brutas
    .map((f) => ({ url: String(f?.url || "").trim(), legenda: String(f?.legenda || "").trim() || null }))
    .filter((f) => /^https?:\/\//i.test(f.url));
  if (!novas.length) return NextResponse.json({ error: "Nenhuma foto válida." }, { status: 400 });

  // ⚠ a mesma URL não entra duas vezes: o registro é automático em cada upload, e sem isto uma
  // gravação repetida do portal encheria o banco de cópias da mesma foto.
  const jaTem = new Set(
    (await prisma.fotoObra.findMany({ where: { url: { in: novas.map((f) => f.url) } }, select: { url: true } }))
      .map((f) => f.url)
  );
  const criar = novas.filter((f) => !jaTem.has(f.url));
  if (criar.length) {
    await prisma.fotoObra.createMany({
      data: criar.map((f) => ({ ...f, opId, opNumero, origem, criadoPorId: s.user.id || null })),
    });
  }
  return NextResponse.json({ ok: true, registradas: criar.length, jaExistiam: novas.length - criar.length });
}

export async function PATCH(req) {
  const s = await getSession();
  if (!s?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, legenda } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Informe a foto." }, { status: 400 });
  await prisma.fotoObra.update({ where: { id }, data: { legenda: String(legenda || "").trim() || null } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const s = await getSession();
  if (!s?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe a foto." }, { status: 400 });
  // ⚠ tira do banco, NÃO do Blob: a mesma URL pode estar publicada num portal ou num relatório já
  // enviado. Sumir com o arquivo quebraria documento que já saiu daqui.
  await prisma.fotoObra.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
