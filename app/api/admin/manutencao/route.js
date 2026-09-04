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
import { conferirBanco } from "@/lib/banco-esperado";
import { conferirEtapaPortalXSyneco } from "@/lib/conferencias";

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
    // ⚠⚠ ESTA NÃO É ESCRITA À MÃO — ela VARRE. Vitor (04/09/2026): "terá alguma coisa que vai
    // varrer sozinho?". As duas tarefas de coluna abaixo existiram porque eu lembrei de escrevê-las;
    // esquecer uma é derrubar a tela em produção com "column does not exist". Esta compara o modelo
    // do Prisma (o mesmo que gera as consultas) com o banco e cobra o que faltar — inclusive o que
    // eu criar amanhã. Ver lib/banco-esperado.js.
    id: "colunas-faltando",
    titulo: "Colunas que o código espera e o banco não tem",
    porque: "Varredura automática do modelo contra o banco. Coluna que o código usa e o banco não tem derruba a tela com \"column does not exist\" — e é o que mais trava correção nova.",
    async checar() {
      const { criaveis, revisar } = await conferirBanco(prisma);
      const partes = [];
      if (criaveis.length) partes.push(`${criaveis.length} coluna(s) a criar: ${criaveis.slice(0, 6).map((c) => `${c.tabela}.${c.coluna}`).join(", ")}${criaveis.length > 6 ? "…" : ""}`);
      if (revisar.length) partes.push(`${revisar.length} para conferir à mão: ${revisar.slice(0, 4).map((r) => `${r.tabela}${r.coluna ? "." + r.coluna : ""} (${r.motivo})`).join("; ")}${revisar.length > 4 ? "…" : ""}`);
      return { falta: criaveis.length > 0, detalhe: partes.join(" · ") || "banco em dia com o modelo" };
    },
    async aplicar() {
      const { criaveis, revisar } = await conferirBanco(prisma);
      for (const c of criaveis) await prisma.$executeRawUnsafe(c.sql);
      const extra = revisar.length ? ` · ${revisar.length} continua(m) para conferir à mão` : "";
      return `${criaveis.length} coluna(s) criada(s)${extra}`;
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
  {
    id: "baixa-preparacao-113",
    titulo: "Baixa da preparação da OP-113",
    porque:
      "Vitor (04/09/2026): a preparação da 113 está concluída e a obra já está em acabamento e pintura. A fábrica não aponta Preparação no Syneco (115 ordens, zero produzido), então o portal nunca ficaria sabendo sozinho: as peças seguem na fila do corte e os lotes de corte seguem abertos.",
    async checar() {
      const op = await opDaObra("113");
      if (!op) return { falta: false, detalhe: "OP-113 não encontrada" };
      const [pecas, libs] = await Promise.all([
        prisma.pecaConjunto.count({ where: alvoPreparacao(op.id) }),
        prisma.liberacaoProducao.count({ where: alvoLotesCorte(op.id) }),
      ]);
      return {
        falta: pecas > 0 || libs > 0,
        detalhe: pecas || libs ? `${pecas} peça(s) sem baixa · ${libs} lote(s) de corte aberto(s)` : "já dada",
      };
    },
    async aplicar() {
      const op = await opDaObra("113");
      if (!op) throw new Error("OP-113 não encontrada");
      const agora = new Date();
      // ⚠ SÓ A PREPARAÇÃO. Conjunto (montagem), solda, acabamento e pintura NÃO são tocados aqui:
      // dizer que a preparação acabou é o que ele afirmou; declarar os outros setores concluídos
      // seria inventar produção que ninguém apontou.
      const r = await prisma.pecaConjunto.updateMany({
        where: alvoPreparacao(op.id),
        data: { corteConcluidoEm: agora, status: "CORTE", ultimoSetor: "Corte" },
      });
      // quem nunca teve início ganha início = conclusão (mesma regra da fila de corte)
      await prisma.pecaConjunto.updateMany({
        where: { opId: op.id, corteConcluidoEm: { not: null }, corteIniciadoEm: null },
        data: { corteIniciadoEm: agora },
      });
      const l = await prisma.liberacaoProducao.updateMany({
        where: alvoLotesCorte(op.id),
        data: { status: "CONCLUIDA", concluidaEm: agora },
      });
      return `${r.count} peça(s) com baixa e ${l.count} lote(s) de corte fechado(s)`;
    },
  },
];

const opDaObra = (numero) => prisma.oP.findFirst({ where: { numero }, select: { id: true } });

/** Croqui e avulsa da obra que ainda não têm o corte concluído — conjunto entra pela montagem. */
const alvoPreparacao = (opId) => ({
  opId,
  NOT: { tipoPeca: "CONJUNTO" },
  corteConcluidoEm: null,
});

/** Lotes de corte ainda abertos da obra. */
const alvoLotesCorte = (opId) => ({
  opId,
  status: { in: ["LIBERADA", "EM_PRODUCAO"] },
  setores: { array_contains: ["CORTE"] },
});

const ALVO_MONTAGEM = {
  tipoPeca: "CONJUNTO",
  status: "PENDENTE",
  montagemDiaProgramado: { not: null },
};

export async function GET(req) {
  try { await requireAcesso({ tipos: ["ADMIN"] }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  // ⚠ as CONFERÊNCIAS vêm num pedido à parte: elas varrem obra por obra contra o Syneco e levam
  // ~13 s. Junto das tarefas, a tela inteira ficaria esperando por elas — e o que a pessoa veio
  // fazer (aplicar um ajuste) é o que aparece primeiro.
  if (new URL(req.url).searchParams.get("so") === "conferencias") {
    const conferencias = [];
    try {
      const etapa = await conferirEtapaPortalXSyneco();
      conferencias.push({
        id: "etapa-portal-syneco",
        titulo: "Etapa da peça: portal × fábrica",
        porque: "Compara o que o portal mostra com o que o Syneco apontou. Foi assim que a OP-112 apareceu parada para o cliente enquanto a fábrica cortava as peças dela.",
        ok: etapa.length === 0,
        achados: etapa.map((x) => x.texto),
        detalhe: etapa.length === 0
          ? "nenhuma obra com produção apontada e etapa vazia no portal"
          : `${etapa.length} obra(s) para olhar`,
      });
    } catch (e) {
      conferencias.push({
        id: "etapa-portal-syneco", titulo: "Etapa da peça: portal × fábrica",
        ok: null, achados: [], detalhe: `não consegui conferir: ${e?.message || "erro"}`,
      });
    }
    return NextResponse.json({ conferencias, alertas: conferencias.filter((c) => c.ok === false).length });
  }

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
