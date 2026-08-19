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
    where: { origem: "importacao_planilha", importRef: { in: refs } },
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
  try {
    const r = await sincronizar(null);
    // Com o CMR recém-atualizado, concilia o recebimento do Portal de Compras: material que o
    // Almoxarifado lançou hoje deixa de aparecer como "aguardando entrega". Nunca derruba a sync
    // do CMR — se a conciliação falhar, o CMR já está gravado e ela tenta de novo amanhã.
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
    return NextResponse.json({ ok: true, ...r, conciliacao, suprimentos });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
