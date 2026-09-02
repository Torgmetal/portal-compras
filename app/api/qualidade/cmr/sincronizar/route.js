// Sincroniza o CMR (planilha de rastreabilidade do Almoxarifado) → DocumentoQualidade.
// Serve pro BOTÃO "atualizar agora" e pro CRON diário: acha a planilha atual no SharePoint
// (o nome muda de ano/versão), parseia e cria só as linhas NOVAS (dedupe por importRef).
// É daqui que sai o status de compra por OP no PCP. (Vitor 18/08.)
import { NextResponse } from "next/server";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { baixarCmrAtual } from "@/lib/sharepoint";
import { parseCMR } from "@/lib/parse-cmr";
import { conciliarRecebimentoCmr } from "@/lib/recebimento-cmr";
import { aplicarAvancoSuprimentos } from "@/lib/cronograma-suprimentos";
import { DO_CMR } from "@/lib/cmr-origens";
import { registrarExecucao } from "@/lib/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 300; // planilha de ~17MB: download + parse passam de 60s
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "QUALIDADE", "COMPRAS", "PCP", "PLANEJAMENTO"];

async function sincronizar(userId) {
  const { name, modificadoEm, buffer } = await baixarCmrAtual();
  const parsed = await parseCMR(buffer);
  if (!parsed.ok) throw new Error(parsed.erro || "Não consegui ler a planilha.");

  const refs = parsed.linhas.map((l) => l.importRef).filter(Boolean);
  const existentes = await prisma.documentoQualidade.findMany({
    where: { ...DO_CMR, importRef: { in: refs } },
    select: { importRef: true },
  });
  const jaTem = new Set(existentes.map((e) => e.importRef));
  const novas = parsed.linhas.filter((l) => l.importRef && !jaTem.has(l.importRef));

  const data = novas.map((l) => ({
    nome: String(l.nome).slice(0, 300),
    categoria: "MATERIAL",
    tipo: l.tipo,
    norma: l.norma ? String(l.norma).slice(0, 200) : null,
    vinculo: l.obra ? String(l.obra).slice(0, 200) : null,
    opNumero: l.opNumero,
    numeroCorrida: l.numeroCorrida ? String(l.numeroCorrida).slice(0, 100) : null,
    numeroDocumento: l.numeroDocumento ? String(l.numeroDocumento).slice(0, 100) : null,
    fornecedor: l.fornecedor ? String(l.fornecedor).slice(0, 200) : null,
    observacao: l.observacao ? String(l.observacao).slice(0, 500) : null,
    pedidoCompra: l.pedidoCompra || null,
    nfNumero: l.nfNumero || null,
    dataRecebimento: l.dataRecebimento || null,
    pesoKg: l.pesoKg ?? null,
    quantidade: l.quantidade ?? null,
    origem: "importacao_planilha",
    importRef: l.importRef,
    createdById: userId || null,
  }));

  let criados = 0;
  for (let i = 0; i < data.length; i += 200) {
    const res = await prismaDirect.documentoQualidade.createMany({ data: data.slice(i, i + 200) });
    criados += res.count;
  }
  return { arquivo: name, modificadoEm, linhasPlanilha: parsed.linhas.length, novas: novas.length, criados };
}

// Botão "Atualizar agora"
export async function POST() {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  try {
    const r = await sincronizar(user.id);
    await prisma.auditLog.create({ data: { userId: user.id, action: "SINCRONIZAR_CMR", entity: "DocumentoQualidade", entityId: r.arquivo, diff: r } }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Falha ao sincronizar o CMR" }, { status: 502 });
  }
}

// Cron diário (Vercel) — protegido pelo CRON_SECRET, igual aos outros crons do portal.
export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const t0 = Date.now();
  // ⚠⚠ A CONCILIAÇÃO NÃO PODE SER REFÉM DO DOWNLOAD. Medido em 02/09/2026: o último recebimento de
  // origem CMR é de **19/08** — o dia em que a rotina nasceu. De lá pra cá o Almoxarifado lançou e
  // o Portal de Compras continuou dizendo "aguardando entrega" em 74 itens de 11 OPs (75.936 kg).
  // O Vitor viu pelo lado do cliente: o portal da OP-112 mostrava "Comprado" numa linha que já
  // trazia data de chegada e R.
  //
  // A causa é a ordem: `sincronizar()` baixa uma planilha de ~17MB do SharePoint e, se ela falha,
  // o `try` inteiro cai no catch e a conciliação — que é só banco, não depende de rede nenhuma —
  // nunca roda. Uma tarefa barata e confiável estava pendurada numa cara e frágil.
  //
  // Agora são passos independentes: o download pode falhar que a conciliação roda assim mesmo,
  // sobre o CMR que já está gravado.
  let r = null, erroSync = null;
  try { r = await sincronizar(null); }
  catch (e) { erroSync = e?.message || "falhou"; }

  try {
    // Material que o Almoxarifado lançou deixa de aparecer como "aguardando entrega".
    let conciliacao = null;
    try {
      const c = await conciliarRecebimentoCmr({ simular: false });
      conciliacao = c.resumo;
    } catch (e) {
      conciliacao = { erro: e?.message || "falhou" };
    }
    // Com o recebimento conciliado, as linhas de Suprimentos do cronograma andam sozinhas
    // (Vitor 19/08: "isso deve ser automático"). Mesmo molde do avanço da Fabricação pelo Syneco.
    let suprimentos = null;
    try {
      const ops = await prisma.cronograma.findMany({ where: { ativo: true, opId: { not: null } }, select: { opId: true }, distinct: ["opId"] });
      let n = 0, linhas = 0;
      for (const o of ops) {
        const a = await aplicarAvancoSuprimentos(prisma, o.opId).catch(() => null);
        if (a?.atualizadas) { n++; linhas += a.atualizadas; }
      }
      suprimentos = { ops: n, linhas };
    } catch (e) {
      suprimentos = { erro: e?.message || "falhou" };
    }
    // ⚠⚠ HEARTBEAT. Este cron não registrava execução e não estava na lista do monitor — foi por
    // isso que ele pôde parar em 19/08 sem ninguém saber. O monitor existe exatamente pra isso.
    const msg = [erroSync ? `sync FALHOU: ${erroSync}` : `${r?.criados ?? 0} linha(s) nova(s)`,
                 conciliacao?.erro ? `conciliação FALHOU: ${conciliacao.erro}` : `${conciliacao?.itens ?? 0} recebimento(s)`].join(" · ");
    await registrarExecucao("cmr-sincronizar", { ok: !erroSync && !conciliacao?.erro, mensagem: msg, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: !erroSync, erroSync, ...(r || {}), conciliacao, suprimentos });
  } catch (e) {
    await registrarExecucao("cmr-sincronizar", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
