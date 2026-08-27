// GET  /api/qualidade/tintas            → o catálogo de tintas (para o PLP escolher)
// POST /api/qualidade/tintas            → importa um BOLETIM TÉCNICO e cadastra o produto
// PUT  /api/qualidade/tintas            → corrige um produto do catálogo
//
// Vitor (27/08/2026): "vou procurar cadastrar os produtos de vários fornecedores, e preciso criar
// um banco de dados onde você vai consultar e me dá a diluição do produto, a espessura da camada
// úmida (…) e ao invés de criarmos um banco de dados, na verdade eu importar um boletim técnico".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { extrairBoletim } from "@/lib/extrair-boletim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LER = ["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP"];
const ESCREVER = ["ADMIN", "QUALIDADE"];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

// ⚠ o mesmo tratamento de erro da análise de calibração: quem está preenchendo um PLP não deve ver
// JSON de API na tela — e "créditos acabaram" é ação de TI, não de quem clicou.
function mensagemErroIA(e) {
  const m = String(e?.message || "");
  if (/credit balance|too low|billing|insufficient|payment/i.test(m)) return { msg: "Leitura por IA indisponível: os créditos da API da Anthropic acabaram. Recarregue em console.anthropic.com › Plans & Billing.", status: 402 };
  if (/rate.?limit|overloaded|\b429\b|\b529\b/i.test(m)) return { msg: "A IA está sobrecarregada no momento. Tente de novo em alguns instantes.", status: 503 };
  if (/ANTHROPIC_API_KEY/i.test(m)) return { msg: "A chave da API de IA não está configurada. Avise o TI.", status: 500 };
  return { msg: m || "Falha ao ler o boletim técnico.", status: 502 };
}

export async function GET(req) {
  try { await requireRole(LER); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const u = new URL(req.url);
  const q = String(u.searchParams.get("q") || "").trim();
  const tintas = await prisma.produtoTinta.findMany({
    where: {
      ativo: true,
      ...(q ? { OR: [{ produto: { contains: q, mode: "insensitive" } }, { fabricante: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ fabricante: "asc" }, { produto: "asc" }],
    take: 400,
  });
  return NextResponse.json({ tintas });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ESCREVER); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const arquivoNome = txt(body?.arquivoNome, 200) || "boletim.pdf";
  const contentType = String(body?.contentType || "application/pdf").split(";")[0].trim();
  const b64 = String(body?.arquivo || "").split(",").pop();
  if (!b64) return NextResponse.json({ error: "Envie o arquivo do boletim técnico." }, { status: 400 });

  // ⚠ o corpo da rota serverless trava por volta de 4,5 MB — boletim técnico não chega perto disso,
  // mas dizer o limite é melhor que deixar a requisição morrer sem resposta.
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > 4 * 1024 * 1024) {
    return NextResponse.json({ error: `O boletim tem ${(bytes.length / 1048576).toFixed(1)} MB e o limite é 4 MB. Envie só as páginas de dados técnicos.` }, { status: 413 });
  }

  // planilha vira TEXTO (a API não lê xlsx) e pode trazer VÁRIOS produtos — é o caso da
  // "Descrição de tintas para o PLP.xlsx" que a Qualidade já mantém à mão.
  const ehPlanilha = /\.xlsx?$/i.test(arquivoNome) || /spreadsheet|excel/i.test(contentType);
  let lista;
  try {
    if (ehPlanilha) {
      const { planilhaParaTexto } = await import("@/lib/plp-servidor");
      lista = await extrairBoletim({ texto: planilhaParaTexto(bytes), contentType: "text/plain", arquivo: arquivoNome });
    } else {
      lista = await extrairBoletim({ data: bytes, contentType, arquivo: arquivoNome });
    }
  } catch (e) {
    const { msg, status } = mensagemErroIA(e);
    return NextResponse.json({ error: msg }, { status });
  }
  if (!lista?.length) {
    return NextResponse.json({
      error: "Li o arquivo e não reconheci nenhum produto com fabricante. Confira se é o boletim técnico da tinta ou uma tabela de tintas.",
    }, { status: 422 });
  }

  // ⚠ MESMO PRODUTO DO MESMO FABRICANTE É UM SÓ. Reimportar o boletim ATUALIZA — é assim que a
  // revisão nova da ficha entra sem criar um segundo cadastro com dados velhos ao lado.
  const salvos = [];
  let atualizados = 0;
  for (const dados of lista) {
    const jaTem = await prisma.produtoTinta.findFirst({
      where: { fabricante: { equals: dados.fabricante, mode: "insensitive" }, produto: { equals: dados.produto, mode: "insensitive" } },
      select: { id: true },
    });
    const comum = { ...dados, boletimNome: arquivoNome, extraidoEm: new Date(), ativo: true };
    salvos.push(jaTem
      ? await prisma.produtoTinta.update({ where: { id: jaTem.id }, data: comum })
      : await prisma.produtoTinta.create({ data: { ...comum, criadoPorId: user?.id || null, criadoPorNome: user?.name || user?.email || null } }));
    if (jaTem) atualizados++;
  }
  const tinta = salvos[0];

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "TINTA_IMPORTADA", entity: "ProdutoTinta", entityId: tinta.id,
      diff: { boletim: arquivoNome, produtos: salvos.map((x) => `${x.fabricante} · ${x.produto}`), atualizados } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, tinta, tintas: salvos, total: salvos.length, atualizados });
}

export async function PUT(req) {
  let user;
  try { user = await requireRole(ESCREVER); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const b = await req.json().catch(() => ({}));
  const id = txt(b?.id, 40);
  if (!id) return NextResponse.json({ error: "Produto não informado." }, { status: 400 });

  // ⚠ o que a leitura errou se corrige aqui: o boletim é a fonte, mas quem responde é a Qualidade.
  const dados = {
    fabricante: txt(b.fabricante, 80), produto: txt(b.produto, 160), especificacao: txt(b.especificacao, 300),
    tipo: ["PRIMER", "INTERMEDIARIA", "ACABAMENTO", "UNICA"].includes(String(b.tipo || "").toUpperCase()) ? String(b.tipo).toUpperCase() : null,
    norma: txt(b.norma, 80), diluente: txt(b.diluente, 120),
    diluicaoMin: num(b.diluicaoMin), diluicaoMax: num(b.diluicaoMax),
    camadas: Array.isArray(b.camadas)
      ? b.camadas.slice(0, 12).map((c) => ({ diluicao: num(c?.diluicao) ?? 0, umida: num(c?.umida), seca: num(c?.seca) })).filter((c) => c.umida || c.seca)
      : [],
    secaMin: num(b.secaMin), secaMax: num(b.secaMax),
    secagemToque: txt(b.secagemToque, 80), secagemManuseio: txt(b.secagemManuseio, 80), secagemRepintura: txt(b.secagemRepintura, 80),
    rendimento: txt(b.rendimento, 120), solidos: txt(b.solidos, 80), solidosVol: num(b.solidosVol), observacoes: txt(b.observacoes, 1000),
    ...(b.ativo === false ? { ativo: false } : {}),
  };
  if (!dados.fabricante || !dados.produto) return NextResponse.json({ error: "Fabricante e produto são obrigatórios." }, { status: 400 });

  const tinta = await prisma.produtoTinta.update({ where: { id }, data: dados });
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "TINTA_EDITADA", entity: "ProdutoTinta", entityId: id,
      diff: { fabricante: tinta.fabricante, produto: tinta.produto } },
  }).catch(() => {});
  return NextResponse.json({ ok: true, tinta });
}
