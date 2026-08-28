// Assinatura PÚBLICA (token) de um documento (Plano de Treinamentos / Cronograma / PIT / PLP).
// GET  → dados do documento p/ a pessoa
// POST → registra a assinatura (confirmação + data + IP) OU o PEDIDO DE REVISÃO
//
// ⚠⚠ A ORDEM É PARTE DO DOCUMENTO. Vitor (27/08/2026): "o ideal seria o elaborador assinar
// primeiro, o verificador assina e o cliente assina por último, e pode ter a opção de pedir revisão
// para voltar o processo e subir revisão dos dois documentos". Quem verifica não valida o que quem
// elabora ainda não assumiu — e quem recebe fora da vez não tem o que assinar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { baseUrlDe } from "@/lib/databook-assinaturas";
import { ehTipoDePlano, docDoTipo, tudoAprovado, arquivarPlano, DOCS } from "@/lib/planos-aceite";

export const runtime = "nodejs";
export const maxDuration = 60;

async function carregar(token) {
  return prisma.assinaturaDocumento.findUnique({
    where: { token },
    include: { envio: { select: { id: true, tipo: true, revisao: true, titulo: true, enviadoEm: true, opNumero: true, snapshot: true, status: true } } },
  });
}

/**
 * A conta do portal que responde por este e-mail (se existir).
 *
 * ⚠⚠ QUEM TEM CADASTRO ASSINA LOGADO. Vitor (28/08/2026): "para o portal não há necessidade de
 * login, mas para uma possível assinatura precisa ser feito o login". O link por token prova que a
 * pessoa RECEBEU o e-mail; não prova que é ela quem está clicando — e link se encaminha. Onde há
 * cadastro, a sessão prova a identidade, e é só aí que o carimbo dela pode sair no documento.
 *
 * ⚠ Sem cadastro nada muda: assina pelo link, com nome, data e IP. É o caso da maioria dos
 * inspetores de cliente, e travar isso seria travar a assinatura.
 */
async function contaDe(email) {
  if (!email) return null;
  return prisma.user.findFirst({
    where: { email, ativo: true, tipo: "CLIENTE" },
    select: { id: true, name: true, email: true, assinaturaUrl: true },
  }).catch(() => null);
}

/** Quem vem antes na fila e ainda não assinou — é quem segura a vez. */
async function faltaAntes(a) {
  if (a.ordem == null) return null;
  return prisma.assinaturaDocumento.findFirst({
    where: { envioId: a.envioId, ordem: { lt: a.ordem }, assinadoEm: null },
    orderBy: { ordem: "asc" },
    select: { nome: true, setor: true, ordem: true },
  });
}

export async function GET(_req, { params }) {
  const a = await carregar(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const doObra = a.envio.tipo === "PLP" || a.envio.tipo === "PIT";
  const interno = a.envio.tipo === "PLP_INTERNO" || a.envio.tipo === "PIT_INTERNO";
  const anterior = await faltaAntes(a);
  const conta = await contaDe(a.email);
  const sessao = conta ? await getSession().catch(() => null) : null;
  const logadoComoDono = !!sessao?.user?.email && sessao.user.email.toLowerCase() === String(a.email).toLowerCase();

  return NextResponse.json({
    nome: a.nome, setor: a.setor, assinadoEm: a.assinadoEm, ip: a.ip,
    // login exigido só para quem TEM cadastro; o resto assina pelo link, como sempre
    exigeLogin: !!conta, logado: logadoComoDono, email: conta ? a.email : null,
    temCarimbo: !!conta?.assinaturaUrl,
    titulo: a.envio.titulo, revisao: a.envio.revisao, tipo: a.envio.tipo, enviadoEm: a.envio.enviadoEm,
    aceiteCliente: doObra, temArquivo: false, verificacaoInterna: interno,
    // ⚠ o documento pode ter sido devolvido por outra pessoa depois que este link saiu
    revisaoPedida: a.envio.status === "REVISAO_PEDIDA",
    revisaoPedidaPorMim: !!a.revisaoPedidaEm,
    motivo: a.motivo || null,
    // de quem ainda se espera antes desta pessoa
    aguardando: anterior ? { nome: anterior.nome, papel: anterior.setor } : null,
    podePedirRevisao: ehTipoDePlano(a.envio.tipo),
  });
}

export async function POST(req, { params }) {
  const a = await carregar(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  // ⚠ a trava vale para ASSINAR e para PEDIR REVISÃO: os dois são atos do signatário.
  const conta = await contaDe(a.email);
  if (conta) {
    const sessao = await getSession().catch(() => null);
    const eu = sessao?.user?.email?.toLowerCase();
    if (!eu) return NextResponse.json({ error: "Entre com o seu acesso para assinar este documento.", exigeLogin: true }, { status: 401 });
    if (eu !== String(a.email).toLowerCase()) {
      return NextResponse.json({ error: `Este documento está endereçado a ${a.email}. Entre com esse acesso para assinar.`, exigeLogin: true }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const pedirRevisao = body?.acao === "REVISAO";
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;

  if (a.envio.status === "REVISAO_PEDIDA") {
    return NextResponse.json({ error: "Este documento foi devolvido para revisão. Uma nova versão será enviada para assinatura." }, { status: 409 });
  }

  // ── pedido de revisão: devolve o documento e sobe a revisão ──
  if (pedirRevisao) {
    if (!ehTipoDePlano(a.envio.tipo)) {
      return NextResponse.json({ error: "Este documento não aceita pedido de revisão por aqui." }, { status: 400 });
    }
    const motivo = String(body?.motivo || "").trim().slice(0, 1000);
    if (motivo.length < 5) return NextResponse.json({ error: "Escreva o que precisa ser revisto." }, { status: 400 });

    const doc = docDoTipo(a.envio.tipo);
    const opNumero = a.envio.opNumero || a.envio.snapshot?.opNumero || null;

    await prisma.assinaturaDocumento.update({ where: { id: a.id }, data: { revisaoPedidaEm: new Date(), motivo, ip } });
    await prisma.envioAssinatura.update({ where: { id: a.envioId }, data: { status: "REVISAO_PEDIDA" } });

    // ⚠⚠ A REVISÃO SOBE NO DOCUMENTO, não só no envio. Vitor: "pedir revisão para voltar o processo
    // e subir revisão dos dois documentos". Sem isso, o próximo envio sairia com o MESMO número de
    // revisão do que foi recusado — e o portão que impede reenviar revisão já aceita bloquearia o
    // reenvio legítimo.
    let novaRev = null;
    try {
      if (opNumero && doc === "PIT") {
        const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true, pitRevisao: true } });
        if (op) {
          novaRev = String((parseInt(String(op.pitRevisao ?? "0").match(/\d+/)?.[0] || "0", 10) || 0) + 1);
          await prisma.oP.update({ where: { id: op.id }, data: { pitRevisao: novaRev } });
        }
      } else if (opNumero && doc === "PLP") {
        const plp = await prisma.planoPintura.findUnique({ where: { opNumero }, select: { id: true, revisao: true } });
        if (plp) {
          novaRev = String((parseInt(String(plp.revisao ?? "0").match(/\d+/)?.[0] || "0", 10) || 0) + 1);
          await prisma.planoPintura.update({ where: { id: plp.id }, data: { revisao: novaRev } });
        }
      }
    } catch (e) { console.error("[assinar] subir revisão:", e?.message); }

    // avisa quem mandou (e quem já tinha assinado) que o documento voltou
    try {
      const envio = await prisma.envioAssinatura.findUnique({
        where: { id: a.envioId },
        select: { enviadoPorId: true, assinaturas: { select: { nome: true, email: true, assinadoEm: true } } },
      });
      const autor = envio?.enviadoPorId ? await prisma.user.findUnique({ where: { id: envio.enviadoPorId }, select: { email: true, name: true } }) : null;
      const paraAvisar = [
        ...(autor?.email ? [{ nome: autor.name || autor.email, email: autor.email }] : []),
        ...(envio?.assinaturas || []).filter((x) => x.assinadoEm && x.email).map((x) => ({ nome: x.nome, email: x.email })),
      ];
      const vistos = new Set();
      for (const d of paraAvisar) {
        if (vistos.has(d.email.toLowerCase())) continue;
        vistos.add(d.email.toLowerCase());
        const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
          ${cabecalhoEmail(`Revisão pedida — ${a.envio.titulo}`)}
          <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
            <p style="margin:0 0 10px">Olá, <strong>${d.nome}</strong>,</p>
            <p style="margin:0 0 12px"><strong>${a.nome}</strong>${a.setor ? ` (${a.setor})` : ""} pediu revisão do documento em vez de assinar.</p>
            <p style="margin:0 0 12px;padding:12px;background:#fff7ed;border-left:3px solid #F4801F">${motivo.replace(/</g, "&lt;")}</p>
            <p style="margin:0;font-size:12px;color:#5a6b78">O documento subiu para a revisão <strong>${novaRev ?? "seguinte"}</strong>. Ajuste o conteúdo no portal e envie de novo para assinatura — o ciclo recomeça pelo elaborador.</p>
          </div>
        </div>`;
        await sendEmail({ to: d.email, subject: `Revisão pedida — ${a.envio.titulo}`, html }).catch(() => null);
      }
    } catch (e) { console.error("[assinar] aviso de revisão:", e?.message); }

    return NextResponse.json({ ok: true, revisaoPedida: true, novaRevisao: novaRev });
  }

  // ── assinatura ──
  if (a.assinadoEm) return NextResponse.json({ ok: true, jaAssinado: true, assinadoEm: a.assinadoEm, ip: a.ip });

  const anterior = await faltaAntes(a);
  if (anterior) {
    return NextResponse.json({
      error: `Ainda não é a sua vez: falta a assinatura de ${anterior.nome}${anterior.setor ? ` (${anterior.setor})` : ""}. Você recebe um aviso quando o documento chegar até você.`,
      aguardando: { nome: anterior.nome, papel: anterior.setor },
    }, { status: 409 });
  }

  // ⚠⚠ A IMAGEM DA ASSINATURA ENTRA AQUI, no ato. Vitor (28/08/2026): "para as assinaturas dos
  // relatórios de qualidade (…) quando o usuário assinar ela sair no campo de assinatura dela — mas
  // isso seria apenas nos relatórios de inspeção; para o PIT e PLP por hora não precisa, pois nem
  // sempre teremos como pegar a assinatura do cliente dessa maneira".
  //
  // ⚠ Copiada, não referenciada: o documento guarda a imagem que foi usada. Trocar a assinatura no
  // cadastro depois não reescreve relatório já assinado.
  // ⚠ o carimbo do CLIENTE sai em qualquer documento que ele assine logado (Vitor, 28/08/2026:
  // "caso o cliente já tenha cadastro ele puxa o carimbo"); para os demais segue valendo o
  // relatório de inspeção, que foi onde a regra nasceu.
  let imagemUrl = conta?.assinaturaUrl || null;
  if (!imagemUrl && a.envio.tipo === "RELATORIO_INSPECAO" && a.email) {
    const u = await prisma.user.findFirst({ where: { email: a.email }, select: { assinaturaUrl: true } }).catch(() => null);
    imagemUrl = u?.assinaturaUrl || null;
  }
  const upd = await prisma.assinaturaDocumento.update({ where: { id: a.id }, data: { assinadoEm: new Date(), ip, ...(imagemUrl ? { imagemUrl } : {}) } });

  // ── passa a vez: convida o próximo da fila ──
  try {
    const proximo = await prisma.assinaturaDocumento.findFirst({
      where: { envioId: a.envioId, assinadoEm: null, convidadoEm: null, ordem: { gt: a.ordem ?? 0 } },
      orderBy: { ordem: "asc" },
    });
    if (proximo) {
      const base = baseUrlDe(req);
      const def = DOCS[docDoTipo(a.envio.tipo)] || { nome: "documento" };
      const interno = String(a.envio.tipo).endsWith("_INTERNO");
      const link = `${base}/assinar/${proximo.token}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
        ${cabecalhoEmail(`${interno ? "Verificação" : "Aceite"} — ${def.nome}`)}
        <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
          <p style="margin:0 0 10px">Olá, <strong>${proximo.nome}</strong>,</p>
          <p style="margin:0 0 12px"><strong>${a.nome}</strong> assinou e o <strong>${a.envio.titulo}</strong> chegou até você${proximo.setor ? ` para <strong>${String(proximo.setor).toLowerCase()}</strong>` : ""}.</p>
          <p style="text-align:center;margin:22px 0">
            <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Ver o documento e assinar</a>
          </p>
          <p style="margin:0;font-size:12px;color:#5a6b78">Se algo precisar mudar, você pode <strong>pedir revisão</strong> na mesma página, em vez de assinar.</p>
        </div>
      </div>`;
      const r = await sendEmail({ to: proximo.email, subject: `${a.envio.titulo} — sua assinatura`, html }).catch(() => ({ ok: false }));
      if (r?.ok) await prisma.assinaturaDocumento.update({ where: { id: proximo.id }, data: { convidadoEm: new Date() } });
    } else {
      // ninguém mais na fila: a etapa fechou
      await prisma.envioAssinatura.update({ where: { id: a.envioId }, data: { status: "CONCLUIDO" } }).catch(() => {});
    }
  } catch (e) { console.error("[assinar] convite do próximo:", e?.message); }

  // ⚠⚠ APROVOU TUDO → ARQUIVA. Vitor (26/08/2026): "você deve salvar na pasta da qualidade do
  // SharePoint e anexar ao Data Book depois de todos terem aprovado". O gatilho é a última
  // assinatura; esperar alguém lembrar de clicar em "arquivar" é como o Data Book fica sem o plano
  // justamente na obra que já fechou. Falha ao arquivar não derruba a assinatura.
  if (ehTipoDePlano(a.envio.tipo)) {
    const doc = docDoTipo(a.envio.tipo);
    const opNumero = a.envio.opNumero || a.envio.snapshot?.opNumero || null;
    if (opNumero) {
      try {
        if (await tudoAprovado(prisma, doc, opNumero)) await arquivarPlano(prisma, doc, opNumero);
      } catch { /* silêncio de propósito: ver o comentário acima */ }
    }
  }

  return NextResponse.json({ ok: true, assinadoEm: upd.assinadoEm, ip: upd.ip });
}
