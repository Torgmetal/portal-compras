// GET /api/engenharia/listas/cobertura — cobertura de listas (LE/LPC) por OP.
// Mostra quais obras estão SEM LE e/ou SEM LPC importada, pra corrigir.
// Junção OP↔peça por opId (link canônico; a LPC guarda o código Tekla no opNumero).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const ATIVAS = ["ABERTA", "EM_EXECUCAO", "ATRASADA"];

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO", "EXPEDICAO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const todas = new URL(req.url).searchParams.get("todas") === "1";
  const where = todas ? {} : { status: { in: ATIVAS } };

  const ops = await prisma.oP.findMany({
    where,
    select: { id: true, numero: true, cliente: true, obra: true, status: true },
  });

  // Cobertura por opId (link canônico — a LPC liga assim, 100%).
  const grpId = await prisma.pecaConjunto.groupBy({
    by: ["opId", "naLE", "naLPC"],
    // ⚠ por PERTENCIMENTO (naLE/naLPC), não por `fonte`: a marca que está nas duas listas mora numa
    // linha só, e contá-la pela procedência fazia uma das listas parecer vazia. Ver o schema.
    where: { opId: { not: null }, OR: [{ naLE: true }, { naLPC: true }] },
    _count: { _all: true },
  });
  const porOpId = new Map(); // opId -> { LE, LPC }
  for (const g of grpId) {
    const e = porOpId.get(g.opId) || { LE: 0, LPC: 0 };
    if (g.naLE) e.LE += g._count._all;
    if (g.naLPC) e.LPC += g._count._all;
    porOpId.set(g.opId, e);
  }

  // A LE (FORM21) costuma estar órfã: opId nulo e opNumero sem zero à esquerda
  // ("78" ↔ OP "078"). Casa também pelo número pra não marcar como faltante o que existe.
  // ⚠⚠ O RESGATE POR NÚMERO VALE PARA AS DUAS LISTAS. Vitor (02/09/2026): o Guilherme viu a OP-113
  // marcada como sem lista neste filtro, reimportou a LPC para "resolver", e a reimportação
  // substituiu a lista por uma menor — o cliente recebeu no portal um aviso de 76 marcas excluídas.
  //
  // A checagem da LE já tinha o resgate (LE órfã tem opId nulo e opNumero sem zero: "78" ↔ "078");
  // a da LPC não tinha, e olhava só o opId. LPC com opId nulo — que é como a importação grava
  // quando não consegue casar a obra — some da conta e a tela acusa falta onde não há.
  //
  // ⚠ ALARME FALSO AQUI NÃO É INCÔMODO, É DANO: a ação que ele induz (reimportar) APAGA e regrava a
  // lista. Custa uma consulta a mais e evita que a tela mande alguém mexer no que estava certo.
  const grpNum = await prisma.pecaConjunto.groupBy({
    by: ["opNumero", "naLE", "naLPC"],
    where: { OR: [{ naLE: true }, { naLPC: true }] },
    _count: { _all: true },
  });
  const grpNumLE = grpNum.filter((g) => g.naLE);
  const numKey = (s) => { const m = String(s ?? "").match(/\d+/); return m ? parseInt(m[0], 10) : null; };
  const lePorNum = new Map(); // numKey -> nº de peças LE
  for (const g of grpNumLE) {
    const k = numKey(g.opNumero);
    if (k != null) lePorNum.set(k, (lePorNum.get(k) || 0) + g._count._all);
  }

  const lpcPorNum = new Map();
  for (const g of grpNum) {
    if (!g.naLPC) continue;
    const k = numKey(g.opNumero);
    if (k != null) lpcPorNum.set(k, (lpcPorNum.get(k) || 0) + g._count._all);
  }

  const linhas = ops.map((op) => {
    const c = porOpId.get(op.id) || { LE: 0, LPC: 0 };
    const leNum = lePorNum.get(numKey(op.numero)) || 0; // LE casada por número (pega as órfãs)
    const lpcNum = lpcPorNum.get(numKey(op.numero)) || 0; // idem para a LPC
    return {
      id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra, status: op.status,
      temLE: c.LE > 0 || leNum > 0, temLPC: c.LPC > 0 || lpcNum > 0,
      // ⚠ a linha diz quando a lista existe mas está SOLTA: sem isto, a tela pararia de acusar
      // falta e ninguém saberia que a obra tem lista sem vínculo — que também precisa de conserto,
      // só que de outro tipo (ligar o opId, não reimportar).
      soltaLE: c.LE === 0 && leNum > 0, soltaLPC: c.LPC === 0 && lpcNum > 0,
      nLE: Math.max(c.LE, leNum), nLPC: Math.max(c.LPC, lpcNum),
    };
  });

  // Faltantes primeiro; dentro de cada grupo, por número de OP.
  linhas.sort((a, b) => {
    const fa = a.temLE && a.temLPC ? 1 : 0;
    const fb = b.temLE && b.temLPC ? 1 : 0;
    if (fa !== fb) return fa - fb;
    return (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0) || String(a.numero).localeCompare(String(b.numero));
  });

  return NextResponse.json({
    ok: true,
    total: linhas.length,
    semLE: linhas.filter((l) => !l.temLE).length,
    semLPC: linhas.filter((l) => !l.temLPC).length,
    semAlguma: linhas.filter((l) => !l.temLE || !l.temLPC).length,
    linhas,
  });
}
