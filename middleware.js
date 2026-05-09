import { withAuth } from "next-auth/middleware";

// Protege /compras, /comercial, /rm (exceto /rm/[id]/cotar via token futuro)
// /fornecedores fica aberto (acesso por token único depois)
export default withAuth(
  function middleware(req) {
    // espaço pra checagens de role específicas se necessário
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

        // Role gates
        if (path.startsWith("/comercial") && !["ADMIN", "COMERCIAL"].includes(token.role)) {
          return false;
        }
        if (path.startsWith("/compras") && !["ADMIN", "COMPRAS"].includes(token.role)) {
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
