// Perfis da OP que não têm material no CMR dela — e onde esse material está.
//
// Vitor (22/08/2026), sobre as peças sem R no data book da OP-067: "você não consegue preencher
// essa informação através dos certificados que te falei que estava na pasta?".
//
// ⚠ A PASTA NÃO PODE PREENCHER ISSO, e vale dizer por quê: os PDFs de lá são indexados POR R
// ("R 260787.pdf"). Eles dizem qual certificado pertence a um R — não qual peça consumiu qual R.
// Quem atribui R a peça é o consumo FIFO sobre o CMR (o registro de recebimento), não o arquivo.
//
// O que PREENCHE é o próprio CMR, quando o material existe mas está lançado em OUTRA OP — que é
// exatamente o caso do "material de estoque" que ele descreveu. Na OP-067, 391 das 520 marcas sem
// material são o mesmo perfil (TB 1.1/4" - DIN2440 LEVE), cuja entrada está sob a OP-079.
//
// ⚠ E O PORTAL PROPÕE, NÃO AFIRMA. Puxar sozinho o certificado de outra OP seria inventar
// rastreabilidade: ninguém além de quem separou o material sabe se aquele fardo é mesmo este.
// Por isso a rota devolve CANDIDATOS; quem confirma grava uma TrocaRastreabilidade (OP+perfil),
// que o motor de rastreio já respeita acima do FIFO — e aí um único registro resolve as 391.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rastreioDaOp, ehMateriaPrimaDePeca } from "@/lib/rastreio-peca";
import { casarPerfilComOmie } from "@/lib/casar-omie";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE", "PCP", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const numero = new URL(req.url).searchParams.get("op");
  if (!numero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findFirst({ where: { numero }, select: { id: true, numero: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const { porMarca } = await rastreioDaOp(op.numero, op.id);

  // ⚠⚠ DUAS FALTAS DIFERENTES, MESMO REMÉDIO. Vitor (28/08/2026), montando o data book da OP-106:
  // "temos certificados dos materiais, porém alguns não estão saindo na LPC".
  //
  //   SEM_MATERIAL → não há entrada nenhuma desse perfil no CMR da OP.
  //   ESTOQUE      → HÁ entrada, mas a peça foi CORTADA ANTES de ela chegar. Foi o caso da 106: o
  //                  aço entrou em 11 e 13/08 e as peças foram cortadas em 3 e 4/08 — o motor se
  //                  recusa a dizer que a peça saiu de aço que ainda não tinha chegado, e com razão.
  //
  // Nos dois casos a peça fica sem certificado no data book, e nos dois quem sabe a resposta é quem
  // separou o material. Por isso o ESTOQUE entra aqui também: era a única falta sem lugar para ser
  // resolvida, e a pessoa que monta o data book descobria o problema sem ter onde arrumá-lo.
  const perfis = new Map();
  for (const [marca, v] of porMarca) {
    if (v.situacao !== "SEM_MATERIAL" && v.situacao !== "ESTOQUE") continue;
    const k = v.perfil || "(sem perfil)";
    const g = perfis.get(k) || { perfil: k, marcas: 0, exemplos: [], motivo: v.situacao, cortadoEm: null, materiais: new Set() };
    g.marcas++;
    // ⚠⚠ O MATERIAL QUE O MOTOR JÁ RECONHECEU vale mais que o palpite do casador. No ESTOQUE a OP
    // TEM entrada do perfil (ela só chegou tarde), e é a descrição DELA que diz qual aço é este —
    // procurar no CMR pela descrição que o casador escolhe sozinho trazia outra chapa e, com ela,
    // certificados de 2025 no lugar do fardo de julho que estava na prateleira.
    for (const c of v.candidatas || []) if (c.material) g.materiais.add(c.material);
    // o corte mais antigo do perfil é o que limita quais entradas podem ter sido a origem
    if (v.cortadoEm && (!g.cortadoEm || v.cortadoEm < g.cortadoEm)) g.cortadoEm = v.cortadoEm;
    if (g.motivo !== v.situacao) g.motivo = "MISTO";
    if (g.exemplos.length < 6) g.exemplos.push(marca);
    perfis.set(k, g);
  }
  if (!perfis.size) return NextResponse.json({ op, perfis: [] });

  // o CMR INTEIRO: é fora da OP que o material de estoque está
  // ⚠ menos tinta e consumível de solda — não são origem de peça nenhuma (ver rastreio-peca)
  const cmrTodo = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", ativo: true, importRef: { not: null } },
    select: {
      importRef: true, nome: true, opNumero: true, numeroCorrida: true, numeroDocumento: true,
      fornecedor: true, dataRecebimento: true, pesoKg: true, sharepointItemId: true,
    },
    orderBy: { dataRecebimento: "asc" },
  });
  const cmr = cmrTodo.filter((c) => ehMateriaPrimaDePeca(c.nome));
  const itens = cmr.map((c) => ({ codigo: null, descricao: c.nome }));

  const trocas = new Map(
    (await prisma.trocaRastreabilidade.findMany({ where: { opNumero: op.numero }, select: { perfil: true, rUsado: true } }))
      .map((t) => [String(t.perfil).trim().toUpperCase(), t.rUsado])
  );

  const out = [];
  for (const g of perfis.values()) {
    const hit = g.perfil === "(sem perfil)" ? null : casarPerfilComOmie(g.perfil, itens);
    // descrições aceitas: as que o motor já usou nesta OP + a que o casador achou
    const nomes = new Set(g.materiais);
    if (hit?.descricao) nomes.add(hit.descricao);
    const candidatos = nomes.size
      ? cmr.filter((c) => nomes.has(c.nome)).slice(0, 40).map((c) => ({
          r: c.importRef, material: c.nome, op: c.opNumero || null,
          corrida: c.numeroCorrida || null, certificado: c.numeroDocumento || null,
          fornecedor: c.fornecedor || null, recebidoEm: c.dataRecebimento || null,
          pesoKg: Math.round(c.pesoKg || 0), temArquivo: !!c.sharepointItemId,
          // ⚠ a entrada que chegou DEPOIS do corte não pode ser a origem — fica visível, mas
          // marcada: é o que separa o candidato plausível do impossível.
          antesDoCorte: !g.cortadoEm || !c.dataRecebimento
            ? null
            : c.dataRecebimento.toISOString().slice(0, 10) <= String(g.cortadoEm).slice(0, 10),
        }))
      : [];
    // primeiro os que já estavam na casa quando a peça foi cortada, do mais recente para o mais antigo
    candidatos.sort((a, b) => (b.antesDoCorte === true) - (a.antesDoCorte === true) || new Date(b.recebidoEm || 0) - new Date(a.recebidoEm || 0));
    const { materiais, ...semSet } = g;
    out.push({ ...semSet, materiais: [...materiais], candidatos, jaApontado: trocas.get(String(g.perfil).trim().toUpperCase()) || null });
  }
  // mais marcas primeiro: é onde um registro só resolve mais peça
  out.sort((a, b) => b.marcas - a.marcas);

  return NextResponse.json({
    op,
    perfis: out,
    totais: {
      perfis: out.length,
      marcas: out.reduce((s, g) => s + g.marcas, 0),
      comCandidato: out.filter((g) => g.candidatos.length).length,
      semCandidato: out.filter((g) => !g.candidatos.length).length,
      cortadaAntes: out.filter((g) => g.motivo === "ESTOQUE" || g.motivo === "MISTO").length,
    },
  });
}
