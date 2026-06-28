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
import { registrarExecucao } from "@/lib/cron-monitor";

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

async function sincronizarMes({ targetDate }) {
  const { buffer, path } = await downloadPlanilhaProducao(targetDate);
  const parsed = parseEapProducao(buffer, { mesIdx: targetDate.getMonth() });

  let criados = 0, atualizados = 0;
  for (const it of parsed.itens) {
    const data = new Date(it.data + "T12:00:00");
    const existente = await prisma.producaoSemanal.findFirst({
      where: { data, opId: null, setor: it.setor, fonte: "SHAREPOINT" },
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
          setor: it.setor,
          observacao: it.observacao,
          fonte: "SHAREPOINT",
        },
      });
      criados++;
    }
  }

  return { parsed, path, criados, atualizados };
}

async function executarSync({ userId = null, mesesAtras = 0 } = {}) {
  const inicio = Date.now();
  const agora = new Date();
  // Gera lista de datas: hoje, hoje - 1 mes, hoje - 2 meses, ... (incluindo o atual)
  const targets = [];
  for (let i = 0; i <= mesesAtras; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 15);
    targets.push(d);
  }

  let criadosTotal = 0, atualizadosTotal = 0;
  const sumario = [];
  const erros = [];
  // Paraleliza o download+parse+upsert de cada mês (independentes entre si)
  const resultados = await Promise.allSettled(targets.map((targetDate) => sincronizarMes({ targetDate })));
  for (let i = 0; i < targets.length; i++) {
    const res = resultados[i];
    const targetDate = targets[i];
    if (res.status === "fulfilled") {
      const r = res.value;
      criadosTotal += r.criados;
      atualizadosTotal += r.atualizados;
      sumario.push(`${r.parsed.mes}: ${r.parsed.diasComDado}d/${r.parsed.setoresExtraidos.length}set (${r.criados}+/${r.atualizados}~)`);
    } else {
      const nomeMes = targetDate.toLocaleString("pt-BR", { month: "long" });
      erros.push(`${nomeMes}: ${res.reason?.message ?? "erro desconhecido"}`);
    }
  }

  if (erros.length === targets.length) {
    // Tudo falhou
    const log = await prisma.sharepointSync.create({
      data: {
        tipo: "PCP_PRODUCAO",
        sucesso: false,
        erro: erros.join(" | "),
        duracaoMs: Date.now() - inicio,
        executadoPorId: userId,
      },
    });
    return { ok: false, error: erros.join(" | "), ...log };
  }

  const log = await prisma.sharepointSync.create({
    data: {
      tipo: "PCP_PRODUCAO",
      sucesso: true,
      itensProcessados: criadosTotal + atualizadosTotal,
      criados: criadosTotal,
      atualizados: atualizadosTotal,
      mensagem: sumario.join(" | ") + (erros.length ? ` | ERROS: ${erros.join(" ; ")}` : ""),
      duracaoMs: Date.now() - inicio,
      executadoPorId: userId,
    },
  });
  return { ok: true, ...log, erros };
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
  const mesesAtras = Math.max(0, Math.min(12, Number(body.mesesAtras) || 0));
  const result = await executarSync({ userId: user.id, mesesAtras });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// GET: sync via Vercel Cron
export async function GET(req) {
  // Auth: user-agent vercel-cron OU Bearer CRON_SECRET (padrão dos crons).
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await executarSync();
  await registrarExecucao("sync-sharepoint", { ok: !!result.ok, mensagem: result.ok ? null : result.error });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
