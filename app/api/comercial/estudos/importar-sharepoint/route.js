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
import { listarLqcs, escolherPorOrcamento, baixarLqc, decidirImportacao } from "@/lib/lqc-sharepoint";
import { registrarExecucao } from "@/lib/cron-monitor";
import { importarLqc } from "@/lib/lqc-importar";
import { calcularLqc } from "@/lib/lqc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const ROLES = ["ADMIN", "COMERCIAL"];

async function processar(ano, aplicar, user, { forcar = [] } = {}) {
  // ⚠ `forcar`: números cujo estudo do portal DEVE ser sobrescrito pela planilha mesmo sendo mais
  // recente — Vitor (16/09/2026) sobre o 81: "pode sobrescrever a 81 pois a que fizemos no portal
  // foi para apenas testar". É decisão de quem sabe o que tem dentro, por isso vem no pedido.
  const forcados = new Set((Array.isArray(forcar) ? forcar : []).map(Number).filter(Boolean));
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
    // ⚠ ESTUDO MONTADO À MÃO NÃO É SOBRESCRITO, e estudo importado e depois TRABALHADO no portal
    // também não: a planilha só passa por cima se for mais nova que a última mexida
    // (`decidirImportacao`, com o porquê lá). (A primeira guarda testava uma flag `custosEditados`
    // que não existe; a segunda só olhava `origemSharePoint` e ia sobrescrever o 81 em 16/09/2026.)
    const decisao = jaTem && forcados.has(numero) ? { acao: "atualizar", motivo: "forçado no pedido" } : decidirImportacao(jaTem, escolhida);
    if (decisao.acao === "pulado") {
      resumo.pulados++;
      detalhe.push({ numero, arquivo: escolhida.nome, acao: "pulado", motivo: decisao.motivo });
      continue;
    }

    detalhe.push({
      numero, arquivo: escolhida.nome, revisao: escolhida.revisao,
      acao: decisao.acao,
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
      if (!lido) {
        // ⚠ PLANILHA SEM A ABA DE RESUMO NÃO É ERRO DE LEITURA — é uma LQC salva pela metade (ou um
        // teste, como a 299-26 em 16/09/2026). Como "erro" ela acusava no heartbeat a cada hora;
        // como "pulado" fica visível no detalhe, com o motivo, sem gritar.
        if (/n[ãa]o tem a aba de resumo/i.test(ultimoErro || "")) {
          resumo.pulados++;
          detalhe[detalhe.length - 1] = { numero, arquivo: escolhida.nome, acao: "pulado", motivo: `planilha sem a aba de resumo — ${ultimoErro}` };
          continue;
        }
        resumo.erros.push({ numero, arquivo: escolhida.nome, erro: ultimoErro || "não deu para ler" }); continue;
      }
      if (usada.id !== escolhida.id) resumo.erros.push({ numero, arquivo: escolhida.nome, aviso: `ilegível — usei ${usada.nome}` });

      // ⚠⚠ O PREÇO DO AÇO PRECISA CHEGAR AQUI, SENÃO O ESTUDO NASCE SEM A MAIOR PARCELA DO CUSTO.
      // Vitor (30/08/2026): "os custos das obras estão errados; no caso da Orca o preço sugerido
      // está em 3,68 o kg". A matéria-prima vinha zerada em 56 dos 57 estudos.
      //
      // Preferência: preço POR ÁREA (quando a INDUSTRIALIZAÇÃO é organizada assim) e, na falta
      // dele, o R$/kg blendado da linha "MATÉRIA PRIMA" — que é o mesmo com que a planilha fecha
      // o próprio subtotal, não um número inventado aqui.
      const precoAco = (area) => lido.precosPorArea?.[area] ?? lido.precoMateriaPrima ?? null;
      const resumos = lido.resumos.map((r) => ({ ...r, precoKg: precoAco(r.area) }));
      const composicao = {
        resumos, tintas: lido.tintas || [], origemSharePoint: usada.nome,
        ...(lido.fixadoresRsKg ? { fixadoresRsKg: lido.fixadoresRsKg } : {}),
        // sem o BDI o cálculo fecha com preço = custo, e a tela mostra CUSTO chamando de preço
        ...(lido.bdi && Object.keys(lido.bdi).length ? { bdi: lido.bdi } : {}),
        // ⚠ NÃO entra na conta — entra como CONFERÊNCIA. É o valor que foi ao cliente; tê-lo ao
        // lado do que o portal calcula é o que denuncia na hora um custo que saiu errado.
        ...(lido.precoPlanilha ? { precoPlanilha: lido.precoPlanilha } : {}),
        // ⚠⚠ OS TRÊS BLOCOS DA PLANILHA, SEPARADOS. Auditoria de 05/09/2026: comparar o preço do
        // portal com o TOTAL GERAL da planilha era comparar escopos diferentes — o total soma
        // fornecimento + itens comerciais + montagem, e o portal só calcula o primeiro. Guardar o
        // subtotal de cada bloco é o que permite conferir o que dá para conferir e deixar visível
        // o que o estudo ainda não modela (montagem em campo).
        ...(lido.blocosPlanilha ? { blocosPlanilha: lido.blocosPlanilha } : {}),
        // ⚠ E OS ITENS COMERCIAIS AGORA ENTRAM NA CONTA. O motor já tinha o cadastro (telha, calha,
        // rufo, grade, steel deck, linha de vida) e a planilha já traz quantidade e preço unitário
        // — a importação simplesmente descartava. Na LQC-253 são R$ 4,76 milhões que ficavam fora.
        ...(lido.itensComerciais && Object.keys(lido.itensComerciais).length
          ? { itensComerciais: lido.itensComerciais }
          : {}),
        // ⚠ e a MONTAGEM EM CAMPO, lida pelo CUSTO (colunas MONTAGEM e DESPESAS E CANTEIRO) — a
        // coluna "Unit. R$" da planilha já tem BDI dentro, e importá-la como custo dobraria o preço.
        ...(lido.montagem ? { montagem: lido.montagem } : {}),
      };
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

// ⚠⚠ O CRON DA VERCEL DISPARA GET, NÃO POST (mesma lição da importação de orçamentos). Vitor
// (16/09/2026): "as LQCs vc está atualizando? pois está puxando a última dia 09/09" — esta rota só
// existia como chamada manual e ninguém chamava: a última importação foi 30/08 e 17 LQCs novas
// ficaram no SharePoint sem estudo. Para GENTE o GET continua sendo SIMULAÇÃO; só o cron aplica.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  const doCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!doCron) {
    try { await requireRole(ROLES); }
    catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getUTCFullYear();
  try {
    const r = await processar(ano, doCron, null);
    if (doCron && (r.criados > 0 || r.atualizados > 0)) {
      // registra só quando MUDOU — uma linha por hora dizendo "nada" enterraria as importações de verdade
      await prisma.auditLog.create({
        data: { userId: null, action: "IMPORTAR_LQC_SHAREPOINT", entity: "EstudoFabricacao",
                entityId: String(ano), diff: { criados: r.criados, atualizados: r.atualizados, pulados: r.pulados, erros: r.erros.length, porCron: true } },
      }).catch(() => {});
    }
    if (doCron) await registrarExecucao("lqc-sharepoint", { ok: true, mensagem: `${r.criados || 0} novo(s) · ${r.atualizados || 0} atualizado(s) · ${r.pulados || 0} pulado(s)${r.erros.length ? ` · ${r.erros.length} erro(s)` : ""}` });
    return NextResponse.json({ simulacao: !doCron, ...r });
  } catch (e) {
    if (doCron) await registrarExecucao("lqc-sharepoint", { ok: false, mensagem: e.message });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const body = await req.json().catch(() => ({}));
  const ano = Number(body.ano) || new Date().getUTCFullYear();
  try {
    const forcar = Array.isArray(body.forcar) ? body.forcar.map(Number).filter(Boolean) : [];
    const r = await processar(ano, true, user, { forcar });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "IMPORTAR_LQC_SHAREPOINT", entity: "EstudoFabricacao",
              entityId: String(ano), diff: { criados: r.criados, atualizados: r.atualizados, pulados: r.pulados, erros: r.erros.length, ...(forcar.length ? { forcar } : {}) } },
    }).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
