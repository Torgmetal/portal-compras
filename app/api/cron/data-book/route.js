// Cron — vincula os certificados que chegaram depois e recolhe geração de Data Book abandonada.
//
// ⚠⚠ CERTIFICADO NOVO ENTRA SOZINHO NO LIVRO EM MONTAGEM (Vitor, 25/09/2026: "sim pode vincular").
// O "Puxar certificados" é um retrato do clique: na OP-102 os 11 R chegaram depois dele e a §02
// passou a citar certificados que não estavam no livro. As regras (só seção já montada, só o que
// chegou depois, nunca o que alguém tirou, nunca R duplicado) estão em
// lib/databook-certificados-novos.js. Roda ANTES das gerações — um volume gerado agora já sai com eles.
//
// A tela do usuário é quem normalmente toca a geração (um volume por chamada). Se
// alguém fecha o navegador na metade, o job fica parado com o cursor gravado; este
// cron é quem termina. Trabalha vários volumes por invocação, até perto do teto de
// tempo da função.
//
// ⚠ AGENDA: de hora em hora, só em horário comercial (vercel.json: "15 10-21 * * 1-5", em UTC =
// 7h15–18h15 de Brasília, seg–sex). Rodava a cada 5 minutos, dia e noite: 288 disparos por dia
// para quase sempre não achar nada — e era o que não deixava a compute do Neon dormir de
// madrugada. Vitor (11/09/2026), depois do aviso de crédito da Vercel: "vamos mudar esse cron do
// data book para apenas no horário comercial, não no noturno e a cada 1 hora". Geração
// abandonada à noite é terminada na primeira passada da manhã.
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { processarGeracao } from "@/lib/databook-volumes";
import { vincularCertificadosNovos } from "@/lib/databook-certificados-novos";

export const runtime = "nodejs";
export const maxDuration = 300;

// só mexe em job parado — se a tela está tocando, não atropela
const OCIOSO_MS = 3 * 60_000;
const ORCAMENTO_MS = 240_000;

// uma falha aqui não segura as gerações — mas vai para o monitor
async function vincularCertificados() {
  try { return await vincularCertificadosNovos(prisma); }
  catch (e) { return { erro: String(e?.message || e).slice(0, 300) }; }
}

async function terminarGeracoes(t0) {
  const feitos = [];
  while (Date.now() - t0 < ORCAMENTO_MS) {
    const job = await prisma.dataBookGeracao.findFirst({
      where: { status: { in: ["NA_FILA", "GERANDO"] }, atualizadoEm: { lt: new Date(Date.now() - OCIOSO_MS) } },
      orderBy: { criadoEm: "asc" },
    });
    if (!job) break;
    try {
      const r = await processarGeracao(job.id);
      feitos.push({ job: job.id, ...r });
      if (r.concluido) continue;
    } catch (e) {
      await prisma.dataBookGeracao.update({
        where: { id: job.id },
        data: { status: "ERRO", erro: String(e?.message || e).slice(0, 500), concluidoEm: new Date() },
      });
      feitos.push({ job: job.id, erro: e.message });
    }
  }
  return feitos;
}

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    // ⚠ DENTRO do try: `aquecerBanco` lança quando o Neon não acorda, e fora dele a falha escapava
    // sem passar pelo registrarExecucao (achado do Codex, 17/09/2026 — testes/api/cron-aquecimento).
    await aquecerBanco(prisma);
    const certificados = await vincularCertificados();
    const feitos = await terminarGeracoes(t0);
    await registrarExecucao("data-book", {
      ok: !certificados.erro,
      mensagem: certificados.erro ? `certificados: ${certificados.erro}` : null,
      duracaoMs: Date.now() - t0,
    });
    return NextResponse.json({ ok: true, certificados, volumes: feitos.length, feitos });
  } catch (e) {
    await registrarExecucao("data-book", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
