// GET  /api/comercial/orcamento/importar-sharepoint?ano=2026  — SIMULA (não grava nada)
// POST /api/comercial/orcamento/importar-sharepoint  { ano }  — aplica
//
// Vitor (29/08/2026): "preciso que atualize no portal as propostas que estão no SharePoint, trata
// todas elas e atualize nossa central de orçamentos".
//
// ⚠⚠ SIMULA ANTES DE GRAVAR. São 283 linhas mexendo na Central de Orçamentos inteira; o GET
// devolve exatamente o que mudaria, campo a campo, sem tocar no banco. Importação em massa que só
// tem o botão "aplicar" é como se descobre o erro depois dele estar gravado.
//
// ⚠ VAZIO NÃO APAGA. Só os campos preenchidos na planilha entram no update (`semVazios`): o portal
// guarda coisa que a planilha não tem — o vínculo com a OP, as observações — e uma célula em
// branco quer dizer "não preenchi", nunca "apague".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";
import { caminhoRelatorio, linhaParaOrcamento, compararOrcamento } from "@/lib/orcamentos-relatorio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROLES = ["ADMIN", "COMERCIAL"];
const GRAPH = "https://graph.microsoft.com/v1.0";
const ABA = "Orçamentos";

/** Baixa a planilha do ano e devolve as linhas da aba "Orçamentos" já convertidas. */
async function lerPlanilha(ano) {
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const caminho = caminhoRelatorio(ano);
  const r = await fetch(`${GRAPH}/drives/${drive}/root:${encodeURI(caminho)}:/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Planilha não encontrada no SharePoint (${r.status}) — ${caminho}`);
  const buffer = Buffer.from(await r.arrayBuffer());

  // ⚠ SheetJS, não ExcelJS: a planilha tem 5 abas e só uma interessa. Mesmo motivo do import do
  // CMR, onde o ExcelJS estourava a memória lendo o arquivo inteiro.
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[ABA];
  if (!ws) throw new Error(`A planilha não tem a aba "${ABA}" (tem: ${wb.SheetNames.join(", ")})`);
  const linhas = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  return linhas.map((l) => linhaParaOrcamento(l, ano)).filter(Boolean);
}

async function processar(ano, aplicar, userId) {
  const doSharePoint = await lerPlanilha(ano);
  const numeros = doSharePoint.map((o) => o.numero);
  const existentes = await prisma.orcamento.findMany({
    where: { numero: { in: numeros } },
    include: { revisoes: { select: { numero: true } } },
  });
  const porNumero = new Map(existentes.map((o) => [o.numero, o]));

  const resumo = { ano, linhas: doSharePoint.length, criados: 0, atualizados: 0, iguais: 0, revisoes: 0, correcoes: [], erros: [] };
  const detalhe = [];

  for (const novo of doSharePoint) {
    // ano digitado errado na planilha, corrigido e RELATADO — nunca em silêncio
    for (const c of novo.correcoes || []) resumo.correcoes.push(`${novo.numero} ${c}`);
    const atual = porNumero.get(novo.numero);
    const { acao, dados, mudancas } = compararOrcamento(novo, atual);
    // revisões que ainda não estão no portal (por número da revisão)
    const jaTem = new Set((atual?.revisoes || []).map((r) => r.numero));
    const revsNovas = (novo.revisoes || []).filter((r) => !jaTem.has(r.numero));

    if (acao === "igual" && !revsNovas.length) { resumo.iguais++; continue; }
    detalhe.push({ numero: novo.numero, cliente: novo.cliente, acao, mudancas, revisoes: revsNovas.length });

    if (!aplicar) {
      if (acao === "criar") resumo.criados++; else if (acao === "atualizar") resumo.atualizados++;
      resumo.revisoes += revsNovas.length;
      continue;
    }

    try {
      const orc = atual
        ? await prisma.orcamento.update({ where: { id: atual.id }, data: dados })
        : await prisma.orcamento.create({ data: { ...dados, numero: novo.numero, criadoPorId: userId || null } });
      if (acao === "criar") resumo.criados++; else if (acao === "atualizar") resumo.atualizados++;
      for (const rv of revsNovas) {
        await prisma.orcamentoRevisao.create({
          data: { orcamentoId: orc.id, numero: rv.numero, dataEnvio: rv.dataEnvio, observacao: rv.observacao },
        });
        resumo.revisoes++;
      }
    } catch (e) {
      resumo.erros.push({ numero: novo.numero, erro: e.message });
    }
  }
  return { ...resumo, detalhe };
}

// ⚠⚠ O CRON DA VERCEL DISPARA **GET**, não POST — por isso a importação automática vive aqui e não
// no POST. Cron apontado para rota que só tem POST devolve 405 e falha em silêncio; foi o primeiro
// jeito que eu escrevi, e não teria funcionado nunca.
//
// ⚠ Para GENTE o GET continua sendo SIMULAÇÃO — é a rede que o arquivo inteiro descreve lá em cima
// ("simula antes de gravar", 283 linhas mexendo na central). Só a chamada do cron aplica.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  const doCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!doCron) {
    try { await requireRole(ROLES); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getUTCFullYear();
  try {
    const r = await processar(ano, doCron, null);
    if (doCron && (r.criados > 0 || r.atualizados > 0 || r.revisoes > 0)) {
      // ⚠ registra só quando MUDOU: uma linha por hora dizendo "nada mudou" enterraria as
      // importações de verdade no log de auditoria.
      await prisma.auditLog.create({
        data: { userId: null, action: "IMPORTAR_ORCAMENTOS_SHAREPOINT", entity: "Orcamento",
                entityId: String(ano), diff: { criados: r.criados, atualizados: r.atualizados, revisoes: r.revisoes, porCron: true } },
      }).catch(() => {});
    }
    return NextResponse.json({ simulacao: !doCron, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

// ⚠⚠ TAMBÉM RODA POR CRON. Vitor (01/09/2026): "quando eu insiro uma proposta na planilha do
// servidor, ele não está atualizando dentro do workspace". A causa era simples e invisível: esta
// importação SÓ existia como botão. Todo o resto do portal que lê fonte externa tem cron (Omie,
// CMR, Syneco, GRD, engenharia); esta não tinha — então a planilha só chegava aqui se alguém
// lembrasse de clicar, e quem insere a proposta no Excel não tem por que saber disso.
//
// ⚠ O cron é seguro porque a importação já é IDEMPOTENTE e não apaga nada: campo vazio na planilha
// não sobrescreve (`semVazios`), e o que o portal guarda a mais — vínculo com a OP, observações —
// sobrevive. Rodar de hora em hora não é diferente de clicar de hora em hora.
export async function POST(req) {
  const auth = req.headers.get("authorization");
  const doCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  let user = null;
  if (!doCron) {
    try { user = await requireRole(ROLES); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  }
  const body = await req.json().catch(() => ({}));
  const ano = Number(body.ano) || new Date().getUTCFullYear();
  try {
    const r = await processar(ano, true, user?.id || null);
    // ⚠ o cron só registra quando MUDOU alguma coisa: uma linha por hora dizendo "nada mudou"
    // enterraria as importações de verdade no log de auditoria.
    if (!doCron || r.criados > 0 || r.atualizados > 0 || r.revisoes > 0) {
      await prisma.auditLog.create({
        data: { userId: user?.id || null, action: "IMPORTAR_ORCAMENTOS_SHAREPOINT", entity: "Orcamento",
                entityId: String(ano), diff: { criados: r.criados, atualizados: r.atualizados, revisoes: r.revisoes, porCron: doCron } },
      }).catch(() => {});
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
