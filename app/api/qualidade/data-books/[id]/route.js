// GET   /api/qualidade/data-books/[id]  — detalhe (seções + docs vinculados + travas)
// PATCH /api/qualidade/data-books/[id]  — edita cabeçalho / emite (com trava)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcStatusValidade, diasAlertaCategoria, usaMesInteiro } from "@/lib/qualidade-status";
import { secaoUsaModulo1 , secaoCertaDoDoc, foraDoLivro } from "@/lib/databook-secoes";
import { fichasPorR, comFicha } from "@/lib/databook-ficha-r";

export const runtime = "nodejs";

const schema = z.object({
  observacao: z.string().nullable().optional(),
  pesoTotalKg: z.number().nullable().optional(),
  pecas: z.number().int().nullable().optional(),
  status: z.enum(["EM_MONTAGEM", "EMITIDO"]).optional(),
});

function resolverDoc(d) {
  const st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria), usaMesInteiro(d.categoria));
  return {
    id: d.id, nome: d.nome, tipo: d.tipo, norma: d.norma, categoria: d.categoria,
    importRef: d.importRef, numeroDocumento: d.numeroDocumento,
    numeroCorrida: d.numeroCorrida, dataValidade: d.dataValidade, validado: d.validado,
    temArquivo: !!(d.arquivoUrl || d.sharepointItemId),
    status: st.key, statusLabel: st.label,
  };
}

async function montarDetalhe(id) {
  const book = await prisma.dataBookQualidade.findUnique({
    where: { id },
    include: {
      secoes: { orderBy: { ordem: "asc" }, include: { documentos: true } },
      aprovacoes: { orderBy: { aprovadoEm: "asc" } },
    },
  });
  if (!book) return null;

  // resolve todos os documentos vinculados + candidatos da OP
  const idsVinculados = [...new Set(book.secoes.flatMap((s) => s.documentos.map((d) => d.documentoId)))];
  const candidatos = await prisma.documentoQualidade.findMany({
    where: { ativo: true, opNumero: book.opNumero },
    orderBy: { createdAt: "desc" },
  });
  const docsById = new Map(candidatos.map((d) => [d.id, d]));
  // garante que docs vinculados que não estão entre os candidatos (ex.: opNumero mudou) também resolvam
  const faltantes = idsVinculados.filter((x) => !docsById.has(x));
  if (faltantes.length) {
    const extra = await prisma.documentoQualidade.findMany({ where: { id: { in: faltantes } } });
    extra.forEach((d) => docsById.set(d.id, d));
  }

  // ── O CERTIFICADO ANEXADO SÓ TEM O R NO NOME ────────────────────────────────────────────────
  //
  // "R 260527.pdf" vira um documento chamado "R 260527" e nada mais. A tela mostrava só isso, e a
  // classificação por seção — que lê o nome — não tinha como saber se aquilo era aço, tinta,
  // parafuso ou arame: caía no padrão ESTRUTURAL. Resolvendo a ficha do CMR pelo mesmo R, a tela
  // passa a mostrar o material de verdade E a classificação passa a funcionar.
  const fichas = await fichasPorR([...docsById.values()], book.opNumero);
  for (const [id, d] of docsById) docsById.set(id, comFicha(d, fichas));

  const secoes = book.secoes.map((s) => {
    const docs = s.documentos.map((ld) => docsById.get(ld.documentoId)).filter(Boolean).map(resolverDoc)
      // aponta (sem mexer) o documento que está na seção errada — ver secaoCertaDoDoc
      // `foraDoLivro`: cobertura/vedação não pertence a seção nenhuma — a tela oferece REMOVER
      .map((d) => ({ ...d, secaoCerta: secaoCertaDoDoc(d, s.numero), foraDoLivro: foraDoLivro(d) }));
    const temVencido = docs.some((d) => d.status === "VENCIDO");
    const usaM1 = secaoUsaModulo1(s.fonte);
    return {
      id: s.id, numero: s.numero, titulo: s.titulo, norma: s.norma, fonte: s.fonte,
      estado: s.estado, observacao: s.observacao, usaModulo1: usaM1,
      conteudoJson: s.conteudoJson || null,
      documentos: docs, temVencido,
      bloqueada: s.estado === "ANEXADO" && temVencido, // anexada mas com doc vencido
    };
  });

  const candidatosResolvidos = candidatos.map(resolverDoc);
  const naoNA = secoes.filter((s) => s.estado !== "NA");
  const pendentes = naoNA.filter((s) => s.estado !== "ANEXADO");
  const bloqueadas = secoes.filter((s) => s.bloqueada);
  const podeEmitir = pendentes.length === 0 && bloqueadas.length === 0;
  const anexadas = secoes.filter((s) => s.estado === "ANEXADO").length;

  return {
    id: book.id, opNumero: book.opNumero, cliente: book.cliente, obra: book.obra,
    pesoTotalKg: book.pesoTotalKg, pecas: book.pecas, observacao: book.observacao, tipo: book.tipo,
    status: book.status, emitidoEm: book.emitidoEm, createdAt: book.createdAt,
    // a revisão diz QUAL documento é este — o cabeçalho e o PDF mostram R00, R01…
    revisao: book.revisao ?? 0,
    aprovacoes: book.aprovacoes.map((a) => ({ id: a.id, userId: a.userId, nome: a.nome, papel: a.papel, aprovadoEm: a.aprovadoEm })),
    clienteEmail: book.clienteEmail, enviadoClienteEm: book.enviadoClienteEm,
    aceiteEm: book.aceiteEm, aceiteNome: book.aceiteNome, tokenCliente: book.tokenCliente,
    secoes, candidatos: candidatosResolvidos,
    resumo: {
      total: secoes.length, anexadas, na: secoes.filter((s) => s.estado === "NA").length,
      obrigatorias: naoNA.length, pendentes: pendentes.length, bloqueadas: bloqueadas.length,
      progresso: naoNA.length > 0 ? Math.round((anexadas / naoNA.length) * 100) : 0,
      podeEmitir,
    },
  };
}

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const detalhe = await montarDetalhe(params.id);
  if (!detalhe) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });
  return NextResponse.json({ success: true, data: detalhe });
}

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const atual = await prisma.dataBookQualidade.findUnique({ where: { id: params.id } });
  if (!atual) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });

  // Emissão exige todas as seções obrigatórias prontas (trava de emissão §8)
  if (body.status === "EMITIDO" && atual.status !== "EMITIDO") {
    const det = await montarDetalhe(params.id);
    if (!det.resumo.podeEmitir) {
      // ⚠ DIZER QUAL DOCUMENTO. Vitor (19/08), sobre a §19: "no caso de algum estiver vencido,
      // alertar o usuário e não deixar emitir o data book". A trava já existia, mas a mensagem só
      // dava a CONTAGEM — quem lia "2 com documento vencido" tinha de abrir seção por seção pra
      // descobrir qual instrumento estava fora da validade. Agora vem nomeado, com a data.
      const partes = [];
      const pend = det.secoes.filter((x) => x.estado !== "NA" && x.estado !== "ANEXADO");
      if (pend.length) partes.push(`${pend.length} seção(ões) pendente(s): ${pend.map((x) => x.numero).join(", ")}`);

      const vencidos = det.secoes
        .filter((x) => x.bloqueada)
        .flatMap((x) => x.documentos.filter((d) => d.status === "VENCIDO").map((d) => `Seção ${x.numero} · ${d.nome}${d.dataValidade ? ` (venceu ${new Date(d.dataValidade).toLocaleDateString("pt-BR")})` : ""}`));
      if (vencidos.length) partes.push(`documento(s) vencido(s):\n  · ${vencidos.slice(0, 12).join("\n  · ")}${vencidos.length > 12 ? `\n  · … e mais ${vencidos.length - 12}` : ""}`);

      return NextResponse.json(
        { success: false, error: `Não é possível emitir.\n\n${partes.join("\n\n")}`, vencidos, pendentes: pend.map((x) => x.numero) },
        { status: 400 }
      );
    }
  }

  const data = {};
  if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
  if (body.pesoTotalKg !== undefined) data.pesoTotalKg = body.pesoTotalKg;
  if (body.pecas !== undefined) data.pecas = body.pecas;
  if (body.status !== undefined) {
    data.status = body.status;
    data.emitidoEm = body.status === "EMITIDO" ? new Date() : null;
  }

  await prisma.dataBookQualidade.update({ where: { id: params.id }, data });
  await prisma.auditLog
    .create({ data: { userId: user.id, action: "EDITAR_DATABOOK_QUALIDADE", entity: "DataBookQualidade", entityId: params.id, diff: body } })
    .catch(() => {});

  const detalhe = await montarDetalhe(params.id);
  return NextResponse.json({ success: true, data: detalhe });
}
