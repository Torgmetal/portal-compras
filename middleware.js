import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Gates por módulo — cada rota só é acessível pelo módulo correspondente (ou ADMIN):
//   /comercial  → COMERCIAL
//   /compras    → COMPRAS
//   /financeiro → FINANCEIRO
//   /expedicao  → EXPEDICAO
//   /producao   → PRODUCAO
//   /rm         → ENGENHARIA
//   /admin      → apenas ADMIN
// /fornecedores fica aberto (acesso por token único)
// Redirect de domínios .vercel.app → workspace.torg.com.br via vercel.json (edge, mais rápido)
export default withAuth(
  function middleware(req) {
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
          path.startsWith("/api/mes/")
        ) {
          return true;
        }
        // Demais rotas: precisa estar logado
        if (!token) return false;

        // Gates por tipo/módulo
        const isAdmin = token.tipo === "ADMIN";
        const modulos = token.modulos ?? [];

        // Helper: bloqueia se não for admin e não tiver nenhum dos módulos exigidos
        const temModulo = (...requeridos) =>
          isAdmin || requeridos.some(m => modulos.includes(m));

        if (path.startsWith("/comercial")  && !temModulo("COMERCIAL"))  return false;
        if (path.startsWith("/compras")    && !temModulo("COMPRAS"))     return false;
        if (path.startsWith("/indicadores") && !temModulo("COMPRAS"))    return false;
        if (path.startsWith("/financeiro") && !temModulo("FINANCEIRO"))  return false;
        if (path.startsWith("/expedicao")  && !temModulo("EXPEDICAO"))   return false;
        if (path.startsWith("/producao")   && !temModulo("PRODUCAO"))    return false;
        if (path.startsWith("/rm")         && !temModulo("ENGENHARIA", "ALMOXARIFADO"))  return false;
        if (path.startsWith("/rh")         && !temModulo("RH"))            return false;
        if (path.startsWith("/admin")      && !isAdmin)                  return false;

        return true;
      },
    },
    pages: {
      signIn: "/entrar",
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|obras|torg-logo.*).*)",
  ],
};
