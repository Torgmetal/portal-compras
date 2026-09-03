// GET /api/pcp/falta-preparar?setor=PREPARACAO|MONTAGEM
//   → o que ainda depende da preparação, no formato da LPC (conjunto + os croquis que faltam).
//
// Vitor (03/09/2026): "quando aperto a tela da montagem, aí sim você tem que mostrar uma aba onde
// está escrito falta descer vira FALTA PREPARAR, e você me traz uma listagem igual temos na LPC".
//
// ⚠⚠ SÃO DUAS PERGUNTAS COM A MESMA CARA, uma por setor:
//   PREPARAÇÃO → a PEÇA que ainda não foi cortada. É o trabalho do próprio setor.
//   MONTAGEM   → o CONJUNTO que não pode montar porque falta croqui, com os croquis abertos. É o
//                trabalho do setor ANTERIOR, e por isso a lista serve para cobrar, não para agir.
//
// ⚠ Só obra com trabalho DE VERDADE. Vitor (03/09/2026): "a OP-103 está no planejamento e já
// havíamos terminado ela praticamente" — o Syneco mostra a montagem dela em 94%. Obra sem nada
// pendente no setor não entra na lista, e é isso que a tira daqui sozinha quando termina: nenhuma
// lista fixa de obras, que envelheceria na semana seguinte.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularProntidao, CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { OP_VIVA } from "@/lib/op-viva";
import { pecaCortada } from "@/lib/liberacao-producao";
import { opIdsNaFilaDoPcp } from "@/lib/op-na-fila-pcp";
import { capacidadePorMaquina, normalizaMaquina, META_KG_DIA_PREPARACAO, DIAS_AMOSTRA } from "@/lib/capacidade-preparacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const setor = String(sp.get("setor") || "PREPARACAO").toUpperCase();
  if (!["PREPARACAO", "MONTAGEM"].includes(setor)) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });

  // ⚠ a MESMA régua da lista de obras logo abaixo na tela (ver lib/op-na-fila-pcp).
  const todas = sp.get("todas") === "1";
  const naFila = todas ? null : [...await opIdsNaFilaDoPcp()];
  const soDaFila = naFila ? { opId: { in: naFila } } : {};

  // ── MONTAGEM: o conjunto travado, com os croquis que faltam ──────────────────────────────────
  if (setor === "MONTAGEM") {
    const conj = await prisma.pecaConjunto.findMany({
      where: { ...CONJUNTO_MONTAVEL, ...OP_VIVA, ...soDaFila, status: { in: ["PENDENTE", "CORTE"] } },
      select: {
        id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true,
        op: { select: { numero: true } },
        conjuntoCroquis: {
          select: { croqui: { select: { marca: true, qte: true, qteProduzida: true, maquina: true } } },
        },
      },
      orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
      take: 2000,
    });

    const itens = [];
    for (const c of conj) {
      const pr = calcularProntidao(c);
      if (pr.pronto) continue; // esse está pronto — vive na outra aba
      itens.push({
        id: c.id, opNumero: c.op?.numero || null, marca: c.marca, descricao: c.descricao || null,
        qte: c.qte || 1, kg: Math.round(Number(c.pesoTotalKg) || 0),
        total: pr.total, cortados: pr.atendidos, pct: pr.pct,
        // ⚠ só os que FALTAM: listar os 17 croquis quando 8 já saíram é obrigar a pessoa a comparar
        // duas colunas para achar as 9 que interessam.
        faltam: pr.itens.filter((x) => !x.ok).map((x) => ({
          marca: x.marca, falta: x.falta, qte: x.qte, feito: x.qteProduzida, maquina: x.maquina || null,
        })),
      });
    }
    return NextResponse.json({ setor, todas, itens });
  }

  // ── PREPARAÇÃO: a peça que ainda não foi cortada ─────────────────────────────────────────────
  //
  // ⚠ CONJUNTO NÃO SE CORTA (ver a nota em LiberarFrentes): quem passa pela máquina é croqui e
  // avulsa. Incluir conjunto aqui encheria a fila do corte com o que ela não faz.
  const pecas = await prisma.pecaConjunto.findMany({
    where: { ...SO_FABRICACAO, ...OP_VIVA, ...soDaFila, NOT: { tipoPeca: "CONJUNTO" }, status: { in: ["PENDENTE", "CORTE"] } },
    select: {
      id: true, marca: true, descricao: true, perfil: true, material: true, qte: true, qteProduzida: true,
      pesoTotalKg: true, comprimentoMm: true, maquina: true, statusEstoque: true,
      corteConcluidoEm: true, status: true, op: { select: { numero: true } },
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    take: 4000,
  });

  // ⚠⚠ PEÇA NÃO LANÇADA NÃO É FILA DA PREPARAÇÃO. Vitor (03/09/2026): "tem peças da 97B que estão
  // como falta preparar, porém o Gabriel nem programou ainda". Peça lançada = tem `MesOrdem` (é
  // assim que o Syneco existe — ver torg_programacao_syneco). Na OP-097, as 437 em CORTE têm ordem
  // e as 261 em PENDENTE não têm nenhuma: o trabalho delas é do PROGRAMADOR, não do setor, e
  // misturá-las fazia a tela cobrar da preparação o que ainda não chegou nela.
  //
  // ⚠ Mas o número não some: quem não foi lançado volta como aviso, porque é justamente aí que o
  // PCP tem de ir cobrar.
  const opIds = [...new Set(pecas.map((p) => p.opId).filter(Boolean))];
  const ordens = opIds.length
    ? await prisma.mesOrdem.findMany({ where: { opId: { in: opIds } }, select: { opId: true, item: true } })
    : [];
  const chave = (opId, marca) => `${opId}|${String(marca || "").trim().toUpperCase()}`;
  const lancada = new Set(ordens.map((o) => chave(o.opId, o.item)));

  // ⚠ `pecaCortada` é a MESMA régua do painel de corte e da fila (lib/liberacao-producao): status
  // "CORTE" não quer dizer cortada, quer dizer que está NO corte. Medir aqui de outro jeito faria
  // a mesma peça aparecer feita numa tela e pendente noutra.
  const abertas = pecas.filter((p) => !pecaCortada(p));
  const semOrdem = abertas.filter((p) => !lancada.has(chave(p.opId, p.marca)));
  const itens = abertas
    .filter((p) => lancada.has(chave(p.opId, p.marca)))
    .map((p) => ({
      id: p.id, opNumero: p.op?.numero || null, marca: p.marca, descricao: p.descricao || null,
      perfil: p.perfil || null, material: p.material || null,
      qte: p.qte || 0, feito: p.qteProduzida || 0,
      // ⚠ o nome da máquina vem em dois dialetos (LPC "LASER_CHAPA", Syneco "LASER CHAPA"): a tela
      // agrupa pelo normalizado, senão a mesma máquina aparece duas vezes com metade da carga.
      maquinaChave: normalizaMaquina(p.maquina),
      kg: Math.round(Number(p.pesoTotalKg) || 0),
      comprimentoMm: p.comprimentoMm || null, maquina: p.maquina || null,
      semMaterial: p.statusEstoque === "SEM_MATERIAL",
    }));

  // ⚠ a capacidade é MEDIDA do apontamento, por máquina (ver lib/capacidade-preparacao): a meta
  // agregada de 12 t não enxerga que 12 t de cantoneira é outro dia que 12 t de perfil.
  let cap = { capacidade: {}, amostra: {}, totalKgDia: 0 };
  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - DIAS_AMOSTRA);
    const aps = await prisma.mesApontamento.findMany({
      where: { dataInicio: { gte: desde }, produzidoKg: { gt: 0 }, setor: { contains: "corte", mode: "insensitive" } },
      select: { maquina: true, dataInicio: true, produzidoKg: true },
      take: 60000,
    });
    cap = capacidadePorMaquina(aps);
  } catch { /* sem apontamento a tela cai na meta agregada */ }

  return NextResponse.json({
    setor, todas, itens,
    metaKgDia: META_KG_DIA_PREPARACAO,
    capacidade: cap.capacidade, amostraDias: cap.amostra, capacidadeTotal: cap.totalKgDia,
    naoLancadas: {
      n: semOrdem.length,
      obras: [...new Set(semOrdem.map((p) => p.op?.numero).filter(Boolean))].sort(),
      amostra: semOrdem.slice(0, 8).map((p) => p.marca),
    },
  });
}
