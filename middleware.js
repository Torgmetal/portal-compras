import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Protege /compras, /comercial, /rm (exceto /rm/[id]/cotar via token futuro)
// /fornecedores fica aberto (acesso por token único depois)
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
          path.startsWith("/api/cotacao/anexar/")
        ) {
          return true;
        }
        // Demais rotas: precisa estar logado
        if (!token) return false;

        // Gates por tipo/módulo
        const isAdmin = token.tipo === "ADMIN";
        const modulos = token.modulos ?? [];
        if (path.startsWith("/comercial") && !isAdmin && !modulos.includes("COMERCIAL")) {
          return false;
        }
        if (path.startsWith("/compras") && !isAdmin && !modulos.includes("COMPRAS")) {
          return false;
        }
        if (path.startsWith("/admin") && token.role !== "ADMIN") {
          return false;
        }
        if (
          path.startsWith("/expedicao") &&
          !["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ENGENHARIA"].includes(token.role)
        ) {
          return false;
        }
        if (
          path.startsWith("/producao") &&
          !["ADMIN", "PRODUCAO", "EXPEDICAO", "COMERCIAL", "ENGENHARIA"].includes(token.role)
        ) {
          return false;
        }
        // /rm liberado pra todos os logados (engenharia, almox, compras, admin)
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
