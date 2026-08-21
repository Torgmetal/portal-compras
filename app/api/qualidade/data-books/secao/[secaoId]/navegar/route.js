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
import { resolverPastasDaSecao, listarPasta, secaoNavega, arquivosDaPasta } from "@/lib/databook-pastas";
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
  const escolhidos = Array.isArray(body?.arquivos) ? [...body.arquivos] : [];
  const pastas = Array.isArray(body?.pastas) ? body.pastas : [];
  if (!escolhidos.length && !pastas.length) return NextResponse.json({ error: "Nenhum arquivo selecionado." }, { status: 400 });

  const { driveId, fontes } = await resolverPastasDaSecao(secao.numero, secao.dataBook?.opNumero);
  if (!driveId) return NextResponse.json({ error: "Servidor indisponível." }, { status: 502 });
  if (!fontes.length) return NextResponse.json({ error: "Seção sem pasta resolvida." }, { status: 400 });

  // ── PASTA INTEIRA ───────────────────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "vou precisar poder selecionar pastas inteiras de projetos". Expande aqui,
  // no servidor: o cliente não tem como varrer subpasta, e mandar a lista pronta pelo body faria a
  // tela abrir dezenas de requisições só pra montar o pedido.
  let truncado = false, varridas = 0;
  const ignorados = new Map();
  for (const pasta of pastas) {
    const caminho = String(pasta?.path || "");
    // ⚠ mesma trava do GET: só dentro das fontes desta seção. Sem isto, um `path` livre no body
    // anexaria qualquer pasta da empresa ao data book.
    if (!fontes.some((f) => caminho === f.path || caminho.startsWith(`${f.path}/`))) {
      return NextResponse.json({ error: "Pasta fora das pastas desta seção." }, { status: 400 });
    }
    const r = await arquivosDaPasta(driveId, caminho);
    escolhidos.push(...r.arquivos);
    if (r.truncado) truncado = true;
    for (const g of r.ignorados) ignorados.set(g.ext, (ignorados.get(g.ext) || 0) + g.n);
    varridas++;
  }

  // o mesmo arquivo pode vir avulso e dentro da pasta marcada
  const vistos = new Set();
  const unicos = escolhidos.filter((a) => a?.id && !vistos.has(a.id) && vistos.add(a.id));
  if (!unicos.length) return NextResponse.json({ error: "As pastas selecionadas não têm arquivos anexáveis (PDF ou imagem)." }, { status: 400 });
  escolhidos.length = 0;
  escolhidos.push(...unicos);

  // ⚠ PASTA GRANDE PEDE CONFIRMAÇÃO. "2.5 Projetos" da OP-067 tem mais de mil desenhos: quem marca
  // a pasta pra pegar um projeto não espera anexar a obra inteira, e desfazer é um clique por
  // documento. Devolve a conta e deixa a pessoa decidir antes de gravar.
  const LIMITE_SEM_CONFIRMAR = 300;
  if (escolhidos.length > LIMITE_SEM_CONFIRMAR && !body?.confirmar) {
    return NextResponse.json({
      precisaConfirmar: true,
      arquivos: escolhidos.length,
      truncado,
      ignorados: [...ignorados.entries()].sort((a, b) => b[1] - a[1]).map(([ext, n]) => ({ ext, n })),
    });
  }

  // reaproveita o documento se o mesmo arquivo do SharePoint já foi cadastrado antes
  const spIds = escolhidos.map((a) => a.id).filter(Boolean);
  const existentes = await prisma.documentoQualidade.findMany({
    where: { sharepointItemId: { in: spIds } },
    select: { id: true, sharepointItemId: true },
  });
  const porSp = new Map(existentes.map((e) => [e.sharepointItemId, e.id]));

  // ⚠ EM LOTE. Era um `create` por arquivo — tudo bem pra cinco certificados, inviável pra uma
  // pasta de projetos com mil desenhos: mil inserts em série estouram os 60s da rota. `createMany`
  // não devolve id, então grava e relê pelo sharepointItemId (2 consultas em vez de 1.000).
  const novos = escolhidos.filter((a) => !porSp.has(a.id));
  let criados = 0;
  if (novos.length) {
    const res = await prisma.documentoQualidade.createMany({
      data: novos.map((a) => ({
        nome: String(a.nome || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 300) || "Documento",
        // o `tipo` é o que faz o documento ser reconhecido como desta seção depois
        tipo: `Anexo — ${secao.titulo}`,
        categoria: "ANEXO",
        origem: "servidor",
        sharepointItemId: a.id,
        arquivoUrl: a.url || null,
        opNumero: secao.dataBook?.opNumero || null,
        ativo: true,
      })),
      skipDuplicates: true,
    });
    criados = res.count;
    const relidos = await prisma.documentoQualidade.findMany({
      where: { sharepointItemId: { in: novos.map((a) => a.id) } },
      select: { id: true, sharepointItemId: true },
    });
    for (const d of relidos) porSp.set(d.sharepointItemId, d.id);
  }
  const docIds = escolhidos.map((a) => porSp.get(a.id)).filter(Boolean);

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
      diff: { secao: secao.numero, escolhidos: escolhidos.length, pastas: varridas, truncado, criados, vinculados: res.count },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, vinculados: res.count, criados, jaEstavam: escolhidos.length - res.count,
    pastas: varridas, arquivos: escolhidos.length, truncado,
    ignorados: [...ignorados.entries()].sort((a, b) => b[1] - a[1]).map(([ext, n]) => ({ ext, n })),
  });
}
