// GET /api/producao/peca?opId=…&marca=…
//
// O DOSSIÊ DE UMA PEÇA — tudo o que o portal sabe dela, num lugar só.
//
// Vitor (03/09/2026): "clicar na peça, dar o tipo do material, número do conjunto, quais croquis
// fazem parte daquele conjunto, rastreabilidade dos materiais, status de onde a peça está na
// fábrica (…) até mesmo se tiver um relatório, trazer pelo menos o número do relatório de
// dimensional, visual de solda, ultrassom".
//
// ⚠⚠ NASCE PARA O 3D, MAS NÃO DEPENDE DELE. O destino é o clique no modelo IFC; só que o dossiê é
// útil sozinho — na tela de produção, na busca por marca, no atendimento a quem liga perguntando
// "onde está a T113A20". Amarrar esta rota ao visualizador seria deixá-la refém de um trabalho
// maior, e ela já responde hoje.
//
// ⚠ SÓ LEITURA. Nada aqui escreve.
//
// ⚠⚠ A CHAVE É A MARCA, E A MARCA NÃO É ÚNICA NA OP. Sub-obras repetem a marca com perfil
// diferente (ver lib/rastreio-peca e o caso da OP-113): por isso a rota exige `opId` e devolve
// TODAS as linhas que casam, em vez de escolher uma e fingir que é a certa. Quem chama decide —
// e no 3D o objeto clicado traz a frente junto, o que desempata.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rastreioDoConjunto } from "@/lib/rastreio-peca";
import { amarracoesDaOp, aplicarAmarracaoNosItens, rDoMaterialDaObra } from "@/lib/r-amarrado";
import { analisarMaterial, statusMaterialPlanejamento } from "@/lib/material-liberacao";
import { normalizeSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA", "QUALIDADE", "COMPRAS", "EXPEDICAO"];

// ⚠ os tipos de relatório do SGQ. ULTRASSOM entra agora porque o Vitor citou explicitamente
// ("dimensional, visual de solda, ultrassom") — o modelo aceita string livre no `tipo`, então
// listar aqui é o que dá nome à coisa na tela.
const TIPO_RELATORIO = {
  DIMENSIONAL: "Dimensional",
  VISUAL_SOLDA: "Visual de solda",
  ULTRASSOM: "Ultrassom",
  LP: "Líquido penetrante",
  PINTURA: "Pintura",
  MONTAGEM: "Montagem",
  GERAL: "Geral",
};

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId");
  const marca = (searchParams.get("marca") || "").trim();
  if (!opId || !marca) return NextResponse.json({ error: "Informe opId e marca." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId, marca },
    select: {
      id: true, marca: true, opNumero: true, descricao: true, tipoPeca: true, perfil: true,
      material: true, comprimentoMm: true, qte: true, pesoUnitKg: true, pesoTotalKg: true,
      areaPinturaM2: true, status: true, statusEstoque: true, prioridade: true,
      qteProduzida: true, pesoProduzido: true, dataProducao: true,
      corteDiaProgramado: true, montagemDiaProgramado: true, soldaDiaProgramado: true,
      montagemBancada: true, soldaBancada: true, fonte: true, naLE: true, naLPC: true,
      terceirizado: true, destino: true, encaminhadoSetor: true,
    },
  });
  if (!pecas.length) return NextResponse.json({ error: `Marca ${marca} não encontrada na OP ${op.numero}.` }, { status: 404 });

  // ── croquis do conjunto (e o caminho inverso: de que conjuntos este croqui faz parte) ──
  const ids = pecas.map((p) => p.id);
  const [comoConjunto, comoCroqui] = await Promise.all([
    prisma.conjuntoCroqui.findMany({
      where: { conjuntoId: { in: ids } },
      select: { qtdNoConjunto: true, croqui: { select: { id: true, marca: true, descricao: true, perfil: true, material: true, comprimentoMm: true, qte: true, pesoTotalKg: true, status: true } } },
    }),
    prisma.conjuntoCroqui.findMany({
      where: { croquiId: { in: ids } },
      select: { qtdNoConjunto: true, conjunto: { select: { id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, status: true } } },
    }),
  ]);

  // ── rastreabilidade: o R que sai no carimbo, pelos três caminhos ──
  // corte (fato) > amarração à mão > material da própria obra. Mesma ordem de lib/r-amarrado.
  let rastreio = [];
  try {
    let itens = await rastreioDoConjunto(op.numero, opId, marca).catch(() => []);
    if (!itens.length) {
      const perfil = pecas.find((p) => p.perfil)?.perfil;
      if (perfil) itens = [{ marca, perfil, situacao: null, usadas: [] }];
    }
    const amarradas = await amarracoesDaOp(op.numero);
    itens = aplicarAmarracaoNosItens(itens, amarradas);
    const perfis = [...new Set(itens.map((i) => i.perfil).filter(Boolean))];
    if (perfis.length) {
      const { porPerfil } = await analisarMaterial(op.numero, perfis.map((perfil, ix) => ({ id: `p${ix}`, perfil })));
      itens = aplicarAmarracaoNosItens(itens, rDoMaterialDaObra(porPerfil));
    }
    rastreio = itens
      .filter((i) => i.situacao || (i.usadas || []).some((u) => u?.rastreio))
      .map((i) => ({
        perfil: i.perfil, situacao: i.situacao,
        usadas: (i.usadas || []).map((u) => ({
          r: u.rastreio || null, corrida: u.corrida || null, certificado: u.certificado || null,
          norma: u.norma || null, nf: u.nf || null, fornecedor: u.fornecedor || null,
          material: u.material || null, indicado: !!u.indicado,
        })),
      }));
  } catch { /* rastreio é best-effort: sem ele o dossiê ainda vale */ }

  // ── status do material do perfil (entregue · estoque com R · aguardando · não comprado) ──
  let material = null;
  try {
    const { porPeca } = await analisarMaterial(op.numero, pecas.map((p) => ({ id: p.id, perfil: p.perfil })));
    const v = porPeca.get(pecas[0].id);
    if (v) material = {
      estado: v.estado, falta: v.falta || null, rotulo: v.faltaRotulo || null,
      rInformado: v.rInformado || null, descricaoCmr: v.descricaoCmr || null,
      // ⚠ como o PLANEJAMENTO lê isto — estoque com R declarado conta como resolvido
      statusPlanejamento: statusMaterialPlanejamento(v),
    };
  } catch { /* idem */ }

  // ── ONDE A PEÇA ESTÁ NA FÁBRICA. O status gravado só anda até o corte; daí em diante quem sabe
  // é o apontamento do Syneco (ver lib/peca-setor-real). Devolve o que cada setor já produziu.
  const apont = await prisma.mesApontamento.findMany({
    where: { opId, opSka: { contains: marca } },
    select: { setor: true, produzidoKg: true, produzidoUn: true, dataInicio: true },
    orderBy: { dataInicio: "asc" },
  }).catch(() => []);
  const porSetor = new Map();
  for (const a of apont) {
    const s = normalizeSetorSyneco(a.setor) || "?";
    const g = porSetor.get(s) || { setor: s, un: 0, kg: 0, primeiro: null, ultimo: null };
    g.un += Number(a.produzidoUn) || 0;
    g.kg += Number(a.produzidoKg) || 0;
    const d = a.dataInicio ? a.dataInicio.toISOString().slice(0, 10) : null;
    if (d) { if (!g.primeiro || d < g.primeiro) g.primeiro = d; if (!g.ultimo || d > g.ultimo) g.ultimo = d; }
    porSetor.set(s, g);
  }
  // a última etapa com produção é onde a peça está
  const trilha = [...porSetor.values()].sort((a, b) => String(a.ultimo).localeCompare(String(b.ultimo)));
  const setorAtual = trilha.length ? trilha[trilha.length - 1].setor : null;

  // ── programação: em que dia caiu, em que bancada, e se já foi liberada ──
  const libs = await prisma.liberacaoProducao.findMany({
    where: { opId, status: { in: ["LIBERADA", "EM_PRODUCAO"] } },
    select: { id: true, frente: true, setores: true, dataProgramada: true, prioridade: true, pecaIds: true, liberadoEm: true, liberadoPorNome: true },
  }).catch(() => []);
  const liberacoes = libs
    .filter((l) => (Array.isArray(l.pecaIds) ? l.pecaIds : []).some((x) => ids.includes(x)))
    .map((l) => ({
      frente: l.frente, setores: l.setores || [],
      dia: l.dataProgramada ? l.dataProgramada.toISOString().slice(0, 10) : null,
      prioridade: l.prioridade,
      liberadoEm: l.liberadoEm ? l.liberadoEm.toISOString().slice(0, 10) : null,
      liberadoPor: l.liberadoPorNome || null,
    }));

  // ── RELATÓRIOS DO SGQ QUE COBREM ESTA MARCA ──
  //
  // ⚠⚠ A ROTA JÁ DEVOLVE, MESMO SEM NADA EMITIDO AINDA. Vitor (03/09/2026): "sobre o relatório
  // ainda não existe mas será o próximo passo, calma logo ele aparece, já deixa a rota pronta pois
  // vou querer". `RelatorioInspecao.marcas` é um Json com as marcas cobertas — o gancho por marca
  // já é o desenho do modelo, só não há conteúdo. Quando o primeiro RID for emitido ele aparece
  // aqui sem nenhuma mudança nesta rota.
  //
  // ⚠ Filtra em memória: `marcas` é Json e o volume por OP é pequeno (dezenas). Um contains no
  // texto do Json casaria "T113A2" dentro de "T113A20", que é o tipo de erro silencioso que a
  // marca não perdoa.
  let relatorios = [];
  try {
    const rels = await prisma.relatorioInspecao.findMany({
      where: { opNumero: op.numero },
      select: { codigo: true, tipo: true, titulo: true, status: true, resultadoInspecao: true,
                revisao: true, emitidoEm: true, inspetor: true, marcas: true, arquivoUrl: true, rncId: true },
      orderBy: { numero: "asc" },
    });
    const alvo = marca.trim().toUpperCase();
    relatorios = rels
      .filter((r) => (Array.isArray(r.marcas) ? r.marcas : []).some((m) => String(m).trim().toUpperCase() === alvo))
      .map((r) => ({
        codigo: r.codigo, tipo: r.tipo, tipoRotulo: TIPO_RELATORIO[r.tipo] || r.tipo,
        titulo: r.titulo || null, status: r.status,
        resultado: r.resultadoInspecao || null, revisao: r.revisao,
        emitidoEm: r.emitidoEm ? r.emitidoEm.toISOString().slice(0, 10) : null,
        inspetor: r.inspetor || null, arquivoUrl: r.arquivoUrl || null,
        temRnc: !!r.rncId,
      }));
  } catch { /* idem */ }

  return NextResponse.json({
    op: { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra },
    marca,
    // ⚠ plural de propósito: a marca pode repetir na OP com perfil diferente (sub-obras)
    pecas: pecas.map((p) => ({
      ...p,
      pesoTotalKg: p.pesoTotalKg == null ? null : Math.round(p.pesoTotalKg * 100) / 100,
      dataProducao: p.dataProducao ? p.dataProducao.toISOString().slice(0, 10) : null,
      corteDiaProgramado: p.corteDiaProgramado ? p.corteDiaProgramado.toISOString().slice(0, 10) : null,
      montagemDiaProgramado: p.montagemDiaProgramado ? p.montagemDiaProgramado.toISOString().slice(0, 10) : null,
      soldaDiaProgramado: p.soldaDiaProgramado ? p.soldaDiaProgramado.toISOString().slice(0, 10) : null,
    })),
    croquis: comoConjunto.map((x) => ({ ...x.croqui, qtdNoConjunto: x.qtdNoConjunto })),
    conjuntos: comoCroqui.map((x) => ({ ...x.conjunto, qtdNoConjunto: x.qtdNoConjunto })),
    rastreio, material,
    fabrica: { setorAtual, trilha: trilha.map((t) => ({ ...t, kg: Math.round(t.kg) })) },
    liberacoes, relatorios,
    tiposRelatorio: TIPO_RELATORIO,
  });
}
