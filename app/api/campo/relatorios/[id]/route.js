// GET   — abre um relatório para medir no celular.
// PATCH — grava o que o inspetor mediu.
//
// ⚠ O INSPETOR DE CAMPO SÓ ESCREVE O QUE MEDIU. Dimensão de projeto, tolerância, cotas marcadas e
// cabeçalho são de quem montou o relatório no computador — chegam prontos e não são editáveis aqui.
// É o desenho que o Vitor descreveu: "alguém cria as informações iniciais, o inspetor informa as
// medidas encontradas".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO, TIPO_LABEL } from "@/lib/qualidade-campo";
import { RESULTADOS, proximaRevisao, linhasReprovadas, rotuloRevisao } from "@/lib/revisao-inspecao";

export const runtime = "nodejs";

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id },
    select: {
      id: true, codigo: true, tipo: true, titulo: true, opNumero: true, marcas: true,
      linhas: true, resultados: true, equipamentos: true, inspetor: true, envioAssinaturaId: true,
      revisao: true, resultadoInspecao: true, revisoes: true,
    },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (rel.envioAssinaturaId) return NextResponse.json({ error: "Este relatório já foi enviado para assinatura." }, { status: 409 });

  return NextResponse.json({
    relatorio: {
      ...rel,
      tipoLabel: TIPO_LABEL[rel.tipo] || rel.tipo,
      rotuloRevisao: rotuloRevisao(rel.revisao),
      // ⚠ os índices reprovados na rodada anterior — é o que a tela destaca para o inspetor olhar
      // primeiro na reinspeção, sem ele ter de comparar dois documentos
      reprovadasAntes: (Array.isArray(rel.revisoes) && rel.revisoes.length)
        ? rel.revisoes[rel.revisoes.length - 1].reprovadas || []
        : [],
    },
  });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS_CAMPO); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id },
    select: {
      id: true, codigo: true, linhas: true, resultados: true, envioAssinaturaId: true,
      revisao: true, resultadoInspecao: true, revisoes: true, inspetor: true,
      tipo: true, opNumero: true, opId: true, marcas: true, rncId: true,
    },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (rel.envioAssinaturaId) return NextResponse.json({ error: "Este relatório já foi enviado para assinatura." }, { status: 409 });

  const body = await req.json().catch(() => ({}));

  // ── REINSPEÇÃO ──────────────────────────────────────────────────────────────────────────────
  //
  // Vitor: "na reinspeção o inspetor abre o relatório que estava reprovado e analisa os pontos
  // destacados que foram reprovados". Abrir a próxima revisão congela a rodada atual e limpa as
  // medidas — reinspeção é medir de novo, e o valor velho ao lado do campo faria alguém confirmar
  // sem medir.
  if (body.reinspecionar) {
    if (rel.resultadoInspecao !== "REPROVADO" && rel.resultadoInspecao !== "REC") {
      return NextResponse.json({ error: "Só relatório reprovado (ou com exame complementar) entra em reinspeção." }, { status: 409 });
    }
    const dados = proximaRevisao(rel, { por: user.name || null });
    const atualizado = await prisma.relatorioInspecao.update({ where: { id }, data: dados });

    // ⚠ a revisão que acabou de fechar vai para o data book como documento PRÓPRIO, ao lado da
    // vigente: é o que evidencia o retrabalho. Falhar aqui não pode impedir a reinspeção — o
    // vínculo se refaz depois, a medição no chão de fábrica não.
    const fechada = dados.revisoes[dados.revisoes.length - 1];
    const { anexarRevisaoNoDataBook } = await import("@/lib/relatorio-inspecao");
    const vinculo = await anexarRevisaoNoDataBook(rel, fechada)
      .catch((e) => ({ vinculado: false, motivo: e.message }));
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "REINSPECIONAR_RELATORIO", entity: "RelatorioInspecao", entityId: id,
        diff: { codigo: rel.codigo, de: rotuloRevisao(rel.revisao), para: rotuloRevisao(atualizado.revisao), vinculo },
      },
    }).catch(() => {});
    return NextResponse.json({ ok: true, revisao: atualizado.revisao, rotulo: rotuloRevisao(atualizado.revisao), vinculo });
  }

  const originais = Array.isArray(rel.linhas) ? rel.linhas : [];
  const medidas = Array.isArray(body.medidas) ? body.medidas : [];

  // ⚠ MESCLA POR ÍNDICE, não substitui a lista. Se o celular mandasse as linhas inteiras, uma versão
  // antiga aberta no bolso apagaria a cota que a Qualidade acabou de acrescentar no computador.
  const linhas = [...originais].map((l, i) => {
    const m = medidas.find((x) => x.i === i);
    if (!m) return l;
    const novo = { ...l };
    if (m.encontradoMm !== undefined) novo.encontradoMm = num(m.encontradoMm);
    if (m.laudo !== undefined) novo.laudo = m.laudo ? String(m.laudo).slice(0, 10) : null;
    if (m.descontinuidade !== undefined) novo.descontinuidade = m.descontinuidade ? String(m.descontinuidade).slice(0, 40) : null;
    if (m.obs !== undefined) novo.obs = m.obs ? String(m.obs).slice(0, 160) : null;
    // ⚠ campos da JUNTA: no visual de solda quem descobre a junta é quem está na frente dela, então
    // o campo escreve peça, EPS e soldador. No dimensional isso não vem — as cotas são definidas no
    // desenho, antes, e o celular só responde a medida.
    // ⚠ campos da INDICAÇÃO de ultrassom entram junto — o `c` e o `d` também, calculados na tela e
    // gravados: quem lê o relatório meses depois precisa do número que foi usado, não de refazer a
    // conta com uma fórmula que pode ter mudado de revisão.
    for (const k of ["marca", "descricao", "eps", "soldador", "sinete",
                     "indicacao", "angulo", "face", "comprimento", "percurso",
                     "db_indicacao", "db_referencia", "db_atenuacao", "db_classe",
                     "reprovado", "profundidade", "dist_x", "dist_y", "nivel"]) {
      if (m[k] !== undefined) novo[k] = m[k] ? String(m[k]).slice(0, 60) : null;
    }
    if (m.qtd !== undefined) novo.qtd = num(m.qtd);
    return novo;
  });

  // ⚠ juntas ACRESCENTADAS no celular vêm com índice além da lista original
  for (const m of medidas) {
    if (m.i < originais.length) continue;
    linhas[m.i] = {
      marca: m.marca ? String(m.marca).slice(0, 60) : null,
      qtd: num(m.qtd), descricao: m.descricao ? String(m.descricao).slice(0, 120) : null,
      eps: m.eps ? String(m.eps).slice(0, 60) : null,
      soldador: m.soldador ? String(m.soldador).slice(0, 60) : null,
      sinete: m.sinete ? String(m.sinete).slice(0, 20) : null,
      ...Object.fromEntries(["indicacao", "angulo", "face", "comprimento", "percurso",
        "db_indicacao", "db_referencia", "db_atenuacao", "db_classe",
        "reprovado", "profundidade", "dist_x", "dist_y", "nivel"]
        .map((k) => [k, m[k] ? String(m[k]).slice(0, 40) : null])),
      descontinuidade: m.descontinuidade ? String(m.descontinuidade).slice(0, 40) : null,
      laudo: m.laudo ? String(m.laudo).slice(0, 10) : null,
      obs: m.obs ? String(m.obs).slice(0, 160) : null,
    };
  }

  const dados = { linhas };
  if (Array.isArray(body.equipamentos)) {
    dados.equipamentos = body.equipamentos.slice(0, 20).map((e) => ({
      id: e?.id || null, nome: String(e?.nome || "").slice(0, 120),
      certificado: e?.certificado ? String(e.certificado).slice(0, 60) : null,
      validade: e?.validade ? String(e.validade).slice(0, 10) : null,
      vencido: !!e?.vencido,
    }));
  }
  // quem mediu assina o campo do inspetor, se ainda estiver vazio
  if (body.assumirInspetor) dados.inspetor = user.name || null;

  // ⚠ O RESULTADO GERAL É QUEM FECHA (ou não) O RELATÓRIO. Só APROVADO fecha: reprovado volta para
  // reparo e "exame complementar" ainda vai ter ensaio — nos dois o relatório continua aberto, que
  // é o que o Vitor pediu.
  if (body.resultadoInspecao !== undefined) {
    const r = String(body.resultadoInspecao || "").toUpperCase();
    dados.resultadoInspecao = RESULTADOS.includes(r) ? r : null;
  }
  // ── CONDIÇÕES DO ENSAIO ─────────────────────────────────────────────────────────────────────
  //
  // Vitor: "você só trouxe a medida do luxímetro e o restante precisa ser preenchido também".
  // Técnica, condições superficiais e metal base são OBSERVADOS com a peça na frente — quem monta o
  // relatório no computador não tem como saber se a junta foi escovada ou está como soldada.
  //
  // ⚠ Lista fechada: só estes campos o campo escreve em `resultados`. O resto do cabeçalho
  // (procedimento, critério, componente) é de quem monta, e um celular não deve poder mudá-lo.
  if (body.condicoes && typeof body.condicoes === "object") {
    const c = body.condicoes;
    dados.resultados = { ...(rel.resultados || {}) };
    for (const k of ["iluminacao", "tecnica", "condicoes", "metalBase", "tipoEstrutura", "tipoPeca",
                     // ensaio por ultrassom (PI-QUA-003): aparelhagem e condição do ensaio
                     "carregamento", "apModelo", "apSerie", "cbModelo", "cbSerie", "cbAngulo",
                     "acoplante", "blocoPadrao", "ganhoVarredura", "local"]) {
      if (c[k] !== undefined) dados.resultados[k] = c[k] == null || c[k] === "" ? null : String(c[k]).slice(0, 120);
    }
  }

  const atualizado = await prisma.relatorioInspecao.update({ where: { id }, data: dados });

  // ── REPROVOU? ABRE A RNC ────────────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "no caso do relatório reprovado deverá já ser aberta uma RNC inclusive".
  // Sem isso a reprovação vive só dentro do relatório, e quem trata não conformidade só fica
  // sabendo se alguém contar.
  //
  // ⚠ Falhar aqui NÃO derruba a medição. O inspetor está no chão de fábrica com a peça na frente;
  // perder a medida por causa do vínculo seria trocar o certo pelo acessório. O aviso volta na
  // resposta e a RNC pode ser aberta depois.
  let rnc = null;
  if (dados.resultadoInspecao === "REPROVADO") {
    const { abrirRNCdeReprovacao } = await import("@/lib/rnc-de-inspecao");
    rnc = await abrirRNCdeReprovacao(
      { ...rel, ...dados, id, codigo: rel.codigo },
      { userId: user.id, elaborador: user.name || null },
    ).catch((e) => ({ erro: e.message }));
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "MEDIR_RELATORIO_CAMPO", entity: "RelatorioInspecao", entityId: id,
      diff: { codigo: rel.codigo, medidas: medidas.length, equipamentos: dados.equipamentos?.length ?? null },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, relatorio: { id: atualizado.id, codigo: atualizado.codigo }, rnc });
}
