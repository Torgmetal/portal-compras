// ─── O QUE O CLIENTE VÊ ───────────────────────────────────────────────────────
// Vitor (22/08/2026): "vamos fornecer documentos, listas de compras, cronograma, LPC,
// LE, certificados de qualidade, relatórios — tudo que for de interesse nosso em
// mostrar e que seja interesse dele receber".
//
// As duas metades dessa frase são a regra: interesse NOSSO em mostrar e interesse DELE
// em receber. Por isso cada seção liga e desliga por obra — e o padrão liga só o que
// serve a qualquer contrato. Pull-off, salinidade e lista de compras são exemplos de
// coisa que uma obra quer e outra não.
//
// ⚠ NADA AQUI É CADASTRO NOVO. Toda seção lê o que os módulos já mantêm: o cronograma
// do Planejamento, a LPC da Engenharia, os certificados do Controle de Documentos, os
// relatórios aprovados da Qualidade, os volumes do data book. Um portal que pedisse
// para alguém "publicar" de novo o que já existe desatualizaria no primeiro mês.

/**
 * As capas que já temos no repositório.
 *
 * ⚠ O PORTAL NUNCA ABRE SEM ARTE. Se a obra não escolheu nada, entra uma destas — página
 * institucional que abre em branco passa a impressão contrária à que ela existe para dar.
 * São fotos de estrutura da própria Torg, então servem a qualquer obra.
 */
export const CAPAS = [
  { url: "/obras/planta-industrial.jpg", nome: "Planta industrial" },
  { url: "/obras/ponte-trelica.jpg", nome: "Ponte em treliça" },
  { url: "/obras/torre-escada.jpg", nome: "Torre e escada" },
  { url: "/obras/ponte-sunset.jpg", nome: "Ponte ao entardecer" },
];

export const CAPA_PADRAO = CAPAS[0].url;

// ⚠ TUDO LIGADO POR PADRÃO, e a correção vale registro. Eu tinha deixado LPC, LE e
// COMPRAS desligadas raciocinando "depende do contrato" — mas o Vitor nomeou as três no
// pedido original ("documentos, listas de compras, cronograma, LPC, LE, certificados").
// O efeito prático foi ele abrir o portal e não achar o que pediu, sem erro nenhum na
// tela: as caixas simplesmente nasciam vazias. Padrão que esconde o que foi pedido é
// pior que padrão exagerado — desmarcar é um clique, descobrir que falta é uma conversa.
// ─── AS ÁREAS DA OBRA ─────────────────────────────────────────────────────────
// Vitor (26/08/2026): "no portal do cliente preciso que separe abas por áreas da obra: Engenharia,
// Compras, Planejamento, Qualidade e Expedição — em cada aba teremos documentos relacionados a
// isso".
//
// ⚠ A ORDEM É A DA OBRA, não a alfabética: é assim que a obra acontece, e é assim que o cliente
// procura. Quem abre o portal atrás do cronograma não vai olhar em "Compras" porque começa com C.
//
// ⚠ ABA VAZIA NÃO APARECE. Portal de obra que ainda não comprou nada mostrando "Compras (0)" faz o
// cliente clicar para não achar nada — e a primeira impressão do portal é justamente o que o Vitor
// quer proteger ("acessam a página e já ficam surpresos logo de cara").
export const AREAS = [
  { id: "ENGENHARIA", nome: "Engenharia", resumo: "Listas, desenhos e documentos técnicos da obra." },
  // ⚠ ABA PRÓPRIA, ao lado da Engenharia. Vitor (03/09/2026): "quero uma aba ao lado do da
  // engenharia para o modelo ficar nela". Faz sentido pelo uso: documento se baixa, modelo se
  // navega — e navegar dentro de uma lista de downloads é o que apertava a tela.
  { id: "MODELO", nome: "Modelo 3D", resumo: "A obra em três dimensões, para girar, clicar e perguntar." },
  { id: "COMPRAS", nome: "Compras", resumo: "O material da obra: o que foi solicitado, pedido e recebido." },
  { id: "PLANEJAMENTO", nome: "Planejamento", resumo: "O cronograma e o avanço de cada fase." },
  { id: "QUALIDADE", nome: "Qualidade", resumo: "Certificados, relatórios de inspeção, PLP e o Data Book." },
  { id: "EXPEDICAO", nome: "Expedição", resumo: "O que já embarcou e o que falta." },
];
export const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// ─── QUEM ESCOLHE DOCUMENTO DO SERVIDOR ───────────────────────────────────────
// Vitor (27/08/2026): "pode tirar o acesso por hora da pasta da expedição, apenas listar a LE no
// portal do cliente" — e, antes, o mesmo para Compras e Planejamento.
//
// ⚠⚠ ONDE O PORTAL JÁ PUBLICA, NÃO SE ESCOLHE ARQUIVO. A Expedição já sai como Lista de Expedição,
// o Planejamento como cronograma e o Compras como o andamento do material — tudo gerado do que os
// módulos mantêm, sempre atualizado. Um seletor de pasta ao lado disso só serve para alguém
// publicar a versão de ontem em PDF e o cliente ficar com duas verdades. Restam Engenharia (os
// quatro documentos, cada um na sua pasta) e Qualidade (só PDF).
export const AREAS_COM_SELETOR = ["ENGENHARIA", "QUALIDADE"];

// ─── OS QUATRO DOCUMENTOS DA ENGENHARIA ───────────────────────────────────────
// Vitor (26/08/2026): "vamos restringir a permissão de importação de arquivos; na Engenharia
// apenas permitir o Modelo 3D, memorial de cálculo, ART e Diagramas de montagem — criar uma forma
// de ficar separado e que eu consiga acessar as pastas respectivas para pegar esses documentos e
// renomear".
//
// ⚠⚠ AQUI A PASTA É TRAVA, NÃO ATALHO — e é a diferença desta tela para as outras quatro áreas.
// Antes a Engenharia navegava a OP inteira, e o que saiu disso está no portal da OP-112: entre os
// 17 documentos escolhidos foi a `T112A-LPC_R00.xlsx`, a LPC crua da pasta, com o peso item a item
// — "peso é preço" (Vitor, 22/08). Uma pasta aberta não erra sozinha; erra quando quem escolhe
// está com pressa e o arquivo tem nome parecido com o certo.
//
// ⚠ CADA TIPO TEM MAIS DE UMA PASTA PORQUE A OBRA TEM. O memorial nasce em `2.2 Memória de
// Cálculo` (por revisão: A, B, C) e a via que vai ao cliente é copiada para `2.5.5`; a ART é
// arquivada no Data Book (`8. Qualidade`) e também copiada para a `2.5.5`. Apontar para uma só
// pasta obrigaria a escolher entre "onde o documento nasce" e "onde ele está pronto" — e a resposta
// muda por obra. As duas entram, e o arquivo repetido nas duas aparece uma vez só.
//
// ⚠ O CAMINHO CASA POR CÓDIGO, não pelo nome. "2.5.5 Cliente" numa obra é "2.5.5 Cliente (ENC 326)"
// noutra, e "Memória de Calculo" aparece com e sem acento. O número da pasta é o que não muda.
export const TIPOS_ENGENHARIA = [
  {
    id: "MODELO_3D", nome: "Modelo 3D",
    resumo: "O modelo da estrutura, como a Engenharia entregou (IFC, STEP).",
    onde: "2.5.3 Modelo 3D",
    pastas: [["2", "2.5", "2.5.3"], ["2", "2.8"]],
  },
  {
    id: "MEMORIAL", nome: "Memorial de cálculo",
    resumo: "O memorial da estrutura, na revisão que vale.",
    onde: "2.2 Memória de Cálculo",
    pastas: [["2", "2.2"], ["2", "2.5", "2.5.5", "memorial"]],
    // ⚠ SÓ PDF. Vitor (27/08/2026): "na parte do portal do cliente apenas listar os PDFs da pasta
    // memorial de cálculo". As pastas de revisão guardam o arquivo de TRABALHO junto — a OP-112 tem
    // três .dwg de unifilar na revisão A. O memorial que vai ao cliente é o PDF assinado; os outros
    // são o caminho até ele, e listá-los é convidar a publicar o errado.
    extensoes: ["pdf"],
  },
  {
    id: "ART", nome: "ART",
    resumo: "A Anotação de Responsabilidade Técnica, assinada.",
    onde: "8. Qualidade › Data Book › 1 - ART",
    pastas: [["8", "4", "1", "1.1"], ["2", "2.5", "2.5.5", "memorial"]],
  },
  {
    id: "MONTAGEM", nome: "Diagramas de montagem",
    resumo: "Os diagramas que orientam a montagem no campo.",
    onde: "2.5.4 Montagem",
    pastas: [["2", "2.5", "2.5.4"]],
  },
  // ⚠⚠ PROJETOS DE FABRICAÇÃO — os conjuntos da obra. Vitor (01/09/2026): "precisamos colocar uma
  // seção logo abaixo do diagrama de montagem que seria os projetos de fabricação, são os conjuntos
  // da obra, precisa trazer os PDFs e DWG também".
  //
  // ⚠ FICA POR ÚLTIMO NA LISTA DE PROPÓSITO: a ordem deste array é a ordem das caixas na tela do
  // cliente, e ele pediu "logo abaixo do diagrama de montagem".
  //
  // ⚠⚠ LÊ A PASTA DO CLIENTE, NÃO A DA FÁBRICA. Vitor (01/09/2026): "sobre o projeto de fabricação
  // era bom pegar da pasta do cliente que está tudo separado".
  //
  // `2.5.5 Cliente / Fabricação` é a pasta que a Engenharia MONTA para enviar: o PDF e o DWG do
  // mesmo desenho lado a lado, já escolhidos. A `2.5.2 Fabricação` é a pasta de TRABALHO da fábrica
  // — tem revisão superada, croqui de sub-peça e o que o Tekla larga no caminho. Publicar a pasta de
  // trabalho seria pedir para o cliente receber revisão obsoleta.
  //
  // ⚠ Segmento numérico casa por CÓDIGO da pasta e segmento em texto casa por NOME sem acento
  // (ver `casaSegmento` em portal-eng-pastas): por isso "fabrica" acha "Fabricação".
  //
  // ⚠ PDF E DWG, e nada mais — a pasta pode ter arquivo de trabalho junto.
  {
    id: "FABRICACAO", nome: "Projetos de fabricação",
    resumo: "Os desenhos da obra para fabricação, em PDF e DWG.",
    onde: "2.5.5 Cliente › Fabricação",
    pastas: [["2", "2.5", "2.5.5", "fabrica"]],
    extensoes: ["pdf", "dwg"],
  },
];
export const TIPO_ENG = Object.fromEntries(TIPOS_ENGENHARIA.map((t) => [t.id, t]));
const TIPOS_IDS = TIPOS_ENGENHARIA.map((t) => t.id);

/**
 * A que tipo pertence um documento já escolhido.
 *
 * ⚠ EXISTE PORQUE A SELEÇÃO ANTIGA NÃO TEM TIPO. Os 17 documentos da OP-112 foram escolhidos
 * navegando a pasta à vontade, antes desta regra — jogá-los fora seria apagar o trabalho dele sem
 * avisar, e deixá-los soltos seria publicar fora dos quatro tipos. Classificar pelo nome coloca
 * cada um no lugar; o que não casar com nenhum aparece na tela para ele decidir, e não vai ao ar.
 */
// ⚠⚠ FRONTEIRA DE PALAVRA NÃO SERVE AQUI: `_` É LETRA PARA O REGEX. `\bART\b` não casa em
// "OP112_-_ART_assinado.pdf" nem `\bMC\b` em "TORRE328_..._ MC_577-R1.pdf" — que são os nomes
// REAIS dos dois documentos da OP-112. Com \b, os dois cairiam em "fora dos quatro tipos" e
// sumiriam do portal calados. Sigla, aqui, é o que está cercado por qualquer coisa que não seja
// letra ou número.
const sigla = (s) => new RegExp(`(^|[^A-Za-z0-9])${s}([^A-Za-z0-9]|$)`, "i");
const REGRAS = {
  ART: [sigla("ART"), /responsabilidade\s+t[ée]cnica/i],
  MEMORIAL: [sigla("MC"), /mem[óo]ri(a|al)\s*(de)?\s*c[áa]lculo/i, sigla("memorial")],
  MODELO_3D: [/\.(ifc|stp|step|nwd|skp|dwf)$/i, sigla("3D"), /tekla/i],
  MONTAGEM: [sigla("PM"), /montagem/i, /diagrama/i],
  // ⚠ o nome do conjunto é a MARCA ("T97A118.pdf"), que não diz "conjunto" nem "fabricação" — por
  // isso a regra do nome aceita o padrão da marca da Torg (T + número + letra + número). Sem ela,
  // todo desenho de conjunto cairia em "fora dos tipos" e sumiria calado.
  FABRICACAO: [/fabrica[çc]/i, sigla("conjunto"), /^T\d+[A-Z]*\d*\.(pdf|dwg)$/i],
};
const REGRAS_PASTA = {
  MODELO_3D: [/modelo\s*3d/i, /tekla/i],
  MONTAGEM: [/montagem/i],
  MEMORIAL: [/mem[óo]ri/i],
  ART: [],
  FABRICACAO: [/fabrica[çc]/i, /conjunto/i],
};

/** O nome combina com este tipo? (um nome pode combinar com mais de um — "Memorial e ART") */
export function combinaComTipo(nome, tipoId) {
  return (REGRAS[tipoId] || []).some((rx) => rx.test(String(nome || "")));
}

export function tipoDoDocEng(doc) {
  if (doc?.tipo && TIPO_ENG[doc.tipo]) return doc.tipo;
  const nome = String(doc?.nome || "");
  const pasta = String(doc?.pasta || "");
  for (const id of TIPOS_IDS) if (combinaComTipo(nome, id)) return id;
  for (const id of TIPOS_IDS) if ((REGRAS_PASTA[id] || []).some((rx) => rx.test(pasta))) return id;
  return null;
}

/** Os documentos da Engenharia separados nos quatro tipos, na ordem canônica. */
export function agruparEngenharia(lista) {
  const porTipo = new Map(TIPOS_IDS.map((id) => [id, []]));
  const fora = [];
  for (const d of lista || []) {
    const t = tipoDoDocEng(d);
    if (t) porTipo.get(t).push({ ...d, tipo: t });
    else fora.push(d);
  }
  return { porTipo, fora };
}

export const SECOES = [
  {
    id: "CRONOGRAMA", area: "PLANEJAMENTO", nome: "Cronograma da obra", padrao: true,
    resumo: "As frentes e o avanço de cada fase, como o Planejamento acompanha.",
  },
  {
    // ⚠ Vitor (05/09/2026): "na parte de escolher postar o cronograma deveria ter a opção de ser
    // esse detalhado ou o primeiro que criamos, aquele mais básico". Obra com cronograma bem
    // mantido merece a linha do tempo; obra cujo planejamento ainda está grosso fica melhor no
    // resumo — mostrar detalhe que não existe é expor a falha, não a informação.
    id: "CRONOGRAMA_DETALHE", area: "PLANEJAMENTO", nome: "Cronograma detalhado", padrao: true,
    depende: "CRONOGRAMA",
    resumo: "Linha do tempo por área, com o avanço medido na fábrica e os embarques. Desligado, o cliente vê só o resumo por frente.",
  },
  {
    id: "RELATORIOS", area: "QUALIDADE", nome: "Relatórios de inspeção", padrao: true,
    resumo: "Dimensional, solda, ultrassom, pintura e líquido penetrante — só os aprovados.",
  },
  {
    id: "CERTIFICADOS", area: "QUALIDADE", nome: "Certificados de qualidade", padrao: true,
    resumo: "Matéria-prima com número de corrida, fixadores, consumíveis e tintas.",
  },
  {
    id: "DATABOOK", area: "QUALIDADE", nome: "Data Book", padrao: true,
    resumo: "O dossiê da obra, em volumes, quando emitido.",
  },
  {
    id: "LPC", area: "ENGENHARIA", nome: "Lista de peças (LPC)", padrao: true,
    resumo: "Conjuntos e peças da Engenharia, com peso.",
  },
  {
    id: "LE", area: "EXPEDICAO", nome: "Lista de expedição (LE)", padrao: true,
    resumo: "O que foi embarcado e o que falta.",
  },
  {
    id: "COMPRAS", area: "COMPRAS", nome: "Materiais da obra", padrao: true,
    resumo: "O andamento das compras: solicitado, pedido, recebido.",
  },
  // ⚠⚠ O QUE APARECE NA RASTREABILIDADE DA PEÇA, item por item. Vitor (04/09/2026): "quero ter essa
  // liberdade de escolher no painel do cliente se quero mostrar a RM, se quero mostrar a NF".
  //
  // ⚠ O R, A CORRIDA, O CERTIFICADO E A NORMA NÃO ENTRAM AQUI: eles são o rastreio em si — é o que
  // o data book mostra e o que o cliente tem como conferir. Deixá-los desligáveis seria oferecer um
  // portal que promete rastreabilidade e não a entrega. O que se escolhe é o que vem DA COMPRA.
  {
    id: "RASTREIO_NF", area: "COMPRAS", nome: "Nota fiscal e peso comprado", padrao: true,
    resumo: "Na rastreabilidade de cada peça: o nº da NF de entrada e quantos kg foram comprados naquele R.",
  },
  {
    // ⚠ A FOTO DO MATERIAL CHEGANDO. Vitor (04/09/2026): "preciso ter como anexar fotos mesmo que
    // seja depois do recebimento, e precisa ficar dentro da aba de compras do painel do cliente".
    // Quem anexa continua sendo o Compras (no recebimento do pedido); aqui se escolhe se o cliente
    // vê — e, para ele, é a prova de que o material chegou.
    id: "RECEBIMENTO_FOTOS", area: "COMPRAS", nome: "Fotos do recebimento", padrao: true,
    resumo: "As fotos que o Compras anexa quando o material chega, por nota fiscal.",
  },
  {
    id: "RASTREIO_RM", area: "COMPRAS", nome: "Requisição (RM) e pedido de compra", padrao: true,
    resumo: "Mostra de onde a obra pediu o material e abre a RM sem valores. Desligado, some o nº da RM e o do pedido.",
  },
  {
    id: "DOCUMENTOS", area: "ENGENHARIA", nome: "Documentos da Engenharia", padrao: true,
    resumo: "ART, memorial de cálculo e os documentos técnicos da obra.",
  },
  {
    // ⚠ PLP E PIT SÃO DA QUALIDADE, NÃO DA ENGENHARIA. Vitor (26/08/2026): "para a qualidade você
    // deve puxar os documentos que estão na engenharia, como PLP e PIT, para podermos deixar na
    // qualidade, não na engenharia; onde listou ART, deixar ART e memorial de cálculo".
    //
    // Faz sentido pelo que cada um É: o PLP diz como pintar e o PIT diz o que inspecionar — os dois
    // são plano de CONTROLE, e quem responde por eles assina como Qualidade. ART e memorial de
    // cálculo são responsabilidade técnica de projeto, e ficam na Engenharia.
    id: "PLANOS", area: "QUALIDADE", nome: "Planos de controle (PIT e PLP)", padrao: true,
    resumo: "O plano de inspeção e o plano de pintura da obra, como foram aprovados.",
  },
  {
    id: "FOTOS", area: "QUALIDADE", nome: "Registro fotográfico", padrao: true,
    resumo: "A obra em imagens — fabricação, pintura, expedição.",
  },
  {
    // ⚠⚠ NÃO NASCE LIGADA, e é de propósito. Vitor (03/09/2026): "conseguimos ter a opção de
    // disponibilizar esse painel no portal do cliente". Opção, não padrão: abrir o modelo navegável
    // é decisão de obra — depende de o modelo estar na pasta 2.5.5 (a que vai ao cliente) e de a
    // numeração estar valendo. Ligar sozinho publicaria modelo de trabalho em obra que não pediu.
    id: "MODELO_NAVEGAVEL", area: "MODELO", nome: "Modelo 3D navegável", padrao: false,
    resumo: "A estrutura em 3D para girar e clicar: peso, marca, etapa, rastreabilidade e relatórios de cada peça.",
  },
  {
    // ⚠⚠ TAMBÉM DESLIGADO POR PADRÃO. O Torguinho do cliente responde só sobre as peças e o
    // andamento DESTA obra (ver lib/portal-assistente), mas quem decide se a obra tem um assistente
    // é quem publica o portal — há contrato em que toda pergunta passa por uma pessoa, de propósito.
    id: "ASSISTENTE", area: "MODELO", nome: "Perguntar ao Torguinho", padrao: false,
    resumo: "Um assistente que responde sobre as peças desta obra: peso, quantidade, etapa, expedição e rastreabilidade.",
  },
];

export const SECAO = Object.fromEntries(SECOES.map((s) => [s.id, s]));
const IDS = SECOES.map((s) => s.id);

/** As seções ativas deste portal. Sem escolha, vale o padrão. */
export function secoesDoPortal(portal) {
  const salvas = Array.isArray(portal?.secoes) ? portal.secoes : null;
  if (!salvas) return SECOES.filter((s) => s.padrao).map((s) => s.id);
  return IDS.filter((id) => salvas.includes(id));
}

/** Limpa o que veio da tela: só ids conhecidos, na ordem canônica. */
export function normalizarSecoes(entrada) {
  if (!Array.isArray(entrada)) return null;
  return IDS.filter((id) => entrada.includes(id));
}

/**
 * A mensagem de abertura, quando a obra não escreveu a dela.
 *
 * ⚠ É um PONTO DE PARTIDA, não um texto pronto para todos. Vitor pediu "uma mensagem
 * forte de agradecimento e parceria" — e mensagem forte é a que fala daquela obra. O
 * padrão existe para o portal nunca abrir vazio, e a tela convida a reescrever.
 */
export function mensagemPadrao({ cliente } = {}) {
  // ⚠ O NOME DO CLIENTE É VARIÁVEL, NUNCA LITERAL. Vitor (22/08/2026), colando o texto com
  // "TMSA" na frente: "essa será sempre a mensagem, vamos deixar padrão, preciso só que
  // entenda que no caso onde está escrito TMSA será sempre o nome do cliente da OP". O que
  // ele escreveu é o MOLDE, não o texto de uma obra: o "TMSA" dali é o `cliente` DESTA OP —
  // no portal da DANPOWER tem que ler DANPOWER. Fora o vocativo, é a palavra dele, inteira.
  //
  // A versão anterior (agradecer a confiança + parágrafo da ISO 9001) foi cortada por ele.
  // Não reescrever "melhorando": mensagem de agradecimento ao cliente é decisão do dono da
  // relação comercial, não do código. Mudou o texto? Ele diz, e este é o único lugar a mudar.
  const quem = cliente ? `${cliente}, obrigado` : "Obrigado";
  return `${quem} por fazer parte da história da Torg Metal.

Este portal existe para que você acompanhe isso de perto, com transparência. O que está aqui é o mesmo que a nossa equipe usa no dia a dia — atualizado enquanto a obra anda.`;
}

/** Rótulo curto do estado, para a tela interna. */
export function situacao(portal) {
  if (!portal) return { rotulo: "Não criado", cor: "text-torg-gray" };
  if (portal.status !== "PUBLICADO") return { rotulo: "Rascunho", cor: "text-amber-700" };
  if (!portal.acessos) return { rotulo: "Publicado — ainda não acessado", cor: "text-torg-blue" };
  return { rotulo: `Publicado — ${portal.acessos} acesso(s)`, cor: "text-emerald-700" };
}

// ─── VALIDADE DO LINK ──────────────────────────────────────────────────────────
//
// Vitor (03/09/2026), sobre os links públicos: "o quanto estamos vulneráveis?" — e, depois: "ok,
// vamos mudar isso".
//
// ⚠⚠ O TOKEN NÃO ERA O PROBLEMA; A ETERNIDADE ERA. Adivinhar o link é inviável (randomBytes 32 =
// 256 bits), mas ele valia para sempre: quem saísse da empresa do cliente seguia com a obra
// inteira na mão, e um link vazado uma vez ficava vazado para sempre.
//
// ⚠ 180 DIAS, contados da PUBLICAÇÃO. É o tamanho de uma obra da casa com folga para o Data Book
// depois da entrega — 90 dias morreriam no meio de quase toda obra (a 097 produz desde julho; a
// 105 entrega em 04/11) e 365 não fecharia risco nenhum. Renovar é um clique, e é aí que alguém
// olha a lista de quem ainda deve ter acesso.
//
// ⚠ SEM CAMPO NOVO NO BANCO: a validade é derivada de `publicadoEm`. Renovar reescreve essa data;
// trocar o link gera outro token e derruba o antigo na hora — essa é a revogação de verdade,
// para quando alguém sai e não dá para esperar o prazo.
export const VALIDADE_PORTAL_DIAS = 180;

export function expiraEmPortal(portal) {
  if (!portal?.publicadoEm) return null;
  const d = new Date(portal.publicadoEm);
  d.setDate(d.getDate() + VALIDADE_PORTAL_DIAS);
  return d;
}

export function portalExpirado(portal) {
  const fim = expiraEmPortal(portal);
  // ⚠ portal sem `publicadoEm` NÃO conta como expirado: é rascunho, e quem barra rascunho é o
  // `status`. Tratar como expirado esconderia o motivo real atrás da mensagem errada.
  return !!fim && fim.getTime() < Date.now();
}

/** dias que faltam (negativo se já venceu); null quando não há data de publicação */
export function diasParaExpirar(portal) {
  const fim = expiraEmPortal(portal);
  if (!fim) return null;
  return Math.ceil((fim.getTime() - Date.now()) / 86400000);
}
