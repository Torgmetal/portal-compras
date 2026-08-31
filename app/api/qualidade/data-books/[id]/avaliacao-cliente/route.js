// POST /api/qualidade/data-books/[id]/avaliacao-cliente
// Publica o data book emitido no portal do cliente para ELE CONFERIR, antes de a cadeia de
// assinaturas começar.
//
// Vitor (31/08/2026): "antes de enviar para assinatura, teria como disponibilizar no portal do
// cliente o PDF para ele avaliar as informações? (…) depois do ok dele aí sim subimos para
// assinatura".
//
// ⚠⚠ É O RASCUNHO QUE VAI, NÃO O EMITIDO. Vitor (31/08/2026): "o que deve aparecer para o cliente
// é exatamente o rascunho; o emitido vai somente depois para ele, quando terminar todas as
// assinaturas".
//
// A ordem importa e eu tinha invertido. Emitir é o ato que FECHA o documento: carimba R00, trava
// as seções e só se desfaz por revisão. Emitir antes de o cliente ler significa que qualquer
// apontamento dele custa um R a mais em um livro que ainda nem começou a circular. O rascunho já
// se identifica sozinho — a capa traz STATUS: RASCUNHO e o arquivo baixa como "(rascunho)".
//
// Por isso esta rota NÃO exige emissão e NÃO mexe no `status`: ela só marca que o rascunho foi
// posto para conferência. O livro segue editável, que é o ponto — a conferência existe para gerar
// correção.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { secoesDoPortal } from "@/lib/portal-cliente";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { gerarTokenForte } from "@/lib/token";
import { limparTextoCurto } from "@/lib/html";
import { fmtOP } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: params.id },
    select: { id: true, opNumero: true, status: true, revisao: true, emitidoEm: true, avaliacaoOkEm: true },
  });
  if (!book) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });

  // ⚠ SÓ NÃO SE MANDA O QUE JÁ ACABOU. Depois do aceite o portal mostra o livro EMITIDO e assinado;
  // reabrir uma conferência ali confundiria o cliente sobre qual documento vale.
  if (book.status === "ACEITO") {
    return NextResponse.json(
      { success: false, error: "Este data book já foi aceito pelo cliente — não há o que conferir." },
      { status: 409 },
    );
  }

  // ⚠⚠ SEM VOLUME GERADO NÃO HÁ O QUE CONFERIR. O portal lista os arquivos da revisão corrente; se
  // a geração não rodou, o cliente abriria a seção e não veria PDF nenhum — e ficaria esperando
  // por um aviso que já foi dado.
  const volumes = await prisma.dataBookArquivo.count({ where: { dataBookId: book.id, revisao: book.revisao } });
  if (!volumes) {
    return NextResponse.json(
      { success: false, error: `Nenhum volume gerado na revisão R${String(book.revisao).padStart(2, "0")}. Gere o PDF do rascunho antes de mandar para conferência.` },
      { status: 409 },
    );
  }

  // ── O PORTAL, RESOLVIDO AQUI MESMO ──────────────────────────────────────────────────────────
  // Vitor (31/08/2026): "fui enviar para o cliente e diz que a obra não tem cliente definido; como
  // posso fazer? Cria um campo para informar o e-mail do cliente e, de acordo com o cadastro de
  // e-mail, já enviar para o portal dele".
  //
  // Antes eu mandava a Qualidade sair daqui, ir ao Comercial publicar o portal da obra e voltar —
  // três telas para uma coisa só. Agora o e-mail digitado aqui resolve tudo: publica o portal se
  // ele não existir, cadastra o destinatário e dispara o link.
  //
  // ⚠⚠ PORTAL NOVO NASCE SÓ COM O DATA BOOK. As dez seções do portal são `padrao: true` — publicar
  // com o padrão entregaria de uma vez cronograma, LPC, LE, compras, fotos e documentos a um
  // cliente que só foi chamado para conferir um dossiê. Quem decide abrir o resto é o Comercial,
  // na tela dele. Se o portal JÁ existe, respeito a configuração que está lá e só garanto que a
  // seção do Data Book esteja ligada.
  const corpo = await req.json().catch(() => ({}));
  const emailCliente = limparTextoCurto(corpo?.clienteEmail || "", 160).trim();
  const nomeCliente = limparTextoCurto(corpo?.clienteNome || "", 120).trim();

  let portal = await prisma.portalCliente.findFirst({
    where: { opNumero: book.opNumero },
    select: { id: true, token: true, secoes: true, status: true, clienteEmail: true, publicadoEm: true, criadoPorId: true },
  });

  if (!portal) {
    if (!emailCliente) {
      return NextResponse.json(
        { success: false, error: "Esta obra ainda não tem portal do cliente. Informe o e-mail de quem vai conferir e eu publico o portal só com o Data Book." },
        { status: 409 },
      );
    }
    portal = await prisma.portalCliente.create({
      data: {
        opNumero: book.opNumero, token: gerarTokenForte(32), status: "PUBLICADO",
        secoes: ["DATABOOK"], publicadoEm: new Date(), criadoPorId: user.id, clienteEmail: emailCliente,
      },
      select: { id: true, token: true, secoes: true, status: true, clienteEmail: true, publicadoEm: true, criadoPorId: true },
    });
  } else {
    // ⚠⚠ PORTAL EM RASCUNHO NUNCA FOI VISTO POR NINGUÉM — publicá-lo daqui herdando o padrão
    // entregaria as dez seções de uma vez. Foi o caso da OP-106: portal criado, `secoes` em branco.
    // Se ninguém configurou, publico só com o Data Book; o resto o Comercial abre quando quiser.
    const nuncaConfigurado = !Array.isArray(portal.secoes);
    const secoes = nuncaConfigurado && portal.status !== "PUBLICADO" ? [] : secoesDoPortal(portal);
    const precisaLigar = !secoes.includes("DATABOOK");
    const precisaPublicar = portal.status !== "PUBLICADO";
    // ⚠ PORTAL EM RASCUNHO PODE ESTAR SEM TOKEN — é o caso da OP-106. Sem gerar aqui, o link
    // sairia como "/portal/null" no e-mail do cliente. O token existente nunca é trocado: portal é
    // endereço, e trocar faria o cliente perder o que já tinha salvo.
    const precisaToken = !portal.token;
    if (precisaLigar || precisaPublicar || precisaToken) {
      portal = await prisma.portalCliente.update({
        where: { id: portal.id },
        data: {
          // ⚠ acrescenta a seção, não substitui a lista: desligar o que o Comercial abriu seria
          // tirar do cliente algo que ele já via.
          ...(precisaLigar ? { secoes: [...secoes, "DATABOOK"] } : {}),
          ...(precisaToken ? { token: gerarTokenForte(32) } : {}),
          ...(precisaPublicar ? { status: "PUBLICADO", publicadoEm: portal.publicadoEm || new Date(), criadoPorId: portal.criadoPorId || user.id } : {}),
          ...(emailCliente ? { clienteEmail: emailCliente } : {}),
        },
        select: { id: true, token: true, secoes: true, status: true, clienteEmail: true, publicadoEm: true, criadoPorId: true },
      });
    }
  }

  // ⚠ SEM DESTINO, O AVISO NÃO SAI. O portal pode existir e ninguém saber o endereço — foi
  // exatamente o caso da OP-106. Ou vem e-mail no formulário, ou já existe destinatário cadastrado.
  const destino = emailCliente || portal.clienteEmail || null;
  const jaTemDestinatario = await prisma.portalDestinatario.count({ where: { portalId: portal.id } });
  if (!destino && !jaTemDestinatario) {
    return NextResponse.json(
      { success: false, error: "Informe o e-mail de quem vai conferir — sem isso o cliente não recebe o link do portal." },
      { status: 400 },
    );
  }

  const atualizado = await prisma.dataBookQualidade.update({
    where: { id: book.id },
    data: {
      // ⚠ o `status` NÃO muda: o livro continua o rascunho que é, e continua editável. Quem diz
      // que há conferência em aberto é o `avaliacaoEnviadaEm` — e é ele que o portal consulta.
      avaliacaoEnviadaEm: new Date(),
      // reenviar limpa o parecer anterior: o que vale é a leitura desta rodada
      avaliacaoOkEm: null, avaliacaoOkNome: null, avaliacaoOkIp: null, avaliacaoObs: null,
    },
    select: { status: true, avaliacaoEnviadaEm: true },
  });

  // ── O AVISO AO CLIENTE ──────────────────────────────────────────────────────────────────────
  // ⚠ CADA PESSOA COM O SEU CÓDIGO (?d=), como no portal do Comercial: é o que permite dizer depois
  // QUEM conferiu, em vez de "alguém abriu". Reenviar para o mesmo e-mail reaproveita o código —
  // senão o histórico de quem já abriu se partiria em duas pessoas a cada rodada.
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
  const link = `${base}/portal/${portal.token}`;
  let enviado = false;
  if (destino) {
    const jaTem = await prisma.portalDestinatario.findFirst({ where: { portalId: portal.id, email: destino } });
    const dest = jaTem
      ? await prisma.portalDestinatario.update({
          where: { id: jaTem.id },
          data: { enviadoEm: new Date(), enviadoPorNome: user.name || user.email || null, nome: nomeCliente || jaTem.nome },
        })
      : await prisma.portalDestinatario.create({
          data: {
            portalId: portal.id, opNumero: book.opNumero, email: destino, nome: nomeCliente || null,
            codigo: `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`,
            enviadoEm: new Date(), enviadoPorNome: user.name || user.email || null,
          },
        });
    const linkPessoal = `${link}?d=${dest.codigo}`;
    const obra = fmtOP(book.opNumero);
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Data Book para conferência")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
        <p style="margin:0 0 12px">Olá${dest.nome ? `, <strong>${dest.nome}</strong>` : ""},</p>
        <p style="margin:0 0 14px">
          Montamos o data book da <strong>${obra}</strong> e, antes de emitir o documento definitivo,
          gostaríamos que você conferisse as informações.
        </p>
        <p style="margin:0 0 14px">
          O que está no portal é o <strong>rascunho</strong> — a capa e o nome do arquivo trazem essa
          marca. Depois do seu retorno emitimos o dossiê, ele passa pelas assinaturas e a versão
          final volta para o mesmo endereço.
        </p>
        <p style="text-align:center;margin:24px 0">
          <a href="${linkPessoal}" style="background:#006EAB;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Conferir o data book</a>
        </p>
        <p style="margin:0;color:#5b6b7a;font-size:12px">
          Se o botão não funcionar, copie e cole no navegador:<br>
          <span style="color:#006EAB;word-break:break-all">${linkPessoal}</span>
        </p>
      </div>
    </div>`;
    const res = await sendEmail({
      to: destino,
      subject: `Data book da ${obra} para conferência · Torg Metal`,
      html,
      text: `Confira o rascunho do data book da ${obra} antes de emitirmos: ${linkPessoal}`,
      replyTo: user.email || undefined,
    }).catch(() => ({ ok: false }));
    enviado = !!res?.ok;
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "DATABOOK_ENVIAR_AVALIACAO_CLIENTE", entity: "DataBookQualidade", entityId: book.id,
      diff: { opNumero: book.opNumero, revisao: book.revisao, volumes, destino, enviado, portalId: portal.id },
    },
  }).catch(() => {});

  return NextResponse.json({
    success: true, status: atualizado.status, volumes, enviado, destino,
    link: `/portal/${portal.token}`,
  });
}
