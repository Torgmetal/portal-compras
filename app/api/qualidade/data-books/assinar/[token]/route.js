// GET  /api/qualidade/data-books/assinar/[token] — PÚBLICO: dados da etapa p/ assinar
// POST /api/qualidade/data-books/assinar/[token] — PÚBLICO: assina a etapa (digita nome),
//   avança a cadeia (dispara e-mail da próxima) e, ao final, envia o link de download
//   ao cliente. Sem login (token único), espelhando o aceite do data book.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { PAPEL_LABEL, fmtOPdb, baseUrlDe, enviarEmailEtapa, enviarEmailDownloadCliente } from "@/lib/databook-assinaturas";

export const runtime = "nodejs";

async function carregar(token) {
  const etapa = await prisma.dataBookAssinatura.findUnique({ where: { token } });
  if (!etapa) return null;
  const [book, etapas] = await Promise.all([
    prisma.dataBookQualidade.findUnique({ where: { id: etapa.dataBookId }, select: { opNumero: true, cliente: true, obra: true, status: true } }),
    prisma.dataBookAssinatura.findMany({ where: { dataBookId: etapa.dataBookId }, orderBy: { ordem: "asc" } }),
  ]);
  return { etapa, book, etapas };
}

function montaPublico({ etapa, book, etapas }, token) {
  const anterioresOk = etapas.filter((e) => e.ordem < etapa.ordem).every((e) => e.status === "ASSINADO");
  return {
    op: fmtOPdb(book?.opNumero), cliente: book?.cliente || null, obra: book?.obra || null,
    etapa: { ordem: etapa.ordem, papel: etapa.papel, label: PAPEL_LABEL[etapa.papel], nome: etapa.nome, status: etapa.status, assinadoNome: etapa.assinadoNome, assinadoEm: etapa.assinadoEm },
    suaVez: etapa.status !== "ASSINADO" && anterioresOk,
    jaAssinado: etapa.status === "ASSINADO",
    etapas: etapas.map((e) => ({ ordem: e.ordem, papel: e.papel, label: PAPEL_LABEL[e.papel], nome: e.nome, status: e.status, assinadoNome: e.assinadoNome, assinadoEm: e.assinadoEm })),
    pdfUrl: `/api/qualidade/data-books/assinar/${token}/pdf?inline=1`,
  };
}

export async function GET(_req, { params }) {
  const ctx = await carregar(params.token);
  if (!ctx) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ success: true, data: montaPublico(ctx, params.token) });
}

export async function POST(req, { params }) {
  let body;
  try {
    body = z.object({ nome: z.string().min(3, "Informe seu nome completo").max(120) }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }
  const ctx = await carregar(params.token);
  if (!ctx) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  const { etapa, book, etapas } = ctx;

  if (etapa.status === "ASSINADO") {
    return NextResponse.json({ success: true, jaAssinado: true, data: montaPublico(ctx, params.token) });
  }
  const anterioresOk = etapas.filter((e) => e.ordem < etapa.ordem).every((e) => e.status === "ASSINADO");
  if (!anterioresOk) {
    return NextResponse.json({ success: false, error: "A etapa anterior do fluxo ainda não foi assinada." }, { status: 400 });
  }

  // ⚠⚠ CLIENTE COM CADASTRO ASSINA LOGADO (Vitor, 28/08/2026). O link prova que a pessoa recebeu o
  // e-mail; a sessão prova que é ela. Só vale para conta de CLIENTE: o elaborador, o inspetor e o
  // RT seguem assinando pelo link, como sempre.
  const conta = etapa.email
    ? await prisma.user.findFirst({ where: { email: etapa.email, ativo: true, tipo: "CLIENTE" }, select: { id: true } }).catch(() => null)
    : null;
  if (conta) {
    const sessao = await getSession().catch(() => null);
    const eu = sessao?.user?.email?.toLowerCase();
    if (!eu) return NextResponse.json({ success: false, error: "Entre com o seu acesso para assinar este documento.", exigeLogin: true }, { status: 401 });
    if (eu !== String(etapa.email).toLowerCase()) {
      return NextResponse.json({ success: false, error: `Este documento está endereçado a ${etapa.email}. Entre com esse acesso para assinar.`, exigeLogin: true }, { status: 403 });
    }
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const nome = body.nome.trim();
  // ⚠ mesma regra do relatório de inspeção: se quem assina tem assinatura cadastrada no portal, ela
  // é COPIADA para esta etapa e sai desenhada no Data Book. Copiada, não referenciada — trocar a
  // assinatura no cadastro depois não reescreve dossiê já assinado. Quem não tem (o cliente, quase
  // sempre) continua com nome, data e IP.
  let imagemUrl = null;
  if (etapa.email) {
    const u = await prisma.user.findFirst({ where: { email: etapa.email }, select: { assinaturaUrl: true } }).catch(() => null);
    imagemUrl = u?.assinaturaUrl || null;
  }
  await prisma.dataBookAssinatura.update({ where: { id: etapa.id }, data: { status: "ASSINADO", assinadoNome: nome, assinadoEm: new Date(), ip, ...(imagemUrl ? { imagemUrl } : {}) } });

  const op = fmtOPdb(book?.opNumero);
  const base = baseUrlDe(req);
  const proxima = etapas.find((e) => e.ordem === etapa.ordem + 1);

  if (proxima) {
    const link = `${base}/data-book/assinar/${proxima.token}`;
    try { await enviarEmailEtapa({ email: proxima.email, papel: proxima.papel, nomeDest: proxima.nome, op, obra: book?.obra, link }); } catch {}
    await prisma.dataBookAssinatura.update({ where: { id: proxima.id }, data: { status: "ENVIADO", enviadoEm: new Date() } });
  } else {
    // Última etapa (cliente) assinada → data book ACEITO + envia link de download ao cliente
    await prisma.dataBookQualidade.update({
      where: { id: etapa.dataBookId },
      data: { status: "ACEITO", aceiteEm: new Date(), aceiteNome: nome, aceiteIp: ip },
    });
    const linkDownload = `${base}/api/qualidade/data-books/assinar/${etapa.token}/pdf?inline=1`;
    try { await enviarEmailDownloadCliente({ email: etapa.email, op, obra: book?.obra, link: linkDownload }); } catch {}
  }

  await prisma.auditLog.create({ data: { userId: null, action: "ASSINAR_DATABOOK", entity: "DataBookAssinatura", entityId: etapa.id, diff: { papel: etapa.papel, nome, ip } } }).catch(() => {});

  const ctx2 = await carregar(params.token);
  return NextResponse.json({ success: true, data: montaPublico(ctx2, params.token) });
}
