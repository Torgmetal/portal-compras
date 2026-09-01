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
import { conferir } from "@/lib/rastreio-tratativa";
import { DO_CMR } from "@/lib/cmr-origens";

export const runtime = "nodejs";
export const maxDuration = 120;

const PERFIS = ["ADMIN", "QUALIDADE", "PRODUCAO", "ENGENHARIA"];

// ⚠ MATERIAL QUE AINDA NÃO CHEGOU NÃO É PENDÊNCIA. Vitor (22/08/2026): "as que está em aberto
// por conta de estar aguardando chegar ainda, que são das OPs novas, aí você deve deixar em
// branco por hora para não fazermos cagada". Cobrar certificado de aço que ainda está na
// transportadora produziria alarme falso todo dia — e alarme falso é o que faz a equipe parar de
// olhar a tela. Esses itens aparecem contados à parte, fora da conta de cobertura.
async function aguardandoChegar() {
  const itens = await prisma.rMItem.findMany({
    where: { status: { in: ["PENDENTE", "EM_COTACAO", "COTADO", "PEDIDO_GERADO"] } },
    select: {
      rm: { select: { op: { select: { numero: true } } } },
      pedidoOmie: { select: { dataEntregaReal: true, statusEntrega: true } },
      recebimentos: { select: { id: true }, take: 1 },
    },
  });
  const porOp = new Map();
  for (const it of itens) {
    const ped = it.pedidoOmie;
    const chegou = it.recebimentos.length > 0 || !!ped?.dataEntregaReal ||
      ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(ped?.statusEntrega);
    if (chegou) continue;
    const op = it.rm?.op?.numero;
    if (!op) continue;
    porOp.set(op, (porOp.get(op) || 0) + 1);
  }
  return porOp;
}

async function levantar(forcar) {
  const { indice, arquivos, pastas } = await indiceCertificados(forcar);

  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, ...DO_CMR, importRef: { not: null } },
    select: {
      id: true, importRef: true, sharepointItemId: true, opNumero: true, nome: true,
      numeroDocumento: true, numeroCorrida: true, nfNumero: true, pedidoCompra: true,
      dataRecebimento: true, fornecedor: true,
    },
    orderBy: { importRef: "asc" },
  });

  const tratativas = new Map(
    (await prisma.rastreioTratativa.findMany()).map((t) => [String(t.importRef), t])
  );
  const aguardando = await aguardandoChegar();

  // Um R "tem certificado" se está vinculado ou se o servidor tem o arquivo. Serve também para
  // conferir o R de origem apontado numa tratativa de estoque.
  const comCertificado = new Set();
  for (const d of docs) if (d.sharepointItemId) comCertificado.add(String(d.importRef));

  const temArquivoDe = (r) => comCertificado.has(String(r)) || indice.has(String(r));

  const porOp = new Map();
  for (const d of docs) {
    const chave = d.opNumero || "(sem OP)";
    const g = porOp.get(chave) || {
      opNumero: d.opNumero || null,
      total: 0, emDia: 0, tratados: 0, pendentes: 0, achaveis: 0,
      aguardandoCompra: d.opNumero ? (aguardando.get(d.opNumero) || 0) : 0,
      itens: [],
    };

    const vinculado = !!d.sharepointItemId;
    const achado = vinculado ? null : indice.get(String(d.importRef));
    const achavel = !!achado?.length;
    const t = tratativas.get(String(d.importRef)) || null;
    const r = conferir(d, {
      temArquivo: vinculado || achavel,
      achavel,
      tratativa: t,
      origemTemCertificado: t?.rOrigem ? temArquivoDe(t.rOrigem) : false,
    });

    g.total++;
    if (r.situacao === "EM_DIA") g.emDia++;
    else if (r.situacao === "TRATADO") g.tratados++;
    else g.pendentes++;
    if (achavel) g.achaveis++;

    // ⚠ o que precisa de gente vem primeiro; o que já está em dia enche a lista sem informar.
    if (g.itens.length < 250 && r.situacao !== "EM_DIA") {
      g.itens.push({
        id: d.id, r: d.importRef, nome: d.nome, fornecedor: d.fornecedor || null,
        certificado: d.numeroDocumento || null, corrida: d.numeroCorrida || null,
        nf: d.nfNumero || null, pedido: d.pedidoCompra || null, data: d.dataRecebimento || null,
        situacao: r.situacao, faltas: r.faltas, lacunas: r.lacunas, achavel: r.achavel,
        arquivo: achado?.length ? { nome: achado[0].nome, pasta: achado[0].pasta, duplicado: achado.length > 1 ? achado.length : null } : null,
        tratativa: t ? { situacao: t.situacao, rOrigem: t.rOrigem, observacao: t.observacao, em: t.registradoEm } : null,
      });
    }
    porOp.set(chave, g);
  }

  const ops = [...porOp.values()]
    .map((g) => ({ ...g, pct: g.total > 0 ? Math.round((g.emDia / g.total) * 100) : null }))
    // quem tem mais buraco primeiro — é onde o data book vai travar
    .sort((a, b) => (b.pendentes + b.tratados) - (a.pendentes + a.tratados));

  return {
    ops,
    totais: {
      documentos: docs.length,
      emDia: ops.reduce((s, o) => s + o.emDia, 0),
      tratados: ops.reduce((s, o) => s + o.tratados, 0),
      pendentes: ops.reduce((s, o) => s + o.pendentes, 0),
      achaveis: ops.reduce((s, o) => s + o.achaveis, 0),
      aguardandoCompra: [...aguardando.values()].reduce((s, n) => s + n, 0),
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
      ativo: true, ...DO_CMR,
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
