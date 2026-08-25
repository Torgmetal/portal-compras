// GET /api/diretoria/fluxo/fora-do-mapa?opId=… — QUAIS peças a fábrica tem e o portal não conhece.
//
// Vitor (25/08/2026): "consegue trazer os detalhes dessas obras para eu ver de fato quais peças são
// de cada obra".
//
// ⚠⚠ DOIS PROBLEMAS DIFERENTES MORAVAM NO MESMO NÚMERO — e a ação de cada um é oposta.
// Medido ao montar isto:
//   OP-064 → 3.671 itens, 3.082 JÁ PRODUZIDOS, último apontamento em nov/dez de 2025. É histórico:
//            a obra rodou antes de a lista existir no portal. Importar agora não muda nada na
//            bancada — conserta os NÚMEROS (kg pendente, avanço, indicador).
//   OP-097 →   266 itens, ZERO produzidos, todos conjuntos, sem data nenhuma. É lista incompleta de
//            obra ATUAL: a fábrica vai produzir e o portal não sabe o que é. Esse é urgente.
// Somar os dois num total só faz o urgente sumir dentro do histórico — por isso a resposta separa.
//
// ⚠ SOB DEMANDA, não no payload do painel: a OP-064 sozinha tem 3.671 itens. O resumo tem de abrir
// rápido; o detalhe vem quando alguém pergunta por aquela obra.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { ordenarSetores, setorMaisAvancado } from "@/lib/setores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO = 3000; // acima disso a resposta fica grande demais para o navegador montar tabela

// o que vem depois do setor onde a peça está
function restantes(rota, feitos) {
  const ord = ordenarSetores(rota);
  const onde = setorMaisAvancado(feitos);
  if (!onde) return ord;                       // não começou: falta a rota inteira
  return ord.slice(ord.indexOf(onde) + 1);
}

// ⚠ etapa ANTES da posição atual e sem apontamento. Não é trabalho pendente — a peça já passou por
// ali. É o apontamento que não foi feito, e vale mostrar separado: some do "quanto falta" e vira
// medida da qualidade do registro.
function buracos(rota, feitos) {
  const ord = ordenarSetores(rota);
  const onde = setorMaisAvancado(feitos);
  if (!onde) return [];
  return ord.slice(0, ord.indexOf(onde)).filter((s) => !feitos.includes(s));
}

export async function GET(req) {
  try { await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const marcas = new Set(
    (await prisma.pecaConjunto.findMany({ where: { opId: op.id, fonte: "LPC_IMPORT" }, select: { marca: true } }))
      .map((x) => String(x.marca || "").toUpperCase())
  );

  // ⚠⚠ AGRUPA POR ITEM E POR SETOR, e o setor entra em DUAS listas. Ordem existe para a rota
  // inteira desde o lançamento; produção só existe onde a peça passou de verdade. Misturar as duas
  // mostrava etapa futura como se já tivesse acontecido.
  const linhas = await prisma.mesOrdem.groupBy({
    by: ["item", "setor"],
    where: { opId: op.id },
    _sum: { planejadoUn: true, produzidoUn: true },
    // ⚠ MAX, não SUM, no peso: cada ordem de setor repete o peso da peça. Somando, a OP-064 dava
    // 3,4 MILHÕES de kg — cinco vezes a obra.
    _max: { pesoPlanejado: true, dataInicio: true },
    _min: { dataInicio: true },
  });

  const porItem = new Map();
  for (const l of linhas) {
    const k = String(l.item || "");
    if (!k || marcas.has(k.toUpperCase())) continue;
    const g = porItem.get(k) || { item: k, rota: [], feitos: [], planejado: 0, produzido: 0, kg: 0, primeiro: null, ultimo: null };
    if (l.setor) {
      if (!g.rota.includes(l.setor)) g.rota.push(l.setor);
      if ((Number(l._sum.produzidoUn) || 0) > 0 && !g.feitos.includes(l.setor)) g.feitos.push(l.setor);
    }
    // planejado: a rota repete a quantidade por setor — vale o maior, não a soma
    g.planejado = Math.max(g.planejado, Number(l._sum.planejadoUn) || 0);
    g.produzido = Math.max(g.produzido, Number(l._sum.produzidoUn) || 0);
    g.kg = Math.max(g.kg, Number(l._max.pesoPlanejado) || 0);
    const pri = l._min.dataInicio, ult = l._max.dataInicio;
    if (pri && (!g.primeiro || pri < g.primeiro)) g.primeiro = pri;
    if (ult && (!g.ultimo || ult > g.ultimo)) g.ultimo = ult;
    porItem.set(k, g);
  }

  const itens = [...porItem.values()].map((g) => ({
    ...g,
    // ordenado pelo fluxo: cru, o banco devolve "Acabamento, Jato, Corte"
    rota: ordenarSetores(g.rota),
    // ⚠⚠ A PEÇA ESTÁ EM UM LUGAR SÓ, e é o mais adiantado. Vitor (25/08/2026): "se tem peça que está
    // no setor da frente não poderia estar no setor anterior". Etapa anterior sem apontamento é
    // falha de REGISTRO, não peça que pulou — fisicamente ela passou por lá. É o mesmo critério do
    // Status da Obra e da Expedição Semanal (`mapaSetorReal`): vale o máximo, não a contagem.
    onde: setorMaisAvancado(g.feitos),
    // o que ainda falta DEPOIS de onde ela está — é isso que responde "quanto falta"
    restam: restantes(g.rota, g.feitos),
    // etapas da rota sem apontamento ANTES de onde ela está: buraco de registro, não de produção
    semRegistro: buracos(g.rota, g.feitos),
    kg: Math.round(g.kg * 10) / 10,
    primeiro: g.primeiro ? g.primeiro.toISOString() : null,
    ultimo: g.ultimo ? g.ultimo.toISOString() : null,
    // ⚠ heurística de NOME, e assumida como tal: "-P###" é como a Engenharia nomeia croqui. Serve
    // para dizer QUAL import falhou (a de peças ou a de conjuntos) — na OP-097 os 266 eram TODOS
    // conjunto, o que apontou direto para a aba que não entrou.
    croqui: /-P\d+$/i.test(g.item),
    // ⚠ o eixo que decide a ação: o que ainda não foi produzido é a fábrica andando às cegas; o que
    // já saiu é história, e importar a lista só conserta o número.
    aProduzir: (g.produzido || 0) <= 0,
  })).sort((a, b) => (a.aProduzir === b.aProduzir ? b.kg - a.kg : a.aProduzir ? -1 : 1));

  // ⚠ ONDE ESTÁ O LOTE, não só onde está cada peça. Vitor (25/08/2026): "não fica claro onde cada
  // peça está". Ler 3.000 linhas para descobrir a distribuição é o mesmo que não ter a informação;
  // esta contagem responde de relance, e cada peça entra em UM setor só — o dela.
  const porSetorMap = new Map();
  for (const it of itens) {
    const k = it.onde || "não começou";
    const g = porSetorMap.get(k) || { setor: k, pecas: 0, kg: 0 };
    g.pecas++; g.kg += it.kg;
    porSetorMap.set(k, g);
  }
  const porSetor = ordenarSetores([...porSetorMap.keys()].filter((k) => k !== "não começou"))
    .map((k) => porSetorMap.get(k))
    .concat(porSetorMap.has("não começou") ? [porSetorMap.get("não começou")] : [])
    .map((g) => ({ ...g, kg: Math.round(g.kg) }));

  const aProduzir = itens.filter((x) => x.aProduzir);
  const jaProduzido = itens.filter((x) => !x.aProduzir);
  const datas = itens.map((x) => x.ultimo).filter(Boolean).sort();

  return NextResponse.json({
    op: { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra },
    resumo: {
      total: itens.length,
      aProduzir: aProduzir.length,
      aProduzirKg: Math.round(aProduzir.reduce((a, x) => a + x.kg, 0)),
      jaProduzido: jaProduzido.length,
      jaProduzidoKg: Math.round(jaProduzido.reduce((a, x) => a + x.kg, 0)),
      croquis: itens.filter((x) => x.croqui).length,
      conjuntos: itens.filter((x) => !x.croqui).length,
      primeiroApontamento: datas[0] || null,
      ultimoApontamento: datas[datas.length - 1] || null,
      // etapa que a peça já passou e ninguém apontou — mede o registro, não a produção
      comBuracoDeRegistro: itens.filter((x) => (x.semRegistro || []).length > 0).length,
    },
    porSetor,
    itens: itens.slice(0, TETO),
    truncado: Math.max(0, itens.length - TETO),
  });
}
