// GET  /api/comercial/estudos/importar-sharepoint?ano=2026  — SIMULA
// POST /api/comercial/estudos/importar-sharepoint  { ano }  — aplica
//
// Vitor (29/08/2026): "em várias propostas mais recentes você vai encontrar a LQC, já poderíamos
// usar isso para termos o estudo e conseguirmos criar os cenários financeiros".
//
// ⚠⚠ TRAZ O QUANTITATIVO, NÃO O CUSTO. É o mesmo corte do importador manual da LQC: medir a
// estrutura e separar por área é trabalho de engenharia feito uma vez, no Excel, com o projeto na
// mão; o custo muda toda semana e é onde o portal serve. Por isso a importação preenche áreas,
// pesos e esquema de pintura — e deixa o preço para ser fechado aqui dentro.
//
// ⚠ NÃO SOBRESCREVE ESTUDO COM TRABALHO DENTRO. Se o estudo daquele orçamento já existe e alguém
// já mexeu na composição pelo portal, a planilha não passa por cima: entra na lista de "pulados",
// com o motivo. Importação em massa que apaga trabalho manual é pior que importação nenhuma.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { listarLqcs, escolherPorOrcamento, baixarLqc } from "@/lib/lqc-sharepoint";
import { importarLqc } from "@/lib/lqc-importar";
import { calcularLqc } from "@/lib/lqc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const ROLES = ["ADMIN", "COMERCIAL"];

async function processar(ano, aplicar, user) {
  const { lqcs, ignorados } = await listarLqcs(ano);
  const escolhidas = escolherPorOrcamento(lqcs);

  // os orçamentos do ano, para casar pelo número (283 → "283-26")
  const aa = String(ano).slice(-2);
  const orcamentos = await prisma.orcamento.findMany({
    where: { numero: { endsWith: `-${aa}` } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const porNumero = new Map(orcamentos.map((o) => [Number(String(o.numero).split("-")[0]), o]));

  const jaExistem = await prisma.estudoFabricacao.findMany({
    where: { ano },
    select: { id: true, numero: true, orcamentoId: true, composicao: true, updatedAt: true },
  });
  const estudoDe = new Map(jaExistem.map((e) => [e.numero, e]));

  const resumo = { ano, planilhas: lqcs.length, orcamentosComLqc: escolhidas.size,
                   criados: 0, atualizados: 0, pulados: 0, semOrcamento: 0, erros: [] };
  const detalhe = [];

  for (const [numero, { escolhida, outras }] of escolhidas) {
    const orc = porNumero.get(numero);
    const jaTem = estudoDe.get(numero);

    if (!orc) {
      resumo.semOrcamento++;
      detalhe.push({ numero, arquivo: escolhida.nome, acao: "sem orçamento", motivo: `não existe ${numero}-${aa} na central` });
      continue;
    }
    // ⚠ ESTUDO MONTADO À MÃO NÃO É SOBRESCRITO. Quem veio de importação carrega
    // `composicao.origemSharePoint`; quem não carrega foi construído aqui dentro, por alguém, e a
    // planilha não passa por cima disso. (Primeira versão desta guarda testava uma flag
    // `custosEditados` que não existe no portal — protegia nada e parecia proteger.)
    const feitoNoPortal = jaTem?.composicao && Object.keys(jaTem.composicao).length > 0 && !jaTem.composicao.origemSharePoint;
    if (feitoNoPortal) {
      resumo.pulados++;
      detalhe.push({ numero, arquivo: escolhida.nome, acao: "pulado", motivo: "estudo montado no portal — a planilha não sobrescreve" });
      continue;
    }

    detalhe.push({
      numero, arquivo: escolhida.nome, revisao: escolhida.revisao,
      acao: jaTem ? "atualizar" : "criar",
      orcamento: orc.numero, cliente: orc.cliente,
      outrasVersoes: outras.map((o) => o.nome),
    });
    if (!aplicar) { if (jaTem) resumo.atualizados++; else resumo.criados++; continue; }

    try {
      // ⚠ SE A ESCOLHIDA NÃO ABRIR, TENTA AS OUTRAS VERSÕES. A LQC-227-26-DANPOWER R01 não tem a
      // aba RESUMOS_EM (foi salva no meio do trabalho); a R00 tem. Descartar a obra inteira porque
      // a revisão mais nova está pela metade seria perder um levantamento que existe ao lado.
      let lido = null, usada = null, ultimoErro = null;
      for (const cand of [escolhida, ...outras]) {
        try {
          const r = importarLqc(await baixarLqc(cand.id));
          if (r.ok) { lido = r; usada = cand; break; }
          ultimoErro = r.erro;
        } catch (e) { ultimoErro = e.message; }
      }
      if (!lido) { resumo.erros.push({ numero, arquivo: escolhida.nome, erro: ultimoErro || "não deu para ler" }); continue; }
      if (usada.id !== escolhida.id) resumo.erros.push({ numero, arquivo: escolhida.nome, aviso: `ilegível — usei ${usada.nome}` });

      const resumos = lido.resumos.map((r) => ({ ...r, precoKg: lido.precosPorArea?.[r.area] ?? null }));
      const composicao = { resumos, tintas: lido.tintas || [], origemSharePoint: usada.nome };
      const resultado = calcularLqc(composicao);
      const dados = {
        ano, numero, revisao: usada.revisao || 0,
        cliente: orc.cliente, obra: orc.obra || null, orcamentoId: orc.id,
        metodo: resumos[0]?.metodo || "ESTIMATIVA",
        composicao, resultado,
      };
      if (jaTem) { await prisma.estudoFabricacao.update({ where: { id: jaTem.id }, data: dados }); resumo.atualizados++; }
      else { await prisma.estudoFabricacao.create({ data: { ...dados, criadoPorId: user?.id || null, criadoPorNome: user?.name || null } }); resumo.criados++; }
    } catch (e) {
      resumo.erros.push({ numero, arquivo: escolhida.nome, erro: e.message });
    }
  }
  return { ...resumo, ignorados, detalhe };
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getUTCFullYear();
  try { return NextResponse.json({ simulacao: true, ...(await processar(ano, false, null)) }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const body = await req.json().catch(() => ({}));
  const ano = Number(body.ano) || new Date().getUTCFullYear();
  try {
    const r = await processar(ano, true, user);
    await prisma.auditLog.create({
      data: { userId: user.id, action: "IMPORTAR_LQC_SHAREPOINT", entity: "EstudoFabricacao",
              entityId: String(ano), diff: { criados: r.criados, atualizados: r.atualizados, erros: r.erros.length } },
    }).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
