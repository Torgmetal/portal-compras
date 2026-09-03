// GET  /api/pcp/descer?setor=PREPARACAO|MONTAGEM
//   → TUDO o que o Planejamento programou para o setor, com o dia de cada item.
// POST /api/pcp/descer  { setor, ids[], motivo }
//   → tira da programação o que entrou errado.
//
// Vitor (03/09/2026), sobre a Larissa: "ela está perdida para conseguir descer os desenhos para os
// setores" — e, sobre a primeira versão desta rota: "não ficou nada bom, ficou pior do que antes;
// eu não faço nem ideia de como está a programação".
//
// ⚠⚠ SÓ O QUE FOI PROGRAMADO — mas de TODOS os dias, não de um só. A primeira versão listava o
// estoque inteiro sem dia nenhum (inventário de 1.195 itens); a segunda prendeu tudo a um dia e
// setas de navegação. Vitor (03/09/2026): "vamos tirar essa seleção de data, traga os filtros tipo
// excel para as abas" — o dia virou COLUNA, e quem quer o dia de hoje filtra por ele.
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

  // ── quais peças estão programadas ────────────────────────────────────────────────────────────
  let pecas = [];

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
    pecas = todos.map((p) => ({ ...p, dia: iso(p.montagemDiaProgramado), bancada: p.montagemBancada || null }));
  } else {
    // ⚠ NA PREPARAÇÃO QUEM CARREGA A DATA É O LOTE, não a peça: é assim que o Planejamento programa
    // o corte (ver /api/planejamento/liberacao).
    const lotes = await prisma.liberacaoProducao.findMany({
      where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
      select: { id: true, frente: true, pecaIds: true, dataProgramada: true, setores: true },
      take: 4000,
    });
    // ⚠ CORTE E PREPARAÇÃO SÃO A MESMA COISA (Vitor, 03/09/2026): o banco grava CORTE, a fábrica
    // fala preparação.
    const doSetor = lotes.filter((l) => (Array.isArray(l.setores) ? l.setores : []).some((s) => s === "CORTE" || s === "PREPARACAO"));
    const daPeca = new Map();
    for (const l of doSetor) {
      const d = iso(l.dataProgramada);
      for (const id of (Array.isArray(l.pecaIds) ? l.pecaIds : [])) {
        if (!daPeca.has(id)) daPeca.set(id, { dia: d, loteId: l.id, frente: l.frente || null });
      }
    }
    const ids = [...daPeca.keys()];
    const achadas = ids.length
      ? await prisma.pecaConjunto.findMany({
          where: { id: { in: ids }, ...SO_FABRICACAO, NOT: { tipoPeca: "CONJUNTO" } },
          select: {
            id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, opId: true,
            statusEstoque: true, op: { select: { numero: true } },
          },
          take: 6000,
        })
      : [];
    pecas = achadas.map((p) => ({ ...p, ...(daPeca.get(p.id) || {}) }));
  }

  if (!pecas.length) {
    return NextResponse.json({ setor, prontos: [], travados: [], jaDesceram: 0 });
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
    // ⚠⚠ O QUE JÁ DESCEU CONTINUA NA LISTA. Vitor (03/09/2026): "não consigo reimprimir, quero que
    // use a lógica que temos na tela abaixo". Sumir com a linha depois de imprimir tirava a única
    // forma de emitir o desenho de novo (folha rasgada, marca que voltou para a bancada) — a
    // tabela de baixo sempre mostrou a marca com a GRD ao lado, e é assim que tem de ser aqui.
    const desceu = jaDesceu.has(marca);
    if (desceu) jaDesceram++;

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
      id: p.id, marca: p.marca, descricao: p.descricao || null, jaDesceu: desceu,
      opNumero: p.op?.numero || null, qte: p.qte || 0,
      kg: Math.round(Number(p.pesoTotalKg) || 0),
      opId: p.opId || null, dia: p.dia || null, bancada: p.bancada || null,
      frente: p.frente || null, loteId: p.loteId || null,
    };
    if (motivo) travados.push({ ...item, motivo, porque });
    else prontos.push(item);
  }

  // ⚠ ordena pelo DIA primeiro: sem as setas de navegação, é a ordem do dia que faz a lista ser
  // uma programação e não um monte.
  const ordem = (a, b) => String(a.dia || "9999").localeCompare(String(b.dia || "9999"))
    || String(a.opNumero).localeCompare(String(b.opNumero))
    || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true });
  return NextResponse.json({
    setor,
    prontos: prontos.sort(ordem),
    travados: travados.sort(ordem),
    jaDesceram,
  });
}

// ─── TIRAR DA PROGRAMAÇÃO ──────────────────────────────────────────────────────
// Vitor (03/09/2026): "deixe uma forma para eu poder tirar da programação coisa que estiverem
// erradas lá". É desfazer o que o Planejamento (ou esta própria tela) programou — não é excluir
// peça: a marca continua na LPC, só volta a não ter dia.
//
// ⚠⚠ NÃO TIRA O QUE JÁ ANDOU. Se o Syneco já registrou produção na marca, a peça está na bancada:
// apagar o dia esconderia trabalho em curso. A rota devolve quantas ficaram e por quê — é a mesma
// trava do "tirar do dia" do painel da carga.
export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const setor = String(body?.setor || "").toUpperCase();
  if (!["PREPARACAO", "MONTAGEM"].includes(setor)) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });
  const ids = [...new Set((Array.isArray(body?.ids) ? body.ids : []).map(String).filter(Boolean))].slice(0, 3000);
  if (!ids.length) return NextResponse.json({ error: "Nada selecionado." }, { status: 400 });
  const motivo = String(body?.motivo || "").trim() || "Tirado da programação pelo PCP.";

  if (setor === "MONTAGEM") {
    const pecas = await prisma.pecaConjunto.findMany({
      where: { id: { in: ids }, montagemDiaProgramado: { not: null } },
      select: { id: true, marca: true, status: true, montagemDiaProgramado: true, montagemBancada: true },
    });
    if (!pecas.length) return NextResponse.json({ tirados: 0, comProducao: 0 });

    // ⚠ o apontamento casa por MARCA (é assim que o Syneco fecha — ver lib/conjuntos-setor).
    const marcas = [...new Set(pecas.map((p) => p.marca).filter(Boolean))];
    const ordens = marcas.length
      ? await prisma.mesOrdem.findMany({
          where: { item: { in: marcas }, setor: { in: ["Montagem", "Solda"] } },
          select: { item: true, produzidoUn: true },
        })
      : [];
    const iniciadas = new Set(ordens.filter((o) => (o.produzidoUn || 0) > 0).map((o) => o.item));
    const podem = pecas.filter((p) => !iniciadas.has(p.marca));
    const comProducao = pecas.length - podem.length;
    if (!podem.length) return NextResponse.json({ tirados: 0, comProducao });

    const limpar = { montagemBancada: null, montagemBancadaEm: null, montagemDiaProgramado: null };
    // ⚠ DOIS updates porque só quem entrou em MONTAGEM volta para CORTE; quem ainda estava em
    // PENDENTE/CORTE só perde o dia. Um update só mudaria o status de quem nunca o teve.
    const naMontagem = podem.filter((p) => p.status === "MONTAGEM").map((p) => p.id);
    const resto = podem.filter((p) => p.status !== "MONTAGEM").map((p) => p.id);
    if (naMontagem.length) {
      await prisma.pecaConjunto.updateMany({
        where: { id: { in: naMontagem } },
        data: { ...limpar, status: "CORTE", ultimoSetor: "Corte" },
      });
    }
    if (resto.length) await prisma.pecaConjunto.updateMany({ where: { id: { in: resto } }, data: limpar });

    await prisma.auditLog.create({
      data: {
        userId: user?.id || null, action: "TIRAR_DA_PROGRAMACAO",
        entity: "PecaConjunto", entityId: podem[0].id,
        diff: { setor, motivo, tirados: podem.length, comProducao, marcas: podem.slice(0, 50).map((p) => p.marca) },
      },
    });
    return NextResponse.json({ tirados: podem.length, comProducao });
  }

  // ── PREPARAÇÃO: quem carrega o dia é o LOTE, então a peça sai do lote ────────────────────────
  const lotes = await prisma.liberacaoProducao.findMany({
    where: { status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: { id: true, opNumero: true, frente: true, setores: true, pecaIds: true, totalPecas: true, totalKg: true },
    take: 4000,
  });
  const alvo = new Set(ids);
  let tirados = 0, lotesMexidos = 0, lotesVazios = 0;
  for (const l of lotes) {
    const atuais = (Array.isArray(l.pecaIds) ? l.pecaIds : []).map(String);
    const ficam = atuais.filter((id) => !alvo.has(id));
    if (ficam.length === atuais.length) continue;
    tirados += atuais.length - ficam.length;
    lotesMexidos++;

    if (!ficam.length) {
      // ⚠ lote sem peça nenhuma não é lote vazio, é lote cancelado: deixá-lo LIBERADA faria a
      // obra continuar na fila do PCP sem ter o que fazer nela.
      await prisma.liberacaoProducao.update({
        where: { id: l.id },
        data: { status: "CANCELADA", canceladaEm: new Date(), canceladaMotivo: motivo, pecaIds: [], totalPecas: 0, totalKg: 0 },
      });
      lotesVazios++;
      continue;
    }
    // ⚠ recalcula peso e quantidade: um lote que perde peça e mantém o total mentiria na carga
    // do dia (o painel do Planejamento soma esses campos).
    const restantes = await prisma.pecaConjunto.findMany({
      where: { id: { in: ficam } },
      select: { qte: true, pesoTotalKg: true },
    });
    await prisma.liberacaoProducao.update({
      where: { id: l.id },
      data: {
        pecaIds: ficam,
        totalPecas: restantes.reduce((s, p) => s + (p.qte || 0), 0),
        totalKg: Math.round(restantes.reduce((s, p) => s + (Number(p.pesoTotalKg) || 0), 0)),
      },
    });
  }

  if (tirados) {
    await prisma.auditLog.create({
      data: {
        userId: user?.id || null, action: "TIRAR_DA_PROGRAMACAO",
        entity: "LiberacaoProducao", entityId: null,
        diff: { setor, motivo, tirados, lotesMexidos, lotesCancelados: lotesVazios },
      },
    });
  }
  return NextResponse.json({ tirados, lotesMexidos, lotesCancelados: lotesVazios, comProducao: 0 });
}
