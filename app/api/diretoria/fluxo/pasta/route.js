// GET /api/diretoria/fluxo/pasta?opId=… — a lista do portal CONFERIDA contra a pasta da Engenharia.
//
// Vitor (25/08/2026): "o sentido de puxar das pastas deve manter". O painel media lista importada e
// chamava isso de desenho entregue; aqui ele passa a olhar o que existe de fato no SharePoint.
//
// ⚠ SOB DEMANDA, uma OP por vez: a varredura é uma ida ao SharePoint por subpasta (a OP-089 tem 521
// PDFs espalhados em A1..A4). Varrer todas as obras numa requisição estoura o tempo do serverless.
//
// ⚠ COBERTURA SEPARADA POR CONJUNTO E POR CROQUI — não um número só. Medido na OP-097: 642 PDFs na
// pasta, TODOS croqui, e só 2 dos 29 conjuntos com desenho. Num percentual único isso vira "69%
// coberto" e ninguém vê que o que falta é justamente o desenho de conjunto.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { inventarioEngenharia, casaMarca, mencionaMarca } from "@/lib/pasta-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TETO_FALTA = 300; // lista de faltantes: o suficiente para agir, não a base inteira

export async function GET(req) {
  try { await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId: op.id, fonte: "LPC_IMPORT" },
    select: { marca: true, tipoPeca: true },
  });

  let inv;
  try { inv = await inventarioEngenharia(op.numero); }
  catch (e) { return NextResponse.json({ op, erro: e?.message || "Falha ao ler o SharePoint." }, { status: 200 }); }
  if (!inv.achou) return NextResponse.json({ op, erro: inv.erro }, { status: 200 });

  // uma marca pode repetir na LPC (sub-obras) — conferir desenho é por marca distinta
  const vistas = new Map();
  for (const p of pecas) {
    const m = String(p.marca || "").trim();
    if (m && !vistas.has(m.toUpperCase())) vistas.set(m.toUpperCase(), { marca: m, conjunto: p.tipoPeca === "CONJUNTO" });
  }
  const marcas = [...vistas.values()];

  // ⚠ DOIS PASSES. `casaMarca` é o que a emissão usa: nome começando pela marca. O que ela não acha
  // pode simplesmente estar com o nome fora do padrão — aí o desenho existe e a impressão em lote
  // não o encontra, que é um problema DIFERENTE de não existir desenho.
  const comPdf = new Set(), foraPadrao = new Map(), comNc1 = new Set();
  for (const { marca } of marcas) {
    const k = marca.toUpperCase();
    if (inv.pdfs.some((a) => casaMarca(a.nome, marca))) comPdf.add(k);
    else {
      const achado = inv.pdfs.find((a) => mencionaMarca(a.nome, marca));
      if (achado) foraPadrao.set(k, achado.nome);
    }
    if (inv.nc1.some((a) => casaMarca(a.nome, marca))) comNc1.add(k);
  }

  const conta = (filtro) => {
    const alvo = marcas.filter(filtro);
    const com = alvo.filter((x) => comPdf.has(x.marca.toUpperCase()));
    return { total: alvo.length, comDesenho: com.length, semDesenho: alvo.length - com.length };
  };
  const conjuntos = conta((x) => x.conjunto);
  const croquis = conta((x) => !x.conjunto);

  const semDesenho = marcas
    .filter((x) => !comPdf.has(x.marca.toUpperCase()))
    .map((x) => ({
      marca: x.marca, conjunto: x.conjunto, nc1: comNc1.has(x.marca.toUpperCase()),
      foraPadrao: foraPadrao.get(x.marca.toUpperCase()) || null,
    }))
    .sort((a, b) => (a.conjunto === b.conjunto ? String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }) : a.conjunto ? -1 : 1));

  // ⚠ o veredito é a leitura em uma frase — o que a Diretoria lê antes de abrir a tabela.
  //   "só máquina" é a assinatura da OP-106: NC1/IGS gerados, desenho nenhum emitido.
  const temMaquina = inv.nc1.length > 0 || inv.igs.length > 0;
  const veredito =
    !marcas.length && !inv.pdfs.length ? "VAZIA"
    : !inv.pdfs.length && temMaquina ? "SO_MAQUINA"
    : !inv.pdfs.length ? "SEM_DESENHO"
    : !marcas.length ? "SEM_LISTA"
    : semDesenho.length === 0 ? "OK"
    : conjuntos.semDesenho > 0 && croquis.semDesenho === 0 ? "SEM_CONJUNTO"
    : "PARCIAL";

  return NextResponse.json({
    op,
    veredito,
    arquivos: {
      pdfs: inv.pdfs.length, outrosPdfs: inv.outrosPdfs, nc1: inv.nc1.length, igs: inv.igs.length,
      listas: inv.listas.map((a) => a.nome),
      // ⚠ pasta do cliente: modelo do template NÃO conta. Vitor: "mesmo sendo projeto do cliente
      // deveria ser colocado em pastas corretas" — a 2.5.5 da OP-106 tem só "Mandar nessa pasta.docx".
      cliente: inv.cliente.length,
      clienteAmostra: inv.cliente.slice(0, 6).map((a) => a.nome),
      modelos: inv.modelos,
      porFormato: Object.entries(inv.pdfs.reduce((a, p) => ({ ...a, [p.formato]: (a[p.formato] || 0) + 1 }), {})).sort(),
      ultimo: inv.ultimo,
    },
    lista: { marcas: marcas.length, conjuntos, croquis, foraPadrao: foraPadrao.size },
    semDesenho: semDesenho.slice(0, TETO_FALTA),
    truncado: Math.max(0, semDesenho.length - TETO_FALTA),
  });
}
