// GET   — o relatório para a tela de edição/prévia.
// PATCH  — salva o que o elaborador preencheu (dimensões encontradas, resultados, observações).
//
// Vitor (21/08/2026): "as dimensões encontradas você deve deixar para o elaborador do relatório
// preencher". É este PATCH que recebe isso.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { vincularNoDataBook } from "@/lib/relatorio-inspecao";
import { garantirDesenhos } from "@/lib/relatorio-dimensional";
import { usaCotas } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

const PERFIS = ["ADMIN", "QUALIDADE"];
const RESULTADOS = new Set(["APROVADO", "REPROVADO", "RETRABALHAR", null]);

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  // ⚠⚠ É AQUI QUE O DESENHO É RESOLVIDO — e não era em lugar nenhum que a tela alcançasse.
  // Vitor (24/08/2026): "quando vou abrir o novo relatório que já selecionou uma peça na abertura,
  // não está importando para o relatório direto".
  //
  // O relatório nasce sem desenho de propósito (a varredura na pasta da OP é cara e segurava o
  // clique de criar), e `garantirDesenhos` existe para resolver na primeira vez que alguém abre.
  // Só que quem o chamava era `/vetor` e `/pdf` — e `/vetor` só é buscado pelo `MarcadorCotas`,
  // que a tela só monta quando JÁ existe desenho. Ovo e galinha: nascia vazio e ficava vazio,
  // mostrando "nenhum projeto vinculado" para uma peça cujo PDF está lá na pasta.
  //
  // ⚠ escolher/anexar à mão continua ganhando: `garantirDesenhos` devolve o que já está gravado
  // sem varrer nada, então a escolha do inspetor nunca é sobrescrita pela busca automática.
  if (usaCotas(rel.tipo)) rel.desenhos = await garantirDesenhos(rel);

  const [fotos, assinaturas] = await Promise.all([
    prisma.fotoInspecao.findMany({
      where: { relatorioId: id },
      select: { id: true, url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
      orderBy: { capturadaEm: "asc" },
    }),
    rel.envioAssinaturaId
      ? prisma.assinaturaDocumento.findMany({
          where: { envioId: rel.envioAssinaturaId },
          select: { nome: true, email: true, setor: true, assinadoEm: true, ip: true },
          orderBy: { nome: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ relatorio: rel, fotos, assinaturas });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  // ⚠ relatório JÁ ENVIADO para assinatura não se edita. Quem assinou validou um conteúdo; mudar
  // por baixo faz a assinatura valer para um documento que a pessoa não viu — o mesmo raciocínio
  // da revisão do data book.
  if (rel.envioAssinaturaId) {
    return NextResponse.json({ error: "Este relatório já foi enviado para assinatura e não pode mais ser alterado." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const dados = {};

  if (body.titulo !== undefined) dados.titulo = String(body.titulo || "").trim() || null;
  if (body.observacoes !== undefined) dados.observacoes = String(body.observacoes || "").trim() || null;
  if (body.inspetor !== undefined) dados.inspetor = String(body.inspetor || "").trim() || null;

  // ⚠ APROVAR TAMBÉM SE FAZ NO COMPUTADOR. Até aqui só o celular gravava o resultado geral —
  // quem monta o relatório na mesa (LP, pintura) não tinha como aprová-lo, e sem resultado o
  // documento nunca sai da fila de "aguardando".
  //
  // Só APROVADO fecha: reprovado volta para reparo e "exame complementar" ainda vai ter ensaio.
  if (body.resultadoInspecao !== undefined) {
    const r = String(body.resultadoInspecao || "").toUpperCase();
    dados.resultadoInspecao = ["APROVADO", "REPROVADO", "REC"].includes(r) ? r : null;
  }

  // ⚠ OS INSTRUMENTOS TAMBÉM SE ESCOLHEM NO COMPUTADOR. Vitor (22/08/2026): "não são todos os
  // relatórios que você está deixando o campo para selecionarmos os equipamentos calibrados para
  // mencionar no relatório". No celular o seletor existia; aqui a rota nem aceitava o campo, então
  // relatório montado na mesa saía com o bloco de instrumentos vazio — e um ensaio sem dizer com o
  // que foi medido não vale como registro.
  //
  // ⚠ SNAPSHOT, como no celular: guarda nome, código, certificado e validade do jeito que estão
  // hoje. Quando o certificado for renovado, o relatório antigo continua mostrando o que valia no
  // dia da inspeção.
  if (Array.isArray(body.equipamentos)) {
    dados.equipamentos = body.equipamentos.slice(0, 12).map((e) => ({
      id: String(e?.id || ""),
      nome: String(e?.nome || "").slice(0, 160),
      codigo: e?.codigo ? String(e.codigo).slice(0, 40) : null,
      certificado: e?.certificado ? String(e.certificado).slice(0, 60) : null,
      validade: e?.validade ? String(e.validade).slice(0, 10) : null,
      vencido: !!e?.vencido,
    })).filter((e) => e.id && e.nome);
  }

  // ⚠ ESTE SANITIZADOR RECONSTRÓI A LINHA CAMPO A CAMPO, e por isso qualquer campo que não esteja
  // listado aqui é PERDIDO no salvamento. Foi o que aconteceu com a cota: `letra` e as coordenadas
  // da marcação não estavam na lista, então a pessoa marcava a Cota A, salvava, e o relatório
  // voltava sem letra e sem posição — a marca sumia do desenho no PDF e a tabela perdia o rótulo.
  // Campo novo na linha PRECISA ser acrescentado aqui.
  // ⚠ VAZIO NÃO É ZERO. `Number(null)` e `Number("")` dão 0, e 0 é finito — a checagem ingênua
  // gravava 0 na dimensão ENCONTRADA de toda linha que ninguém mediu. No relatório isso não fica
  // discreto: aparece "0" na coluna e um desvio de -4332 em vermelho, como se a peça tivesse sido
  // medida e reprovado. Mesma armadilha do NaN no holerite.
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  if (Array.isArray(body.linhas)) {
    dados.linhas = body.linhas.slice(0, 400).map((l) => ({
      marca: String(l?.marca || "").slice(0, 60),
      conjunto: l?.conjunto ? String(l.conjunto).slice(0, 60) : null,
      qtd: num(l?.qtd),
      descricao: l?.descricao ? String(l.descricao).slice(0, 120) : null,
      material: l?.material ? String(l.material).slice(0, 60) : null,
      projetoMm: num(l?.projetoMm),
      tolerancia: l?.tolerancia ? String(l.tolerancia).slice(0, 40) : null,
      encontradoMm: num(l?.encontradoMm),
      obs: l?.obs ? String(l.obs).slice(0, 160) : null,
      // ── a cota marcada no desenho (dimensional) ──
      letra: l?.letra ? String(l.letra).slice(0, 3) : null,
      ax: num(l?.ax), ay: num(l?.ay), bx: num(l?.bx), by: num(l?.by),
      // ⚠ o lado ESCOLHIDO À MÃO da linha de chamada (topo/base/esq/dir) — Vitor (03/09/2026):
      // "quero poder fazer isso marcando mas podendo ajustar ela". Sem gravar aqui, a escolha
      // sumia ao salvar e voltava a decidir pela metade da folha (ver lib/cota-marcacao.js).
      lado: ["topo", "base", "esq", "dir"].includes(l?.lado) ? l.lado : null,
      // ⚠ idem para o afastamento (comprimento da linha) — Vitor (03/09/2026): "poder ajustar a
      // altura dela também... deixar mais comprida ou mais curta".
      afastamento: num(l?.afastamento),
      // ── a junta inspecionada (visual de solda) ──
      eps: l?.eps ? String(l.eps).slice(0, 30) : null,
      soldador: l?.soldador ? String(l.soldador).slice(0, 40) : null,
      // sinete do soldador (S-01, S-04…) — vem da RSQ; é o que identifica quem soldou
      sinete: l?.sinete ? String(l.sinete).slice(0, 20) : null,
      descontinuidade: l?.descontinuidade ? String(l.descontinuidade).slice(0, 40) : null,
      laudo: l?.laudo ? String(l.laudo).slice(0, 10) : null,
      // ── a indicação (líquido penetrante) — FORM. SGQ - 012 ──
      // ⚠ nomes próprios do LP: `indicacao` aqui é o NÚMERO da indicação na peça, e
      // `tipoDefeito` é IL/IA/INR. Não dá para reaproveitar os campos do ultrassom, que
      // guardam decibéis e distâncias.
      indicacaoLp: l?.indicacaoLp ? String(l.indicacaoLp).slice(0, 20) : null,
      local: l?.local ? String(l.local).slice(0, 60) : null,
      tamanho: l?.tamanho ? String(l.tamanho).slice(0, 30) : null,
      tipoDefeito: l?.tipoDefeito ? String(l.tipoDefeito).slice(0, 10) : null,
      // ── a indicação (ensaio por ultrassom) ──
      ...Object.fromEntries(["peca", "indicacao", "angulo", "face", "comprimento", "db_indicacao",
        "db_referencia", "db_atenuacao", "db_classe", "reprovado", "percurso", "profundidade",
        "dist_x", "dist_y", "nivel"].map((k) => [k, l?.[k] ? String(l[k]).slice(0, 40) : null])),
    }));
  }

  if (body.resultados && typeof body.resultados === "object") {
    const r = body.resultados;
    const ok = (v) => (v == null || RESULTADOS.has(v) ? v ?? null : null);
    dados.resultados = {
      ...(rel.resultados || {}),
      dimensional: ok(r.dimensional),
      alinhamento: ok(r.alinhamento),
      acabamento: ok(r.acabamento),
      resultado: ok(r.resultado),
    };

    // ── O QUE FOI APAGADO NO DESENHO ────────────────────────────────────────────────────────────
    //
    // Mesma armadilha de cima: o espalhamento preserva o que JÁ estava gravado, mas o que vem novo
    // no corpo precisa ser lido explicitamente. Sem estas duas linhas a pessoa apagava as marcas,
    // salvava, e o PDF saía com tudo de volta.
    // ── campos de cabeçalho dos outros modelos ─────────────────────────────────────────────────
    //
    // ⚠ MESMA ARMADILHA DE SEMPRE: o que não for lido aqui é descartado no salvamento. O bloco de
    // `resultados` preserva o que já estava gravado, mas campo novo precisa ser lido explicitamente.
    const TEXTO_LIVRE = [
      // visual de solda
      "encomenda", "quantidade", "desenho", "componente", "metalBase", "iluminacao", "tecnica",
      "condicoes", "procedimento", "criterio",
      // ensaio por ultrassom
      "tag", "local", "norma", "material", "espessura", "metalAdicao", "processoSolda", "acoplante",
      "junta", "chanfro", "blocoPadrao", "apFabricante", "apModelo", "apSerie",
      "cbFabricante", "cbModelo", "cbAngulo", "cbDimensoes", "cbFrequencia", "cbSerie",
      // pintura
      "descricao", "pecas", "prepProcedimento", "prepData", "prepIni", "prepFim", "prepUmidade",
      "prepTAmb", "prepTSup", "prepOrvalho", "rugEspec", "rugObtido", "abrasivo", "poeira",
      "salinidade", "intemperismo", "limpeza", "laudo", "espessuraMinima", "obsFotos", "tempo",
      "pullOffEquip", "pullOffValor", "pullOffMin", "pullOffRuptura",
      // líquido penetrante (PO-15 / FORM. SGQ - 012)
      "documentoInspecao", "dataInspecao", "revisaoDesenho", "tipoPenetrante", "penetranteMarca",
      "penetranteLote", "tempoPenetracao", "metodo", "removedor", "removedorLote", "tempoSecagem",
      "temperatura", "revelador", "reveladorLote", "tempoRevelador", "uv",
      // vínculo com o procedimento do Controle de Documentos
      "procedimentoId",
      // ⚠ tipo de estrutura da AWS D1.1 — é ele que decide QUAL limite vale para cada
      // descontinuidade (1 mm de mordedura na estática, 0,25 mm em membro primário da cíclica).
      "tipoEstrutura",
      // tipo da peça (Coluna, Viga, Suporte, Bandeja, Tesoura, Treliça) — DESCREVE, não decide
      // critério; ver a nota em lib/evs-campos.js sobre a colisão de nomes
      "tipoPeca",
      // ensaio por ultrassom (PI-QUA-003)
      "carregamento", "ganhoVarredura", "acoplante", "blocoPadrao", "local",
      "apModelo", "apSerie", "cbModelo", "cbSerie", "cbAngulo",
    ];
    for (const k of TEXTO_LIVRE) {
      if (r[k] !== undefined) dados.resultados[k] = r[k] == null ? null : String(r[k]).slice(0, 120);
    }
    // ⚠ as demãos e as leituras de espessura são ESTRUTURA, não texto: guardadas como estão, com
    // teto de tamanho. Sem isto o relatório de pintura salvaria vazio.
    if (r.demaos && typeof r.demaos === "object") {
      dados.resultados.demaos = {};
      for (const d of ["1", "2", "3"]) {
        const bloco = r.demaos[d];
        if (!bloco || typeof bloco !== "object") continue;
        const limpo = {};
        for (const [k, v] of Object.entries(bloco).slice(0, 30)) limpo[String(k).slice(0, 20)] = v == null ? null : String(v).slice(0, 60);
        dados.resultados.demaos[d] = limpo;
      }
    }
    // ⚠ as cinco leituras de rugosidade são ESTRUTURA, como as de espessura — item 5.5.1.1 manda a
    // média de cinco medições, e guardar só a média perderia a evidência de como ela se formou.
    if (Array.isArray(r.rugLeituras)) {
      dados.resultados.rugLeituras = r.rugLeituras.slice(0, 5).map(num);
    }
    if (r.espessuras && typeof r.espessuras === "object") {
      dados.resultados.espessuras = {};
      for (const d of ["1", "2", "3"]) {
        const lista = r.espessuras[d];
        if (!Array.isArray(lista)) continue;
        dados.resultados.espessuras[d] = lista.slice(0, 5).map(num);
      }
    }

    if (Array.isArray(r.ocultosDesenho)) {
      dados.resultados.ocultosDesenho = r.ocultosDesenho.slice(0, 800)
        .map((o) => ({ x: num(o?.x), y: num(o?.y), w: num(o?.w), h: num(o?.h), tx: num(o?.tx), ty: num(o?.ty) }))
        .filter((o) => o.x != null && o.y != null);
    }
    if (Array.isArray(r.linhasOcultasDesenho)) {
      dados.resultados.linhasOcultasDesenho = r.linhasOcultasDesenho.slice(0, 4000)
        .map((l) => (Array.isArray(l) ? l.slice(0, 4).map(num) : null))
        .filter((l) => l && l.length === 4 && l.every((v) => v != null));
    }
  }

  const atualizado = await prisma.relatorioInspecao.update({ where: { id }, data: dados });

  // ⚠ BACKUP NA PASTA DA OBRA, na APROVAÇÃO. Vitor (22/08/2026): "salvar os relatórios em PDF na
  // pasta da qualidade de cada OP para podermos garantir o backup". Guarda quando o documento
  // FECHA — rascunho que muda dez vezes por dia encheria a pasta de versões sem dizer qual vale.
  //
  // ⚠ Falhar aqui NÃO desfaz a aprovação: o arquivamento é consequência, não condição. O aviso
  // volta na resposta para quem estiver na tela.
  let arquivo = null;
  if (dados.resultadoInspecao === "APROVADO" && rel.resultadoInspecao !== "APROVADO") {
    const { arquivarRelatorioNaObra } = await import("@/lib/relatorio-arquivo");
    arquivo = await arquivarRelatorioNaObra(id);
  }

  // o nome do documento na seção acompanha o título
  if (dados.titulo !== undefined && atualizado.documentoId) {
    await vincularNoDataBook(atualizado, null).catch(() => {});
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_RELATORIO_INSPECAO", entity: "RelatorioInspecao", entityId: id, diff: { campos: Object.keys(dados) } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, relatorio: atualizado, arquivo });
}

/**
 * DELETE — apaga um relatório de inspeção.
 *
 * Vitor (21/08/2026): "preciso de permissão para poder apagar esses relatórios".
 *
 * ⚠ APAGAR TEM DE LIMPAR O DATA BOOK JUNTO. O relatório cria um DocumentoQualidade e o amarra na
 * seção; deixar isso para trás encheria o data book de anexo apontando para relatório inexistente —
 * e o data book é documento que vai ao cliente.
 *
 * ⚠ Já ENVIADO PARA ASSINATURA não se apaga. Ali existem convites por e-mail e possivelmente
 * assinaturas de terceiros; sumir com o documento por baixo de quem assinou é o tipo de coisa que
 * não se desfaz. Só ADMIN passa, e ainda assim o registro fica no log.
 *
 * ⚠ As FOTOS não são apagadas: voltam a ser fotos soltas, na tela de inspeções, e podem virar outro
 * relatório. Quem tira foto na fábrica não deveria perder o trabalho por causa de um relatório
 * montado errado.
 */
export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rel = await prisma.relatorioInspecao.findUnique({
    where: { id: params.id },
    select: { id: true, codigo: true, opNumero: true, tipo: true, documentoId: true, envioAssinaturaId: true },
  });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const ehAdmin = user.tipo === "ADMIN" || user.role === "ADMIN";
  if (rel.envioAssinaturaId && !ehAdmin) {
    return NextResponse.json(
      { error: "Este relatório já foi enviado para assinatura. Só um administrador pode apagá-lo." },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1) solta as fotos — elas voltam para a fila de fotos soltas
      await tx.fotoInspecao.updateMany({ where: { relatorioId: rel.id }, data: { relatorioId: null } });

      // 2) tira o anexo do data book e apaga o documento que este relatório criou
      if (rel.documentoId) {
        await tx.dataBookSecaoDoc.deleteMany({ where: { documentoId: rel.documentoId } });
        await tx.documentoQualidade.deleteMany({ where: { id: rel.documentoId, origem: "inspecao_campo" } });
      }

      // 3) e o próprio relatório
      await tx.relatorioInspecao.delete({ where: { id: rel.id } });
    });
  } catch (e) {
    return NextResponse.json({ error: `Não consegui apagar: ${e.message}` }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "EXCLUIR_RELATORIO_INSPECAO", entity: "RelatorioInspecao", entityId: rel.id,
      diff: { codigo: rel.codigo, opNumero: rel.opNumero, tipo: rel.tipo, tinhaAssinatura: !!rel.envioAssinaturaId },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, codigo: rel.codigo });
}
