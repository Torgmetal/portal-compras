// Cron Vercel — confere, uma vez por dia, se a Lista de Expedição do servidor é a mesma que o
// portal importou. SÓ AVISA: não importa nada (a regra e o porquê estão em `lib/le-pendencias.js`).
import { NextResponse } from "next/server";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { lesDeVariasOps } from "@/lib/le-servidor";
import { compararLista, pendentes, frase } from "@/lib/le-pendencias";
import { criarNotificacao } from "@/lib/notificacoes";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail, escaparHtml } from "@/lib/email-layout";
import { log } from "@/lib/log";

const registro = log("api/cron/conferir-listas");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 22 obras, um GET ao Graph por obra depois de uma listagem só — folgado em 60 s, mas o Graph
// tem dia ruim e a Neon acorda devagar.
export const maxDuration = 120;

const VIGENTES = ["ABERTA", "EM_EXECUCAO", "ATRASADA"];

/** Quem recebe: módulo ENGENHARIA + ADMIN, a mesma regra do `requireRole` e do sino. */
async function emailsDaEngenharia() {
  const usuarios = await prisma.user.findMany({
    where: {
      ativo: true,
      OR: [{ tipo: "ADMIN" }, { modulos: { some: { modulo: "ENGENHARIA" } } }],
    },
    select: { email: true },
  });
  return usuarios
    .map((u) => String(u.email || "").trim())
    // ⚠ `cpf@funcionario.torg` é e-mail interno de conta sem e-mail real (login por CPF) — mandar
    // para lá é bounce garantido no Resend.
    .filter((e) => e.includes("@") && !e.endsWith("@funcionario.torg"));
}

function corpoDoEmail(linhas) {
  const itens = linhas.map((l) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">OP-${escaparHtml(l.opNumero)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escaparHtml(l.cliente || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escaparHtml(frase(l))}</td>
    </tr>`).join("");
  return `${cabecalhoEmail("Listas de Expedição a importar")}
    <p style="margin:16px 0">O servidor tem lista mais nova que o portal em
       <strong>${linhas.length} obra(s)</strong>. Enquanto o import não é feito, a expedição
       trabalha com a revisão antiga — etiqueta e conferência saem pela lista do portal.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="background:#f6f7f9">
        <th align="left" style="padding:8px 12px">Obra</th>
        <th align="left" style="padding:8px 12px">Cliente</th>
        <th align="left" style="padding:8px 12px">O que mudou</th>
      </tr></thead>
      <tbody>${itens}</tbody>
    </table>
    <p style="margin:16px 0;color:#576D7E;font-size:13px">Importar em Engenharia › Listas. Este
       aviso só confere — nada foi importado automaticamente.</p>`;
}

async function avisar(linhas) {
  const titulo = `${linhas.length} lista(s) de expedição a importar`;
  const mensagem = linhas.slice(0, 5).map((l) => `OP-${l.opNumero}: ${frase(l)}`).join(" · ");
  await criarNotificacao({
    tipo: "LE_DESATUALIZADA",
    titulo,
    mensagem,
    link: "/engenharia/listas",
    dados: { obras: linhas.map((l) => ({ op: l.opNumero, situacao: l.situacao, arquivo: l.arquivo })) },
    modulos: ["ENGENHARIA"],
    // ⚠ Uma notificação por DIA e por conjunto de obras: sem a chave, o cron diário empilharia o
    // mesmo aviso no sino até alguém importar, e o sino vira ruído que ninguém abre.
    chaveEvento: `le-desatualizada:${new Date().toISOString().slice(0, 10)}`,
  });

  const to = await emailsDaEngenharia();
  if (!to.length) { registro.aviso("nenhum e-mail de Engenharia — só o sino recebeu"); return { email: 0 }; }
  const r = await sendEmail({ to, subject: `[Portal] ${titulo}`, html: corpoDoEmail(linhas) });
  return { email: r?.ok ? to.length : 0 };
}

/** Uma linha por obra vigente, com a situação da lista dela. */
async function conferir() {
  const ops = await prisma.oP.findMany({
    where: { status: { in: VIGENTES } },
    select: { numero: true, cliente: true },
    orderBy: { numero: "asc" },
  });
  const noServidor = await lesDeVariasOps(ops.map((o) => o.numero));
  const registros = await prisma.listaExpedicao.findMany({
    where: { opNumero: { in: ops.map((o) => o.numero) } },
    select: { opNumero: true, arquivo: true, fileModificado: true, importadoEm: true },
    orderBy: { importadoEm: "desc" },
  });
  // A mesma obra pode ter mais de uma frente (T89A, T89C); vale a importada mais recentemente.
  const porOp = new Map();
  for (const r of registros) if (!porOp.has(r.opNumero)) porOp.set(r.opNumero, r);

  return ops.map((op) => ({
    opNumero: op.numero,
    cliente: op.cliente,
    ...compararLista(noServidor.get(op.numero)?.arquivos, porOp.get(op.numero) || null),
  }));
}

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const linhas = await conferir();
    const aAvisar = pendentes(linhas);

    // ⚠ `?simular=1` confere e NÃO avisa ninguém. Existe porque a única forma de provar este cron
    // é rodá-lo contra o SharePoint de verdade — e sem isto, cada prova mandaria um e-mail para a
    // Engenharia inteira e empilharia sino. Só o cron agendado (sem o parâmetro) avisa.
    const simular = new URL(req.url).searchParams.get("simular") === "1";
    const envio = aAvisar.length && !simular ? await avisar(aAvisar) : { email: 0, simulado: simular };
    registro.info(`conferidas ${linhas.length} obras, ${aAvisar.length} pendentes${simular ? " (simulação)" : ""}`);
    // ⚠ Simulação não bate o heartbeat: marcaria o cron como "executado hoje" sem ninguém ter
    // sido avisado, e o monitor pararia de cobrar justamente no dia em que o cron falhou.
    if (!simular) await registrarExecucao("conferir-listas", { ok: true, duracaoMs: Date.now() - t0 });
    return NextResponse.json({
      ok: true,
      conferidas: linhas.length,
      pendentes: aAvisar.map((l) => ({
        op: l.opNumero, cliente: l.cliente, situacao: l.situacao,
        arquivo: l.arquivo, noPortal: l.noPortal, frase: frase(l),
      })),
      ...envio,
    });
  } catch (e) {
    registro.erro("erro:", e?.message);
    await registrarExecucao("conferir-listas", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
