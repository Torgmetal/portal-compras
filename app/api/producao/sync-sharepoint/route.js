// Sync da planilha de PCP do SharePoint.
// - POST: sync manual (requer ADMIN ou PRODUCAO logado).
// - GET:  sync via Vercel Cron (requer header CRON_SECRET se configurado).
//
// Le a aba "EAP {Mes}" da planilha mensal, extrai pesos previsto/realizado
// do setor de Expedicao (cumulativos) e faz upsert em ProducaoSemanal.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { downloadPlanilhaProducao, getMesNomePt } from "@/lib/sharepoint";
import { parseEapProducao } from "@/lib/parse-pcp-eap";
import { isoWeekString, semanaInicio, semanaFim, parseSemana } from "@/lib/semana";

function rangeDaSemana(date) {
  const semana = isoWeekString(date);
  const p = parseSemana(semana);
  return {
    semana,
    dataInicio: semanaInicio(p.ano, p.semana),
    dataFim: semanaFim(p.ano, p.semana),
  };
}

export const runtime = "nodejs";
export const maxDuration = 60;

async function executarSync({ userId = null, setor = "Exped." } = {}) {
  const inicio = Date.now();
  const agora = new Date();
  try {
    const { buffer, path } = await downloadPlanilhaProducao(agora);
    const parsed = parseEapProducao(buffer, { setor, mesIdx: agora.getMonth() });

    let criados = 0, atualizados = 0;
    for (const it of parsed.itens) {
      const data = new Date(it.data + "T12:00:00");
      const existente = await prisma.producaoSemanal.findFirst({
        where: { data, opId: null, fonte: "SHAREPOINT" },
      });
      if (existente) {
        if (
          Math.abs(existente.pesoPrevistoKg - it.pesoPrevistoKg) > 0.01 ||
          Math.abs(existente.pesoRealizadoKg - it.pesoRealizadoKg) > 0.01
        ) {
          await prisma.producaoSemanal.update({
            where: { id: existente.id },
            data: {
              pesoPrevistoKg: it.pesoPrevistoKg,
              pesoRealizadoKg: it.pesoRealizadoKg,
              observacao: it.observacao,
            },
          });
          atualizados++;
        }
      } else {
        const range = rangeDaSemana(data);
        await prisma.producaoSemanal.create({
          data: {
            data,
            semana: range.semana,
            dataInicio: range.dataInicio,
            dataFim: range.dataFim,
            pesoPrevistoKg: it.pesoPrevistoKg,
            pesoRealizadoKg: it.pesoRealizadoKg,
            opId: null,
            observacao: it.observacao,
            fonte: "SHAREPOINT",
          },
        });
        criados++;
      }
    }

    const log = await prisma.sharepointSync.create({
      data: {
        tipo: "PCP_PRODUCAO",
        sucesso: true,
        itensProcessados: parsed.itens.length,
        criados,
        atualizados,
        mensagem: `${parsed.sheet} | Setor: ${parsed.setor} | Mês: ${parsed.mes} | Prev. total: ${parsed.totalPrevisto.toFixed(0)} kg | Real. total: ${parsed.totalRealizado.toFixed(0)} kg | Path: ${path}`,
        duracaoMs: Date.now() - inicio,
        executadoPorId: userId,
      },
    });
    return { ok: true, ...log, parsed: { sheet: parsed.sheet, mes: parsed.mes, setor: parsed.setor, total: parsed.itens.length } };
  } catch (e) {
    const log = await prisma.sharepointSync.create({
      data: {
        tipo: "PCP_PRODUCAO",
        sucesso: false,
        erro: e.message,
        duracaoMs: Date.now() - inicio,
        executadoPorId: userId,
      },
    });
    return { ok: false, error: e.message, ...log };
  }
}

// POST: sync manual disparado pela UI
export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await executarSync({ userId: user.id, setor: body.setor });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// GET: sync via Vercel Cron
export async function GET(req) {
  // Vercel Cron envia "Authorization: Bearer {CRON_SECRET}" se configurado.
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await executarSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
