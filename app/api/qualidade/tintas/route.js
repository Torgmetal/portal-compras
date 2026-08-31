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
import { numeroBR } from "@/lib/numero-br";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LER = ["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP"];
const ESCREVER = ["ADMIN", "QUALIDADE"];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = numeroBR(v, NaN);
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

  // ⚠ VÁRIOS ARQUIVOS DE UMA VEZ. Vitor (27/08/2026): "nesse botão de importação vamos conseguir
  // colocar mais do que 1?" — sim, e é o caso comum: a tinta, o endurecedor e o diluente são três
  // boletins do mesmo esquema. Importar um por vez faria a pessoa repetir o caminho três vezes e
  // perder o vínculo entre eles.
  const entrada = Array.isArray(body?.arquivos) && body.arquivos.length
    ? body.arquivos
    : [{ arquivo: body?.arquivo, nome: body?.arquivoNome, contentType: body?.contentType }];
  if (entrada.length > 8) return NextResponse.json({ error: "Envie até 8 boletins por vez." }, { status: 400 });

  const pedidos = [];
  for (const a of entrada) {
    const b64 = String(a?.arquivo || "").split(",").pop();
    if (!b64) continue;
    const bytes = Buffer.from(b64, "base64");
    const nome = txt(a?.nome, 200) || "boletim.pdf";
    // ⚠ o corpo da rota serverless trava por volta de 4,5 MB — somando os arquivos, o teto é o
    // mesmo. Dizer o limite é melhor que deixar a requisição morrer sem resposta.
    if (bytes.length > 4 * 1024 * 1024) {
      return NextResponse.json({ error: `"${nome}" tem ${(bytes.length / 1048576).toFixed(1)} MB e o limite é 4 MB por arquivo. Envie só as páginas de dados técnicos.` }, { status: 413 });
    }
    pedidos.push({ bytes, nome, contentType: String(a?.contentType || "application/pdf").split(";")[0].trim() });
  }
  if (!pedidos.length) return NextResponse.json({ error: "Envie o arquivo do boletim técnico." }, { status: 400 });

  const lista = [];
  const falhas = [];
  for (const pd of pedidos) {
    const ehPlanilha = /\.xlsx?$/i.test(pd.nome) || /spreadsheet|excel/i.test(pd.contentType);
    try {
      const achados = ehPlanilha
        ? await (async () => {
            const { planilhaParaTexto } = await import("@/lib/plp-servidor");
            return extrairBoletim({ texto: planilhaParaTexto(pd.bytes), contentType: "text/plain", arquivo: pd.nome });
          })()
        : await extrairBoletim({ data: pd.bytes, contentType: pd.contentType, arquivo: pd.nome });
      if (achados?.length) lista.push(...achados.map((x) => ({ ...x, boletimNome: pd.nome })));
      else falhas.push(`${pd.nome} (nenhum produto reconhecido)`);
    } catch (e) {
      const { msg } = mensagemErroIA(e);
      falhas.push(`${pd.nome} (${msg})`);
    }
  }
  if (!lista.length) {
    return NextResponse.json({
      error: falhas.length
        ? `Não consegui aproveitar nenhum arquivo: ${falhas.slice(0, 3).join(" · ")}`
        : "Li o arquivo e não reconheci nenhum produto com fabricante. Confira se é o boletim técnico da tinta.",
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
    const comum = { ...dados, extraidoEm: new Date(), ativo: true };
    salvos.push(jaTem
      ? await prisma.produtoTinta.update({ where: { id: jaTem.id }, data: comum })
      : await prisma.produtoTinta.create({ data: { ...comum, criadoPorId: user?.id || null, criadoPorNome: user?.name || user?.email || null } }));
    if (jaTem) atualizados++;
  }

  // ⚠⚠ AMARRA A TINTA AO DILUENTE. Se o diluente veio na mesma leva (ou já estava no catálogo), o
  // vínculo é feito aqui — é o que faz o PLP conseguir dizer QUAL diluente usar, com a ficha dele
  // por trás, em vez de repetir um nome solto digitado na tinta.
  const diluentes = await prisma.produtoTinta.findMany({ where: { categoria: "DILUENTE", ativo: true }, select: { id: true, produto: true } });
  const soDigitos = (v) => String(v || "").replace(/\D/g, "");
  for (const t of salvos.filter((x) => x.categoria === "TINTA" && x.diluente && !x.diluenteId)) {
    const cod = soDigitos(t.diluente);
    const achado = diluentes.find((d) => {
      const dc = soDigitos(d.produto);
      // casa pelo CÓDIGO quando há um ("Diluente 34.019" → 34019); senão pelo nome
      if (cod && dc) return cod.includes(dc) || dc.includes(cod);
      return String(t.diluente).toLowerCase().includes(String(d.produto).toLowerCase());
    });
    if (achado) {
      await prisma.produtoTinta.update({ where: { id: t.id }, data: { diluenteId: achado.id } });
      t.diluenteId = achado.id;
    }
  }
  const tinta = salvos.find((x) => x.categoria === "TINTA") || salvos[0];

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "TINTA_IMPORTADA", entity: "ProdutoTinta", entityId: tinta.id,
      diff: { arquivos: pedidos.map((p2) => p2.nome), produtos: salvos.map((x) => `${x.categoria} · ${x.fabricante} · ${x.produto}`), atualizados, falhas } },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, tinta, tintas: salvos, total: salvos.length, atualizados,
    falhas: falhas.length ? falhas : undefined,
  });
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
    categoria: ["TINTA", "ENDURECEDOR", "DILUENTE"].includes(String(b.categoria || "").toUpperCase()) ? String(b.categoria).toUpperCase() : "TINTA",
    componenteA: txt(b.componenteA, 160), componenteB: txt(b.componenteB, 160),
    proporcaoMistura: txt(b.proporcaoMistura, 60), potLife: txt(b.potLife, 60),
    diluenteId: txt(b.diluenteId, 40),
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
