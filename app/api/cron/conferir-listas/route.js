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

/**
 * Avisa pelos dois canais e DIZ O QUE ENTREGOU.
 *
 * ⚠⚠ NENHUM CANAL ENTREGAR É FALHA DO CRON, NÃO DETALHE (achado do Codex, 15/09/2026).
 * `criarNotificacao` engole a própria exceção e devolve `null` quando nada foi criado (nenhum
 * destinatário resolvido, banco fora), e `sendEmail` devolve `{ok:false}` quando o Resend recusa.
 * A rota ignorava os dois e respondia sucesso: o monitor ficava calado justamente no dia em que a
 * Engenharia não foi avisada de nada — o MESMO defeito da obra que o Graph recusou.
 */
async function avisar(linhas) {
  const titulo = `${linhas.length} lista(s) de expedição a importar`;
  const mensagem = linhas.slice(0, 5).map((l) => `OP-${l.opNumero}: ${frase(l)}`).join(" · ");
  const notificacao = await criarNotificacao({
    tipo: "LE_DESATUALIZADA",
    titulo,
    mensagem,
    link: "/engenharia/listas",
    dados: { obras: linhas.map((l) => ({ op: l.opNumero, situacao: l.situacao, arquivo: l.arquivo })) },
    modulos: ["ENGENHARIA"],
    // ⚠ Uma notificação por DIA e por conjunto de obras: sem a chave, o cron diário empilharia o
    // mesmo aviso no sino até alguém importar, e o sino vira ruído que ninguém abre.
    chaveEvento: `le-desatualizada:${new Date().toISOString().slice(0, 10)}`,
  }).catch(() => null);

  // ⚠ O e-mail é tentado MESMO se o sino falhou (e vice-versa): são canais independentes, e um
  // problema de destinatário no sino não é razão para a Engenharia ficar sem o e-mail.
  const to = await emailsDaEngenharia().catch(() => []);
  let email = 0;
  let erroEmail = null;
  if (!to.length) {
    erroEmail = "nenhum e-mail de Engenharia";
    registro.aviso("nenhum e-mail de Engenharia");
  } else {
    const r = await sendEmail({ to, subject: `[Portal] ${titulo}`, html: corpoDoEmail(linhas) })
      .catch((e) => ({ ok: false, error: e?.message }));
    if (r?.ok) email = to.length;
    else erroEmail = r?.error || "o Resend recusou o envio";
  }
  return { sino: !!notificacao, email, erroEmail };
}

/**
 * O que impede este cron de ser dado por bem-sucedido hoje.
 *
 * ⚠ Uma lista só, para o heartbeat e a resposta contarem a MESMA história. Resposta dizendo "ok"
 * com heartbeat dizendo "falhou" é o tipo de divergência que faz perder tempo procurando bug no
 * monitor.
 */
function problemasDe(incompletas, envio, quantasPendentes) {
  const fora = [];
  if (incompletas.length) {
    fora.push(`não consegui ler ${incompletas.length} obra(s): ${incompletas.slice(0, 3).map((i) => i.op).join(", ")}`);
  }
  if (quantasPendentes && envio && !envio.simulado && !envio.sino && !envio.email) {
    fora.push(`${quantasPendentes} obra(s) pendente(s) e NENHUM canal entregou${envio.erroEmail ? ` (${envio.erroEmail})` : ""}`);
  }
  return fora;
}

/**
 * Avisa quando há o que avisar. `?simular=1` confere e não avisa ninguém — ver o handler.
 * Em arquivo de rota que já raspa o teto de complexidade, cada condição fora do GET conta.
 */
const avisarSePreciso = (aAvisar, simular) =>
  (aAvisar.length && !simular
    ? avisar(aAvisar)
    : Promise.resolve({ sino: false, email: 0, erroEmail: null, simulado: simular }));

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
  // ⚠ TODOS os registros da obra, não só o último: a OP-085 tem duas frentes (T85-LE e
  // T85-LE-R01 GALV) e comparar contra a importação mais recente acusava o arquivo da OUTRA
  // frente como revisão nova. Ver `compararLista`.
  const porOp = new Map();
  for (const r of registros) porOp.set(r.opNumero, [...(porOp.get(r.opNumero) || []), r]);

  // ⚠⚠ OBRA QUE O GRAPH RECUSOU NÃO É OBRA SEM ARQUIVO (achado do Codex). Um 403/429/500 virava
  // `arquivos: []` → "sem-arquivo" → nenhum aviso, com heartbeat de sucesso: o cron ficava mudo
  // exatamente quando quebrava. Agora ela sai da comparação e é reportada como incompleta.
  const incompletas = [];
  const linhas = [];
  for (const op of ops) {
    const doServidor = noServidor.get(op.numero);
    if (doServidor?.erro) { incompletas.push({ op: op.numero, erro: doServidor.erro }); continue; }
    linhas.push({
      opNumero: op.numero,
      cliente: op.cliente,
      ...compararLista(doServidor?.arquivos, porOp.get(op.numero) || []),
    });
  }
  return { linhas, incompletas };
}

/** O heartbeat. Consulta incompleta ou aviso não entregue não entram como sucesso. */
const bater = (problemas, t0) =>
  registrarExecucao("conferir-listas", {
    ok: !problemas.length,
    mensagem: problemas.length ? problemas.join(" · ") : undefined,
    duracaoMs: Date.now() - t0,
  });

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ⚠⚠ DECIDIDO ANTES DO `try`, E O `catch` TAMBÉM OBEDECE (achado do Codex, 15/09/2026). Estava
  // dentro do try: uma simulação que falhasse gravava heartbeat de ERRO e o monitor alertaria por
  // causa de um ensaio meu — alarme falso vindo justamente da ferramenta de alarme.
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const { linhas, incompletas } = await conferir();
    const aAvisar = pendentes(linhas);

    // `?simular=1` confere e NÃO avisa ninguém — ver o comentário na entrada do handler.
    const envio = await avisarSePreciso(aAvisar, simular);
    const problemas = problemasDe(incompletas, envio, aAvisar.length);
    registro.info(`conferidas ${linhas.length} obras, ${aAvisar.length} pendentes${simular ? " (simulação)" : ""}`);
    if (problemas.length) registro.erro(problemas.join(" · "));
    // ⚠ Simulação não bate o heartbeat: marcaria o cron como "executado hoje" sem ninguém ter
    // sido avisado, e o monitor pararia de cobrar justamente no dia em que o cron falhou.
    // ⚠⚠ CONSULTA INCOMPLETA NÃO É SUCESSO. Se o Graph recusou alguma obra, aquela obra ficou
    // invisível — e registrar "ok" faria o monitor calar justamente no dia em que o cron ficou
    // cego (achado do Codex). O aviso do que FOI achado continua saindo; o heartbeat é que conta
    // a verdade.
    if (!simular) await bater(problemas, t0);
    return NextResponse.json({
      // ⚠ `ok` é "o cron cumpriu o trabalho de hoje" — conferiu TODAS as obras e, havendo o que
      // avisar, avisou. É o mesmo critério do heartbeat, de propósito.
      ok: !problemas.length,
      problemas,
      conferidas: linhas.length,
      incompletas,
      pendentes: aAvisar.map((l) => ({
        op: l.opNumero, cliente: l.cliente, situacao: l.situacao,
        arquivo: l.arquivo, noPortal: l.noPortal, frase: frase(l),
      })),
      ...envio,
    });
  } catch (e) {
    registro.erro("erro:", e?.message);
    if (!simular) {
      await registrarExecucao("conferir-listas", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    }
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
