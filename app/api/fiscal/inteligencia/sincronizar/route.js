import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { reservarVez, comTravaDeCron } from "@/lib/cron-trava";
import { baixarTipi, baixarNcm } from "@/lib/fiscal/fonte-oficial";
import { importarTipi, promover, guardarArtefato } from "@/lib/fiscal/importar-tipi";
import { importarNcm, promoverNcm } from "@/lib/fiscal/importar-ncm";
import { log } from "@/lib/log";

// "Verificar atualizações" — o botão do ADMIN, para não esperar o cron das 4h30.
const registro = log("api/fiscal/sincronizar");
export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

// ⚠⚠ QUINZE MINUTOS ENTRE CLIQUES, E O MOTIVO É A FONTE, NÃO O PORTAL. O Siscomex permite
// **3 acessos por hora** (PUCX-ER1001, documentado por eles). Um botão sem trava, clicado três
// vezes por curiosidade, queima a cota inteira — e quem paga é o cron da madrugada, que encontra
// a porta fechada e deixa a referência sem verificação por mais um dia.
// ⚠ A trava é contada do INÍCIO: aqui a rodada leva segundos, não os 111s do sincronismo de Prazos
// (onde reservar no início deixava 10s de espera real).
const INTERVALO_MS = 15 * 60 * 1000;

async function anotar(fonte, fn, userId) {
  const sinc = await prisma.fiscalSincronizacao.create({ data: { fonte, disparo: "MANUAL", status: "RODANDO", disparadaPorId: userId } });
  try {
    const r = await fn();
    await prisma.fiscalSincronizacao.update({
      where: { id: sinc.id },
      data: { status: r.status, terminadaEm: new Date(), sha256Visto: r.sha256 ?? null, versaoId: r.versaoId ?? null, mensagem: r.mensagem ?? null },
    });
    return r;
  } catch (e) {
    await prisma.fiscalSincronizacao.update({
      where: { id: sinc.id }, data: { status: "FALHOU", terminadaEm: new Date(), mensagem: e.message.slice(0, 400) },
    }).catch(() => {});
    return { status: "FALHOU", mensagem: e.message };
  }
}

async function rodarTipi(userId) {
  const b = await baixarTipi();
  if (b.erro) return { status: "FALHOU", mensagem: b.erro };
  const wb = XLSX.read(b.conteudo, { type: "buffer" });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const r = await importarTipi({ baixado: b, linhasDaPlanilha: linhas });
  if (r.semMudanca) return { status: "SEM_MUDANCA", sha256: b.sha256, versaoId: r.versao.id, mensagem: "Conteúdo idêntico ao já importado — nada a atualizar." };
  if (r.rejeitada) return { status: "FALHOU", sha256: b.sha256, versaoId: r.versao.id, mensagem: r.recusas.slice(0, 3).map((x) => x.motivo).join(" | ") };
  // ⚠ Promove só o que passou LIMPO — versão com recusa fica para o ADMIN olhar, não entra no ar.
  const p = await promover(r.versao.id, { aprovadoPorId: userId });
  return { status: "IMPORTADA", sha256: b.sha256, versaoId: r.versao.id, mensagem: p.erro ?? `${r.gravadas} linhas · ${r.versao.totalNcm} NCMs` };
}

async function rodarNcm() {
  const b = await baixarNcm();
  // ⚠ Teto da fonte não é falha: a referência ativa continua valendo (ver o cron).
  if (b.limite) return { status: "SEM_MUDANCA", mensagem: b.erro };
  if (b.erro) return { status: "FALHOU", mensagem: b.erro };
  const r = await importarNcm({ baixado: b, guardarArtefato });
  if (r.semMudanca) return { status: "SEM_MUDANCA", sha256: b.sha256, versaoId: r.versao.id, mensagem: "Conteúdo idêntico ao já importado." };
  if (r.rejeitada) return { status: "FALHOU", sha256: b.sha256, versaoId: r.versao.id, mensagem: r.recusas.slice(0, 3).map((x) => x.motivo).join(" | ") };
  const p = await promoverNcm(r.versao.id);
  return { status: "IMPORTADA", sha256: b.sha256, versaoId: r.versao.id, mensagem: p.erro ?? `${r.gravadas} códigos` };
}

export async function POST() {
  let user;
  try {
    // ⚠⚠ SÓ ADMIN. Consultar é do módulo FISCAL; TROCAR o que o portal serve como alíquota oficial
    // é outra coisa — e o briefing é explícito em não deixar usuário comum mexer nisso.
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const vez = await reservarVez(prisma, "fiscal-manual", INTERVALO_MS);
  if (!vez.ok) {
    return NextResponse.json({
      success: false,
      error: `A fonte oficial limita as consultas. Tente de novo em ${Math.ceil((vez.faltamSegundos ?? 900) / 60)} min.`,
    }, { status: 429 });
  }

  // ⚠⚠ COMPARTILHA A TRAVA COM O CRON. Sem isso, o botão seria exatamente o cenário que a trava
  // existe para evitar: a pessoa clica quando desconfia do automático, ou seja, perto do horário
  // dele — e as duas rodadas chegariam à promoção com duas candidatas.
  const r = await comTravaDeCron(prisma, "fiscal-fontes", async () => ({
    tipi: await anotar("TIPI", () => rodarTipi(user.id), user.id),
    ncm: await anotar("NCM", rodarNcm, user.id),
  }));
  if (!r) return NextResponse.json({ success: false, ocupada: true, error: "Uma verificação já está em andamento." }, { status: 409 });

  registro.info("manual:", user.email, "· TIPI", r.tipi.status, "· NCM", r.ncm.status);
  return NextResponse.json({ success: true, ...r });
}
