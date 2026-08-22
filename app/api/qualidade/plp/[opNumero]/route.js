// GET  — o PLP da obra + as tintas que o CMR registra para ela.
// PUT  — grava o PLP (ADMIN/QUALIDADE).
//
// Vitor (22/08/2026): "se buscarmos na CMR vamos conseguir o registro das tintas que
// foram especificadas para cada obra, e o PLP tem as aplicações recomendadas — poderia
// deixar isso mais dinâmico e rápido, para apenas preencher os valores encontrados".
//
// As duas coisas vêm juntas de propósito: a tela de pintura precisa das duas ao mesmo
// tempo e uma consulta a menos no celular do inspetor é um segundo a menos no galpão.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";
import { normalizarPlp } from "@/lib/plp";
import { classificarMaterial } from "@/lib/databook-secoes";
import { fichasPorR, comFicha } from "@/lib/databook-ficha-r";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * As tintas DESTA obra, do CMR.
 *
 * O anexo do certificado nasce com o nome do arquivo ("R 260620"); é a ficha do CMR,
 * indexada pelo mesmo R, que carrega produto, fabricante, lote e validade. Sem o
 * cruzamento a lista sairia como um punhado de códigos R sem significado.
 */
async function tintasDaOP(opNumero) {
  const docs = await prisma.documentoQualidade.findMany({
    where: { opNumero, ativo: true, categoria: "MATERIAL" },
    select: {
      id: true, nome: true, importRef: true, indiceR: true, numeroDocumento: true,
      numeroCorrida: true, fornecedor: true, dataValidade: true, norma: true, categoria: true,
    },
    take: 800,
  });
  const fichas = await fichasPorR(docs, opNumero);
  const vistos = new Set();
  return docs
    .map((d) => comFicha(d, fichas))
    .filter((d) => classificarMaterial(d.nome) === "TINTA")
    .filter((d) => {
      // o mesmo produto+lote aparece uma vez por vínculo; o inspetor quer a lista limpa
      const k = `${String(d.nome).toUpperCase()}|${d.numeroCorrida || ""}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .map((d) => ({
      id: d.id,
      produto: d.nome,
      fabricante: d.fornecedor || null,
      lote: d.numeroCorrida || null,
      validade: d.dataValidade || null,
      certificado: d.numeroDocumento || null,
      r: d.indiceR || d.importRef || null,
    }))
    .sort((a, b) => a.produto.localeCompare(b.produto));
}

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(params.opNumero || "").trim();
  if (!opNumero) return NextResponse.json({ error: "OP obrigatória" }, { status: 400 });

  const [plp, tintas] = await Promise.all([
    prisma.planoPintura.findUnique({ where: { opNumero } }),
    tintasDaOP(opNumero).catch(() => []),
  ]);
  return NextResponse.json({ plp, tintas, temPlp: !!plp });
}

// POST — importa o PLP da pasta da obra (<OP>/8. Qualidade/PLP).
//
// Vitor (22/08/2026): "esse será sempre o caminho... e também pode ser criado no
// relatório como você deixou". Então esta é a via principal e o formulário é o reparo:
// o PLP oficial é a planilha que a Qualidade emite, não um segundo cadastro no portal.
export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(params.opNumero || "").trim();
  if (!opNumero) return NextResponse.json({ error: "OP obrigatória" }, { status: 400 });

  const { lerPlpDaObra } = await import("@/lib/plp-servidor");
  const r = await lerPlpDaObra(opNumero);
  if (!r.achou) return NextResponse.json({ error: r.erro, caminho: r.caminho || null }, { status: 404 });

  const dados = normalizarPlp(r.dados);
  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } });
  const plp = await prisma.planoPintura.upsert({
    where: { opNumero },
    create: { ...dados, opNumero, opId: op?.id || null, arquivoNome: r.arquivo, arquivoUrl: r.url || null, criadoPorId: user.id, criadoPorNome: user.name || user.email || null },
    update: { ...dados, arquivoNome: r.arquivo, arquivoUrl: r.url || null },
  });
  return NextResponse.json({ ok: true, plp, arquivo: r.arquivo, caminho: r.caminho });
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(params.opNumero || "").trim();
  if (!opNumero) return NextResponse.json({ error: "OP obrigatória" }, { status: 400 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido" }, { status: 400 }); }
  const dados = normalizarPlp(body);

  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } });
  const plp = await prisma.planoPintura.upsert({
    where: { opNumero },
    create: { ...dados, opNumero, opId: op?.id || null, criadoPorId: user.id, criadoPorNome: user.name || user.email || null },
    update: dados,
  });
  return NextResponse.json({ ok: true, plp });
}
