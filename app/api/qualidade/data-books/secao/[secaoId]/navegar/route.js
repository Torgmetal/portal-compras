// GET  — navega a pasta do SharePoint da seção (subpastas + arquivos pra escolher)
// POST — anexa os arquivos selecionados à seção
//
// Vitor (19/08/2026), seção a seção: "deixar navegar na pasta e selecionar os arquivos que quero
// colocar", "listar as duas pastas e selecionar os arquivos delas", "deixe eu selecionar qual eu
// quero anexar".
//
// O que existia era um botão que puxava TUDO de uma vez, sem escolha. Serve pra desenho, onde a
// OP inteira entra; não serve pra qualificação de soldador, EPS ou calibração, onde entram só os
// que aquela obra usou.
//
// 🚫 NÃO COPIA ARQUIVO. Cria um `DocumentoQualidade` apontando pro item do SharePoint
// (`sharepointItemId`) — o original continua lá e é ele que o data book abre. Copiar criaria duas
// verdades, e a revisão do arquivo no servidor não chegaria no livro.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resolverPastasDaSecao, listarPasta, secaoNavega } from "@/lib/databook-pastas";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERFIS = ["ADMIN", "QUALIDADE", "ENGENHARIA", "PRODUCAO"];

async function carregarSecao(secaoId) {
  return prisma.dataBookSecao.findUnique({
    where: { id: secaoId },
    select: {
      id: true, numero: true, titulo: true,
      dataBook: { select: { id: true, opNumero: true, status: true, emitidoEm: true, revisao: true } },
    },
  });
}

export async function GET(req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { secaoId } = await params;
  const secao = await carregarSecao(secaoId);
  if (!secao) return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 });
  if (!secaoNavega(secao.numero)) return NextResponse.json({ error: "Esta seção não tem pasta no servidor." }, { status: 400 });

  const { driveId, fontes, erros } = await resolverPastasDaSecao(secao.numero, secao.dataBook?.opNumero);
  if (!driveId) return NextResponse.json({ error: erros[0] || "Servidor indisponível." }, { status: 502 });

  // `path` navega dentro de uma fonte; sem ele, devolve as fontes (raízes) da seção
  const path = new URL(req.url).searchParams.get("path");
  if (!path) {
    // uma fonte só: já abre nela, pra não obrigar um clique à toa
    if (fontes.length === 1) {
      try {
        const conteudo = await listarPasta(driveId, fontes[0].path);
        return NextResponse.json({ fontes, erros, ...conteudo, raiz: fontes[0].path });
      } catch (e) {
        return NextResponse.json({ fontes, erros: [...erros, `Falha ao abrir "${fontes[0].label}": ${e.message}`], pastas: [], arquivos: [] });
      }
    }
    return NextResponse.json({ fontes, erros, pastas: [], arquivos: [] });
  }

  // ⚠ só deixa navegar DENTRO das fontes da seção — o token do app enxerga o drive inteiro, e um
  // `path` livre viraria um navegador de arquivos da empresa dentro do data book.
  if (!fontes.some((f) => path === f.path || path.startsWith(`${f.path}/`))) {
    return NextResponse.json({ error: "Caminho fora das pastas desta seção." }, { status: 400 });
  }

  try {
    const conteudo = await listarPasta(driveId, path);
    return NextResponse.json({ fontes, erros, ...conteudo });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao abrir a pasta: ${e.message}` }, { status: 502 });
  }
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { secaoId } = await params;
  const secao = await carregarSecao(secaoId);
  if (!secao) return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 });

  // 🚫 DATA BOOK EMITIDO NÃO SE MEXE. Vitor (19/08): "os data books emitidos não mexa em nada, é
  // um documento". Alterar o conteúdo de um livro já emitido — e talvez já assinado e aceito pelo
  // cliente — faz o PDF deixar de corresponder ao que foi entregue. Mudança depois da emissão tem
  // de virar REVISÃO, com histórico e assinaturas de novo.
  if (estaFechado(secao.dataBook)) return NextResponse.json(erroPrecisaRevisao(secao.dataBook), { status: 409 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }
  const escolhidos = Array.isArray(body?.arquivos) ? body.arquivos : [];
  if (!escolhidos.length) return NextResponse.json({ error: "Nenhum arquivo selecionado." }, { status: 400 });

  const { driveId, fontes } = await resolverPastasDaSecao(secao.numero, secao.dataBook?.opNumero);
  if (!driveId) return NextResponse.json({ error: "Servidor indisponível." }, { status: 502 });
  if (!fontes.length) return NextResponse.json({ error: "Seção sem pasta resolvida." }, { status: 400 });

  // reaproveita o documento se o mesmo arquivo do SharePoint já foi cadastrado antes
  const spIds = escolhidos.map((a) => a.id).filter(Boolean);
  const existentes = await prisma.documentoQualidade.findMany({
    where: { sharepointItemId: { in: spIds } },
    select: { id: true, sharepointItemId: true },
  });
  const porSp = new Map(existentes.map((e) => [e.sharepointItemId, e.id]));

  const docIds = [];
  let criados = 0;
  for (const a of escolhidos) {
    let docId = porSp.get(a.id);
    if (!docId) {
      const novo = await prisma.documentoQualidade.create({
        data: {
          nome: String(a.nome || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 300) || "Documento",
          // o `tipo` é o que faz o documento ser reconhecido como desta seção depois
          tipo: `Anexo — ${secao.titulo}`,
          categoria: "ANEXO",
          origem: "servidor",
          sharepointItemId: a.id,
          arquivoUrl: a.url || null,
          opNumero: secao.dataBook?.opNumero || null,
          ativo: true,
        },
        select: { id: true },
      });
      docId = novo.id;
      criados++;
    }
    docIds.push(docId);
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: docIds.map((documentoId) => ({ secaoId, documentoId })),
    skipDuplicates: true,
  });
  if (res.count > 0) {
    await prisma.dataBookSecao.update({ where: { id: secaoId }, data: { estado: "ANEXADO" } });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "ANEXAR_SERVIDOR_DATABOOK", entity: "DataBookSecao", entityId: secaoId,
      diff: { secao: secao.numero, escolhidos: escolhidos.length, criados, vinculados: res.count },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, vinculados: res.count, criados, jaEstavam: escolhidos.length - res.count });
}
