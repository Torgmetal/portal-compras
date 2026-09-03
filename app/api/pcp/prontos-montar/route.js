// GET /api/pcp/prontos-montar
//   → os conjuntos que a PREPARAÇÃO já terminou e que ainda não têm dia de montagem.
//
// Vitor (03/09/2026): "seria legal uma visão de tudo que a preparação está deixando pronto para dar
// sequência de montagem (…) onde iríamos mostrar o que temos de conjuntos disponíveis para montar,
// selecionar as peças, escolher a quantidade de bancadas, já faria o cálculo de dias que levaria de
// acordo com o tipo da estrutura e já iria programar as bancadas".
//
// ⚠⚠ É A FILA DE ENTRADA DA MONTAGEM, não a lista de conjuntos da obra. Entra quem cumpre as três:
//   1. é CONJUNTO da LPC com croqui (a LE não é produção — ver CONJUNTO_MONTAVEL)
//   2. tem TODOS os croquis cortados (`calcularProntidao().pronto`) — a preparação terminou
//   3. ainda NÃO tem dia de montagem — conjunto já programado virou trabalho da outra aba
//   4. ainda NÃO passou pela montagem (status PENDENTE ou CORTE)
//
// ⚠⚠ A 4ª REGRA CUSTOU CARO E QUASE PASSOU. Sem ela a fila trazia 1.123 conjuntos — e 1.133 deles
// estavam EXPEDIDOS, 420 terceirizados e 285 já na montagem (medido em 03/09/2026). "Todos os
// croquis cortados" continua verdade para uma peça que já foi montada e embarcou meses atrás; o
// que a distingue é o status dela. Sem esse filtro a tela mandaria remontar obra entregue.
//
// ⚠ O CUSTO EM DIAS-BANCADA VAI POR LINHA. É o "de acordo com o tipo da estrutura" que ele pediu: a
// régua da montagem é peça por faixa de peso (uma de 300 kg custa muito mais que dez de 20 kg —
// ver lib/montagem-capacidade), então o número por conjunto é o que explica o prazo do lote.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { calcularProntidao, CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { OP_VIVA } from "@/lib/op-viva";
import { opIdsNaFilaDoPcp } from "@/lib/op-na-fila-pcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  // ⚠ a MESMA régua da lista de obras logo abaixo na tela (ver lib/op-na-fila-pcp): obra que o
  // Planejamento não colocou na fila não entra aqui, senão a fila da montagem enche de obra
  // terminada — foi a OP-103 aparecendo aqui que o Vitor pegou em 03/09/2026.
  const todas = new URL(req.url).searchParams.get("todas") === "1";
  const naFila = todas ? null : [...await opIdsNaFilaDoPcp()];
  const soDaFila = naFila ? { opId: { in: naFila } } : {};

  const conjuntos = await prisma.pecaConjunto.findMany({
    // ⚠ PENDENTE ou CORTE = ainda não entrou na montagem. O conjunto não se corta (ver
    // CONJUNTO_MONTAVEL), então ele costuma esperar em PENDENTE; daí para frente já andou.
    where: { ...CONJUNTO_MONTAVEL, ...OP_VIVA, ...soDaFila, montagemDiaProgramado: null, status: { in: ["PENDENTE", "CORTE"] } },
    select: {
      id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, prioridade: true,
      op: { select: { numero: true } },
      conjuntoCroquis: { select: { croqui: { select: { qte: true, qteProduzida: true } } } },
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    take: 3000,
  });

  const prontos = conjuntos
    .filter((c) => calcularProntidao(c).pronto)
    .map((c) => ({
      id: c.id, opNumero: c.op?.numero || null, marca: c.marca, descricao: c.descricao || null,
      qte: c.qte || 1, pesoTotalKg: Math.round(Number(c.pesoTotalKg) || 0),
      prioridade: c.prioridade ?? null,
    }));

  return NextResponse.json({ todas, conjuntos: prontos });
}
