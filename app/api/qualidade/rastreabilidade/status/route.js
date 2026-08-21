// GET  /api/qualidade/rastreabilidade/status  — o que falta de certificado, por OP. Ao vivo.
// POST /api/qualidade/rastreabilidade/status  — casa os que a varredura achou.
//
// Vitor (19/08/2026): "preciso ficar anexando a pasta de rastreabilidade e atualizando na aba
// rastreabilidade, queria tirar isso. Quero algo dinâmico, e sempre que abro essa tela ficam
// justamente os certificados que faltam alguma coisa".
//
// O fluxo antigo era: colar o link da pasta → pré-visualizar → confirmar. Um passo manual por
// obra, repetido a cada digitalização nova. E olhava UMA pasta só, então "faltava sempre alguma
// coisa" mesmo quando o arquivo existia noutra.
//
// Agora a tela abre e mostra o estado: quantos certificados o CMR pede, quantos têm arquivo,
// e quais faltam de verdade — separando o que o portal CONSEGUE resolver sozinho do que
// realmente não existe no servidor. São coisas diferentes e exigem ações diferentes: uma é um
// clique, a outra é cobrar o Almoxarifado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { indiceCertificados, limparCacheCertificados } from "@/lib/rastreabilidade-certificados";

export const runtime = "nodejs";
export const maxDuration = 120;

const PERFIS = ["ADMIN", "QUALIDADE", "PRODUCAO", "ENGENHARIA"];

async function levantar(forcar) {
  const { indice, arquivos, pastas } = await indiceCertificados(forcar);

  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, origem: "importacao_planilha", importRef: { not: null } },
    select: { id: true, importRef: true, sharepointItemId: true, opNumero: true, nome: true, numeroDocumento: true },
  });

  const porOp = new Map();
  for (const d of docs) {
    const chave = d.opNumero || "(sem OP)";
    const g = porOp.get(chave) || {
      opNumero: d.opNumero || null,
      total: 0, comArquivo: 0, achaveis: 0, faltando: 0,
      // ⚠ três estados, não dois: "tem", "dá pra achar" e "não existe". Juntar os dois últimos
      // esconde o que resolve com um clique dentro do que precisa de cobrança.
      itensAchaveis: [], itensFaltando: [],
    };
    g.total++;
    if (d.sharepointItemId) g.comArquivo++;
    else {
      const achou = indice.get(String(d.importRef));
      if (achou?.length) {
        g.achaveis++;
        if (g.itensAchaveis.length < 200) {
          g.itensAchaveis.push({
            id: d.id, r: d.importRef, nome: d.nome,
            arquivo: achou[0].nome, pasta: achou[0].pasta,
            duplicado: achou.length > 1 ? achou.length : null,
          });
        }
      } else {
        g.faltando++;
        if (g.itensFaltando.length < 200) {
          g.itensFaltando.push({ id: d.id, r: d.importRef, nome: d.nome, numeroDocumento: d.numeroDocumento || null });
        }
      }
    }
    porOp.set(chave, g);
  }

  const ops = [...porOp.values()]
    .map((g) => ({ ...g, pct: g.total > 0 ? Math.round((g.comArquivo / g.total) * 100) : null }))
    // quem tem mais buraco primeiro — é onde o data book vai travar
    .sort((a, b) => (b.achaveis + b.faltando) - (a.achaveis + a.faltando));

  return {
    ops,
    totais: {
      documentos: docs.length,
      comArquivo: docs.filter((d) => d.sharepointItemId).length,
      achaveis: ops.reduce((s, o) => s + o.achaveis, 0),
      faltando: ops.reduce((s, o) => s + o.faltando, 0),
    },
    servidor: { arquivos: arquivos.length, pastas: pastas.length, indices: indice.size, listaPastas: pastas },
    geradoEm: new Date().toISOString(),
  };
}

export async function GET(req) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const forcar = new URL(req.url).searchParams.get("recarregar") === "1";
  try {
    return NextResponse.json(await levantar(forcar));
  } catch (e) {
    return NextResponse.json({ error: `Falha ao ler o servidor: ${e.message}` }, { status: 502 });
  }
}

/** Vincula os certificados que a varredura encontrou. Sem colar link, sem escolher pasta. */
export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body = {};
  try { body = await req.json(); } catch { /* sem corpo = todas as OPs */ }
  const alvoOp = body?.opNumero || null;

  const { indice } = await indiceCertificados(false);
  const docs = await prisma.documentoQualidade.findMany({
    where: {
      ativo: true, origem: "importacao_planilha",
      importRef: { not: null }, sharepointItemId: null,
      ...(alvoOp ? { opNumero: alvoOp } : {}),
    },
    select: { id: true, importRef: true },
  });

  let casados = 0;
  for (const d of docs) {
    const achou = indice.get(String(d.importRef));
    if (!achou?.length) continue;
    // ⚠ com duplicata, fica o MAIS RECENTE: certificado redigitalizado costuma ser correção do
    // anterior. A tela mostra que havia mais de um, pra ninguém achar que a escolha foi cega.
    const a = [...achou].sort((x, y) => new Date(y.modificadoEm || 0) - new Date(x.modificadoEm || 0))[0];
    await prisma.documentoQualidade.update({
      where: { id: d.id },
      data: { sharepointItemId: a.id, arquivoUrl: a.url || null },
    });
    casados++;
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CASAR_CERTIFICADOS_VARREDURA", entity: "DocumentoQualidade", entityId: alvoOp || "todas", diff: { opNumero: alvoOp, casados, avaliados: docs.length } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, casados, avaliados: docs.length });
}

export async function DELETE() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  limparCacheCertificados();
  return NextResponse.json({ ok: true });
}
