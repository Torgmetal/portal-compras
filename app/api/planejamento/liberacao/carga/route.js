// GET /api/planejamento/liberacao/carga?setor=CORTE&opId=…&dias=21
//   → quanto já foi programado para cada dia, EM TODA A FÁBRICA, com a fatia desta obra à parte.
//
// ⚠⚠ O DIA É DA FÁBRICA, NÃO DA OBRA. Vitor (03/09/2026): "não precisa ser apenas de uma OP, mostre
// tudo que foi para aquele dia". Ele está certo e isso muda a pergunta que a tela responde: a meta
// de 12.000 kg/dia é do SETOR — a máquina é uma só. Olhando apenas a OP aberta, alguém enche a
// terça com 9 t achando que sobra espaço, quando outra obra já colocou 8 t no mesmo dia.
//
// ⚠ O setor filtra de verdade: `LiberacaoProducao.setores` é a lista do que desceu naquele lote
// (["CORTE","MONTAGEM"]). Somar tudo misturaria a esteira do corte com a bancada da montagem, que
// têm metas diferentes e nem sequer disputam a mesma máquina.
//
// ⚠⚠ CORTE E PREPARAÇÃO SÃO A MESMA COISA. Vitor (03/09/2026): "lembre-se, corte e preparação são
// a mesma coisa — usar preparação como nome e unificar os dois". O banco tem os lotes gravados como
// CORTE (é o que a tela de liberação sempre escreveu); o nome que a fábrica usa é preparação. Então
// PREPARACAO aqui abrange os dois, e nenhum registro antigo precisa ser mexido.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const setor = String(searchParams.get("setor") || "").toUpperCase();
  const opId = searchParams.get("opId") || null;

  const abertas = await prisma.liberacaoProducao.findMany({
    where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: {
      id: true, opId: true, frente: true, setores: true, dataProgramada: true, pecaIds: true,
      op: { select: { numero: true, obra: true, cliente: true } },
    },
    orderBy: [{ dataProgramada: "asc" }],
    take: 4000,
  });

  const EQUIVALE = { PREPARACAO: ["PREPARACAO", "CORTE"], CORTE: ["PREPARACAO", "CORTE"] };
  const aceita = EQUIVALE[setor] || (setor ? [setor] : null);
  const doSetor = aceita
    ? abertas.filter((l) => (Array.isArray(l.setores) ? l.setores : []).map(String).some((x) => aceita.includes(x)))
    : abertas;
  if (!doSetor.length) return NextResponse.json({ setor: setor || null, dias: [] });

  // ⚠ o peso vem da peça, e só das que ainda existem: id órfão (lista reimportada depois da
  // liberação) não conta no dia — ele aparece separado, para alguém reprogramar.
  const ids = [...new Set(doSetor.flatMap((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : []).map(String)))];
  const pecas = ids.length
    ? await prisma.pecaConjunto.findMany({ where: { id: { in: ids } }, select: { id: true, pesoTotalKg: true } })
    : [];
  const pesoDe = new Map(pecas.map((p) => [p.id, p.pesoTotalKg || 0]));

  const porDia = new Map();
  for (const l of doSetor) {
    const k = l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : "";
    const g = porDia.get(k) || porDia.set(k, {
      dia: k || null, kg: 0, pecas: 0, orfas: 0,
      minhaKg: 0, minhasPecas: 0, obras: new Map(), lotes: [],
    }).get(k);

    const lista = Array.isArray(l.pecaIds) ? l.pecaIds.map(String) : [];
    let kgLote = 0, nLote = 0;
    for (const id of lista) {
      if (!pesoDe.has(id)) { g.orfas++; continue; }
      kgLote += pesoDe.get(id); nLote++;
    }
    g.kg += kgLote; g.pecas += nLote;
    if (opId && l.opId === opId) { g.minhaKg += kgLote; g.minhasPecas += nLote; }

    // ⚠ a obra vai junto: sem saber QUEM ocupou o dia, "o dia está cheio" não dá o que fazer.
    const nome = `OP-${l.op?.numero || "?"}`;
    const o = g.obras.get(nome) || { obra: nome, kg: 0, pecas: 0, minha: opId ? l.opId === opId : false };
    o.kg += kgLote; o.pecas += nLote;
    g.obras.set(nome, o);

    // ⚠⚠ O LOTE VAI JUNTO, e é o que permite CONSERTAR o dia. Vitor (03/09/2026), sobre a OP-105
    // com 35 t num dia de meta 12 t: "precisamos corrigir isso". Saber que o dia estourou não
    // adianta se a tela não diz QUAIS lotes o encheram nem deixa remarcá-los — a saída era cancelar
    // a liberação e refazer, perdendo o registro de quem liberou e quando.
    if (nLote > 0) {
      g.lotes.push({
        id: l.id, obra: nome, opId: l.opId, frente: l.frente || null,
        kg: Math.round(kgLote), pecas: nLote, minha: opId ? l.opId === opId : false,
      });
    }
  }

  const dias = [...porDia.values()]
    .map((g) => ({
      ...g,
      kg: Math.round(g.kg), minhaKg: Math.round(g.minhaKg),
      obras: [...g.obras.values()].map((o) => ({ ...o, kg: Math.round(o.kg) })).sort((a, b) => b.kg - a.kg),
      // o mais pesado primeiro: é dele que se tira carga para desafogar o dia
      lotes: g.lotes.sort((a, b) => b.kg - a.kg),
    }))
    .sort((a, b) => (a.dia || "9999").localeCompare(b.dia || "9999"));

  return NextResponse.json({ setor: setor || null, dias });
}


// ⚠⚠ LIMPAR O QUE APONTA PARA O VAZIO. Vitor (03/09/2026), sobre o aviso das peças órfãs: "sobre
// essa questão poderia ajustar".
//
// O estrago é anterior à correção que já entrou no importador (hoje a reimportação remapeia a
// programação pela MARCA — ver /api/producao/pecas/importar-lpc). O que sobrou não dá para
// reconstruir com honestidade: na OP-113 são 126 ponteiros mortos e só 73 peças hoje sem
// programação, e nada diz QUAIS eram. Adivinhar criaria uma programação falsa, que é pior do que a
// falta dela.
//
// O que dá para fazer é tirar o ponteiro morto: a liberação para de contar peça que não existe, o
// aviso some, e as peças afetadas seguem em "a fazer" — onde alguém as libera de novo pelo caminho
// normal. Nenhuma peça é apagada e nenhuma programação é inventada.
//
// ⚠ E não roda sozinho: é botão. Escrita em produção com efeito visível no chão de fábrica se faz
// com alguém clicando e sabendo o que vai acontecer.
export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));

  // ── TIRAR UM LOTE DO DIA ─────────────────────────────────────────────────────────────────────
  //
  // Vitor (03/09/2026), sobre os dois lotes de montagem da OP-105 em 04/09: "pode tirar do dia
  // 04/09 pois foi um teste, nem começamos nada dela na montagem, apenas na preparação".
  //
  // ⚠⚠ CANCELAR A LIBERAÇÃO NÃO BASTA — e é aqui que estava a armadilha. A liberação para a
  // montagem muda o STATUS da peça (CORTE → MONTAGEM) e grava bancada e dia. Cancelando só o lote,
  // as peças ficariam paradas em "MONTAGEM": a rota que libera para a montagem só pega peça em
  // CORTE (`status: statusDe`), então elas seriam PULADAS na hora de redistribuir — some do dia
  // errado e não aparece no dia certo.
  //
  // ⚠ SÓ O QUE NÃO COMEÇOU. Se o Syneco já lançou produção na peça, ela não volta: o registro do
  // chão de fábrica manda, e desfazer programação de peça que já está sendo feita é inventar uma
  // história diferente da que aconteceu.
  if (body?.acao === "cancelarLote") {
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ error: "Informe o lote." }, { status: 400 });

    const lote = await prisma.liberacaoProducao.findUnique({
      where: { id },
      select: { id: true, opNumero: true, frente: true, setores: true, pecaIds: true, status: true, dataProgramada: true },
    });
    if (!lote) return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
    if (!["LIBERADA", "EM_PRODUCAO"].includes(lote.status)) {
      return NextResponse.json({ error: "Este lote já não está aberto." }, { status: 409 });
    }

    const pecaIds = (Array.isArray(lote.pecaIds) ? lote.pecaIds : []).map(String);
    const ehMontagem = (Array.isArray(lote.setores) ? lote.setores : []).map(String).includes("MONTAGEM");

    let revertidas = 0, comProducao = 0;
    if (ehMontagem && pecaIds.length) {
      const pecas = await prisma.pecaConjunto.findMany({
        where: { id: { in: pecaIds }, status: "MONTAGEM" },
        select: { id: true, marca: true },
      });
      // ⚠ o apontamento é por MARCA (é assim que o Syneco casa) — ver lib/conjuntos-setor
      const marcas = [...new Set(pecas.map((p) => p.marca).filter(Boolean))];
      const ordens = marcas.length
        ? await prisma.mesOrdem.findMany({
            where: { item: { in: marcas }, setor: { in: ["Montagem", "Solda"] } },
            select: { item: true, produzidoUn: true },
          })
        : [];
      const iniciadas = new Set(ordens.filter((o) => (o.produzidoUn || 0) > 0).map((o) => o.item));
      const podem = pecas.filter((p) => !iniciadas.has(p.marca)).map((p) => p.id);
      comProducao = pecas.length - podem.length;

      if (podem.length) {
        // mesma limpeza do "Reverter para Corte" (ver /api/producao/pecas/liberar-montagem)
        await prisma.pecaConjunto.updateMany({
          where: { id: { in: podem } },
          data: {
            status: "CORTE", ultimoSetor: "Corte",
            montagemBancada: null, montagemBancadaEm: null, montagemDiaProgramado: null,
          },
        });
        revertidas = podem.length;
      }
    }

    await prisma.liberacaoProducao.update({
      where: { id },
      data: {
        status: "CANCELADA", canceladaEm: new Date(),
        canceladaMotivo: String(body?.motivo || "").trim() || "Tirado do dia pelo painel da carga.",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user?.id || null, action: "CANCELAR_LIBERACAO_PRODUCAO",
        entity: "LiberacaoProducao", entityId: id,
        diff: {
          op: lote.opNumero, frente: lote.frente, setores: lote.setores,
          dia: lote.dataProgramada ? lote.dataProgramada.toISOString().slice(0, 10) : null,
          pecas: pecaIds.length, revertidas, comProducao,
          motivo: String(body?.motivo || "").trim() || null,
        },
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, revertidas, comProducao, pecas: pecaIds.length });
  }

  if (body?.acao !== "limparOrfaos") return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });

  const abertas = await prisma.liberacaoProducao.findMany({
    where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: { id: true, opId: true, frente: true, pecaIds: true, op: { select: { numero: true } } },
    take: 4000,
  });
  const ids = [...new Set(abertas.flatMap((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : []).map(String)))];
  const vivos = new Set(
    (ids.length ? await prisma.pecaConjunto.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [])
      .map((p) => p.id)
  );

  let lotes = 0, removidos = 0;
  const detalhe = [];
  for (const l of abertas) {
    const atuais = (Array.isArray(l.pecaIds) ? l.pecaIds : []).map(String);
    const limpos = atuais.filter((id) => vivos.has(id));
    if (limpos.length === atuais.length) continue;
    await prisma.liberacaoProducao.update({ where: { id: l.id }, data: { pecaIds: limpos } });
    lotes++; removidos += atuais.length - limpos.length;
    detalhe.push({ op: l.op?.numero || null, frente: l.frente, perdidas: atuais.length - limpos.length });
  }

  if (removidos) {
    await prisma.auditLog.create({
      data: {
        userId: user?.id || null, action: "LIBERACAO_LIMPAR_ORFAOS", entity: "LiberacaoProducao",
        entityId: null, diff: { lotes, removidos, detalhe },
      },
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true, lotes, removidos, detalhe });
}
