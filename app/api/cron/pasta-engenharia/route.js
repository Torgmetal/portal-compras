// Cron — confere a pasta da Engenharia contra a lista importada, obra por obra.
//
// ⚠⚠ EM LOTES, COM ORÇAMENTO DE TEMPO. A varredura de UMA obra são centenas de chamadas ao Graph
// (a OP-089 tem 521 desenhos em A1..A4); ~25 obras não cabem nos 60s do serverless. Cada execução
// pega as MAIS DESATUALIZADAS até o tempo acabar, e roda de hora em hora — em poucas passadas o
// painel inteiro está fresco, e nenhuma obra fica para trás porque a fila é ordenada por idade.
//
// ⚠ SEQUENCIAL de propósito: em paralelo o SharePoint devolve 429 e a execução inteira se perde.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { registrarExecucao } from "@/lib/cron-monitor";
import { aquecerBanco } from "@/lib/db-retry";
import { conferirPastaDaOp } from "@/lib/pasta-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORCAMENTO_MS = 45_000; // sobra para gravar e responder dentro dos 60s
const IDADE_H = 20;          // não reconfere o que já foi visto hoje

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);

    const ops = await prisma.oP.findMany({
      where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: { id: true, numero: true, pastaEngenharia: { select: { checadoEm: true, baixada: true } } },
    });
    const limite = new Date(Date.now() - IDADE_H * 3600_000);
    const fila = ops
      // ⚠ obra com baixa não é varrida: é exatamente o pedido — parar de gastar varredura com obra
      // velha que ninguém acompanha mais.
      .filter((o) => !o.pastaEngenharia?.baixada)
      .filter((o) => !o.pastaEngenharia || o.pastaEngenharia.checadoEm < limite)
      // sem conferência nunca vem primeiro; depois, a mais velha
      .sort((a, b) => {
        const ca = a.pastaEngenharia?.checadoEm, cb = b.pastaEngenharia?.checadoEm;
        if (!ca && !cb) return String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true });
        if (!ca) return -1;
        if (!cb) return 1;
        return ca - cb;
      });

    const feitas = [], erros = [];
    for (const o of fila) {
      if (Date.now() - t0 > ORCAMENTO_MS) break;
      try {
        const r = await conferirPastaDaOp(prisma, o.id);
        feitas.push(`${o.numero}:${r.veredito || "erro"}`);
      } catch (e) { erros.push(`${o.numero}: ${e?.message || e}`); }
    }

    const resumo = { conferidas: feitas.length, restantes: fila.length - feitas.length, erros: erros.length };
    await registrarExecucao("pasta-engenharia", { ok: true, duracaoMs: Date.now() - t0, mensagem: `${resumo.conferidas} conferida(s), ${resumo.restantes} na fila` }).catch(() => {});
    return NextResponse.json({ ok: true, ...resumo, feitas, erros: erros.slice(0, 5), ms: Date.now() - t0 });
  } catch (e) {
    await registrarExecucao("pasta-engenharia", { ok: false, duracaoMs: Date.now() - t0, mensagem: e?.message || String(e) }).catch(() => {});
    return NextResponse.json({ error: e?.message || "Falha no cron." }, { status: 500 });
  }
}
