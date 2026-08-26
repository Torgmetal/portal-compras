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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rastreioDaOp } from "@/lib/rastreio-peca";
import { amarracoesDaOp, amarracaoDoPerfil } from "@/lib/r-amarrado";
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

  // Trocas já registradas nesta OP — a tela abre com elas aplicadas.
  const trocas = await prisma.trocaRastreabilidade.findMany({
    where: { opNumero: op.numero },
    select: { perfil: true, rIndicado: true, rUsado: true, motivo: true, trocadoPorNome: true, createdAt: true },
  });
  const trocaPorPerfil = new Map(trocas.map((t) => [String(t.perfil).trim().toUpperCase(), t]));

  const brutas = await prisma.pecaConjunto.findMany({
    where: { opId, perfil: { not: null }, ...(ids.length ? { id: { in: ids } } : {}) },
    select: { id: true, marca: true, perfil: true, material: true, descricao: true, qte: true, comprimentoMm: true, pesoUnitKg: true, pesoTotalKg: true, fonte: true, tipoPeca: true },
  });
  // mesmas exclusões do fluxo de produção: item comprado/grade e a duplicata LPC×LE
  const pecas = dedupLpcLe(brutas.filter((p) => !ehItemComprado(p)));

  // R indicado por peça (motor de rastreio: FIFO pela entrega mais antiga, só peça cortada)
  let porMarca = new Map();
  try { ({ porMarca } = await rastreioDaOp(op.numero, op.id)); } catch {}

  // ⚠⚠ O R AMARRADO À MÃO. Vitor (26/08/2026): "na planilha de separação vc não esta puxando as
  // informações do lote corrida e o R".
  //
  // Dois motivos para faltar, e os dois batem aqui: (1) `rastreioDaOp` só dá R a peça JÁ CORTADA —
  // e a lista de separação é feita ANTES de cortar, então ela nunca teria R por esse caminho; (2) o
  // casamento por descrição não acha o material quando a LPC e o CMR escrevem o mesmo aço diferente.
  // A amarração resolve os dois: é uma decisão humana registrada, apontando o fardo.
  const amarradas = await amarracoesDaOp(op.numero);

  // Entradas do CMR — as desta OP e as das outras (o fardo pode ser de qualquer lote em estoque)
  const cmr = await prisma.documentoQualidade.findMany({
    where: { categoria: "MATERIAL" },
    select: { importRef: true, nome: true, numeroCorrida: true, numeroDocumento: true, norma: true, fornecedor: true, pedidoCompra: true, nfNumero: true, dataRecebimento: true, pesoKg: true, quantidade: true, opNumero: true },
    orderBy: [{ dataRecebimento: "desc" }],
  });
  // O matcher roda por PERFIL contra a lista de materiais; casar contra as 3.7 mil linhas seria
  // desperdício — são ~1,1 mil descrições DISTINTAS. Casa nas distintas e expande depois.
  const comoItens = [...new Set(cmr.map((c) => c.nome))].map((nome) => ({ codigo: null, descricao: nome }));
  // ⚠ as descrições QUE ENTRARAM NESTA OP, à parte: é contra elas que o matcher roda primeiro, para
  // o perfil casar com o material da própria obra antes de olhar a prateleira da empresa inteira.
  const comoItensOp = [...new Set(cmr.filter((c) => c.opNumero === op.numero).map((c) => c.nome))]
    .map((nome) => ({ codigo: null, descricao: nome }));

  // SALDO DE CADA R desta OP = o que entrou no CMR menos o que as peças já comprometeram.
  //
  // Vitor (19/08): "na OP-84 você mostra os materiais como ok e data do dia 18/06; nesses casos o
  // material foi usado para os projetos anteriores — precisa ficar como sem material, ou na
  // separação informar qual R vai ser usado".
  //
  // O CMR é registro de ENTRADA, não de estoque: dizer "recebido em 18/06" não quer dizer que a
  // barra está no pátio hoje. Na OP-084 o R 260788 entrou com 13.272 kg e tem **78 kg** de saldo;
  // o 260789, 44 kg; o 260817, 48 kg. Quem vai separar precisa ver isso ANTES de procurar o fardo.
  const consumido = new Map(); // R → kg já comprometido pelas peças desta OP
  for (const [, r] of porMarca) {
    for (const u of r?.usadas || []) {
      if (!u?.rastreio) continue;
      consumido.set(u.rastreio, (consumido.get(u.rastreio) || 0) + (Number(u.consumidoKg) || 0));
    }
  }
  const saldoDoR = (c) => {
    if (c.opNumero !== op.numero) return null; // R de outra OP: o consumo é calculado na OP dele
    const kg = Number(c.pesoKg) || 0;
    const usado = consumido.get(c.importRef) || 0;
    return { entrouKg: Math.round(kg), consumidoKg: Math.round(usado), saldoKg: Math.round(kg - usado), esgotado: kg > 0 && kg - usado < kg * 0.05 };
  };
  const opcaoR = (c) => ({
    rastreio: c.importRef, material: c.nome, corrida: c.numeroCorrida, certificado: c.numeroDocumento,
    norma: c.norma, fornecedor: c.fornecedor, pedido: c.pedidoCompra, nf: c.nfNumero,
    recebidoEm: c.dataRecebimento ? c.dataRecebimento.toISOString() : null,
    pesoKg: c.pesoKg, quantidade: c.quantidade, opNumero: c.opNumero, daOp: c.opNumero === op.numero,
    saldo: saldoDoR(c),
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
    // ── OPÇÕES DE R DAQUELE MATERIAL ───────────────────────────────────────────────────────
    // ⚠⚠ O MATERIAL DESTA OP TEM DE GANHAR NO CASAMENTO.
    // O matcher escolhe UMA descrição do cadastro e as opções são as linhas do CMR com aquela
    // descrição EXATA. Rodando contra o CMR inteiro, ele casava com a redação de outra obra: o
    // TBØ42.40X2.65 da OP-089 ia para "TUBO AC CC 42,4 X 2,65mm" (OP-028, 2025) enquanto a própria
    // OP-089 tinha "TUBO REDONDO (42,40) X 2,65MM" (R 260810) na prateleira dela. A OP saía do
    // conjunto de opções e a lista de separação mandava buscar fardo de obra de um ano e meio atrás.
    //
    // ⚠ Por isso o casamento é feito DUAS VEZES: primeiro só com o que entrou nesta OP; e só quando
    // aqui não há nada é que vale o CMR da empresa (sobra de outra obra é uso legítimo — mas é a
    // segunda escolha, nunca a primeira).
    const hitOp = comoItensOp.length ? casarPerfilComOmie(g.perfil, comoItensOp) : null;
    const hit = hitOp || (comoItens.length ? casarPerfilComOmie(g.perfil, comoItens) : null);
    let opcoes = hit ? cmr.filter((c) => c.nome === hit.descricao).map(opcaoR) : [];
    // ⚠ e a linha do R amarrado entra nas opções mesmo sem casar por descrição — senão a tela
    // indicaria um R que não está na lista, e trocar viraria impossível.
    if (am) {
      const linha = cmr.find((c) => String(c.importRef || "").trim() === am.r);
      if (linha && !opcoes.some((o) => o.rastreio === am.r)) opcoes = [opcaoR(linha), ...opcoes];
    }
    // R indicado = o mais apontado pelas peças do grupo; sem isso, a entrada mais antiga da OP
    // ⚠ a amarração GANHA do mais apontado e do casamento por texto: alguém disse qual é o fardo,
    // com nome e motivo. Palpite não desempata decisão registrada.
    const am = amarracaoDoPerfil(amarradas, g.perfil);
    const maisApontado = am?.r || [...g.rs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const daOpAntiga = [...opcoes].filter((o) => o.daOp).sort((a, b) => String(a.recebidoEm || "").localeCompare(String(b.recebidoEm || "")))[0];
    // ⚠⚠ PEÇA SEM R AINDA PRECISA DIZER QUAL VAI USAR.
    // Vitor (24/08/2026): "no caso das peças que estiverem sem o R deve ser informado qual será
    // usado". Só peça CORTADA ganha R carimbado — então material que ainda não foi cortado e cujas
    // entradas do CMR não são desta OP caía nos dois primeiros critérios e saía em branco. Papel de
    // separação com o R vazio manda o Almoxarifado escolher o fardo por conta, que é exatamente o
    // que o R existe para impedir.
    //
    // ⚠ A previsão é a entrada mais antiga DESTA OP (`daOpAntiga`) — FIFO dentro do que foi comprado
    // para a obra. Ela já existia; o que faltava era DIZER que é previsão: ninguém apontou aquele R
    // ainda, é só o que deve sair. No papel, "vai usar" e "usou" não podem parecer a mesma coisa.
    //
    // 🚫 NÃO SE PREVÊ FARDO DE OUTRA OBRA. Tentei estender o FIFO ao CMR inteiro e o resultado foi
    // apontar R de 2025, de OPs encerradas, como se fosse o material a separar — o saldo de R de
    // outra OP é `null` (o consumo é contado na OP dele), então nem dava para saber se ainda existe.
    // Sem material desta OP, o certo é "A DEFINIR": manda o Almoxarifado escolher e registrar a
    // troca, que é o caminho que já existe, em vez de mandá-lo procurar um fardo que talvez não
    // exista mais.
    const rIndicado = maisApontado || daOpAntiga?.rastreio || null;
    const rPrevisto = !maisApontado && !!daOpAntiga;
    // O R indicado ainda tem material? Se não, a separação vai ter de sair de outro fardo — e a
    // tela já sugere qual (o R com saldo, da OP ou de fora), pra não mandar ninguém procurar barra
    // que não existe.
    const indicado = opcoes.find((o) => o.rastreio === rIndicado) || null;
    const rEsgotado = !!indicado?.saldo?.esgotado;
    const alternativas = opcoes
      .filter((o) => o.rastreio !== rIndicado && (o.saldo ? !o.saldo.esgotado : true))
      .sort((a, b) => (b.daOp ? 1 : 0) - (a.daOp ? 1 : 0) || (b.saldo?.saldoKg || b.pesoKg || 0) - (a.saldo?.saldoKg || a.pesoKg || 0))
      .slice(0, 3)
      .map((o) => ({ rastreio: o.rastreio, saldoKg: o.saldo?.saldoKg ?? null, pesoKg: o.pesoKg, opNumero: o.opNumero, daOp: o.daOp }));
    const chapa = ehChapa(g.perfil);
    const metros = g.comprimentoTotalMm / 1000;
    const jaTrocado = trocaPorPerfil.get(g.perfil.toUpperCase()) || null;
    return {
      perfil: g.perfil,
      // troca já registrada (o Almoxarifado separou outro fardo) — a tela abre com ela aplicada
      troca: jaTrocado ? { rUsado: jaTrocado.rUsado, rIndicado: jaTrocado.rIndicado, motivo: jaTrocado.motivo, por: jaTrocado.trocadoPorNome, em: jaTrocado.createdAt.toISOString() } : null,
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
      // true = ninguém apontou este R ainda; é o que o FIFO diz que vai sair
      rPrevisto,
      rIndicadoSaldo: indicado?.saldo || null,
      rEsgotado,
      alternativas: rEsgotado ? alternativas : [],
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
      // "sem R" = material que esta OP não tem no CMR; sai "A DEFINIR" e o Almoxarifado escolhe.
      semR: itens.filter((x) => !x.rIndicado).length,
      previstos: itens.filter((x) => x.rPrevisto).length,
      trocados: itens.filter((x) => x.troca).length,
    },
  });
}

// POST — registra a TROCA do R feita na separação. Só chega aqui o que MUDOU: sem alteração não
// há registro nem ação (Vitor 19/08). Onde existe registro, o motor de rastreio para de usar o
// FIFO naquele material e passa a usar este R — vira fato observado, não regra de consumo.
const schemaPost = z.object({
  opId: z.string().min(1),
  trocas: z.array(z.object({
    perfil: z.string().min(1),
    rIndicado: z.string().nullable().optional(),
    rUsado: z.string().min(1),
    motivo: z.string().max(300).nullable().optional(),
  })).min(1),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "COMPRAS", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schemaPost.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const op = await prisma.oP.findUnique({ where: { id: body.opId }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const salvas = [];
  for (const t of body.trocas) {
    const perfil = t.perfil.trim();
    const reg = await prisma.trocaRastreabilidade.upsert({
      where: { opNumero_perfil: { opNumero: op.numero, perfil } },
      create: {
        opId: op.id, opNumero: op.numero, perfil,
        rIndicado: t.rIndicado || null, rUsado: t.rUsado.trim(), motivo: t.motivo || null,
        trocadoPorId: user.id, trocadoPorNome: user.name || null,
      },
      update: {
        rIndicado: t.rIndicado || null, rUsado: t.rUsado.trim(), motivo: t.motivo || null,
        trocadoPorId: user.id, trocadoPorNome: user.name || null,
      },
    });
    salvas.push({ perfil: reg.perfil, rUsado: reg.rUsado, rIndicado: reg.rIndicado });
  }
  await prisma.auditLog.create({
    data: { userId: user.id, action: "TROCAR_RASTREABILIDADE", entity: "TrocaRastreabilidade", entityId: op.numero, diff: { op: op.numero, trocas: salvas } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, salvas: salvas.length });
}
