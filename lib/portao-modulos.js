// ─── O PORTÃO POR MÓDULO ─────────────────────────────────────────────────────
//
// A tabela que o `middleware.js` consulta para decidir se alguém pode abrir uma rota. Ela mora
// aqui, fora do middleware, por um motivo medido: em 23/09/2026 descobrimos que `/fiscal` **nunca
// tinha sido cadastrado**. O seletor de módulos oferecia o card, a sidebar mostrava os links, duas
// telas funcionavam — e a terceira caía numa exceção de Server Component que virava *"Algo deu
// errado. Tente novamente"*, numa tela em que tentar de novo nunca ia funcionar.
//
// ⚠⚠ A FALHA FOI POR OMISSÃO, E OMISSÃO NÃO APARECE EM REVISÃO DE DIFF. Enquanto a função vivia
// dentro do `middleware.js` ela não tinha como ser testada — o Next reserva os exports daquele
// arquivo. Fora dele, a tabela é dado conferível: `testes/portao-modulos.teste.js` cobre cada
// módulo do seletor, e uma rota nova sem portão passa a ser um teste vermelho, não um chamado.
//
// ⚠ Este arquivo roda no EDGE. Nada de import de Node, de Prisma ou de `server-only` aqui dentro.
//
// Gates por módulo — cada rota só é acessível pelo módulo correspondente (ou ADMIN):
//   /comercial  → aberto a quem está logado (as sub-áreas em COMERCIAL_RESTRITO pedem COMERCIAL)
//   /compras    → COMPRAS
//   /financeiro → FINANCEIRO
//   /fiscal     → FISCAL ou FINANCEIRO
//   /expedicao  → EXPEDICAO
//   /producao   → PRODUCAO
//   /rm         → ENGENHARIA
//   /admin      → apenas ADMIN
// /fornecedores fica aberto (acesso por token único)
//
// Sub-áreas do Comercial que continuam SÓ do Comercial. O resto de /comercial — a lista de OPs e
// o detalhe da OP — é aberto a todo mundo logado, que é o que o seletor de módulos já anunciava
// ("OPs · aberto a todos os setores"). O portão nunca foi atualizado junto, então o link aparecia
// pra todos e derrubava quem clicasse. As ABAS é que limitam o que cada um vê lá dentro
// (lib/op-abas.js).

const COMERCIAL_RESTRITO = ["nova", "orcamentos", "aprovacoes", "kickoffs", "apresentacoes", "indicadores", "clientes"];

/**
 * Falta módulo pra esta rota? Devolve o nome do que falta, ou null se pode passar.
 */
export function moduloNegado(path, token) {
  const isAdmin = token?.tipo === "ADMIN";
  // ⚠ o /admin vem ANTES do atalho de ADMIN — é o único gate por TIPO, não por módulo, e
  // esquecê-lo aqui abriria a administração pra qualquer pessoa logada.
  if (path.startsWith("/admin") && !isAdmin) return "ADMIN";
  // A tela de versão/atualizações é de controle interno — só ADMIN. Precisa vir ANTES do
  // atalho de ADMIN abaixo, pelo mesmo motivo do /admin: é gate por TIPO, não por módulo.
  if (path.startsWith("/versao") && !isAdmin) return "ADMIN";
  if (isAdmin) return null;
  const modulos = token?.modulos ?? [];
  const tem = (...req) => req.some((m) => modulos.includes(m));
  const nega = (...req) => (tem(...req) ? null : req[0]);

  if (path.startsWith("/comercial")) {
    const sub = path.split("/")[2] || "";
    if (COMERCIAL_RESTRITO.includes(sub)) return nega("COMERCIAL");
    return null; // lista de OPs e detalhe da OP
  }
  if (path.startsWith("/engenharia")) return nega("ENGENHARIA");
  // Recebimento (CMR): quem LANÇA os recebimentos é o Almoxarifado. Ele acessa essa tela do
  // Compras sem ter o módulo COMPRAS inteiro (a Sidebar de Compras filtra o resto pra ele).
  if (path.startsWith("/compras/recebimento-cmr")) return nega("COMPRAS", "ALMOXARIFADO");
  // Painel de OPs: o Almoxarifado acompanha o que foi comprado para cada obra — o que já virou
  // pedido, o que está a caminho e quanto. Matheus (17/09/2026): "libere o painel de OPs para o
  // almoxarifado@torg.com.br, ele precisa ver somente a tela de compras de cada OP."
  //
  // ⚠⚠ ISTO É SÓ O PORTÃO DA ROTA. A tela mostra MUITO mais do que "compras da OP" — verba da obra,
  // saldo, mapa de cotação com o preço de cada concorrente e os botões de finalizar/excluir. Quem
  // decide o que cada público vê é a própria página (`ehCompras`), e é lá que os dados deixam de
  // ser calculados e serializados. Passar por aqui não é permissão para ver tudo.
  //
  // ⚠ Qualquer página nova sob `/compras/painel-ops/` herda este portão pelo `startsWith` e
  // precisa declarar o próprio `requireRole` — não confie neste `if` para protegê-la.
  if (path.startsWith("/compras/painel-ops")) return nega("COMPRAS", "ALMOXARIFADO");
  // Prazos das RMs: o Almoxarifado precisa saber QUANDO o material chega para organizar o
  // recebimento. Matheus (24/09/2026): "libere para o almoxarifado@torg.com.br o acesso a aba
  // Prazos das RMs para ele conseguir ver quando chega os materiais."
  //
  // ⚠⚠ DE NOVO: ISTO É SÓ O PORTÃO DA ROTA, E AQUI ELE PROTEGE MENOS QUE O NORMAL. A tela também
  // SINCRONIZA com o Omie, COBRA fornecedor por e-mail e APROVA a data que o fornecedor propôs —
  // três atos para fora da empresa, nenhum deles "ver". As rotas dessas três continuam exigindo
  // COMPRAS, e a tela esconde os botões (`usar-pode-agir.js`): passar por aqui dá a LISTA, não a
  // caneta.
  if (path.startsWith("/compras/prazos")) return nega("COMPRAS", "ALMOXARIFADO");
  if (path.startsWith("/compras")) return nega("COMPRAS");
  // Módulo Indicadores (visão gerencial consolidada) é só do ADMIN. Cada setor continua
  // vendo os SEUS indicadores pela aba "Indicadores" dentro do próprio módulo.
  if (path.startsWith("/indicadores")) return "ADMIN";
  // ⚠ MES próprio em construção (ver docs/mes-proprio.md). Fica FORA de todo menu e só o ADMIN
  // entra — é obra em andamento que vai conviver com o Syneco até virar a chave, e ninguém do
  // chão de fábrica pode cair aqui por engano achando que é o apontamento de verdade.
  if (path.startsWith("/mes-lab")) return "ADMIN";
  if (path.startsWith("/financeiro")) return nega("FINANCEIRO");
  // ⚠⚠ O MÓDULO FISCAL NUNCA ESTEVE NESTA TABELA, e foi por isso que a Eduarda viu "Algo deu
  // errado" (23/09/2026). O seletor de módulos (`lib/modulos-portal.js`) abre o card Fiscal para
  // FISCAL **ou** FINANCEIRO, as telas de Romaneios e Remessa Terceiro aceitam os dois — e a
  // Inteligência Fiscal exigia só FISCAL. Sem portão aqui, a recusa vinha do `requireAcesso`
  // dentro do Server Component, virava exceção e caía no `app/error.js`: *"Algo deu errado. Tente
  // novamente"*, numa tela em que tentar de novo nunca ia funcionar.
  //
  // ⚠ Com o portão, quem não tem o módulo cai em `/sem-acesso`, que DIZ qual módulo falta. A tela
  // já existia — faltava o Fiscal ser cadastrado.
  //
  // ⚠ Isto NÃO alcança `/api/fiscal/...` (o caminho começa com `/api/`): cada rota continua com o
  // seu próprio `requireAcesso`, e é lá que a permissão de escrita é decidida.
  if (path.startsWith("/fiscal")) return nega("FISCAL", "FINANCEIRO");
  if (path.startsWith("/expedicao")) return nega("EXPEDICAO");
  // Consulta de estoque: além da Produção, a Engenharia também acessa (responde às consultas).
  if (path.startsWith("/producao/consulta-estoque")) return nega("PRODUCAO", "ENGENHARIA");
  if (path.startsWith("/producao")) return nega("PRODUCAO");
  if (path.startsWith("/rh")) return nega("RH");
  // Board de tarefas do Planejamento é compartilhado: QUALQUER setor logado vê e responde as
  // tarefas do seu setor (a lista filtra por setor).
  if (path.startsWith("/planejamento/tarefas")) return null;
  if (path.startsWith("/planejamento/recebimento")) return nega("PLANEJAMENTO", "PCP");
  if (path.startsWith("/planejamento")) return nega("PLANEJAMENTO", "PRODUCAO");
  if (path.startsWith("/pcp")) return nega("PCP", "PLANEJAMENTO", "PRODUCAO");
  // ⚠ Inspeções: o INSPETOR preenche o relatório no computador também (Vitor, 04/09/2026: "ela
  // precisa ter a tela do computador também para preencher"). Só esta parte da Qualidade — data
  // book, controle de documentos, auditorias, calibração e CMR continuam do módulo inteiro.
  if (path.startsWith("/qualidade/inspecoes")) return nega("QUALIDADE", "QUALIDADE_CAMPO");
  if (path.startsWith("/qualidade")) return nega("QUALIDADE");
  if (path.startsWith("/relatorios")) return nega("COMERCIAL", "PRODUCAO", "ENGENHARIA", "PCP", "QUALIDADE");
  // /rm aberto para todos os modulos (historico visivel para todos)
  return null;
}
