// GET  /api/qualidade/planos/{opNumero}        → como está o aceite do PIT e do PLP desta obra
// POST /api/qualidade/planos/{opNumero}        → envia um deles ao cliente para aceite (e-mail)
//
// Vitor (26/08/2026): "não quero que gere apenas o excel, quero que mande para assinatura como te
// disse, e será através de um e-mail que será enviado, e já fique mostrando o status no portal do
// cliente; o PIT também deve conter o aceite por parte do cliente, não pode deixar de ter esse
// aceite".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { baseUrlDe } from "@/lib/databook-assinaturas";
import { DOCS, montarPlano, statusDosPlanos, excelDoPlano, dadosDaObra } from "@/lib/planos-aceite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "QUALIDADE", "COMERCIAL"];
const num = async (params) => String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");

export async function GET(_req, { params }) {
  try { await requireRole([...ROLES, "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await num(params);
  const [status, op] = await Promise.all([
    statusDosPlanos(prisma, opNumero),
    dadosDaObra(prisma, opNumero),
  ]);
  // ⚠ os contatos já registrados na obra vêm prontos: são os mesmos do cronograma e do Kick Off.
  // Redigitar o e-mail do inspetor a cada envio é como se erra o destinatário de um documento
  // controlado. (Ver OP.clienteContatos.)
  const contatos = Array.isArray(op?.clienteContatos)
    ? op.clienteContatos.filter((c) => c?.email).map((c) => ({ nome: c.nome || null, email: c.email }))
    : [];
  return NextResponse.json({ status, contatos, cliente: op?.cliente || null, obra: op?.obra || null });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await num(params);
  const body = await req.json().catch(() => ({}));
  const doc = String(body?.doc || "").toUpperCase();
  if (!DOCS[doc]) return NextResponse.json({ error: "Documento desconhecido (use PIT ou PLP)." }, { status: 400 });

  const dest = (Array.isArray(body?.destinatarios) ? body.destinatarios : [])
    .map((d) => ({
      nome: String(d?.nome || "").trim(),
      email: String(d?.email || "").trim(),
      setor: String(d?.setor || "").trim() || null,
    }))
    .filter((d) => d.nome && /.+@.+\..+/.test(d.email));
  if (!dest.length) return NextResponse.json({ error: "Informe ao menos um destinatário do cliente (nome + e-mail válido)." }, { status: 400 });

  const plano = await montarPlano(prisma, doc, opNumero);
  if (plano.erro) return NextResponse.json({ error: plano.erro }, { status: 400 });

  // ⚠⚠ REVISÃO JÁ ACEITA NÃO SE REENVIA. Um segundo envio da mesma revisão criaria dois documentos
  // com o mesmo número, os dois válidos, com aceites diferentes — em documento controlado isso é
  // pior que não ter aceite. Para pedir aceite de novo, sobe a revisão do documento.
  const mesmaRev = await prisma.envioAssinatura.findFirst({
    where: { tipo: doc, opNumero, revisao: plano.revisao },
    select: { id: true, titulo: true, assinaturas: { select: { assinadoEm: true, nome: true } } },
    orderBy: { enviadoEm: "desc" },
  });
  const jaAceito = mesmaRev?.assinaturas?.find((a) => a.assinadoEm);
  if (jaAceito && !body?.forcar) {
    return NextResponse.json({
      error: `"${mesmaRev.titulo}" já foi aceito por ${jaAceito.nome}. Para pedir um novo aceite, suba a revisão do ${doc}.`,
      jaAceito: true,
    }, { status: 409 });
  }

  const envio = await prisma.envioAssinatura.create({
    data: {
      tipo: doc, opNumero, revisao: plano.revisao, titulo: plano.titulo,
      snapshot: plano.snapshot, enviadoPorId: user.id || null,
    },
  });

  // o anexo é o Excel — o entregável que ele pediu ("no formato excel para ficar mais sério")
  const arquivo = await excelDoPlano(prisma, doc, opNumero, { snapshot: plano.snapshot, usuario: user?.name || user?.email || null }).catch(() => null);
  const anexoB64 = arquivo ? Buffer.from(arquivo.bytes).toString("base64") : null;
  const base = baseUrlDe(req);
  const def = DOCS[doc];
  let enviados = 0;
  const falhas = [];

  for (const d of dest) {
    const token = gerarTokenForte(24);
    await prisma.assinaturaDocumento.create({ data: { envioId: envio.id, nome: d.nome, email: d.email, setor: d.setor, token } });
    const link = `${base}/assinar/${token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail(`Aceite — ${def.nome}`)}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 10px">Olá, <strong>${d.nome}</strong>,</p>
        <p style="margin:0 0 12px">Segue para o seu aceite o <strong>${plano.numero}</strong> — ${def.nome.toLowerCase()} da obra <strong>${plano.snapshot.obra || plano.snapshot.cliente || `OP-${opNumero}`}</strong>, revisão <strong>${plano.snapshot.revisao}</strong>.</p>
        <p style="margin:0 0 12px;font-size:13px;color:#5a6b78">${def.resumo}</p>
        <p style="text-align:center;margin:22px 0">
          <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Ver o documento e registrar o aceite</a>
        </p>
        <p style="margin:0;font-size:12px;color:#5a6b78">O documento está também em anexo, em Excel, com os campos de assinatura. Ao registrar o aceite, ficam gravados a sua confirmação, a <strong>data/hora</strong> e o <strong>IP</strong> do acesso.</p>
      </div>
    </div>`;
    const r = await sendEmail({
      to: d.email, subject: `${plano.numero} — ${def.nome} para aceite`, html,
      attachments: anexoB64 ? [{ filename: arquivo.nome, content: anexoB64 }] : undefined,
      replyTo: user.email || undefined,
    }).catch((e) => ({ ok: false, erro: e?.message }));
    if (r?.ok) enviados++; else falhas.push(d.email);
  }

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PLANO_ACEITE_ENVIO", entity: "EnvioAssinatura", entityId: envio.id,
      diff: { op: opNumero, doc, revisao: plano.revisao, destinatarios: dest.map((d) => d.email), enviados } },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, envioId: envio.id, doc, numero: plano.numero, total: dest.length, enviados,
    falhas: falhas.length ? falhas : undefined,
    semAnexo: !arquivo || undefined,
  });
}
