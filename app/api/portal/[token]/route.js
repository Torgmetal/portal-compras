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
import { ordenarCompras } from "@/lib/item-comprado";
import { registrarAcesso, destinatarioDoCodigo } from "@/lib/portal-acesso";
import { statusDosPlanos } from "@/lib/planos-aceite";
import { prisma } from "@/lib/prisma";
import { secoesDoPortal, mensagemPadrao, CAPA_PADRAO, TIPOS_ENGENHARIA, agruparEngenharia, portalExpirado } from "@/lib/portal-cliente";
import { pecasDaLista, sincronizarRevisao, revisaoParaOCliente } from "@/lib/portal-listas";
import { TIPO_LABEL } from "@/lib/qualidade-campo";
import { pecasTekla, pesoRealPecas } from "@/lib/peso-op";
import { etapaDasMarcas } from "@/lib/portal-obra-consulta";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);


// ⚠⚠ A PASTA COMO PACOTE. Vitor (03/09/2026): "quero que o cliente veja como se fosse uma pasta,
// onde ele seleciona ela e baixa por pacotes (…) na 118 temos várias listas na parte de diagrama de
// montagem; para facilitar o entendimento colocamos em pasta, pois os arquivos saem renomeados do
// Tekla dessa maneira". E, logo depois: "precisamos ter a opção de selecionar o projeto também —
// ter as duas opções, tanto de projeto quanto a de pasta".
//
// A pasta de origem já era gravada em cada documento escolhido; só nunca tinha sido usada na
// vitrine. Aqui ela vira agrupamento — e o arquivo continua aparecendo um a um dentro dela, porque
// as duas formas de escolher têm de conviver.
//
// ⚠ SÓ QUANDO HÁ MAIS DE UMA PASTA. Um único grupo chamado "Fabricação" dentro da seção
// "Projetos de fabricação" é uma caixa em volta de nada — repete o título e afasta o arquivo de
// quem procura. Nesse caso a lista continua chapada, como hoje.
//
// ⚠ NOME É O ÚLTIMO SEGMENTO, não o caminho. O cliente não tem nada com
// "2. Engenharia/2.5 Projetos/2.5.4 …" — ele quer ler "Eixo 10", que é como a Engenharia batizou.
// ⚠⚠ O PDF AO LADO DO SEU DWG. Vitor (03/09/2026): "deixe sempre em ordem o número do projeto; o
// que tem pdf tem que ficar junto com o projeto dele em DWG para não ficar bagunçado". Ordenar pelo
// nome cru separa os dois: todos os .dwg de um lado e todos os .pdf do outro, porque a extensão
// entra na comparação. Ordenando pelo nome SEM extensão, o par do mesmo desenho encosta — e a
// comparação numérica põe o T118-10 depois do T118-9, não antes.
const semExt = (n) => String(n || "").replace(/\.[a-z0-9]+$/i, "");
const ext = (n) => (String(n || "").split(".").pop() || "").toLowerCase();
function ordemDeProjeto(a, b) {
  const na = semExt(a?.nome), nb = semExt(b?.nome);
  return na.localeCompare(nb, "pt-BR", { numeric: true, sensitivity: "base" })
    || ext(a?.nome).localeCompare(ext(b?.nome));
}

function subpastasDe(docs, item) {
  const porPasta = new Map();
  for (const d of docs) {
    const cheio = String(d.pasta || "").replace(/\/+$/, "");
    const nome = cheio ? cheio.split("/").filter(Boolean).pop() : "";
    const chave = nome || "";
    (porPasta.get(chave) || porPasta.set(chave, []).get(chave)).push(d);
  }
  if (porPasta.size < 2) return null;
  return [...porPasta.entries()]
    .sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true }))
    .map(([nome, ds]) => ({
      nome: nome || "Sem pasta",
      itens: ds.slice().sort(ordemDeProjeto).map(item),
      tamanho: ds.reduce((t, d) => t + (Number(d.tamanho) || 0), 0),
    }));
}

export async function GET(req, { params }) {
  const { token } = await params;
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") {
    return NextResponse.json({ error: "Link inválido ou ainda não publicado." }, { status: 404 });
  }
  // ⚠ VENCIDO NÃO É INVÁLIDO, e a mensagem tem de dizer qual dos dois é: quem recebe "link
  // inválido" acha que errou o endereço e não pede nada; quem lê "o acesso venceu" pede o link
  // novo. Sem essa diferença, a validade viraria só um chamado de suporte.
  if (portalExpirado(portal)) {
    return NextResponse.json({
      error: "O acesso a este portal venceu. Peça um link novo ao seu contato na Torg Metal.",
      expirado: true,
    }, { status: 410 });
  }

  const op = await prisma.oP.findFirst({
    where: { numero: portal.opNumero },
    select: { id: true, numero: true, cliente: true, obra: true, refCliente: true, dataInicio: true, dataFimPrevista: true, status: true },
  });

  const ativas = secoesDoPortal(portal);
  const tem = (s) => ativas.includes(s);
  const dados = {};

  // ⚠ PREVIEW NOSSO NÃO É ACESSO DO CLIENTE. O botão "ver como o cliente vê" abre esta mesma rota;
  // sem marcar, ele contava acesso, gravava "primeiro acesso" e tirava foto de revisão em nome de
  // um cliente que nunca entrou — foi assim que os quatro portais publicados ficaram com
  // `primeiroAcessoEm` a segundos do `publicadoEm`.
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const codigoDoLink = new URL(req.url).searchParams.get("d");

  // ⚠ QUANDO O CLIENTE ABRIU O PORTAL PELA PRIMEIRA VEZ — é o que dá sentido a "mudou desde então".
  // Só conta destinatário que entrou pelo `?d=` do e-mail: o nosso "ver como o cliente vê" não
  // grava `primeiroAcessoEm`, e o envio sozinho não prova que alguém leu a lista.
  const primeiroAcesso = await prisma.portalDestinatario
    .findFirst({ where: { portalId: portal.id, primeiroAcessoEm: { not: null } }, orderBy: { primeiroAcessoEm: "asc" }, select: { primeiroAcessoEm: true } })
    .catch(() => null);
  const clienteViuEm = primeiroAcesso?.primeiroAcessoEm || null;

  // ── cronograma: as frentes e o avanço ──
  if (tem("CRONOGRAMA")) {
    // ⚠⚠ O CRONOGRAMA NUNCA APARECIA PARA O CLIENTE — descasamento de chave. `PortalCliente.opNumero`
    // guarda "089"; TODOS os 31 `Cronograma` guardam "T089". A busca por `opNumero` casava ZERO, e o
    // `if (cron)` logo abaixo pulava a seção em silêncio. Conferido no banco: os três portais casam
    // 0 por `opNumero` e 1 por `opId` — e o da TMSA (OP-089) está PUBLICADO, com a seção CRONOGRAMA
    // ligada e **25 acessos do cliente**. Ele abriu 25 vezes uma aba que nunca teve conteúdo.
    const cron = await prisma.cronograma.findFirst({
      where: { ativo: true, ...(op?.id ? { opId: op.id } : { opNumero: portal.opNumero }) },
      orderBy: { ultimoSync: "desc" },
      select: { id: true, titulo: true, dataInicio: true, dataFim: true, areas: true },
    });
    if (cron) {
      const tarefas = await prisma.cronogramaTarefa.findMany({
        where: { cronogramaId: cron.id },
        select: {
          nome: true, area: true, departamento: true, isSummary: true,
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
        if (t.isSummary) continue; // linha de resumo do cronograma conta duas vezes o mesmo trabalho
        const chave = t.departamento || t.area || "Obra";
        const g = porSetor.get(chave) || { nome: String(chave).replace(/_/g, " "), tarefas: 0, soma: 0, inicio: null, fim: null };
        g.tarefas++;
        g.soma += Number(t.percentualRealizado) || 0;
        if (t.dataInicioPrevista && (!g.inicio || t.dataInicioPrevista < g.inicio)) g.inicio = t.dataInicioPrevista;
        if (t.dataFimPrevista && (!g.fim || t.dataFimPrevista > g.fim)) g.fim = t.dataFimPrevista;
        porSetor.set(chave, g);
      }
      // ⚠⚠ A LINHA DO TEMPO, e não quatro barras. Vitor (05/09/2026): "o cronograma que apresentamos
      // lá é muito simples, como podemos fazer para termos um cronograma mais elaborado e mais real
      // para que o cliente consiga acessar?". As frentes agregadas continuam (é o resumo), mas agora
      // vão junto as TAREFAS, com a área da obra a que pertencem — é o que permite desenhar quando
      // cada coisa acontece, em vez de só dizer que existe.
      const areasCron = Array.isArray(cron.areas) ? cron.areas.map((a2) => a2?.nome).filter(Boolean) : [];
      dados.cronograma = {
        titulo: cron.titulo,
        inicio: fmt(cron.dataInicio), fim: fmt(cron.dataFim),
        atualizadoEm: fmt(cron.ultimoSync),
        areas: areasCron,
        tarefas: tarefas
          .filter((t) => !t.isSummary && t.dataInicioPrevista && t.dataFimPrevista)
          .map((t) => ({
            nome: t.nome,
            setor: t.departamento || null,
            area: t.area || null,
            inicio: fmt(t.dataInicioPrevista), fim: fmt(t.dataFimPrevista),
            feito: Math.round(Number(t.percentualRealizado) || 0),
          })),
        frentes: [...porSetor.values()]
          .sort((a2, b2) => (a2.inicio && b2.inicio ? a2.inicio - b2.inicio : 0))
          .map((g) => ({
            nome: g.nome, tarefas: g.tarefas,
            inicio: fmt(g.inicio), fim: fmt(g.fim),
            percentual: Math.round(g.soma / Math.max(1, g.tarefas)),
          })),
      };

      // ── ONDE A OBRA ESTÁ, MEDIDO ────────────────────────────────────────────────────────────
      //
      // ⚠⚠ Não é percentual digitado: é a distribuição das peças pelas etapas, do apontamento da
      // fábrica (`etapaDasMarcas`, a MESMA leitura do modelo 3D — duas fontes dariam duas respostas
      // para a mesma obra). Cada peça está em UMA etapa, a mais avançada dela, então a soma fecha
      // 100% e nada é contado duas vezes.
      //
      // ⚠ Por que não "kg apontado por setor sobre o peso da obra": o `pesoProduzido` do Syneco
      // acumula reapontamento — na OP-106 o Jato soma 10.620 kg numa obra de 10.145 kg, e a barra
      // passaria de 100%. Distribuição não tem esse defeito.
      if (op?.id) {
        try {
          const todas = await prisma.pecaConjunto.findMany({
            where: { opId: op.id },
            select: { fonte: true, tipoPeca: true, pesoTotalKg: true, marca: true },
            take: 8000,
          });
          const base = pecasTekla(todas);           // conjuntos + avulsas da LPC, sem croqui
          const kgTotal = base.reduce((acc, x) => acc + (Number(x.pesoTotalKg) || 0), 0);
          if (base.length && kgTotal > 0) {
            const mapa = await etapaDasMarcas(op.id, [...new Set(todas.map((x) => x.marca).filter(Boolean))]);
            const dist = new Map();
            let semN = 0, semKg = 0;
            for (const x of base) {
              const e = mapa.get(x.marca);
              const kg = Number(x.pesoTotalKg) || 0;
              if (!e) { semN++; semKg += kg; continue; }
              // ⚠ "Corte" e "Preparação" são a mesma etapa para quem olha de fora
              const k = e === "Corte" ? "Preparação" : e;
              const g = dist.get(k) || { n: 0, kg: 0 };
              g.n++; g.kg += kg; dist.set(k, g);
            }
            const ORDEM = ["Preparação", "Montagem", "Solda", "Acabamento", "Jato", "Pintura"];
            dados.cronograma.onde = {
              pecas: base.length, kg: Math.round(kgTotal),
              etapas: ORDEM.filter((k) => dist.has(k)).map((k) => ({
                nome: k, pecas: dist.get(k).n, kg: Math.round(dist.get(k).kg),
                pct: Math.round((dist.get(k).kg / kgTotal) * 100),
              })),
              naoIniciada: { pecas: semN, kg: Math.round(semKg), pct: Math.round((semKg / kgTotal) * 100) },
            };
          }

          // ── EMBARQUES ─────────────────────────────────────────────────────────────────────────
          // ⚠ romaneio EMITIDO é o que saiu; o resto é PROGRAMADO. Chamar tudo de "embarcado" seria
          // prometer ao cliente uma carga que ainda está no pátio.
          const romaneios = await prisma.romaneioPrevio.findMany({
            where: { opId: op.id, status: { not: "CANCELADO" } },
            select: { numero: true, dataPrevista: true, pesoKg: true, emitidoEm: true, aprovadoEm: true },
            orderBy: [{ dataPrevista: "asc" }, { numero: "asc" }],
            take: 60,
          });
          if (romaneios.length) {
            const pesoLista = Math.round(pesoRealPecas(todas));
            dados.cronograma.embarques = {
              pesoLista,
              lista: romaneios.map((r) => ({
                numero: r.numero,
                data: fmt(r.dataPrevista),
                peso: Math.round(Number(r.pesoKg) || 0),
                situacao: r.emitidoEm ? "EMBARCADO" : r.aprovadoEm ? "LIBERADO" : "PROGRAMADO",
              })),
              embarcado: Math.round(romaneios.filter((r) => r.emitidoEm).reduce((acc, r) => acc + (Number(r.pesoKg) || 0), 0)),
              programado: Math.round(romaneios.reduce((acc, r) => acc + (Number(r.pesoKg) || 0), 0)),
            };
          }
        } catch { /* o cronograma vale sozinho: medição indisponível não derruba a seção */ }
      }
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
  // ⚠ O R VEM NA FRENTE. Vitor (22/08/2026): "o mais importante precisa ter o número da
  // rastreabilidade; na descrição dos certificados hoje você traz lote e corrida".
  //
  // Ele está certo, e a razão é do processo: o R é o que amarra a peça ao material. Da peça
  // chega-se ao R, do R à corrida, da corrida ao certificado e à nota fiscal. Sem ele, o cliente
  // tem uma lista de certificados solta — não consegue partir de uma peça montada no canteiro e
  // provar de que aço ela é.
  if (tem("CERTIFICADOS")) {
    const certs = await prisma.documentoQualidade.findMany({
      where: { opNumero: portal.opNumero, ativo: true, categoria: "MATERIAL" },
      select: {
        id: true, nome: true, importRef: true, numeroDocumento: true, numeroCorrida: true,
        fornecedor: true, norma: true, sharepointItemId: true, arquivoUrl: true,
      },
      orderBy: [{ importRef: "asc" }, { nome: "asc" }],
      take: 500,
    });
    dados.certificados = certs.map((c) => ({
      id: c.id, r: c.importRef || null, material: c.nome, certificado: c.numeroDocumento,
      corrida: c.numeroCorrida, fornecedor: c.fornecedor, norma: c.norma,
      // só oferece download do que tem arquivo de verdade atrás
      baixavel: !!(c.sharepointItemId || c.arquivoUrl),
    }));
  }

  // ── data book: os volumes prontos ──
  //
  // ⚠⚠ SÓ DEPOIS DO ACEITE — e antes desta trava não havia trava nenhuma.
  // A consulta não filtrava status: bastava existir volume gerado para o portal listar. Medido em
  // 24/08/2026: a OP-067 estava mostrando ao cliente 18 volumes de um data book EM_MONTAGEM, sem
  // uma assinatura sequer na cadeia. Não vazava conteúdo (não havia download), mas dizia que o
  // livro existe e o tamanho dele enquanto ainda estava sendo montado.
  //
  // Vitor (24/08/2026) escolheu liberar no portal DEPOIS do aceite, com download. `ACEITO` é
  // gravado pela última assinatura da cadeia (Elaborador → Inspetor → Resp. Técnico → Cliente),
  // então checar o status aqui é checar as quatro de uma vez.
  if (tem("DATABOOK")) {
    // ⚠⚠ DOIS DOCUMENTOS DIFERENTES, NUNCA AO MESMO TEMPO. Vitor (31/08/2026): "o que deve
    // aparecer para o cliente é exatamente o rascunho; o emitido vai somente depois para ele,
    // quando terminar todas as assinaturas".
    //   ACEITO             → o livro final, assinado pelos quatro. É o que fica.
    //   em conferência     → o RASCUNHO, para ele apontar erro antes de emitirmos. A capa dele já
    //                        diz STATUS: RASCUNHO e o arquivo baixa como "(rascunho)".
    // O aceito tem precedência: se o livro já acabou, é ele que o cliente vê — mostrar um rascunho
    // ao lado de um documento assinado só criaria dúvida sobre qual vale.
    const CAMPOS = { id: true, revisao: true, status: true, emitidoEm: true, aceiteEm: true,
                     avaliacaoEnviadaEm: true, avaliacaoOkEm: true, avaliacaoOkNome: true, avaliacaoObs: true };
    let book = await prisma.dataBookQualidade.findFirst({
      where: { opNumero: portal.opNumero, status: "ACEITO" }, select: CAMPOS,
    });
    if (!book) {
      book = await prisma.dataBookQualidade.findFirst({
        where: { opNumero: portal.opNumero, avaliacaoEnviadaEm: { not: null }, status: { not: "ACEITO" } },
        orderBy: { revisao: "desc" }, select: CAMPOS,
      });
    }
    if (book) {
      const vols = await prisma.dataBookArquivo.findMany({
        where: { dataBookId: book.id, revisao: book.revisao },
        orderBy: { volume: "asc" },
        select: { volume: true, titulo: true, paginas: true, tamanho: true },
      });
      dados.databook = {
        revisao: book.revisao, status: book.status, emitidoEm: fmt(book.emitidoEm),
        aceiteEm: fmt(book.aceiteEm),
        emAvaliacao: book.status !== "ACEITO",   // é o rascunho posto para conferência
        avaliacaoEnviadaEm: fmt(book.avaliacaoEnviadaEm),
        avaliacaoOkEm: fmt(book.avaliacaoOkEm),
        avaliacaoOkNome: book.avaliacaoOkNome || null,
        avaliacaoObs: book.avaliacaoObs || null,
        volumes: vols,
      };
    }
  }

  // ── LPC e LE: as duas listas da Engenharia ──
  //
  // ⚠ SÃO DUAS LISTAS DIFERENTES, e o que separa é a `fonte`: LPC_IMPORT é a lista de produção
  // (conjuntos e peças a fabricar); LE_IMPORT é a lista de expedição (o que embarca). Confundir
  // as duas mostraria ao cliente a lista errada com o rótulo certo — o pior tipo de erro num
  // documento que ele usa para conferir o que vai receber.
  // ⚠ PESO É PREÇO, e por isso o corte é no SERVIDOR. Vitor (22/08/2026): "a lista LPC e LE deixe
  // a opção de divulgar com e sem peso". Esconder a coluna só na tela deixaria o número viajando na
  // resposta da API — qualquer um que abrisse as ferramentas do navegador leria a base de cálculo
  // do nosso preço por kg. O que não se divulga não sai daqui.
  const comPeso = portal.mostrarPeso === true;

  // ⚠ A TELA MOSTRA UM PEDAÇO, O ARQUIVO TEM TUDO. Vitor (22/08/2026): "a LE e LPC deve ter
  // permissão para o cliente baixar". Uma LPC de obra grande passa de mil marcas: rolar isso numa
  // página não é conferir nada. A tela dá as primeiras 200 pra ele reconhecer a lista; conferir de
  // verdade é na planilha, que sai completa em /api/portal/[token]/lista.
  const listaDe = async (chave) => {
    const pecas = await pecasDaLista(prisma, op.id, chave);
    // A foto da revisão é tirada aqui, na visita do cliente — ver lib/portal-listas.
    // ⚠ no preview interno NÃO se tira foto: revisão é o histórico do que o cliente viu, e nós
    // abrimos esta página dezenas de vezes por dia enquanto montamos o portal.
    const rev = preview
      ? await prisma.portalListaRevisao.findFirst({ where: { opId: op.id, fonte: chave }, orderBy: { seq: "desc" } }).catch(() => null)
      : await sincronizarRevisao(prisma, { opId: op.id, opNumero: portal.opNumero, chave, pecas }).catch(() => null);
    return {
      total: pecas.length,
      comPeso,
      // ⚠⚠ SÓ O NÍVEL 0 SOMA. Com as subpeças na lista, somar tudo conta o MESMO aço duas vezes —
      // o peso do conjunto já é a soma dos croquis dele (regra da casa). O total dobraria no dia em
      // que as subpeças entraram, e ninguém ligaria uma coisa à outra.
      pesoKg: comPeso ? Math.round(pecas.filter((p) => !p.nivel).reduce((sm, p) => sm + (p.pesoTotalKg || 0), 0)) : null,
      itens: pecas.slice(0, 500).map((p) => ({
        marca: p.marca, descricao: p.descricao || p.perfil || "—",
        // ⚠ o nível vai junto: sem ele a tela não sabe que a linha é peça DE um conjunto, e a LPC
        // vira uma lista chapada onde ninguém enxerga o que compõe o quê.
        nivel: p.nivel || 0, conjunto: p.conjunto || null,
        material: p.material || null, qtd: p.qte,
        ...(comPeso ? { pesoKg: Math.round(p.pesoTotalKg || 0) } : {}),
      })),
      revisao: revisaoParaOCliente(rev, comPeso, { clienteViuEm }),
    };
  };
  if (tem("LPC") && op?.id) dados.lpc = await listaDe("LPC");
  if (tem("LE") && op?.id) dados.le = await listaDe("LE");

  // ── COMPRAS: o andamento do material da obra ──
  //
  // ⚠ O QUE O CLIENTE QUER SABER É "CHEGOU?". Vitor (22/08/2026): "Tabela de compras onde traz as
  // informações do status de compra da obra, data que chegou, número do pedido e a
  // rastreabilidade". Por isso a tabela não repete a cozinha do Compras (cotação, fornecedor,
  // preço): mostra material, status, pedido, data de chegada e o R que rastreia até o certificado.
  if (tem("COMPRAS") && op?.id) {
    const rms = await prisma.rM.findMany({
      where: { opId: op.id },
      select: {
        numero: true,
        itens: {
          select: {
            descricao: true, qtd: true, peso: true, unidade: true, status: true,
            recebimentos: {
              select: { qtdRecebida: true, nfNumero: true, dataRecebimento: true },
              orderBy: { dataRecebimento: "desc" }, take: 1,
            },
            pedidoOmie: { select: { numeroPedido: true, dataEntregaReal: true, statusEntrega: true, status: true, nfNumero: true } },
          },
        },
      },
      take: 200,
    });

    // ⚠ O R NÃO MORA NA RM. A RM é o pedido de compra; o R nasce no CMR, quando o material é
    // recebido e o certificado entra. O elo entre os dois é o NOME DO MATERIAL — imperfeito, mas
    // é o que existe, e uma coluna vazia ensinaria que a obra não tem rastreabilidade quando ela
    // tem. Sem casamento, sai "—" em vez de um R errado.
    const normal = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const certsDaOP = await prisma.documentoQualidade.findMany({
      where: { opNumero: portal.opNumero, ativo: true, categoria: "MATERIAL", importRef: { not: null } },
      select: { nome: true, importRef: true, numeroCorrida: true, dataRecebimento: true, nfNumero: true },
      take: 800,
    });
    const rPorMaterial = new Map();
    for (const c of certsDaOP) {
      const k = normal(c.nome);
      if (k && !rPorMaterial.has(k)) rPorMaterial.set(k, { r: c.importRef, corrida: c.numeroCorrida, em: c.dataRecebimento, nf: c.nfNumero });
    }
    const acharR = (desc) => {
      const k = normal(desc);
      if (!k) return null;
      if (rPorMaterial.has(k)) return rPorMaterial.get(k);
      // casamento por prefixo: "CHAPA ACO CARBONO A36 ESP 4,75" vs "CHAPA ACO CARBONO A36"
      for (const [chave, v] of rPorMaterial) {
        if (chave.length > 12 && (k.startsWith(chave) || chave.startsWith(k))) return v;
      }
      return null;
    };

    const ROTULO = {
      RECEBIDO: "Recebido", COMPRADO: "Comprado", ESTOQUE: "Atendido do estoque",
      EM_COTACAO: "Em cotação", NAO_COMPRADO: "A comprar", CANCELADO: "Cancelado",
    };
    const linhas = [];
    for (const rm of rms) {
      for (const it of rm.itens) {
        const ped = it.pedidoOmie;
        const receb = (it.recebimentos || [])[0] || null;
        const revertido = ped?.status === "REVERTIDO";
        const chegou = !!receb?.dataRecebimento || !!ped?.dataEntregaReal
          || ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(ped?.statusEntrega);
        let st;
        if (it.status === "CANCELADO") st = "CANCELADO";
        else if (it.status === "ATENDIDO_ESTOQUE") st = "ESTOQUE";
        else if (it.status === "PEDIDO_GERADO" && !revertido) st = chegou ? "RECEBIDO" : "COMPRADO";
        else if (["EM_COTACAO", "COTADO"].includes(it.status)) st = "EM_COTACAO";
        else st = "NAO_COMPRADO";
        if (st === "CANCELADO") continue; // item cancelado não é informação para o cliente
        // ⚠⚠ DATA DE CHEGADA SÓ EM LINHA QUE CHEGOU. Vitor (02/09/2026), olhando o portal da
        // OP-112: "essa lista já tem data de recebimento, por que não está como recebido?".
        //
        // A data vinha do CMR pelo NOME do material, e o status vinha do recebimento do item —
        // duas fontes diferentes na mesma linha. Deu no que tinha que dar: "Comprado" ao lado de
        // "31/08/2026" e de um R. Para quem lê, uma das duas colunas está mentindo.
        //
        // E o casamento por nome é otimista de propósito: ele acha o R do MATERIAL, não daquele
        // item. Na 112 há três linhas do mesmo perfil UDCE 150x75x20x4,75 (39, 131 e 165 kg) e o
        // CMR trouxe 178 kg — as duas primeiras fecham, a terceira recebeu 7,6 kg dos 165. As três
        // exibiam a mesma data, como se as três tivessem chegado.
        //
        // O R continua vindo do nome (rastreabilidade é do material, e uma coluna vazia ensinaria
        // que a obra não tem rastreio quando tem). A DATA passa a exigir que a linha esteja
        // recebida — senão sai "—", que é a verdade.
        const m = acharR(it.descricao);
        linhas.push({
          // ⚠ DE ONDE A OBRA PEDIU. Vitor (04/09/2026): "o bom também era listar a RM que foi
          // solicitada, para ficar fácil ver de onde foi solicitado". A RM já estava na consulta —
          // a tabela é montada a partir dela —, só não descia para a linha.
          rm: rm.numero,
          material: it.descricao,
          qtd: it.peso > 0 ? `${Math.round(it.peso)} kg` : `${it.qtd} ${it.unidade || ""}`.trim(),
          status: ROTULO[st] || st,
          pedido: ped?.numeroPedido || null,
          // ⚠⚠ A DATA VEM DO CMR, do mesmo lugar que o R. Vitor (26/08/2026): "você traz o R mas
          // não informa a data que chegou". Medido na OP-112: ZERO itens têm recebimento na RM ou
          // `dataEntregaReal` no pedido — a coluna era "—" em toda linha. Mas o CMR, que já é
          // consultado aqui para achar o R, guarda `dataRecebimento`: a data existia ao lado do
          // número que já estava na tela, e só não estava sendo lida.
          chegouEm: fmt(receb?.dataRecebimento || ped?.dataEntregaReal || (st === "RECEBIDO" ? m?.em : null)),
          // ⚠⚠ A NF SEGUE A DATA: vem do CMR quando não está no recebimento. Vitor (04/09/2026):
          // "no portal ainda falta o número da NF". Medido na OP-112: nenhum dos 8 pedidos tem
          // `nfNumero` e a RM não tem linha de recebimento — mas 100% do CMR das obras vivas tem a
          // nota. O número existia ao lado do R que já estava na tela, e só não estava sendo lido.
          //
          // ⚠ e só em linha RECEBIDA, pela mesma razão da data: mostrar a nota de um material que
          // chegou para outra linha diria que esta chegou.
          nf: receb?.nfNumero || ped?.nfNumero || (st === "RECEBIDO" ? m?.nf : null) || null,
          rastreio: m?.r || null, corrida: m?.corrida || null,
        });
      }
    }
    const conta = (r) => linhas.filter((l) => l.status === r).length;
    // ⚠⚠ AS FOTOS DO RECEBIMENTO, agrupadas por NOTA FISCAL. Vitor (04/09/2026): "precisa ficar
    // dentro da aba de compras do painel do cliente". Por NF e não por pedido porque é a nota que o
    // cliente enxerga na tabela acima — é assim que ele liga a foto à linha que está lendo.
    //
    // ⚠ SÓ A IMAGEM E A DATA. A observação interna do documento diz fornecedor e nº do pedido; aqui
    // desce só o que prova a chegada, sem a nossa cadeia junto.
    let fotosRecebimento = [];
    if (tem("RECEBIMENTO_FOTOS")) {
      const fotos = await prisma.documentoQualidade.findMany({
        where: { categoria: "EVIDENCIA_RECEBIMENTO", opNumero: portal.opNumero, ativo: true },
        select: { id: true, arquivoUrl: true, nfNumero: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 200,
      }).catch(() => []);
      const porNf = new Map();
      for (const f of fotos) {
        const k = f.nfNumero || "—";
        if (!porNf.has(k)) porNf.set(k, { nf: f.nfNumero || null, fotos: [] });
        porNf.get(k).fotos.push({ id: f.id, url: f.arquivoUrl, em: f.createdAt ? f.createdAt.toISOString() : null });
      }
      fotosRecebimento = [...porNf.values()];
    }

    dados.compras = {
      total: linhas.length,
      fotos: fotosRecebimento,
      recebidos: conta("Recebido"),
      // ⚠ A ORDEM É A DA OBRA, NÃO A ALFABÉTICA. Vitor (26/08/2026): "deixe os perfis nas
      // primeiras linhas, depois os acessórios como telhas, calhas, rufos, depois o lanternim e por
      // último os parafusos". Em ordem alfabética a lista abria com ARRUELA e AUTOBROCANTE — três
      // telas de fixador antes do primeiro perfil, e a impressão é de uma obra feita de parafuso.
      // ⚠ a RM só desce quando a obra escolheu mostrá-la (seção RASTREIO_RM) — a mesma trava do
      // painel da peça no 3D, para as duas telas contarem a mesma história.
      itens: linhas.map((l) => (tem("RASTREIO_RM") ? l : { ...l, rm: null }))
        .sort((a2, b2) => ordenarCompras(a2.material, b2.material)).slice(0, 400),
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
  // ⚠ os documentos da ENGENHARIA escolhidos da 2.5.5 — vêm do que foi marcado, não de uma
  // varredura. Ver /api/portal/engenharia-docs. (Vitor, 26/08/2026)
  if (tem("DOCUMENTOS")) {
    // ⚠ POR ÁREA e com o NOME DE EXIBIÇÃO. Vitor (26/08/2026): "me dê a opção de renomear os
    // arquivos para que o cliente veja um nome mais adequado do que o nome original". O nome do
    // arquivo é interno — "T112-PM-01_R00.pdf" é a nossa nomenclatura, não a linguagem do cliente.
    const mapa = portal.docsPorArea || (portal.docsEngenharia ? { ENGENHARIA: portal.docsEngenharia } : {});
    dados.docsPorArea = {};
    for (const [ar, lista] of Object.entries(mapa || {})) {
      if (!Array.isArray(lista) || !lista.length) continue;
      const item = (d) => ({ id: d.id, nome: d.nomeExibicao || d.nome, arquivo: d.nome, tamanho: Number(d.tamanho) || 0, eng: true });

      // ⚠ MESMO NOME = MESMO DOCUMENTO. O mesmo desenho escolhido de duas pastas tem dois ids e
      // aparecia duas vezes na lista do cliente — que lê como se fossem revisões diferentes. A
      // gravação já deduplica; aqui é a rede embaixo, para as obras que já estão publicadas.
      const unicos = (lista) => {
        const m = new Map();
        for (const d of lista) m.set(String(d.nomeExibicao || d.nome).trim().toLowerCase(), d);
        return [...m.values()];
      };

      // ⚠⚠ A ENGENHARIA SAI PELOS QUATRO TIPOS, não pela pasta de origem. Vitor (26/08/2026):
      // "na Engenharia apenas permitir o Modelo 3D, memorial de cálculo, ART e Diagramas de
      // montagem — criar uma forma de ficar separado". Agrupar pela pasta do servidor dava ao
      // cliente títulos como "Montagem / Projetos de Montagem" e "Memorial de Cálculo e ART" —
      // a nossa arrumação de arquivos, não o nome do documento que ele procura.
      //
      // ⚠ O QUE NÃO É UM DOS QUATRO NÃO VAI AO AR, mesmo escolhido antes desta regra: é o caso da
      // `T112A-LPC_R00.xlsx` que estava publicada na OP-112 — a LPC crua, com o peso item a item.
      if (ar === "ENGENHARIA") {
        const { porTipo } = agruparEngenharia(unicos(lista));
        dados.docsPorArea[ar] = TIPOS_ENGENHARIA
          .filter((t) => (porTipo.get(t.id) || []).length)
          .map((t) => ({
            assunto: t.nome,
            itens: porTipo.get(t.id).slice().sort(ordemDeProjeto).map(item),
            subpastas: subpastasDe(porTipo.get(t.id), item),
          }));
        if (!dados.docsPorArea[ar].length) delete dados.docsPorArea[ar];
        continue;
      }

      const porPasta = new Map();
      for (const d of unicos(lista)) {
        const k = d.pasta || "Documentos";
        const g = porPasta.get(k) || { assunto: k, itens: [] };
        g.crus = g.crus || [];
        g.crus.push(d);
        porPasta.set(k, g);
      }
      dados.docsPorArea[ar] = [...porPasta.values()].map((g) => ({
        assunto: g.assunto,
        itens: (g.crus || []).slice().sort(ordemDeProjeto).map(item),
      }));
    }
    dados.engenharia = dados.docsPorArea.ENGENHARIA || null;
  }

  // ⚠⚠ PLANO DE CONTROLE ≠ DOCUMENTO TÉCNICO. Vitor (26/08/2026) separou: PIT e PLP vão para a
  // QUALIDADE (são plano de controle — o que se inspeciona e como se pinta); ART e memorial de
  // cálculo ficam na ENGENHARIA (responsabilidade técnica de projeto). Antes tudo caía num bloco
  // só chamado "Documentos", e o cliente procurava o plano de inspeção no meio das ARTs.
  const RX_PLANO = /\b(PIT|PLP)\b|plano de (inspe|pintura)/i;

  if (tem("PLANOS")) {
    const planos = await prisma.documentoQualidade.findMany({
      where: { opNumero: portal.opNumero, ativo: true, categoria: { in: ["ANEXO", "SISTEMA"] } },
      select: { id: true, nome: true, tipo: true },
      orderBy: [{ nome: "asc" }],
      take: 100,
    });
    const doPlano = planos.filter((d) => RX_PLANO.test(`${d.tipo || ""} ${d.nome || ""}`));
    if (doPlano.length) {
      dados.planos = [{ assunto: "Planos de controle", total: doPlano.length, itens: doPlano.map((d) => ({ id: d.id, nome: d.nome })) }];
    }

    // ⚠⚠ O ACEITE DO CLIENTE APARECE AQUI. Vitor (26/08/2026): "e já fique mostrando o status no
    // portal do cliente; o PIT também deve conter o aceite por parte do cliente, não pode deixar de
    // ter esse aceite".
    //
    // ⚠ O LINK DE ACEITE É DA PESSOA, não do portal: sai só para quem tem `?d=` e é destinatário
    // daquele envio. Um botão de aceitar aberto no portal deixaria qualquer um com o link
    // aprovando o plano de inspeção da obra em nome do cliente.
    const st = await statusDosPlanos(prisma, portal.opNumero).catch(() => null);
    if (st && (st.PIT.enviado || st.PLP.enviado)) {
      const eu = codigoDoLink ? await destinatarioDoCodigo(codigoDoLink, portal.id).catch(() => null) : null;
      const meuToken = async (envioId) => {
        if (!eu?.email || !envioId) return null;
        const a = await prisma.assinaturaDocumento.findFirst({
          where: { envioId, email: { equals: eu.email, mode: "insensitive" }, assinadoEm: null },
          select: { token: true },
        }).catch(() => null);
        return a?.token || null;
      };
      dados.planosAceite = {};
      for (const doc of ["PIT", "PLP"]) {
        const d = st[doc];
        if (!d.enviado) continue;
        dados.planosAceite[doc] = {
          titulo: d.titulo, revisao: d.revisao, enviadoEm: d.enviadoEm,
          aceito: d.aceito, aceitoEm: d.aceitoEm, aceitoPor: d.aceitoPor,
          tokenDoAceite: d.aceito ? null : await meuToken(d.envioId),
        };
      }
    }
  }

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
      // ⚠ o que é plano de controle sai daqui: ele tem bloco próprio, na Qualidade.
      if (RX_PLANO.test(`${doc.tipo || ""} ${doc.nome || ""}`)) continue;
      const assunto = String(doc.tipo || "Documentos da obra").replace(/^Anexo\s*[—-]\s*/i, "").trim();
      const g = porAssunto.get(assunto) || { assunto, itens: [] };
      g.itens.push({ id: doc.id, nome: doc.nome });
      porAssunto.set(assunto, g);
    }
    dados.documentos = [...porAssunto.values()]
      .map((g) => ({ assunto: g.assunto, total: g.itens.length, itens: g.itens.slice(0, 12) }))
      .sort((a2, b2) => a2.assunto.localeCompare(b2.assunto, "pt-BR"));
  }

  if (!preview) {
    await prisma.portalCliente.update({
      where: { id: portal.id },
      data: {
        acessos: { increment: 1 },
        ultimoAcessoEm: new Date(),
        ...(portal.primeiroAcessoEm ? {} : { primeiroAcessoEm: new Date() }),
      },
    }).catch(() => { /* contar acesso nunca pode derrubar a página do cliente */ });

    // ⚠ e QUEM abriu, pelo código do link do e-mail. Sem `?d=`, o acesso fica anônimo — que também é
    // informação: quer dizer que a pessoa entrou por um link repassado, não pelo e-mail que enviamos.
    await registrarAcesso(req, { portal, codigo: codigoDoLink, evento: "ABERTURA" });
  }

  return NextResponse.json({
    op: op ? { numero: op.numero, cliente: op.cliente, obra: op.obra, refCliente: op.refCliente } : { numero: portal.opNumero },
    portal: {
      contato: portal.contato, empresa: portal.empresa, mostrarPeso: comPeso,
      // sem capa escolhida, entra a do repositório: portal que abre em branco passa a
      // impressão contrária à que ele existe para dar
      capaUrl: portal.capaUrl || CAPA_PADRAO,
      logoClienteUrl: portal.logoClienteUrl || null,
      mensagem: portal.mensagem || mensagemPadrao({ cliente: op?.cliente }),
      fotos: Array.isArray(portal.fotos) ? portal.fotos : [],
      secoes: ativas,
    },
    dados,
  });
}
