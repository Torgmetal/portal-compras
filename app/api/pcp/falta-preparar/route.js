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

  const itens = pecas
    // ⚠ `pecaCortada` é a MESMA régua do painel de corte e da fila (lib/liberacao-producao): status
    // "CORTE" não quer dizer cortada, quer dizer que está NO corte. Medir aqui de outro jeito faria
    // a mesma peça aparecer feita numa tela e pendente noutra.
    .filter((p) => !pecaCortada(p))
    .map((p) => ({
      id: p.id, opNumero: p.op?.numero || null, marca: p.marca, descricao: p.descricao || null,
      perfil: p.perfil || null, material: p.material || null,
      qte: p.qte || 0, feito: p.qteProduzida || 0,
      kg: Math.round(Number(p.pesoTotalKg) || 0),
      comprimentoMm: p.comprimentoMm || null, maquina: p.maquina || null,
      semMaterial: p.statusEstoque === "SEM_MATERIAL",
    }));

  return NextResponse.json({ setor, todas, itens });
}
