// Cron Vercel — sync financeiro consolidado: Contas a Pagar + a Receber numa
// execução só. Junta os dois (antes eram crons separados às 7:30 e 7:45) pra
// garantir que o a receber rode junto com o a pagar e reduzir contenção no Omie
// (o a receber vinha ficando dias atrasado). Auth via vercel-cron ou CRON_SECRET.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sincronizarContasPagar } from "@/lib/omie-contas-pagar";
import { sincronizarContasReceber } from "@/lib/omie-contas-receber";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { log } from "@/lib/log";

const registro = log("api/cron/financeiro");

export const runtime = "nodejs";
// ⚠⚠ 300s, E O ORÇAMENTO SAI DE UM PRAZO ÚNICO. Com teto de 120s e dois orçamentos fixos somando
// 52s, medido em 13/09/2026: a passada boa levava 87s e uma em cada duas dava 504. A conta não
// fechava porque `getMapas()` — que lista TODOS os clientes e categorias do Omie — roda dentro de
// cada sync ANTES de qualquer checagem de orçamento, e não é contada por nenhum dos dois.
//
// ⚠ A RESERVA NÃO É ENFEITE: é o que sobra para gravar o heartbeat e responder. Sem ela, a função
// morre no 504 e o monitor volta a dizer "sem sucesso há N horas" em vez de "falhou" — que foi
// exatamente o que escondeu esta pane por duas semanas.
export const maxDuration = 300;
const TETO_MS = 300_000;
const RESERVA_MS = 25_000;

function autorizado(req) {
  // Só Bearer CRON_SECRET (User-Agent é spoofável — SEC-01).
  return temCronSecret(req);
}

export async function GET(req) {
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await aquecerBanco(prisma).catch(() => {}); // acorda o Neon (scale-to-zero) antes do 1º query
  const t0 = Date.now();
  const restanteMs = () => Math.max(5_000, TETO_MS - RESERVA_MS - (Date.now() - t0));
  const out = { ok: true };
  try {
    // ⚠ 60% do que sobra para o a pagar, o resto para o a receber — o a pagar é o caro (15.549
    // títulos contra 597 movimentos) e é ele que tem janela para recuperar quando fica atrasado.
    out.pagar = await sincronizarContasPagar({ incremental: true, maxDetalhe: 60, orcamentoMs: Math.floor(restanteMs() * 0.6) });
  } catch (e) {
    out.pagarErro = e?.message;
    registro.erro("[cron financeiro] pagar:", e?.message);
  }
  try {
    out.receber = await sincronizarContasReceber({ orcamentoMs: restanteMs() });
  } catch (e) {
    out.receberErro = e?.message;
    registro.erro("[cron financeiro] receber:", e?.message);
  }
  // ⚠ A MENSAGEM DIZ SE A PASSADA FOI PARCIAL. O sync de contas a pagar trabalha em janelas de
  // poucos dias (`JANELA_MAX_DIAS`); recuperando um atraso grande, ele leva várias execuções para
  // alcançar o presente. Sem isto no heartbeat, "ok" de hoje esconderia que ainda faltam dez dias.
  const recuperando = out.pagar?.parcial || (out.pagar?.ate && Date.now() - new Date(out.pagar.ate).getTime() > 36e5);
  const resumo = recuperando
    ? `recuperando atraso — coberto até ${new Date(out.pagar.ate).toLocaleDateString("pt-BR")}${out.pagar.parcial ? " (passada parcial)" : ""}`
    : null;
  await registrarExecucao("financeiro", {
    ok: !out.pagarErro && !out.receberErro,
    mensagem: out.pagarErro || out.receberErro || resumo,
  });
  return NextResponse.json(out);
}
