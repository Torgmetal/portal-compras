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

export const SECOES = [
  {
    id: "CRONOGRAMA", nome: "Cronograma da obra", padrao: true,
    resumo: "As frentes e o avanço de cada fase, como o Planejamento acompanha.",
  },
  {
    id: "RELATORIOS", nome: "Relatórios de inspeção", padrao: true,
    resumo: "Dimensional, solda, ultrassom, pintura e líquido penetrante — só os aprovados.",
  },
  {
    id: "CERTIFICADOS", nome: "Certificados de qualidade", padrao: true,
    resumo: "Matéria-prima com número de corrida, fixadores, consumíveis e tintas.",
  },
  {
    id: "DATABOOK", nome: "Data Book", padrao: true,
    resumo: "O dossiê da obra, em volumes, quando emitido.",
  },
  {
    id: "LPC", nome: "Lista de peças (LPC)", padrao: false,
    resumo: "Conjuntos e peças da Engenharia, com peso.",
  },
  {
    id: "LE", nome: "Lista de expedição (LE)", padrao: false,
    resumo: "O que foi embarcado e o que falta.",
  },
  {
    id: "COMPRAS", nome: "Materiais da obra", padrao: false,
    resumo: "O andamento das compras: solicitado, pedido, recebido.",
  },
  {
    id: "DOCUMENTOS", nome: "Documentos", padrao: true,
    resumo: "PIT, PLP, ARTs e o que mais a obra tiver de documento formal.",
  },
  {
    id: "FOTOS", nome: "Registro fotográfico", padrao: true,
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
export function mensagemPadrao({ cliente, obra } = {}) {
  // ⚠ A CONFIANÇA É NA TORG, NÃO NA OBRA. Vitor (22/08/2026): "aqui está confuso: você fala
  // obrigado para o cliente e fala o nome da obra — tem que ser o nome do Cliente e obrigado
  // pela confiança na Torg". A primeira versão saía "Obrigado à TMSA pela confiança no TERMASA",
  // que lido em voz alta não quer dizer nada: agradece ao cliente pela confiança no trabalho
  // dele mesmo. Quem confia é o cliente; em quem se confia é a Torg; a obra é o objeto.
  const quem = cliente ? ` à ${cliente}` : "";
  const aObra = obra ? `Fabricar a estrutura do ${obra} é uma responsabilidade que assumimos por inteiro. ` : "";
  return `Obrigado${quem} pela confiança na Torg Metal.

${aObra}Cada peça que sai da nossa fábrica carrega a mesma exigência: material com certificado e corrida rastreada, solda executada por soldador qualificado, dimensional conferido contra o projeto e pintura medida no padrão que o plano da obra determina. Nada disso é opcional aqui — é o que a nossa certificação ISO 9001 nos obriga a fazer, e é o que faz a estrutura chegar ao canteiro pronta para montar.

Este portal existe para que você acompanhe isso de perto, sem precisar pedir. O que está aqui é o mesmo que a nossa equipe usa no dia a dia — atualizado enquanto a obra anda.`;
}

/** Rótulo curto do estado, para a tela interna. */
export function situacao(portal) {
  if (!portal) return { rotulo: "Não criado", cor: "text-torg-gray" };
  if (portal.status !== "PUBLICADO") return { rotulo: "Rascunho", cor: "text-amber-700" };
  if (!portal.acessos) return { rotulo: "Publicado — ainda não acessado", cor: "text-torg-blue" };
  return { rotulo: `Publicado — ${portal.acessos} acesso(s)`, cor: "text-emerald-700" };
}
