// LISTA DE SEPARAÇÃO DE MATERIAL — o que o Almoxarifado tira do estoque pra atender os croquis.
// GET ?opId=&setor=[&ids=a,b,c]
//
// Vitor (19/08): "precisa conter tipo do material, quantidade de barras, peso unitário e total e
// o principal a Rastreabilidade do material — será em cima disso que vamos liberar e garantir que
// os materiais que estamos usando para atender a necessidade dos croquis são de fato os Rs".
//
// Agrupa as peças por PERFIL (é assim que se separa no estoque), traz o R indicado pelo motor de
// rastreio e — porque "pode ocorrer que no ato da separação um fardo que esteja mais fácil de ser
// retirado esteja acima do que de fato é o R indicado" — devolve TODOS os Rs daquele material no
// CMR (desta OP e das outras), pra a tela permitir trocar. Trocando o R, corrida/certificado/NF/
// data/fornecedor vêm junto: quem manda é o R.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rastreioDaOp } from "@/lib/rastreio-peca";
import { casarPerfilComOmie } from "@/lib/casar-omie";
import { ehItemComprado } from "@/lib/item-comprado";
import { dedupLpcLe } from "@/lib/pecas-producao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BARRA_MM = 6000; // barra comercial padrão — a estimativa é o MÍNIMO pelo comprimento
const ehChapa = (perfil) => /^(CH|CHAPA)\b|^CH\d/i.test(String(perfil || "").trim());

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMPRAS", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const opId = sp.get("opId");
  const setor = sp.get("setor") || null;
  const ids = (sp.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!opId) return NextResponse.json({ error: "Informe opId." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, obra: true, cliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const brutas = await prisma.pecaConjunto.findMany({
    where: { opId, perfil: { not: null }, ...(ids.length ? { id: { in: ids } } : {}) },
    select: { id: true, marca: true, perfil: true, material: true, descricao: true, qte: true, comprimentoMm: true, pesoUnitKg: true, pesoTotalKg: true, fonte: true, tipoPeca: true },
  });
  // mesmas exclusões do fluxo de produção: item comprado/grade e a duplicata LPC×LE
  const pecas = dedupLpcLe(brutas.filter((p) => !ehItemComprado(p)));

  // R indicado por peça (motor de rastreio: FIFO pela entrega mais antiga, só peça cortada)
  let porMarca = new Map();
  try { ({ porMarca } = await rastreioDaOp(op.numero, op.id)); } catch {}

  // Entradas do CMR — as desta OP e as das outras (o fardo pode ser de qualquer lote em estoque)
  const cmr = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL" },
    select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true, quantidade: true, opNumero: true },
    orderBy: [{ dataRecebimento: "desc" }],
  });
  // O matcher roda por PERFIL contra a lista de materiais; casar contra as 3.7 mil linhas seria
  // desperdício — são ~1,1 mil descrições DISTINTAS. Casa nas distintas e expande depois.
  const comoItens = [...new Set(cmr.map((c) => c.nome))].map((nome) => ({ codigo: null, descricao: nome }));
  const opcaoR = (c) => ({
    rastreio: c.importRef, material: c.nome, corrida: c.numeroCorrida, certificado: c.numeroDocumento,
    norma: c.norma, fornecedor: c.fornecedor, pedido: c.pedidoCompra, nf: c.nfNumero,
    recebidoEm: c.dataRecebimento ? c.dataRecebimento.toISOString() : null,
    pesoKg: c.pesoKg, quantidade: c.quantidade, opNumero: c.opNumero, daOp: c.opNumero === op.numero,
  });

  // ── agrupa por PERFIL (é a unidade de separação no estoque) ────────────────────────────────
  const grupos = new Map();
  for (const p of pecas) {
    const k = String(p.perfil).trim().toUpperCase();
    const g = grupos.get(k) || {
      perfil: String(p.perfil).trim(), material: p.material || null,
      qtdPecas: 0, pesoTotalKg: 0, comprimentoTotalMm: 0, marcas: [], pesos: new Set(),
      rs: new Map(), // R indicado → quantas peças o apontam
    };
    g.qtdPecas += Number(p.qte) || 0;
    g.pesoTotalKg += Number(p.pesoTotalKg) || 0;
    g.comprimentoTotalMm += (Number(p.comprimentoMm) || 0) * (Number(p.qte) || 0);
    if (g.marcas.length < 60) g.marcas.push(p.marca);
    if (p.pesoUnitKg) g.pesos.add(Math.round(Number(p.pesoUnitKg) * 100) / 100);
    const r = porMarca.get(p.marca);
    const ind = r?.usadas?.[0]?.rastreio;
    if (ind) g.rs.set(ind, (g.rs.get(ind) || 0) + 1);
    if (!g.material && p.material) g.material = p.material;
    grupos.set(k, g);
  }

  const itens = [...grupos.values()].map((g) => {
    // opções de R daquele material (o matcher fala a língua do cadastro)
    const hit = comoItens.length ? casarPerfilComOmie(g.perfil, comoItens) : null;
    const opcoes = hit ? cmr.filter((c) => c.nome === hit.descricao).map(opcaoR) : [];
    // R indicado = o mais apontado pelas peças do grupo; sem isso, a entrada mais antiga da OP
    const maisApontado = [...g.rs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const daOpAntiga = [...opcoes].filter((o) => o.daOp).sort((a, b) => String(a.recebidoEm || "").localeCompare(String(b.recebidoEm || "")))[0];
    const rIndicado = maisApontado || daOpAntiga?.rastreio || null;
    const chapa = ehChapa(g.perfil);
    const metros = g.comprimentoTotalMm / 1000;
    return {
      perfil: g.perfil,
      materialNorma: g.material,               // A36 · A572-GR.50 (o grau do aço)
      materialCmr: hit?.descricao || null,     // descrição do cadastro/CMR
      qtdPecas: g.qtdPecas,
      pesoUnitKg: g.pesos.size === 1 ? [...g.pesos][0] : null, // só quando é uniforme
      pesoTotalKg: Math.round(g.pesoTotalKg * 10) / 10,
      comprimentoTotalM: Math.round(metros * 10) / 10,
      // Estimativa MÍNIMA pelo comprimento — não considera perda de corte/nesting. Chapa não
      // se separa por barra; ali vale o peso.
      barras: chapa || !metros ? null : Math.ceil(g.comprimentoTotalMm / BARRA_MM),
      barraMm: chapa ? null : BARRA_MM,
      chapa,
      marcas: g.marcas,
      rIndicado,
      rsIndicados: [...g.rs.entries()].map(([r, n]) => ({ rastreio: r, pecas: n })).sort((a, b) => b.pecas - a.pecas),
      opcoes,
    };
  }).sort((a, b) => b.pesoTotalKg - a.pesoTotalKg);

  return NextResponse.json({
    op: { id: op.id, numero: op.numero, obra: op.obra, cliente: op.cliente },
    setor,
    escopo: ids.length ? "selecao" : "op",
    itens,
    totais: {
      linhas: itens.length,
      pecas: itens.reduce((a, x) => a + x.qtdPecas, 0),
      pesoKg: Math.round(itens.reduce((a, x) => a + x.pesoTotalKg, 0)),
      barras: itens.reduce((a, x) => a + (x.barras || 0), 0),
      semR: itens.filter((x) => !x.rIndicado).length,
    },
  });
}
