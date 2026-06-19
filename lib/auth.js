// Configuração do NextAuth (credentials provider — email + senha)
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 horas
  },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { modulos: { select: { modulo: true } } },
        });

        if (!user || !user.ativo) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        // Módulo Diretoria — acesso por allowlist (dono + AcessoDiretoria). Owner
        // hardcoded aqui pra evitar ciclo de import (lib/diretoria.js → session → auth).
        const emailNorm = user.email.toLowerCase();
        const diretoria = emailNorm === "vitor@torg.com.br"
          || !!(await prisma.acessoDiretoria.findUnique({ where: { email: emailNorm } }).catch(() => null));

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tipo: user.tipo,
          modulos: user.modulos.map((m) => m.modulo), // ex: ["COMERCIAL", "COMPRAS"]
          setor: user.setor,
          podeAlterarVerba: user.podeAlterarVerba ?? false,
          diretoria,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tipo = user.tipo;
        token.modulos = user.modulos ?? [];
        token.setor = user.setor;
        token.podeAlterarVerba = user.podeAlterarVerba ?? false;
        token.diretoria = user.diretoria ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.tipo = token.tipo;
        session.user.modulos = token.modulos ?? [];
        session.user.setor = token.setor;
        session.user.podeAlterarVerba = token.podeAlterarVerba ?? false;
        session.user.diretoria = token.diretoria ?? false;
        // Compatibilidade retroativa: campo `role` derivado para código legado
        // ainda não migrado (sidebars, páginas, helpers podeVerCompras etc.)
        // Será removido na Fase 5 quando todos os consumidores usarem tipo/modulos.
        session.user.role =
          token.tipo === "ADMIN" ? "ADMIN" : (token.modulos?.[0] ?? null);
      }
      return session;
    },
  },
  pages: {
    signIn: "/entrar",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// ─── Helpers legados (usam `role` derivado — mantidos para compatibilidade) ───

/** @deprecated Use user.tipo === "ADMIN" */
export const ROLES = {
  ADMIN: "ADMIN",
  COMERCIAL: "COMERCIAL",
  ENGENHARIA: "ENGENHARIA",
  ALMOXARIFADO: "ALMOXARIFADO",
  COMPRAS: "COMPRAS",
};

/** @deprecated Use user.tipo === "ADMIN" || user.modulos.includes("COMPRAS") */
export function podeVerCompras(role) {
  return ["ADMIN", "COMPRAS"].includes(role);
}

/** @deprecated Use user.tipo === "ADMIN" || user.modulos.includes("COMERCIAL") */
export function podeVerComercial(role) {
  return ["ADMIN", "COMERCIAL"].includes(role);
}

/** @deprecated Use user.tipo === "ADMIN" || user.modulos.some(m => [...].includes(m)) */
export function podeCriarRM(role) {
  return ["ADMIN", "ENGENHARIA", "ALMOXARIFADO", "COMPRAS"].includes(role);
}
