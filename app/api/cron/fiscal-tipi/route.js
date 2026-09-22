import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma, prismaDirect } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { comTravaDeCron } from "@/lib/cron-trava";
import { registrarExecucao } from "@/lib/cron-monitor";
import { baixarTipi, baixarNcm } from "@/lib/fiscal/fonte-oficial";
import { importarTipi, promover, guardarArtefato } from "@/lib/fiscal/importar-tipi";
import { importarNcm, promoverNcm } from "@/lib/fiscal/importar-ncm";
import { log } from "@/lib/log";

// Verificação diária das fontes oficiais (TIPI + NCM).
//
// ⚠⚠ "SEM MUDANÇA" É RESULTADO, NÃO FALHA — e é o caminho da esmagadora maioria dos dias. O SHA-256
// do arquivo é comparado antes de qualquer leitura: igual, registra a verificação e encerra. Sem
// isso, uma versão por dia seriam ~4 milhões de linhas por ano guardando o mesmo conteúdo.
//
// ⚠⚠ FALHA NÃO APAGA A REFERÊNCIA ANTERIOR. A versão ativa continua servindo e a tela passa a dizer
// desde quando não se consegue verificar. O que não pode é apresentar a antiga como comprovadamente
// atual — por isso o registro da tentativa é gravado mesmo quando dá errado.
//
// ⚠ As duas fontes são INDEPENDENTES: o Siscomex fora do ar não impede a TIPI de atualizar. Meia
// sincronização informada é melhor que nenhuma sincronização explicada (a lição do botão de Prazos).
const registro = log("api/cron/fiscal-tipi");
export const runtime = "nodejs";
export const maxDuration = 180;

async function anotar(fonte, disparo, fn, disparadaPorId = null) {
  const sinc = await prisma.fiscalSincronizacao.create({ data: { fonte, disparo, status: "RODANDO", disparadaPorId } });
  try {
    const r = await fn();
    await prisma.fiscalSincronizacao.update({
      where: { id: sinc.id },
      data: {
        status: r.status, terminadaEm: new Date(),
        sha256Visto: r.sha256 ?? null, versaoId: r.versaoId ?? null, mensagem: r.mensagem ?? null,
      },
    });
    return r;
  } catch (e) {
    // ⚠ O registro da FALHA é o que permite a tela dizer "não verifico desde X" em vez de silêncio.
    await prisma.fiscalSincronizacao.update({
      where: { id: sinc.id }, data: { status: "FALHOU", terminadaEm: new Date(), mensagem: e.message.slice(0, 400) },
    }).catch(() => {});
    return { status: "FALHOU", mensagem: e.message };
  }
}

async function rodarTipi() {
  const b = await baixarTipi();
  if (b.erro) return { status: "FALHOU", mensagem: b.erro };
  const wb = XLSX.read(b.conteudo, { type: "buffer" });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const r = await importarTipi({ baixado: b, linhasDaPlanilha: linhas });
  if (r.semMudanca) return { status: "SEM_MUDANCA", sha256: b.sha256, versaoId: r.versao.id, mensagem: "Conteúdo idêntico ao já importado." };
  if (r.rejeitada) return { status: "FALHOU", sha256: b.sha256, versaoId: r.versao.id, mensagem: `Validação recusou: ${r.recusas.slice(0, 3).map((x) => x.motivo).join(" | ")}` };
  // ⚠ Só promove o que passou LIMPO na validação. Com recusas, a versão fica VALIDADA=false e o
  // ADMIN decide — promover automaticamente uma leitura duvidosa é o oposto do ponto.
  const p = await promover(r.versao.id);
  return { status: "IMPORTADA", sha256: b.sha256, versaoId: r.versao.id, mensagem: p.erro ?? `${r.gravadas} linhas · ${r.versao.totalNcm} NCMs` };
}

async function rodarNcm() {
  const b = await baixarNcm();
  if (b.erro) return { status: "FALHOU", mensagem: b.erro };
  const r = await importarNcm({ baixado: b, guardarArtefato });
  if (r.semMudanca) return { status: "SEM_MUDANCA", sha256: b.sha256, versaoId: r.versao.id, mensagem: "Conteúdo idêntico ao já importado." };
  if (r.rejeitada) return { status: "FALHOU", sha256: b.sha256, versaoId: r.versao.id, mensagem: r.recusas.slice(0, 3).map((x) => x.motivo).join(" | ") };
  const p = await promoverNcm(r.versao.id);
  return { status: "IMPORTADA", sha256: b.sha256, versaoId: r.versao.id, mensagem: p.erro ?? `${r.gravadas} códigos` };
}

export async function GET() {
  // ⚠ Cold start do Neon: o PRIMEIRO query de um cron estoura antes de a compute acordar.
  await aquecerBanco(prismaDirect);
  // ⚠⚠ Trava contra execução simultânea: duas importações concorrentes chegariam na promoção com
  // duas candidatas. O índice parcial é o backstop; isto evita gastar o download à toa.
  const t0 = Date.now();
  const r = await comTravaDeCron(prisma, "fiscal-fontes", async () => {
    const tipi = await anotar("TIPI", "CRON", rodarTipi);
    const ncm = await anotar("NCM", "CRON", rodarNcm);
    registro.info("fiscal: TIPI", tipi.status, "· NCM", ncm.status);
    return { tipi, ncm };
  });
  // ⚠ `comTravaDeCron` devolve `null` quando outra execução já tem a vez — isso é sucesso, não erro.
  if (!r) return NextResponse.json({ success: true, ocupada: true });

  // ⚠⚠ O PONTO É BATIDO MESMO QUANDO A FONTE FALHA — senão o cron "congela" e o monitor alerta
  // todo dia por não ter notícia dele, quando na verdade ele rodou e a Receita é que não respondeu.
  // ⚠ "SEM_MUDANCA" é sucesso: é o caminho normal da esmagadora maioria dos dias.
  const falhou = r.tipi.status === "FALHOU" && r.ncm.status === "FALHOU";
  await registrarExecucao("fiscal-fontes", {
    ok: !falhou, duracaoMs: Date.now() - t0,
    mensagem: `TIPI ${r.tipi.status} · NCM ${r.ncm.status}`,
  }).catch(() => {});
  return NextResponse.json({ success: true, ...r });
}
