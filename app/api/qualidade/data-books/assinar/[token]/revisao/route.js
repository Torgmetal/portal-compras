// POST /api/qualidade/data-books/assinar/[token]/revisao — PÚBLICO: quem está na cadeia pede
// revisão em vez de assinar. Zera o fluxo inteiro e sobe a revisão do dossiê.
//
// Vitor (24/08/2026): "tivemos que reprovar uma emissão, um dos assinantes pediu uma revisão, mas
// não conseguimos, pois ele deve assinar para depois começar novamente".
//
// ⚠⚠ ASSINAR PARA DEPOIS REVISAR É O PIOR DOS MUNDOS. Era o que sobrava: sem botão de recusa, quem
// achava erro tinha de ASSINAR — atestar um documento que sabia estar errado — só para o fluxo
// andar até dar para abrir revisão. A assinatura eletrônica registra nome, data e IP; obrigar
// alguém a carimbar isso num dossiê que ele acabou de reprovar destrói o valor da própria cadeia.
//
// ⚠ QUALQUER UM DA CADEIA PODE, A QUALQUER MOMENTO. Vitor: "quando qualquer uma das partes apertar
// nesse botão o processo volta todo, e aí sim inicia uma nova revisão". Não exige ser a vez dele —
// quem recebeu o dossiê e viu o erro não precisa esperar a fila chegar para avisar. E vale mesmo
// para quem já assinou: erro visto depois continua sendo erro.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { abrirRevisao } from "@/lib/databook-revisao";
import { PAPEL_LABEL, fmtOPdb, baseUrlDe, enviarEmailRevisaoPedida } from "@/lib/databook-assinaturas";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  nome: z.string().min(3, "Informe seu nome completo").max(120),
  motivo: z.string().min(5, "Descreva o que precisa ser corrigido").max(1000),
});

export async function POST(req, { params }) {
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const etapa = await prisma.dataBookAssinatura.findUnique({ where: { token: params.token } });
  if (!etapa) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });

  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: etapa.dataBookId },
    select: { id: true, opNumero: true, obra: true, cliente: true, status: true },
  });
  if (!book) return NextResponse.json({ success: false, error: "Data book não encontrado." }, { status: 404 });

  // ⚠ quem já assinou precisa ser avisado ANTES de a revisão zerar tudo — depois do `abrirRevisao`
  // não há mais como saber quem tinha assinado nesta revisão.
  const etapas = await prisma.dataBookAssinatura.findMany({
    where: { dataBookId: book.id },
    orderBy: { ordem: "asc" },
    // ⚠ o `token` entra aqui porque o aviso leva o link de cada um — `abrirRevisao` zera status e
    // datas, mas NÃO troca o token, então o link de quem está na cadeia continua o mesmo.
    select: { id: true, ordem: true, papel: true, nome: true, email: true, status: true, token: true },
  });
  const jaAssinaram = new Set(etapas.filter((e) => e.status === "ASSINADO").map((e) => e.id));

  const nome = body.nome.trim();
  const motivo = body.motivo.trim();

  let r;
  try {
    r = await abrirRevisao(book.id, { motivo, userNome: nome });
  } catch (e) {
    // ⚠ dois pedidos quase juntos: o segundo cai aqui porque o dossiê já voltou para montagem.
    // Dizer isso é melhor que subir a revisão duas vezes pelo mesmo problema.
    const jaVoltou = book.status === "EM_MONTAGEM" || /em montagem/i.test(e?.message || "");
    return NextResponse.json(
      { success: false, error: jaVoltou ? "Este Data Book já voltou para revisão — alguém da cadeia pediu antes. A Qualidade vai reemitir." : e?.message || "Não foi possível abrir a revisão." },
      { status: e?.status || 400 },
    );
  }

  const op = fmtOPdb(book.opNumero);
  const base = baseUrlDe(req);
  const avisados = [];
  // ⚠ o solicitante NÃO recebe o aviso: ele acabou de escrever o motivo, e o e-mail dele seria só
  // ruído. Todos os outros da cadeia recebem — os que já assinaram porque a assinatura caiu, os
  // demais porque o fluxo que estavam esperando voltou para trás.
  for (const e of etapas) {
    if (e.id === etapa.id || !e.email) continue;
    try {
      await enviarEmailRevisaoPedida({
        email: e.email, nomeDest: e.nome, op, obra: book.obra,
        quemPediu: nome, papelPediu: etapa.papel, motivo,
        rotulo: r.rotulo, jaAssinara: jaAssinaram.has(e.id),
        // ⚠ sem token não há link — melhor o e-mail sem botão do que um botão que cai em página
        // inexistente. Hoje todos têm, mas o aviso não pode depender disso.
        link: e.token ? `${base}/data-book/assinar/${e.token}` : null,
      });
      avisados.push(e.email);
    } catch { /* e-mail que falha não pode desfazer a revisão, que já está gravada */ }
  }

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "PEDIR_REVISAO_DATABOOK",
      entity: "DataBookQualidade",
      entityId: book.id,
      ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent") || null,
      diff: { op: book.opNumero, papel: etapa.papel, label: PAPEL_LABEL[etapa.papel], por: nome, motivo, revisao: r.rotulo, assinaturasZeradas: r.assinaturasZeradas, avisados },
    },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    revisao: r.rotulo,
    assinaturasZeradas: r.assinaturasZeradas,
    avisados: avisados.length,
  });
}
