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
    if (token?.tipo === "FUNCIONARIO" && !path.startsWith("/meu-rh") && !path.startsWith("/api/meu-rh")) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "Sem acesso" }, { status: 403 });
      return NextResponse.redirect(new URL("/meu-rh", req.url));
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
          // Sync LPC SharePoint — auth própria (Bearer MES_SYNC_API_KEY ou sessão no handler)
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
          path.startsWith("/api/assinar/")
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
    "/((?!_next/static|_next/image|favicon.ico|obras|torg-logo.*|estrutura-3d).*)",
  ],
};
