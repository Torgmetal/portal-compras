import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Gates por módulo — cada rota só é acessível pelo módulo correspondente (ou ADMIN):
//   /comercial  → aberto a quem está logado (as sub-áreas em COMERCIAL_RESTRITO pedem COMERCIAL)
//   /compras    → COMPRAS
//   /financeiro → FINANCEIRO
//   /expedicao  → EXPEDICAO
//   /producao   → PRODUCAO
//   /rm         → ENGENHARIA
//   /admin      → apenas ADMIN
// /fornecedores fica aberto (acesso por token único)
// Redirect de domínios .vercel.app → workspace.torg.com.br via vercel.json (edge, mais rápido)
// Sub-áreas do Comercial que continuam SÓ do Comercial. O resto de /comercial — a lista de OPs e
// o detalhe da OP — é aberto a todo mundo logado, que é o que o seletor de módulos já anunciava
// ("OPs · aberto a todos os setores"). O portão nunca foi atualizado junto, então o link aparecia
// pra todos e derrubava quem clicasse. As ABAS é que limitam o que cada um vê lá dentro
// (lib/op-abas.js).
const COMERCIAL_RESTRITO = ["nova", "orcamentos", "aprovacoes", "kickoffs", "apresentacoes", "indicadores"];

/**
 * Falta módulo pra esta rota? Devolve o nome do que falta, ou null se pode passar.
 */
function moduloNegado(path, token) {
  const isAdmin = token?.tipo === "ADMIN";
  // ⚠ o /admin vem ANTES do atalho de ADMIN — é o único gate por TIPO, não por módulo, e
  // esquecê-lo aqui abriria a administração pra qualquer pessoa logada.
  if (path.startsWith("/admin") && !isAdmin) return "ADMIN";
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
  if (path.startsWith("/compras")) return nega("COMPRAS");
  // Módulo Indicadores (visão gerencial consolidada) é só do ADMIN. Cada setor continua
  // vendo os SEUS indicadores pela aba "Indicadores" dentro do próprio módulo.
  if (path.startsWith("/indicadores")) return "ADMIN";
  if (path.startsWith("/financeiro")) return nega("FINANCEIRO");
  if (path.startsWith("/expedicao")) return nega("EXPEDICAO");
  // Consulta de estoque: além da Produção, a Engenharia também acessa (responde às consultas).
  if (path.startsWith("/producao/consulta-estoque")) return nega("PRODUCAO", "ENGENHARIA");
  if (path.startsWith("/producao")) return nega("PRODUCAO");
  if (path.startsWith("/rh")) return nega("RH");
  // Board de tarefas do Planejamento é compartilhado: QUALQUER setor logado vê e responde as
  // tarefas do seu setor (a lista filtra por setor).
  if (path.startsWith("/planejamento/tarefas")) return null;
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

export default withAuth(
  function middleware(req) {
    const token = req.nextauth?.token;
    const path = req.nextUrl.pathname;

    // Área do colaborador (/meu-rh): login próprio em /colaborador (não /entrar).
    if (path.startsWith("/meu-rh") || path.startsWith("/api/meu-rh")) {
      if (!token) {
        if (path.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        return NextResponse.redirect(new URL("/colaborador", req.url));
      }
      if (token.tipo !== "FUNCIONARIO") {
        // Usuário interno não usa o portal do colaborador.
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
    // Portal Qualidade Fábrica (/campo): login próprio em /campo/entrar, não /entrar.
    // Vitor (21/08/2026) pediu porta separada — o inspetor externo não passa pelo portal interno.
    if ((path.startsWith("/campo") && path !== "/campo/entrar") || path.startsWith("/api/campo")) {
      if (!token) {
        if (path.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        return NextResponse.redirect(new URL("/campo/entrar", req.url));
      }
    }
    // Funcionário (autoatendimento) não acessa o portal interno — vai pro portal dele, não pro
    // login (ele ESTÁ logado; mandar pro /entrar é o mesmo engano de sempre).
    // ⚠ O COMUNICADO EM VÍDEO VALE PARA ELE TAMBÉM. Vitor (30/08/2026): "os demais da produção será
    // disponibilizado no portal para eles assistirem". O modal vive no layout raiz, que envolve o
    // /meu-rh — mas a chamada dele batia neste portão e voltava 403, então o vídeo simplesmente não
    // aparecia para quem mais precisa dele. Liberada só esta rota, que é de leitura do próprio
    // comunicado e registro da própria ciência; o resto de /api/rh continua fechado.
    const COMUNICADO = "/api/mural/pendente";
    // ⚠⚠ /colaborador É O PORTAL DELE — NÃO PODE SER BOUNCEADO. A canônica hoje é /colaborador
    // (o /meu-rh só redireciona pra cá). Se este portão empurrar o funcionário de /colaborador para
    // /meu-rh, o /meu-rh redireciona de volta pra /colaborador → LOOP de 307, e o App Router
    // seguindo essa cadeia no cliente quebra com "null ... parallelRoutes.get" (tela branca "após
    // logar"). Então: /colaborador e /meu-rh ficam LIBERADOS, e o desvio dos internos aponta para a
    // canônica /colaborador (não /meu-rh, que só bounceia de novo).
    if (
      token?.tipo === "FUNCIONARIO" &&
      !path.startsWith("/colaborador") &&
      !path.startsWith("/meu-rh") &&
      !path.startsWith("/api/meu-rh") &&
      path !== COMUNICADO
    ) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
      return NextResponse.redirect(new URL("/colaborador", req.url));
    }

    // ⚠⚠ CLIENTE NÃO ENTRA NO PORTAL. Vitor (28/08/2026): o acesso do cliente existe para ASSINAR
    // documento logado — o portal da obra dele segue aberto por token, sem login. Uma conta de fora
    // com sessão ativa não pode passear pelo ERP: aqui ela só circula nas páginas de token
    // (assinatura, portal da obra, data book) e nas de senha.
    if (token?.tipo === "CLIENTE") {
      const liberado = ["/cliente", "/api/cliente", "/assinar", "/api/assinar", "/portal", "/api/portal", "/data-book", "/api/qualidade/data-books/assinar", "/api/qualidade/data-books/aceite", "/trocar-senha", "/api/trocar-senha", "/esqueci-senha", "/api/esqueci-senha", "/entrar", "/sem-acesso"]
        .some((r) => path === r || path.startsWith(`${r}/`));
      if (!liberado) {
        if (path.startsWith("/api/")) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
        // ⚠ vai para a ÁREA DELE, não para "sem acesso": ele acabou de entrar porque o portal pediu.
        // Mandar quem logou para uma tela de negativa é o mesmo engano do /entrar com sessão viva.
        return NextResponse.redirect(new URL("/cliente", req.url));
      }
    }

    // ⚠⚠ SENHA DE CADASTRO NÃO ENTRA NO PORTAL. Vitor (29/08/2026): "as contas que estiverem com
    // as senhas iniciais vamos alterar". A flag `deveTrocarSenha` já existia, mas SÓ o portal do
    // colaborador a respeitava — no portal interno ela não fazia nada, e a conta com a senha de
    // cadastro ("Primeiro@2026!") seguia trabalhando normalmente. O login liga a flag quando a
    // senha digitada é a de cadastro (lib/login-tentativas.js); aqui é onde ela vira porta fechada.
    //
    // ⚠ O colaborador tem a página dele e já é tratado acima — este desvio é para os internos.
    if (token?.deveTrocarSenha && token.tipo !== "FUNCIONARIO") {
      const liberado = ["/trocar-senha", "/api/trocar-senha", "/esqueci-senha", "/api/esqueci-senha", "/api/auth", "/sem-acesso"]
        .some((r) => path === r || path.startsWith(`${r}/`));
      if (!liberado) {
        if (path.startsWith("/api/")) return NextResponse.json({ error: "Troque a senha inicial para continuar." }, { status: 403 });
        const url = new URL("/trocar-senha", req.url);
        url.searchParams.set("inicial", "1");
        return NextResponse.redirect(url);
      }
    }

    // Falta de módulo: 403 na API, página explicativa no navegador. NUNCA o login.
    const falta = token ? moduloNegado(path, token) : null;
    if (falta) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "Sem acesso a este módulo" }, { status: 403 });
      const url = new URL("/sem-acesso", req.url);
      url.searchParams.set("de", path);
      url.searchParams.set("modulo", falta);
      return NextResponse.redirect(url);
    }

    // Retorno explícito necessário para que o Vercel sirva corretamente
    // tanto páginas dinâmicas (ƒ) quanto estáticas (○) após autorização.
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ token, req }) {
        const path = req.nextUrl.pathname;
        // Rotas públicas — sem auth
        if (
          path === "/" ||
          path.startsWith("/fornecedores") ||
          path.startsWith("/api/auth") ||
          path.startsWith("/_next") ||
          path === "/entrar" ||
          path.startsWith("/colaborador") ||
          path === "/campo/entrar" ||
          path === "/sem-acesso" ||
          path === "/trocar-senha" ||
          path === "/api/trocar-senha" ||
          path === "/esqueci-senha" ||
          path === "/api/esqueci-senha" ||
          // Endpoints que o portal do fornecedor consome (sem login)
          path === "/api/parse-pdf-cotacao" ||
          path === "/api/parse-cotacao-ai" ||
          path.startsWith("/api/cotacao/submeter/") ||
          path.startsWith("/api/cotacao/anexar/") ||
          path.startsWith("/api/fornecedores/entrega/") ||
          path.startsWith("/api/frete-cotacao/") ||
          path.startsWith("/api/estudo-cotacao/") ||
          // Sync MES — autenticado por Bearer API key própria (não NextAuth)
          path.startsWith("/api/mes/") ||
          // Sync LPC SharePoint — auth própria no handler. ⚠ o bearer do MES só CONSULTA ali:
          // importar apaga e recria 15.066 peças e exige sessão ADMIN/PRODUÇÃO + ?obra=.
          path.startsWith("/api/producao/pecas/sync-lpc-sharepoint") ||
          // Crons da Vercel — chegam SEM sessão NextAuth; cada rota valida o
          // CRON_SECRET no handler. Sem isto o middleware redirecionava o cron
          // pro /entrar e NENHUM cron rodava (ex.: conciliação de recebimento).
          path.startsWith("/api/cron/") ||
          path.startsWith("/api/producao/sync-sharepoint") ||
          // Resposta de cobranca de cronograma — publico via token
          path.startsWith("/planejamento/cronogramas/resposta/") ||
          path.startsWith("/api/planejamento/cronogramas/cobranca/") ||
          // Aceite do Kick Off pelos setores — publico via token unico
          path.startsWith("/kickoff/aceite/") ||
          path.startsWith("/api/kickoff/aceite/") ||
          // Ata de reunião da OP — cliente vê e aceita, publico via token
          path.startsWith("/ata-op/") ||
          path.startsWith("/api/ata-op/") ||
          // Aceite do Data Book pelo cliente — publico via token unico
          path.startsWith("/data-book/aceite/") ||
          path.startsWith("/api/qualidade/data-books/aceite/") ||
          // Cadeia de assinaturas do Data Book (elaborador→inspetor→RT→cliente) — publico via token
          path.startsWith("/data-book/assinar/") ||
          path.startsWith("/api/qualidade/data-books/assinar/") ||
          // Portal do cliente (auditorias externas) — publico via token unico
          path.startsWith("/portal-cliente/") ||
          path.startsWith("/api/qualidade/auditorias/portal/") ||
          // Portal da OBRA (o mural do cliente: LPC, LE, compras, cronograma, certificados,
          // relatorios, data book) — publico via token unico.
          // ⚠ "/portal/" com a barra: "/portal-cliente/" acima e OUTRA coisa (auditoria) e
          // continua com a regra dele. Sem esta entrada o link cai no /entrar e o cliente,
          // que nao tem login nenhum, nunca ve o portal.
          path.startsWith("/portal/") ||
          path.startsWith("/api/portal/") ||
          // Resposta do cliente a tarefas do Planejamento — publico via token unico
          path.startsWith("/cliente/tarefa/") ||
          path.startsWith("/api/cliente/tarefa/") ||
          // Resposta do SETOR a tarefas do Planejamento — publico via token unico
          path.startsWith("/tarefa/resposta/") ||
          path.startsWith("/api/tarefa/resposta/") ||
          // Resposta do SETOR a cobranca de marcos de producao — publico via token
          path.startsWith("/cobranca-marcos/") ||
          path.startsWith("/api/cobranca-marcos/") ||
          // Ata de reuniao — envolvido confirma recebimento e preenche via token
          path.startsWith("/ata/") ||
          path.startsWith("/api/ata/") ||
          // Apresentacao ao cliente (Compras) — pagina publica via token unico
          path.startsWith("/apresentacao/") ||
          path.startsWith("/api/apresentacao/") ||
          // Aceite do Relatorio de Status pelo cliente — publico via token unico
          path.startsWith("/relatorio/aceite/") ||
          path.startsWith("/api/relatorio/aceite/") ||
          // Aceite da Proposta de Servico pelo cliente — publico via token unico
          path.startsWith("/proposta/aceite/") ||
          path.startsWith("/api/proposta/aceite/") ||
          // Consulta externa aos PDFs do SGQ (Qualidade) — publico via token unico
          path.startsWith("/sgq/") ||
          path.startsWith("/api/sgq-publico/") ||
          // Assinatura eletronica de documento (Treinamentos / Auditoria) — publico via token
          path.startsWith("/assinar/") ||
          path.startsWith("/api/assinar/") ||
          // ⚠ Consulta de tintas na fase de ORÇAMENTO — portal proprio do fabricante, separado do
          // /fornecedores (que responde RM do Compras). Vitor (31/08/2026): "precisa ser um portal
          // totalmente separado do de compras". Publico via token unico por fabricante: cada um ve
          // e responde so a sua linha, que e o que permite existir mapa de cotacoes sem a
          // concorrencia ficar publica.
          path.startsWith("/consulta-tinta/") ||
          path.startsWith("/api/consulta-tinta/")
        ) {
          return true;
        }
        // /meu-rh (+ API) é tratado na função do middleware acima (login próprio
        // em /colaborador; isolamento por tipo). Deixa passar aqui.
        if (path.startsWith("/meu-rh") || path.startsWith("/api/meu-rh")) return true;

        // ⚠ /campo idem: quem manda pro login é a função acima, que aponta pra /campo/entrar.
        // Devolver false aqui faria o NextAuth redirecionar pro /entrar do portal interno — e o
        // inspetor externo cairia numa tela que não é dele. O acesso em si é conferido na página
        // e em cada rota da API (PERFIS_CAMPO).
        if (path.startsWith("/campo") || path.startsWith("/api/campo")) return true;

        // Demais rotas: precisa estar LOGADO. Só isso.
        //
        // ⚠ Falta de MÓDULO não se responde aqui. Devolver false manda a pessoa pro /entrar, e
        // quem está logado lê isso como "o sistema me deslogou" — foi exatamente a queixa da
        // Pamela e da Eduarda (21/08/2026). Quem confere módulo é `moduloNegado`, dentro do
        // middleware, que manda pro /sem-acesso dizendo o que falta.
        return !!token;
      },
    },
    pages: {
      signIn: "/entrar",
    },
  }
);

export const config = {
  matcher: [
    // ⚠ `laco-setembro` entra pelo mesmo motivo: o laço aparece na TELA DE LOGIN e nas telas do
    // cliente, onde não há sessão — sem a exceção o middleware manda o PNG para o /entrar (307) e
    // a campanha fica com um ícone de imagem quebrada.
    // ⚠ `equipe` entra aqui pelo mesmo motivo de `obras` e `estrutura-3d`: são ARQUIVOS de /public.
    // Sem a exceção, o middleware manda a foto para o /entrar (307) e o portal do cliente — que é
    // público — mostra as iniciais no lugar do rosto, sem erro nenhum na tela.
    // ⚠ `wasm` é o motor do visualizador de modelo 3D (web-ifc). Ele é buscado pelo NAVEGADOR, e no
    // portal do cliente não há sessão nenhuma — sem a exceção o middleware devolve o HTML do
    // /entrar no lugar do binário e o visualizador morre com "both async and sync fetching of the
    // wasm failed", que não diz a ninguém que o problema é de rota.
    "/((?!_next/static|_next/image|favicon.ico|obras|torg-logo.*|estrutura-3d|equipe|laco-setembro|wasm).*)",
  ],
};
