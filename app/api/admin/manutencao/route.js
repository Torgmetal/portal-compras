// AJUSTES DE BANCO PENDENTES — aplicados por quem é dono do portal, com um clique.
//
// ⚠⚠ POR QUE ISTO EXISTE. Uma correção às vezes precisa de uma coluna nova ou de um acerto de dado
// que o código sozinho não faz. Até aqui isso virava "rode este SQL no console do Neon", e a
// correção ficava parada esperando — enquanto a fábrica seguia com a tela errada. Vitor
// (04/09/2026): "como vamos corrigir isso de uma vez".
//
// Cada tarefa aqui é ADITIVA e IDEMPOTENTE: rodar duas vezes não faz mal, e nenhuma apaga dado.
// Nada de DROP, nada de DELETE — se um dia for preciso, não é por aqui.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * As tarefas, na ordem em que devem rodar.
 *
 * `checar` diz se ainda falta fazer (e quanto), `aplicar` faz. Uma tarefa que já está aplicada
 * aparece na tela como "em dia" e o botão nem a executa.
 */
const TAREFAS = [
  {
    id: "foto-evidencia",
    titulo: "Área de evidência nas fotos de inspeção",
    porque: "Sem esta coluna, cada foto do relatório continua caindo num monte só, fora das seis molduras do registro fotográfico.",
    async checar() {
      const falta = !(await temColuna("FotoInspecao", "evidencia"));
      return { falta, detalhe: falta ? "coluna ausente" : "coluna existe" };
    },
    async aplicar() {
      await prisma.$executeRawUnsafe(`ALTER TABLE "FotoInspecao" ADD COLUMN IF NOT EXISTS "evidencia" TEXT`);
      return "coluna criada";
    },
  },
  {
    id: "liberacao-peca-marcas",
    titulo: "Marca das peças no lote liberado",
    porque: "É o que faz o lote do Planejamento sobreviver à reimportação da lista. Sem ela, apagar e reimportar peças mata o recorte de novo (275 ponteiros mortos em 11 lotes em 04/09/2026).",
    async checar() {
      const falta = !(await temColuna("LiberacaoProducao", "pecaMarcas"));
      return { falta, detalhe: falta ? "coluna ausente" : "coluna existe" };
    },
    async aplicar() {
      await prisma.$executeRawUnsafe(`ALTER TABLE "LiberacaoProducao" ADD COLUMN IF NOT EXISTS "pecaMarcas" JSONB`);
      return "coluna criada";
    },
  },
  {
    id: "montagem-pendente",
    titulo: "Conjuntos programados que ficaram invisíveis na montagem",
    porque:
      "Até 04/09/2026 a liberação só virava o status de quem estava em CORTE; conjunto que nunca teve apontamento de corte ficava PENDENTE, com dia e bancada marcados, fora de todos os painéis. O erro já está corrigido — isto regulariza quem ficou para trás.",
    async checar() {
      const n = await prisma.pecaConjunto.count({ where: ALVO_MONTAGEM });
      return { falta: n > 0, detalhe: n ? `${n} conjunto(s) para regularizar` : "nenhum pendente" };
    },
    async aplicar() {
      // ⚠ Seguro por construção: `montagemDiaProgramado` só é gravado para as peças que PASSARAM na
      // prontidão (todos os croquis cortados) no momento da liberação — ter dia é a prova de que o
      // portão foi cumprido. Ver app/api/producao/pecas/liberar-montagem/route.js.
      const r = await prisma.pecaConjunto.updateMany({
        where: ALVO_MONTAGEM,
        data: { status: "MONTAGEM", ultimoSetor: "Montagem" },
      });
      return `${r.count} conjunto(s) regularizado(s)`;
    },
  },
];

const ALVO_MONTAGEM = {
  tipoPeca: "CONJUNTO",
  status: "PENDENTE",
  montagemDiaProgramado: { not: null },
};

async function temColuna(tabela, coluna) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    tabela, coluna,
  );
  return Array.isArray(r) && r.length > 0;
}

export async function GET() {
  try { await requireAcesso({ tipos: ["ADMIN"] }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const tarefas = [];
  for (const t of TAREFAS) {
    try {
      const { falta, detalhe } = await t.checar();
      tarefas.push({ id: t.id, titulo: t.titulo, porque: t.porque, falta, detalhe });
    } catch (e) {
      tarefas.push({ id: t.id, titulo: t.titulo, porque: t.porque, falta: null, detalhe: `não consegui conferir: ${e?.message || "erro"}` });
    }
  }
  return NextResponse.json({ tarefas, pendentes: tarefas.filter((t) => t.falta).length });
}

export async function POST(req) {
  let user;
  try { user = await requireAcesso({ tipos: ["ADMIN"] }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const so = Array.isArray(body?.ids) && body.ids.length ? new Set(body.ids) : null;

  const feitos = [];
  for (const t of TAREFAS) {
    if (so && !so.has(t.id)) continue;
    try {
      const { falta } = await t.checar();
      if (!falta) { feitos.push({ id: t.id, titulo: t.titulo, ok: true, resultado: "já estava em dia" }); continue; }
      const resultado = await t.aplicar();
      feitos.push({ id: t.id, titulo: t.titulo, ok: true, resultado });
    } catch (e) {
      // ⚠ uma tarefa que falha não impede as outras: são independentes, e parar tudo por causa de
      // uma deixaria o banco a meio caminho sem ninguém saber qual metade passou.
      feitos.push({ id: t.id, titulo: t.titulo, ok: false, resultado: e?.message || "falhou" });
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "MANUTENCAO_BANCO", entity: "Sistema",
        entityId: feitos.map((f) => f.id).join(","),
        diff: { feitos },
      },
    });
  } catch { /* auditoria não pode derrubar a manutenção */ }

  return NextResponse.json({ ok: feitos.every((f) => f.ok), feitos });
}
