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
  { id: "COMPRAS", nome: "Compras", resumo: "O material da obra: o que foi solicitado, pedido e recebido." },
  { id: "PLANEJAMENTO", nome: "Planejamento", resumo: "O cronograma e o avanço de cada fase." },
  { id: "QUALIDADE", nome: "Qualidade", resumo: "Certificados, relatórios de inspeção, PLP e o Data Book." },
  { id: "EXPEDICAO", nome: "Expedição", resumo: "O que já embarcou e o que falta." },
];
export const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));

export const SECOES = [
  {
    id: "CRONOGRAMA", area: "PLANEJAMENTO", nome: "Cronograma da obra", padrao: true,
    resumo: "As frentes e o avanço de cada fase, como o Planejamento acompanha.",
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
  {
    id: "DOCUMENTOS", area: "ENGENHARIA", nome: "Documentos", padrao: true,
    resumo: "PIT, PLP, ARTs e o que mais a obra tiver de documento formal.",
  },
  {
    id: "FOTOS", area: "QUALIDADE", nome: "Registro fotográfico", padrao: true,
    resumo: "A obra em imagens — fabricação, pintura, expedição.",
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
