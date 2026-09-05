// POST /api/pcp/grd/remessa  { opNumero, setor?, para: {nome, email} }
// Emite a GUIA DE REMESSA (FORM 09) do PCP e manda para assinatura de quem recebe.
//
// Vitor (31/08/2026): "precisamos que gere essa mesma estrutura para o PCP, onde criamos a aba de
// GRD" e "preciso de uma forma de registrar a assinatura de quem deve receber".
//
// ⚠ REUSA O FLUXO DE ASSINATURA QUE JÁ EXISTE (EnvioAssinatura/AssinaturaDocumento + /assinar/
// [token]), o mesmo do Plano de Treinamentos e do Cronograma de Auditoria. Inventar um segundo
// caminho de assinatura no portal criaria duas provas com regras diferentes para o mesmo tipo de
// ato — e numa auditoria alguém teria de explicar por quê.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { numGrdPcp } from "@/lib/grd-pcp-pdf";
import { fmtOP } from "@/lib/utils";
import { escapeHtml } from "@/lib/html";
import { DESTINO_PCP } from "@/lib/grd-roteiro";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  opNumero: z.string().min(1),
  setor: z.string().trim().max(40).optional().nullable(),
  para: z.object({
    nome: z.string().trim().min(2, "Informe quem recebe."),
    email: z.string().trim().email("E-mail inválido."),
  }).optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let b;
  try { b = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // ⚠ A GUIA COBRE O QUE FOI LIBERADO E AINDA NÃO SAIU EM GUIA. Reemitir tudo a cada clique faria
  // a segunda guia repetir a primeira, e duas guias dizendo a mesma entrega é pior que nenhuma.
  const jaEmGuia = new Set(
    (await prisma.grdRemessaPcp.findMany({ where: { opNumero: b.opNumero }, select: { itens: true } }))
      .flatMap((g) => (Array.isArray(g.itens) ? g.itens : []).map((i) => i.id).filter(Boolean))
  );

  const linhas = await prisma.grdLiberacao.findMany({
    where: { opNumero: b.opNumero, ...(b.setor ? { setor: b.setor } : {}) },
    orderBy: [{ marca: "asc" }],
    select: {
      id: true, marca: true, arquivo: true, formato: true, setor: true,
      rastreio: true, impressoes: true, createdAt: true,
    },
  });
  const novas = linhas.filter((l) => !jaEmGuia.has(l.id));
  if (!novas.length) {
    return NextResponse.json(
      { error: "Nada novo para remeter: todos os desenhos liberados desta OP já saíram em guia." },
      { status: 409 },
    );
  }

  // ⚠ O ROTEIRO É O PADRÃO, não uma obrigação. Vitor (31/08/2026): "Engenharia manda para o
  // Gabriel e o Gabriel manda para a Larissa, pode deixar esse roteiro definido". Quem emite pode
  // mandar para outra pessoa quando for o caso; o que muda é que o certo já vem preenchido, e um
  // documento que a ISO lê não depende de alguém digitar o endereço sem errar.
  const para = b.para?.email ? b.para : DESTINO_PCP;

  const op = await prisma.oP.findFirst({ where: { numero: b.opNumero }, select: { id: true, obra: true, cliente: true } });
  const ano = new Date().getFullYear();
  const ultimo = await prisma.grdRemessaPcp.findFirst({ where: { ano }, orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultimo?.numero || 0) + 1;

  const itens = novas.map((l) => ({
    id: l.id, marca: l.marca, arquivo: l.arquivo, formato: l.formato,
    // ⚠ o R impresso é o SNAPSHOT da emissão do desenho, não o CMR de hoje: é o que estava no papel.
    r: l.rastreio?.texto || l.rastreio?.resumo || null,
    impressoes: l.impressoes || 1,
  }));

  const remessa = await prisma.grdRemessaPcp.create({
    data: {
      numero, ano, opNumero: b.opNumero, opId: op?.id || null, setor: b.setor || novas[0]?.setor || null,
      itens, qtdDocs: itens.length,
      emitidoPorId: user.id, emitidoPorNome: user.name || user.email || null,
    },
  });

  // ─── O RECEBIMENTO É O PRÓPRIO ENVIO ────────────────────────────────────────────────────────
  // Vitor (31/08/2026): "preenche o recebimento da GRD só pelo fato de enviar o e-mail, não precisa
  // ter link para confirmar; só preciso deixar isso como se alguém tivesse recebido por conta da
  // ISO — dentro do portal já sabemos quem recebeu ou não".
  //
  // ⚠ ENTÃO A GUIA REGISTRA A REMESSA, não uma confirmação. Escrever "confirmado por Fulano" sem
  // que ninguém tenha clicado seria inventar um ato dentro de um documento auditado. O que vai
  // impresso é o fato: a quem foi enviada e quando — "recebimento por meio eletrônico". É verdade,
  // preenche o campo e é o que uma guia de remessa precisa provar. Quem de fato leu, o portal já
  // sabe pelo acesso.
  let enviado = false;
  if (para?.email) {
    const res = await sendEmail({
      to: para.email,
      subject: `${numGrdPcp(numero, ano)} — desenhos da ${fmtOP(b.opNumero)} para o ${remessa.setor || "seu setor"}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
        ${cabecalhoEmail("Guia de Remessa de Documentos")}
        <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
          <p style="margin:0 0 12px">Olá <strong>${escapeHtml(para.nome)}</strong>,</p>
          <p style="margin:0 0 14px">
            O PCP está remetendo <strong>${itens.length} desenho(s)</strong> da
            <strong>${escapeHtml(fmtOP(b.opNumero))}</strong>${remessa.setor ? ` para o setor <strong>${escapeHtml(remessa.setor)}</strong>` : ""}.
          </p>
          <p style="margin:0 0 14px">A guia segue registrada no portal com esta remessa.</p>
          <p style="margin:0;color:#5b6b7a;font-size:12px">${numGrdPcp(numero, ano)} · emitida por ${escapeHtml(remessa.emitidoPorNome || "PCP")}</p>
        </div>
      </div>`,
      text: `${numGrdPcp(numero, ano)} — ${itens.length} desenho(s) da ${fmtOP(b.opNumero)} remetidos ao ${remessa.setor || "setor"}.`,
      replyTo: user.email || undefined,
    }).catch(() => ({ ok: false }));
    enviado = !!res?.ok;
  }

  // ⚠ SÓ GRAVA O RECEBIMENTO SE O E-MAIL SAIU. Se o Resend falhou, ninguém recebeu nada — e uma
  // guia dizendo que recebeu seria pior que uma guia em branco.
  if (enviado) {
    await prisma.grdRemessaPcp.update({
      where: { id: remessa.id },
      data: { recebidoPorNome: para.nome, recebidoPorEmail: para.email, enviadoEm: new Date() },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "EMITIR_GRD_PCP", entity: "GrdRemessaPcp", entityId: remessa.id,
      diff: { numero, ano, opNumero: b.opNumero, setor: remessa.setor, docs: itens.length, para: para?.email || null, enviado },
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, id: remessa.id, numero, ano, codigo: numGrdPcp(numero, ano),
    docs: itens.length, enviado,
    recebidoPor: enviado ? para.nome : null,
    destino: para?.email || null,
  });
}
