import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { importarLegislacao, dispositivoPorRotulo } from "@/lib/fiscal/importar-legislacao";
import { RESSALVA_POR_PESO } from "@/lib/fiscal/fontes-legislacao";

// A base jurídica: o texto oficial que sustenta cada recomendação do módulo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) { return negado(e); }

  const { searchParams } = new URL(req.url);
  const norma = searchParams.get("norma");
  const rotulo = searchParams.get("rotulo");

  // ⚠⚠ A CITAÇÃO VERIFICÁVEL: o fundamento deixa de ser uma frase minha e vira um trecho com
  // rótulo, hash e data de coleta. É o que o briefing chama de rastreabilidade — a contabilidade
  // consegue conferir cada recomendação contra o texto que o portal guardou.
  if (norma && rotulo) {
    const d = await dispositivoPorRotulo(norma, rotulo);
    if (!d) return NextResponse.json({ success: false, error: "Dispositivo não encontrado na versão ativa." }, { status: 404 });
    return NextResponse.json({ success: true, dispositivo: d, ressalva: RESSALVA_POR_PESO[d.peso] ?? null });
  }

  const normas = await prisma.fiscalNorma.findMany({
    orderBy: [{ tipo: "asc" }, { chave: "asc" }],
    include: {
      versoes: {
        where: { status: "ATIVA" },
        select: { id: true, sha256: true, bytes: true, coletadoEm: true, conferido: true, faltam: true, _count: { select: { dispositivos: true } } },
        take: 1,
      },
      _count: { select: { versoes: true } },
    },
  });
  return NextResponse.json({
    success: true,
    normas: normas.map((n) => ({
      chave: n.chave, tipo: n.tipo, peso: n.peso, orgao: n.orgao, titulo: n.titulo,
      norma: n.norma, url: n.url, assunto: n.assunto,
      // ⚠ A ressalva viaja com o documento: uma Resposta à Consulta não vincula outros
      // contribuintes, e isso não pode ficar num rodapé da tela.
      ressalva: RESSALVA_POR_PESO[n.peso] ?? null,
      versoes: n._count.versoes,
      ativa: n.versoes[0]
        ? { sha256: n.versoes[0].sha256, bytes: n.versoes[0].bytes, coletadoEm: n.versoes[0].coletadoEm,
            conferido: n.versoes[0].conferido, dispositivos: n.versoes[0]._count.dispositivos }
        : null,
    })),
  });
}

const corpo = z.object({ chaves: z.array(z.string().max(60)).max(20).optional() });

export async function POST(req) {
  let sessao;
  try {
    // ⚠⚠ COLETAR LEGISLAÇÃO É ATO DE ADMINISTRADOR, não de quem consulta. Quem lê o art. 406 usa o
    // GET; trocar a base que fundamenta os apontamentos é outra coisa.
    sessao = await requireAcesso({ tipos: ["ADMIN"] });
  } catch (e) { return negado(e); }

  let body = {};
  try {
    body = corpo.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  // ⚠ Mesmo orçamento do cron: a rota tem 60 s, e o lote precisa caber neles ou dizer o que ficou.
  const r = await importarLegislacao({ chaves: body.chaves ?? null, ateMs: Date.now() + 50_000 });
  await prisma.auditLog.create({
    data: {
      action: "SINCRONIZAR_LEGISLACAO", entity: "FiscalNorma", entityId: "legislacao",
      userId: sessao?.user?.id ?? null,
      metadata: { total: r.total, processadas: r.processadas, importadas: r.importadas, reativadas: r.reativadas, semMudanca: r.semMudanca, falhas: r.falhas.map((f) => f.chave), naoProcessadas: r.naoProcessadas },
    },
  }).catch(() => {});
  return NextResponse.json({ success: true, ...r });
}
