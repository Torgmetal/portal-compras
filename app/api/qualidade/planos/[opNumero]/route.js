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
import { DOCS, ETAPAS, tipoDoEnvio, montarPlano, statusDosPlanos, pdfDoPlano, dadosDaObra, responsaveisDoPlano } from "@/lib/planos-aceite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "QUALIDADE", "COMERCIAL"];
const num = async (params) => String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");

export async function GET(_req, { params }) {
  try { await requireRole([...ROLES, "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await num(params);
  const [status, op, respPit, respPlp] = await Promise.all([
    statusDosPlanos(prisma, opNumero),
    dadosDaObra(prisma, opNumero),
    responsaveisDoPlano(prisma, "PIT", opNumero),
    responsaveisDoPlano(prisma, "PLP", opNumero),
  ]);
  // ⚠ os contatos já registrados na obra vêm prontos: são os mesmos do cronograma e do Kick Off.
  // Redigitar o e-mail do inspetor a cada envio é como se erra o destinatário de um documento
  // controlado. (Ver OP.clienteContatos.)
  const contatos = Array.isArray(op?.clienteContatos)
    ? op.clienteContatos.filter((c) => c?.email).map((c) => ({ nome: c.nome || null, email: c.email }))
    : [];
  // ⚠ os dados da OBRA vão junto. Vitor (27/08/2026): "trazer apenas as informações da Obra por
  // hora" — é o que o portal preenche sozinho no documento, e a tela do plano mostra quais são para
  // ninguém procurar onde digitar cliente, local ou Nº PC/CT.
  return NextResponse.json({
    status, contatos, cliente: op?.cliente || null, obra: op?.obra || null,
    responsaveis: { PIT: respPit, PLP: respPlp },
    dadosDaObra: op ? {
      numero: op.numero, cliente: op.cliente || null, obra: op.obra || null,
      local: op.local || null, pedidoCliente: op.pedidoCliente || null, refCliente: op.refCliente || null,
    } : null,
  });
}

// PUT — quem elabora e quem verifica este plano nesta obra.
//
// ⚠ NOME E E-MAIL JUNTOS: o nome é o que sai impresso no documento, o e-mail é para onde vai o
// pedido de verificação. Guardar só o nome deixaria o campo preenchido e o fluxo sem destino.
export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await num(params);
  const body = await req.json().catch(() => ({}));
  const doc = String(body?.doc || "").toUpperCase();
  if (!DOCS[doc]) return NextResponse.json({ error: "Documento desconhecido (use PIT ou PLP)." }, { status: 400 });

  const txt = (v, n = 120) => (v === null || v === undefined ? null : String(v).trim().slice(0, n) || null);
  const email = (v) => { const e = txt(v, 160); return e && /.+@.+\..+/.test(e) ? e : null; };
  // ⚠ QUEM MAIS RECEBE, e se assina. Vitor (27/08/2026): "preciso ter permissão para colocar mais
  // e-mails além do Elaborado, Verificado e cliente". Cópia recebe o documento e não trava o fluxo;
  // quem assina entra na conta da verificação interna.
  const outros = (Array.isArray(body?.outros) ? body.outros : [])
    .map((o) => ({ nome: txt(o?.nome) || txt(o?.email), email: email(o?.email), assina: !!o?.assina }))
    .filter((o) => o.email)
    .slice(0, 10);
  const dados = {
    elaboradoNome: txt(body?.elaboradoNome), elaboradoEmail: email(body?.elaboradoEmail),
    verificadoNome: txt(body?.verificadoNome), verificadoEmail: email(body?.verificadoEmail),
    // ⚠ o contato do cliente é cadastrado AQUI, junto dos outros dois (Vitor, 28/08/2026): o nome
    // sai impresso no quadro de aprovações e o e-mail é para onde o aceite vai quando a etapa abrir.
    clienteNome: txt(body?.clienteNome), clienteEmail: email(body?.clienteEmail),
    outros,
    atualizadoPorId: user?.id || null,
  };
  if (body?.elaboradoEmail && !dados.elaboradoEmail) return NextResponse.json({ error: "E-mail de quem elabora está inválido." }, { status: 400 });
  if (body?.verificadoEmail && !dados.verificadoEmail) return NextResponse.json({ error: "E-mail de quem verifica está inválido." }, { status: 400 });
  if (body?.clienteEmail && !dados.clienteEmail) return NextResponse.json({ error: "E-mail do cliente está inválido." }, { status: 400 });

  await prisma.planoResponsavel.upsert({
    where: { opNumero_doc: { opNumero, doc } },
    create: { opNumero, doc, ...dados },
    update: dados,
  });
  return NextResponse.json({ ok: true, responsaveis: await responsaveisDoPlano(prisma, doc, opNumero) });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await num(params);
  const body = await req.json().catch(() => ({}));
  const doc = String(body?.doc || "").toUpperCase();
  if (!DOCS[doc]) return NextResponse.json({ error: "Documento desconhecido (use PIT ou PLP)." }, { status: 400 });

  const etapa = String(body?.etapa || "CLIENTE").toUpperCase();
  if (!ETAPAS[etapa]) return NextResponse.json({ error: "Etapa desconhecida (use INTERNA ou CLIENTE)." }, { status: 400 });

  const plano = await montarPlano(prisma, doc, opNumero);
  if (plano.erro) return NextResponse.json({ error: plano.erro }, { status: 400 });

  // ── quem recebe ──
  //
  // ⚠ NA ETAPA INTERNA OS DESTINATÁRIOS SÃO OS RESPONSÁVEIS CADASTRADOS, e o papel de cada um vai
  // gravado: é por ele que o documento sabe qual assinatura é a de quem ELABOROU e qual é a de quem
  // VERIFICOU. Deixar a tela escolher livremente aqui faria o campo do papel virar adivinhação.
  // ⚠ CÓPIA NÃO ASSINA E NÃO TRAVA. Ela recebe o mesmo e-mail e o mesmo PDF, sem o botão de
  // assinar e sem virar AssinaturaDocumento — senão a verificação interna, que só fecha com TODOS
  // assinados, ficaria pendurada em quem foi posto ali só para ficar sabendo.
  const extras = (plano.responsaveis?.outros || []).filter((o) => o?.email);
  const copias = extras.filter((o) => !o.assina).map((o) => ({ nome: o.nome || o.email, email: o.email }));

  let dest;
  if (etapa === "INTERNA") {
    const r = plano.responsaveis || {};
    dest = [
      { ...r.elaborado, papel: "Elaboração" },
      { ...r.verificado, papel: "Verificação" },
      ...extras.filter((o) => o.assina).map((o) => ({ ...o, papel: "Verificação adicional" })),
    ]
      .filter((x) => x?.nome && x?.email)
      // ⚠⚠ A ORDEM É O FLUXO. Vitor (27/08/2026): "o ideal seria o elaborador assinar primeiro, o
      // verificador assina e o cliente assina por último". Quem verifica não pode validar um
      // documento que quem elaborou ainda não assumiu.
      .map((x, i) => ({ nome: x.nome, email: x.email, setor: x.papel, ordem: i + 1 }));
    if (!dest.length) {
      return NextResponse.json({ error: "Preencha quem elabora e quem verifica (nome e e-mail) antes de enviar para verificação." }, { status: 400 });
    }
  } else {
    dest = (Array.isArray(body?.destinatarios) ? body.destinatarios : [])
      .map((d) => ({
        nome: String(d?.nome || "").trim(),
        email: String(d?.email || "").trim(),
        setor: String(d?.setor || "").trim() || null,
      }))
      .filter((d) => d.nome && /.+@.+\..+/.test(d.email))
      // o cliente é o último da fila: a etapa dele só existe depois da interna fechada
      .map((d, i) => ({ ...d, ordem: i + 1 }));
    // ⚠ sem ninguém escolhido na tela, vale o contato do cliente cadastrado no documento — é o
    // mesmo nome que já está impresso no quadro de aprovações.
    if (!dest.length) {
      const c = plano.responsaveis?.cliente;
      if (c?.email) dest = [{ nome: c.nome || c.email, email: c.email, setor: plano.snapshot?.cliente || null, ordem: 1 }];
    }
    if (!dest.length) return NextResponse.json({ error: "Informe ao menos um destinatário do cliente (nome + e-mail válido)." }, { status: 400 });

    // ⚠⚠ O CLIENTE SÓ RECEBE DEPOIS DA VERIFICAÇÃO INTERNA. Vitor (26/08/2026): "enviar para esses
    // e-mails antes, para depois ir até o cliente". Documento controlado que chega ao cliente sem
    // passar por quem elabora e quem verifica não tem volta — o que ele leu, leu. E a checagem é da
    // MESMA revisão: interna assinada na R00 não valida a R01.
    const st = await statusDosPlanos(prisma, opNumero);
    const interna = st?.[doc]?.interna;
    if (!interna?.aceito || interna.revisao !== plano.revisao) {
      return NextResponse.json({
        error: !interna?.enviado
          ? `Antes de ir ao cliente, o ${doc} precisa passar pela verificação interna (elaborado e verificado).`
          : interna.revisao !== plano.revisao
            ? `A verificação interna assinada é da revisão R${String(interna.revisao ?? 0).padStart(2, "0")}, e o ${doc} está na R${String(plano.revisao).padStart(2, "0")}. Envie a revisão atual para verificação.`
            : `A verificação interna do ${doc} ainda não foi assinada por ${interna.pendentes.join(" e ")}.`,
        faltaInterna: true,
      }, { status: 409 });
    }
  }

  const envio = await prisma.envioAssinatura.create({
    data: {
      tipo: tipoDoEnvio(doc, etapa), opNumero, revisao: plano.revisao, titulo: plano.titulo,
      snapshot: { ...plano.snapshot, etapa }, enviadoPorId: user.id || null,
    },
  });

  // ⚠ o anexo é o PDF. Vitor (27/08/2026): "não será necessário o excel nem no PIT nem no PLP, pois
  // o PDF que criou ficou muito mais bonito".
  const arquivo = await pdfDoPlano(prisma, doc, opNumero, { snapshot: plano.snapshot }).catch(() => null);
  const anexoB64 = arquivo ? Buffer.from(arquivo.bytes).toString("base64") : null;
  const base = baseUrlDe(req);
  const def = DOCS[doc];
  let enviados = 0;
  const falhas = [];

  // ⚠⚠ SÓ O PRIMEIRO DA FILA RECEBE AGORA. Os demais são criados com o token pronto e sem convite:
  // o e-mail de cada um sai quando chega a vez dele (ver /api/assinar/[token], ao registrar a
  // assinatura). Mandar os três juntos é o que permitia o verificador assinar antes do elaborador.
  for (const d of dest) {
    const token = gerarTokenForte(24);
    const primeiro = d.ordem === 1;
    await prisma.assinaturaDocumento.create({
      data: { envioId: envio.id, nome: d.nome, email: d.email, setor: d.setor, token, ordem: d.ordem, convidadoEm: primeiro ? new Date() : null },
    });
    if (!primeiro) continue;
    const link = `${base}/assinar/${token}`;
    const interno = etapa === "INTERNA";
    const acao = interno ? "a sua verificação" : "o seu aceite";
    const botao = interno ? "Ver o documento e assinar" : "Ver o documento e registrar o aceite";
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail(`${interno ? "Verificação" : "Aceite"} — ${def.nome}`)}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 10px">Olá, <strong>${d.nome}</strong>,</p>
        <p style="margin:0 0 12px">Segue para ${acao} o <strong>${plano.numero}</strong> — ${def.nome.toLowerCase()} da obra <strong>${plano.snapshot.obra || plano.snapshot.cliente || `OP-${opNumero}`}</strong>, revisão <strong>${plano.snapshot.revisao}</strong>${interno && d.setor ? ` · <strong>${d.setor}</strong>` : ""}.</p>
        <p style="margin:0 0 12px;font-size:13px;color:#5a6b78">${def.resumo}${interno ? " Depois de elaborado e verificado, o documento segue para o cliente." : ""}</p>
        <p style="text-align:center;margin:22px 0">
          <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">${botao}</a>
        </p>
        <p style="margin:0;font-size:12px;color:#5a6b78">O documento está também em anexo, em PDF. Ao assinar, ficam gravados a sua confirmação, a <strong>data/hora</strong> e o <strong>IP</strong> do acesso.</p>
      </div>
    </div>`;
    const r = await sendEmail({
      to: d.email, subject: `${plano.numero} — ${def.nome} para ${interno ? "verificação" : "aceite"}`, html,
      attachments: anexoB64 ? [{ filename: arquivo.nome, content: anexoB64 }] : undefined,
      replyTo: user.email || undefined,
    }).catch((e) => ({ ok: false, erro: e?.message }));
    if (r?.ok) enviados++; else falhas.push(d.email);
  }
  const naFila = dest.length - 1;

  // ── as cópias: mesmo documento, sem link de assinatura ──
  let emCopia = 0;
  for (const c of copias) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail(`${def.nome} — cópia`)}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 10px">Olá, <strong>${c.nome}</strong>,</p>
        <p style="margin:0 0 12px">Segue, <strong>para conhecimento</strong>, o <strong>${plano.numero}</strong> — ${def.nome.toLowerCase()} da obra <strong>${plano.snapshot.obra || plano.snapshot.cliente || `OP-${opNumero}`}</strong>, revisão <strong>${plano.snapshot.revisao}</strong>, ${etapa === "INTERNA" ? "enviado para verificação interna" : "enviado ao cliente para aceite"}.</p>
        <p style="margin:0;font-size:12px;color:#5a6b78">O documento está em anexo, em PDF. Esta cópia não pede assinatura.</p>
      </div>
    </div>`;
    const r2 = await sendEmail({
      to: c.email, subject: `${plano.numero} — ${def.nome} (cópia)`, html,
      attachments: anexoB64 ? [{ filename: arquivo.nome, content: anexoB64 }] : undefined,
      replyTo: user.email || undefined,
    }).catch(() => ({ ok: false }));
    if (r2?.ok) emCopia++; else falhas.push(`${c.email} (cópia)`);
  }

  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PLANO_ACEITE_ENVIO", entity: "EnvioAssinatura", entityId: envio.id,
      diff: { op: opNumero, doc, etapa, revisao: plano.revisao, destinatarios: dest.map((d) => d.email), enviados, copias: copias.map((c) => c.email), emCopia } },
  }).catch(() => {});

  return NextResponse.json({
    ok: true, envioId: envio.id, doc, etapa, numero: plano.numero, total: dest.length, enviados, emCopia, naFila,
    falhas: falhas.length ? falhas : undefined,
    semAnexo: !arquivo || undefined,
  });
}
