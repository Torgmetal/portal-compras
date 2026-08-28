// POST /api/qualidade/data-books/secao/[secaoId]/popular-empresa
// Vincula à seção TODOS os documentos da empresa (Controle de Documentos) da
// categoria/tipo correspondente — soldador (08), inspetor (13), EPS/WPS (07),
// calibração (19). Globais: não dependem da OP. Idempotente (skipDuplicates).
// Inclui docs SEM validade (ex.: CQS de soldador, que valem por continuidade).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { estaFechado, erroPrecisaRevisao } from "@/lib/databook-revisao";
import { whereDocsEmpresa, secaoUsaEmpresa, ehPdf } from "@/lib/databook-secoes";

export const runtime = "nodejs";

// ⚠⚠ OBRA ANTIGA NÃO TEM RELATÓRIO NO PORTAL. Vitor (28/08/2026): "para as obras antigas que estão
// antes do portal, você deixa a permissão para podermos selecionar os instrumentos". A regra
// automática (só o que os relatórios registraram) é a certa daqui pra frente, mas ela devolve VAZIO
// para a obra cujos relatórios foram feitos no papel — e essas obras também precisam do dossiê.
//
// Então a §19 tem os dois caminhos: o automático, que ninguém precisa conferir, e a ESCOLHA à mão,
// que fica registrada no AuditLog com o nome de quem escolheu. O que não existe é o meio-termo de
// puxar os 54 sem ninguém assumir.
async function instrumentosUsados(prisma, opNumero) {
  const rels = await prisma.relatorioInspecao.findMany({
    where: { opNumero, status: "EMITIDO" },
    select: { equipamentos: true },
  }).catch(() => []);
  const usados = new Set();
  for (const r of rels) {
    for (const e of Array.isArray(r.equipamentos) ? r.equipamentos : []) {
      for (const v of [e?.codigo, e?.nome, e?.tag, typeof e === "string" ? e : null]) {
        if (v) usados.add(String(v).trim().toUpperCase());
      }
    }
  }
  return usados;
}

const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const casaInstrumento = (d, usados) =>
  [d.nome, d.arquivoNome].some((v) => {
    const t = norm(v);
    return t && [...usados].some((u) => { const n = norm(u); return n && (t.includes(n) || n.includes(t)); });
  });

// GET — o que esta seção PODE puxar, para a tela deixar escolher à mão.
export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { numero: true, dataBook: { select: { opNumero: true } }, documentos: { select: { documentoId: true } } },
  });
  if (!secao || !secaoUsaEmpresa(secao.numero)) {
    return NextResponse.json({ success: false, error: "Seção não usa documentos da empresa." }, { status: 400 });
  }
  const docs = (await prisma.documentoQualidade.findMany({
    where: whereDocsEmpresa(secao.numero),
    select: { id: true, nome: true, arquivoNome: true, arquivoTipo: true, dataValidade: true },
    orderBy: { nome: "asc" },
  })).filter(ehPdf);

  const usados = secao.numero === "19" ? await instrumentosUsados(prisma, secao.dataBook?.opNumero) : new Set();
  const jaVinculados = new Set(secao.documentos.map((d) => d.documentoId));
  return NextResponse.json({
    success: true,
    docs: docs.map((d) => ({
      id: d.id, nome: d.nome, arquivo: d.arquivoNome, validade: d.dataValidade,
      usado: usados.size ? casaInstrumento(d, usados) : false,
      vinculado: jaVinculados.has(d.id),
    })),
    temUso: usados.size > 0,
  });
}

export async function POST(req, { params }) {
  // 🚫 DATA BOOK FECHADO NÃO SE MEXE — a trava vale em TODA rota que altera seção, não só numa.
  // Vitor (19/08/2026): "os data books emitidos não mexa em nada, é um documento". Uma rota
  // esquecida vira a porta dos fundos: o livro continua dizendo R00 enquanto o conteúdo mudou.
  // A checagem e a mensagem vêm de lib/databook-revisao pra que todas respondam igual.
  {
    const _bookSec = await prisma.dataBookSecao.findUnique({
      where: { id: params.secaoId },
      select: { dataBook: { select: { status: true, emitidoEm: true, revisao: true } } },
    });
    if (_bookSec && estaFechado(_bookSec.dataBook)) {
      return NextResponse.json(erroPrecisaRevisao(_bookSec.dataBook), { status: 409 });
    }
  }

  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const secao = await prisma.dataBookSecao.findUnique({
    where: { id: params.secaoId },
    select: { id: true, numero: true, dataBook: { select: { opNumero: true } } },
  });
  const opNumero = secao?.dataBook?.opNumero || null;
  if (!secao) return NextResponse.json({ success: false, error: "Seção não encontrada" }, { status: 404 });
  if (!secaoUsaEmpresa(secao.numero)) {
    return NextResponse.json({ success: false, error: "Esta seção não usa documentos da empresa" }, { status: 400 });
  }

  const brutos = await prisma.documentoQualidade.findMany({
    where: whereDocsEmpresa(secao.numero),
    select: { id: true, nome: true, arquivoNome: true, arquivoTipo: true },
  });
  let docs = brutos.filter(ehPdf); // só PDF entra no dossiê

  // escolha à mão (obra antiga, ou instrumento que o relatório não registrou)
  const escolha = await req.json().then((b) => (Array.isArray(b?.documentoIds) ? b.documentoIds : null)).catch(() => null);
  let semUso = false;

  if (escolha?.length) {
    const ids = new Set(escolha);
    docs = docs.filter((d) => ids.has(d.id));
  } else {

  // ── §19: SÓ O INSTRUMENTO QUE MEDIU ESTA OBRA ───────────────────────────────────────────────
  //
  // Vitor (28/08/2026): "nos instrumentos calibrados trazer apenas os que foram marcados como
  // usados nos relatórios, nunca listar todos". O mapa de calibração é da fábrica inteira — 54
  // certificados, com máquina de solda e torquímetro no meio. Listar todos num data book afirma
  // que aquela obra foi medida com aparelho que nunca encostou nela, e é o tipo de excesso que a
  // auditoria pega: ela pergunta qual relatório usou o instrumento, e não há resposta.
  //
  // A fonte é o próprio relatório: `equipamentos` guarda o que o inspetor marcou.
  if (secao.numero === "19") {
    // ⚠ só o relatório EMITIDO conta: rascunho é trabalho em curso, e instrumento de rascunho não
    // pode entrar num dossiê que vai ao cliente.
    // ⚠ o certificado se chama "LX-LUXIMETRO", "MPS-MEDIDOR DE ESPESSURA": o CÓDIGO do instrumento
    // é o prefixo do nome. Casa dos dois lados, porque o inspetor marca "LX 01" e o documento diz
    // "LX-LUXIMETRO".
    const usados = await instrumentosUsados(prisma, opNumero);
    if (usados.size) {
      docs = docs.filter((d) => casaInstrumento(d, usados));
    } else {
      // ⚠ nenhum relatório aponta instrumento: não é para puxar todos. Melhor a seção vazia e a
      // explicação do que 54 certificados que ninguém consegue justificar.
      docs = [];
      semUso = true;
    }
  }
  }

  if (!docs.length) {
    return NextResponse.json({
      success: true, vinculados: 0, total: 0, semDocs: true,
      motivo: semUso
        ? "Nenhum relatório de inspeção desta obra registrou instrumento utilizado. A seção traz só os instrumentos marcados nos relatórios — em obra antiga, use \"Escolher instrumentos\" e selecione à mão."
        : undefined,
    });
  }

  const res = await prisma.dataBookSecaoDoc.createMany({
    data: docs.map((d) => ({ secaoId: params.secaoId, documentoId: d.id })),
    skipDuplicates: true,
  });
  await prisma.dataBookSecao.update({ where: { id: params.secaoId }, data: { estado: "ANEXADO" } });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "POPULAR_SECAO_EMPRESA_DATABOOK", entity: "DataBookSecao", entityId: params.secaoId, diff: { numero: secao.numero, novos: res.count, total: docs.length } } })
    .catch(() => {});

  return NextResponse.json({ success: true, vinculados: res.count, total: docs.length });
}
