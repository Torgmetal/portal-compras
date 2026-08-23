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
import { rastreioDaOp } from "@/lib/rastreio-peca";
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

  // perfil → quantas marcas ficaram sem material
  const perfis = new Map();
  for (const [marca, v] of porMarca) {
    if (v.situacao !== "SEM_MATERIAL") continue;
    const k = v.perfil || "(sem perfil)";
    const g = perfis.get(k) || { perfil: k, marcas: 0, exemplos: [] };
    g.marcas++;
    if (g.exemplos.length < 6) g.exemplos.push(marca);
    perfis.set(k, g);
  }
  if (!perfis.size) return NextResponse.json({ op, perfis: [] });

  // o CMR INTEIRO: é fora da OP que o material de estoque está
  const cmr = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL", ativo: true, importRef: { not: null } },
    select: {
      importRef: true, nome: true, opNumero: true, numeroCorrida: true, numeroDocumento: true,
      fornecedor: true, dataRecebimento: true, pesoKg: true, sharepointItemId: true,
    },
    orderBy: { dataRecebimento: "asc" },
  });
  const itens = cmr.map((c) => ({ codigo: null, descricao: c.nome }));

  const trocas = new Map(
    (await prisma.trocaRastreabilidade.findMany({ where: { opNumero: op.numero }, select: { perfil: true, rUsado: true } }))
      .map((t) => [String(t.perfil).trim().toUpperCase(), t.rUsado])
  );

  const out = [];
  for (const g of perfis.values()) {
    const hit = g.perfil === "(sem perfil)" ? null : casarPerfilComOmie(g.perfil, itens);
    const candidatos = hit
      ? cmr.filter((c) => c.nome === hit.descricao).slice(0, 40).map((c) => ({
          r: c.importRef, material: c.nome, op: c.opNumero || null,
          corrida: c.numeroCorrida || null, certificado: c.numeroDocumento || null,
          fornecedor: c.fornecedor || null, recebidoEm: c.dataRecebimento || null,
          pesoKg: Math.round(c.pesoKg || 0), temArquivo: !!c.sharepointItemId,
        }))
      : [];
    out.push({ ...g, candidatos, jaApontado: trocas.get(String(g.perfil).trim().toUpperCase()) || null });
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
    },
  });
}
