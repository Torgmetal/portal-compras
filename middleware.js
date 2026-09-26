import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { moduloNegado } from "@/lib/portao-modulos";

// O portão por módulo (a tabela de rotas) mora em `lib/portao-modulos.js`, para poder ser testado.
// Redirect de domínios .vercel.app → workspace.torg.com.br via vercel.json (edge, mais rápido)
// ⚠⚠ CRONS AGENDADOS FORA DE `/api/cron/` — quatro rotas de MÓDULO que a Vercel também chama.
// Descoberto em 13/09/2026: o `vercel.json` as agenda, o middleware as mandava para o `/entrar`
// (307) e elas NUNCA rodaram. O `cmr-sincronizar` não tinha uma única linha em `CronHeartbeat`, e
// as outras três nem eram cobradas pelo monitor — morreram caladas.
//
// ⚠⚠ SÓ O `GET`, E O CAMINHO EXATO (pedido do Codex, 13/09/2026). Estas rotas não são endpoints de
// cron dedicados: o `POST` delas é o botão do módulo, e em duas (GRD e orçamento) o `POST` com o
// segredo grava SEM sessão. Liberar por `startsWith`, ou liberar todos os métodos, ampliaria quem
// pode escrever — o que aqui não é o pedido. O `GET` de cada uma valida o `CRON_SECRET` no próprio
// handler, que é o mesmo contrato de `/api/cron/`.
const CRONS_FORA_DO_PREFIXO = new Set([
  "/api/qualidade/cmr/sincronizar",
  "/api/compras/produtos-omie/sincronizar",
  "/api/engenharia/grd/sincronizar",
  "/api/comercial/orcamento/importar-sharepoint",
  "/api/comercial/estudos/importar-sharepoint",
]);

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

    // ⚠ INSPETOR DE CAMPO NO PORTAL DA QUALIDADE: manda para as Inspeções em vez de negar.
    // Ele entra aqui para preencher o relatório no computador, mas o card da home, o seletor de
    // módulos e qualquer link salvo apontam para /qualidade (controle de documentos), que é do
    // módulo inteiro — ele acertava a senha e batia no "sem acesso" logo depois.
    if (token && token.tipo !== "ADMIN" && path.startsWith("/qualidade") && !path.startsWith("/qualidade/inspecoes")
        && !path.startsWith("/api/")) {
      const mods = token.modulos ?? [];
      if (!mods.includes("QUALIDADE") && mods.includes("QUALIDADE_CAMPO")) {
        return NextResponse.redirect(new URL("/qualidade/inspecoes", req.url));
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
          (req.method === "GET" && CRONS_FORA_DO_PREFIXO.has(path)) ||
          // Resposta de cobranca de cronograma — publico via token
          path.startsWith("/planejamento/cronogramas/resposta/") ||
          path.startsWith("/api/planejamento/cronogramas/cobranca/") ||
          // Aceite do Kick Off pelos setores — publico via token unico
          path.startsWith("/kickoff/aceite/") ||
          path.startsWith("/api/kickoff/aceite/") ||
          // Aceite do Comunicado de Aditivo pelos setores — publico via token unico (16/09/2026)
          path.startsWith("/aditivo/aceite/") ||
          path.startsWith("/api/aditivo/aceite/") ||
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
