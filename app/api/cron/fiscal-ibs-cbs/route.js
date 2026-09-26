// Cron Vercel — aprende as regras de IBS/CBS das NF-e de saída de ONTEM (lib/fiscal/coleta-ibs-cbs).
// ⚠ Só ontem: a gravação SOMA as notas, então a janela nunca pode se sobrepor à do dia anterior.
// A reconstrução completa do ano é o botão (POST /api/fiscal/inteligencia/regras-ibs-cbs).
import { NextResponse } from "next/server";
import { prisma, prismaDirect } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { temCronSecret } from "@/lib/cron-auth";
import { coletarRegrasIbsCbs, gravarRegras } from "@/lib/fiscal/coleta-ibs-cbs";
import { log } from "@/lib/log";

const registro = log("api/cron/fiscal-ibs-cbs");
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Ontem em São Paulo, "dd/mm/aaaa" — o dia de quem emite, não o UTC. */
const ontemEmSP = () => {
  const d = new Date(Date.now() - 24 * 3600 * 1000);
  const [a, m, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d).split("-");
  return `${dia}/${m}/${a}`;
};

export async function GET(req) {
  if (!temCronSecret(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const dia = ontemEmSP();
    const { notas, regras } = await coletarRegrasIbsCbs({ de: dia, ate: dia });
    await gravarRegras(regras, prismaDirect);
    const mensagem = `${dia}: ${notas} NF(s) · ${regras.length} regra(s)`;
    await registrarExecucao("fiscal-ibs-cbs", { ok: true, mensagem, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: true, notas, regras: regras.length });
  } catch (e) {
    registro.erro("[cron fiscal-ibs-cbs] erro:", e?.message);
    await registrarExecucao("fiscal-ibs-cbs", { ok: false, mensagem: e?.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
