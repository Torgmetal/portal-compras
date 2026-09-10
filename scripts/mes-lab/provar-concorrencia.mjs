// PROVA AS TRAVAS DO MES CONTRA O POSTGRES DE VERDADE, EM PARALELO.
//
//   MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
//   node --experimental-loader ./scripts/mes-lab/alias-loader.mjs scripts/mes-lab/provar-concorrencia.mjs
//
// ⚠⚠ POR QUE ISTO NÃO É UM TESTE DO `npm test`. A suíte não toca banco NENHUM, de propósito — o
// `testes/apoio/setup.js` aponta a `DATABASE_URL` para lugar nenhum e o Prisma é mockado, porque
// aqui um teste que abre conexão escreve em PRODUÇÃO. Mas trava de concorrência com Prisma mockado
// prova o mock, não a trava: `pg_advisory_xact_lock`, índice parcial e `@@unique` são
// comportamento do POSTGRES. Os dois existem e cobrem coisas diferentes — as regras ficam em
// `testes/lib/mes-sessao.teste.js`, a exclusão mútua fica aqui.
//
// ⚠ Os achados do Codex na Conferência de Peça (09/09/2026) foram encontrados em SIMULAÇÃO com
// dependências mockadas. Este script é a versão que não depende de simular: são conexões de
// verdade disputando a mesma linha.

import { PrismaClient } from "@prisma/client";
import { exigirLaboratorio } from "./destino.mjs";
import { abrirSessao, apontarQuantidade, encerrarSessao, STATUS } from "@/lib/mes/sessao";

let LAB;
try { LAB = exigirLaboratorio(process.env.MES_LAB_URL); }
catch (e) { console.error(`\n✗ ${e.message}\n`); process.exit(1); }

const prisma = new PrismaClient({ datasources: { db: { url: LAB } } });

let falhas = 0;
function conferir(nome, condicao, detalhe) {
  console.log(`  ${condicao ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas++;
}

/** Um recurso limpo só para o teste, apagado no fim. */
async function recursoDeTeste() {
  const setor = await prisma.mesSetor.upsert({
    where: { codigo: "TESTE" },
    update: {}, create: { codigo: "TESTE", nome: "Teste", ordem: 999 },
  });
  return prisma.mesRecurso.upsert({
    where: { codigo: "RECURSO_DE_TESTE" },
    update: {}, create: { codigo: "RECURSO_DE_TESTE", nome: "Recurso de teste", setorId: setor.id },
  });
}

async function limpar(recursoId) {
  const sessoes = await prisma.mesSessao.findMany({ where: { recursoId }, select: { id: true } });
  const ids = sessoes.map((s) => s.id);
  await prisma.mesApontamentoQtd.deleteMany({ where: { sessaoId: { in: ids } } });
  await prisma.mesEvento.deleteMany({ where: { recursoId } });
  await prisma.mesSessao.deleteMany({ where: { recursoId } });
}

// ── 1. DOIS TOTENS ABRINDO SESSÃO NA MESMA MÁQUINA ────────────────────────────
// Sem a trava, os dois leem "não há sessão aberta" e criam duas: os apontamentos se dividem entre
// elas e o monitor mostra a máquina em dois estados ao mesmo tempo.
async function duasAberturas(recurso) {
  await limpar(recurso.id);
  const [a, b] = await Promise.all([
    abrirSessao(prisma, { recursoId: recurso.id, marca: "T102A1" }),
    abrirSessao(prisma, { recursoId: recurso.id, marca: "T102A1" }),
  ]);
  const abertas = await prisma.mesSessao.count({ where: { recursoId: recurso.id, status: STATUS.ABERTA } });
  console.log("\n1. Duas aberturas simultâneas no mesmo recurso");
  conferir("existe UMA sessão aberta", abertas === 1, `abertas=${abertas}`);
  conferir("as duas chamadas apontam para a MESMA sessão", a.sessao?.id === b.sessao?.id);
  conferir("uma delas soube que já existia", a.jaExistia !== b.jaExistia);
  return a.sessao;
}

// ── 2. REENVIO COM A MESMA CHAVE ──────────────────────────────────────────────
// O operador toca "Lançar", a resposta se perde, ele toca de novo: mesma chave, um efeito só.
async function reenvioMesmaChave(sessao) {
  const [x, y] = await Promise.all([
    apontarQuantidade(prisma, { sessaoId: sessao.id, boas: 5, chaveOperacao: "tentativa-1" }),
    apontarQuantidade(prisma, { sessaoId: sessao.id, boas: 5, chaveOperacao: "tentativa-1" }),
  ]);
  const linhas = await prisma.mesApontamentoQtd.count({ where: { sessaoId: sessao.id } });
  const soma = await prisma.mesApontamentoQtd.aggregate({ where: { sessaoId: sessao.id }, _sum: { boas: true } });
  console.log("\n2. Duplo clique com a MESMA chave de idempotência");
  conferir("gravou UMA linha", linhas === 1, `linhas=${linhas}`);
  conferir("o total é 5, não 10", soma._sum.boas === 5, `total=${soma._sum.boas}`);
  conferir("as duas chamadas devolvem o mesmo lançamento", x.apontamento?.id === y.apontamento?.id);
}

// ── 3. DOIS LANÇAMENTOS LEGÍTIMOS ─────────────────────────────────────────────
// O contrário do anterior: chaves diferentes são fatos diferentes e DEVEM somar. Uma trava que
// impedisse isto seria pior que a duplicata — o operador não conseguiria apontar duas vezes.
async function lancamentosDiferentes(sessao) {
  await Promise.all([
    apontarQuantidade(prisma, { sessaoId: sessao.id, boas: 3, chaveOperacao: "tentativa-2" }),
    apontarQuantidade(prisma, { sessaoId: sessao.id, boas: 4, chaveOperacao: "tentativa-3" }),
  ]);
  const soma = await prisma.mesApontamentoQtd.aggregate({ where: { sessaoId: sessao.id }, _sum: { boas: true } });
  console.log("\n3. Dois lançamentos com chaves DIFERENTES");
  conferir("somam (5+3+4=12)", soma._sum.boas === 12, `total=${soma._sum.boas}`);
}

// ── 4. APONTAR ENQUANTO OUTRO ENCERRA ─────────────────────────────────────────
// A corrida que a Conferência de Peça sofreu: a gravação passava por cima de uma sessão que outra
// chamada acabara de encerrar, porque o status conferido era o de ANTES da fila.
// ⚠⚠ REPETIDO, PORQUE UMA RODADA SÓ PROVA UMA ORDEM. Quem ganha a fila do Postgres varia; rodar
// uma vez e ver verde diz que UM dos dois caminhos é seguro e cala sobre o outro. Repetindo, as
// duas ordens acontecem — e o que precisa valer nas DUAS é o invariante: a quantidade está gravada
// se, e somente se, a chamada disse que gravou. Nunca uma linha órfã numa sessão fechada, nunca um
// "gravei" sem linha.
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function corridaComOrdem(recurso, { quemAtrasa, i }) {
  await limpar(recurso.id);
  const { sessao } = await abrirSessao(prisma, { recursoId: recurso.id, marca: "T102A2" });
  const atraso = 25;
  const [fim, tarde] = await Promise.all([
    quemAtrasa === "encerrar"
      ? espera(atraso).then(() => encerrarSessao(prisma, { sessaoId: sessao.id }))
      : encerrarSessao(prisma, { sessaoId: sessao.id }),
    quemAtrasa === "apontar"
      ? espera(atraso).then(() => apontarQuantidade(prisma, { sessaoId: sessao.id, boas: 9, chaveOperacao: `atrasado-${i}` }))
      : apontarQuantidade(prisma, { sessaoId: sessao.id, boas: 9, chaveOperacao: `atrasado-${i}` }),
  ]);
  const depois = await prisma.mesSessao.findUnique({ where: { id: sessao.id } });
  const qtd = await prisma.mesApontamentoQtd.count({ where: { sessaoId: sessao.id } });
  return { ok: depois.status === STATUS.ENCERRADA && !fim.erro && qtd === (tarde.apontamento ? 1 : 0),
           gravou: !!tarde.apontamento, status: depois.status, qtd, erro: fim.erro };
}

// ⚠⚠ AS DUAS ORDENS SÃO FORÇADAS, NÃO SORTEADAS. Rodar em paralelo puro e ver verde prova o
// caminho que a máquina escolheu naquele segundo — numa execução deram 8× "apontou antes", na
// seguinte 8× "recusado depois". Um dos dois lados ficaria sem prova, e seria justamente onde o bug
// se esconderia. Com 25 ms de vantagem para um dos lados, cada ordem é exercitada de propósito.
//
// O invariante que precisa valer nas DUAS: a quantidade está gravada se, e somente se, a chamada
// disse que gravou. Nunca linha órfã em sessão fechada, nunca um "gravei" sem linha.
async function apontarContraEncerrar(recurso) {
  console.log("\n4. Apontar quantidade enquanto outro encerra a sessão");
  for (const [quemAtrasa, rotulo] of [
    ["encerrar", "apontamento chega ANTES do encerramento → grava, e a sessão fecha depois"],
    ["apontar", "encerramento chega ANTES → o apontamento atrasado é RECUSADO"],
  ]) {
    const r = await corridaComOrdem(recurso, { quemAtrasa, i: quemAtrasa });
    const esperado = quemAtrasa === "encerrar";
    conferir(rotulo, r.ok && r.gravou === esperado,
      `status=${r.status} linhas=${r.qtd} gravou=${r.gravou}${r.erro ? ` erro=${r.erro}` : ""}`);
  }
}

// ── 5. ENCERRAR DUAS VEZES ────────────────────────────────────────────────────
async function encerrarDuasVezes(recurso) {
  await limpar(recurso.id);
  const { sessao } = await abrirSessao(prisma, { recursoId: recurso.id, marca: "T102A3" });
  const [p, s] = await Promise.all([
    encerrarSessao(prisma, { sessaoId: sessao.id }),
    encerrarSessao(prisma, { sessaoId: sessao.id }),
  ]);
  const fins = await prisma.mesEvento.count({ where: { sessaoId: sessao.id, tipo: "ENCERRAMENTO" } });
  console.log("\n5. Encerrar a mesma sessão duas vezes ao mesmo tempo");
  conferir("nenhuma das duas deu erro", !p.erro && !s.erro, p.erro || s.erro || "");
  conferir("uma soube que já estava encerrada", p.jaEstava !== s.jaEstava);
  conferir("há no máximo 2 eventos de encerramento", fins <= 2, `eventos=${fins}`);
}

async function main() {
  console.log(`Laboratório: ${new URL(LAB).host}\n`);
  const recurso = await recursoDeTeste();
  const sessao = await duasAberturas(recurso);
  await reenvioMesmaChave(sessao);
  await lancamentosDiferentes(sessao);
  await apontarContraEncerrar(recurso);
  await encerrarDuasVezes(recurso);
  await limpar(recurso.id);

  console.log(falhas ? `\n✗ ${falhas} verificação(ões) falharam.` : "\n✓ Todas as travas seguraram.");
  process.exitCode = falhas ? 1 : 0;
}

main()
  .catch((e) => { console.error("\nERRO:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
