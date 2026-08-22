// GET — os dados do Portal do Cliente, pelo token. PÚBLICO, sem login.
//
// ⚠ CADA SEÇÃO LÊ A FONTE VIVA. Nada é copiado para dentro do portal: o cronograma vem do
// Planejamento, a LPC da Engenharia, os certificados do Controle de Documentos, os relatórios da
// Qualidade. Um portal com cópia própria desatualiza no primeiro mês e passa a mentir com cara de
// oficial — que é pior do que não existir.
//
// ⚠ E SÓ SAI O QUE A OBRA LIGOU. A consulta de cada seção só roda se ela estiver ativa: além de
// não vazar o que o contrato não previu, evita pagar dez consultas para mostrar três blocos.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal, mensagemPadrao } from "@/lib/portal-cliente";
import { TIPO_LABEL } from "@/lib/qualidade-campo";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function GET(_req, { params }) {
  const { token } = await params;
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") {
    return NextResponse.json({ error: "Link inválido ou ainda não publicado." }, { status: 404 });
  }

  const op = await prisma.oP.findFirst({
    where: { numero: portal.opNumero },
    select: { id: true, numero: true, cliente: true, obra: true, refCliente: true, dataInicio: true, dataFimPrevista: true, status: true },
  });

  const ativas = secoesDoPortal(portal);
  const tem = (s) => ativas.includes(s);
  const dados = {};

  // ── cronograma: as frentes e o avanço ──
  if (tem("CRONOGRAMA")) {
    const cron = await prisma.cronograma.findFirst({
      where: { opNumero: portal.opNumero, ativo: true },
      orderBy: { ultimoSync: "desc" },
      select: { id: true, titulo: true, dataInicio: true, dataFim: true, areas: true },
    });
    if (cron) {
      const tarefas = await prisma.cronogramaTarefa.findMany({
        where: { cronogramaId: cron.id },
        select: {
          nome: true, area: true, departamento: true,
          dataInicioPrevista: true, dataFimPrevista: true,
          percentualPrevisto: true, percentualRealizado: true,
        },
        orderBy: [{ dataInicioPrevista: "asc" }],
        take: 600,
      });
      // ⚠ AGRUPADO POR SETOR, não a lista crua. O cronograma interno tem centenas de linhas de
      // detalhe: o cliente quer saber como andam as FRENTES (corte, solda, pintura, expedição),
      // não a tarefa de quem executa. O avanço da frente é a média ponderada pelas tarefas.
      const porSetor = new Map();
      for (const t of tarefas) {
        const chave = t.departamento || t.area || "Obra";
        const g = porSetor.get(chave) || { nome: String(chave).replace(/_/g, " "), tarefas: 0, soma: 0, inicio: null, fim: null };
        g.tarefas++;
        g.soma += Number(t.percentualRealizado) || 0;
        if (t.dataInicioPrevista && (!g.inicio || t.dataInicioPrevista < g.inicio)) g.inicio = t.dataInicioPrevista;
        if (t.dataFimPrevista && (!g.fim || t.dataFimPrevista > g.fim)) g.fim = t.dataFimPrevista;
        porSetor.set(chave, g);
      }
      dados.cronograma = {
        titulo: cron.titulo,
        inicio: fmt(cron.dataInicio), fim: fmt(cron.dataFim),
        frentes: [...porSetor.values()]
          .sort((a2, b2) => (a2.inicio && b2.inicio ? a2.inicio - b2.inicio : 0))
          .map((g) => ({
            nome: g.nome, tarefas: g.tarefas,
            inicio: fmt(g.inicio), fim: fmt(g.fim),
            percentual: Math.round(g.soma / Math.max(1, g.tarefas)),
          })),
      };
    }
  }

  // ── relatórios de inspeção: SÓ OS APROVADOS ──
  // ⚠ relatório em rascunho ou reprovado não é informação para o cliente: é trabalho em curso.
  // Mostrar reprovado sem o reparo ao lado seria entregar meia história.
  if (tem("RELATORIOS")) {
    const rels = await prisma.relatorioInspecao.findMany({
      where: { opNumero: portal.opNumero, resultadoInspecao: "APROVADO" },
      select: { id: true, codigo: true, tipo: true, marcas: true, emitidoEm: true, inspetor: true, createdAt: true },
      orderBy: [{ tipo: "asc" }, { numero: "asc" }],
      take: 300,
    });
    dados.relatorios = rels.map((r) => ({
      id: r.id, codigo: r.codigo, tipo: r.tipo, tipoLabel: TIPO_LABEL[r.tipo] || r.tipo,
      marcas: (r.marcas || []).slice(0, 6), inspetor: r.inspetor,
      data: fmt(r.emitidoEm || r.createdAt),
    }));
  }

  // ── certificados de qualidade ──
  if (tem("CERTIFICADOS")) {
    const certs = await prisma.documentoQualidade.findMany({
      where: { opNumero: portal.opNumero, ativo: true, categoria: "MATERIAL" },
      select: { id: true, nome: true, numeroDocumento: true, numeroCorrida: true, fornecedor: true, norma: true },
      orderBy: { nome: "asc" },
      take: 500,
    });
    dados.certificados = certs.map((c) => ({
      id: c.id, material: c.nome, certificado: c.numeroDocumento, corrida: c.numeroCorrida,
      fornecedor: c.fornecedor, norma: c.norma,
    }));
  }

  // ── data book: os volumes prontos ──
  if (tem("DATABOOK")) {
    const book = await prisma.dataBookQualidade.findFirst({
      where: { opNumero: portal.opNumero },
      select: { id: true, revisao: true, status: true, emitidoEm: true },
    });
    if (book) {
      const vols = await prisma.dataBookArquivo.findMany({
        where: { dataBookId: book.id, revisao: book.revisao },
        orderBy: { volume: "asc" },
        select: { volume: true, titulo: true, paginas: true, tamanho: true },
      });
      dados.databook = {
        revisao: book.revisao, status: book.status, emitidoEm: fmt(book.emitidoEm),
        volumes: vols,
      };
    }
  }

  // ── LPC: conjuntos e peças ──
  if (tem("LPC") && op?.id) {
    const pecas = await prisma.pecaConjunto.findMany({
      where: { opId: op.id },
      select: { marca: true, descricao: true, qte: true, pesoTotalKg: true, tipoPeca: true },
      orderBy: { marca: "asc" },
      take: 2000,
    });
    const conjuntos = pecas.filter((p) => String(p.tipoPeca || "").toUpperCase() === "CONJUNTO");
    dados.lpc = {
      totalPecas: pecas.length,
      totalConjuntos: conjuntos.length,
      pesoKg: Math.round(pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0)),
      itens: (conjuntos.length ? conjuntos : pecas).slice(0, 400).map((p) => ({
        marca: p.marca, descricao: p.descricao, qtd: p.qte, pesoKg: Math.round(p.pesoTotalKg || 0),
      })),
    };
  }

  // ── documentos formais da obra ──
  //
  // ⚠ AGRUPADOS POR ASSUNTO, E SEM OS DESENHOS. A OP-067 tem 1.798 documentos nesta categoria —
  // 1.780 deles são desenhos as-built, que já são o Data Book. Uma lista de 1.798 linhas não é
  // transparência: é ruído que esconde o PIT e as EPS no meio.
  //
  // O campo `tipo` guarda a seção do data book a que o documento pertence ("Anexo — PIT/ITP",
  // "Anexo — EPS/WPS e RQPS/PQR"), então é por ele que se agrupa.
  if (tem("DOCUMENTOS")) {
    const docs = await prisma.documentoQualidade.findMany({
      where: {
        opNumero: portal.opNumero, ativo: true,
        categoria: { in: ["ANEXO", "SISTEMA"] },
        NOT: { tipo: { contains: "as-built", mode: "insensitive" } },
      },
      select: { id: true, nome: true, tipo: true },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
      take: 400,
    });
    const porAssunto = new Map();
    for (const doc of docs) {
      const assunto = String(doc.tipo || "Documentos da obra").replace(/^Anexo\s*[—-]\s*/i, "").trim();
      const g = porAssunto.get(assunto) || { assunto, itens: [] };
      g.itens.push({ id: doc.id, nome: doc.nome });
      porAssunto.set(assunto, g);
    }
    dados.documentos = [...porAssunto.values()]
      .map((g) => ({ assunto: g.assunto, total: g.itens.length, itens: g.itens.slice(0, 12) }))
      .sort((a2, b2) => a2.assunto.localeCompare(b2.assunto, "pt-BR"));
  }

  await prisma.portalCliente.update({
    where: { id: portal.id },
    data: {
      acessos: { increment: 1 },
      ultimoAcessoEm: new Date(),
      ...(portal.primeiroAcessoEm ? {} : { primeiroAcessoEm: new Date() }),
    },
  }).catch(() => { /* contar acesso nunca pode derrubar a página do cliente */ });

  return NextResponse.json({
    op: op ? { numero: op.numero, cliente: op.cliente, obra: op.obra, refCliente: op.refCliente } : { numero: portal.opNumero },
    portal: {
      contato: portal.contato, empresa: portal.empresa, capaUrl: portal.capaUrl,
      mensagem: portal.mensagem || mensagemPadrao({ cliente: op?.cliente, obra: op?.obra }),
      fotos: Array.isArray(portal.fotos) ? portal.fotos : [],
      secoes: ativas,
    },
    dados,
  });
}
