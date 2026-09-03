// GET /api/pcp/descer?setor=PREPARACAO|MONTAGEM&dia=YYYY-MM-DD
//   → o que está PROGRAMADO para aquele dia, e o que dá para descer de fato.
//
// Vitor (03/09/2026), sobre a Larissa: "ela está perdida para conseguir descer os desenhos para os
// setores" — e, sobre a primeira versão desta rota: "não ficou nada bom, ficou pior do que antes;
// eu não faço nem ideia de como está a programação".
//
// ⚠⚠ O DIA É O ASSUNTO, NÃO O ESTOQUE. A primeira versão listava tudo que faltava descer, por obra,
// sem dia nenhum: virou um inventário de 1.195 itens que não responde "o que é para hoje". Quem
// abre o PCP de manhã tem UMA pergunta — o que está programado para hoje e o que dá para soltar —
// e é essa que a rota responde.
//
// ⚠ DE ONDE VEM A PROGRAMAÇÃO, por setor (não é a mesma coisa):
//   PREPARAÇÃO → a data do LOTE liberado (`LiberacaoProducao.dataProgramada`), que é como o
//                Planejamento programa o corte.
//   MONTAGEM   → o dia de CADA conjunto (`PecaConjunto.montagemDiaProgramado`), gravado pela
//                repartição por bancada.
//
// ⚠ NENHUMA REGRA NOVA: prontidão vem de `calcularProntidao`, o desenho de `portaoDoDesenho`, o que
// já desceu da `GrdLiberacao` — as mesmas fontes que a liberação cobra. Uma segunda régua faria a
// tela dizer "pode" e o POST responder "não pode".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularProntidao, CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { portaoDoDesenho, temDesenhoNaPasta } from "@/lib/pasta-engenharia";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { OP_VIVA } from "@/lib/op-viva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const setor = String(url.searchParams.get("setor") || "PREPARACAO").toUpperCase();
  if (!["PREPARACAO", "MONTAGEM"].includes(setor)) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });
  const ehMontagem = setor === "MONTAGEM";
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("dia") || "")
    ? url.searchParams.get("dia")
    : new Date().toISOString().slice(0, 10);

  // ── quais peças estão programadas para este dia ──────────────────────────────────────────────
  let pecas = [];
  // ⚠ os dias QUE TÊM ALGO — a tela usa para as setas andarem só onde há trabalho, em vez de a
  // pessoa clicar dia a dia num calendário vazio.
  let diasComAlgo = [];

  if (ehMontagem) {
    // ⚠ CONJUNTO DA LPC (ver CONJUNTO_MONTAVEL — a LE não é produção).
    const base = { ...CONJUNTO_MONTAVEL, ...OP_VIVA, montagemDiaProgramado: { not: null } };
    const todos = await prisma.pecaConjunto.findMany({
      where: base,
      select: {
        id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, opId: true,
        montagemDiaProgramado: true, montagemBancada: true,
        op: { select: { numero: true } },
        conjuntoCroquis: { select: { croqui: { select: { qte: true, qteProduzida: true } } } },
      },
      take: 4000,
    });
    diasComAlgo = [...new Set(todos.map((p) => iso(p.montagemDiaProgramado)).filter(Boolean))].sort();
    pecas = todos.filter((p) => iso(p.montagemDiaProgramado) === dia)
      .map((p) => ({ ...p, bancada: p.montagemBancada || null }));
  } else {
    // ⚠ NA PREPARAÇÃO QUEM CARREGA A DATA É O LOTE, não a peça: é assim que o Planejamento programa
    // o corte (ver /api/planejamento/liberacao).
    const lotes = await prisma.liberacaoProducao.findMany({
      where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
      select: { pecaIds: true, dataProgramada: true, setores: true },
      take: 4000,
    });
    // ⚠ CORTE E PREPARAÇÃO SÃO A MESMA COISA (Vitor, 03/09/2026): o banco grava CORTE, a fábrica
    // fala preparação.
    const doSetor = lotes.filter((l) => (Array.isArray(l.setores) ? l.setores : []).some((s) => s === "CORTE" || s === "PREPARACAO"));
    const diaDaPeca = new Map();
    for (const l of doSetor) {
      const d = iso(l.dataProgramada);
      for (const id of (Array.isArray(l.pecaIds) ? l.pecaIds : [])) if (!diaDaPeca.has(id)) diaDaPeca.set(id, d);
    }
    diasComAlgo = [...new Set([...diaDaPeca.values()].filter(Boolean))].sort();
    const ids = [...diaDaPeca.entries()].filter(([, d]) => d === dia).map(([id]) => id);
    pecas = ids.length
      ? await prisma.pecaConjunto.findMany({
          where: { id: { in: ids }, ...SO_FABRICACAO, NOT: { tipoPeca: "CONJUNTO" } },
          select: {
            id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, opId: true,
            statusEstoque: true, op: { select: { numero: true } },
          },
        })
      : [];
  }

  if (!pecas.length) {
    return NextResponse.json({ setor, dia, diasComAlgo, prontos: [], travados: [], jaDesceram: 0 });
  }

  // ── o que já desceu: a GRD é o registro ──────────────────────────────────────────────────────
  // ⚠ LIBERAR É IMPRIMIR A GRD (decisão do Vitor): não há estado "liberado" no banco.
  const marcas = [...new Set(pecas.map((p) => String(p.marca || "").trim().toUpperCase()).filter(Boolean))];
  const grds = await prisma.grdLiberacao.findMany({ where: { marca: { in: marcas } }, select: { marca: true } });
  const jaDesceu = new Set(grds.map((g) => String(g.marca || "").trim().toUpperCase()));

  const portoes = new Map();
  for (const opId of [...new Set(pecas.map((p) => p.opId).filter(Boolean))]) {
    portoes.set(opId, await portaoDoDesenho(prisma, opId).catch(() => null));
  }

  const prontos = [], travados = [];
  let jaDesceram = 0;
  for (const p of pecas) {
    const marca = String(p.marca || "").trim().toUpperCase();
    if (jaDesceu.has(marca)) { jaDesceram++; continue; }

    // ⚠ ORDEM DOS MOTIVOS = ordem de quem resolve. Croqui é da preparação (interno, do dia);
    // desenho é Engenharia; material é Compras. Mostrar o mais próximo primeiro evita mandar
    // cobrar fornecedor por peça que só falta cortar.
    let motivo = null, porque = null;
    if (ehMontagem) {
      const pr = calcularProntidao(p);
      if (!pr.pronto) { motivo = "CROQUI"; porque = `faltam ${pr.total - pr.atendidos} de ${pr.total} croquis`; }
    }
    if (!motivo) {
      // ⚠ `null` = obra nunca conferida. Não é "sem desenho": afirmar o que não se mediu mandaria
      // cobrar a Engenharia por engano.
      if (temDesenhoNaPasta(portoes.get(p.opId), p.marca) === false) { motivo = "DESENHO"; porque = "sem PDF em 2.5.2 Fabricação"; }
    }
    if (!motivo && !ehMontagem && p.statusEstoque === "SEM_MATERIAL") { motivo = "MATERIAL"; porque = "aço não entregue nesta obra"; }

    const item = {
      id: p.id, marca: p.marca, descricao: p.descricao || null,
      opNumero: p.op?.numero || null, qte: p.qte || 0,
      kg: Math.round(Number(p.pesoTotalKg) || 0),
      bancada: p.bancada || null,
    };
    if (motivo) travados.push({ ...item, motivo, porque });
    else prontos.push(item);
  }

  const ordem = (a, b) => String(a.opNumero).localeCompare(String(b.opNumero)) || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true });
  return NextResponse.json({
    setor, dia, diasComAlgo,
    prontos: prontos.sort(ordem),
    travados: travados.sort(ordem),
    jaDesceram,
  });
}
