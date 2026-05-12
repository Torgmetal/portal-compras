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
        });

        if (!user || !user.ativo) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          setor: user.setor,
          podeAlterarVerba: user.podeAlterarVerba ?? false,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.setor = user.setor;
        token.podeAlterarVerba = user.podeAlterarVerba ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.setor = token.setor;
        session.user.podeAlterarVerba = token.podeAlterarVerba ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/entrar",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Helper p/ Server Components / Route Handlers
export const ROLES = {
  ADMIN: "ADMIN",
  COMERCIAL: "COMERCIAL",
  ENGENHARIA: "ENGENHARIA",
  ALMOXARIFADO: "ALMOXARIFADO",
  COMPRAS: "COMPRAS",
};

export function podeVerCompras(role) {
  return ["ADMIN", "COMPRAS"].includes(role);
}

export function podeVerComercial(role) {
  return ["ADMIN", "COMERCIAL"].includes(role);
}

export function podeCriarRM(role) {
  return ["ADMIN", "ENGENHARIA", "ALMOXARIFADO", "COMPRAS"].includes(role);
}
