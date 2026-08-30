// GET  /api/comercial/orcamento/emails-sharepoint?ano=2026 — SIMULA
// POST /api/comercial/orcamento/emails-sharepoint { ano }  — aplica
//
// Puxa a correspondência que o Comercial já arquiva dentro da pasta de cada orçamento
// (`.../<nnn-aa-CLIENTE-OBRA>/1.Emails/*.eml`) e amarra ao orçamento — que é o nome da pasta.
//
// ⚠⚠ POR QUE AQUI E NÃO NA CAIXA. Vitor pediu um agente nas caixas do comercial. Elas estão
// BLOQUEADAS (403 "Blocked by tenant configured AppOnly Access Policy" em comercial@, orcamento@ e
// matheus.lima@ — só as 6 da engenharia estão liberadas, e isso depende do Matheus). E, mesmo
// liberadas, casar e-mail com orçamento por regra erra muito: testado nos 359 e-mails que o portal
// já tem, o número do orçamento no assunto deu 4 acertos com 3 falsos, e o contato do cliente
// aponta para vários orçamentos ao mesmo tempo (o Rogério Porsch, da TMSA, tem 19).
//
// A pasta resolve os dois problemas de uma vez: o SharePoint eu leio, e o vínculo já foi feito por
// uma pessoa que tinha a obra na frente. O agente de caixa entra depois, para o que não foi
// arquivado — e vai ter a thread destes aqui como âncora.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { pastasDoAno, emailsArquivados, lerCabecalhoEml } from "@/lib/emails-orcamento-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const ROLES = ["ADMIN", "COMERCIAL"];
const ehTorg = (e) => /@torg\.com\.br$/i.test(String(e || ""));

async function processar(ano, aplicar) {
  const pastas = await pastasDoAno(ano);
  const numeros = [...pastas.keys()];
  const orcamentos = await prisma.orcamento.findMany({
    where: { numero: { in: numeros } },
    select: { id: true, numero: true, cliente: true, contato: true, dataSolicitada: true },
  });
  const porNumero = new Map(orcamentos.map((o) => [o.numero, o]));

  const resumo = { ano, pastas: pastas.size, comEmail: 0, eventos: 0, novos: 0,
                   solicitacoesDatadas: 0, semOrcamento: [], erros: [] };
  const detalhe = [];

  for (const [numero, { caminho, fase }] of pastas) {
    const orc = porNumero.get(numero);
    if (!orc) { resumo.semOrcamento.push(numero); continue; }

    let arquivos = [];
    try { arquivos = await emailsArquivados(caminho); }
    catch (e) { resumo.erros.push({ numero, erro: e.message }); continue; }
    if (!arquivos.length) continue;
    resumo.comEmail++;

    let maisAntigoDoCliente = null;
    for (const a of arquivos) {
      let cab = null;
      try { cab = await lerCabecalhoEml(a.caminho); }
      catch (e) { resumo.erros.push({ numero, arquivo: a.nome, erro: e.message }); continue; }
      if (!cab) continue;
      resumo.eventos++;

      const entrada = !ehTorg(cab.de);
      // ⚠ a SOLICITAÇÃO é o e-mail mais antigo VINDO DE FORA. E-mail nosso na pasta costuma ser o
      // reenvio interno ("ENC: ORÇAMENTAÇÃO…"), que não é quando o cliente pediu.
      if (entrada && cab.data && (!maisAntigoDoCliente || cab.data < maisAntigoDoCliente)) maisAntigoDoCliente = cab.data;

      // ⚠ sem Message-ID (acontece) a chave vira o caminho do arquivo: a coluna é única, e sem
      // chave estável cada rodada gravaria o mesmo e-mail de novo.
      const chave = cab.messageId || `sharepoint:${a.caminho}`;
      detalhe.push({ numero, arquivo: a.nome, de: cab.de, assunto: cab.assunto,
                     data: cab.data, direcao: entrada ? "ENTRADA" : "SAIDA" });

      if (!aplicar) continue;
      try {
        const dados = {
          orcamentoId: orc.id, fonte: "SHAREPOINT", arquivo: a.nome,
          caixa: "sharepoint", pasta: fase,
          direcao: entrada ? "ENTRADA" : "SAIDA",
          de: cab.de, deNome: cab.deNome, para: cab.para || [], cc: cab.cc || [],
          assunto: cab.assunto, recebidoEm: entrada ? cab.data : null, enviadoEm: entrada ? null : cab.data,
        };
        const existe = await prisma.obraEmailEvento.findUnique({ where: { internetMessageId: chave }, select: { id: true } });
        if (existe) await prisma.obraEmailEvento.update({ where: { id: existe.id }, data: dados });
        else { await prisma.obraEmailEvento.create({ data: { ...dados, internetMessageId: chave } }); resumo.novos++; }
      } catch (e) { resumo.erros.push({ numero, arquivo: a.nome, erro: e.message }); }
    }

    // ⚠ E É AQUI QUE O ACOMPANHAMENTO GANHA DATA. `dataSolicitada` estava vazia em 141 dos 284
    // orçamentos, porque a planilha do Comercial registra "Data envio" e não a da solicitação — e
    // é ela que a aba de Acompanhamento usa para contar prazo. O e-mail do cliente diz o dia exato.
    //
    // ⚠ NÃO SOBRESCREVE o que já está preenchido: alguém pode ter corrigido à mão, e a data do
    // e-mail arquivado é indício forte, não decisão final.
    if (maisAntigoDoCliente && !orc.dataSolicitada) {
      resumo.solicitacoesDatadas++;
      if (aplicar) {
        await prisma.orcamento.update({ where: { id: orc.id }, data: { dataSolicitada: maisAntigoDoCliente } })
          .catch((e) => resumo.erros.push({ numero, erro: `data: ${e.message}` }));
      }
    }
  }
  return { ...resumo, detalhe };
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getUTCFullYear();
  try { return NextResponse.json({ simulacao: true, ...(await processar(ano, false)) }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number((await req.json().catch(() => ({}))).ano) || new Date().getUTCFullYear();
  try {
    const r = await processar(ano, true);
    await prisma.auditLog.create({
      data: { userId: user.id, action: "IMPORTAR_EMAILS_ORCAMENTO", entity: "Orcamento", entityId: String(ano),
              diff: { eventos: r.eventos, novos: r.novos, datas: r.solicitacoesDatadas } },
    }).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
